import {
  CacheMissReason,
  CacheReuseScope,
  createBackendNativeManifest,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  ErrorScope,
  MemoryLocationHint,
  NnrpCapabilityError,
  NnrpMessageType,
  type NnrpNativeTransportBinding,
  NnrpProtocolError,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportServer,
  ObjectReleaseReason,
  OwnershipHint,
  RuntimeObjectKind,
  RuntimeRole,
} from "@nnrp/core";
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  type NnrpNativeRuntimeCapabilities,
  openBackendRuntime,
  validateNativeRuntimeCapabilities,
} from "../src/index.ts";
import { createQuicTransportProvider, type NnrpQuicNativeBinding } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const SERVER_ROLE_ADOPT = Symbol.for("nnrp.internal.native.server-role-adopt.v1");

Deno.test("@nnrp/native-server requires the exact Preview4 native ABI", () => {
  const capabilities = preview4RuntimeCapabilities();
  validateNativeRuntimeCapabilities(capabilities);
  validateNativeRuntimeCapabilities({ ...capabilities, transportSlots: 0 });

  const error = assertThrows(
    () => validateNativeRuntimeCapabilities({ ...capabilities, abiMajor: 1, abiMinor: 12, abiPatch: 1 }),
    NnrpCapabilityError,
  );
  assertEquals(error.diagnostic.code, "NNRP_NATIVE_ABI_MISMATCH");
});

Deno.test("@nnrp/native-server opens backend runtime and listens with explicit providers", async () => {
  const runtime = await openBackendRuntime({
    transportPolicy: "force-tcp",
    transports: [
      createTcpTransportProvider({ binding: fakeTransportBinding("tcp") }),
      createQuicTransportProvider({ binding: fakeQuicNativeBinding() }),
    ],
  });
  const server = runtime.listen({ endpoint: "nnrp://0.0.0.0:4433/session/default", transportPolicy: "force-quic" });

  assertEquals(runtime.manifest.transports, ["tcp", "quic"]);
  assertEquals(runtime.manifest.capabilities.includes("server.session"), true);
  assertEquals(runtime.manifest.capabilities.includes("client.session"), false);
  assertEquals(runtime.manifest.capabilities.includes("native.loader"), false);
  assertEquals("connect" in runtime, false);
  assertEquals(server.endpoint, "nnrp://0.0.0.0:4433/session/default");
  assertEquals(server.transportPolicy, "force-quic");

  await runtime.close();
  assertEquals(server.closed, true);
});

Deno.test("@nnrp/native-server discovers every installed native transport package", async () => {
  const policies = ["force-tcp", "force-quic", "force-ipc", "force-websocket"] as const;

  for (const transportPolicy of policies) {
    const runtime = await openBackendRuntime({
      transportPolicy,
    });
    const server = runtime.listen({ endpoint: "nnrp://127.0.0.1:4433/session/default" });

    assertEquals(server.transportPolicy, transportPolicy);
    await runtime.close();
  }
});

Deno.test("@nnrp/native-server selects only installed transport providers", async () => {
  const tcpRuntime = await openBackendRuntime({
    transports: [createTcpTransportProvider({ binding: fakeTransportBinding("tcp") })],
  });
  const tcpSummary = tcpRuntime.selectTransport({
    peerManifest: createBackendNativeManifest(["transport.tcp", "transport.quic"]),
  });

  assertEquals(tcpSummary.selected, "tcp");
  assertEquals(tcpSummary.rejected, []);

  const noProviderRuntime = await openBackendRuntime({
    transports: [],
  });
  const noProviderSummary = noProviderRuntime.selectTransport({
    peerManifest: createBackendNativeManifest(["transport.tcp", "transport.quic"]),
  });

  assertEquals(noProviderSummary.selected, null);
  assertEquals(noProviderSummary.rejected, []);
});

