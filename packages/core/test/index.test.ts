import { assertEquals, assertInstanceOf, assertNotStrictEquals, assertThrows } from "jsr:@std/assert@1";
import {
  createBackendNativeManifest,
  createBrowserWasmManifest,
  createCacheKey,
  createCapabilityManifest,
  createRecoveryToken,
  createSchemaDescriptor,
  createTransportCandidates,
  createTransportSelectionSummary,
  isStandardInputProfile,
  NNRP_PROTOCOL_VERSION,
  NnrpCapabilityError,
  NnrpProtocolError,
  NnrpRecoveryError,
  NnrpResultDropError,
  NnrpTimeoutError,
  NnrpTransportError,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  normalizeCacheInvalidateRequest,
  normalizeCachePutRequest,
  normalizeCancelRequest,
  normalizeOperationRef,
  normalizeSessionMigrationRequest,
  normalizeSessionPatchRequest,
  normalizeSubmitRequest,
  parseApplicationEndpoint,
  resolveProviderEndpoint,
  selectTransport,
  throwIfResultDrop,
  validateEventPollOptions,
  validateSessionMetadata,
} from "../src/index.ts";

const PREVIEW4_CONTROL_CAPABILITIES = [
  "control.cancel_abort",
  "control.supersede",
  "control.priority_update",
  "control.deadline_expire",
  "control.progress_partial",
  "control.credit_backpressure",
  "control.capability_costs",
  "control.route_execution_hint",
  "control.trace_context",
  "control.result_drop_reason",
  "control.degrade_profile",
  "control.budget_update",
  "control.recoverable_error",
  "control.retry_after",
] as const;

const PREVIEW4_OBJECT_CAPABILITIES = [
  "object.lifecycle",
  "object.delta",
  "object.cost",
  "object.ownership",
  "cache.reference",
] as const;

// @ts-expect-error Preview3 transport identifiers are not part of the Preview4 contract.
const removedTransportKind: NnrpTransportKind = "webtransport";
// @ts-expect-error Preview3 selection policies are not part of the Preview4 contract.
const removedTransportPolicy: NnrpTransportPolicy = "score";
void removedTransportKind;
void removedTransportPolicy;

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
  assertEquals(manifest.transports, ["websocket"]);
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

Deno.test("@nnrp/core accepts all native carrier providers", () => {
  const manifest = createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp", "quic", "ipc", "websocket"],
    capabilities: ["transport.tcp", "transport.quic", "transport.ipc", "transport.websocket"],
  });

  assertEquals(manifest.transports, ["tcp", "quic", "ipc", "websocket"]);
});

Deno.test("@nnrp/core serializes every frozen Preview4 capability token", () => {
  const capabilities = [...PREVIEW4_CONTROL_CAPABILITIES, ...PREVIEW4_OBJECT_CAPABILITIES];
  const manifest = createCapabilityManifest({
    buildMode: "backend-native",
    capabilities,
  });

  assertEquals(manifest.capabilities, capabilities);
});

Deno.test("@nnrp/core rejects capability tokens outside the frozen catalog", () => {
  const error = assertThrows(
    () =>
      createCapabilityManifest(
        {
          buildMode: "backend-native",
          capabilities: ["control.private_extension"],
        } as unknown as Parameters<typeof createCapabilityManifest>[0],
      ),
    NnrpCapabilityError,
  );

  assertEquals(error.diagnostic.code, "NNRP_CAPABILITY_UNKNOWN");
  assertEquals(error.diagnostic.message.includes("control.private_extension"), true);
});

Deno.test("@nnrp/core selects the highest scored mutually supported transport", () => {
  const selection = selectTransport([
    { kind: "quic", peerSupported: true, localAvailable: true, score: 50 },
    { kind: "tcp", peerSupported: true, localAvailable: true, score: 80 },
    { kind: "websocket", peerSupported: false, localAvailable: true, score: 100 },
  ]);

  assertEquals(selection.selected?.kind, "tcp");
  assertEquals(selection.policy, "auto");
});

Deno.test("@nnrp/core uses the frozen auto tie order for all carriers", () => {
  const selection = selectTransport([
    { kind: "websocket", peerSupported: true, localAvailable: true, score: 100 },
    { kind: "tcp", peerSupported: true, localAvailable: true, score: 100 },
    { kind: "quic", peerSupported: true, localAvailable: true, score: 100 },
    { kind: "ipc", peerSupported: true, localAvailable: true, score: 100 },
  ]);

  assertEquals(selection.selected?.kind, "ipc");
  assertEquals(selection.candidates.map((candidate) => candidate.kind), ["ipc", "quic", "tcp", "websocket"]);
});

