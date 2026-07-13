import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  CacheMissReason,
  CacheReuseScope,
  createBackendNativeManifest,
  MemoryLocationHint,
  NnrpCapabilityError,
  NnrpMessageType,
  NnrpTransportError,
  ObjectReleaseReason,
  OwnershipHint,
  RuntimeObjectKind,
  RuntimeRole,
} from "@nnrp/core";
import { NnrpNativeBindingUnavailableError, openNativeClient } from "../src/index.ts";
import { createQuicTransportProvider, type NnrpQuicNativeBinding } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

Deno.test("@nnrp/native-client opens a client with explicit transport providers", async () => {
  const client = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [createTcpTransportProvider()],
    sessionDefaults: { inputProfile: "tensor", metadata: { app: "agent" } },
  });

  const session = client.openSession({ metadata: { request: "one" } });

  assertEquals(client.endpoint, "127.0.0.1:4433");
  assertEquals(session.sessionId, "native-session-1");
  assertEquals(session.options.metadata, { app: "agent", request: "one" });
});

Deno.test("@nnrp/native-client closes runtime when client connect fails", async () => {
  let closed = false;

  await assertRejects(
    () =>
      openNativeClient({
        endpoint: "",
        env: {},
        ffi: {
          mode: "test",
          close: () => {
            closed = true;
          },
        },
      }),
    NnrpCapabilityError,
  );

  assertEquals(closed, true);
});

Deno.test("@nnrp/native-client preserves not-connected diagnostics", async () => {
  const client = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    env: {},
    platform: "linux",
    arch: "x64",
  });
  const session = client.openSession();

  const error = await assertRejects(
    () => session.submit({ frameId: 1, payload: new Uint8Array([1]) }),
    NnrpNativeBindingUnavailableError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_BINDING_NOT_CONNECTED");
});

Deno.test("@nnrp/native-client selects the best installed transport provider", async () => {
  const client = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [
      createTcpTransportProvider({ score: 60 }),
      createQuicTransportProvider({ score: 90, native: fakeQuicNativeBinding() }),
    ],
  });

  const summary = await client.runtime.selectTransportWithNative({
    peerManifest: createBackendNativeManifest(["transport.tcp", "transport.quic"]),
  });

  assertEquals(summary.selected, "quic");
  assertEquals(summary.rejected, []);
});

Deno.test("@nnrp/native-client rejects missing transport providers at connect time", async () => {
  const error = await assertRejects(
    () =>
      openNativeClient({
        endpoint: "127.0.0.1:4433",
        env: {},
        platform: "linux",
        arch: "x64",
        transports: [],
      }),
    NnrpCapabilityError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_TRANSPORT_PROVIDER_MISSING");
});

Deno.test("@nnrp/native-client rejects policy mismatches at connect time", async () => {
  const error = await assertRejects(
    () =>
      openNativeClient({
        endpoint: "127.0.0.1:4433",
        env: {},
        platform: "linux",
        arch: "x64",
        transports: [createTcpTransportProvider()],
        transportPolicy: "force-quic",
      }),
    NnrpTransportError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED");
  assertEquals(error.diagnostic.transport, "quic");
});

Deno.test("@nnrp/native-client exposes the frozen high-level Preview4 runtime API", async () => {
  const seen: Array<{ readonly messageType: NnrpMessageType; readonly frameId: number; readonly payload: Uint8Array }> =
    [];
  const client = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [createTcpTransportProvider()],
    ffi: {
      mode: "test",
      sendRuntimeFrame: ({ messageType, frameId, payload }) => {
        seen.push({ messageType, frameId, payload });
      },
    },
  });
  const session = client.openSession({ sessionId: "runtime-api" });
  const one = new Uint8Array([1]);
  const control = {
    operationId: 1n,
    controlSequence: 2n,
    reasonCode: 3,
    sourceRole: RuntimeRole.Client,
    flags: 0,
    diagnosticBytes: 1,
  } as const;
  const scheduling = {
    operationId: 1n,
    controlSequence: 2n,
    priorityClass: 3,
    priorityDelta: -1,
    deadlineUnixMs: 4n,
    flags: 0,
  } as const;

  await session.cancel(control, one);
  await session.abort(control, one);
  await session.updatePriority(scheduling);
  await session.updateDeadline(scheduling);
  await session.expireAt(scheduling);
  await session.supersede({
    oldOperationId: 1n,
    newOperationId: 2n,
    controlSequence: 3n,
    dropReasonCode: 4,
    flags: 0,
    diagnosticBytes: 1,
  }, one);
  await session.updateBudget({
    operationId: 1n,
    computeBudgetUnits: 2n,
    memoryBudgetBytes: 3n,
    bandwidthBudgetBytes: 4n,
    tokenBudget: 5,
    flags: 0,
  });
  const capability = {
    profileId: 1,
    capabilityCount: 1,
    costModelId: 2,
    preferenceRank: 3,
    limitBytes: 4n,
    limitUnits: 5n,
    bodyBytes: 1,
    flags: 0,
  } as const;
  await session.negotiateCapabilities(capability, one);
  await session.degradeProfile(capability, one);
  const route = {
    operationId: 1n,
    routeId: 2,
    executorClass: 3,
    affinityClass: 4,
    deadlineUnixMs: 5n,
    bodyBytes: 1,
    flags: 0,
  } as const;
  await session.sendRouteHint(route, one);
  await session.sendExecutionHint(route, one);
  await session.sendTraceContext({
    traceId: 1n,
    spanId: 2n,
    parentSpanId: 3n,
    stageCode: 4,
    flags: 0,
    bodyBytes: 1,
  }, one);
  await session.declareObject({
    objectId: 1n,
    objectKind: RuntimeObjectKind.Tensor,
    producerRole: RuntimeRole.Client,
    consumerRole: RuntimeRole.Server,
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
    sourceRole: RuntimeRole.Client,
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
    NnrpMessageType.Cancel,
    NnrpMessageType.Abort,
    NnrpMessageType.PriorityUpdate,
    NnrpMessageType.Deadline,
    NnrpMessageType.ExpireAt,
    NnrpMessageType.Supersede,
    NnrpMessageType.BudgetUpdate,
    NnrpMessageType.CapabilityNegotiation,
    NnrpMessageType.DegradeProfile,
    NnrpMessageType.RouteHint,
    NnrpMessageType.ExecutionHint,
    NnrpMessageType.TraceContext,
    NnrpMessageType.ObjectDeclare,
    NnrpMessageType.ObjectRef,
    NnrpMessageType.ObjectRelease,
    NnrpMessageType.ObjectPatch,
    NnrpMessageType.ObjectDelta,
    NnrpMessageType.CacheReference,
    NnrpMessageType.CacheMiss,
    NnrpMessageType.CacheInvalidate,
  ]);
  assertEquals(seen.map(({ frameId }) => frameId), Array.from({ length: 20 }, (_, index) => index + 1));
  assertEquals(seen.every(({ payload }) => payload.byteLength > 0), true);
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
