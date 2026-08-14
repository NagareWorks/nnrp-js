import { assertEquals, assertInstanceOf, assertNotStrictEquals, assertThrows } from "jsr:@std/assert@1";
import {
  type CacheInvalidateMetadata,
  CacheLease,
  CacheLeaseOwnerScope,
  CacheMissReason,
  CacheReuseScope,
  createBackendNativeManifest,
  createBrowserWasmManifest,
  createCacheKey,
  createCapabilityManifest,
  createNnrpResultFromLifecycle,
  createNnrpResultFromRuntimeEvent,
  createRecoveryToken,
  createSchemaDescriptor,
  createTensorSubmitRequest,
  createTokenSubmitRequest,
  createTransportCandidates,
  createTransportSelectionSummary,
  createTypedPayloadSubmitRequest,
  decodeCacheInvalidateMetadata,
  type DecodedRuntimeObjectMetadata,
  decodeNnrpRuntimeEvent,
  decodeRuntimeControlMetadata,
  decodeRuntimeObjectMetadata,
  decodeSessionOpenMetadata,
  decodeSubmitPayload,
  decodeTypedPayloadDescriptor,
  encodeCacheInvalidateMetadata,
  encodeResultPushPayload,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  encodeRuntimeObjectMetadataSegments,
  encodeSessionOpenMetadata,
  encodeSubmitMetadata,
  encodeSubmitPayload,
  encodeTypedPayloadDescriptor,
  ErrorScope,
  isStandardInputProfile,
  MemoryLocationHint,
  NNRP_PROTOCOL_VERSION,
  NNRP_SESSION_OPEN_METADATA_BYTES,
  NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES,
  NNRP_TYPED_PAYLOAD_DESCRIPTOR_BYTES,
  NnrpBackpressureLevel,
  NnrpBudgetPolicy,
  type NnrpCacheInvalidateRequest,
  type NnrpCacheInvalidateResult,
  type NnrpCacheKey,
  NnrpCacheLeaseResult,
  type NnrpCacheMetadata,
  NnrpCacheObjectKind,
  NnrpCachePolicyOptions,
  type NnrpCachePutRequest,
  type NnrpCachePutResult,
  NnrpCapabilityError,
  type NnrpClientProviderRoutes,
  NnrpConnectionLifecycle,
  NnrpEndpoint,
  NnrpFlowScopeKind,
  NnrpFlowUpdateReason,
  NnrpHeaderFlags,
  NnrpInFlightPolicy,
  NnrpLossTolerancePolicy,
  NnrpMessageType,
  NnrpPayloadKind,
  NnrpProtocolError,
  NnrpProviderEndpoint,
  NnrpRecoveryError,
  NnrpResultClass,
  NnrpResultDropError,
  NnrpResultHintBudgetPolicy,
  NnrpResultHintCongestionState,
  NnrpResultHintReason,
  NnrpSchemaDescriptorFlags,
  NnrpSchemaRegistry,
  NnrpSchemaRegistryAction,
  NnrpSchemaRegistryFailure,
  type NnrpServerProviderRoutes,
  NnrpSessionCloseReason,
  NnrpSessionLifecycle,
  NnrpSessionPriorityClass,
  NnrpSessionRecoveryTicket,
  NnrpStandardProfile,
  NnrpStreamSemantics,
  type NnrpSubmitRequest,
  NnrpTensorInputProfile,
  NnrpTileIndexMode,
  NnrpTimeoutError,
  type NnrpTransportCandidate,
  type NnrpTransportCandidateReadiness,
  NnrpTransportError,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  type NnrpTransportProbeMetrics,
  type NnrpTransportProbeObservation,
  type NnrpTransportProviderDescriptor,
  type NnrpTransportProviderObservation,
  NnrpTransportSelectionError,
  NnrpTypedPayloadDescriptorFlags,
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
  tokenDeltaSchemaDescriptor,
  validateEventPollOptions,
  validateSessionMetadata,
} from "../src/index.ts";

function submitIdentity(operationId: bigint, frameId: number) {
  return {
    operationId,
    frameId,
    header: {
      flags: NnrpHeaderFlags.AckRequired,
      viewId: 3,
      routeId: 4,
      traceId: 5n,
    },
  };
}

function submitPolicy() {
  return {
    frameClass: 0,
    latencyBudgetMs: 17,
    targetFpsX100: 6_000,
    retryOfFrame: 0,
    budgetPolicy: NnrpBudgetPolicy.AllowDegraded,
    lossTolerancePolicy: NnrpLossTolerancePolicy.LowLatency,
    dependencyFrameId: 0,
  };
}

Deno.test("@nnrp/core round-trips canonical SESSION_OPEN metadata", () => {
  const metadata = {
    requestedSessionId: 7,
    profileId: 2,
    priorityClass: NnrpSessionPriorityClass.Interactive,
    sessionFlags: 0x0f,
    schemaId: 0x1001,
    schemaVersion: 3,
    defaultDeadlineMillis: 500,
    maxInFlightOperations: 4,
    leaseTtlHintMillis: 30_000,
    resumeTokenBytes: 24,
    authBytes: 5,
    sessionExtensionBytes: 6,
    clientSessionTag: 0x0102_0304_0506_0708n,
  };
  const encoded = encodeSessionOpenMetadata(metadata);
  assertEquals(encoded.byteLength, NNRP_SESSION_OPEN_METADATA_BYTES);
  assertEquals(decodeSessionOpenMetadata(encoded), metadata);

  const reserved = encoded.slice();
  reserved[22] = 1;
  assertThrows(() => decodeSessionOpenMetadata(reserved), RangeError, "reserved0");
  assertThrows(
    () => encodeSessionOpenMetadata({ ...metadata, sessionFlags: 0x10 }),
    RangeError,
    "reserved bits",
  );
  assertThrows(
    () => encodeSessionOpenMetadata({ ...metadata, priorityClass: 3 as NnrpSessionPriorityClass }),
    RangeError,
    "priorityClass",
  );
  assertThrows(
    () =>
      encodeSessionOpenMetadata({
        ...metadata,
        priorityClass: "Balanced" as unknown as NnrpSessionPriorityClass,
      }),
    RangeError,
    "priorityClass",
  );
  for (const sessionFlags of [Number.NaN, 1.5]) {
    assertThrows(
      () => encodeSessionOpenMetadata({ ...metadata, sessionFlags }),
      RangeError,
      "sessionFlags",
    );
  }
});

Deno.test("@nnrp/core persists runtime-issued recovery tickets canonically", () => {
  const encoded = new Uint8Array(NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES + 4);
  encoded.set([0x4e, 0x52, 0x54, 0x4b]);
  const view = new DataView(encoded.buffer);
  view.setUint16(4, 1, true);
  view.setUint16(6, 1, true);
  view.setUint32(8, 9, true);
  view.setUint32(12, 4, true);
  view.setUint32(16, 120_000, true);
  view.setBigUint64(20, 77n, true);
  encoded.set([1, 2, 3, 4], NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES);

  const ticket = NnrpSessionRecoveryTicket.fromBytes(encoded);
  assertEquals(ticket.sessionId, 9);
  assertEquals(ticket.resumeToken, new Uint8Array([1, 2, 3, 4]));
  assertEquals(ticket.resumeFromOperationId, 77n);
  assertEquals(ticket.resumeWindowMillis, 120_000);
  assertEquals(ticket.toBytes(), encoded);

  const exposedToken = ticket.resumeToken;
  exposedToken[0] = 99;
  assertEquals(ticket.resumeToken, new Uint8Array([1, 2, 3, 4]));
  assertEquals(ticket.toBytes(), encoded);

  const nonCanonical = encoded.slice();
  nonCanonical[6] = 0;
  assertThrows(() => NnrpSessionRecoveryTicket.fromBytes(nonCanonical), RangeError, "without its presence flag");
  assertThrows(() => NnrpSessionRecoveryTicket.fromBytes(encoded.subarray(0, encoded.length - 1)), RangeError);
});

Deno.test("@nnrp/core round-trips the current explicit-kind typed payload descriptor", () => {
  const descriptor = {
    profileId: 2,
    payloadKind: NnrpPayloadKind.TokenChunk,
    descriptorFlags: NnrpTypedPayloadDescriptorFlags.Partial,
    schemaId: 0x1001,
    schemaVersion: 3,
    streamSemantics: 2,
    offset: 8,
    length: 24,
  };
  const encoded = encodeTypedPayloadDescriptor(descriptor);

  assertEquals(encoded.byteLength, NNRP_TYPED_PAYLOAD_DESCRIPTOR_BYTES);
  assertEquals(
    Array.from(encoded),
    [2, 0, 2, 2, 1, 16, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 8, 0, 0, 0, 24, 0, 0, 0],
  );
  assertEquals(decodeTypedPayloadDescriptor(encoded), descriptor);
  assertThrows(
    () =>
      encodeTypedPayloadDescriptor({
        ...descriptor,
        payloadKind: 0x03 as NnrpPayloadKind,
      }),
    RangeError,
  );
});

Deno.test("@nnrp/core owns the frozen schema registry semantics", () => {
  const registry = new NnrpSchemaRegistry();
  const token = tokenDeltaSchemaDescriptor();

  assertEquals(registry.snapshot(), []);
  assertEquals(registry.install(token), NnrpSchemaRegistryAction.Installed);
  assertEquals(registry.install(token), NnrpSchemaRegistryAction.AlreadyInstalled);
  assertEquals(registry.lookup(token.schemaId, token.schemaVersion), token);
  registry.validateBinding({
    profileId: NnrpStandardProfile.Token,
    payloadKind: NnrpPayloadKind.TokenChunk,
    descriptorFlags: NnrpTypedPayloadDescriptorFlags.Partial,
    schemaId: token.schemaId,
    schemaVersion: token.schemaVersion,
    streamSemantics: NnrpStreamSemantics.Append,
    offset: 0,
    length: 4,
  });

  const snapshot = registry.snapshot();
  assertEquals(Object.isFrozen(snapshot), true);
  assertEquals(registry.invalidate(token.schemaId, token.schemaVersion), NnrpSchemaRegistryAction.Invalidated);
  const missing = assertThrows(() => registry.lookup(token.schemaId, token.schemaVersion), NnrpProtocolError);
  assertEquals(missing.diagnostic.cause, NnrpSchemaRegistryFailure.Unknown);
});

Deno.test("@nnrp/core rejects conflicting and incompatible schema bindings", () => {
  const token = tokenDeltaSchemaDescriptor();
  const registry = new NnrpSchemaRegistry([token]);
  const conflict = assertThrows(
    () => registry.install({ ...token, schemaHash: token.schemaHash + 1n }),
    NnrpProtocolError,
  );
  assertEquals(conflict.diagnostic.cause, NnrpSchemaRegistryFailure.HashConflict);
  const incompatible = assertThrows(
    () =>
      registry.validateBinding({
        profileId: NnrpStandardProfile.Tensor,
        payloadKind: NnrpPayloadKind.Tensor,
        descriptorFlags: NnrpTypedPayloadDescriptorFlags.None,
        schemaId: token.schemaId,
        schemaVersion: token.schemaVersion,
        streamSemantics: NnrpStreamSemantics.Snapshot,
        offset: 0,
        length: 4,
      }),
    NnrpProtocolError,
  );
  assertEquals(incompatible.diagnostic.cause, NnrpSchemaRegistryFailure.Incompatible);
  assertThrows(
    () =>
      registry.install({
        ...token,
        profileId: 99,
        schemaFlags: NnrpSchemaDescriptorFlags.None,
      }),
    NnrpProtocolError,
  );
});

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
] as const;

