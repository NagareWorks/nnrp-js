import {
  CacheAckStatus,
  CacheInvalidateScope,
  CacheMissReason,
  CacheReuseScope,
  decodeCacheAckMetadata,
  decodeCacheInvalidateMetadata,
  decodeCachePutMetadata,
  decodeClientHelloMetadata,
  decodeFlowUpdateMetadata,
  decodeFrameSubmitMetadata,
  decodeObjectReferenceBlock,
  decodeResultHintMetadata,
  decodeResultPushMetadata,
  decodeRuntimeControlMetadata,
  decodeRuntimeObjectMetadata,
  decodeSessionPatchAckMetadata,
  decodeTransportProbeAckMetadata,
  decodeTransportProbeMetadata,
  decodeTypedPayloadDescriptor,
  encodeCacheAckMetadata,
  encodeCacheInvalidateMetadata,
  encodeCachePutMetadata,
  encodeClientHelloMetadata,
  encodeFlowUpdateMetadata,
  encodeFrameSubmitMetadata,
  encodeObjectReferenceBlock,
  encodeResultHintMetadata,
  encodeResultPushMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  encodeRuntimeObjectMetadataSegments,
  encodeSessionPatchAckMetadata,
  encodeTransportProbeAckMetadata,
  encodeTransportProbeMetadata,
  encodeTypedPayloadDescriptor,
  ErrorScope,
  MemoryLocationHint,
  NnrpBackpressureLevel,
  NnrpCacheObjectKind,
  NnrpFlowScopeKind,
  NnrpFlowUpdateReason,
  NnrpMessageType,
  NnrpPayloadKind,
  NnrpResultHintBudgetPolicy,
  NnrpResultHintCongestionState,
  NnrpResultHintReason,
  NnrpTypedPayloadDescriptorFlags,
  ObjectReleaseReason,
  OwnershipHint,
  type RuntimeControlMetadata,
  RuntimeObjectKind,
  type RuntimeObjectMetadata,
  RuntimeRole,
  selectTransport,
} from "@nnrp/core";
import {
  parsePreview4AdapterPlan,
  PREVIEW4_ADAPTER_RESULTS_SCHEMA,
  PREVIEW4_CONFORMANCE_PROTOCOL,
  PREVIEW4_IMPLEMENTED_CASE_IDS,
  type Preview4AdapterCaseId,
  type Preview4ImplementedCaseId,
} from "./preview4-conformance-contract.ts";

export interface Preview4AdapterCaseResult {
  readonly id: string;
  readonly outcome: "pass" | "fail" | "skip" | "error";
  readonly failure_kind?: string;
  readonly message?: string;
  readonly evidence_paths?: readonly string[];
}

export interface Preview4AdapterResults {
  readonly $schema: typeof PREVIEW4_ADAPTER_RESULTS_SCHEMA;
  readonly protocol_version: typeof PREVIEW4_CONFORMANCE_PROTOCOL;
  readonly implementation_name: "nnrp-js";
  readonly results: readonly Preview4AdapterCaseResult[];
}

export interface Preview4AdapterExecutionOptions {
  readonly verifyHeader?: () => void | Promise<void>;
  readonly verifyTransportSession?: (transport: "tcp" | "quic") => void | Promise<void>;
  readonly evidenceDirectory?: string;
}

export async function executePreview4AdapterPlan(
  value: unknown,
  options: Preview4AdapterExecutionOptions = {},
): Promise<Preview4AdapterResults> {
  const plan = parsePreview4AdapterPlan(value);
  const evidenceDirectory = options.evidenceDirectory ?? plan.artifacts.evidence_dir;
  const frozenCases = new Map(plan.cases.map((entry) => [entry.id, entry.parameters]));
  const results: Preview4AdapterCaseResult[] = [];
  for (const { id, parameters } of plan.cases) {
    results.push(
      await executePreview4ImplementedCase(
        id as Preview4AdapterCaseId,
        evidenceDirectory,
        options.verifyHeader,
        options.verifyTransportSession,
        parameters,
        frozenCases,
      ),
    );
  }
  return {
    $schema: PREVIEW4_ADAPTER_RESULTS_SCHEMA,
    protocol_version: PREVIEW4_CONFORMANCE_PROTOCOL,
    implementation_name: "nnrp-js",
    results,
  };
}

