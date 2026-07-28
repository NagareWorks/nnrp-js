import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  createHostRouteTargetManifest,
  createRollbackEvidence,
  createSuccessfulClientRouteEvidence,
  validateHostRouteScenario,
} from "./host-route-conformance.ts";
import { clientLocator, providerRouteLocator, serverPolicy } from "./run-host-route-target.ts";

const clientScenario = {
  id: "wire.host-route.client.multi-route",
  host_route: {
    role: "client",
    platform: "native",
    application_endpoint: "nnrp://host-route.test",
    routes: [
      {
        transport: "tcp",
        provider_id: "nnrp.transport.tcp.native",
        locator: "suite://allocate/tcp/client-primary",
        security: { mode: "plain", credential_owner: "none" },
      },
      {
        transport: "ipc",
        provider_id: "nnrp.transport.ipc.native",
        locator: "suite://allocate/ipc/client-secondary",
        security: { mode: "plain", credential_owner: "none" },
      },
    ],
  },
};

Deno.test("host-route manifest declares an independent host-only provider surface", () => {
  const manifest = createHostRouteTargetManifest("nnrp-js-host", "0.1.0", [{
    transport: "tcp",
    provider_id: "nnrp.transport.tcp.native",
    installed: true,
    platforms: ["native"],
    security_modes: ["plain", "tls_server_auth"],
  }]);
  assertEquals(manifest.wire_conformance.transports, []);
  assertEquals(manifest.wire_conformance.capabilities, ["host.routes"]);
  assertEquals(manifest.wire_conformance.host_route_providers[0]?.provider_id, "nnrp.transport.tcp.native");
  assertThrows(() =>
    createHostRouteTargetManifest("target", "0.1.0", [
      ...manifest.wire_conformance.host_route_providers,
      { ...manifest.wire_conformance.host_route_providers[0]! },
    ])
  );
});

Deno.test("host-route scenario validation rejects repeated provider boundaries", () => {
  const scenario = validateHostRouteScenario(clientScenario);
  assertEquals(scenario.host_route.routes.map((route) => route.transport), ["tcp", "ipc"]);
  assertThrows(() =>
    validateHostRouteScenario({
      ...clientScenario,
      host_route: {
        ...clientScenario.host_route,
        routes: [clientScenario.host_route.routes[0], clientScenario.host_route.routes[0]],
      },
    })
  );
});

Deno.test("host-route evidence preserves selected carriers and atomic rollback", () => {
  const scenario = validateHostRouteScenario(clientScenario);
  const client = createSuccessfulClientRouteEvidence(scenario.host_route, "nnrp.transport.ipc.native");
  assertEquals(client.candidates.map((candidate) => candidate.selected), [false, true]);
  assertEquals(client.accepted_sessions[0]?.active_transport, "ipc");

  const rollbackScenario = validateHostRouteScenario({
    ...clientScenario,
    host_route: {
      ...clientScenario.host_route,
      role: "server",
      routes: clientScenario.host_route.routes.map((route, index) =>
        index === 1 ? { ...route, injected_failures: ["bind_failure"] } : route
      ),
    },
  });
  const rollback = createRollbackEvidence(rollbackScenario.host_route);
  assertEquals(rollback.listeners.map((listener) => listener.state), ["rolled_back", "failed"]);
  assertEquals(rollback.atomic_rollback, true);
  assertEquals(rollback.logical_set_closed, true);
});

Deno.test("host-route target adapts suite wire locators to frozen SDK route forms", () => {
  const scenario = validateHostRouteScenario(clientScenario);
  const tcp = scenario.host_route.routes[0]!;
  const ipc = scenario.host_route.routes[1]!;
  assertEquals(clientLocator(tcp, { ...tcp, locator: "tcp://127.0.0.1:4317" }), "127.0.0.1:4317");
  assertEquals(clientLocator(ipc, { ...ipc, locator: "npipe://nnrp-host-route" }), "npipe://nnrp-host-route");
  assertEquals(providerRouteLocator(tcp, { ...tcp, locator: "tcp://127.0.0.1:4318" }), "127.0.0.1:4318");
});

Deno.test("host-route target observes an injected terminal listener before healthy peers", () => {
  const scenario = validateHostRouteScenario({
    ...clientScenario,
    host_route: {
      ...clientScenario.host_route,
      role: "server",
      routes: clientScenario.host_route.routes.map((route, index) =>
        index === 0 ? { ...route, injected_failures: ["terminal_listener_failure"] } : route
      ),
    },
  });
  assertEquals(serverPolicy(scenario.host_route.routes), "prefer-tcp");
});