const PREVIEW4_OBJECT_CAPABILITIES = [
  "object.lifecycle",
  "object.delta",
  "object.cost",
  "object.ownership",
  "cache.reference",
] as const;

const DEFAULT_PROBE: NnrpTransportProbeMetrics = {
  sampleCount: 3,
  successCount: 3,
  medianThroughputBytesPerSecond: 1_000_000n,
  medianRttMicroseconds: 1_000n,
};

function transportProvider(
  kind: NnrpTransportKind,
  overrides: Partial<NnrpTransportProviderObservation> & {
    readonly id?: string;
    readonly preferenceRank?: number;
    readonly maxFrameBytes?: bigint;
    readonly costModelId?: number;
    readonly costUnits?: bigint;
  } = {},
): NnrpTransportProviderObservation {
  return {
    kind,
    metadata: {
      id: overrides.id ?? `nnrp.transport.${kind}.test`,
      cost: { modelId: overrides.costModelId ?? 0, units: overrides.costUnits ?? 0n },
      preferenceRank: overrides.preferenceRank ?? 0,
      limits: { maxFrameBytes: overrides.maxFrameBytes ?? 67_108_864n },
      limitations: [],
    },
    localAvailable: overrides.localAvailable ?? true,
    ...(overrides.diagnostic === undefined ? {} : { diagnostic: overrides.diagnostic }),
  };
}

function transportCandidate(
  kind: NnrpTransportKind,
  overrides: Partial<NnrpTransportCandidate> & {
    readonly probe?: NnrpTransportProbeMetrics;
    readonly id?: string;
    readonly preferenceRank?: number;
    readonly costModelId?: number;
    readonly costUnits?: bigint;
  } = {},
): NnrpTransportCandidate {
  const provider = transportProvider(kind, {
    id: overrides.id,
    preferenceRank: overrides.preferenceRank,
    costModelId: overrides.costModelId,
    costUnits: overrides.costUnits,
    localAvailable: overrides.localAvailable,
  });
  const probe = overrides.probe;
  return {
    transportId: kind,
    provider: provider.metadata,
    localAvailable: overrides.localAvailable ?? true,
    peerSupported: overrides.peerSupported ?? true,
    withinLimits: overrides.withinLimits ?? true,
    probeState: overrides.probeState ?? (probe === undefined ? "not-run" : "succeeded"),
    ...(probe === undefined ? {} : { probe }),
    ...(overrides.rejectionReason === undefined ? {} : { rejectionReason: overrides.rejectionReason }),
    ...(overrides.diagnostic === undefined ? {} : { diagnostic: overrides.diagnostic }),
  };
}

function readyCandidates(
  providers: readonly NnrpTransportProviderObservation[],
): readonly NnrpTransportCandidateReadiness[] {
  return providers.map((provider) => ({
    transportId: provider.kind,
    providerId: provider.metadata.id,
    routeResolved: true,
    securitySatisfied: true,
  }));
}

interface TestTransportCandidateInput {
  readonly local: { readonly transports: readonly NnrpTransportKind[] };
  readonly peer: { readonly transports: readonly NnrpTransportKind[] };
  readonly providers: readonly NnrpTransportProviderObservation[];
  readonly requestedMaxFrameBytes?: bigint;
  readonly candidateReadiness: readonly NnrpTransportCandidateReadiness[];
  readonly probeObservations?: readonly NnrpTransportProbeObservation[];
  readonly policy?: NnrpTransportPolicy;
}

function testProviderDescriptor(provider: NnrpTransportProviderObservation): NnrpTransportProviderDescriptor {
  return {
    name: `@nnrp/transport-${provider.kind}`,
    version: "test",
    transportId: provider.kind,
    kind: "native-dynamic",
    available: provider.localAvailable,
    metadata: provider.metadata,
    ...(provider.diagnostic === undefined ? {} : { diagnostic: provider.diagnostic.message }),
  };
}

function testTransportCandidates(input: TestTransportCandidateInput): readonly NnrpTransportCandidate[] {
  const providers = input.providers.map(testProviderDescriptor);
  return createTransportCandidates(providers, {
    peerSupportedTransports: input.peer.transports,
    policy: input.policy ?? "auto",
    ...(input.requestedMaxFrameBytes === undefined ? {} : { requestedMaxFrameBytes: input.requestedMaxFrameBytes }),
    candidateReadiness: input.candidateReadiness,
    probeObservations: input.probeObservations ?? [],
  });
}

function selectTestTransport(
  candidates: readonly NnrpTransportCandidate[],
  policy: NnrpTransportPolicy = "auto",
) {
  const providers: NnrpTransportProviderDescriptor[] = candidates.map((candidate) => ({
    name: `@nnrp/transport-${candidate.transportId}`,
    version: "test",
    transportId: candidate.transportId,
    kind: "native-dynamic",
    available: candidate.localAvailable,
    metadata: {
      ...candidate.provider,
      limits: {
        maxFrameBytes: candidate.withinLimits ? candidate.provider.limits.maxFrameBytes : 1n,
      },
    },
  }));
  const probeObservations: NnrpTransportProbeObservation[] = candidates.flatMap((candidate) =>
    candidate.probeState === "not-run" || candidate.probeState === "missing" ? [] : [{
      transportId: candidate.transportId,
      providerId: candidate.provider.id,
      state: candidate.probeState,
      ...(candidate.probe === undefined ? {} : { metrics: candidate.probe }),
      ...(candidate.diagnostic === undefined ? {} : { diagnostic: candidate.diagnostic }),
    }]
  );
  return selectTransport(providers, {
    peerSupportedTransports: candidates.filter((candidate) => candidate.peerSupported).map((candidate) =>
      candidate.transportId
    ),
    policy,
    requestedMaxFrameBytes: candidates.some((candidate) => !candidate.withinLimits) ? 2n : undefined,
    candidateReadiness: candidates.map((candidate) => ({
      transportId: candidate.transportId,
      providerId: candidate.provider.id,
      routeResolved: candidate.rejectionReason !== "route-unresolved",
      securitySatisfied: candidate.rejectionReason !== "security-unsatisfied",
      ...(candidate.diagnostic === undefined ? {} : { diagnostic: candidate.diagnostic }),
    })),
    probeObservations,
  });
}

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

