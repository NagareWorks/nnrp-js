import {
  CacheMissReason,
  CacheReuseScope,
  decodeCacheInvalidateMetadata,
  decodeRuntimeControlMetadata,
  decodeRuntimeObjectMetadata,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  encodeRuntimeObjectMetadataSegments,
  ErrorScope,
  MemoryLocationHint,
  NnrpMessageType,
  ObjectReleaseReason,
  OwnershipHint,
  type RuntimeControlMetadata,
  RuntimeObjectKind,
  type RuntimeObjectMetadata,
  RuntimeRole,
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
  readonly evidenceDirectory?: string;
}

export async function executePreview4AdapterPlan(
  value: unknown,
  options: Preview4AdapterExecutionOptions = {},
): Promise<Preview4AdapterResults> {
  const plan = parsePreview4AdapterPlan(value);
  const evidenceDirectory = options.evidenceDirectory ?? plan.artifacts.evidence_dir;
  const results: Preview4AdapterCaseResult[] = [];
  for (const { id } of plan.cases) {
    results.push(
      await executePreview4ImplementedCase(id as Preview4AdapterCaseId, evidenceDirectory, options.verifyHeader),
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
): Promise<Preview4AdapterCaseResult> {
  try {
    const evidence = await CASE_EXECUTORS[caseId](verifyHeader);
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
  Record<Preview4ImplementedCaseId, (verifyHeader?: () => void | Promise<void>) => unknown | Promise<unknown>>
> = {
  "l0.header.fixed_shape.golden": async (verifyHeader) => {
    if (verifyHeader !== undefined) {
      await verifyHeader();
    } else {
      const { verifyNativeRuntimeFrame } = await import("./check-native-runtime-frame.ts");
      await verifyNativeRuntimeFrame();
    }
    return { case_id: "l0.header.fixed_shape.golden", action: "native-runtime-frame-roundtrip", header_bytes: 40 };
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
