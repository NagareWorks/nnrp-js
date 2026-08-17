import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { resolve } from "node:path";
import {
  BROWSER_HOST_ROUTE_PROFILE,
  createHostRouteTargetManifest,
  NATIVE_HOST_ROUTE_PROFILES,
} from "./host-route-conformance.ts";
import { parseWireConformanceOptions, validatePlanCoverage } from "./wire-conformance-plan.ts";

Deno.test("wire conformance options select explicit and environment roots", () => {
  assertEquals(
    parseWireConformanceOptions(["--artifacts", "artifacts/custom"], { NNRP_CONFORMANCE_ROOT: "../suite" }),
    {
      artifactDirectory: resolve("artifacts/custom"),
      conformanceRoot: resolve("../suite"),
    },
  );
  assertEquals(
    parseWireConformanceOptions(["--conformance-root", "../explicit"], { NNRP_CONFORMANCE_ROOT: "../ignored" }),
    {
      artifactDirectory: resolve("artifacts/wire-conformance/native"),
      conformanceRoot: resolve("../explicit"),
    },
  );
});

Deno.test("wire plans cover every declared mode, transport, and capability", () => {
  const target = {
    wire_conformance: {
      modes: ["suite_as_client"],
      transports: [{ name: "tcp" }],
      capabilities: ["control.cancel_abort"],
    },
  };
  const plan = {
    scenarios: [{
      mode: "suite_as_client",
      transport: "tcp",
      required_capabilities: ["control.cancel_abort"],
    }],
  };
  validatePlanCoverage(target, plan);
  assertThrows(
    () =>
      validatePlanCoverage(
        { ...target, wire_conformance: { ...target.wire_conformance, modes: ["suite_as_proxy"] } },
        plan,
      ),
    Error,
    "no selected scenario",
  );
});

Deno.test("native wire host-route profiles use suite-owned provider declarations", () => {
  const manifest = createHostRouteTargetManifest("nnrp-js-host-route", "0.1.0", [
    {
      transport: "tcp",
      provider_id: "nnrp.transport.tcp.native",
      installed: true,
      platforms: ["native"],
      security_modes: ["plain", "tls_server_auth"],
    },
    {
      transport: "ipc",
      provider_id: "nnrp.transport.ipc.native",
      installed: true,
      platforms: ["native"],
      security_modes: ["plain"],
    },
  ]);
  assertEquals(manifest.wire_conformance.modes, ["suite_as_client", "suite_as_server"]);
  assertEquals(manifest.wire_conformance.transports, []);
  assertEquals(manifest.wire_conformance.host_route_providers.length, 2);
  assertEquals(NATIVE_HOST_ROUTE_PROFILES.map((profile) => profile.expected), [10, 1]);
});

Deno.test("browser host-route profile declares only the real browser client role", () => {
  assertEquals(BROWSER_HOST_ROUTE_PROFILE.modes, ["suite_as_server"]);
  assertEquals(BROWSER_HOST_ROUTE_PROFILE.expected, 1);
  assertEquals(BROWSER_HOST_ROUTE_PROFILE.providers, [{
    transport: "websocket",
    provider_id: "nnrp.transport.websocket.browser-wasm",
    installed: true,
    platforms: ["browser"],
    security_modes: ["browser_host"],
  }]);
});