Deno.test("@nnrp/core projects every runtime control frame into the frozen event union", () => {
  const metadataTypes = new Map<NnrpMessageType, string>([
    [NnrpMessageType.Cancel, "control_request"],
    [NnrpMessageType.Abort, "control_request"],
    [NnrpMessageType.PriorityUpdate, "scheduling"],
    [NnrpMessageType.Deadline, "scheduling"],
    [NnrpMessageType.ExpireAt, "scheduling"],
    [NnrpMessageType.Supersede, "supersede"],
    [NnrpMessageType.BudgetUpdate, "budget"],
    [NnrpMessageType.Progress, "progress"],
    [NnrpMessageType.PartialResult, "partial_result"],
    [NnrpMessageType.Backpressure, "pressure"],
    [NnrpMessageType.CreditUpdate, "pressure"],
    [NnrpMessageType.CapabilityNegotiation, "capability"],
    [NnrpMessageType.DegradeProfile, "capability"],
    [NnrpMessageType.RouteHint, "route_hint"],
    [NnrpMessageType.ExecutionHint, "route_hint"],
    [NnrpMessageType.TraceContext, "trace_context"],
    [NnrpMessageType.ResultDropReason, "result_drop_reason"],
    [NnrpMessageType.ErrorRecoverable, "recoverable_error"],
    [NnrpMessageType.RetryAfter, "retry_after"],
  ]);
  const diagnosticTypes = new Set([
    NnrpMessageType.Cancel,
    NnrpMessageType.Abort,
    NnrpMessageType.Supersede,
    NnrpMessageType.ResultDropReason,
    NnrpMessageType.ErrorRecoverable,
    NnrpMessageType.RetryAfter,
  ]);
  const bodyTypes = new Set([
    NnrpMessageType.Progress,
    NnrpMessageType.PartialResult,
    NnrpMessageType.CapabilityNegotiation,
    NnrpMessageType.DegradeProfile,
    NnrpMessageType.RouteHint,
    NnrpMessageType.ExecutionHint,
    NnrpMessageType.TraceContext,
  ]);

  for (const testCase of RUNTIME_CONTROL_CODEC_CASES) {
    for (const messageType of testCase.messageTypes) {
      const header = runtimeHeader(messageType, 100 + messageType);
      const event = decodeNnrpRuntimeEvent(
        header,
        encodeRuntimeControlMetadata(messageType, testCase.metadata, testCase.tail),
      );
      assertEquals(event.header, header);
      assertEquals(event.metadata.type, metadataTypes.get(messageType));
      assertEquals("value" in event.metadata ? event.metadata.value : undefined, testCase.metadata);
      assertEquals(
        event.tail.type,
        diagnosticTypes.has(messageType) ? "diagnostic" : bodyTypes.has(messageType) ? "body" : "none",
      );
      assertEquals(
        event.tail.type === "diagnostic"
          ? event.tail.diagnostic
          : event.tail.type === "body"
          ? event.tail.body
          : new Uint8Array(),
        testCase.tail,
      );
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
      cacheNamespace: 16,
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
    fixedLength: 56,
    tail: new Uint8Array([0x5b]),
  },
  {
    messageTypes: [NnrpMessageType.CacheMiss],
    metadata: {
      cacheNamespace: 22,
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

Deno.test("@nnrp/core projects every runtime object frame into the frozen event union", () => {
  const metadataTypes = new Map<NnrpMessageType, string>([
    [NnrpMessageType.ObjectDeclare, "object_descriptor"],
    [NnrpMessageType.ObjectRef, "object_reference"],
    [NnrpMessageType.ObjectRelease, "object_release"],
    [NnrpMessageType.ObjectPatch, "object_delta"],
    [NnrpMessageType.ObjectDelta, "object_delta"],
    [NnrpMessageType.CacheReference, "cache_reference"],
    [NnrpMessageType.CacheMiss, "cache_miss"],
  ]);

  for (const testCase of RUNTIME_OBJECT_CODEC_CASES) {
    for (const messageType of testCase.messageTypes) {
      const event = decodeNnrpRuntimeEvent(
        runtimeHeader(messageType, 200 + messageType),
        encodeRuntimeObjectMetadata(messageType, testCase.metadata, testCase.tail),
      );
      assertEquals(event.metadata.type, metadataTypes.get(messageType));
      assertEquals("value" in event.metadata ? event.metadata.value : undefined, testCase.metadata);
      if (messageType === NnrpMessageType.ObjectPatch || messageType === NnrpMessageType.ObjectDelta) {
        assertEquals(event.tail.type, "metadata_body_and_delta");
        if (event.tail.type === "metadata_body_and_delta") {
          assertEquals(event.tail.metadataBody, testCase.tail.slice(0, 2));
          assertEquals(event.tail.delta, testCase.tail.slice(2));
        }
      } else {
        const expectedTailType =
          messageType === NnrpMessageType.ObjectRelease || messageType === NnrpMessageType.CacheMiss
            ? "diagnostic"
            : "body";
        assertEquals(event.tail.type, expectedTailType);
      }
    }
  }
});

Deno.test("@nnrp/core decodes role frames and terminal evidence without flattening events", () => {
  const submit = createTokenSubmitRequest({
    identity: submitIdentity(71n, 72),
    policy: submitPolicy(),
    chunks: [{ payload: new Uint8Array([1, 2, 3]) }],
  });
  const submitEvent = decodeNnrpRuntimeEvent(
    runtimeHeader(NnrpMessageType.FrameSubmit, submit.frameId),
    encodeSubmitPayload(submit),
  );
  assertEquals(submitEvent.metadata.type, "frame_submit");
  assertEquals(submitEvent.tail.type, "body");
  if (submitEvent.metadata.type === "frame_submit") {
    assertEquals(submitEvent.metadata.value.operationId, 71n);
  }
  if (submitEvent.tail.type === "body") {
    assertEquals(submitEvent.tail.body, submit.body);
  }

  for (const messageType of [NnrpMessageType.FrameCancel, NnrpMessageType.ResultDrop]) {
    const event = decodeNnrpRuntimeEvent(runtimeHeader(messageType, 73), new Uint8Array());
    assertEquals(event.metadata.type, "none");
    assertEquals(event.tail.type, "none");
  }

  const resultMetadata = {
    statusCode: 200,
    resultFlags: 0,
    sectionCount: 0,
    tileCount: 0,
    activeProfileId: 2,
    inferenceMs: 3,
    queueMs: 4,
    serverTotalMs: 5,
    tileBaseId: 0,
    tileIndexBytes: 0,
    resultClass: NnrpResultClass.Complete,
    appliedBudgetPolicy: 0,
    reusedFrameId: 0,
    coveredTileCount: 0,
    droppedTileCount: 0,
    payloadKindBitmap: NnrpPayloadKind.TokenChunk,
    payloadFrameCount: 1,
  };
  const resultEvent = decodeNnrpRuntimeEvent(
    runtimeHeader(NnrpMessageType.ResultPush, 74),
    encodeResultPushPayload(resultMetadata, new Uint8Array([8, 9])),
  );
  assertEquals(resultEvent.metadata, { type: "result_push", value: resultMetadata });
  assertEquals(resultEvent.tail, { type: "body", body: new Uint8Array([8, 9]) });
  assertEquals(createNnrpResultFromRuntimeEvent(71n, resultEvent), {
    operationId: 71n,
    terminalState: "success",
    event: { type: "runtime", event: resultEvent },
  });

  const droppedEvent = decodeNnrpRuntimeEvent(
    runtimeHeader(NnrpMessageType.ResultDrop, 75),
    new Uint8Array(),
  );
  assertEquals(createNnrpResultFromRuntimeEvent(72n, droppedEvent).terminalState, "dropped");
  for (
    const [state, terminalState] of [
      ["completed", "success"],
      ["cancelled", "cancelled"],
      ["superseded", "dropped"],
      ["failed", "error"],
    ] as const
  ) {
    assertEquals(createNnrpResultFromLifecycle({ operationId: 73n, state }).terminalState, terminalState);
  }
});

Deno.test("@nnrp/core decodes session, hint, flow, and cache role events", () => {
  const sessionClosePayload = new Uint8Array(24);
  const sessionCloseView = new DataView(sessionClosePayload.buffer);
  sessionCloseView.setUint16(0, NnrpSessionCloseReason.ServerShutdown, true);
  sessionCloseView.setUint8(2, NnrpInFlightPolicy.Drain);
  sessionCloseView.setUint32(4, 250, true);
  sessionCloseView.setBigUint64(8, 91n, true);
  sessionCloseView.setUint32(16, 92, true);
  sessionCloseView.setUint32(20, 93, true);
  const sessionClose = decodeNnrpRuntimeEvent(
    runtimeHeader(NnrpMessageType.SessionClose, 0),
    sessionClosePayload,
  );
  assertEquals(sessionClose.metadata.type, "session_close");
  assertEquals(sessionClose.tail.type, "none");

  const hintPayload = new Uint8Array(16);
  const hintView = new DataView(hintPayload.buffer);
  hintView.setUint32(0, NnrpResultHintBudgetPolicy.Partial, true);
  hintView.setUint32(4, NnrpResultHintCongestionState.Elevated, true);
  hintView.setUint32(8, NnrpResultHintReason.ServerBusy, true);
  hintView.setUint32(12, 10, true);
  const hint = decodeNnrpRuntimeEvent(runtimeHeader(NnrpMessageType.ResultHint, 94), hintPayload);
  assertEquals(hint.metadata.type, "result_hint");

  const flowPayload = new Uint8Array(32);
  const flowView = new DataView(flowPayload.buffer);
  flowView.setUint8(0, NnrpFlowScopeKind.Operation);
  flowView.setUint8(1, NnrpFlowUpdateReason.Congestion);
  flowView.setUint8(2, NnrpBackpressureLevel.Hard);
  flowView.setUint16(8, 3, true);
  flowView.setBigUint64(12, 95n, true);
  flowView.setUint32(20, 11, true);
  flowView.setUint32(24, 12, true);
  flowView.setUint32(28, 0x02, true);
  const flow = decodeNnrpRuntimeEvent(runtimeHeader(NnrpMessageType.FlowUpdate, 95), flowPayload);
  assertEquals(flow.metadata.type, "flow_update");

  const cacheMetadata: CacheInvalidateMetadata = {
    invalidateScope: 3,
    cacheNamespace: 2,
    cacheKeyHi: 3n,
    cacheKeyLo: 4n,
    reasonCode: 5,
  };
  const cache = decodeNnrpRuntimeEvent(
    runtimeHeader(NnrpMessageType.CacheInvalidate, 96),
    encodeCacheInvalidateMetadata(cacheMetadata),
  );
  assertEquals(cache.metadata, { type: "cache_invalidate", value: cacheMetadata });
});

Deno.test("@nnrp/core rejects malformed role events and nonterminal result evidence", () => {
  assertRuntimeEventError(
    () =>
      decodeNnrpRuntimeEvent(
        { ...runtimeHeader(NnrpMessageType.ResultDrop, 1), versionMajor: 2 as 1 },
        new Uint8Array(),
      ),
    "NNRP_RUNTIME_HEADER_VERSION",
  );
  assertRuntimeEventError(
    () => decodeNnrpRuntimeEvent(runtimeHeader(NnrpMessageType.ClientHello, 1), new Uint8Array()),
    "NNRP_RUNTIME_MESSAGE_UNSUPPORTED",
  );
  assertRuntimeEventError(
    () => decodeNnrpRuntimeEvent(runtimeHeader(NnrpMessageType.FrameCancel, 1), new Uint8Array([1])),
    "NNRP_RUNTIME_PAYLOAD_UNEXPECTED",
  );
  assertRuntimeEventError(
    () => createNnrpResultFromLifecycle({ operationId: 1n, state: "running" }),
    "NNRP_LIFECYCLE_NOT_TERMINAL",
  );
  const hintPayload = new Uint8Array(16);
  const hint = decodeNnrpRuntimeEvent(runtimeHeader(NnrpMessageType.ResultHint, 1), hintPayload);
  assertRuntimeEventError(
    () => createNnrpResultFromRuntimeEvent(1n, hint),
    "NNRP_TERMINAL_EVENT_INVALID",
  );
  assertRuntimeEventError(
    () => createNnrpResultFromRuntimeEvent(0n, hint),
    "NNRP_OPERATION_ID_ZERO",
  );

  const resultMetadata = {
    statusCode: 0,
    resultFlags: 0,
    sectionCount: 0,
    tileCount: 0,
    activeProfileId: 0,
    inferenceMs: 0,
    queueMs: 0,
    serverTotalMs: 0,
    tileBaseId: 0,
    tileIndexBytes: 0,
    resultClass: NnrpResultClass.Complete,
    appliedBudgetPolicy: 0,
    reusedFrameId: 0,
    coveredTileCount: 0,
    droppedTileCount: 0,
    payloadKindBitmap: 0,
    payloadFrameCount: 0,
  };
  assertRuntimeEventError(
    () => encodeResultPushPayload(resultMetadata, null as unknown as Uint8Array),
    "NNRP_RESULT_BODY_INVALID",
  );
  assertRuntimeEventError(
    () => encodeResultPushPayload({ ...resultMetadata, resultFlags: 0x08 }),
    "NNRP_RESULT_FLAGS_INVALID",
  );
  assertRuntimeEventError(
    () => encodeResultPushPayload({ ...resultMetadata, payloadKindBitmap: 0x80 }),
    "NNRP_RESULT_PAYLOAD_KIND_INVALID",
  );
  assertRuntimeEventError(
    () => encodeResultPushPayload({ ...resultMetadata, tileCount: 1 }),
    "NNRP_RESULT_TENSOR_FIELDS_INVALID",
  );
  assertRuntimeEventError(
    () => encodeResultPushPayload({ ...resultMetadata, sectionCount: 1 }),
    "NNRP_RESULT_TENSOR_FIELDS_INVALID",
  );
  assertRuntimeEventError(
    () =>
      encodeResultPushPayload({
        ...resultMetadata,
        resultClass: NnrpResultClass.StaleReuse,
        reusedFrameId: 0,
      }),
    "NNRP_RESULT_STALE_REUSE_INVALID",
  );
  assertRuntimeEventError(
    () => encodeResultPushPayload({ ...resultMetadata, reusedFrameId: 1 }),
    "NNRP_RESULT_STALE_REUSE_INVALID",
  );
  assertRuntimeEventError(
    () =>
      encodeResultPushPayload({
        ...resultMetadata,
        resultClass: NnrpResultClass.Partial,
        payloadKindBitmap: NnrpPayloadKind.Tensor,
        tileCount: 1,
        coveredTileCount: 1,
      }),
    "NNRP_RESULT_PARTIAL_COVERAGE_INVALID",
  );
  assertRuntimeEventError(
    () =>
      encodeResultPushPayload({
        ...resultMetadata,
        payloadKindBitmap: NnrpPayloadKind.Tensor,
        tileCount: 2,
        coveredTileCount: 1,
      }),
    "NNRP_RESULT_TENSOR_COVERAGE_INVALID",
  );
  const reservedResult = encodeResultPushPayload(resultMetadata);
  reservedResult[10] = 1;
  assertRuntimeEventError(
    () => decodeNnrpRuntimeEvent(runtimeHeader(NnrpMessageType.ResultPush, 1), reservedResult),
    "NNRP_RESULT_METADATA_RESERVED",
  );
  assertRuntimeEventError(
    () =>
      decodeNnrpRuntimeEvent(
        runtimeHeader(NnrpMessageType.ResultPush, 1),
        null as unknown as Uint8Array,
      ),
    "NNRP_RUNTIME_PAYLOAD_INVALID",
  );

  const dropReasonCase = RUNTIME_CONTROL_CODEC_CASES.find((testCase) =>
    testCase.messageTypes.includes(NnrpMessageType.ResultDropReason)
  )!;
  const dropReasonEvent = decodeNnrpRuntimeEvent(
    runtimeHeader(NnrpMessageType.ResultDropReason, 2),
    encodeRuntimeControlMetadata(
      NnrpMessageType.ResultDropReason,
      dropReasonCase.metadata,
      dropReasonCase.tail,
    ),
  );
  assertEquals(createNnrpResultFromRuntimeEvent(2n, dropReasonEvent).terminalState, "dropped");

  const invalidFlow = new Uint8Array(32);
  const invalidFlowView = new DataView(invalidFlow.buffer);
  invalidFlowView.setUint8(0, NnrpFlowScopeKind.Operation);
  invalidFlowView.setUint8(1, NnrpFlowUpdateReason.Grant);
  invalidFlowView.setUint8(2, NnrpBackpressureLevel.None);
  invalidFlowView.setBigUint64(12, 1n, true);
  invalidFlowView.setUint32(28, 0x10, true);
  assertRuntimeEventError(
    () => decodeNnrpRuntimeEvent(runtimeHeader(NnrpMessageType.FlowUpdate, 3), invalidFlow),
    "NNRP_FLOW_FLAGS_INVALID",
  );
  invalidFlowView.setUint32(28, 0, true);
  invalidFlowView.setUint32(20, 1, true);
  assertRuntimeEventError(
    () => decodeNnrpRuntimeEvent(runtimeHeader(NnrpMessageType.FlowUpdate, 3), invalidFlow),
    "NNRP_FLOW_RETRY_FLAG_MISSING",
  );
  invalidFlowView.setUint32(20, 0, true);
  invalidFlowView.setBigUint64(12, 0n, true);
  assertRuntimeEventError(
    () => decodeNnrpRuntimeEvent(runtimeHeader(NnrpMessageType.FlowUpdate, 3), invalidFlow),
    "NNRP_FLOW_SCOPE_INVALID",
  );

  const reservedSessionClose = new Uint8Array(24);
  reservedSessionClose[3] = 1;
  assertRuntimeEventError(
    () => decodeNnrpRuntimeEvent(runtimeHeader(NnrpMessageType.SessionClose, 0), reservedSessionClose),
    "NNRP_SESSION_CLOSE_RESERVED",
  );
});

Deno.test("@nnrp/core encodes ordered runtime object tail segments without an intermediate tail", () => {
  const metadataBody = new Uint8Array([0x51, 0x52]);
  const delta = new Uint8Array([0x61, 0x62, 0x63]);
  const encoded = encodeRuntimeObjectMetadataSegments(
    NnrpMessageType.ObjectDelta,
    RUNTIME_OBJECT_CODEC_CASES[3].metadata,
    [metadataBody, delta],
  );

  metadataBody.fill(0xff);
  delta.fill(0xee);
  assertEquals(
    decodeRuntimeObjectMetadata(NnrpMessageType.ObjectDelta, encoded).tail,
    new Uint8Array([0x51, 0x52, 0x61, 0x62, 0x63]),
  );
  assertRuntimeObjectError(
    () =>
      encodeRuntimeObjectMetadataSegments(
        NnrpMessageType.ObjectDelta,
        RUNTIME_OBJECT_CODEC_CASES[3].metadata,
        [new Uint8Array(5), null as unknown as Uint8Array],
      ),
    "NNRP_OBJECT_TAIL_INVALID",
  );
  assertRuntimeObjectError(
    () =>
      encodeRuntimeObjectMetadataSegments(
        NnrpMessageType.ObjectDelta,
        RUNTIME_OBJECT_CODEC_CASES[3].metadata,
        [new Uint8Array(3), new Uint8Array(2)],
      ),
    "NNRP_OBJECT_TAIL_LENGTH_INVALID",
  );
  assertRuntimeObjectError(
    () =>
      encodeRuntimeObjectMetadataSegments(
        NnrpMessageType.ObjectDelta,
        RUNTIME_OBJECT_CODEC_CASES[3].metadata,
        [new Uint8Array(5)],
      ),
    "NNRP_OBJECT_TAIL_INVALID",
  );
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
  assertEquals(cacheView.getUint32(0, true), 16);
  assertEquals(cacheView.getUint16(4, true), 19);
  assertEquals(cacheView.getUint16(6, true), CacheReuseScope.Session);
  assertEquals(cacheView.getBigUint64(8, true), 17n);
  assertEquals(cacheView.getBigUint64(16, true), 18n);
  assertEquals(cacheView.getBigUint64(24, true), 20n);
  assertEquals(cacheView.getBigUint64(32, true), 21n);
  assertEquals(cacheView.getUint32(48, true), 0x03);
  assertEquals(cacheView.getUint32(52, true), 0);
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

Deno.test("@nnrp/core keeps public runtime object and cache descriptors structured-clone compatible", () => {
  const cacheKey: NnrpCacheKey = {
    kind: NnrpCacheObjectKind.TensorSectionTable,
    key: 7n,
    namespaceId: 3,
  };
  const cacheMetadata: NnrpCacheMetadata = {
    key: cacheKey,
    version: 8n,
    leaseMillis: 1_000,
    dependencies: [{ kind: NnrpCacheObjectKind.StructuredEventSchema, key: "image-tile-v1" }],
  };
  const cachePutRequest: NnrpCachePutRequest = {
    key: cacheKey,
    payload: new Uint8Array([0x81, 0x82]),
    leaseMillis: 1_000,
    metadata: { producer: "runtime" },
  };
  const cachePutResult: NnrpCachePutResult = {
    key: cacheKey,
    status: "stored",
    version: 9n,
    metadata: { tier: "device" },
  };
  const cacheInvalidateRequest: NnrpCacheInvalidateRequest = {
    key: cacheKey,
    version: 9n,
    recursive: true,
    metadata: { reason: "superseded" },
  };
  const cacheInvalidateResult: NnrpCacheInvalidateResult = {
    key: cacheKey,
    status: "invalidated",
    metadata: { scope: "session" },
  };
  const decodedObject: DecodedRuntimeObjectMetadata = {
    metadata: RUNTIME_OBJECT_CODEC_CASES[0].metadata,
    tail: RUNTIME_OBJECT_CODEC_CASES[0].tail,
  };
  const cacheInvalidate: CacheInvalidateMetadata = {
    invalidateScope: 3,
    cacheNamespace: 2,
    cacheKeyHi: 3n,
    cacheKeyLo: 4n,
    reasonCode: 5,
  };
  const publicValues: readonly unknown[] = [
    ...RUNTIME_OBJECT_CODEC_CASES.map(({ metadata }) => metadata),
    decodedObject,
    cacheInvalidate,
    cacheKey,
    cacheMetadata,
    cachePutRequest,
    cachePutResult,
    cacheInvalidateRequest,
    cacheInvalidateResult,
  ];

  for (const value of publicValues) {
    assertEquals(structuredClone(value), value);
  }
});

Deno.test("@nnrp/core transfers owned runtime object tails without invalidating metadata", () => {
  const encoded = encodeRuntimeObjectMetadata(
    NnrpMessageType.ObjectDelta,
    RUNTIME_OBJECT_CODEC_CASES[3].metadata,
    RUNTIME_OBJECT_CODEC_CASES[3].tail,
  );
  const decoded = decodeRuntimeObjectMetadata(NnrpMessageType.ObjectDelta, encoded);
  const retainedMetadata = structuredClone(decoded.metadata);
  const expectedTail = decoded.tail.slice();
  const transferred = structuredClone(decoded, { transfer: [decoded.tail.buffer as ArrayBuffer] });

  assertEquals(decoded.metadata, retainedMetadata);
  assertEquals(decoded.tail.byteLength, 0);
  assertEquals(transferred.metadata, retainedMetadata);
  assertEquals(transferred.tail, expectedTail);
  assertNotStrictEquals(transferred.tail.buffer, encoded.buffer);
});

Deno.test("@nnrp/core encodes the frozen baseline cache invalidation metadata", () => {
  const metadata: CacheInvalidateMetadata = {
    invalidateScope: 3,
    cacheNamespace: 0x0102_0304,
    cacheKeyHi: 0x1112_1314_1516_1718n,
    cacheKeyLo: 0x2122_2324_2526_2728n,
    reasonCode: 0x3132_3334,
  };
  const encoded = encodeCacheInvalidateMetadata(metadata);
  const view = new DataView(encoded.buffer);
  assertEquals(encoded.byteLength, 32);
  assertEquals(view.getUint32(0, true), 3);
  assertEquals(view.getUint32(4, true), 0x0102_0304);
  assertEquals(view.getBigUint64(8, true), 0x1112_1314_1516_1718n);
  assertEquals(view.getBigUint64(16, true), 0x2122_2324_2526_2728n);
  assertEquals(view.getUint32(24, true), 0x3132_3334);
  assertEquals(view.getUint32(28, true), 0);
  assertEquals(decodeCacheInvalidateMetadata(encoded), metadata);

  assertRuntimeObjectError(
    () =>
      encodeCacheInvalidateMetadata({
        ...metadata,
        invalidateScope: 4 as CacheInvalidateMetadata["invalidateScope"],
      }),
    "NNRP_CACHE_INVALIDATE_SCOPE_INVALID",
  );
  assertRuntimeObjectError(
    () => decodeCacheInvalidateMetadata(new Uint8Array(31)),
    "NNRP_CACHE_INVALIDATE_LENGTH_INVALID",
  );

  const nonZeroReserved = encoded.slice();
  nonZeroReserved[28] = 1;
  assertRuntimeObjectError(
    () => decodeCacheInvalidateMetadata(nonZeroReserved),
    "NNRP_CACHE_INVALIDATE_RESERVED_NONZERO",
  );
  assertRuntimeObjectError(
    () =>
      encodeCacheInvalidateMetadata({
        invalidateScope: 1,
        cacheNamespace: 1,
        cacheKeyHi: 1n,
        cacheKeyLo: 0n,
        reasonCode: 0,
      }),
    "NNRP_CACHE_INVALIDATE_IDENTITY_INVALID",
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

function assertRuntimeEventError(action: () => unknown, code: string): void {
  const error = assertThrows(action, NnrpProtocolError);
  assertEquals(error.diagnostic.code, code);
}

function malformedSubmitBody(source: Uint8Array, offset: number, value: number): Uint8Array {
  const body = source.slice();
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const previous = view.getUint32(offset, true);
  view.setUint32(offset, value, true);
  view.setUint32(12, view.getUint32(12, true) + previous - value, true);
  return body;
}

function runtimeHeader(messageType: NnrpMessageType, frameId: number) {
  return {
    versionMajor: 1 as const,
    wireFormat: 0 as const,
    messageType,
    flags: 0,
    sessionId: 1,
    frameId,
    viewId: 2,
    routeId: 3,
    traceId: 4n,
  };
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
  assertEquals((manifest.capabilities as readonly string[]).includes("control.retry_after"), false);
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

Deno.test("@nnrp/core selects the sole eligible provider without probe metrics", () => {
  const selection = selectTestTransport([transportCandidate("tcp")]);

  assertEquals(selection.selectedProvider.name, "@nnrp/transport-tcp");
  assertEquals(selection.selectedProvider.transportId, "tcp");
  assertEquals(selection.candidates[0]?.probeState, "not-run");
  assertEquals(selection.candidates[0]?.selectionRank, 0);
});

Deno.test("@nnrp/core orders probes by success count, throughput, and RTT", () => {
  const selection = selectTestTransport([
    transportCandidate("quic", {
      probe: { ...DEFAULT_PROBE, successCount: 2, medianThroughputBytesPerSecond: 9_000_000n },
    }),
    transportCandidate("tcp", { probe: { ...DEFAULT_PROBE, medianThroughputBytesPerSecond: 2_000_000n } }),
    transportCandidate("ipc", {
      probe: { ...DEFAULT_PROBE, medianThroughputBytesPerSecond: 2_000_000n, medianRttMicroseconds: 10n },
    }),
  ]);

  assertEquals(selection.selectedProvider.transportId, "ipc");
  assertEquals(selection.candidates.map((candidate) => candidate.transportId), ["ipc", "tcp", "quic"]);
  assertEquals(selection.candidates.map((candidate) => candidate.selectionRank), [0, 1, 2]);
});

Deno.test("@nnrp/core uses numeric transport id as the final cross-transport tie", () => {
  const selection = selectTestTransport([
    transportCandidate("websocket", { probe: DEFAULT_PROBE, id: "provider-websocket" }),
    transportCandidate("tcp", { probe: DEFAULT_PROBE, id: "provider-tcp" }),
    transportCandidate("quic", { probe: DEFAULT_PROBE, id: "provider-quic" }),
    transportCandidate("ipc", { probe: DEFAULT_PROBE, id: "provider-ipc" }),
  ]);

  assertEquals(selection.candidates.map((candidate) => candidate.transportId), ["quic", "tcp", "ipc", "websocket"]);
});

Deno.test("@nnrp/core applies every preferred transport policy", () => {
  const candidates = [
    transportCandidate("quic", { probe: DEFAULT_PROBE }),
    transportCandidate("tcp", { probe: DEFAULT_PROBE }),
    transportCandidate("ipc", { probe: DEFAULT_PROBE }),
    transportCandidate("websocket", { probe: DEFAULT_PROBE }),
  ] as const;

  assertEquals(selectTestTransport(candidates, "prefer-quic").selectedProvider.transportId, "quic");
  assertEquals(selectTestTransport(candidates, "prefer-tcp").selectedProvider.transportId, "tcp");
  assertEquals(selectTestTransport(candidates, "prefer-ipc").selectedProvider.transportId, "ipc");
  assertEquals(selectTestTransport(candidates, "prefer-websocket").selectedProvider.transportId, "websocket");
});

Deno.test("@nnrp/core preferred policies fall back when the preferred carrier is unavailable", () => {
  const selection = selectTestTransport(
    [
      transportCandidate("ipc", { peerSupported: false, probe: DEFAULT_PROBE }),
      transportCandidate("tcp", { probe: DEFAULT_PROBE }),
      transportCandidate("websocket", { probe: DEFAULT_PROBE }),
    ],
    "prefer-ipc",
  );

  assertEquals(selection.selectedProvider.transportId, "tcp");
  assertEquals(selection.candidates.map((candidate) => candidate.transportId), ["tcp", "websocket", "ipc"]);
});

Deno.test("@nnrp/core applies every forced transport policy", () => {
  const candidates = [
    transportCandidate("quic", { probe: DEFAULT_PROBE }),
    transportCandidate("tcp", { probe: DEFAULT_PROBE }),
    transportCandidate("ipc", { probe: DEFAULT_PROBE }),
    transportCandidate("websocket", { probe: DEFAULT_PROBE }),
  ] as const;

  assertEquals(selectTestTransport(candidates, "force-quic").selectedProvider.transportId, "quic");
  assertEquals(selectTestTransport(candidates, "force-tcp").selectedProvider.transportId, "tcp");
  assertEquals(selectTestTransport(candidates, "force-ipc").selectedProvider.transportId, "ipc");
  assertEquals(selectTestTransport(candidates, "force-websocket").selectedProvider.transportId, "websocket");
});

Deno.test("@nnrp/core throws typed evidence for an unavailable forced provider", () => {
  const error = assertThrows(
    () => selectTestTransport([transportCandidate("tcp")], "force-ipc"),
    NnrpTransportSelectionError,
  );

  assertEquals(error.code, "FORCED_TRANSPORT_UNAVAILABLE");
  assertEquals(error.transportId, "ipc");
  assertEquals(error.candidates[0]?.rejectionReason, "policy-disallowed");
});

Deno.test("@nnrp/core accepts zero frame requests and duplicate peer transport set entries", () => {
  const provider = testProviderDescriptor(transportProvider("tcp"));
  const candidates = createTransportCandidates([provider], {
    peerSupportedTransports: ["tcp", "tcp"],
    policy: "auto",
    requestedMaxFrameBytes: 0n,
    candidateReadiness: [{
      transportId: "tcp",
      providerId: provider.metadata.id,
      routeResolved: true,
      securitySatisfied: true,
    }],
    probeObservations: [],
  });

  assertEquals(candidates[0]?.peerSupported, true);
  assertEquals(candidates[0]?.withinLimits, true);
  assertEquals(candidates[0]?.probeState, "not-run");
});

Deno.test("@nnrp/core rejects requested frame sizes outside the frozen u64 range", () => {
  const provider = testProviderDescriptor(transportProvider("tcp"));
  const options = {
    peerSupportedTransports: ["tcp"] as const,
    policy: "auto" as const,
    candidateReadiness: [{
      transportId: "tcp" as const,
      providerId: provider.metadata.id,
      routeResolved: true,
      securitySatisfied: true,
    }],
    probeObservations: [],
  };

  for (const requestedMaxFrameBytes of [-1n, 0x1_0000_0000_0000_0000n]) {
    const error = assertThrows(
      () => createTransportCandidates([provider], { ...options, requestedMaxFrameBytes }),
      NnrpTransportError,
    );
    assertEquals(error.diagnostic.code, "NNRP_TRANSPORT_REQUESTED_FRAME_LIMIT_INVALID");
  }
});

Deno.test("@nnrp/core creates transport candidates from local and peer manifests", () => {
  const local = createBackendNativeManifest(["transport.tcp"]);
  const peer = createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp"],
    capabilities: ["client.session"],
  });

  const providers = [transportProvider("tcp"), transportProvider("quic")];
  const candidates = testTransportCandidates({
    local,
    peer,
    providers,
    candidateReadiness: readyCandidates(providers),
  });
  const selection = selectTestTransport(candidates);
  const summary = createTransportSelectionSummary(selection);

  assertEquals(selection.selectedProvider.transportId, "tcp");
  assertEquals(summary.selected, "tcp");
  assertEquals(summary.rejected[0]?.transportId, "quic");
  assertEquals(summary.rejected[0]?.reason, "peer-unsupported");
});

Deno.test("@nnrp/core reports policy-disallowed transport candidates", () => {
  const selection = selectTestTransport(
    [
      transportCandidate("quic", { probe: DEFAULT_PROBE }),
      transportCandidate("tcp", { probe: DEFAULT_PROBE }),
    ],
    "force-tcp",
  );
  const summary = createTransportSelectionSummary(selection);

  assertEquals(selection.selectedProvider.transportId, "tcp");
  assertEquals(summary.rejected[0]?.reason, "policy-disallowed");
});

Deno.test("@nnrp/core keeps provider locators and role security isolated by route", () => {
  const clientRoutes: NnrpClientProviderRoutes = {
    tcp: {
      endpoint: NnrpProviderEndpoint.parse("tcp://runtime.example:7443"),
      security: {
        mode: "client",
        serverName: "runtime.example",
        trustedCertificateDer: new Uint8Array([1, 2, 3]),
      },
    },
    ipc: { endpoint: NnrpProviderEndpoint.parse("unix:///run/nnrp.sock") },
  };
  const serverRoutes: NnrpServerProviderRoutes = {
    quic: {
      endpoint: NnrpProviderEndpoint.parse("quic://0.0.0.0:7443"),
      security: {
        mode: "server",
        certificateDer: new Uint8Array([4, 5, 6]),
        privateKeyPkcs8Der: new Uint8Array([7, 8, 9]),
      },
    },
    websocket: { endpoint: NnrpProviderEndpoint.parse("wss://0.0.0.0:8443/nnrp") },
  };

  assertEquals(clientRoutes.tcp?.security?.mode, "client");
  assertEquals(clientRoutes.ipc?.endpoint?.uri, "unix:///run/nnrp.sock");
  assertEquals(serverRoutes.quic?.security?.mode, "server");
  assertEquals(serverRoutes.websocket?.endpoint?.uri, "wss://0.0.0.0:8443/nnrp");
});

Deno.test("@nnrp/core applies frozen route and security rejection precedence", () => {
  const routeFailure = transportCandidate("tcp", { rejectionReason: "route-unresolved" });
  const securityFailure = transportCandidate("quic", { rejectionReason: "security-unsatisfied" });

  const reason = (candidate: NnrpTransportCandidate, policy: NnrpTransportPolicy = "auto") => {
    const error = assertThrows(() => selectTestTransport([candidate], policy), NnrpTransportSelectionError);
    return error.candidates[0]?.rejectionReason;
  };

  assertEquals(reason(routeFailure), "route-unresolved");
  assertEquals(reason(securityFailure), "security-unsatisfied");
  assertEquals(reason({ ...routeFailure, localAvailable: false }), "local-unavailable");
  assertEquals(reason({ ...routeFailure, peerSupported: false }), "peer-unsupported");
  assertEquals(reason({ ...securityFailure, withinLimits: false }), "limit-exceeded");
  assertEquals(reason(routeFailure, "force-quic"), "policy-disallowed");
});

Deno.test("@nnrp/core rejects over-limit and missing-probe candidates", () => {
  const local = createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp", "quic", "ipc"],
  });
  const peer = createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp", "quic", "ipc"],
    capabilities: ["client.session"],
  });
  const providers = [
    transportProvider("tcp", { maxFrameBytes: 1_024n }),
    transportProvider("quic", { maxFrameBytes: 4_096n }),
    transportProvider("ipc", { maxFrameBytes: 4_096n }),
  ];
  const error = assertThrows(() =>
    selectTestTransport(testTransportCandidates({
      local,
      peer,
      requestedMaxFrameBytes: 2_048n,
      providers,
      candidateReadiness: readyCandidates(providers),
    })), NnrpTransportSelectionError);

  assertEquals(error.code, "NO_VIABLE_TRANSPORT");
  assertEquals(error.candidates.map((candidate) => [candidate.transportId, candidate.rejectionReason]), [
    ["quic", "probe-missing"],
    ["tcp", "limit-exceeded"],
    ["ipc", "probe-missing"],
  ]);
});

Deno.test("@nnrp/core compares cost only inside the same non-zero model", () => {
  const selection = selectTestTransport([
    transportCandidate("tcp", { probe: DEFAULT_PROBE, costModelId: 7, costUnits: 20n }),
    transportCandidate("quic", { probe: DEFAULT_PROBE, costModelId: 7, costUnits: 10n }),
  ]);
  assertEquals(selection.selectedProvider.transportId, "quic");
});

Deno.test("@nnrp/core ignores probes for a sole provider and rejects failed probes in a probe set", () => {
  const failed = selectTestTransport([transportCandidate("tcp", { probeState: "failed" })]);
  assertEquals(failed.selectedProvider.transportId, "tcp");
  assertEquals(failed.candidates[0]?.probeState, "not-run");

  const probed = selectTestTransport([
    transportCandidate("tcp", { probeState: "failed" }),
    transportCandidate("quic", { probe: DEFAULT_PROBE }),
  ]);
  assertEquals(probed.selectedProvider.transportId, "quic");
  assertEquals(probed.candidates[1]?.rejectionReason, "probe-failed");
});

Deno.test("@nnrp/core rejects invalid provider observations and probe metrics", () => {
  const local = createBackendNativeManifest();
  const peer = createBackendNativeManifest();
  const metadataError = assertThrows(
    () =>
      testTransportCandidates({
        local,
        peer,
        providers: [transportProvider("tcp", { preferenceRank: 0x1_0000 })],
        candidateReadiness: [],
      }),
    NnrpTransportError,
  );
  assertEquals(metadataError.diagnostic.code, "NNRP_TRANSPORT_PROVIDER_METADATA_INVALID");

  const costModelError = assertThrows(
    () =>
      testTransportCandidates({
        local,
        peer,
        providers: [transportProvider("tcp", { costModelId: 0x1_0000 })],
        candidateReadiness: [],
      }),
    NnrpTransportError,
  );
  assertEquals(costModelError.diagnostic.code, "NNRP_TRANSPORT_PROVIDER_METADATA_INVALID");

  for (
    const invalidProvider of [
      transportProvider("tcp", { id: "nnrp.transport.tcp.\u8f93\u5165" }),
      transportProvider("tcp", { costModelId: 0, costUnits: 1n }),
    ]
  ) {
    const invalidMetadataError = assertThrows(
      () =>
        testTransportCandidates({
          local,
          peer,
          providers: [invalidProvider],
          candidateReadiness: [],
        }),
      NnrpTransportError,
    );
    assertEquals(invalidMetadataError.diagnostic.code, "NNRP_TRANSPORT_PROVIDER_METADATA_INVALID");
  }

  const provider = transportProvider("tcp");
  const metricsError = assertThrows(
    () =>
      testTransportCandidates({
        local,
        peer,
        providers: [provider],
        candidateReadiness: readyCandidates([provider]),
        probeObservations: [{
          transportId: "tcp",
          providerId: provider.metadata.id,
          state: "succeeded",
          metrics: { ...DEFAULT_PROBE, successCount: 4 },
        }],
      }),
    NnrpTransportError,
  );
  assertEquals(metricsError.diagnostic.code, "NNRP_TRANSPORT_PROBE_METRICS_INVALID");
});

Deno.test("@nnrp/core rejects incomplete, duplicate, and unmatched transport evidence", () => {
  const local = createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp", "quic"],
  });
  const peer = createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp", "quic"],
  });
  const providers = [transportProvider("tcp"), transportProvider("quic")];
  const readiness = readyCandidates(providers);
  const assertInvalidEvidence = (operation: () => unknown) => {
    const error = assertThrows(operation, NnrpTransportSelectionError);
    assertEquals(error.code, "INVALID_EVIDENCE");
    assertEquals(error.candidates, []);
  };

  assertInvalidEvidence(() => testTransportCandidates({ local, peer, providers, candidateReadiness: [] }));
  assertInvalidEvidence(() =>
    testTransportCandidates({ local, peer, providers, candidateReadiness: [readiness[0]!, readiness[0]!] })
  );
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers,
      candidateReadiness: [
        readiness[0]!,
        { ...readiness[1]!, providerId: "nnrp.transport.unknown" },
      ],
    })
  );
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers,
      candidateReadiness: [
        { ...readiness[0]!, diagnostic: { code: "not-a-string" } } as unknown as typeof readiness[number],
        readiness[1]!,
      ],
    })
  );
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers,
      candidateReadiness: [readiness[0]!, { ...readiness[1]!, providerId: "nnrp.transport.\u8f93\u5165" }],
    })
  );
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers,
      candidateReadiness: readiness,
      probeObservations: [{ transportId: "tcp", providerId: "nnrp.transport.unknown", state: "failed" }],
    })
  );
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers,
      candidateReadiness: readiness,
      probeObservations: [{ transportId: "tcp", providerId: "nnrp.transport.\u8f93\u5165", state: "failed" }],
    })
  );
  const failedProbe = { transportId: "tcp", providerId: providers[0]!.metadata.id, state: "failed" } as const;
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers,
      candidateReadiness: readiness,
      probeObservations: [failedProbe, failedProbe],
    })
  );
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers,
      candidateReadiness: readiness,
      probeObservations: [{ ...failedProbe, metrics: DEFAULT_PROBE }],
    })
  );
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers,
      candidateReadiness: readiness,
      probeObservations: [{ ...failedProbe, state: "succeeded" }],
    })
  );
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers,
      candidateReadiness: readiness,
      probeObservations: [
        { ...failedProbe, diagnostic: { code: "not-a-string" } } as unknown as typeof failedProbe,
      ],
    })
  );
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers: [providers[0]!, transportProvider("tcp", { id: "nnrp.transport.tcp.other" })],
      candidateReadiness: readiness,
    })
  );
  assertInvalidEvidence(() =>
    testTransportCandidates({
      local,
      peer,
      providers: [providers[0]!, transportProvider("quic", { id: providers[0]!.metadata.id })],
      candidateReadiness: readiness,
    })
  );
  assertInvalidEvidence(() =>
    selectTestTransport([
      transportCandidate("tcp", { id: "nnrp.transport.tcp.first" }),
      transportCandidate("tcp", { id: "nnrp.transport.tcp.second" }),
    ])
  );
});

