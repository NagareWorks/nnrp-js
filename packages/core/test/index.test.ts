import { assertEquals, assertInstanceOf, assertThrows } from "jsr:@std/assert@1";
import {
  createBackendNativeManifest,
  createBrowserWasmManifest,
  createCapabilityManifest,
  NNRP_PROTOCOL_VERSION,
  NnrpCapabilityError,
  NnrpProtocolError,
  selectTransport,
} from "../src/index.ts";

Deno.test("@nnrp/core creates a backend native manifest", () => {
  const manifest = createBackendNativeManifest(["flow.update"]);

  assertEquals(manifest.protocol, "NNRP");
  assertEquals(manifest.version, NNRP_PROTOCOL_VERSION);
  assertEquals(manifest.buildMode, "backend-native");
  assertEquals(manifest.transports, ["tcp", "quic"]);
  assertEquals(manifest.capabilities, ["client.session", "server.session", "native.loader", "flow.update"]);
});

Deno.test("@nnrp/core creates a browser wasm manifest", () => {
  const manifest = createBrowserWasmManifest(["result.hint"]);

  assertEquals(manifest.buildMode, "browser-wasm");
  assertEquals(manifest.transports, ["websocket", "webtransport"]);
  assertEquals(manifest.capabilities, ["client.session", "wasm.loader", "result.hint"]);
});

Deno.test("@nnrp/core rejects browser manifests with server or native capabilities", () => {
  const error = assertThrows(
    () =>
      createCapabilityManifest({
        buildMode: "browser-wasm",
        capabilities: ["server.session"],
      }),
    NnrpCapabilityError,
  );

  assertEquals(error.diagnostic.code, "NNRP_CAPABILITY_BROWSER_FORBIDDEN");
});

Deno.test("@nnrp/core rejects browser manifests with native transports", () => {
  const error = assertThrows(
    () =>
      createCapabilityManifest({
        buildMode: "browser-wasm",
        transports: ["tcp"],
      }),
    NnrpCapabilityError,
  );

  assertEquals(error.diagnostic.code, "NNRP_CAPABILITY_BROWSER_TRANSPORT_FORBIDDEN");
});

Deno.test("@nnrp/core rejects native manifests with browser transport slots", () => {
  const error = assertThrows(
    () =>
      createCapabilityManifest({
        buildMode: "backend-native",
        transports: ["websocket"],
      }),
    NnrpCapabilityError,
  );

  assertEquals(error.diagnostic.code, "NNRP_CAPABILITY_NATIVE_TRANSPORT_FORBIDDEN");
});

Deno.test("@nnrp/core selects the highest scored mutually supported transport", () => {
  const selection = selectTransport([
    { kind: "quic", peerSupported: true, localAvailable: true, score: 50 },
    { kind: "tcp", peerSupported: true, localAvailable: true, score: 80 },
    { kind: "webtransport", peerSupported: false, localAvailable: true, score: 100 },
  ]);

  assertEquals(selection.selected?.kind, "tcp");
  assertEquals(selection.policy, "score");
});

Deno.test("@nnrp/core applies transport policy filters", () => {
  const selection = selectTransport(
    [
      { kind: "quic", peerSupported: true, localAvailable: true, score: 100 },
      { kind: "tcp", peerSupported: true, localAvailable: true, score: 10 },
    ],
    "tcp-only",
  );

  assertEquals(selection.selected?.kind, "tcp");
});

Deno.test("@nnrp/core keeps diagnostics on typed errors", () => {
  const error = new NnrpProtocolError({
    code: "NNRP_PROTOCOL_TEST",
    message: "protocol test",
    source: "protocol",
    retryable: false,
  });

  assertInstanceOf(error, Error);
  assertEquals(error.name, "NnrpProtocolError");
  assertEquals(error.diagnostic.source, "protocol");
});
