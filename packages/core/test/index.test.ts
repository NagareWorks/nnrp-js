import { assertEquals, assertInstanceOf, assertNotStrictEquals, assertThrows } from "jsr:@std/assert@1";
import {
  createBackendNativeManifest,
  createBrowserWasmManifest,
  createCacheKey,
  createCapabilityManifest,
  createSchemaDescriptor,
  createTransportCandidates,
  createTransportSelectionSummary,
  isStandardInputProfile,
  NNRP_PROTOCOL_VERSION,
  NnrpCapabilityError,
  NnrpProtocolError,
  normalizeCancelRequest,
  normalizeOperationRef,
  normalizeSubmitRequest,
  selectTransport,
  validateEventPollOptions,
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

Deno.test("@nnrp/core creates transport candidates from local and peer manifests", () => {
  const local = createBackendNativeManifest(["transport.tcp"]);
  const peer = createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp"],
    capabilities: ["client.session"],
  });

  const candidates = createTransportCandidates({
    local,
    peer,
    scores: { tcp: 10, quic: 100 },
  });
  const selection = selectTransport(candidates);
  const summary = createTransportSelectionSummary(selection);

  assertEquals(selection.selected?.kind, "tcp");
  assertEquals(summary.selected, "tcp");
  assertEquals(summary.rejected, [{ kind: "quic", reason: "peer-unsupported", score: 100 }]);
});

Deno.test("@nnrp/core reports policy-rejected transport candidates", () => {
  const selection = selectTransport(
    [
      { kind: "quic", peerSupported: true, localAvailable: true, score: 100 },
      { kind: "tcp", peerSupported: true, localAvailable: true, score: 10 },
    ],
    "tcp-only",
  );
  const summary = createTransportSelectionSummary(selection);

  assertEquals(selection.selected?.kind, "tcp");
  assertEquals(summary.rejected, [{ kind: "quic", reason: "policy-rejected", score: 100 }]);
});

Deno.test("@nnrp/core normalizes submit payloads with retained ownership", () => {
  const source = new Uint8Array([1, 2, 3, 4]);
  const normalized = normalizeSubmitRequest({
    frameId: 7,
    payload: source.subarray(1, 3),
    tensors: [{ payload: new DataView(source.buffer, 2, 2), codecId: 4 }],
    inputProfile: "tensor",
    submitMode: "inline",
    cacheKey: createCacheKey("tensor", "model-a", 1),
    descriptor: {
      profile: "tensor",
      schema: createSchemaDescriptor({
        id: "tensor-frame",
        name: "TensorFrame",
        version: "1",
        flags: ["required", "lossless"],
      }),
      cache: {
        key: createCacheKey("tensor", "model-a", 1),
        dependencies: [createCacheKey("schema", "tensor-frame")],
      },
    },
  });

  assertEquals(normalized.payload, new Uint8Array([2, 3]));
  assertNotStrictEquals(normalized.payload, source.subarray(1, 3));
  assertEquals(normalized.tensors?.[0]?.payload, new Uint8Array([3, 4]));
  assertEquals(normalized.descriptor?.schema?.flags, ["required", "lossless"]);
});

Deno.test("@nnrp/core can skip payload copies when ownership is explicit", () => {
  const payload = new Uint8Array([5, 6]);
  const normalized = normalizeSubmitRequest({ frameId: 1, payload }, { copyPayloads: false });

  assertEquals(normalized.payload, payload);
});

Deno.test("@nnrp/core validates cache, schema, profile, and frame shapes", () => {
  assertThrows(
    () => createCacheKey("tensor", -1),
    NnrpProtocolError,
    "Numeric cache keys must be non-negative safe integers.",
  );
  assertThrows(
    () => createSchemaDescriptor({ id: "", name: "Frame", version: "1" }),
    NnrpProtocolError,
    "Schema id must be non-empty",
  );
  assertThrows(
    () => normalizeSubmitRequest({ frameId: -1 }),
    NnrpProtocolError,
    "frameId must be a non-negative",
  );
  assertThrows(
    () => normalizeSubmitRequest({ frameId: 1, inputProfile: "custom" as never }),
    NnrpProtocolError,
    "Unknown NNRP input profile",
  );
});

Deno.test("@nnrp/core exposes strict standard profile checks", () => {
  assertEquals(isStandardInputProfile("tool_delta"), true);
  assertEquals(isStandardInputProfile("custom"), false);
});

Deno.test("@nnrp/core normalizes operation references and cancel requests", () => {
  assertEquals(normalizeOperationRef(42), 42n);
  assertEquals(normalizeOperationRef(7n), 7n);
  assertEquals(normalizeCancelRequest(3, { reason: "user", metadata: { source: "test" } }), {
    operation: 3n,
    options: { reason: "user", metadata: { source: "test" } },
  });

  assertThrows(
    () => normalizeOperationRef(-1),
    NnrpProtocolError,
    "Operation ids must be non-negative",
  );
});

Deno.test("@nnrp/core validates event polling options", () => {
  validateEventPollOptions({ timeoutMillis: 0 });
  validateEventPollOptions({ timeoutMillis: 10 });

  assertThrows(
    () => validateEventPollOptions({ timeoutMillis: -1 }),
    NnrpProtocolError,
    "timeoutMillis must be a non-negative",
  );
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