Deno.test("@nnrp/core preserves failed and missing probe evidence as distinct diagnostics", () => {
  const local = createCapabilityManifest({ buildMode: "backend-native", transports: ["tcp", "quic"] });
  const peer = createCapabilityManifest({ buildMode: "backend-native", transports: ["tcp", "quic"] });
  const providers = [transportProvider("tcp"), transportProvider("quic")];
  const error = assertThrows(
    () =>
      selectTestTransport(testTransportCandidates({
        local,
        peer,
        providers,
        candidateReadiness: readyCandidates(providers),
        probeObservations: [{
          transportId: "tcp",
          providerId: providers[0]!.metadata.id,
          state: "failed",
          diagnostic: "tcp probe failed",
        }],
      })),
    NnrpTransportSelectionError,
  );

  assertEquals(error.code, "NO_VIABLE_TRANSPORT");
  assertEquals(error.candidates.map((candidate) => [candidate.transportId, candidate.rejectionReason]), [
    ["quic", "probe-missing"],
    ["tcp", "probe-failed"],
  ]);
});

Deno.test("@nnrp/core parses application endpoints without losing URL semantics", () => {
  const endpoint = parseApplicationEndpoint("nnrps://runtime.example:7443/session/default?tenant=a#result");

  assertEquals(endpoint.protocol, "nnrps:");
  assertEquals(endpoint.host, "runtime.example:7443");
  assertEquals(endpoint.pathname, "/session/default");
  assertEquals(endpoint.search, "?tenant=a");
  assertEquals(endpoint.hash, "#result");
  assertEquals(endpoint.uri, "nnrps://runtime.example:7443/session/default?tenant=a#result");
  assertEquals(endpoint.secure, true);
});