Deno.test("@nnrp/core applies every preferred transport policy", () => {
  const candidates = [
    { kind: "quic", peerSupported: true, localAvailable: true, score: 100 },
    { kind: "tcp", peerSupported: true, localAvailable: true, score: 100 },
    { kind: "ipc", peerSupported: true, localAvailable: true, score: 100 },
    { kind: "websocket", peerSupported: true, localAvailable: true, score: 100 },
  ] as const;

  assertEquals(selectTransport(candidates, "prefer-quic").selected?.kind, "quic");
  assertEquals(selectTransport(candidates, "prefer-tcp").selected?.kind, "tcp");
  assertEquals(selectTransport(candidates, "prefer-ipc").selected?.kind, "ipc");
  assertEquals(selectTransport(candidates, "prefer-websocket").selected?.kind, "websocket");
});

Deno.test("@nnrp/core preferred policies fall back when the preferred carrier is unavailable", () => {
  const selection = selectTransport(
    [
      { kind: "ipc", peerSupported: false, localAvailable: true, score: 100 },
      { kind: "tcp", peerSupported: true, localAvailable: true, score: 80 },
      { kind: "websocket", peerSupported: true, localAvailable: true, score: 70 },
    ],
    "prefer-ipc",
  );

  assertEquals(selection.selected?.kind, "tcp");
  assertEquals(selection.candidates.map((candidate) => candidate.kind), ["ipc", "tcp", "websocket"]);
});

Deno.test("@nnrp/core applies every forced transport policy", () => {
  const candidates = [
    { kind: "quic", peerSupported: true, localAvailable: true, score: 100 },
    { kind: "tcp", peerSupported: true, localAvailable: true, score: 100 },
    { kind: "ipc", peerSupported: true, localAvailable: true, score: 100 },
    { kind: "websocket", peerSupported: true, localAvailable: true, score: 100 },
  ] as const;

  assertEquals(selectTransport(candidates, "force-quic").selected?.kind, "quic");
  assertEquals(selectTransport(candidates, "force-tcp").selected?.kind, "tcp");
  assertEquals(selectTransport(candidates, "force-ipc").selected?.kind, "ipc");
  assertEquals(selectTransport(candidates, "force-websocket").selected?.kind, "websocket");
});

Deno.test("@nnrp/core reports no selected transport when a forced provider is unavailable", () => {
  const selection = selectTransport(
    [{ kind: "tcp", peerSupported: true, localAvailable: true, score: 100 }],
    "force-ipc",
  );

  assertEquals(selection.selected, null);
  assertEquals(selection.candidates[0]?.rejectionReason, "policy-rejected");
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
    "force-tcp",
  );
  const summary = createTransportSelectionSummary(selection);

  assertEquals(selection.selected?.kind, "tcp");
  assertEquals(summary.rejected, [{ kind: "quic", reason: "policy-rejected", score: 100 }]);
});

Deno.test("@nnrp/core parses application endpoints without losing URL semantics", () => {
  const endpoint = parseApplicationEndpoint("nnrps://runtime.example:7443/session/default?tenant=a#result");

  assertEquals(endpoint.protocol, "nnrps:");
  assertEquals(endpoint.host, "runtime.example:7443");
  assertEquals(endpoint.pathname, "/session/default");
  assertEquals(endpoint.search, "?tenant=a");
  assertEquals(endpoint.hash, "#result");
});

Deno.test("@nnrp/core rejects empty, malformed, and provider-local application endpoints", () => {
  for (const endpoint of ["", "not a URL", "ws://runtime.example/nnrp", "unix:///tmp/nnrp.sock", "nnrp:///path"]) {
    const error = assertThrows(() => parseApplicationEndpoint(endpoint), NnrpProtocolError);
    assertEquals(error.diagnostic.code, "NNRP_APPLICATION_ENDPOINT_INVALID");
  }
});

Deno.test("@nnrp/core derives TCP and QUIC provider endpoints", () => {
  assertEquals(resolveProviderEndpoint("nnrp://127.0.0.1:7443/session", "tcp"), "127.0.0.1:7443");
  assertEquals(resolveProviderEndpoint("nnrps://runtime.example/session", "quic"), "runtime.example:4433");
  assertEquals(
    resolveProviderEndpoint("nnrp://runtime.example/session", "tcp", "[::1]:9000"),
    "[::1]:9000",
  );
});

