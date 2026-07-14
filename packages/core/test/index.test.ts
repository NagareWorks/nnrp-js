import { assertEquals, assertInstanceOf, assertNotStrictEquals, assertThrows } from "jsr:@std/assert@1";
import {
  type CacheInvalidateMetadata,
  CacheMissReason,
  CacheReuseScope,
  createBackendNativeManifest,
  createBrowserWasmManifest,
  createCacheKey,
  createCapabilityManifest,
  createRecoveryToken,
  createSchemaDescriptor,
  createTransportCandidates,
  createTransportSelectionSummary,
  decodeCacheInvalidateMetadata,
  decodeRuntimeControlMetadata,
  decodeRuntimeObjectMetadata,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  ErrorScope,
  isStandardInputProfile,
  MemoryLocationHint,
  NNRP_PROTOCOL_VERSION,
  NnrpCapabilityError,
  NnrpMessageType,
  NnrpProtocolError,
  NnrpRecoveryError,
  NnrpResultDropError,
  type NnrpSubmitRequest,
  NnrpTimeoutError,
  NnrpTransportError,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  normalizeCacheInvalidateRequest,
  normalizeCachePutRequest,
  normalizeSessionMigrationRequest,
  normalizeSessionPatchRequest,
  normalizeSubmitRequest,
  ObjectReleaseReason,
  OwnershipHint,
  parseApplicationEndpoint,
  resolveProviderEndpoint,
  type RuntimeControlMetadata,
  RuntimeObjectKind,
  type RuntimeObjectMetadata,
  RuntimeRole,
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

const NNRP_MESSAGE_TYPES = [
  ["ClientHello", 0x01],
  ["ServerHelloAck", 0x02],
  ["SessionPatch", 0x03],
  ["SessionPatchAck", 0x04],
  ["Close", 0x05],
  ["Error", 0x06],
  ["SessionOpen", 0x07],
  ["SessionOpenAck", 0x08],
  ["SessionClose", 0x09],
  ["SessionCloseAck", 0x0a],
  ["FrameSubmit", 0x10],
  ["FrameCancel", 0x11],
  ["ResultPush", 0x12],
  ["ResultDrop", 0x13],
  ["CachePut", 0x14],
  ["CacheAck", 0x15],
  ["CacheInvalidate", 0x16],
  ["FlowUpdate", 0x17],
  ["ResultHint", 0x18],
  ["TransportProbe", 0x19],
  ["TransportProbeAck", 0x1a],
  ["SessionMigrate", 0x1b],
  ["SessionMigrateAck", 0x1c],
  ["Ping", 0x20],
  ["Pong", 0x21],
  ["Cancel", 0x30],
  ["Abort", 0x31],
  ["PriorityUpdate", 0x32],
  ["Deadline", 0x33],
  ["ExpireAt", 0x34],
  ["Supersede", 0x35],
  ["BudgetUpdate", 0x36],
  ["Progress", 0x37],
  ["PartialResult", 0x38],
  ["Backpressure", 0x39],
  ["CreditUpdate", 0x3a],
  ["CapabilityNegotiation", 0x3b],
  ["DegradeProfile", 0x3c],
  ["RouteHint", 0x3d],
  ["ExecutionHint", 0x3e],
  ["TraceContext", 0x3f],
  ["ResultDropReason", 0x40],
  ["ObjectDeclare", 0x41],
  ["ObjectRef", 0x42],
  ["ObjectRelease", 0x43],
  ["ObjectPatch", 0x44],
  ["ObjectDelta", 0x45],
  ["CacheReference", 0x46],
  ["CacheMiss", 0x47],
  ["ErrorRecoverable", 0x48],
  ["RetryAfter", 0x49],
] as const;

// @ts-expect-error Preview3 transport identifiers are not part of the Preview4 contract.
const removedTransportKind: NnrpTransportKind = "webtransport";
// @ts-expect-error Preview3 selection policies are not part of the Preview4 contract.
const removedTransportPolicy: NnrpTransportPolicy = "score";
const providerLocalEndpointRequest: NnrpSubmitRequest = {
  frameId: 1,
  // @ts-expect-error Provider-local endpoints belong to transport setup, not operation payloads.
  providerEndpoint: "unix:///tmp/nnrp.sock",
};
void removedTransportKind;
void removedTransportPolicy;
void providerLocalEndpointRequest;

Deno.test("@nnrp/core exposes the exact NNRP/1 Preview4 message type registry", () => {
  const namedEntries = Object.entries(NnrpMessageType).filter(([name]) => Number.isNaN(Number(name)));

  assertEquals(
    namedEntries.map(([name, value]) => `${name}:${value}`),
    NNRP_MESSAGE_TYPES.map(([name, value]) => `${name}:${value}`),
  );
});

Deno.test("@nnrp/core exposes the exact Preview4 runtime object enum registries", () => {
  assertNumericEnum(RuntimeObjectKind, [
    ["Unspecified", 0x0000],
    ["Tensor", 0x0001],
    ["TokenBlock", 0x0002],
    ["ImageTile", 0x0003],
    ["FeatureMap", 0x0004],
    ["ToolResult", 0x0005],
    ["TraceSegment", 0x0006],
    ["OpaqueBytes", 0x0007],
    ["DocumentChunk", 0x0008],
    ["AudioChunk", 0x0009],
    ["VideoChunk", 0x000a],
    ["RoutePlan", 0x000b],
    ["CacheManifest", 0x000c],
  ]);
  assertNumericEnum(RuntimeRole, [
    ["Unspecified", 0x00],
    ["Client", 0x01],
    ["Server", 0x02],
    ["Runtime", 0x03],
    ["Subagent", 0x04],
    ["Tool", 0x05],
    ["Scheduler", 0x06],
    ["ConformanceRunner", 0x07],
  ]);
  assertNumericEnum(MemoryLocationHint, [
    ["Unspecified", 0x0000],
    ["HostMemory", 0x0001],
    ["DeviceMemory", 0x0002],
    ["SharedMemory", 0x0003],
    ["RemoteMemory", 0x0004],
    ["MmapFile", 0x0005],
    ["ObjectStore", 0x0006],
  ]);
  assertNumericEnum(OwnershipHint, [
    ["Unspecified", 0x0000],
    ["ProducerOwned", 0x0001],
    ["ConsumerOwned", 0x0002],
    ["SessionOwned", 0x0003],
    ["Borrowed", 0x0004],
    ["TransferOnRef", 0x0005],
    ["ReleaseOnDrop", 0x0006],
  ]);
  assertNumericEnum(ObjectReleaseReason, [
    ["Completed", 0x0000],
    ["Cancelled", 0x0001],
    ["Expired", 0x0002],
    ["Replaced", 0x0003],
    ["Invalidated", 0x0004],
    ["OwnerClosed", 0x0005],
    ["LeaseExpired", 0x0006],
    ["ConformanceInjection", 0x0007],
  ]);
  assertNumericEnum(CacheReuseScope, [
    ["Operation", 0x0000],
    ["Session", 0x0001],
    ["Connection", 0x0002],
    ["Global", 0x0003],
    ["Tenant", 0x0004],
    ["Profile", 0x0005],
  ]);
  assertNumericEnum(CacheMissReason, [
    ["Unknown", 0x0000],
    ["NotFound", 0x0001],
    ["Expired", 0x0002],
    ["Invalidated", 0x0003],
    ["SchemaMismatch", 0x0004],
    ["ProducerUnavailable", 0x0005],
    ["LeaseRequired", 0x0006],
    ["PermissionDenied", 0x0007],
  ]);
});

const RUNTIME_CONTROL_CODEC_CASES: readonly {
  readonly messageTypes: readonly NnrpMessageType[];
  readonly metadata: RuntimeControlMetadata;
  readonly fixedLength: number;
  readonly tail: Uint8Array;
}[] = [
  {
    messageTypes: [NnrpMessageType.Cancel, NnrpMessageType.Abort],
    metadata: {
      operationId: 1n,
      controlSequence: 2n,
      reasonCode: 3,
      sourceRole: RuntimeRole.Client,
      flags: 0x03,
      diagnosticBytes: 2,
    },
    fixedLength: 32,
    tail: new Uint8Array([0xaa, 0xbb]),
  },
  {
    messageTypes: [NnrpMessageType.PriorityUpdate, NnrpMessageType.Deadline, NnrpMessageType.ExpireAt],
    metadata: {
      operationId: 3n,
      controlSequence: 4n,
      priorityClass: 5,
      priorityDelta: -6,
      deadlineUnixMs: 1_800_000_000_000n,
      flags: 0x01,
    },
    fixedLength: 32,
    tail: new Uint8Array(),
  },
  {
    messageTypes: [NnrpMessageType.Supersede],
    metadata: {
      oldOperationId: 7n,
      newOperationId: 8n,
      controlSequence: 9n,
      dropReasonCode: 10,
      flags: 0x01,
      diagnosticBytes: 1,
    },
    fixedLength: 32,
    tail: new Uint8Array([0x11]),
  },
  {
    messageTypes: [NnrpMessageType.BudgetUpdate],
    metadata: {
      operationId: 11n,
      computeBudgetUnits: 12n,
      memoryBudgetBytes: 13n,
      bandwidthBudgetBytes: 14n,
      tokenBudget: 15,
      flags: 0x02,
    },
    fixedLength: 40,
    tail: new Uint8Array(),
  },
  {
    messageTypes: [NnrpMessageType.Progress],
    metadata: {
      operationId: 16n,
      progressSequence: 17n,
      stageCode: 18,
      percentX100: 9_999,
      objectId: 19n,
      bodyBytes: 2,
    },
    fixedLength: 32,
    tail: new Uint8Array([0x22, 0x23]),
  },
  {
    messageTypes: [NnrpMessageType.PartialResult],
    metadata: {
      operationId: 20n,
      resultSequence: 21n,
      objectId: 22n,
      deltaSequence: 23n,
      bodyBytes: 1,
      flags: 0x03,
    },
    fixedLength: 40,
    tail: new Uint8Array([0x24]),
  },
  {
    messageTypes: [NnrpMessageType.Backpressure, NnrpMessageType.CreditUpdate],
    metadata: {
      scopeId: 25n,
      creditWindow: 26n,
      pressureLevel: 27,
      pressureReason: 28,
      retryAfterMs: 29,
      flags: 0x01,
    },
    fixedLength: 32,
    tail: new Uint8Array(),
  },
  {
    messageTypes: [NnrpMessageType.CapabilityNegotiation, NnrpMessageType.DegradeProfile],
    metadata: {
      profileId: 30,
      capabilityCount: 31,
      costModelId: 32,
      preferenceRank: 33,
      limitBytes: 34n,
      limitUnits: 35n,
      bodyBytes: 2,
      flags: 0x02,
    },
    fixedLength: 32,
    tail: new Uint8Array([0x25, 0x26]),
  },
  {
    messageTypes: [NnrpMessageType.RouteHint, NnrpMessageType.ExecutionHint],
    metadata: {
      operationId: 36n,
      routeId: 37,
      executorClass: 38,
      affinityClass: 39,
      deadlineUnixMs: 1_900_000_000_000n,
      bodyBytes: 1,
      flags: 0x01,
    },
    fixedLength: 32,
    tail: new Uint8Array([0x27]),
  },
  {
    messageTypes: [NnrpMessageType.TraceContext],
    metadata: {
      traceId: 40n,
      spanId: 41n,
      parentSpanId: 42n,
      stageCode: 43,
      flags: 0x03,
      bodyBytes: 1,
    },
    fixedLength: 32,
    tail: new Uint8Array([0x28]),
  },
  {
    messageTypes: [NnrpMessageType.ResultDropReason],
    metadata: {
      operationId: 44n,
      resultSequence: 45n,
      dropReasonCode: 46,
      sourceRole: RuntimeRole.Runtime,
      flags: 0x02,
      diagnosticBytes: 1,
    },
    fixedLength: 32,
    tail: new Uint8Array([0x29]),
  },
  {
    messageTypes: [NnrpMessageType.ErrorRecoverable],
    metadata: {
      errorCode: 47,
      errorScope: ErrorScope.Session,
      recoveryAction: 49,
      sourceRole: RuntimeRole.Server,
      flags: 0x03,
      retryAfterMs: 50,
      relatedSessionId: 51,
      relatedFrameId: 52,
      relatedViewId: 53,
      diagnosticBytes: 2,
    },
    fixedLength: 32,
    tail: new Uint8Array([0x2a, 0x2b]),
  },
  {
    messageTypes: [NnrpMessageType.RetryAfter],
    metadata: {
      scopeId: 54n,
      controlSequence: 55n,
      retryAfterMs: 56,
      jitterMs: 57,
      reasonCode: 58,
      sourceRole: RuntimeRole.Scheduler,
      flags: 0x01,
      diagnosticBytes: 1,
    },
    fixedLength: 32,
    tail: new Uint8Array([0x2c]),
  },
];

Deno.test("@nnrp/core round-trips every Preview4 runtime control metadata layout", () => {
  for (const testCase of RUNTIME_CONTROL_CODEC_CASES) {
    for (const messageType of testCase.messageTypes) {
      const encoded = encodeRuntimeControlMetadata(messageType, testCase.metadata, testCase.tail);
      const decoded = decodeRuntimeControlMetadata(messageType, encoded);

      assertEquals(encoded.byteLength, testCase.fixedLength + testCase.tail.byteLength);
      assertEquals(decoded.metadata, testCase.metadata);
      assertEquals(decoded.tail, testCase.tail);
    }
  }
});

Deno.test("@nnrp/core uses frozen little-endian runtime control offsets", () => {
  const control = encodeRuntimeControlMetadata(
    NnrpMessageType.Cancel,
    {
      operationId: 0x0102_0304_0506_0708n,
      controlSequence: 0x1112_1314_1516_1718n,
      reasonCode: 0x2122,
      sourceRole: RuntimeRole.Tool,
      flags: 0x03,
      diagnosticBytes: 1,
    },
    new Uint8Array([0x31]),
  );
  const controlView = new DataView(control.buffer);
  assertEquals(controlView.getBigUint64(0, true), 0x0102_0304_0506_0708n);
  assertEquals(controlView.getBigUint64(8, true), 0x1112_1314_1516_1718n);
  assertEquals(controlView.getUint16(16, true), 0x2122);
  assertEquals(controlView.getUint8(18), RuntimeRole.Tool);
  assertEquals(controlView.getUint8(19), 0x03);
  assertEquals(controlView.getUint32(20, true), 1);
  assertEquals(controlView.getBigUint64(24, true), 0n);
  assertEquals(control[32], 0x31);

  const scheduling = encodeRuntimeControlMetadata(NnrpMessageType.PriorityUpdate, {
    operationId: 1n,
    controlSequence: 2n,
    priorityClass: 0x3132,
    priorityDelta: -1234,
    deadlineUnixMs: 0x4142_4344_4546_4748n,
    flags: 0x02,
  });
  const schedulingView = new DataView(scheduling.buffer);
  assertEquals(schedulingView.getUint16(16, true), 0x3132);
  assertEquals(schedulingView.getInt16(18, true), -1234);
  assertEquals(schedulingView.getBigUint64(20, true), 0x4142_4344_4546_4748n);
  assertEquals(schedulingView.getUint32(28, true), 0x02);
});

Deno.test("@nnrp/core enforces runtime control metadata and tail contracts", () => {
  const control = RUNTIME_CONTROL_CODEC_CASES[0];
  assertRuntimeControlError(
    () => encodeRuntimeControlMetadata(NnrpMessageType.Cancel, RUNTIME_CONTROL_CODEC_CASES[1].metadata),
    "NNRP_CONTROL_METADATA_MISMATCH",
  );
  assertRuntimeControlError(
    () => encodeRuntimeControlMetadata(NnrpMessageType.Cancel, control.metadata, new Uint8Array([1])),
    "NNRP_CONTROL_TAIL_LENGTH_INVALID",
  );
  assertRuntimeControlError(
    () => encodeRuntimeControlMetadata(NnrpMessageType.ClientHello, control.metadata, control.tail),
    "NNRP_CONTROL_MESSAGE_UNSUPPORTED",
  );
  assertRuntimeControlError(
    () => decodeRuntimeControlMetadata(NnrpMessageType.Cancel, new Uint8Array(31)),
    "NNRP_CONTROL_METADATA_TRUNCATED",
  );

  const nonZeroReserved = encodeRuntimeControlMetadata(NnrpMessageType.Cancel, control.metadata, control.tail);
  nonZeroReserved[24] = 1;
  assertRuntimeControlError(
    () => decodeRuntimeControlMetadata(NnrpMessageType.Cancel, nonZeroReserved),
    "NNRP_CONTROL_RESERVED_NONZERO",
  );

  const trailingBytes = new Uint8Array(33);
  assertRuntimeControlError(
    () => decodeRuntimeControlMetadata(NnrpMessageType.PriorityUpdate, trailingBytes),
    "NNRP_CONTROL_TAIL_LENGTH_INVALID",
  );
});

Deno.test("@nnrp/core rejects invalid runtime control values", () => {
  assertRuntimeControlError(
    () =>
      encodeRuntimeControlMetadata(NnrpMessageType.Cancel, {
        operationId: 1 as unknown as bigint,
        controlSequence: 2n,
        reasonCode: 3,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      }),
    "NNRP_CONTROL_INTEGER_INVALID",
  );
  assertRuntimeControlError(
    () =>
      encodeRuntimeControlMetadata(NnrpMessageType.BudgetUpdate, {
        operationId: 1n,
        computeBudgetUnits: 2n,
        memoryBudgetBytes: 3n,
        bandwidthBudgetBytes: 4n,
        tokenBudget: 0x1_0000_0000,
        flags: 0,
      }),
    "NNRP_CONTROL_INTEGER_INVALID",
  );
  assertRuntimeControlError(
    () =>
      encodeRuntimeControlMetadata(NnrpMessageType.PriorityUpdate, {
        operationId: 1n,
        controlSequence: 2n,
        priorityClass: 3,
        priorityDelta: -0x8001,
        deadlineUnixMs: 4n,
        flags: 0,
      }),
    "NNRP_CONTROL_INTEGER_INVALID",
  );
  assertRuntimeControlError(
    () =>
      encodeRuntimeControlMetadata(NnrpMessageType.Progress, {
        operationId: 1n,
        progressSequence: 2n,
        stageCode: 3,
        percentX100: 10_001,
        objectId: 4n,
        bodyBytes: 0,
      }),
    "NNRP_CONTROL_PROGRESS_INVALID",
  );
  const unknownProgress = encodeRuntimeControlMetadata(NnrpMessageType.Progress, {
    operationId: 1n,
    progressSequence: 2n,
    stageCode: 3,
    percentX100: 0xffff,
    objectId: 4n,
    bodyBytes: 0,
  });
  assertEquals(
    (decodeRuntimeControlMetadata(NnrpMessageType.Progress, unknownProgress).metadata as { percentX100: number })
      .percentX100,
    0xffff,
  );
  assertRuntimeControlError(
    () =>
      encodeRuntimeControlMetadata(NnrpMessageType.ErrorRecoverable, {
        errorCode: 1,
        errorScope: 3 as ErrorScope,
        recoveryAction: 2,
        sourceRole: RuntimeRole.Server,
        flags: 0,
        retryAfterMs: 0,
        relatedSessionId: 0,
        relatedFrameId: 0,
        relatedViewId: 0,
        diagnosticBytes: 0,
      }),
    "NNRP_CONTROL_ERROR_SCOPE_INVALID",
  );
  assertRuntimeControlError(
    () =>
      encodeRuntimeControlMetadata(NnrpMessageType.Cancel, {
        operationId: 1n,
        controlSequence: 2n,
        reasonCode: 3,
        sourceRole: 8 as RuntimeRole,
        flags: 0,
        diagnosticBytes: 0,
      }),
    "NNRP_CONTROL_ROLE_INVALID",
  );
  assertRuntimeControlError(
    () =>
      encodeRuntimeControlMetadata(NnrpMessageType.RetryAfter, {
        scopeId: 1n,
        controlSequence: 2n,
        retryAfterMs: 3,
        jitterMs: 4,
        reasonCode: 5,
        sourceRole: RuntimeRole.Server,
        flags: 0x04,
        diagnosticBytes: 0,
      }),
    "NNRP_CONTROL_FLAGS_INVALID",
  );

  const privateRole = encodeRuntimeControlMetadata(NnrpMessageType.Cancel, {
    operationId: 1n,
    controlSequence: 2n,
    reasonCode: 3,
    sourceRole: 0x80 as RuntimeRole,
    flags: 0,
    diagnosticBytes: 0,
  });
  assertEquals(
    (decodeRuntimeControlMetadata(NnrpMessageType.Cancel, privateRole).metadata as { sourceRole: RuntimeRole })
      .sourceRole,
    0x80,
  );
});

Deno.test("@nnrp/core owns encoded and decoded runtime control tails", () => {
  const metadata = RUNTIME_CONTROL_CODEC_CASES[0].metadata;
  const sourceTail = new Uint8Array([0x41, 0x42]);
  const encoded = encodeRuntimeControlMetadata(NnrpMessageType.Cancel, metadata, sourceTail);
  sourceTail[0] = 0xff;
  assertEquals(encoded.slice(32), new Uint8Array([0x41, 0x42]));

  const decoded = decodeRuntimeControlMetadata(NnrpMessageType.Cancel, encoded);
  assertNotStrictEquals(decoded.tail.buffer, encoded.buffer);
  encoded[32] = 0xee;
  assertEquals(decoded.tail, new Uint8Array([0x41, 0x42]));
});

const RUNTIME_OBJECT_CODEC_CASES: readonly {
  readonly messageTypes: readonly NnrpMessageType[];
  readonly metadata: RuntimeObjectMetadata;
  readonly fixedLength: number;
  readonly tail: Uint8Array;
}[] = [
  {
    messageTypes: [NnrpMessageType.ObjectDeclare],
    metadata: {
      objectId: 1n,
      objectKind: RuntimeObjectKind.Tensor,
      producerRole: RuntimeRole.Runtime,
      consumerRole: RuntimeRole.Client,
      sessionId: 2,
      byteSize: 3n,
      computeCostUnits: 4,
      memoryLocationHint: MemoryLocationHint.DeviceMemory,
      ownershipHint: OwnershipHint.TransferOnRef,
      lifetimeHintMs: 5,
      metadataBytes: 2,
    },
    fixedLength: 48,
    tail: new Uint8Array([0x51, 0x52]),
  },
  {
    messageTypes: [NnrpMessageType.ObjectRef],
    metadata: {
      objectId: 6n,
      operationId: 7n,
      objectVersion: 8n,
      offset: 9n,
      length: 10n,
      flags: 0x07,
      metadataBytes: 1,
    },
    fixedLength: 48,
    tail: new Uint8Array([0x53]),
  },
  {
    messageTypes: [NnrpMessageType.ObjectRelease],
    metadata: {
      objectId: 11n,
      operationId: 12n,
      releaseReason: ObjectReleaseReason.Completed,
      sourceRole: RuntimeRole.Server,
      flags: 0x03,
      diagnosticBytes: 2,
    },
    fixedLength: 32,
    tail: new Uint8Array([0x54, 0x55]),
  },
  {
    messageTypes: [NnrpMessageType.ObjectPatch, NnrpMessageType.ObjectDelta],
    metadata: {
      objectId: 13n,
      deltaSequence: 14n,
      regionOffset: 15n,
      regionBytes: 16,
      deltaBytes: 3,
      flags: 0x07,
      metadataBytes: 2,
    },
    fixedLength: 40,
    tail: new Uint8Array([0x56, 0x57, 0x58, 0x59, 0x5a]),
  },
  {
    messageTypes: [NnrpMessageType.CacheReference],
    metadata: {
      cacheKeyHi: 17n,
      cacheKeyLo: 18n,
      profileId: 19,
      reuseScope: CacheReuseScope.Session,
      leaseId: 20n,
      producerTraceId: 21n,
      expirationHintMs: 22,
      metadataBytes: 1,
      flags: 0x03,
    },
    fixedLength: 48,
    tail: new Uint8Array([0x5b]),
  },
  {
    messageTypes: [NnrpMessageType.CacheMiss],
    metadata: {
      cacheKeyHi: 23n,
      cacheKeyLo: 24n,
      missReason: CacheMissReason.NotFound,
      profileId: 25,
      diagnosticBytes: 2,
    },
    fixedLength: 32,
    tail: new Uint8Array([0x5c, 0x5d]),
  },
];

Deno.test("@nnrp/core round-trips every Preview4 runtime object metadata layout", () => {
  for (const testCase of RUNTIME_OBJECT_CODEC_CASES) {
    for (const messageType of testCase.messageTypes) {
      const encoded = encodeRuntimeObjectMetadata(messageType, testCase.metadata, testCase.tail);
      const decoded = decodeRuntimeObjectMetadata(messageType, encoded);

      assertEquals(encoded.byteLength, testCase.fixedLength + testCase.tail.byteLength);
      assertEquals(decoded.metadata, testCase.metadata);
      assertEquals(decoded.tail, testCase.tail);
    }
  }
});

Deno.test("@nnrp/core uses frozen little-endian runtime object offsets", () => {
  const descriptor = encodeRuntimeObjectMetadata(
    NnrpMessageType.ObjectDeclare,
    {
      objectId: 0x0102_0304_0506_0708n,
      objectKind: RuntimeObjectKind.ImageTile,
      producerRole: RuntimeRole.Runtime,
      consumerRole: RuntimeRole.Client,
      sessionId: 0x1112_1314,
      byteSize: 0x2122_2324_2526_2728n,
      computeCostUnits: 0x3132_3334,
      memoryLocationHint: MemoryLocationHint.DeviceMemory,
      ownershipHint: OwnershipHint.ConsumerOwned,
      lifetimeHintMs: 0x4142_4344,
      metadataBytes: 1,
    },
    new Uint8Array([0x61]),
  );
  const descriptorView = new DataView(descriptor.buffer);
  assertEquals(descriptorView.getBigUint64(0, true), 0x0102_0304_0506_0708n);
  assertEquals(descriptorView.getUint16(8, true), RuntimeObjectKind.ImageTile);
  assertEquals(descriptorView.getUint8(10), RuntimeRole.Runtime);
  assertEquals(descriptorView.getUint8(11), RuntimeRole.Client);
  assertEquals(descriptorView.getUint32(12, true), 0x1112_1314);
  assertEquals(descriptorView.getBigUint64(16, true), 0x2122_2324_2526_2728n);
  assertEquals(descriptorView.getUint32(24, true), 0x3132_3334);
  assertEquals(descriptorView.getUint16(28, true), MemoryLocationHint.DeviceMemory);
  assertEquals(descriptorView.getUint16(30, true), OwnershipHint.ConsumerOwned);
  assertEquals(descriptorView.getUint32(32, true), 0x4142_4344);
  assertEquals(descriptorView.getUint32(36, true), 1);
  assertEquals(descriptorView.getBigUint64(40, true), 0n);
  assertEquals(descriptor[48], 0x61);

  const cacheReference = encodeRuntimeObjectMetadata(
    NnrpMessageType.CacheReference,
    RUNTIME_OBJECT_CODEC_CASES[4].metadata,
    RUNTIME_OBJECT_CODEC_CASES[4].tail,
  );
  const cacheView = new DataView(cacheReference.buffer);
  assertEquals(cacheView.getBigUint64(20, true), 20n);
  assertEquals(cacheView.getBigUint64(28, true), 21n);
  assertEquals(cacheView.getUint32(44, true), 0x03);
});

Deno.test("@nnrp/core enforces runtime object metadata and tail contracts", () => {
  const descriptor = RUNTIME_OBJECT_CODEC_CASES[0];
  assertRuntimeObjectError(
    () => encodeRuntimeObjectMetadata(NnrpMessageType.ObjectDeclare, RUNTIME_OBJECT_CODEC_CASES[1].metadata),
    "NNRP_OBJECT_METADATA_MISMATCH",
  );
  assertRuntimeObjectError(
    () => encodeRuntimeObjectMetadata(NnrpMessageType.ObjectDeclare, descriptor.metadata, new Uint8Array([1])),
    "NNRP_OBJECT_TAIL_LENGTH_INVALID",
  );
  assertRuntimeObjectError(
    () => encodeRuntimeObjectMetadata(NnrpMessageType.ClientHello, descriptor.metadata, descriptor.tail),
    "NNRP_OBJECT_MESSAGE_UNSUPPORTED",
  );
  assertRuntimeObjectError(
    () => decodeRuntimeObjectMetadata(NnrpMessageType.ObjectRef, new Uint8Array(47)),
    "NNRP_OBJECT_METADATA_TRUNCATED",
  );

  const nonZeroReserved = encodeRuntimeObjectMetadata(
    NnrpMessageType.ObjectRelease,
    RUNTIME_OBJECT_CODEC_CASES[2].metadata,
    RUNTIME_OBJECT_CODEC_CASES[2].tail,
  );
  nonZeroReserved[24] = 1;
  assertRuntimeObjectError(
    () => decodeRuntimeObjectMetadata(NnrpMessageType.ObjectRelease, nonZeroReserved),
    "NNRP_OBJECT_RESERVED_NONZERO",
  );

  const truncatedDeltaTail = encodeRuntimeObjectMetadata(
    NnrpMessageType.ObjectDelta,
    RUNTIME_OBJECT_CODEC_CASES[3].metadata,
    RUNTIME_OBJECT_CODEC_CASES[3].tail,
  ).slice(0, -1);
  assertRuntimeObjectError(
    () => decodeRuntimeObjectMetadata(NnrpMessageType.ObjectDelta, truncatedDeltaTail),
    "NNRP_OBJECT_TAIL_LENGTH_INVALID",
  );
});

Deno.test("@nnrp/core rejects reserved runtime object values and accepts private enums", () => {
  assertRuntimeObjectError(
    () =>
      encodeRuntimeObjectMetadata(NnrpMessageType.ObjectDeclare, {
        ...(RUNTIME_OBJECT_CODEC_CASES[0].metadata as unknown as Record<string, unknown>),
        objectId: 1 as unknown as bigint,
      } as unknown as RuntimeObjectMetadata, RUNTIME_OBJECT_CODEC_CASES[0].tail),
    "NNRP_OBJECT_INTEGER_INVALID",
  );
  assertRuntimeObjectError(
    () =>
      encodeRuntimeObjectMetadata(NnrpMessageType.ObjectRef, {
        ...(RUNTIME_OBJECT_CODEC_CASES[1].metadata as unknown as Record<string, unknown>),
        flags: 0x08,
      } as unknown as RuntimeObjectMetadata, RUNTIME_OBJECT_CODEC_CASES[1].tail),
    "NNRP_OBJECT_FLAGS_INVALID",
  );
  assertRuntimeObjectError(
    () =>
      encodeRuntimeObjectMetadata(NnrpMessageType.CacheMiss, {
        ...(RUNTIME_OBJECT_CODEC_CASES[5].metadata as unknown as Record<string, unknown>),
        missReason: 0x0008,
      } as unknown as RuntimeObjectMetadata, RUNTIME_OBJECT_CODEC_CASES[5].tail),
    "NNRP_OBJECT_ENUM_INVALID",
  );

  const privateDescriptor = {
    ...(RUNTIME_OBJECT_CODEC_CASES[0].metadata as unknown as Record<string, unknown>),
    objectKind: 0x8000,
    producerRole: 0x80,
    memoryLocationHint: 0x8001,
    ownershipHint: 0xffff,
  } as unknown as RuntimeObjectMetadata;
  const decoded = decodeRuntimeObjectMetadata(
    NnrpMessageType.ObjectDeclare,
    encodeRuntimeObjectMetadata(NnrpMessageType.ObjectDeclare, privateDescriptor, RUNTIME_OBJECT_CODEC_CASES[0].tail),
  );
  assertEquals(decoded.metadata, privateDescriptor);
});

Deno.test("@nnrp/core owns encoded and decoded runtime object tails", () => {
  const sourceTail = new Uint8Array([0x71, 0x72]);
  const encoded = encodeRuntimeObjectMetadata(
    NnrpMessageType.ObjectDeclare,
    RUNTIME_OBJECT_CODEC_CASES[0].metadata,
    sourceTail,
  );
  sourceTail[0] = 0xff;
  assertEquals(encoded.slice(48), new Uint8Array([0x71, 0x72]));

  const decoded = decodeRuntimeObjectMetadata(NnrpMessageType.ObjectDeclare, encoded);
  assertNotStrictEquals(decoded.tail.buffer, encoded.buffer);
  encoded[48] = 0xee;
  assertEquals(decoded.tail, new Uint8Array([0x71, 0x72]));
});

Deno.test("@nnrp/core encodes the frozen baseline cache invalidation metadata", () => {
  const metadata: CacheInvalidateMetadata = {
    invalidateScope: 3,
    cacheNamespace: 0x0102_0304,
    cacheKeyHi: 0x1112_1314,
    cacheKeyLo: 0x2122_2324,
    reasonCode: 0x3132_3334,
  };
  const encoded = encodeCacheInvalidateMetadata(metadata);
  const view = new DataView(encoded.buffer);
  assertEquals(encoded.byteLength, 20);
  assertEquals(view.getUint32(0, true), 3);
  assertEquals(view.getUint32(4, true), 0x0102_0304);
  assertEquals(view.getUint32(8, true), 0x1112_1314);
  assertEquals(view.getUint32(12, true), 0x2122_2324);
  assertEquals(view.getUint32(16, true), 0x3132_3334);
  assertEquals(decodeCacheInvalidateMetadata(encoded), metadata);

  assertRuntimeObjectError(
    () => encodeCacheInvalidateMetadata({ ...metadata, invalidateScope: 4 }),
    "NNRP_CACHE_INVALIDATE_SCOPE_INVALID",
  );
  assertRuntimeObjectError(
    () => decodeCacheInvalidateMetadata(new Uint8Array(19)),
    "NNRP_CACHE_INVALIDATE_LENGTH_INVALID",
  );
});

function assertRuntimeControlError(action: () => unknown, code: string): void {
  const error = assertThrows(action, NnrpProtocolError);
  assertEquals(error.diagnostic.code, code);
}

function assertRuntimeObjectError(action: () => unknown, code: string): void {
  const error = assertThrows(action, NnrpProtocolError);
  assertEquals(error.diagnostic.code, code);
}

function assertNumericEnum(
  enumObject: Record<string, string | number>,
  expected: readonly (readonly [string, number])[],
): void {
  const namedEntries = Object.entries(enumObject).filter(([name]) => Number.isNaN(Number(name)));
  assertEquals(
    namedEntries.map(([name, value]) => `${name}:${value}`),
    expected.map(([name, value]) => `${name}:${value}`),
  );
}

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

Deno.test("@nnrp/core keeps provider-local endpoints out of normalized operation payloads", () => {
  const normalized = normalizeSubmitRequest({
    frameId: 8,
    providerEndpoint: "unix:///tmp/nnrp.sock",
  } as unknown as NnrpSubmitRequest);

  assertEquals(normalized, { frameId: 8 });
  assertEquals("providerEndpoint" in normalized, false);
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
