import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  createHostRouteTargetManifest,
  createRollbackEvidence,
  createSuccessfulClientRouteEvidence,
  type HostRouteCaseResult,
  hostRouteTimeoutMillis,
  validateHostRouteScenario,
} from "./host-route-conformance.ts";
import {
  acceptServerSessionsSequentially,
  browserTreeTerminationCommand,
  clientLocator,
  providerForRoute,
  providerRouteLocator,
  serverPolicy,
  validateBrowserResult,
} from "./run-host-route-target.ts";

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
  const browserManifest = createHostRouteTargetManifest(
    "nnrp-js-browser-host",
    "0.1.0",
    [{
      transport: "websocket",
      provider_id: "nnrp.transport.websocket.browser-wasm",
      installed: true,
      platforms: ["browser"],
      security_modes: ["browser_host"],
    }],
    ["suite_as_server"],
  );
  assertEquals(browserManifest.wire_conformance.modes, ["suite_as_server"]);
  assertThrows(() =>
    createHostRouteTargetManifest("target", "0.1.0", browserManifest.wire_conformance.host_route_providers, [])
  );
  assertThrows(() =>
    createHostRouteTargetManifest(
      "target",
      "0.1.0",
      browserManifest.wire_conformance.host_route_providers,
      ["suite_as_server", "suite_as_server"],
    )
  );
});

Deno.test("host-route target preserves the suite timeout budget for protocol close", () => {
  const scenario = validateHostRouteScenario({
    ...clientScenario,
    steps: [{ action: "connect_each_listener", timeout_ms: 3_000 }],
  });
  assertEquals(hostRouteTimeoutMillis(scenario, 2_000), 3_000);
  assertEquals(hostRouteTimeoutMillis(validateHostRouteScenario(clientScenario), 2_000), 2_000);
});

Deno.test("host-route scenario rejects invalid timeout budgets", () => {
  assertThrows(
    () => validateHostRouteScenario({ ...clientScenario, steps: [{ action: "connect", timeout_ms: 0 }] }),
    Error,
    "positive safe integer",
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

Deno.test("host-route target preserves suite provider URIs for frozen SDK route values", () => {
  const scenario = validateHostRouteScenario(clientScenario);
  const tcp = scenario.host_route.routes[0]!;
  const ipc = scenario.host_route.routes[1]!;
  assertEquals(clientLocator(tcp, { ...tcp, locator: "tcp://127.0.0.1:4317" }), "tcp://127.0.0.1:4317");
  assertEquals(clientLocator(ipc, { ...ipc, locator: "npipe://nnrp-host-route" }), "npipe://nnrp-host-route");
  assertEquals(providerRouteLocator({ ...tcp, locator: "tcp://127.0.0.1:4318" }), "tcp://127.0.0.1:4318");
});

Deno.test("host-route target keeps uninstalled provider descriptor identity atomic", () => {
  const route = validateHostRouteScenario({
    ...clientScenario,
    host_route: {
      ...clientScenario.host_route,
      routes: [{
        transport: "quic",
        provider_id: "example.transport.quic.uninstalled",
        locator: "quic://127.0.0.1:0",
        security: { mode: "tls_server_auth", credential_owner: "suite" },
      }],
    },
  }).host_route.routes[0]!;
  const provider = providerForRoute(route);
  assertEquals(provider.metadata.id, route.provider_id);
  assertEquals(provider.descriptor.metadata.id, route.provider_id);
  assertEquals(provider.localAvailable, false);
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

Deno.test("host-route server closes each accepted session before accepting the next route", async () => {
  const events: string[] = [];
  let releaseFirstClose: () => void = () => undefined;
  let reportFirstCloseStarted: () => void = () => undefined;
  const firstCloseGate = new Promise<void>((resolvePromise) => {
    releaseFirstClose = resolvePromise;
  });
  const firstCloseStarted = new Promise<void>((resolvePromise) => {
    reportFirstCloseStarted = resolvePromise;
  });

  const result = acceptServerSessionsSequentially(
    2,
    (index) => {
      events.push(`accept-${index}`);
      return Promise.resolve(index);
    },
    async (session) => {
      events.push(`close-${session}-start`);
      if (session === 0) {
        reportFirstCloseStarted();
        await firstCloseGate;
      }
      events.push(`close-${session}-end`);
      return session === 0 ? "tcp" : "ipc";
    },
  );

  await firstCloseStarted;
  assertEquals(events, ["accept-0", "close-0-start"]);
  releaseFirstClose();
  assertEquals(await result, ["tcp", "ipc"]);
  assertEquals(events, [
    "accept-0",
    "close-0-start",
    "close-0-end",
    "accept-1",
    "close-1-start",
    "close-1-end",
  ]);
});

Deno.test("browser host-route results preserve the suite scenario identity", () => {
  const result: HostRouteCaseResult = {
    id: "wire.host-route.browser.wss",
    outcome: "passed",
    terminal: "success",
    observed_frames: [],
    message: "browser completed",
    evidence_paths: [],
  };
  assertEquals(validateBrowserResult(result, result.id), result);
  assertThrows(() => validateBrowserResult({ ...result, id: "other" }, result.id));
  assertThrows(() => validateBrowserResult({ ...result, outcome: "unknown" }, result.id));
  assertThrows(() => validateBrowserResult({ ...result, terminal: "unknown" }, result.id));
});

Deno.test("browser host-route terminates the complete Windows process tree", () => {
  assertEquals(browserTreeTerminationCommand(42), ["taskkill", "/PID", "42", "/T", "/F"]);
  assertThrows(() => browserTreeTerminationCommand(0));
  assertThrows(() => browserTreeTerminationCommand(Number.MAX_SAFE_INTEGER + 1));
});