Deno.test("@nnrp/core validates provider-local endpoint schemes and security intent", () => {
  assertEquals(
    resolveProviderEndpoint("nnrp://runtime.example/session", "ipc", "unix:///tmp/nnrp.sock"),
    "unix:///tmp/nnrp.sock",
  );
  assertEquals(
    resolveProviderEndpoint("nnrp://runtime.example/session", "ipc", new URL("npipe://nnrp-runtime")),
    "npipe://nnrp-runtime",
  );
  assertEquals(
    resolveProviderEndpoint("nnrps://runtime.example/session", "websocket", "wss://runtime.example/nnrp"),
    "wss://runtime.example/nnrp",
  );

  for (
    const [transport, providerEndpoint] of [
      ["tcp", "ws://runtime.example/nnrp"],
      ["ipc", "127.0.0.1:4433"],
      ["websocket", "unix:///tmp/nnrp.sock"],
      ["websocket", "ws://runtime.example/nnrp"],
    ] as const
  ) {
    const error = assertThrows(
      () => resolveProviderEndpoint("nnrps://runtime.example/session", transport, providerEndpoint),
      NnrpTransportError,
    );
    assertEquals(error.diagnostic.code, "NNRP_PROVIDER_ENDPOINT_INVALID");
  }
});

Deno.test("@nnrp/core requires explicit IPC and WebSocket provider endpoints", () => {
  for (const transport of ["ipc", "websocket"] as const) {
    const error = assertThrows(
      () => resolveProviderEndpoint("nnrp://runtime.example/session", transport),
      NnrpTransportError,
    );
    assertEquals(error.diagnostic.transport, transport);
  }
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

Deno.test("@nnrp/core normalizes cache put and invalidate operations", () => {
  const put = normalizeCachePutRequest({
    key: createCacheKey("tensor", "kv-block", 3),
    payload: new Uint8Array([1, 2]),
    descriptor: {
      profile: "tensor",
      cache: { key: createCacheKey("tensor", "kv-block", 3), leaseMillis: 1000 },
    },
    metadata: { pool: "gpu-0" },
  });
  const invalidate = normalizeCacheInvalidateRequest({
    key: createCacheKey("tensor", "kv-block", 3),
    recursive: true,
    metadata: { reason: "evict" },
  });

  assertEquals(put.payload, new Uint8Array([1, 2]));
  assertEquals(put.descriptor?.cache?.leaseMillis, 1000);
  assertEquals(invalidate.recursive, true);
  assertEquals(invalidate.metadata, { reason: "evict" });
});

Deno.test("@nnrp/core rejects invalid cache leases and metadata boundaries", () => {
  assertThrows(
    () => normalizeCachePutRequest({ key: createCacheKey("tensor", "a"), leaseMillis: -1 }),
    NnrpProtocolError,
    "leaseMillis must be a non-negative",
  );
  assertThrows(
    () => validateSessionMetadata({ metadata: { "": "value" } }),
    NnrpProtocolError,
    "Metadata keys must be non-empty",
  );
  assertThrows(
    () => validateSessionMetadata({ metadata: { key: "x".repeat(1025) } }),
    NnrpProtocolError,
    "Metadata values must be at most",
  );
  assertThrows(
    () =>
      validateSessionMetadata({
        metadata: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`k${index}`, "v"])),
      }),
    NnrpProtocolError,
    "Metadata maps must contain at most",
  );
});

Deno.test("@nnrp/core rejects invalid cache and schema edge cases", () => {
  assertThrows(
    () => createCacheKey("unknown" as never, "key"),
    NnrpProtocolError,
    "Unsupported NNRP cache object kind",
  );
  assertThrows(
    () => createCacheKey("tensor", " "),
    NnrpProtocolError,
    "Cache key strings must not be empty",
  );
  assertThrows(
    () => createCacheKey("tensor", 1, -1),
    NnrpProtocolError,
    "namespaceId must be a non-negative",
  );
  assertThrows(
    () =>
      createSchemaDescriptor({
        id: "tensor-frame",
        name: "TensorFrame",
        version: "1",
        flags: ["unsupported" as never],
      }),
    NnrpProtocolError,
    "Unsupported schema flag",
  );
});

Deno.test("@nnrp/core covers transport diagnostics and optional descriptor fields", () => {
  const diagnostic = {
    code: "NNRP_TRANSPORT_PROBE",
    message: "probe failed",
    source: "transport" as const,
    retryable: true,
    transport: "quic" as const,
  };
  const summary = createTransportSelectionSummary(selectTransport([{
    kind: "quic",
    peerSupported: true,
    localAvailable: true,
    score: 100,
    rejectionReason: "probe-failed",
    diagnostic,
  }]));
  const normalized = normalizeSubmitRequest({
    frameId: 12,
    metadata: { request: "agent" },
    descriptor: {
      profile: "token",
      metadata: { format: "delta" },
      cache: {
        key: createCacheKey("token", "stream"),
        version: "1",
        dependencies: [createCacheKey("schema", "token-delta")],
      },
    },
  });

  assertEquals(summary.selected, null);
  assertEquals(summary.rejected[0]?.diagnostic, diagnostic);
  assertEquals(normalized.metadata, { request: "agent" });
  assertEquals(normalized.descriptor?.metadata, { format: "delta" });
  assertEquals(normalized.descriptor?.cache?.dependencies?.[0]?.kind, "schema");
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
    () => normalizeOperationRef(-1n),
    NnrpProtocolError,
    "Operation ids must be non-negative",
  );
  assertThrows(
    () => normalizeOperationRef(-1),
    NnrpProtocolError,
    "Operation ids must be non-negative",
  );
});