Deno.test("@nnrp/native-server rejects listen policies unsatisfied by installed providers", async () => {
  const runtime = await openBackendRuntime({
    transports: [createTcpTransportProvider({ binding: fakeTransportBinding("tcp") })],
  });

  const error = assertThrows(
    () => runtime.listen({ endpoint: "nnrp://0.0.0.0:4433/session/default", transportPolicy: "force-quic" }),
    NnrpTransportError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED");
  assertEquals(error.diagnostic.transport, "quic");
});

Deno.test("@nnrp/native-server passes server security to the selected provider role listener", async () => {
  const security = {
    mode: "server",
    certificateDer: new Uint8Array([1, 2, 3]),
    privateKeyPkcs8Der: new Uint8Array([4, 5, 6]),
  } as const;
  let listened: NnrpTransportEndpoint | undefined;
  const binding: NnrpNativeTransportBinding = {
    ...fakeTransportBinding("quic"),
    listen: (options) => {
      listened = options;
      return Promise.resolve({
        kind: "quic",
        endpoint: String(options.endpoint),
        listening: true,
        accept: () => Promise.reject(new Error("carrier accept must be transferred to the server role")),
        close: () => {},
        [SERVER_ROLE_ADOPT]: () =>
          Promise.resolve({
            accept: () =>
              Promise.resolve({
                handle: { kind: 3, id: 1n, generation: 1, flags: 0 },
                poll: () => Promise.resolve([]),
                sendResult: () => Promise.resolve(),
                sendRuntimeFrame: () => Promise.resolve(),
                close: () => Promise.resolve(),
              }),
            close: () => Promise.resolve(),
          }),
      } as NnrpTransportServer);
    },
  };
  const runtime = await openBackendRuntime({
    transports: [createQuicTransportProvider({ binding })],
    transportPolicy: "force-quic",
  });
  const server = runtime.listen({
    endpoint: "nnrps://runtime.example/session/default",
    providerEndpoint: "127.0.0.1:45443",
    security,
  });
  const session = await server.accept();

  assertEquals(listened, { endpoint: "127.0.0.1:45443", security });
  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server rejects carriers without server role adoption", async () => {
  const binding: NnrpNativeTransportBinding = {
    ...fakeTransportBinding("tcp"),
    listen: (options) =>
      Promise.resolve({
        kind: "tcp",
        endpoint: String(options.endpoint),
        listening: true,
        accept: () => Promise.reject(new Error("carrier-only listener")),
        close: () => {},
      }),
  };
  const runtime = await openBackendRuntime({
    transports: [createTcpTransportProvider({ binding })],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({ endpoint: "nnrp://127.0.0.1:4433/session/default" });

  const error = await assertRejects(() => server.accept(), NnrpCapabilityError);
  assertEquals(error.diagnostic.code, "NNRP_NATIVE_ROLE_ADOPTION_UNAVAILABLE");

  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server decodes ordered control, object, and cache role events", async () => {
  const events = [
    roleRuntimeEvent(
      NnrpMessageType.Cancel,
      encodeRuntimeControlMetadata(
        NnrpMessageType.Cancel,
        {
          operationId: 1n,
          controlSequence: 2n,
          reasonCode: 3,
          sourceRole: RuntimeRole.Client,
          flags: 0,
          diagnosticBytes: 2,
        },
        new Uint8Array([4, 5]),
      ),
    ),
    roleRuntimeEvent(
      NnrpMessageType.PriorityUpdate,
      encodeRuntimeControlMetadata(NnrpMessageType.PriorityUpdate, {
        operationId: 1n,
        controlSequence: 3n,
        priorityClass: 4,
        priorityDelta: -1,
        deadlineUnixMs: 5n,
        flags: 0,
      }),
    ),
    roleRuntimeEvent(
      NnrpMessageType.CapabilityNegotiation,
      encodeRuntimeControlMetadata(
        NnrpMessageType.CapabilityNegotiation,
        {
          profileId: 1,
          capabilityCount: 2,
          costModelId: 3,
          preferenceRank: 4,
          limitBytes: 5n,
          limitUnits: 6n,
          bodyBytes: 1,
          flags: 0,
        },
        new Uint8Array([7]),
      ),
    ),
    roleRuntimeEvent(
      NnrpMessageType.ObjectDeclare,
      encodeRuntimeObjectMetadata(
        NnrpMessageType.ObjectDeclare,
        {
          objectId: 1n,
          objectKind: RuntimeObjectKind.Tensor,
          producerRole: RuntimeRole.Client,
          consumerRole: RuntimeRole.Server,
          sessionId: 2,
          byteSize: 3n,
          computeCostUnits: 4,
          memoryLocationHint: MemoryLocationHint.HostMemory,
          ownershipHint: OwnershipHint.SessionOwned,
          lifetimeHintMs: 5,
          metadataBytes: 1,
        },
        new Uint8Array([8]),
      ),
    ),
    roleRuntimeEvent(
      NnrpMessageType.ObjectDelta,
      encodeRuntimeObjectMetadata(
        NnrpMessageType.ObjectDelta,
        {
          objectId: 1n,
          deltaSequence: 2n,
          regionOffset: 0n,
          regionBytes: 2,
          deltaBytes: 2,
          flags: 0,
          metadataBytes: 1,
        },
        new Uint8Array([9, 10, 11]),
      ),
    ),
    roleRuntimeEvent(
      NnrpMessageType.CacheInvalidate,
      encodeCacheInvalidateMetadata({
        invalidateScope: 1,
        cacheNamespace: 2,
        cacheKeyHi: 0n,
        cacheKeyLo: 0n,
        reasonCode: 5,
      }),
    ),
  ];
  const runtime = await openBackendRuntime({
    transports: [createTcpTransportProvider({ binding: roleServerBinding(events) })],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({ endpoint: "nnrp://127.0.0.1:4433/session/default" });
  const session = await server.accept();

  const cancel = await session.receive();
  const priority = await session.receive();
  const capability = await session.receive();
  const declaration = await session.receive();
  const delta = await session.receive();
  const invalidation = await session.receive();

  assertEquals(cancel.type, "cancel");
  if (cancel.type === "cancel") assertEquals(cancel.diagnostic, new Uint8Array([4, 5]));
  assertEquals(priority.type, "priority-update");
  assertEquals(capability.type, "capability-negotiation");
  if (capability.type === "capability-negotiation") assertEquals(capability.body, new Uint8Array([7]));
  assertEquals(declaration.type, "object-declare");
  if (declaration.type === "object-declare") assertEquals(declaration.body, new Uint8Array([8]));
  assertEquals(delta.type, "object-delta");
  if (delta.type === "object-delta") {
    assertEquals(delta.metadataBody, new Uint8Array([9]));
    assertEquals(delta.delta, new Uint8Array([10, 11]));
  }
  assertEquals(invalidation.type, "cache-invalidate");

  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server enforces terminal result ordering without blocking terminal evidence", async () => {
  const runtimeFrames: NnrpMessageType[] = [];
  let resultCount = 0;
  const runtime = await openBackendRuntime({
    transports: [
      createTcpTransportProvider({
        binding: roleServerBinding(
          [roleSubmitEvent(9n, 7)],
          {
            onResult: () => resultCount++,
            onRuntimeFrame: (messageType) => runtimeFrames.push(messageType as NnrpMessageType),
          },
        ),
      }),
    ],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({ endpoint: "nnrp://127.0.0.1:4433/session/default" });
  const session = await server.accept();
  const submit = await session.receive();
  assertEquals(submit.type, "submit");

  await session.sendProgress({
    operationId: 9n,
    progressSequence: 1n,
    stageCode: 1,
    percentX100: 50,
    objectId: 0n,
    bodyBytes: 0,
  });
  await session.sendResult({ frameId: 7, payload: new Uint8Array([1]) });
  assertEquals(resultCount, 1);

  const progressError = await assertRejects(
    () =>
      session.sendPartialResult({
        operationId: 9n,
        resultSequence: 2n,
        objectId: 0n,
        deltaSequence: 0n,
        bodyBytes: 0,
        flags: 0,
      }),
    NnrpProtocolError,
  );
  assertEquals(progressError.diagnostic.code, "NNRP_SERVER_INCREMENTAL_AFTER_TERMINAL");

  const duplicateError = await assertRejects(
    () => session.sendResult({ frameId: 7, payload: new Uint8Array([2]) }),
    NnrpProtocolError,
  );
  assertEquals(duplicateError.diagnostic.code, "NNRP_SERVER_RESULT_TERMINAL_DUPLICATE");

  await session.sendTraceContext({
    traceId: 1n,
    spanId: 2n,
    parentSpanId: 3n,
    stageCode: 4,
    flags: 0,
    bodyBytes: 0,
  });
  await session.sendResultDropReason({
    operationId: 9n,
    resultSequence: 3n,
    dropReasonCode: 4,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    diagnosticBytes: 0,
  });
  assertEquals(runtimeFrames, [
    NnrpMessageType.Progress,
    NnrpMessageType.TraceContext,
    NnrpMessageType.ResultDropReason,
  ]);

  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server exposes frozen high-level response controls", async () => {
  const seen: Array<{ readonly messageType: NnrpMessageType; readonly frameId: number }> = [];
  const runtime = await openBackendRuntime({
    transports: [createTcpTransportProvider({ binding: fakeTransportBinding("tcp") })],
    ffi: {
      mode: "test",
      accept: () => ({ sessionOptions: { sessionId: "server-runtime" } }),
      sendRuntimeFrame: ({ messageType, frameId }) => {
        seen.push({ messageType, frameId });
      },
    },
  });
  const session = await runtime.listen({ endpoint: "nnrp://0.0.0.0:4433/session/default" }).accept();
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
  await session.sendControl(NnrpMessageType.Progress, {
    operationId: 1n,
    progressSequence: 3n,
    stageCode: 4,
    percentX100: 5,
    objectId: 6n,
    bodyBytes: 1,
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
    cacheNamespace: 0,
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
    cacheNamespace: 0,
    cacheKeyHi: 1n,
    cacheKeyLo: 2n,
    missReason: CacheMissReason.NotFound,
    profileId: 3,
    diagnosticBytes: 1,
  }, one);
  await session.invalidateCache({
    invalidateScope: 1,
    cacheNamespace: 2,
    cacheKeyHi: 0n,
    cacheKeyLo: 0n,
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
    NnrpMessageType.Progress,
    NnrpMessageType.ObjectDeclare,
    NnrpMessageType.ObjectRef,
    NnrpMessageType.ObjectRelease,
    NnrpMessageType.ObjectPatch,
    NnrpMessageType.ObjectDelta,
    NnrpMessageType.CacheReference,
    NnrpMessageType.CacheMiss,
    NnrpMessageType.CacheInvalidate,
  ]);
  assertEquals(seen.map(({ frameId }) => frameId), Array.from({ length: 17 }, (_, index) => index + 1));
});

function fakeQuicNativeBinding(): NnrpQuicNativeBinding {
  return fakeTransportBinding("quic");
}

function roleRuntimeEvent(messageType: NnrpMessageType, payload: Uint8Array) {
  return {
    kind: 13,
    messageType,
    connection: { kind: 1, id: 1n, generation: 1, flags: 0 },
    session: { kind: 3, id: 1n, generation: 1, flags: 0 },
    operation: { kind: 4, id: 1n, generation: 1, flags: 0 },
    frameId: 1,
    payload,
  };
}

function roleSubmitEvent(operationId: bigint, frameId: number) {
  const payload = new Uint8Array(72);
  const view = new DataView(payload.buffer);
  view.setBigUint64(40, operationId, true);
  view.setUint32(64, 0x40, true);
  return {
    ...roleRuntimeEvent(NnrpMessageType.FrameSubmit, payload),
    kind: 5,
    frameId,
  };
}

function roleServerBinding(
  events: ReturnType<typeof roleRuntimeEvent>[],
  callbacks: {
    readonly onResult?: () => void;
    readonly onRuntimeFrame?: (messageType: number) => void;
  } = {},
): NnrpNativeTransportBinding {
  return {
    ...fakeTransportBinding("tcp"),
    listen: ({ endpoint }) =>
      Promise.resolve({
        kind: "tcp",
        endpoint: String(endpoint),
        listening: true,
        accept: () => Promise.reject(new Error("carrier accept must be transferred to the server role")),
        close: () => {},
        [SERVER_ROLE_ADOPT]: () =>
          Promise.resolve({
            accept: () =>
              Promise.resolve({
                handle: { kind: 3, id: 1n, generation: 1, flags: 0 },
                poll: () => Promise.resolve(events.splice(0, 1)),
                sendResult: () => {
                  callbacks.onResult?.();
                  return Promise.resolve();
                },
                sendRuntimeFrame: (messageType: number) => {
                  callbacks.onRuntimeFrame?.(messageType);
                  return Promise.resolve();
                },
                close: () => Promise.resolve(),
              }),
            close: () => Promise.resolve(),
          }),
      } as NnrpTransportServer),
  };
}

function fakeTransportBinding(kind: "tcp" | "quic"): NnrpNativeTransportBinding {
  return {
    mode: "test",
    probe: () =>
      Promise.resolve({
        sampleCount: 1,
        successCount: 1,
        medianRttMicroseconds: 1n,
        medianThroughputBytesPerSecond: 1n,
      }),
    connect: ({ endpoint }) =>
      Promise.resolve({
        kind,
        endpoint: String(endpoint),
        connected: true,
        send: () => Promise.resolve(),
        receive: () => Promise.resolve([]),
        close: () => {},
      }),
    listen: ({ endpoint }) =>
      Promise.resolve({
        kind,
        endpoint: String(endpoint),
        listening: true,
        accept: async () => await fakeTransportBinding(kind).connect({ endpoint }),
        close: () => {},
      }),
  };
}

function preview4RuntimeCapabilities(): NnrpNativeRuntimeCapabilities {
  return {
    abiMajor: 3,
    abiMinor: 0,
    abiPatch: 0,
    protocolMajor: 1,
    protocolWireFormat: 0,
    sdkMajor: 1,
    sdkMinor: 0,
    sdkPatch: 0,
    sdkChannel: 4,
    sdkRevision: 8,
    transportSlots: 0x00000002,
    featureFlags: 0xffffffffffffffffn,
  };
}
