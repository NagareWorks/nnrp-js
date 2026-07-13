import {
  CacheMissReason,
  CacheReuseScope,
  createBackendNativeManifest,
  ErrorScope,
  MemoryLocationHint,
  NnrpMessageType,
  NnrpTransportError,
  ObjectReleaseReason,
  OwnershipHint,
  RuntimeObjectKind,
  RuntimeRole,
} from "@nnrp/core";
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { openBackendRuntime } from "../src/index.ts";
import { createQuicTransportProvider, type NnrpQuicNativeBinding } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

Deno.test("@nnrp/native-server opens backend runtime and listens with explicit providers", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transportPolicy: "force-tcp",
    transports: [createTcpTransportProvider(), createQuicTransportProvider({ native: fakeQuicNativeBinding() })],
  });
  const server = runtime.listen({ endpoint: "0.0.0.0:4433", transportPolicy: "force-quic" });

  assertEquals(runtime.libraryPath, "native/linux-x86_64/libnnrp_ffi.so");
  assertEquals(server.endpoint, "0.0.0.0:4433");
  assertEquals(server.transportPolicy, "force-quic");

  await runtime.close();
  assertEquals(server.closed, true);
});

Deno.test("@nnrp/native-server selects only installed transport providers", async () => {
  const tcpRuntime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [createTcpTransportProvider({ score: 70 })],
  });
  const tcpSummary = await tcpRuntime.selectTransportWithNative({
    peerManifest: createBackendNativeManifest(["transport.tcp", "transport.quic"]),
  });

  assertEquals(tcpSummary.selected, "tcp");
  assertEquals(tcpSummary.rejected.map((item) => item.kind), ["quic"]);
  assertEquals(tcpSummary.rejected[0]?.reason, "local-unavailable");

  const noProviderRuntime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [],
  });
  const noProviderSummary = await noProviderRuntime.selectTransportWithNative({
    peerManifest: createBackendNativeManifest(["transport.tcp", "transport.quic"]),
  });

  assertEquals(noProviderSummary.selected, null);
  assertEquals(noProviderSummary.rejected.map((item) => item.kind).sort(), ["quic", "tcp"]);
});

Deno.test("@nnrp/native-server rejects listen policies unsatisfied by installed providers", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [createTcpTransportProvider()],
  });

  const error = assertThrows(
    () => runtime.listen({ endpoint: "0.0.0.0:4433", transportPolicy: "force-quic" }),
    NnrpTransportError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED");
  assertEquals(error.diagnostic.transport, "quic");
});