Deno.test("@nnrp/core validates provider endpoint values independently from application endpoints", () => {
  const ipc = NnrpProviderEndpoint.parse("unix:///tmp/nnrp.sock");
  assertEquals(ipc.scheme, "unix");
  assertEquals(ipc.matchesTransport("ipc"), true);
  assertEquals(ipc.matchesTransport("tcp"), false);
  assertEquals(NnrpProviderEndpoint.parse("wss://runtime.example/nnrp").secure, true);
  assertThrows(() => NnrpProviderEndpoint.parse("nnrp://runtime.example"), NnrpTransportError);
  assertThrows(() => NnrpProviderEndpoint.parse("unix://"), NnrpTransportError);
});

Deno.test("@nnrp/core rejects empty, malformed, and provider-local application endpoints", () => {
  for (const endpoint of ["", "not a URL", "ws://runtime.example/nnrp", "unix:///tmp/nnrp.sock", "nnrp:///path"]) {
    const error = assertThrows(() => parseApplicationEndpoint(endpoint), NnrpProtocolError);
    assertEquals(error.diagnostic.code, "NNRP_APPLICATION_ENDPOINT_INVALID");
  }
});

Deno.test("@nnrp/core derives TCP and QUIC provider endpoints", () => {
  assertEquals(resolveProviderEndpoint(NnrpEndpoint.parse("nnrp://127.0.0.1:7443/session"), "tcp"), "127.0.0.1:7443");
  assertEquals(
    resolveProviderEndpoint(NnrpEndpoint.parse("nnrps://runtime.example/session"), "quic"),
    "runtime.example:4433",
  );
  assertEquals(
    resolveProviderEndpoint(
      NnrpEndpoint.parse("nnrp://runtime.example/session"),
      "tcp",
      NnrpProviderEndpoint.parse("tcp://[::1]:9000"),
    ),
    "[::1]:9000",
  );
});