export async function writePreview4AdapterResults(
  planPath: string,
  outputPath: string,
  options: Preview4AdapterExecutionOptions = {},
): Promise<void> {
  const plan = JSON.parse(await Deno.readTextFile(planPath));
  const report = await executePreview4AdapterPlan(plan, options);
  const parent = outputPath.replace(/[\\/][^\\/]+$/, "");
  if (parent !== outputPath) await Deno.mkdir(parent, { recursive: true });
  await Deno.writeTextFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

export async function executePreview4ImplementedCase(
  caseId: Preview4ImplementedCaseId,
  evidenceDirectory: string,
  verifyHeader: (() => void | Promise<void>) | undefined,
  verifyTransportSession: ((transport: "tcp" | "quic") => void | Promise<void>) | undefined = undefined,
  parameters: Readonly<Record<string, unknown>> = {},
  frozenCases: ReadonlyMap<string, Readonly<Record<string, unknown>>> = new Map(),
): Promise<Preview4AdapterCaseResult> {
  try {
    const evidence = await CASE_EXECUTORS[caseId](parameters, verifyHeader, verifyTransportSession, frozenCases);
    await Deno.mkdir(evidenceDirectory, { recursive: true });
    const evidencePath = `${evidenceDirectory}/${safeFileStem(caseId)}.json`;
    await Deno.writeTextFile(evidencePath, `${JSON.stringify(evidence, bigintReplacer, 2)}\n`);
    return {
      id: caseId,
      outcome: "pass",
      message: "Case executed through the released JS codec, runtime facade, or live native wire path.",
      evidence_paths: [evidencePath],
    };
  } catch (error) {
    return {
      id: caseId,
      outcome: "fail",
      failure_kind: "assertion_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

const CASE_EXECUTORS: Readonly<
  Record<
    Preview4ImplementedCaseId,
    (
      parameters: Readonly<Record<string, unknown>>,
      verifyHeader?: () => void | Promise<void>,
      verifyTransportSession?: (transport: "tcp" | "quic") => void | Promise<void>,
      frozenCases?: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
    ) => unknown | Promise<unknown>
  >
> = {
  "l0.header.fixed_shape.golden": async (parameters, verifyHeader) => {
    const expected = hexParameter(parameters, "header_hex");
    if (expected.byteLength !== 40) throw new RangeError("NNRP/1 common header must be 40 bytes");
    const view = new DataView(expected.buffer, expected.byteOffset, expected.byteLength);
    assertEquivalent(
      [
        ...expected.slice(0, 4),
        view.getUint8(4),
        view.getUint8(5),
        view.getUint8(6),
        view.getUint8(7),
        view.getUint32(8, true),
        view.getUint32(12, true),
        view.getUint32(16, true),
        view.getUint32(20, true),
        view.getUint32(24, true),
        view.getUint16(28, true),
        view.getUint16(30, true),
        view.getBigUint64(32, true),
      ],
      [0x4e, 0x4e, 0x52, 0x50, 1, 0, 0x10, 40, 33, 48, 4096, 7, 11, 2, 0, 123456789n],
      "NNRP/1 common header",
    );
    if (verifyHeader !== undefined) {
      await verifyHeader();
    } else {
      const { verifyNativeRuntimeFrame } = await import("./check-native-runtime-frame.ts");
      await verifyNativeRuntimeFrame();
    }
    return { case_id: "l0.header.fixed_shape.golden", action: "native-runtime-frame-roundtrip", header_bytes: 40 };
  },
  "l0.control.client_hello.golden": (parameters) =>
    frozenCodecEvidence(
      "l0.control.client_hello.golden",
      parameters,
      "metadata_hex",
      decodeClientHelloMetadata,
      encodeClientHelloMetadata,
    ),
  "l0.control.session_patch_ack.golden": (parameters) =>
    frozenCodecEvidence(
      "l0.control.session_patch_ack.golden",
      parameters,
      "metadata_hex",
      decodeSessionPatchAckMetadata,
      encodeSessionPatchAckMetadata,
    ),
  "l0.flow_update.packet.golden": (parameters) =>
    frozenPacketEvidence(
      "l0.flow_update.packet.golden",
      parameters,
      decodeFlowUpdateMetadata,
      encodeFlowUpdateMetadata,
    ),
  "l0.result_hint.packet.golden": (parameters) =>
    frozenPacketEvidence(
      "l0.result_hint.packet.golden",
      parameters,
      decodeResultHintMetadata,
      encodeResultHintMetadata,
    ),
  "l0.frame_submit.metadata.golden": (parameters) =>
    frozenCodecEvidence(
      "l0.frame_submit.metadata.golden",
      parameters,
      "metadata_hex",
      decodeFrameSubmitMetadata,
      encodeFrameSubmitMetadata,
    ),
  "l0.result_push.metadata.golden": (parameters) =>
    frozenCodecEvidence(
      "l0.result_push.metadata.golden",
      parameters,
      "metadata_hex",
      decodeResultPushMetadata,
      encodeResultPushMetadata,
    ),
  "l0.body_region.prelude.golden": (parameters) => {
    const expected = hexParameter(parameters, "metadata_hex");
    const view = new DataView(expected.buffer, expected.byteOffset, expected.byteLength);
    const fields = Array.from({ length: 8 }, (_, index) => view.getUint32(index * 4, true));
    assertEquivalent(fields, [24, 24, 24, 14, 16, 5, 0, 0], "NNRP/1 baseline body-region prelude");
    const encoded = new Uint8Array(32);
    const encodedView = new DataView(encoded.buffer);
    fields.forEach((value, index) => encodedView.setUint32(index * 4, value, true));
    assertBytes(encoded, expected, "NNRP/1 baseline body-region prelude");
    return { case_id: "l0.body_region.prelude.golden", action: "baseline-body-prelude-roundtrip" };
  },
  "l0.object_reference.block.golden": (parameters) =>
    frozenCodecEvidence(
      "l0.object_reference.block.golden",
      parameters,
      "metadata_hex",
      decodeObjectReferenceBlock,
      encodeObjectReferenceBlock,
    ),
  "l0.typed_payload.descriptor.golden": (parameters) => {
    const expected = hexParameter(parameters, "descriptor_hex");
    const descriptor = decodeBaselineTypedPayloadDescriptor(expected);
    assertEquivalent(
      descriptor,
      { payloadKind: NnrpPayloadKind.StructuredEvent, profileId: 3, offset: 4, length: 7 },
      "NNRP/1 baseline typed-payload descriptor",
    );
    assertBytes(
      encodeBaselineTypedPayloadDescriptor(descriptor),
      expected,
      "NNRP/1 baseline typed-payload descriptor",
    );
    return { case_id: "l0.typed_payload.descriptor.golden", action: "baseline-descriptor-roundtrip" };
  },
  "l0.typed_payload.frame_regions.golden": (parameters) => {
    const descriptorRegion = hexParameter(parameters, "descriptor_region_hex");
    const payloadRegion = hexParameter(parameters, "payload_hex");
    const descriptors = decodeBaselineTypedPayloadRegion(descriptorRegion, payloadRegion);
    assertEquivalent(
      descriptors.map(({ payloadKind }) => payloadKind),
      [
        NnrpPayloadKind.TokenChunk,
        NnrpPayloadKind.AudioChunk,
        NnrpPayloadKind.VideoChunk,
        NnrpPayloadKind.StructuredEvent,
      ],
      "NNRP/1 baseline typed-payload frame kinds",
    );
    assertBytes(
      concat(...descriptors.map(encodeBaselineTypedPayloadDescriptor)),
      descriptorRegion,
      "NNRP/1 baseline descriptor region",
    );
    return { case_id: "l0.typed_payload.frame_regions.golden", action: "baseline-frame-regions-roundtrip" };
  },
  "l1.flow_update.metadata.validation": () => {
    const metadata = {
      scopeKind: NnrpFlowScopeKind.Session,
      updateReason: NnrpFlowUpdateReason.Congestion,
      backpressureLevel: NnrpBackpressureLevel.Hard,
      connectionCredit: 0,
      sessionCredit: 1,
      operationCredit: 0,
      operationId: 0n,
      retryAfterMs: 40,
      creditEpoch: 5,
      flowFlags: 0x03,
    };
    assertEquivalent(decodeFlowUpdateMetadata(encodeFlowUpdateMetadata(metadata)), metadata, "FLOW_UPDATE metadata");
    expectProtocolFailure(() => encodeFlowUpdateMetadata({ ...metadata, flowFlags: 0x01 }), "FLOW_UPDATE retry flag");
    return { case_id: "l1.flow_update.metadata.validation", action: "flow-update-validation" };
  },
  "l1.result_hint.metadata.validation": () => {
    const metadata = {
      appliedBudgetPolicy: NnrpResultHintBudgetPolicy.Partial,
      congestionState: NnrpResultHintCongestionState.Elevated,
      reason: NnrpResultHintReason.ServerBusy,
      retryAfterMs: 20,
    };
    const encoded = encodeResultHintMetadata(metadata);
    assertEquivalent(decodeResultHintMetadata(encoded), metadata, "RESULT_HINT metadata");
    const invalid = encoded.slice();
    new DataView(invalid.buffer).setUint32(8, 99, true);
    expectProtocolFailure(() => decodeResultHintMetadata(invalid), "RESULT_HINT reason");
    return { case_id: "l1.result_hint.metadata.validation", action: "result-hint-validation" };
  },
  "l1.cache.lifecycle.roundtrip": () => {
    const cachePut = {
      cacheNamespace: 1,
      cacheKeyHi: 0x01020304n,
      cacheKeyLo: 0x05060708n,
      objectKind: NnrpCacheObjectKind.CodecTable,
      ttlMs: 15_000,
      objectBytes: 2_048,
      codecBitmap: 3,
      flags: 3,
    };
    const cacheAck = {
      cacheNamespace: 1,
      cacheKeyHi: 0x01020304n,
      cacheKeyLo: 0x05060708n,
      status: CacheAckStatus.Accepted,
      acceptedTtlMs: 15_000,
      maxObjectBytes: 8_192,
      detailCode: 0,
    };
    const invalidate = {
      invalidateScope: CacheInvalidateScope.ObjectKey,
      cacheNamespace: 1,
      cacheKeyHi: 0x01020304n,
      cacheKeyLo: 0x05060708n,
      reasonCode: 2,
    };
    assertEquivalent(decodeCachePutMetadata(encodeCachePutMetadata(cachePut)), cachePut, "CACHE_PUT metadata");
    assertEquivalent(decodeCacheAckMetadata(encodeCacheAckMetadata(cacheAck)), cacheAck, "CACHE_ACK metadata");
    assertEquivalent(
      decodeCacheInvalidateMetadata(encodeCacheInvalidateMetadata(invalidate)),
      invalidate,
      "CACHE_INVALIDATE metadata",
    );
    return { case_id: "l1.cache.lifecycle.roundtrip", action: "cache-lifecycle-roundtrip", message_count: 3 };
  },
  "l1.transport_probe.metadata.roundtrip": () => {
    const probe = { probeId: 7, probePayloadBytes: 1_200, clientSendTsUs: 100_000n };
    const ack = { probeId: 7, serverRecvTsUs: 100_800n };
    assertEquivalent(decodeTransportProbeMetadata(encodeTransportProbeMetadata(probe)), probe, "TRANSPORT_PROBE");
    assertEquivalent(
      decodeTransportProbeAckMetadata(encodeTransportProbeAckMetadata(ack)),
      ack,
      "TRANSPORT_PROBE_ACK",
    );
    return { case_id: "l1.transport_probe.metadata.roundtrip", action: "transport-probe-roundtrip", probe_id: 7 };
  },
  "l1.frame_submit.message.parse_emit": (_parameters, _verifyHeader, _verifyTransportSession, frozenCases) => {
    const frozen = frozenParameter(frozenCases, "l0.frame_submit.metadata.golden", "metadata_hex");
    const metadata = decodeFrameSubmitMetadata(frozen);
    assertBytes(encodeFrameSubmitMetadata(metadata), frozen, "FRAME_SUBMIT metadata");
    const descriptor = {
      profileId: 2,
      payloadKind: NnrpPayloadKind.TokenChunk,
      descriptorFlags: NnrpTypedPayloadDescriptorFlags.Partial,
      schemaId: 0x1001,
      schemaVersion: 3,
      streamSemantics: 2,
      offset: 0,
      length: 3,
    };
    assertEquivalent(
      decodeTypedPayloadDescriptor(encodeTypedPayloadDescriptor(descriptor)),
      descriptor,
      "typed payload",
    );
    return { case_id: "l1.frame_submit.message.parse_emit", action: "frame-submit-parse-emit" };
  },
  "l1.result_push.message.parse_emit": (_parameters, _verifyHeader, _verifyTransportSession, frozenCases) => {
    const frozen = frozenParameter(frozenCases, "l0.result_push.metadata.golden", "metadata_hex");
    const metadata = decodeResultPushMetadata(frozen);
    assertBytes(encodeResultPushMetadata(metadata), frozen, "RESULT_PUSH metadata");
    const reference = {
      objectKind: NnrpCacheObjectKind.TileIndexBlock,
      refFlags: 0,
      cacheNamespace: 7,
      cacheKeyHi: 0x11223344n,
      cacheKeyLo: 0x55667788n,
    };
    assertEquivalent(decodeObjectReferenceBlock(encodeObjectReferenceBlock(reference)), reference, "object reference");
    return { case_id: "l1.result_push.message.parse_emit", action: "result-push-parse-emit" };
  },
  "l1.result_push.object_reference.resolve": () => {
    const reference = {
      objectKind: NnrpCacheObjectKind.TileIndexBlock,
      refFlags: 0,
      cacheNamespace: 7,
      cacheKeyHi: 0x11223344n,
      cacheKeyLo: 0x55667788n,
    };
    const decoded = decodeObjectReferenceBlock(encodeObjectReferenceBlock(reference));
    const key = `${decoded.cacheNamespace}:${decoded.cacheKeyHi}:${decoded.cacheKeyLo}`;
    const cache = new Map([[key, bytes("tile-index")]]);
    assertBytes(cache.get(key)!, bytes("tile-index"), "resolved object reference");
    cache.clear();
    if (cache.get(key) !== undefined) throw new Error("missing object reference did not surface as a cache miss");
    return {
      case_id: "l1.result_push.object_reference.resolve",
      action: "result-push-object-reference-resolve",
      cache_miss_observed: true,
    };
  },
  "l1.typed_payload.region.pack": () => {
    const payloadRegion = bytes("tokevent");
    const descriptors = [
      { payloadKind: NnrpPayloadKind.TokenChunk, profileId: 2, offset: 0, length: 3 },
      { payloadKind: NnrpPayloadKind.StructuredEvent, profileId: 2, offset: 3, length: 5 },
    ];
    const descriptorRegion = concat(...descriptors.map(encodeBaselineTypedPayloadDescriptor));
    const decoded = decodeBaselineTypedPayloadRegion(descriptorRegion, payloadRegion);
    assertEquivalent(decoded, descriptors, "NNRP/1 baseline typed-payload region pack");
    return { case_id: "l1.typed_payload.region.pack", action: "baseline-region-pack", offsets: [0, 3] };
  },
  "l3.transport.probe.selection": async () => {
    const [{ createTcpTransportProvider }, { createQuicTransportProvider }] = await Promise.all([
      import("@nnrp/transport-tcp"),
      import("@nnrp/transport-quic"),
    ]);
    const providers = [createTcpTransportProvider(), createQuicTransportProvider()];
    if (providers.some((provider) => !provider.localAvailable)) {
      throw new Error("transport probe selection requires installed TCP and QUIC providers");
    }
    const readiness = providers.map((provider) => ({
      transportId: provider.kind,
      providerId: provider.metadata.id,
      routeResolved: true,
      securitySatisfied: true,
    }));
    const metrics = (medianRttMicroseconds: bigint) => ({
      sampleCount: 1,
      successCount: 1,
      medianThroughputBytesPerSecond: 10_000n,
      medianRttMicroseconds,
    });
    const selected = selectTransport(providers.map(({ descriptor }) => descriptor), {
      peerSupportedTransports: ["tcp", "quic"],
      policy: "auto",
      candidateReadiness: readiness,
      probeObservations: providers.map((provider) => ({
        transportId: provider.kind,
        providerId: provider.metadata.id,
        state: "succeeded" as const,
        metrics: metrics(provider.kind === "quic" ? 800n : 1_500n),
      })),
    });
    if (selected.selectedProvider.transportId !== "quic") {
      throw new Error("transport probe did not prefer the lower-latency QUIC provider");
    }
    const fallback = selectTransport(providers.map(({ descriptor }) => descriptor), {
      peerSupportedTransports: ["tcp", "quic"],
      policy: "prefer-quic",
      candidateReadiness: readiness,
      probeObservations: providers.map((provider) =>
        provider.kind === "quic"
          ? { transportId: provider.kind, providerId: provider.metadata.id, state: "failed" as const }
          : {
            transportId: provider.kind,
            providerId: provider.metadata.id,
            state: "succeeded" as const,
            metrics: metrics(900n),
          }
      ),
    });
    if (fallback.selectedProvider.transportId !== "tcp") {
      throw new Error("transport probe did not fall back to TCP after QUIC failure");
    }
    return { case_id: "l3.transport.probe.selection", action: "transport-probe-selection" };
  },
  "l3.transport.tcp.session_smoke": async (_parameters, _verifyHeader, verifyTransportSession) => {
    await verifyAdapterTransportSession("tcp", verifyTransportSession);
    return { case_id: "l3.transport.tcp.session_smoke", action: "native-role-session-loopback" };
  },
  "l3.transport.quic.session_smoke": async (_parameters, _verifyHeader, verifyTransportSession) => {
    await verifyAdapterTransportSession("quic", verifyTransportSession);
    return { case_id: "l3.transport.quic.session_smoke", action: "native-role-session-loopback" };
  },
  "l0.typed_payload.descriptor.current.golden": (parameters) => {
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
    const expected = hexParameter(parameters, "descriptor_hex");
    if (!encoded.every((value, index) => value === expected[index])) {
      throw new Error("current typed payload descriptor golden bytes changed");
    }
    const decoded = decodeTypedPayloadDescriptor(encoded);
    if (JSON.stringify(decoded) !== JSON.stringify(descriptor)) {
      throw new Error("current typed payload descriptor roundtrip changed");
    }
    return {
      case_id: "l0.typed_payload.descriptor.current.golden",
      action: "typed-payload-descriptor-roundtrip",
      descriptor_bytes: encoded.length,
    };
  },
  "l1.control.cancel-abort": () => {
    const frames = [
      roundTripControl(NnrpMessageType.Cancel, {
        operationId: 10n,
        controlSequence: 1n,
        reasonCode: 1,
        sourceRole: RuntimeRole.Client,
        flags: 0x01,
        diagnosticBytes: 2,
      }, bytes("ca")),
      roundTripControl(NnrpMessageType.Abort, {
        operationId: 10n,
        controlSequence: 2n,
        reasonCode: 2,
        sourceRole: RuntimeRole.Scheduler,
        flags: 0x02,
        diagnosticBytes: 2,
      }, bytes("ab")),
      roundTripControl(NnrpMessageType.TraceContext, {
        traceId: 100n,
        spanId: 2n,
        parentSpanId: 1n,
        stageCode: 3,
        flags: 0,
        bodyBytes: 0,
      }),
      roundTripControl(NnrpMessageType.ResultDropReason, {
        operationId: 10n,
        resultSequence: 1n,
        dropReasonCode: 2,
        sourceRole: RuntimeRole.Runtime,
        flags: 0,
        diagnosticBytes: 0,
      }),
    ];
    return evidence("l1.control.cancel-abort", frames);
  },
  "l1.control.priority-deadline": () => {
    const scheduling = {
      operationId: 10n,
      controlSequence: 3n,
      priorityClass: 2,
      priorityDelta: 4,
      deadlineUnixMs: 1_800_000_000_000n,
      flags: 0x03,
    };
    return evidence("l1.control.priority-deadline", [
      roundTripControl(NnrpMessageType.PriorityUpdate, scheduling),
      roundTripControl(NnrpMessageType.Deadline, { ...scheduling, controlSequence: 4n }),
      roundTripControl(NnrpMessageType.ExpireAt, { ...scheduling, controlSequence: 5n }),
    ]);
  },
  "l1.control.progress-backpressure": () =>
    evidence("l1.control.progress-backpressure", [
      roundTripControl(NnrpMessageType.Progress, {
        operationId: 10n,
        progressSequence: 1n,
        stageCode: 2,
        percentX100: 2_500,
        objectId: 20n,
        bodyBytes: 4,
      }, bytes("step")),
      roundTripControl(NnrpMessageType.PartialResult, {
        operationId: 10n,
        resultSequence: 2n,
        objectId: 20n,
        deltaSequence: 1n,
        bodyBytes: 4,
        flags: 0,
      }, bytes("part")),
      roundTripControl(NnrpMessageType.Backpressure, pressureMetadata()),
      roundTripControl(NnrpMessageType.CreditUpdate, { ...pressureMetadata(), creditWindow: 8n }),
    ]),
  "l1.control.capability-costs": () =>
    evidence("l1.control.capability-costs", [
      roundTripControl(NnrpMessageType.CapabilityNegotiation, capabilityMetadata(1), bytes("{}")),
    ]),
  "l1.object.lifecycle": () =>
    evidence("l1.object.lifecycle", [
      roundTripObject(NnrpMessageType.ObjectDeclare, {
        objectId: 9n,
        objectKind: RuntimeObjectKind.ImageTile,
        producerRole: RuntimeRole.Runtime,
        consumerRole: RuntimeRole.Client,
        sessionId: 3,
        byteSize: 4096n,
        computeCostUnits: 12,
        memoryLocationHint: MemoryLocationHint.HostMemory,
        ownershipHint: OwnershipHint.ConsumerOwned,
        lifetimeHintMs: 1_000,
        metadataBytes: 2,
      }, bytes("md")),
      roundTripObject(NnrpMessageType.ObjectRef, {
        objectId: 9n,
        operationId: 10n,
        objectVersion: 2n,
        offset: 0n,
        length: 4096n,
        flags: 0,
        metadataBytes: 0,
      }),
      roundTripObject(NnrpMessageType.ObjectRelease, {
        objectId: 9n,
        operationId: 10n,
        releaseReason: ObjectReleaseReason.Completed,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      }),
    ]),
  "l1.object.delta": () => {
    const metadata: RuntimeObjectMetadata = {
      objectId: 9n,
      deltaSequence: 2n,
      regionOffset: 128n,
      regionBytes: 4,
      deltaBytes: 4,
      flags: 0x03,
      metadataBytes: 2,
    };
    const metadataBody = bytes("md");
    const delta = bytes("xxxx");
    const encoded = encodeRuntimeObjectMetadataSegments(
      NnrpMessageType.ObjectDelta,
      metadata,
      [metadataBody, delta],
    );
    const decoded = decodeRuntimeObjectMetadata(NnrpMessageType.ObjectDelta, encoded);
    assertEquivalent(decoded.metadata, metadata, "OBJECT_DELTA metadata");
    assertBytes(decoded.tail, concat(metadataBody, delta), "OBJECT_DELTA tails");
    return evidence("l1.object.delta", [{ message_type: NnrpMessageType.ObjectDelta, bytes: encoded.byteLength }]);
  },
  "l1.control.route-execution-hint": () =>
    evidence("l1.control.route-execution-hint", [
      roundTripControl(NnrpMessageType.RouteHint, routeMetadata(20), bytes("rt")),
      roundTripControl(NnrpMessageType.ExecutionHint, routeMetadata(21), bytes("ex")),
    ]),
  "l1.control.cache-reference": () => {
    const cacheKeyHi = 1n;
    const cacheKeyLo = 2n;
    const invalidate = {
      invalidateScope: 3,
      cacheNamespace: 7,
      cacheKeyHi,
      cacheKeyLo,
      reasonCode: 2,
    };
    const invalidateEncoded = encodeCacheInvalidateMetadata(invalidate);
    assertEquivalent(decodeCacheInvalidateMetadata(invalidateEncoded), invalidate, "CACHE_INVALIDATE metadata");
    return evidence("l1.control.cache-reference", [
      roundTripObject(NnrpMessageType.CacheReference, {
        cacheNamespace: 7,
        cacheKeyHi,
        cacheKeyLo,
        profileId: 3,
        reuseScope: CacheReuseScope.Session,
        leaseId: 4n,
        producerTraceId: 5n,
        expirationHintMs: 1_000,
        metadataBytes: 0,
        flags: 0,
      }),
      roundTripObject(NnrpMessageType.CacheMiss, {
        cacheNamespace: 7,
        cacheKeyHi,
        cacheKeyLo,
        missReason: CacheMissReason.NotFound,
        profileId: 3,
        diagnosticBytes: 0,
      }),
      { message_type: NnrpMessageType.CacheInvalidate, bytes: invalidateEncoded.byteLength },
    ]);
  },
  "l1.control.degrade-budget": () =>
    evidence("l1.control.degrade-budget", [
      roundTripControl(NnrpMessageType.DegradeProfile, capabilityMetadata(2), bytes("{}")),
      roundTripControl(NnrpMessageType.BudgetUpdate, {
        operationId: 10n,
        computeBudgetUnits: 20n,
        memoryBudgetBytes: 30n,
        bandwidthBudgetBytes: 40n,
        tokenBudget: 50,
        flags: 0,
      }),
    ]),
  "l1.control.supersede": () =>
    evidence("l1.control.supersede", [
      roundTripControl(NnrpMessageType.Supersede, {
        oldOperationId: 10n,
        newOperationId: 11n,
        controlSequence: 1n,
        dropReasonCode: 2,
        flags: 0,
        diagnosticBytes: 0,
      }),
      roundTripControl(NnrpMessageType.ResultDropReason, {
        operationId: 10n,
        resultSequence: 1n,
        dropReasonCode: 2,
        sourceRole: RuntimeRole.Runtime,
        flags: 0,
        diagnosticBytes: 0,
      }),
    ]),
  "l1.control.recoverable-error": () =>
    evidence("l1.control.recoverable-error", [
      roundTripControl(NnrpMessageType.ErrorRecoverable, {
        errorCode: 20,
        errorScope: ErrorScope.Session,
        recoveryAction: 2,
        sourceRole: RuntimeRole.Runtime,
        flags: 0,
        retryAfterMs: 100,
        relatedSessionId: 1,
        relatedFrameId: 2,
        relatedViewId: 3,
        diagnosticBytes: 0,
      }),
      roundTripControl(NnrpMessageType.RetryAfter, {
        scopeId: 1n,
        controlSequence: 2n,
        retryAfterMs: 100,
        jitterMs: 5,
        reasonCode: 1,
        sourceRole: RuntimeRole.Server,
        flags: 0,
        diagnosticBytes: 0,
      }),
    ]),
};

if (Object.keys(CASE_EXECUTORS).length !== PREVIEW4_IMPLEMENTED_CASE_IDS.length) {
  throw new Error("Preview4 adapter case dispatch is not exhaustive");
}

function frozenCodecEvidence<T>(
  caseId: Preview4ImplementedCaseId,
  parameters: Readonly<Record<string, unknown>>,
  parameterName: string,
  decode: (encoded: Uint8Array) => T,
  encode: (metadata: T) => Uint8Array,
): Record<string, unknown> {
  const frozen = hexParameter(parameters, parameterName);
  assertBytes(encode(decode(frozen)), frozen, `${caseId} frozen bytes`);
  return { case_id: caseId, action: "released-codec-roundtrip", bytes: frozen.byteLength };
}

function frozenPacketEvidence<T>(
  caseId: Preview4ImplementedCaseId,
  parameters: Readonly<Record<string, unknown>>,
  decode: (encoded: Uint8Array) => T,
  encode: (metadata: T) => Uint8Array,
): Record<string, unknown> {
  const frozen = hexParameter(parameters, "packet_hex");
  if (frozen.byteLength <= 40) throw new RangeError(`${caseId} packet must include metadata after the common header`);
  const emitted = concat(frozen.slice(0, 40), encode(decode(frozen.slice(40))));
  assertBytes(emitted, frozen, `${caseId} frozen packet`);
  return { case_id: caseId, action: "released-packet-codec-roundtrip", bytes: frozen.byteLength };
}

function frozenParameter(
  frozenCases: ReadonlyMap<string, Readonly<Record<string, unknown>>> | undefined,
  caseId: string,
  name: string,
): Uint8Array {
  const parameters = frozenCases?.get(caseId);
  if (parameters === undefined) throw new Error(`suite plan does not contain required frozen case ${caseId}`);
  return hexParameter(parameters, name);
}

function expectProtocolFailure(operation: () => unknown, label: string): void {
  try {
    operation();
  } catch {
    return;
  }
  throw new Error(`${label} accepted invalid metadata`);
}

async function verifyAdapterTransportSession(
  transport: "tcp" | "quic",
  verifier: ((transport: "tcp" | "quic") => void | Promise<void>) | undefined,
): Promise<void> {
  if (verifier !== undefined) {
    await verifier(transport);
    return;
  }
  const { verifyNativeTransportCell } = await import("./check-native-transport-loopback.ts");
  await verifyNativeTransportCell(transport);
}

function roundTripControl(
  messageType: NnrpMessageType,
  metadata: RuntimeControlMetadata,
  tail = new Uint8Array(),
): Record<string, unknown> {
  const encoded = encodeRuntimeControlMetadata(messageType, metadata, tail);
  const decoded = decodeRuntimeControlMetadata(messageType, encoded);
  assertEquivalent(decoded.metadata, metadata, `${NnrpMessageType[messageType]} metadata`);
  assertBytes(decoded.tail, tail, `${NnrpMessageType[messageType]} tail`);
  return { message_type: messageType, bytes: encoded.byteLength };
}

function roundTripObject(
  messageType: NnrpMessageType,
  metadata: RuntimeObjectMetadata,
  tail = new Uint8Array(),
): Record<string, unknown> {
  const encoded = encodeRuntimeObjectMetadata(messageType, metadata, tail);
  const decoded = decodeRuntimeObjectMetadata(messageType, encoded);
  assertEquivalent(decoded.metadata, metadata, `${NnrpMessageType[messageType]} metadata`);
  assertBytes(decoded.tail, tail, `${NnrpMessageType[messageType]} tail`);
  return { message_type: messageType, bytes: encoded.byteLength };
}

function capabilityMetadata(preferenceRank: number): RuntimeControlMetadata {
  return {
    profileId: 3,
    capabilityCount: 2,
    costModelId: 4,
    preferenceRank,
    limitBytes: 99n,
    limitUnits: 88n,
    bodyBytes: 2,
    flags: 0,
  };
}

function pressureMetadata(): RuntimeControlMetadata {
  return {
    scopeId: 10n,
    creditWindow: 4n,
    pressureLevel: 2,
    pressureReason: 1,
    retryAfterMs: 5,
    flags: 0,
  };
}

function routeMetadata(routeId: number): RuntimeControlMetadata {
  return {
    operationId: 10n,
    routeId,
    executorClass: 2,
    affinityClass: 3,
    deadlineUnixMs: 0n,
    bodyBytes: 2,
    flags: 0,
  };
}

function evidence(
  caseId: Preview4ImplementedCaseId,
  frames: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return { case_id: caseId, action: "codec-roundtrip", frames };
}

function assertEquivalent(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(stableValue(actual)) !== JSON.stringify(stableValue(expected))) {
    throw new Error(`${label} changed during roundtrip`);
  }
}

function assertBytes(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} changed during roundtrip`);
  }
}

interface BaselineTypedPayloadDescriptor {
  readonly payloadKind: NnrpPayloadKind;
  readonly profileId: number;
  readonly offset: number;
  readonly length: number;
}

function encodeBaselineTypedPayloadDescriptor(descriptor: BaselineTypedPayloadDescriptor): Uint8Array {
  validateBaselinePayloadKind(descriptor.payloadKind);
  const encoded = new Uint8Array(16);
  const view = new DataView(encoded.buffer);
  view.setUint8(0, descriptor.payloadKind);
  view.setUint16(2, descriptor.profileId, true);
  view.setUint32(4, descriptor.offset, true);
  view.setUint32(8, descriptor.length, true);
  return encoded;
}

function decodeBaselineTypedPayloadDescriptor(source: Uint8Array): BaselineTypedPayloadDescriptor {
  if (source.byteLength !== 16) throw new RangeError("NNRP/1 baseline typed-payload descriptor must be 16 bytes");
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const payloadKind = view.getUint8(0) as NnrpPayloadKind;
  validateBaselinePayloadKind(payloadKind);
  if (view.getUint8(1) !== 0 || view.getUint32(12, true) !== 0) {
    throw new RangeError("NNRP/1 baseline typed-payload descriptor reserved fields must be zero");
  }
  return {
    payloadKind,
    profileId: view.getUint16(2, true),
    offset: view.getUint32(4, true),
    length: view.getUint32(8, true),
  };
}

function decodeBaselineTypedPayloadRegion(
  descriptorRegion: Uint8Array,
  payloadRegion: Uint8Array,
): readonly BaselineTypedPayloadDescriptor[] {
  if (descriptorRegion.byteLength % 16 !== 0) {
    throw new RangeError("NNRP/1 baseline descriptor region length must be a multiple of 16 bytes");
  }
  const descriptors: BaselineTypedPayloadDescriptor[] = [];
  let nextOffset = 0;
  for (let offset = 0; offset < descriptorRegion.byteLength; offset += 16) {
    const descriptor = decodeBaselineTypedPayloadDescriptor(descriptorRegion.slice(offset, offset + 16));
    if (descriptor.offset !== nextOffset) throw new RangeError("NNRP/1 baseline descriptors must be contiguous");
    nextOffset = descriptor.offset + descriptor.length;
    if (nextOffset > payloadRegion.byteLength) throw new RangeError("NNRP/1 baseline range exceeds payload region");
    descriptors.push(descriptor);
  }
  if (nextOffset !== payloadRegion.byteLength) {
    throw new RangeError("NNRP/1 baseline descriptors must cover payload region");
  }
  return descriptors;
}

function validateBaselinePayloadKind(payloadKind: NnrpPayloadKind): void {
  const raw = Number(payloadKind);
  if (raw === 0 || (raw & (raw - 1)) !== 0 || (raw & ~0x7f) !== 0) {
    throw new RangeError("NNRP/1 baseline payload kind is invalid");
  }
}

function hexBytes(value: string): Uint8Array {
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) {
    throw new RangeError("hex input must contain complete hexadecimal bytes");
  }
  return Uint8Array.from(value.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

function hexParameter(parameters: Readonly<Record<string, unknown>>, name: string): Uint8Array {
  const value = parameters[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new RangeError(`frozen adapter parameter ${name} must be a non-empty hexadecimal string`);
  }
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) {
    throw new RangeError(`frozen adapter parameter ${name} must contain complete hexadecimal bytes`);
  }
  return hexBytes(value);
}

function bytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(new TextEncoder().encode(value));
}

function concat(...values: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function safeFileStem(caseId: string): string {
  return caseId.replaceAll(/[^A-Za-z0-9_-]/g, "-");
}

function stableValue(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