Deno.test("@nnrp/core normalizes recovery tokens and migration requests", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const token = createRecoveryToken(bytes, { route: "standby" });
  bytes[0] = 9;
  const migration = normalizeSessionMigrationRequest({
    recoveryToken: token,
    targetEndpoint: "nnrp://standby",
    metadata: { reason: "preempt" },
  });

  assertEquals(token.token, new Uint8Array([1, 2, 3]));
  assertEquals(token.metadata, { route: "standby" });
  assertEquals(migration.targetEndpoint, "nnrp://standby");
  assertEquals(migration.metadata, { reason: "preempt" });

  assertThrows(
    () => createRecoveryToken(" "),
    NnrpProtocolError,
    "Recovery token strings must be non-empty",
  );
  assertThrows(
    () => createRecoveryToken(new Uint8Array()),
    NnrpProtocolError,
    "Recovery token payloads must be non-empty",
  );
});

Deno.test("@nnrp/core normalizes session patch requests", () => {
  const patch = normalizeSessionPatchRequest({
    inputProfile: "token",
    targetCadence: 60,
    qualityTier: 2,
    submitCapacityPolicy: "await-credit",
    initialCredits: 3,
    metadata: { route: "fast" },
  });

  assertEquals(patch, {
    inputProfile: "token",
    targetCadence: 60,
    qualityTier: 2,
    submitCapacityPolicy: "await-credit",
    initialCredits: 3,
    metadata: { route: "fast" },
  });
  assertThrows(
    () => normalizeSessionPatchRequest({ inputProfile: "custom" as never }),
    NnrpProtocolError,
    "Unknown NNRP input profile",
  );
  assertThrows(
    () => normalizeSessionPatchRequest({ targetCadence: -1 }),
    NnrpProtocolError,
    "targetCadence must be",
  );
  assertThrows(
    () => normalizeSessionPatchRequest({ qualityTier: 1.5 }),
    NnrpProtocolError,
    "qualityTier must be",
  );
  assertThrows(
    () => normalizeSessionPatchRequest({ initialCredits: -1 }),
    NnrpProtocolError,
    "initialCredits must be",
  );
});

Deno.test("@nnrp/core maps result drops and recovery failures to typed errors", () => {
  const drop = {
    type: "drop" as const,
    frameId: 77,
    sessionId: "session-a",
    diagnostic: {
      code: "NNRP_RESULT_DROPPED",
      message: "result dropped",
      source: "runtime" as const,
      retryable: true,
    },
  };
  const error = assertThrows(
    () => throwIfResultDrop(drop),
    NnrpResultDropError,
  );
  const recoveryError = new NnrpRecoveryError({
    code: "NNRP_RECOVERY_UNSUPPORTED",
    message: "migration unsupported",
    source: "runtime",
    retryable: false,
  });

  assertEquals(error.frameId, 77);
  assertEquals(error.sessionId, "session-a");
  assertEquals(error.diagnostic.code, "NNRP_RESULT_DROPPED");
  assertEquals(recoveryError.name, "NnrpRecoveryError");
});

Deno.test("@nnrp/core validates event polling options", () => {
  validateEventPollOptions({ timeoutMillis: 0 });
  validateEventPollOptions({ timeoutMillis: 10 });
  validateEventPollOptions({ signal: { aborted: false } });

  assertThrows(
    () => validateEventPollOptions({ timeoutMillis: -1 }),
    NnrpProtocolError,
    "timeoutMillis must be a non-negative",
  );

  const cancelled = assertThrows(
    () => validateEventPollOptions({ signal: { aborted: true, reason: "test-stop" } }),
    NnrpTimeoutError,
    "Event polling was cancelled",
  );

  assertEquals(cancelled.diagnostic.code, "NNRP_EVENT_POLL_CANCELLED");
  assertEquals(cancelled.diagnostic.cause, "test-stop");
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
  assertEquals(
    new NnrpTransportError({ code: "NNRP_TRANSPORT", message: "transport", source: "transport" }).name,
    "NnrpTransportError",
  );
  assertEquals(
    new NnrpTimeoutError({ code: "NNRP_TIMEOUT", message: "timeout", source: "runtime" }).name,
    "NnrpTimeoutError",
  );
});