Deno.test("@nnrp/core validates provider-local endpoint schemes and security intent", () => {
  assertEquals(
    resolveProviderEndpoint(
      NnrpEndpoint.parse("nnrp://runtime.example/session"),
      "ipc",
      NnrpProviderEndpoint.parse("unix:///tmp/nnrp.sock"),
    ),
    "unix:///tmp/nnrp.sock",
  );
  assertEquals(
    resolveProviderEndpoint(
      NnrpEndpoint.parse("nnrp://runtime.example/session"),
      "ipc",
      NnrpProviderEndpoint.parse("npipe://nnrp-runtime"),
    ),
    "npipe://nnrp-runtime",
  );
  assertEquals(
    resolveProviderEndpoint(
      NnrpEndpoint.parse("nnrps://runtime.example/session"),
      "websocket",
      NnrpProviderEndpoint.parse("wss://runtime.example/nnrp"),
    ),
    "wss://runtime.example/nnrp",
  );
  assertEquals(
    resolveProviderEndpoint(
      NnrpEndpoint.parse("nnrp://runtime.example/session"),
      "websocket",
      NnrpProviderEndpoint.parse("wss://runtime.example/nnrp"),
    ),
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
      () =>
        resolveProviderEndpoint(
          NnrpEndpoint.parse("nnrps://runtime.example/session"),
          transport,
          NnrpProviderEndpoint.parse(providerEndpoint),
        ),
      NnrpTransportError,
    );
    assertEquals(error.diagnostic.code, "NNRP_PROVIDER_ENDPOINT_INVALID");
  }
});