Deno.test("@nnrp/native-server exposes frozen high-level response controls", async () => {
  const seen: Array<{ readonly messageType: NnrpMessageType; readonly frameId: number }> = [];
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [createTcpTransportProvider()],
    ffi: {
      mode: "test",
      accept: () => ({ sessionOptions: { sessionId: "server-runtime" } }),
      sendRuntimeFrame: ({ messageType, frameId }) => {
        seen.push({ messageType, frameId });
      },
    },
  });
  const session = await runtime.listen({ endpoint: "0.0.0.0:4433" }).accept();
  const one = new Uint8Array([1]);
  await session.sendProgress({
    operationId: 1n,
    progressSequence: 2n,
    stageCode: 3,
    percentX100: 4,
    objectId: 5n,
    bodyBytes: 1,
  }, one);
  await session.sendPartialResult({
    operationId: 1n,
    resultSequence: 2n,
    objectId: 3n,
    deltaSequence: 4n,
    bodyBytes: 1,
    flags: 0,
  }, one);
  const pressure = {
    scopeId: 1n,
    creditWindow: 2n,
    pressureLevel: 3,
    pressureReason: 4,
    retryAfterMs: 5,
    flags: 0,
  } as const;
  await session.sendBackpressure(pressure);
  await session.sendCreditUpdate(pressure);
  await session.sendResultDropReason({
    operationId: 1n,
    resultSequence: 2n,
    dropReasonCode: 3,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    diagnosticBytes: 1,
  }, one);
  await session.sendTraceContext({
    traceId: 1n,
    spanId: 2n,
    parentSpanId: 3n,
    stageCode: 4,
    flags: 0,
    bodyBytes: 1,
  }, one);
  await session.sendRecoverableError({
    errorCode: 1,
    errorScope: ErrorScope.Session,
    recoveryAction: 2,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    retryAfterMs: 3,
    relatedSessionId: 4,
    relatedFrameId: 5,
    relatedViewId: 6,
    diagnosticBytes: 1,
  }, one);
  await session.sendRetryAfter({
    scopeId: 1n,
    controlSequence: 2n,
    retryAfterMs: 3,
    jitterMs: 4,
    reasonCode: 5,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    diagnosticBytes: 1,
  }, one);
  await session.declareObject({
    objectId: 1n,
    objectKind: RuntimeObjectKind.Tensor,
    producerRole: RuntimeRole.Server,
    consumerRole: RuntimeRole.Client,
    sessionId: 1,
    byteSize: 1n,
    computeCostUnits: 1,
    memoryLocationHint: MemoryLocationHint.HostMemory,
    ownershipHint: OwnershipHint.SessionOwned,
    lifetimeHintMs: 1,
    metadataBytes: 1,
  }, one);
  await session.referenceObject({
    objectId: 1n,
    operationId: 2n,
    objectVersion: 3n,
    offset: 0n,
    length: 1n,
    flags: 0,
    metadataBytes: 1,
  }, one);
  await session.releaseObject({
    objectId: 1n,
    operationId: 2n,
    releaseReason: ObjectReleaseReason.Completed,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    diagnosticBytes: 1,
  }, one);
  const delta = {
    objectId: 1n,
    deltaSequence: 2n,
    regionOffset: 0n,
    regionBytes: 1,
    deltaBytes: 1,
    flags: 0,
    metadataBytes: 0,
  } as const;
  await session.patchObject(delta, one);
  await session.sendObjectDelta(delta, one);
  await session.referenceCache({
    cacheKeyHi: 1n,
    cacheKeyLo: 2n,
    profileId: 3,
    reuseScope: CacheReuseScope.Session,
    leaseId: 4n,
    producerTraceId: 5n,
    expirationHintMs: 6,
    metadataBytes: 1,
    flags: 0,
  }, one);
  await session.reportCacheMiss({
    cacheKeyHi: 1n,
    cacheKeyLo: 2n,
    missReason: CacheMissReason.NotFound,
    profileId: 3,
    diagnosticBytes: 1,
  }, one);
  await session.invalidateCache({
    invalidateScope: 1,
    cacheNamespace: 2,
    cacheKeyHi: 3,
    cacheKeyLo: 4,
    reasonCode: 5,
  });

  assertEquals(seen.map(({ messageType }) => messageType), [
    NnrpMessageType.Progress,
    NnrpMessageType.PartialResult,
    NnrpMessageType.Backpressure,
    NnrpMessageType.CreditUpdate,
    NnrpMessageType.ResultDropReason,
    NnrpMessageType.TraceContext,
    NnrpMessageType.ErrorRecoverable,
    NnrpMessageType.RetryAfter,
    NnrpMessageType.ObjectDeclare,
    NnrpMessageType.ObjectRef,
    NnrpMessageType.ObjectRelease,
    NnrpMessageType.ObjectPatch,
    NnrpMessageType.ObjectDelta,
    NnrpMessageType.CacheReference,
    NnrpMessageType.CacheMiss,
    NnrpMessageType.CacheInvalidate,
  ]);
  assertEquals(seen.map(({ frameId }) => frameId), Array.from({ length: 16 }, (_, index) => index + 1));

  assertEquals("sendControl" in session, false);
});

function fakeQuicNativeBinding(): NnrpQuicNativeBinding {
  return {
    connect: ({ endpoint }) => ({
      kind: "quic",
      endpoint: String(endpoint),
      connected: true,
      send: () => {},
      close: () => {},
    }),
    listen: ({ endpoint }) => ({
      kind: "quic",
      endpoint: String(endpoint),
      listening: true,
      close: () => {},
    }),
  };
}