Deno.test("@nnrp/core requires explicit IPC and WebSocket provider endpoints", () => {
  for (const transport of ["ipc", "websocket"] as const) {
    const error = assertThrows(
      () => resolveProviderEndpoint(NnrpEndpoint.parse("nnrp://runtime.example/session"), transport),
      NnrpTransportError,
    );
    assertEquals(error.diagnostic.transport, transport);
  }
});

Deno.test("@nnrp/core keeps provider-local endpoints out of normalized operation payloads", () => {
  const request = createTokenSubmitRequest({
    identity: submitIdentity(8n, 8),
    policy: submitPolicy(),
    chunks: [{ payload: new Uint8Array([1]) }],
  });
  const normalized = normalizeSubmitRequest(
    {
      ...request,
      providerEndpoint: "unix:///tmp/nnrp.sock",
    } as NnrpSubmitRequest & { readonly providerEndpoint: string },
  );

  assertEquals("providerEndpoint" in normalized, false);
});

Deno.test("@nnrp/core derives typed payload descriptors, offsets, metadata, and owned bytes", () => {
  const source = new Uint8Array([1, 2, 3, 4]);
  const request = createTypedPayloadSubmitRequest({
    identity: submitIdentity(7n, 7),
    policy: submitPolicy(),
    frames: [
      {
        profileId: 9,
        payloadKind: NnrpPayloadKind.AudioChunk,
        payload: source.subarray(1, 3),
      },
      {
        profileId: 10,
        payloadKind: NnrpPayloadKind.StructuredEvent,
        payload: new DataView(source.buffer, 2, 2),
      },
    ],
  });
  source.fill(0);
  const metadata = encodeSubmitMetadata(request);
  const body = request.body;
  const bodyView = new DataView(body.buffer, body.byteOffset, body.byteLength);

  assertEquals(request.metadata.payloadKindBitmap, NnrpPayloadKind.AudioChunk | NnrpPayloadKind.StructuredEvent);
  assertEquals(request.metadata.payloadFrameCount, 2);
  assertEquals(bodyView.getUint32(8, true), 48);
  assertEquals(bodyView.getUint32(12, true), 4);
  assertEquals(body.slice(-4), new Uint8Array([2, 3, 3, 4]));
  assertEquals(new DataView(metadata.buffer).getBigUint64(40, true), 7n);
  assertEquals(encodeSubmitPayload(request).slice(0, 72), metadata);
});

Deno.test("@nnrp/core can skip payload copies when ownership is explicit", () => {
  const request = createTokenSubmitRequest({
    identity: submitIdentity(1n, 1),
    policy: submitPolicy(),
    chunks: [{ payload: new Uint8Array([5, 6]) }],
  });
  const normalized = normalizeSubmitRequest(request, { copyPayloads: false });

  assertEquals(normalized.body, request.body);
});

Deno.test("@nnrp/core rejects malformed frozen body regions on send and receive", () => {
  const request = createTokenSubmitRequest({
    identity: submitIdentity(2n, 2),
    policy: submitPolicy(),
    chunks: [{ payload: new Uint8Array([5, 6]) }],
  });
  const malformedBodies = [
    malformedSubmitBody(request.body, 4, 1),
    malformedSubmitBody(request.body, 8, 23),
    malformedSubmitBody(request.body, 16, 1),
  ];
  const expectedCodes = [
    "NNRP_SUBMIT_OBJECT_REFERENCE_LENGTH_INVALID",
    "NNRP_SUBMIT_TYPED_DESCRIPTOR_LENGTH_INVALID",
    "NNRP_SUBMIT_EXTENSION_DESCRIPTOR_LENGTH_INVALID",
  ];

  malformedBodies.forEach((body, index) => {
    assertRuntimeEventError(
      () => normalizeSubmitRequest({ ...request, body }),
      expectedCodes[index]!,
    );
    const payload = new Uint8Array(72 + body.byteLength);
    payload.set(encodeSubmitMetadata(request));
    payload.set(body, 72);
    assertRuntimeEventError(() => decodeSubmitPayload(payload), expectedCodes[index]!);
  });
});

Deno.test("@nnrp/core derives tensor regions and validates current submit identities", () => {
  const request = createTensorSubmitRequest({
    identity: submitIdentity(3n, 4),
    policy: submitPolicy(),
    srcWidth: 64,
    srcHeight: 64,
    tileWidth: 16,
    tileHeight: 16,
    tileIds: [0, 1],
    sections: [{
      roleId: 1,
      defaultCodecId: 2,
      dtypeId: 3,
      layoutId: 4,
      scalePolicy: 0,
      elementCountPerTile: 16,
      tilePayloads: [new Uint8Array([1, 2]), new Uint8Array([3])],
      codecIds: [],
      payloadStrideBytes: 0,
    }],
    cameraBlock: new Uint8Array(),
    inputProfile: NnrpTensorInputProfile.ChangedTilesLuma,
    tileIndexMode: NnrpTileIndexMode.DenseRange,
    tileBaseId: 0,
    references: {},
  });
  assertEquals(request.metadata.tileCount, 2);
  assertEquals(request.metadata.sectionCount, 1);
  assertEquals(request.metadata.payloadKindBitmap, NnrpPayloadKind.Tensor);
  assertEquals(request.header.traceId, 5n);

  assertThrows(
    () => createTokenSubmitRequest({ identity: submitIdentity(1n, 0), policy: submitPolicy(), chunks: [] }),
    NnrpProtocolError,
    "frameId must be between 1",
  );
});

Deno.test("@nnrp/core encodes every tensor tile mode and rejects malformed tensor sections", () => {
  const section = (
    roleId: number,
    tilePayloads: readonly Uint8Array[],
    codecIds: readonly number[] = [],
    payloadStrideBytes = 0,
  ) => ({
    roleId,
    defaultCodecId: 2,
    dtypeId: 3,
    layoutId: 4,
    scalePolicy: 0,
    elementCountPerTile: 16,
    tilePayloads,
    codecIds,
    payloadStrideBytes,
  });
  const create = (
    tileIndexMode: NnrpTileIndexMode,
    tileIds: readonly number[],
    sections = [section(1, tileIds.map((tileId) => new Uint8Array([tileId + 1])))],
    references: Parameters<typeof createTensorSubmitRequest>[0]["references"] = {},
  ) =>
    createTensorSubmitRequest({
      identity: submitIdentity(9n, 9),
      policy: submitPolicy(),
      srcWidth: 64,
      srcHeight: 64,
      tileWidth: 16,
      tileHeight: 16,
      tileIds,
      sections,
      cameraBlock: new Uint8Array([7, 8]),
      inputProfile: NnrpTensorInputProfile.ChangedTilesLuma,
      tileIndexMode,
      tileBaseId: tileIds[0] ?? 0,
      references,
    });

  const raw = create(NnrpTileIndexMode.RawU16, [1, 3]);
  const delta = create(NnrpTileIndexMode.DeltaU16, [2, 5, 9]);
  const bitset = create(
    NnrpTileIndexMode.Bitset,
    [0, 9],
    [section(1, [new Uint8Array([1]), new Uint8Array([2])], [2, 3], 4)],
  );
  assertEquals(raw.metadata.tileIndexBytes, 4);
  assertEquals(delta.metadata.tileIndexBytes, 6);
  assertEquals(bitset.metadata.tileIndexBytes, 2);

  const referenced = create(NnrpTileIndexMode.RawU16, [1], [section(1, [new Uint8Array([1])])], {
    camera: {
      objectKind: NnrpCacheObjectKind.CameraBlock,
      refFlags: 0,
      cacheNamespace: 2,
      cacheKeyHi: 3n,
      cacheKeyLo: 4n,
    },
    tileIndex: {
      objectKind: NnrpCacheObjectKind.TileIndexBlock,
      refFlags: 0,
      cacheNamespace: 2,
      cacheKeyHi: 5n,
      cacheKeyLo: 6n,
    },
    tensorSectionTable: {
      objectKind: NnrpCacheObjectKind.TensorSectionTable,
      refFlags: 0,
      cacheNamespace: 2,
      cacheKeyHi: 7n,
      cacheKeyLo: 8n,
    },
  });
  assertEquals(referenced.metadata.objectRefMask, 7);
  assertEquals(new DataView(referenced.body.buffer, referenced.body.byteOffset).getUint32(4, true), 72);

  assertThrows(
    () => create(NnrpTileIndexMode.DenseRange, [1, 3]),
    NnrpProtocolError,
    "Dense tile ids",
  );
  assertThrows(
    () => create(NnrpTileIndexMode.DeltaU16, [2, 2]),
    NnrpProtocolError,
    "strictly increasing",
  );
  assertThrows(
    () => create(NnrpTileIndexMode.Bitset, [2, 1]),
    NnrpProtocolError,
    "strictly increasing",
  );
  assertThrows(
    () => create(99 as NnrpTileIndexMode, [1]),
    NnrpProtocolError,
    "Unknown tile index mode",
  );
  assertThrows(
    () => create(NnrpTileIndexMode.RawU16, [1], [section(2, [new Uint8Array([1])]), section(1, [new Uint8Array([2])])]),
    NnrpProtocolError,
    "strictly ordered",
  );
  assertThrows(
    () => create(NnrpTileIndexMode.RawU16, [1, 2], [section(1, [new Uint8Array([1])])]),
    NnrpProtocolError,
    "tile payload count",
  );
  assertThrows(
    () => create(NnrpTileIndexMode.RawU16, [1, 2], [section(1, [new Uint8Array([1]), new Uint8Array([2])], [2])]),
    NnrpProtocolError,
    "codec id count",
  );
  assertThrows(
    () => create(NnrpTileIndexMode.RawU16, [1], [section(1, [new Uint8Array([1, 2])], [], 1)]),
    NnrpProtocolError,
    "exceeds payloadStrideBytes",
  );
  assertThrows(
    () =>
      create(NnrpTileIndexMode.RawU16, [1], [section(1, [new Uint8Array([1])])], {
        camera: {
          objectKind: NnrpCacheObjectKind.TileIndexBlock,
          refFlags: 0,
          cacheNamespace: 0,
          cacheKeyHi: 0n,
          cacheKeyLo: 1n,
        },
      }),
    NnrpProtocolError,
    "wrong object kind",
  );
});

Deno.test("@nnrp/core normalizes cache put and invalidate operations", () => {
  const put = normalizeCachePutRequest({
    key: createCacheKey(NnrpCacheObjectKind.TensorSectionTable, "kv-block", 3),
    payload: new Uint8Array([1, 2]),
    descriptor: {
      profile: "tensor",
      cache: { key: createCacheKey(NnrpCacheObjectKind.TensorSectionTable, "kv-block", 3), leaseMillis: 1000 },
    },
    metadata: { pool: "gpu-0" },
  });
  const invalidate = normalizeCacheInvalidateRequest({
    key: createCacheKey(NnrpCacheObjectKind.TensorSectionTable, "kv-block", 3),
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
    () =>
      normalizeCachePutRequest({
        key: createCacheKey(NnrpCacheObjectKind.TensorSectionTable, "a"),
        leaseMillis: -1,
      }),
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
    () => createCacheKey(0 as NnrpCacheObjectKind, "key"),
    NnrpProtocolError,
    "Unsupported NNRP cache object kind",
  );
  assertThrows(
    () => createCacheKey(NnrpCacheObjectKind.TensorSectionTable, " "),
    NnrpProtocolError,
    "Cache key strings must not be empty",
  );
  assertThrows(
    () => createCacheKey(NnrpCacheObjectKind.TensorSectionTable, 1, -1),
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
  const diagnostic = "probe failed";
  const summary = createTransportSelectionSummary(selectTestTransport([
    {
      ...transportCandidate("quic", { probeState: "failed", rejectionReason: "probe-failed" }),
      diagnostic,
    },
    transportCandidate("tcp", { probe: DEFAULT_PROBE }),
  ]));
  const normalized = normalizeCachePutRequest({
    key: createCacheKey(NnrpCacheObjectKind.PromptSegment, "stream"),
    descriptor: {
      profile: "token",
      metadata: { format: "delta" },
      cache: {
        key: createCacheKey(NnrpCacheObjectKind.PromptSegment, "stream"),
        version: "1",
        dependencies: [createCacheKey(NnrpCacheObjectKind.StructuredEventSchema, "token-delta")],
      },
    },
  });

  assertEquals(summary.selected, "tcp");
  assertEquals(summary.rejected[0]?.diagnostic, diagnostic);
  assertEquals(normalized.descriptor?.metadata, { format: "delta" });
  assertEquals(normalized.descriptor?.cache?.dependencies?.[0]?.kind, NnrpCacheObjectKind.StructuredEventSchema);
});

Deno.test("@nnrp/core exposes the frozen cache object kind values", () => {
  assertEquals(NnrpCacheObjectKind.CameraBlock, 0x0001);
  assertEquals(NnrpCacheObjectKind.TileIndexBlock, 0x0002);
  assertEquals(NnrpCacheObjectKind.TensorSectionTable, 0x0003);
  assertEquals(NnrpCacheObjectKind.CodecTable, 0x0004);
  assertEquals(NnrpCacheObjectKind.ReusableResultObject, 0x0005);
  assertEquals(NnrpCacheObjectKind.PayloadLayoutTemplate, 0x0006);
  assertEquals(NnrpCacheObjectKind.PromptSegment, 0x0007);
  assertEquals(NnrpCacheObjectKind.ToolSchema, 0x0008);
  assertEquals(NnrpCacheObjectKind.StructuredEventSchema, 0x0009);
});

Deno.test("@nnrp/core validates frozen cache lease values", () => {
  const objectId = {
    cacheNamespace: 7,
    cacheKeyHi: 8n,
    cacheKeyLo: 9n,
    objectKind: NnrpCacheObjectKind.ReusableResultObject,
  } as const;
  const lease = new CacheLease(objectId, 10n, 11n, CacheLeaseOwnerScope.Session, 12n, 100n, 25);

  assertEquals(lease.objectId, objectId);
  assertNotStrictEquals(lease.objectId, objectId);
  assertEquals(lease.expiresAtMillis, 125n);
  assertEquals(lease.isExpiredAt(124n), false);
  assertEquals(lease.isExpiredAt(125n), true);
  lease.validateVersion(10n);

  const saturated = new CacheLease(objectId, 1n, 2n, CacheLeaseOwnerScope.Connection, 3n, 0xffff_ffff_ffff_fff0n, 32);
  assertEquals(saturated.expiresAtMillis, 0xffff_ffff_ffff_ffffn);

  const mismatch = assertThrows(() => lease.validateVersion(9n), NnrpProtocolError);
  assertEquals(mismatch.diagnostic.code, "NNRP_CACHE_LEASE_VERSION_MISMATCH");
  assertThrows(
    () => new CacheLease(objectId, 1n, 2n, 3 as CacheLeaseOwnerScope, 4n, 5n, 6),
    NnrpProtocolError,
  );
  assertThrows(
    () => new CacheLease({ ...objectId, objectKind: 10 as NnrpCacheObjectKind }, 1n, 2n, 0, 4n, 5n, 6),
    NnrpProtocolError,
  );
  assertThrows(() => new CacheLease(objectId, -1n, 2n, 0, 4n, 5n, 6), NnrpProtocolError);
  assertThrows(() => new CacheLease(objectId, 1n, 2n, 0, 4n, 5n, 0x1_0000_0000), NnrpProtocolError);
  assertThrows(() => lease.isExpiredAt(-1n), NnrpProtocolError);
});

Deno.test("@nnrp/core validates frozen cache lease results and policy options", () => {
  const objectId = {
    cacheNamespace: 7,
    cacheKeyHi: 8n,
    cacheKeyLo: 9n,
    objectKind: NnrpCacheObjectKind.ReusableResultObject,
  } as const;
  const lease = new CacheLease(objectId, 10n, 11n, CacheLeaseOwnerScope.Session, 12n, 100n, 25);
  const result = new NnrpCacheLeaseResult({
    objectId,
    outcome: "valid",
    lease,
    objectVersion: { objectId, objectVersion: 10n, schemaId: 3, schemaVersion: 4 },
  });
  assertEquals(result.outcome, "valid");
  assertNotStrictEquals(result.objectId, objectId);
  assertEquals(new NnrpCachePolicyOptions({ enabled: false }).expirationHintMs, 0n);
  assertEquals(
    new NnrpCachePolicyOptions({
      enabled: true,
      reuseScope: CacheReuseScope.Session,
      expirationHintMs: 1_000n,
      invalidationReason: "lease-expired",
    }).reuseScope,
    CacheReuseScope.Session,
  );
  assertThrows(
    () => new NnrpCacheLeaseResult({ objectId, outcome: "unknown" as "valid" }),
    NnrpProtocolError,
  );
  assertThrows(
    () => new NnrpCachePolicyOptions({ enabled: false, reuseScope: CacheReuseScope.Session }),
    NnrpProtocolError,
  );
  assertThrows(() => new NnrpCachePolicyOptions({ enabled: true }), NnrpProtocolError);
});

Deno.test("@nnrp/core cache lease results and policy options are structured-clone safe", () => {
  const objectId = {
    cacheNamespace: 7,
    cacheKeyHi: 8n,
    cacheKeyLo: 9n,
    objectKind: NnrpCacheObjectKind.ReusableResultObject,
  } as const;
  const lease = new CacheLease(objectId, 10n, 11n, CacheLeaseOwnerScope.Session, 12n, 100n, 25);
  const leaseResult = new NnrpCacheLeaseResult({
    objectId,
    outcome: "renewed",
    lease,
    objectVersion: { objectId, objectVersion: 10n, schemaId: 3, schemaVersion: 4 },
    diagnostic: "lease renewed",
  });
  const policy = new NnrpCachePolicyOptions({
    enabled: true,
    reuseScope: CacheReuseScope.Session,
    expirationHintMs: 1_000n,
    invalidationReason: "lease-expired",
  });

  const clonedResult = structuredClone(leaseResult);
  assertEquals(clonedResult.objectId, objectId);
  assertEquals(clonedResult.outcome, "renewed");
  assertEquals(clonedResult.lease?.objectId, objectId);
  assertEquals(clonedResult.lease?.objectVersion, 10n);
  assertEquals(clonedResult.lease?.leaseId, 11n);
  assertEquals(clonedResult.lease?.ownerScope, CacheLeaseOwnerScope.Session);
  assertEquals(clonedResult.lease?.ownerId, 12n);
  assertEquals(clonedResult.lease?.grantedAtMillis, 100n);
  assertEquals(clonedResult.lease?.ttlMillis, 25);
  assertEquals(clonedResult.objectVersion, { objectId, objectVersion: 10n, schemaId: 3, schemaVersion: 4 });
  assertEquals(clonedResult.diagnostic, "lease renewed");
  assertEquals(structuredClone(policy), {
    enabled: true,
    reuseScope: CacheReuseScope.Session,
    expirationHintMs: 1_000n,
    invalidationReason: "lease-expired",
  });
});

Deno.test("@nnrp/core validates deterministic lifecycle snapshots", () => {
  const session = (sessionId: number, state: "open" | "closed") =>
    new NnrpSessionLifecycle({
      sessionId,
      state,
      profileId: 1,
      priorityClass: NnrpSessionPriorityClass.Balanced,
      schemaId: 2,
      schemaVersion: 3,
      maxInFlightOperations: 4,
      routeScopeId: 5,
      lastOperationId: 6n,
      sessionErrorCode: 0,
    });
  const connection = new NnrpConnectionLifecycle({ state: "open", sessions: [session(2, "open"), session(1, "open")] });
  assertEquals(connection.sessions.map((value) => value.sessionId), [1, 2]);
  assertEquals(connection.sessions[0]?.acceptsNewOperations, true);
  assertThrows(
    () => new NnrpConnectionLifecycle({ state: "open", sessions: [session(1, "open"), session(1, "open")] }),
    NnrpProtocolError,
  );
  assertThrows(
    () => new NnrpConnectionLifecycle({ state: "closed", sessions: [session(1, "open")] }),
    NnrpProtocolError,
  );
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
    submitCapacityPolicy: "await",
    initialCredits: 3,
    metadata: { route: "fast" },
  });

  assertEquals(patch, {
    inputProfile: "token",
    targetCadence: 60,
    qualityTier: 2,
    submitCapacityPolicy: "await",
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
  const drop = decodeNnrpRuntimeEvent({
    versionMajor: 1,
    wireFormat: 0,
    messageType: NnrpMessageType.ResultDrop,
    flags: 0,
    sessionId: 9,
    frameId: 77,
    viewId: 0,
    routeId: 0,
    traceId: 0n,
  }, new Uint8Array());
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
  assertEquals(error.sessionId, 9);
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
