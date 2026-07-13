export const NNRP_PROTOCOL_NAME = "NNRP";
export const NNRP_PROTOCOL_VERSION = "1.0.0";

export enum NnrpMessageType {
  ClientHello = 0x01,
  ServerHelloAck = 0x02,
  SessionPatch = 0x03,
  SessionPatchAck = 0x04,
  Close = 0x05,
  Error = 0x06,
  SessionOpen = 0x07,
  SessionOpenAck = 0x08,
  SessionClose = 0x09,
  SessionCloseAck = 0x0a,
  FrameSubmit = 0x10,
  FrameCancel = 0x11,
  ResultPush = 0x12,
  ResultDrop = 0x13,
  CachePut = 0x14,
  CacheAck = 0x15,
  CacheInvalidate = 0x16,
  FlowUpdate = 0x17,
  ResultHint = 0x18,
  TransportProbe = 0x19,
  TransportProbeAck = 0x1a,
  SessionMigrate = 0x1b,
  SessionMigrateAck = 0x1c,
  Ping = 0x20,
  Pong = 0x21,
  Cancel = 0x30,
  Abort = 0x31,
  PriorityUpdate = 0x32,
  Deadline = 0x33,
  ExpireAt = 0x34,
  Supersede = 0x35,
  BudgetUpdate = 0x36,
  Progress = 0x37,
  PartialResult = 0x38,
  Backpressure = 0x39,
  CreditUpdate = 0x3a,
  CapabilityNegotiation = 0x3b,
  DegradeProfile = 0x3c,
  RouteHint = 0x3d,
  ExecutionHint = 0x3e,
  TraceContext = 0x3f,
  ResultDropReason = 0x40,
  ObjectDeclare = 0x41,
  ObjectRef = 0x42,
  ObjectRelease = 0x43,
  ObjectPatch = 0x44,
  ObjectDelta = 0x45,
  CacheReference = 0x46,
  CacheMiss = 0x47,
  ErrorRecoverable = 0x48,
  RetryAfter = 0x49,
}

export enum RuntimeRole {
  Unspecified = 0,
  Client = 1,
  Server = 2,
  Runtime = 3,
  Subagent = 4,
  Tool = 5,
  Scheduler = 6,
  ConformanceRunner = 7,
}

export enum ErrorScope {
  Connection = 0,
  Session = 1,
  Frame = 2,
}

export enum RuntimeObjectKind {
  Unspecified = 0x0000,
  Tensor = 0x0001,
  TokenBlock = 0x0002,
  ImageTile = 0x0003,
  FeatureMap = 0x0004,
  ToolResult = 0x0005,
  TraceSegment = 0x0006,
  OpaqueBytes = 0x0007,
  DocumentChunk = 0x0008,
  AudioChunk = 0x0009,
  VideoChunk = 0x000a,
  RoutePlan = 0x000b,
  CacheManifest = 0x000c,
}

export enum MemoryLocationHint {
  Unspecified = 0x0000,
  HostMemory = 0x0001,
  DeviceMemory = 0x0002,
  SharedMemory = 0x0003,
  RemoteMemory = 0x0004,
  MmapFile = 0x0005,
  ObjectStore = 0x0006,
}

export enum OwnershipHint {
  Unspecified = 0x0000,
  ProducerOwned = 0x0001,
  ConsumerOwned = 0x0002,
  SessionOwned = 0x0003,
  Borrowed = 0x0004,
  TransferOnRef = 0x0005,
  ReleaseOnDrop = 0x0006,
}

export enum ObjectReleaseReason {
  Completed = 0x0000,
  Cancelled = 0x0001,
  Expired = 0x0002,
  Replaced = 0x0003,
  Invalidated = 0x0004,
  OwnerClosed = 0x0005,
  LeaseExpired = 0x0006,
  ConformanceInjection = 0x0007,
}

export enum CacheReuseScope {
  Operation = 0x0000,
  Session = 0x0001,
  Connection = 0x0002,
  Global = 0x0003,
  Tenant = 0x0004,
  Profile = 0x0005,
}

export enum CacheMissReason {
  Unknown = 0x0000,
  NotFound = 0x0001,
  Expired = 0x0002,
  Invalidated = 0x0003,
  SchemaMismatch = 0x0004,
  ProducerUnavailable = 0x0005,
  LeaseRequired = 0x0006,
  PermissionDenied = 0x0007,
}

export interface ObjectDescriptorMetadata {
  readonly objectId: bigint;
  readonly objectKind: RuntimeObjectKind;
  readonly producerRole: RuntimeRole;
  readonly consumerRole: RuntimeRole;
  readonly sessionId: number;
  readonly byteSize: bigint;
  readonly computeCostUnits: number;
  readonly memoryLocationHint: MemoryLocationHint;
  readonly ownershipHint: OwnershipHint;
  readonly lifetimeHintMs: number;
  readonly metadataBytes: number;
}

export interface ObjectReferenceMetadata {
  readonly objectId: bigint;
  readonly operationId: bigint;
  readonly objectVersion: bigint;
  readonly offset: bigint;
  readonly length: bigint;
  readonly flags: number;
  readonly metadataBytes: number;
}

export interface ObjectReleaseMetadata {
  readonly objectId: bigint;
  readonly operationId: bigint;
  readonly releaseReason: ObjectReleaseReason;
  readonly sourceRole: RuntimeRole;
  readonly flags: number;
  readonly diagnosticBytes: number;
}

export interface ObjectDeltaMetadata {
  readonly objectId: bigint;
  readonly deltaSequence: bigint;
  readonly regionOffset: bigint;
  readonly regionBytes: number;
  readonly deltaBytes: number;
  readonly flags: number;
  readonly metadataBytes: number;
}

export interface CacheReferenceMetadata {
  readonly cacheKeyHi: bigint;
  readonly cacheKeyLo: bigint;
  readonly profileId: number;
  readonly reuseScope: CacheReuseScope;
  readonly leaseId: bigint;
  readonly producerTraceId: bigint;
  readonly expirationHintMs: number;
  readonly metadataBytes: number;
  readonly flags: number;
}

export interface CacheMissMetadata {
  readonly cacheKeyHi: bigint;
  readonly cacheKeyLo: bigint;
  readonly missReason: CacheMissReason;
  readonly profileId: number;
  readonly diagnosticBytes: number;
}

export type RuntimeObjectMetadata =
  | ObjectDescriptorMetadata
  | ObjectReferenceMetadata
  | ObjectReleaseMetadata
  | ObjectDeltaMetadata
  | CacheReferenceMetadata
  | CacheMissMetadata;

export interface DecodedRuntimeObjectMetadata {
  readonly metadata: RuntimeObjectMetadata;
  readonly tail: Uint8Array;
}

export interface CacheInvalidateMetadata {
  readonly invalidateScope: number;
  readonly cacheNamespace: number;
  readonly cacheKeyHi: number;
  readonly cacheKeyLo: number;
  readonly reasonCode: number;
}

interface NnrpRuntimeFrameEventBase<
  TType extends string,
  TMessageType extends NnrpMessageType,
  TMetadata,
> {
  readonly type: TType;
  readonly messageType: TMessageType;
  readonly metadata: TMetadata;
  readonly sessionId?: string;
}

type NnrpRuntimeFrameEventWithTail<
  TType extends string,
  TMessageType extends NnrpMessageType,
  TMetadata,
  TTail extends string,
> =
  & NnrpRuntimeFrameEventBase<TType, TMessageType, TMetadata>
  & Readonly<Partial<Record<TTail, Uint8Array>>>;

export type NnrpRuntimeFrameEvent =
  | NnrpRuntimeFrameEventWithTail<"cancel", NnrpMessageType.Cancel, ControlRequestMetadata, "diagnostic">
  | NnrpRuntimeFrameEventWithTail<"abort", NnrpMessageType.Abort, ControlRequestMetadata, "diagnostic">
  | NnrpRuntimeFrameEventBase<"priority-update", NnrpMessageType.PriorityUpdate, SchedulingMetadata>
  | NnrpRuntimeFrameEventBase<"deadline", NnrpMessageType.Deadline, SchedulingMetadata>
  | NnrpRuntimeFrameEventBase<"expire-at", NnrpMessageType.ExpireAt, SchedulingMetadata>
  | NnrpRuntimeFrameEventWithTail<"supersede", NnrpMessageType.Supersede, SupersedeMetadata, "diagnostic">
  | NnrpRuntimeFrameEventBase<"budget-update", NnrpMessageType.BudgetUpdate, BudgetMetadata>
  | NnrpRuntimeFrameEventWithTail<"progress", NnrpMessageType.Progress, ProgressMetadata, "body">
  | NnrpRuntimeFrameEventWithTail<"partial-result", NnrpMessageType.PartialResult, PartialResultMetadata, "body">
  | NnrpRuntimeFrameEventBase<"backpressure", NnrpMessageType.Backpressure, PressureMetadata>
  | NnrpRuntimeFrameEventBase<"credit-update", NnrpMessageType.CreditUpdate, PressureMetadata>
  | NnrpRuntimeFrameEventWithTail<
    "capability-negotiation",
    NnrpMessageType.CapabilityNegotiation,
    CapabilityMetadata,
    "body"
  >
  | NnrpRuntimeFrameEventWithTail<"degrade-profile", NnrpMessageType.DegradeProfile, CapabilityMetadata, "body">
  | NnrpRuntimeFrameEventWithTail<"route-hint", NnrpMessageType.RouteHint, RouteHintMetadata, "body">
  | NnrpRuntimeFrameEventWithTail<"execution-hint", NnrpMessageType.ExecutionHint, RouteHintMetadata, "body">
  | NnrpRuntimeFrameEventWithTail<"trace-context", NnrpMessageType.TraceContext, TraceContextMetadata, "body">
  | NnrpRuntimeFrameEventWithTail<
    "result-drop-reason",
    NnrpMessageType.ResultDropReason,
    ResultDropReasonMetadata,
    "diagnostic"
  >
  | NnrpRuntimeFrameEventWithTail<
    "recoverable-error",
    NnrpMessageType.ErrorRecoverable,
    RecoverableErrorMetadata,
    "diagnostic"
  >
  | NnrpRuntimeFrameEventWithTail<"retry-after", NnrpMessageType.RetryAfter, RetryAfterMetadata, "diagnostic">
  | NnrpRuntimeFrameEventWithTail<
    "object-declare",
    NnrpMessageType.ObjectDeclare,
    ObjectDescriptorMetadata,
    "body"
  >
  | NnrpRuntimeFrameEventWithTail<"object-ref", NnrpMessageType.ObjectRef, ObjectReferenceMetadata, "body">
  | NnrpRuntimeFrameEventWithTail<
    "object-release",
    NnrpMessageType.ObjectRelease,
    ObjectReleaseMetadata,
    "diagnostic"
  >
  | (NnrpRuntimeFrameEventBase<"object-patch", NnrpMessageType.ObjectPatch, ObjectDeltaMetadata> & {
    readonly metadataBody?: Uint8Array;
    readonly delta?: Uint8Array;
  })
  | (NnrpRuntimeFrameEventBase<"object-delta", NnrpMessageType.ObjectDelta, ObjectDeltaMetadata> & {
    readonly metadataBody?: Uint8Array;
    readonly delta?: Uint8Array;
  })
  | NnrpRuntimeFrameEventWithTail<
    "cache-reference",
    NnrpMessageType.CacheReference,
    CacheReferenceMetadata,
    "body"
  >
  | NnrpRuntimeFrameEventWithTail<"cache-miss", NnrpMessageType.CacheMiss, CacheMissMetadata, "diagnostic">
  | NnrpRuntimeFrameEventBase<"cache-invalidate", NnrpMessageType.CacheInvalidate, CacheInvalidateMetadata>;

export interface ControlRequestMetadata {
  readonly operationId: bigint;
  readonly controlSequence: bigint;
  readonly reasonCode: number;
  readonly sourceRole: RuntimeRole;
  readonly flags: number;
  readonly diagnosticBytes: number;
}

export interface SchedulingMetadata {
  readonly operationId: bigint;
  readonly controlSequence: bigint;
  readonly priorityClass: number;
  readonly priorityDelta: number;
  readonly deadlineUnixMs: bigint;
  readonly flags: number;
}

export interface SupersedeMetadata {
  readonly oldOperationId: bigint;
  readonly newOperationId: bigint;
  readonly controlSequence: bigint;
  readonly dropReasonCode: number;
  readonly flags: number;
  readonly diagnosticBytes: number;
}

export interface BudgetMetadata {
  readonly operationId: bigint;
  readonly computeBudgetUnits: bigint;
  readonly memoryBudgetBytes: bigint;
  readonly bandwidthBudgetBytes: bigint;
  readonly tokenBudget: number;
  readonly flags: number;
}

export interface ProgressMetadata {
  readonly operationId: bigint;
  readonly progressSequence: bigint;
  readonly stageCode: number;
  readonly percentX100: number;
  readonly objectId: bigint;
  readonly bodyBytes: number;
}

export interface PartialResultMetadata {
  readonly operationId: bigint;
  readonly resultSequence: bigint;
  readonly objectId: bigint;
  readonly deltaSequence: bigint;
  readonly bodyBytes: number;
  readonly flags: number;
}

export interface PressureMetadata {
  readonly scopeId: bigint;
  readonly creditWindow: bigint;
  readonly pressureLevel: number;
  readonly pressureReason: number;
  readonly retryAfterMs: number;
  readonly flags: number;
}

export interface CapabilityMetadata {
  readonly profileId: number;
  readonly capabilityCount: number;
  readonly costModelId: number;
  readonly preferenceRank: number;
  readonly limitBytes: bigint;
  readonly limitUnits: bigint;
  readonly bodyBytes: number;
  readonly flags: number;
}

export interface RouteHintMetadata {
  readonly operationId: bigint;
  readonly routeId: number;
  readonly executorClass: number;
  readonly affinityClass: number;
  readonly deadlineUnixMs: bigint;
  readonly bodyBytes: number;
  readonly flags: number;
}

export interface TraceContextMetadata {
  readonly traceId: bigint;
  readonly spanId: bigint;
  readonly parentSpanId: bigint;
  readonly stageCode: number;
  readonly flags: number;
  readonly bodyBytes: number;
}

export interface ResultDropReasonMetadata {
  readonly operationId: bigint;
  readonly resultSequence: bigint;
  readonly dropReasonCode: number;
  readonly sourceRole: RuntimeRole;
  readonly flags: number;
  readonly diagnosticBytes: number;
}

export interface RecoverableErrorMetadata {
  readonly errorCode: number;
  readonly errorScope: ErrorScope;
  readonly recoveryAction: number;
  readonly sourceRole: RuntimeRole;
  readonly flags: number;
  readonly retryAfterMs: number;
  readonly relatedSessionId: number;
  readonly relatedFrameId: number;
  readonly relatedViewId: number;
  readonly diagnosticBytes: number;
}

export interface RetryAfterMetadata {
  readonly scopeId: bigint;
  readonly controlSequence: bigint;
  readonly retryAfterMs: number;
  readonly jitterMs: number;
  readonly reasonCode: number;
  readonly sourceRole: RuntimeRole;
  readonly flags: number;
  readonly diagnosticBytes: number;
}

export type RuntimeControlMetadata =
  | ControlRequestMetadata
  | SchedulingMetadata
  | SupersedeMetadata
  | BudgetMetadata
  | ProgressMetadata
  | PartialResultMetadata
  | PressureMetadata
  | CapabilityMetadata
  | RouteHintMetadata
  | TraceContextMetadata
  | ResultDropReasonMetadata
  | RecoverableErrorMetadata
  | RetryAfterMetadata;

export interface DecodedRuntimeControlMetadata {
  readonly metadata: RuntimeControlMetadata;
  readonly tail: Uint8Array;
}

export type NnrpBuildMode = "backend-native" | "browser-wasm";

export type NnrpTransportKind = "tcp" | "quic" | "ipc" | "websocket";

export type NnrpTransportPolicy =
  | "auto"
  | "prefer-quic"
  | "prefer-tcp"
  | "prefer-ipc"
  | "prefer-websocket"
  | "force-quic"
  | "force-tcp"
  | "force-ipc"
  | "force-websocket";

export type NnrpOperationId = bigint;

export type NnrpOperationState = "pending" | "dispatched" | "completed" | "dropped" | "cancelled";

export type NnrpCapability =
  | "client.session"
  | "server.session"
  | "native.loader"
  | "wasm.loader"
  | "transport.tcp"
  | "transport.quic"
  | "transport.ipc"
  | "transport.websocket"
  | "flow.update"
  | "result.hint"
  | "cache"
  | "schema"
  | "recovery"
  | "control.cancel_abort"
  | "control.supersede"
  | "control.priority_update"
  | "control.deadline_expire"
  | "control.progress_partial"
  | "control.credit_backpressure"
  | "control.capability_costs"
  | "control.route_execution_hint"
  | "control.trace_context"
  | "control.result_drop_reason"
  | "control.degrade_profile"
  | "control.budget_update"
  | "control.recoverable_error"
  | "control.retry_after"
  | "object.lifecycle"
  | "object.delta"
  | "object.cost"
  | "object.ownership"
  | "cache.reference";

const NNRP_CAPABILITY_TOKENS = new Set<NnrpCapability>([
  "client.session",
  "server.session",
  "native.loader",
  "wasm.loader",
  "transport.tcp",
  "transport.quic",
  "transport.ipc",
  "transport.websocket",
  "flow.update",
  "result.hint",
  "cache",
  "schema",
  "recovery",
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
  "object.lifecycle",
  "object.delta",
  "object.cost",
  "object.ownership",
  "cache.reference",
]);

export type NnrpDiagnosticSource = "core" | "native" | "wasm" | "transport" | "protocol" | "runtime";

export interface NnrpDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly source: NnrpDiagnosticSource;
  readonly retryable?: boolean;
  readonly transport?: NnrpTransportKind;
  readonly cause?: unknown;
}

export interface NnrpCapabilityManifest {
  readonly protocol: typeof NNRP_PROTOCOL_NAME;
  readonly version: string;
  readonly buildMode: NnrpBuildMode;
  readonly transports: readonly NnrpTransportKind[];
  readonly capabilities: readonly NnrpCapability[];
}

export type NnrpTransportRejectionReason =
  | "peer-unsupported"
  | "local-unavailable"
  | "policy-rejected"
  | "probe-failed";

export interface NnrpTransportCandidate {
  readonly kind: NnrpTransportKind;
  readonly peerSupported: boolean;
  readonly localAvailable: boolean;
  readonly score: number;
  readonly rejectionReason?: NnrpTransportRejectionReason;
  readonly diagnostic?: NnrpDiagnostic;
}

export interface NnrpTransportEndpoint {
  readonly endpoint: string | URL;
}

const NNRP_DEFAULT_PORT = 4433;

export interface NnrpTransportConnection {
  readonly kind: NnrpTransportKind;
  readonly endpoint: string;
  readonly connected: boolean;
  send(payload: Uint8Array): void | Promise<void>;
  close(): void | Promise<void>;
}

export interface NnrpTransportServer {
  readonly kind: NnrpTransportKind;
  readonly endpoint: string;
  readonly listening: boolean;
  close(): void | Promise<void>;
}

export interface NnrpTransportProvider {
  readonly kind: NnrpTransportKind;
  readonly endpointSchemes: readonly string[];
  probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
  connect?(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
  listen?(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}

export interface NnrpTransportSelection {
  readonly selected: NnrpTransportCandidate | null;
  readonly candidates: readonly NnrpTransportCandidate[];
  readonly policy: NnrpTransportPolicy;
}

export interface NnrpTransportCandidateOptions {
  readonly local: NnrpCapabilityManifest;
  readonly peer: NnrpCapabilityManifest;
  readonly scores?: Readonly<Partial<Record<NnrpTransportKind, number>>>;
}

export interface NnrpTransportSelectionSummary {
  readonly policy: NnrpTransportPolicy;
  readonly selected: NnrpTransportKind | null;
  readonly rejected: readonly NnrpRejectedTransportCandidate[];
  readonly candidates: readonly NnrpTransportCandidate[];
}

export interface NnrpRejectedTransportCandidate {
  readonly kind: NnrpTransportKind;
  readonly reason: NnrpTransportRejectionReason;
  readonly score: number;
  readonly diagnostic?: NnrpDiagnostic;
}

export const NNRP_STANDARD_INPUT_PROFILES = ["tensor", "token", "structured_event", "tool_delta"] as const;

export type NnrpInputProfile = (typeof NNRP_STANDARD_INPUT_PROFILES)[number];

export type NnrpSubmitMode = "inline" | "object-reference";

export type NnrpSubmitCapacityPolicy = "immediate" | "await-credit";

export type NnrpBinaryPayload = Uint8Array | ArrayBufferView;

export type NnrpCacheObjectKind = "tensor" | "token" | "schema" | "artifact" | "tool";

export interface NnrpTensorSection {
  readonly payload: NnrpBinaryPayload;
  readonly codecId?: number;
}

export interface NnrpCacheKey {
  readonly kind: NnrpCacheObjectKind;
  readonly key: bigint | number | string;
  readonly namespaceId?: number;
}

export interface NnrpCacheMetadata {
  readonly key: NnrpCacheKey;
  readonly version?: bigint | number | string;
  readonly leaseMillis?: number;
  readonly dependencies?: readonly NnrpCacheKey[];
}

export type NnrpCacheOperationStatus = "accepted" | "stored" | "invalidated" | "miss" | "rejected";

export interface NnrpCachePutRequest {
  readonly key: NnrpCacheKey;
  readonly payload?: NnrpBinaryPayload;
  readonly descriptor?: NnrpPayloadDescriptor;
  readonly leaseMillis?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpCachePutResult {
  readonly key: NnrpCacheKey;
  readonly status: Extract<NnrpCacheOperationStatus, "accepted" | "stored" | "rejected">;
  readonly version?: bigint | number | string;
  readonly diagnostic?: NnrpDiagnostic;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpCacheInvalidateRequest {
  readonly key: NnrpCacheKey;
  readonly version?: bigint | number | string;
  readonly recursive?: boolean;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpCacheInvalidateResult {
  readonly key: NnrpCacheKey;
  readonly status: Extract<NnrpCacheOperationStatus, "invalidated" | "miss" | "rejected">;
  readonly diagnostic?: NnrpDiagnostic;
  readonly metadata?: Readonly<Record<string, string>>;
}

export type NnrpSchemaFlag = "required" | "streamable" | "lossless" | "opaque";

export interface NnrpSchemaDescriptor {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly flags?: readonly NnrpSchemaFlag[];
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpPayloadDescriptor {
  readonly profile: NnrpInputProfile;
  readonly schema?: NnrpSchemaDescriptor;
  readonly cache?: NnrpCacheMetadata;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpSubmitRequest {
  readonly frameId: number;
  readonly payload?: NnrpBinaryPayload;
  readonly tensors?: readonly NnrpTensorSection[];
  readonly inputProfile?: NnrpInputProfile;
  readonly submitMode?: NnrpSubmitMode;
  readonly cacheKey?: NnrpCacheKey;
  readonly descriptor?: NnrpPayloadDescriptor;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpNormalizedTensorSection {
  readonly payload: Uint8Array;
  readonly codecId?: number;
}

export interface NnrpNormalizedSubmitRequest {
  readonly frameId: number;
  readonly payload?: Uint8Array;
  readonly tensors?: readonly NnrpNormalizedTensorSection[];
  readonly inputProfile?: NnrpInputProfile;
  readonly submitMode?: NnrpSubmitMode;
  readonly cacheKey?: NnrpCacheKey;
  readonly descriptor?: NnrpPayloadDescriptor;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpResult {
  readonly frameId: number;
  readonly payload?: Uint8Array;
  readonly diagnostic?: NnrpDiagnostic;
  readonly sessionId?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpRecoveryToken {
  readonly token: string | Uint8Array;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpSessionMigrationRequest {
  readonly recoveryToken: NnrpRecoveryToken;
  readonly targetEndpoint?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export type NnrpSessionMigrationEvent =
  | {
    readonly type: "migration-requested";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | {
    readonly type: "migration-accepted";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | {
    readonly type: "migration-rejected";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic: NnrpDiagnostic;
  };

export type NnrpRuntimeEvent =
  | {
    readonly type: "submit";
    readonly submit: NnrpNormalizedSubmitRequest;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | { readonly type: "result"; readonly result: NnrpResult; readonly sessionId?: string }
  | {
    readonly type: "flow-update";
    readonly update: NnrpFlowUpdateMetadata;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | {
    readonly type: "result-hint";
    readonly hint: NnrpResultHintMetadata;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | {
    readonly type: "drop";
    readonly frameId: number;
    readonly sessionId?: string;
    readonly diagnostic: NnrpDiagnostic;
  }
  | NnrpSessionMigrationEvent
  | NnrpRuntimeFrameEvent
  | { readonly type: "close"; readonly sessionId?: string; readonly diagnostic?: NnrpDiagnostic }
  | { readonly type: "diagnostic"; readonly sessionId?: string; readonly diagnostic: NnrpDiagnostic };

export interface NnrpFlowUpdateMetadata {
  readonly credits: number;
  readonly recommendedPacingMicros?: number;
  readonly transport?: NnrpTransportKind;
}

export interface NnrpResultHintMetadata {
  readonly frameId: number;
  readonly expectedBytes?: number;
  readonly transport?: NnrpTransportKind;
}

export interface NnrpAbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener?(type: "abort", listener: () => void, options?: { readonly once?: boolean }): void;
  removeEventListener?(type: "abort", listener: () => void): void;
}

export interface NnrpEventPollOptions {
  readonly timeoutMillis?: number;
  readonly signal?: NnrpAbortSignalLike;
}

export interface NnrpSessionMetadataOptions {
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpSessionFlowControlOptions {
  readonly submitCapacityPolicy?: NnrpSubmitCapacityPolicy;
  readonly initialCredits?: number;
}

export interface NnrpSessionPatchRequest extends NnrpSessionMetadataOptions, NnrpSessionFlowControlOptions {
  readonly inputProfile?: NnrpInputProfile;
  readonly targetCadence?: number;
  readonly qualityTier?: number;
}

export interface NnrpSessionPatchResult {
  readonly accepted: boolean;
  readonly sessionId?: string;
  readonly diagnostic?: NnrpDiagnostic;
  readonly metadata?: Readonly<Record<string, string>>;
}

export class NnrpError extends Error {
  public readonly diagnostic: NnrpDiagnostic;

  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic.message);
    this.name = "NnrpError";
    this.diagnostic = diagnostic;
  }
}

export class NnrpCapabilityError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpCapabilityError";
  }
}

export class NnrpTransportError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpTransportError";
  }
}

export class NnrpTimeoutError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpTimeoutError";
  }
}

export class NnrpProtocolError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpProtocolError";
  }
}

export function encodeRuntimeControlMetadata(
  messageType: NnrpMessageType,
  metadata: RuntimeControlMetadata,
  tail: Uint8Array = new Uint8Array(),
): Uint8Array {
  const layout = getRuntimeControlLayout(messageType);
  if (!(tail instanceof Uint8Array)) {
    throw runtimeControlError("NNRP_CONTROL_TAIL_INVALID", "Runtime control tail must be a Uint8Array.");
  }

  validateRuntimeControlMetadata(layout, metadata);
  const ownedTail = tail.slice();
  validateRuntimeControlTail(layout, metadata, ownedTail.byteLength);

  const encoded = new Uint8Array(layout.length + ownedTail.byteLength);
  const view = new DataView(encoded.buffer);
  const values = metadata as unknown as Record<string, unknown>;
  for (const field of layout.fields) {
    writeRuntimeInteger(view, field, values[field.name]);
  }
  encoded.set(ownedTail, layout.length);
  return encoded;
}

export function decodeRuntimeControlMetadata(
  messageType: NnrpMessageType,
  payload: Uint8Array,
): DecodedRuntimeControlMetadata {
  const layout = getRuntimeControlLayout(messageType);
  if (!(payload instanceof Uint8Array)) {
    throw runtimeControlError("NNRP_CONTROL_PAYLOAD_INVALID", "Runtime control payload must be a Uint8Array.");
  }
  if (payload.byteLength < layout.length) {
    throw runtimeControlError(
      "NNRP_CONTROL_METADATA_TRUNCATED",
      `Runtime control metadata requires ${layout.length} bytes but received ${payload.byteLength}.`,
    );
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (const reserved of layout.reserved ?? []) {
    const reservedValue = readRuntimeInteger(view, reserved);
    if (reservedValue !== 0 && reservedValue !== 0n) {
      throw runtimeControlError(
        "NNRP_CONTROL_RESERVED_NONZERO",
        `Runtime control reserved field at offset ${reserved.offset} must be zero.`,
      );
    }
  }

  const decoded: Record<string, bigint | number> = {};
  for (const field of layout.fields) {
    decoded[field.name] = readRuntimeInteger(view, field);
  }
  const metadata = decoded as unknown as RuntimeControlMetadata;
  validateRuntimeControlMetadata(layout, metadata);

  const tail = payload.slice(layout.length);
  validateRuntimeControlTail(layout, metadata, tail.byteLength);
  return { metadata, tail };
}

export function encodeRuntimeObjectMetadata(
  messageType: NnrpMessageType,
  metadata: RuntimeObjectMetadata,
  tail: Uint8Array = new Uint8Array(),
): Uint8Array {
  const layout = getRuntimeObjectLayout(messageType);
  if (!(tail instanceof Uint8Array)) {
    throw runtimeObjectError("NNRP_OBJECT_TAIL_INVALID", "Runtime object tail must be a Uint8Array.");
  }

  validateRuntimeObjectMetadata(layout, metadata);
  const ownedTail = tail.slice();
  validateRuntimeObjectTail(layout, metadata, ownedTail.byteLength);

  const encoded = new Uint8Array(layout.length + ownedTail.byteLength);
  const view = new DataView(encoded.buffer);
  const values = metadata as unknown as Record<string, unknown>;
  for (const field of layout.fields) {
    writeRuntimeInteger(view, field, values[field.name]);
  }
  encoded.set(ownedTail, layout.length);
  return encoded;
}

export function decodeRuntimeObjectMetadata(
  messageType: NnrpMessageType,
  payload: Uint8Array,
): DecodedRuntimeObjectMetadata {
  const layout = getRuntimeObjectLayout(messageType);
  if (!(payload instanceof Uint8Array)) {
    throw runtimeObjectError("NNRP_OBJECT_PAYLOAD_INVALID", "Runtime object payload must be a Uint8Array.");
  }
  if (payload.byteLength < layout.length) {
    throw runtimeObjectError(
      "NNRP_OBJECT_METADATA_TRUNCATED",
      `Runtime object metadata requires ${layout.length} bytes but received ${payload.byteLength}.`,
    );
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (const reserved of layout.reserved ?? []) {
    const reservedValue = readRuntimeInteger(view, reserved);
    if (reservedValue !== 0 && reservedValue !== 0n) {
      throw runtimeObjectError(
        "NNRP_OBJECT_RESERVED_NONZERO",
        `Runtime object reserved field at offset ${reserved.offset} must be zero.`,
      );
    }
  }

  const decoded: Record<string, bigint | number> = {};
  for (const field of layout.fields) {
    decoded[field.name] = readRuntimeInteger(view, field);
  }
  const metadata = decoded as unknown as RuntimeObjectMetadata;
  validateRuntimeObjectMetadata(layout, metadata);

  const tail = payload.slice(layout.length);
  validateRuntimeObjectTail(layout, metadata, tail.byteLength);
  return { metadata, tail };
}

export function encodeCacheInvalidateMetadata(metadata: CacheInvalidateMetadata): Uint8Array {
  validateCacheInvalidateMetadata(metadata);
  const encoded = new Uint8Array(20);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, metadata.invalidateScope, true);
  view.setUint32(4, metadata.cacheNamespace, true);
  view.setUint32(8, metadata.cacheKeyHi, true);
  view.setUint32(12, metadata.cacheKeyLo, true);
  view.setUint32(16, metadata.reasonCode, true);
  return encoded;
}

export function decodeCacheInvalidateMetadata(payload: Uint8Array): CacheInvalidateMetadata {
  if (!(payload instanceof Uint8Array)) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_PAYLOAD_INVALID",
      "Cache invalidate metadata must be a Uint8Array.",
    );
  }
  if (payload.byteLength !== 20) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_LENGTH_INVALID",
      `Cache invalidate metadata requires exactly 20 bytes but received ${payload.byteLength}.`,
    );
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const metadata: CacheInvalidateMetadata = {
    invalidateScope: view.getUint32(0, true),
    cacheNamespace: view.getUint32(4, true),
    cacheKeyHi: view.getUint32(8, true),
    cacheKeyLo: view.getUint32(12, true),
    reasonCode: view.getUint32(16, true),
  };
  validateCacheInvalidateMetadata(metadata);
  return metadata;
}

export class NnrpResultDropError extends NnrpProtocolError {
  public readonly frameId: number;
  public readonly sessionId?: string;

  public constructor(event: Extract<NnrpRuntimeEvent, { readonly type: "drop" }>) {
    super(event.diagnostic);
    this.name = "NnrpResultDropError";
    this.frameId = event.frameId;
    if (event.sessionId !== undefined) {
      this.sessionId = event.sessionId;
    }
  }
}

export class NnrpRecoveryError extends NnrpCapabilityError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpRecoveryError";
  }
}

export interface NnrpCapabilityManifestOptions {
  readonly buildMode: NnrpBuildMode;
  readonly transports?: readonly NnrpTransportKind[];
  readonly capabilities?: readonly NnrpCapability[];
}

export function createCapabilityManifest(options: NnrpCapabilityManifestOptions): NnrpCapabilityManifest {
  validateCapabilityManifestOptions(options);

  return {
    protocol: NNRP_PROTOCOL_NAME,
    version: NNRP_PROTOCOL_VERSION,
    buildMode: options.buildMode,
    transports: [...(options.transports ?? [])],
    capabilities: [...(options.capabilities ?? [])],
  };
}

export function createBackendNativeManifest(
  capabilities: readonly NnrpCapability[] = [],
): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp", "quic"],
    capabilities: ["client.session", "server.session", "native.loader", ...capabilities],
  });
}

export function createBrowserWasmManifest(
  capabilities: readonly NnrpCapability[] = [],
): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "browser-wasm",
    transports: ["websocket"],
    capabilities: ["client.session", "wasm.loader", ...capabilities],
  });
}

export function selectTransport(
  candidates: readonly NnrpTransportCandidate[],
  policy: NnrpTransportPolicy = "auto",
): NnrpTransportSelection {
  const annotatedCandidates = candidates
    .map((candidate) => annotateTransportCandidate(candidate, policy))
    .sort((left, right) => compareTransportCandidates(left, right, policy));
  const eligible = annotatedCandidates.filter((candidate) => candidate.rejectionReason === undefined);

  return {
    selected: eligible[0] ?? null,
    candidates: annotatedCandidates,
    policy,
  };
}

export function createTransportCandidates(
  options: NnrpTransportCandidateOptions,
): readonly NnrpTransportCandidate[] {
  const kinds = uniqueTransports([...options.local.transports, ...options.peer.transports]);

  return kinds.map((kind) => ({
    kind,
    peerSupported: options.peer.transports.includes(kind),
    localAvailable: options.local.transports.includes(kind),
    score: options.scores?.[kind] ?? defaultTransportScore(kind),
  }));
}

export function createTransportSelectionSummary(
  selection: NnrpTransportSelection,
): NnrpTransportSelectionSummary {
  return {
    policy: selection.policy,
    selected: selection.selected?.kind ?? null,
    rejected: selection.candidates
      .filter((
        candidate,
      ): candidate is NnrpTransportCandidate & { readonly rejectionReason: NnrpTransportRejectionReason } =>
        candidate.rejectionReason !== undefined
      )
      .map((candidate) => ({
        kind: candidate.kind,
        reason: candidate.rejectionReason,
        score: candidate.score,
        ...(candidate.diagnostic === undefined ? {} : { diagnostic: candidate.diagnostic }),
      })),
    candidates: [...selection.candidates],
  };
}

export function parseApplicationEndpoint(endpoint: string | URL): URL {
  const raw = normalizeEndpointValue(endpoint);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (cause) {
    throw invalidApplicationEndpoint("NNRP application endpoint is malformed.", cause);
  }

  if (parsed.protocol !== "nnrp:" && parsed.protocol !== "nnrps:") {
    throw invalidApplicationEndpoint("NNRP application endpoint must use nnrp:// or nnrps://.");
  }
  if (parsed.hostname.length === 0) {
    throw invalidApplicationEndpoint("NNRP application endpoint requires an authority host.");
  }

  return parsed;
}

export function resolveProviderEndpoint(
  endpoint: string | URL,
  transport: NnrpTransportKind,
  providerEndpoint?: string | URL,
): string {
  const applicationEndpoint = parseApplicationEndpoint(endpoint);

  switch (transport) {
    case "tcp":
    case "quic":
      return providerEndpoint === undefined
        ? applicationHostPort(applicationEndpoint)
        : parseHostPortProviderEndpoint(providerEndpoint, transport);
    case "ipc":
      return parseIpcProviderEndpoint(providerEndpoint, transport);
    case "websocket":
      return parseWebsocketProviderEndpoint(applicationEndpoint, providerEndpoint, transport);
  }
}

export interface NormalizeSubmitRequestOptions {
  readonly copyPayloads?: boolean;
  readonly strictProfiles?: boolean;
}

export function createCacheKey(
  kind: NnrpCacheObjectKind,
  key: bigint | number | string,
  namespaceId?: number,
): NnrpCacheKey {
  validateCacheKey({ kind, key, ...(namespaceId === undefined ? {} : { namespaceId }) });
  return { kind, key, ...(namespaceId === undefined ? {} : { namespaceId }) };
}

export function createSchemaDescriptor(descriptor: NnrpSchemaDescriptor): NnrpSchemaDescriptor {
  validateSchemaDescriptor(descriptor);
  return {
    id: descriptor.id,
    name: descriptor.name,
    version: descriptor.version,
    ...(descriptor.flags === undefined ? {} : { flags: [...descriptor.flags] }),
    ...(descriptor.metadata === undefined ? {} : { metadata: { ...descriptor.metadata } }),
  };
}

export function normalizeCachePutRequest(request: NnrpCachePutRequest): NnrpCachePutRequest {
  validateCacheKey(request.key);
  validateLeaseMillis(request.leaseMillis);

  return {
    key: createCacheKey(request.key.kind, request.key.key, request.key.namespaceId),
    ...(request.payload === undefined ? {} : { payload: normalizeBinaryPayload(request.payload, true) }),
    ...(request.descriptor === undefined ? {} : { descriptor: createPayloadDescriptor(request.descriptor) }),
    ...(request.leaseMillis === undefined ? {} : { leaseMillis: request.leaseMillis }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

export function normalizeCacheInvalidateRequest(
  request: NnrpCacheInvalidateRequest,
): NnrpCacheInvalidateRequest {
  validateCacheKey(request.key);

  return {
    key: createCacheKey(request.key.kind, request.key.key, request.key.namespaceId),
    ...(request.version === undefined ? {} : { version: request.version }),
    ...(request.recursive === undefined ? {} : { recursive: request.recursive }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

export function isStandardInputProfile(profile: string): profile is NnrpInputProfile {
  return (NNRP_STANDARD_INPUT_PROFILES as readonly string[]).includes(profile);
}

export function normalizeSubmitRequest(
  request: NnrpSubmitRequest,
  options: NormalizeSubmitRequestOptions = {},
): NnrpNormalizedSubmitRequest {
  validateSubmitRequestShape(request, options);

  const copyPayloads = options.copyPayloads ?? true;
  return {
    frameId: request.frameId,
    ...(request.payload === undefined ? {} : { payload: normalizeBinaryPayload(request.payload, copyPayloads) }),
    ...(request.tensors === undefined ? {} : {
      tensors: request.tensors.map((section) => ({
        payload: normalizeBinaryPayload(section.payload, copyPayloads),
        ...(section.codecId === undefined ? {} : { codecId: section.codecId }),
      })),
    }),
    ...(request.inputProfile === undefined ? {} : { inputProfile: request.inputProfile }),
    ...(request.submitMode === undefined ? {} : { submitMode: request.submitMode }),
    ...(request.cacheKey === undefined ? {} : { cacheKey: request.cacheKey }),
    ...(request.descriptor === undefined ? {} : { descriptor: createPayloadDescriptor(request.descriptor) }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

export function createRecoveryToken(
  token: string | NnrpBinaryPayload,
  metadata?: Readonly<Record<string, string>>,
): NnrpRecoveryToken {
  const normalized = typeof token === "string" ? token : normalizeBinaryPayload(token, true);
  validateRecoveryToken({ token: normalized, ...(metadata === undefined ? {} : { metadata }) });

  return {
    token: normalized,
    ...(metadata === undefined ? {} : { metadata: normalizeMetadataMap(metadata) }),
  };
}

export function normalizeSessionMigrationRequest(request: NnrpSessionMigrationRequest): NnrpSessionMigrationRequest {
  validateRecoveryToken(request.recoveryToken);
  if (request.metadata !== undefined) {
    normalizeMetadataMap(request.metadata);
  }

  return {
    recoveryToken: createRecoveryToken(request.recoveryToken.token, request.recoveryToken.metadata),
    ...(request.targetEndpoint === undefined ? {} : { targetEndpoint: request.targetEndpoint }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

export function throwIfResultDrop(event: NnrpRuntimeEvent): void {
  if (event.type === "drop") {
    throw new NnrpResultDropError(event);
  }
}

export function validateEventPollOptions(options: NnrpEventPollOptions = {}): void {
  if (
    options.timeoutMillis !== undefined &&
    (!Number.isFinite(options.timeoutMillis) || options.timeoutMillis < 0)
  ) {
    throw new NnrpProtocolError({
      code: "NNRP_EVENT_TIMEOUT_INVALID",
      message: "Event timeoutMillis must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }

  if (options.signal?.aborted) {
    throw new NnrpTimeoutError({
      code: "NNRP_EVENT_POLL_CANCELLED",
      message: "Event polling was cancelled.",
      source: "runtime",
      retryable: false,
      cause: options.signal.reason,
    });
  }
}

export function validateSessionMetadata(options: NnrpSessionMetadataOptions = {}): void {
  if (options.metadata !== undefined) {
    normalizeMetadataMap(options.metadata);
  }
}

export function normalizeSessionPatchRequest(request: NnrpSessionPatchRequest): NnrpSessionPatchRequest {
  if (request.inputProfile !== undefined) {
    validateInputProfile(request.inputProfile, true);
  }

  if (request.targetCadence !== undefined && (!Number.isFinite(request.targetCadence) || request.targetCadence < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_SESSION_TARGET_CADENCE_INVALID",
      message: "Session targetCadence must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }

  if (request.qualityTier !== undefined && (!Number.isSafeInteger(request.qualityTier) || request.qualityTier < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_SESSION_QUALITY_TIER_INVALID",
      message: "Session qualityTier must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }

  if (
    request.initialCredits !== undefined && (!Number.isFinite(request.initialCredits) || request.initialCredits < 0)
  ) {
    throw new NnrpProtocolError({
      code: "NNRP_SESSION_INITIAL_CREDITS_INVALID",
      message: "Session initialCredits must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }

  return {
    ...(request.inputProfile === undefined ? {} : { inputProfile: request.inputProfile }),
    ...(request.targetCadence === undefined ? {} : { targetCadence: request.targetCadence }),
    ...(request.qualityTier === undefined ? {} : { qualityTier: request.qualityTier }),
    ...(request.submitCapacityPolicy === undefined ? {} : { submitCapacityPolicy: request.submitCapacityPolicy }),
    ...(request.initialCredits === undefined ? {} : { initialCredits: request.initialCredits }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

function annotateTransportCandidate(
  candidate: NnrpTransportCandidate,
  policy: NnrpTransportPolicy,
): NnrpTransportCandidate {
  const rejectionReason = transportRejectionReason(candidate, policy);
  if (rejectionReason === undefined && candidate.rejectionReason === undefined) {
    return { ...candidate };
  }

  const reason = candidate.rejectionReason ?? rejectionReason;
  return {
    ...candidate,
    ...(reason === undefined ? {} : { rejectionReason: reason }),
  };
}

function transportRejectionReason(
  candidate: NnrpTransportCandidate,
  policy: NnrpTransportPolicy,
): NnrpTransportRejectionReason | undefined {
  if (candidate.rejectionReason !== undefined) {
    return candidate.rejectionReason;
  }

  if (!candidate.peerSupported || !candidate.localAvailable) {
    return candidate.peerSupported ? "local-unavailable" : "peer-unsupported";
  }

  const forcedKind = forcedTransportKind(policy);
  if (forcedKind !== undefined && candidate.kind !== forcedKind) {
    return "policy-rejected";
  }

  return undefined;
}

function uniqueTransports(kinds: readonly NnrpTransportKind[]): readonly NnrpTransportKind[] {
  return [...new Set(kinds)].sort((left, right) => defaultTransportScore(right) - defaultTransportScore(left));
}

function defaultTransportScore(kind: NnrpTransportKind): number {
  switch (kind) {
    case "ipc":
      return 100;
    case "quic":
      return 90;
    case "tcp":
      return 80;
    case "websocket":
      return 70;
  }
}

function compareTransportCandidates(
  left: NnrpTransportCandidate,
  right: NnrpTransportCandidate,
  policy: NnrpTransportPolicy,
): number {
  const leftScore = left.score + transportPreferenceBonus(left.kind, policy);
  const rightScore = right.score + transportPreferenceBonus(right.kind, policy);
  return rightScore - leftScore ||
    transportPreferenceRank(left.kind, policy) - transportPreferenceRank(right.kind, policy) ||
    left.kind.localeCompare(right.kind);
}

function transportPreferenceBonus(kind: NnrpTransportKind, policy: NnrpTransportPolicy): number {
  const preferred = preferredTransportKind(policy);
  return preferred === kind ? 1_000 : 0;
}

function transportPreferenceRank(kind: NnrpTransportKind, policy: NnrpTransportPolicy): number {
  const preferred = preferredTransportKind(policy);
  if (preferred !== undefined) {
    return kind === preferred ? 0 : 1;
  }

  switch (kind) {
    case "ipc":
      return 0;
    case "quic":
      return 1;
    case "tcp":
      return 2;
    case "websocket":
      return 3;
  }
}

function preferredTransportKind(policy: NnrpTransportPolicy): NnrpTransportKind | undefined {
  switch (policy) {
    case "prefer-quic":
    case "force-quic":
      return "quic";
    case "prefer-tcp":
    case "force-tcp":
      return "tcp";
    case "prefer-ipc":
    case "force-ipc":
      return "ipc";
    case "prefer-websocket":
    case "force-websocket":
      return "websocket";
    case "auto":
      return undefined;
  }
}

function forcedTransportKind(policy: NnrpTransportPolicy): NnrpTransportKind | undefined {
  return policy.startsWith("force-") ? preferredTransportKind(policy) : undefined;
}

function createPayloadDescriptor(descriptor: NnrpPayloadDescriptor): NnrpPayloadDescriptor {
  validateInputProfile(descriptor.profile, true);

  return {
    profile: descriptor.profile,
    ...(descriptor.schema === undefined ? {} : { schema: createSchemaDescriptor(descriptor.schema) }),
    ...(descriptor.cache === undefined ? {} : { cache: createCacheMetadata(descriptor.cache) }),
    ...(descriptor.metadata === undefined ? {} : { metadata: { ...descriptor.metadata } }),
  };
}

function normalizeEndpointValue(endpoint: string | URL): string {
  const value = endpoint instanceof URL ? endpoint.toString() : endpoint.trim();
  if (value.length === 0) {
    throw invalidApplicationEndpoint("NNRP application endpoint cannot be empty.");
  }
  return value;
}

function applicationHostPort(endpoint: URL): string {
  return `${endpoint.hostname}:${endpoint.port || NNRP_DEFAULT_PORT}`;
}

function parseHostPortProviderEndpoint(
  endpoint: string | URL,
  transport: Extract<NnrpTransportKind, "tcp" | "quic">,
): string {
  if (endpoint instanceof URL) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint must use host:port form.`);
  }

  const value = endpoint.trim();
  if (value.length === 0 || value.includes("://")) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint must use host:port form.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(`tcp://${value}`);
  } catch (cause) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint is malformed.`, cause);
  }

  if (
    parsed.hostname.length === 0 || parsed.port.length === 0 || parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    (parsed.pathname !== "" && parsed.pathname !== "/") || parsed.search.length > 0 || parsed.hash.length > 0
  ) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint must contain only host and port.`);
  }

  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint has an invalid port.`);
  }

  return `${parsed.hostname}:${port}`;
}

function parseIpcProviderEndpoint(
  endpoint: string | URL | undefined,
  transport: Extract<NnrpTransportKind, "ipc">,
): string {
  if (endpoint === undefined) {
    throw invalidProviderEndpoint(transport, "IPC selection requires an explicit unix:// or npipe:// endpoint.");
  }

  const value = endpoint instanceof URL ? endpoint.toString() : endpoint.trim();
  const scheme = value.startsWith("unix://") ? "unix://" : value.startsWith("npipe://") ? "npipe://" : undefined;
  if (scheme === undefined || value.slice(scheme.length).replace(/^\/+|\/+$/g, "").length === 0) {
    throw invalidProviderEndpoint(transport, "IPC provider endpoint must use unix:// or npipe:// with a locator.");
  }

  return value;
}

function parseWebsocketProviderEndpoint(
  applicationEndpoint: URL,
  endpoint: string | URL | undefined,
  transport: Extract<NnrpTransportKind, "websocket">,
): string {
  if (endpoint === undefined) {
    throw invalidProviderEndpoint(transport, "websocket selection requires an explicit ws:// or wss:// endpoint.");
  }

  let parsed: URL;
  try {
    parsed = endpoint instanceof URL ? new URL(endpoint.toString()) : new URL(endpoint.trim());
  } catch (cause) {
    throw invalidProviderEndpoint(transport, "websocket provider endpoint is malformed.", cause);
  }

  if ((parsed.protocol !== "ws:" && parsed.protocol !== "wss:") || parsed.hostname.length === 0) {
    throw invalidProviderEndpoint(transport, "websocket provider endpoint must use ws:// or wss://.");
  }
  if (
    (applicationEndpoint.protocol === "nnrps:" && parsed.protocol !== "wss:") ||
    (applicationEndpoint.protocol === "nnrp:" && parsed.protocol !== "ws:")
  ) {
    throw invalidProviderEndpoint(transport, "websocket provider endpoint must preserve application security intent.");
  }

  return parsed.toString();
}

function invalidApplicationEndpoint(message: string, cause?: unknown): NnrpProtocolError {
  return new NnrpProtocolError({
    code: "NNRP_APPLICATION_ENDPOINT_INVALID",
    message,
    source: "core",
    retryable: false,
    ...(cause === undefined ? {} : { cause }),
  });
}

function invalidProviderEndpoint(
  transport: NnrpTransportKind,
  message: string,
  cause?: unknown,
): NnrpTransportError {
  return new NnrpTransportError({
    code: "NNRP_PROVIDER_ENDPOINT_INVALID",
    message,
    source: "transport",
    retryable: false,
    transport,
    ...(cause === undefined ? {} : { cause }),
  });
}

function createCacheMetadata(metadata: NnrpCacheMetadata): NnrpCacheMetadata {
  validateCacheKey(metadata.key);
  validateLeaseMillis(metadata.leaseMillis);

  return {
    key: metadata.key,
    ...(metadata.version === undefined ? {} : { version: metadata.version }),
    ...(metadata.leaseMillis === undefined ? {} : { leaseMillis: metadata.leaseMillis }),
    ...(metadata.dependencies === undefined
      ? {}
      : { dependencies: metadata.dependencies.map((key) => createCacheKey(key.kind, key.key, key.namespaceId)) }),
  };
}

function validateSubmitRequestShape(
  request: NnrpSubmitRequest,
  options: NormalizeSubmitRequestOptions,
): void {
  if (!Number.isSafeInteger(request.frameId) || request.frameId < 0) {
    throw new NnrpProtocolError({
      code: "NNRP_SUBMIT_FRAME_ID_INVALID",
      message: "Submit request frameId must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }

  if (request.inputProfile !== undefined) {
    validateInputProfile(request.inputProfile, options.strictProfiles ?? true);
  }

  if (request.cacheKey !== undefined) {
    validateCacheKey(request.cacheKey);
  }

  if (request.metadata !== undefined) {
    normalizeMetadataMap(request.metadata);
  }

  if (request.tensors !== undefined) {
    for (const section of request.tensors) {
      if (section.codecId !== undefined && (!Number.isSafeInteger(section.codecId) || section.codecId < 0)) {
        throw new NnrpProtocolError({
          code: "NNRP_TENSOR_CODEC_ID_INVALID",
          message: "Tensor section codecId must be a non-negative safe integer.",
          source: "core",
          retryable: false,
        });
      }
    }
  }
}

function validateRecoveryToken(token: NnrpRecoveryToken): void {
  if (typeof token.token === "string") {
    if (token.token.trim().length === 0 || token.token.length > 4096) {
      throw new NnrpProtocolError({
        code: "NNRP_RECOVERY_TOKEN_INVALID",
        message: "Recovery token strings must be non-empty and at most 4096 characters.",
        source: "core",
        retryable: false,
      });
    }
  } else if (token.token.byteLength === 0 || token.token.byteLength > 4096) {
    throw new NnrpProtocolError({
      code: "NNRP_RECOVERY_TOKEN_INVALID",
      message: "Recovery token payloads must be non-empty and at most 4096 bytes.",
      source: "core",
      retryable: false,
    });
  }

  if (token.metadata !== undefined) {
    normalizeMetadataMap(token.metadata);
  }
}

function validateLeaseMillis(leaseMillis: number | undefined): void {
  if (leaseMillis !== undefined && (!Number.isSafeInteger(leaseMillis) || leaseMillis < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_LEASE_INVALID",
      message: "Cache leaseMillis must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }
}

function normalizeMetadataMap(metadata: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const entries = Object.entries(metadata);
  if (entries.length > 32) {
    throw new NnrpProtocolError({
      code: "NNRP_METADATA_TOO_MANY_ENTRIES",
      message: "Metadata maps must contain at most 32 entries.",
      source: "core",
      retryable: false,
    });
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (key.trim().length === 0 || key.length > 64) {
      throw new NnrpProtocolError({
        code: "NNRP_METADATA_KEY_INVALID",
        message: "Metadata keys must be non-empty and at most 64 characters.",
        source: "core",
        retryable: false,
      });
    }

    if (value.length > 1024) {
      throw new NnrpProtocolError({
        code: "NNRP_METADATA_VALUE_INVALID",
        message: "Metadata values must be at most 1024 characters.",
        source: "core",
        retryable: false,
      });
    }

    normalized[key] = value;
  }

  return normalized;
}

function validateInputProfile(profile: string, strictProfiles: boolean): void {
  if (strictProfiles && !isStandardInputProfile(profile)) {
    throw new NnrpProtocolError({
      code: "NNRP_INPUT_PROFILE_UNKNOWN",
      message: `Unknown NNRP input profile '${profile}'.`,
      source: "core",
      retryable: false,
    });
  }
}

function validateCacheKey(key: NnrpCacheKey): void {
  if (!["tensor", "token", "schema", "artifact", "tool"].includes(key.kind)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_KIND_INVALID",
      message: `Unsupported NNRP cache object kind '${key.kind}'.`,
      source: "core",
      retryable: false,
    });
  }

  if (typeof key.key === "string" && key.key.trim().length === 0) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_KEY_EMPTY",
      message: "Cache key strings must not be empty.",
      source: "core",
      retryable: false,
    });
  }

  if (typeof key.key === "number" && (!Number.isSafeInteger(key.key) || key.key < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_KEY_NUMBER_INVALID",
      message: "Numeric cache keys must be non-negative safe integers.",
      source: "core",
      retryable: false,
    });
  }

  if (key.namespaceId !== undefined && (!Number.isSafeInteger(key.namespaceId) || key.namespaceId < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_NAMESPACE_INVALID",
      message: "Cache namespaceId must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }
}

function validateSchemaDescriptor(descriptor: NnrpSchemaDescriptor): void {
  validateIdentifier("NNRP_SCHEMA_ID_INVALID", "Schema id", descriptor.id);
  validateIdentifier("NNRP_SCHEMA_NAME_INVALID", "Schema name", descriptor.name);
  validateIdentifier("NNRP_SCHEMA_VERSION_INVALID", "Schema version", descriptor.version);

  if (descriptor.flags !== undefined) {
    const allowed = new Set<NnrpSchemaFlag>(["required", "streamable", "lossless", "opaque"]);
    for (const flag of descriptor.flags) {
      if (!allowed.has(flag)) {
        throw new NnrpProtocolError({
          code: "NNRP_SCHEMA_FLAG_INVALID",
          message: `Unsupported schema flag '${flag}'.`,
          source: "core",
          retryable: false,
        });
      }
    }
  }
}

function validateIdentifier(code: string, label: string, value: string): void {
  if (value.trim().length === 0 || value.length > 128) {
    throw new NnrpProtocolError({
      code,
      message: `${label} must be non-empty and at most 128 characters.`,
      source: "core",
      retryable: false,
    });
  }
}

function normalizeBinaryPayload(payload: NnrpBinaryPayload, copyPayload: boolean): Uint8Array {
  const view = payload instanceof Uint8Array
    ? payload
    : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);

  if (!copyPayload) {
    return view;
  }

  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

function validateCapabilityManifestOptions(options: NnrpCapabilityManifestOptions): void {
  const transports = options.transports ?? [];
  const capabilities = options.capabilities ?? [];

  const unknownCapability = (capabilities as readonly string[]).find(
    (capability) => !NNRP_CAPABILITY_TOKENS.has(capability as NnrpCapability),
  );
  if (unknownCapability !== undefined) {
    throw new NnrpCapabilityError({
      code: "NNRP_CAPABILITY_UNKNOWN",
      message: `Capability manifest contains an unknown NNRP/1 capability token: ${unknownCapability}.`,
      source: "core",
      retryable: false,
    });
  }

  if (options.buildMode === "browser-wasm") {
    if (capabilities.includes("server.session") || capabilities.includes("native.loader")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_BROWSER_FORBIDDEN",
        message: "Browser WASM manifests cannot claim server or native loader capabilities.",
        source: "core",
        retryable: false,
      });
    }

    if (transports.some((transport) => transport !== "websocket")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_BROWSER_TRANSPORT_FORBIDDEN",
        message: "Browser WASM manifests can claim only the websocket transport.",
        source: "core",
        retryable: false,
      });
    }
  }
}

type RuntimeIntegerKind = "u64" | "u32" | "u16" | "u8" | "i16";

interface RuntimeIntegerField {
  readonly name: string;
  readonly offset: number;
  readonly kind: RuntimeIntegerKind;
  readonly runtimeRole?: boolean;
  readonly errorScope?: boolean;
}

interface RuntimeReservedField {
  readonly offset: number;
  readonly kind: RuntimeIntegerKind;
}

interface RuntimeControlLayout {
  readonly name: string;
  readonly length: number;
  readonly fields: readonly RuntimeIntegerField[];
  readonly flagMask?: number;
  readonly tailField?: "bodyBytes" | "diagnosticBytes";
  readonly percentField?: "percentX100";
  readonly reserved?: readonly RuntimeReservedField[];
}

type RuntimeObjectEnumField =
  | "objectKind"
  | "runtimeRole"
  | "memoryLocationHint"
  | "ownershipHint"
  | "objectReleaseReason"
  | "cacheReuseScope"
  | "cacheMissReason";

interface RuntimeObjectField extends RuntimeIntegerField {
  readonly enumField?: RuntimeObjectEnumField;
}

interface RuntimeObjectLayout {
  readonly name: string;
  readonly length: number;
  readonly fields: readonly RuntimeObjectField[];
  readonly flagMask?: number;
  readonly tailFields?: readonly ("metadataBytes" | "diagnosticBytes" | "deltaBytes")[];
  readonly reserved?: readonly RuntimeReservedField[];
}

const OBJECT_DESCRIPTOR_LAYOUT: RuntimeObjectLayout = {
  name: "ObjectDescriptorMetadata",
  length: 48,
  fields: [
    { name: "objectId", offset: 0, kind: "u64" },
    { name: "objectKind", offset: 8, kind: "u16", enumField: "objectKind" },
    { name: "producerRole", offset: 10, kind: "u8", enumField: "runtimeRole" },
    { name: "consumerRole", offset: 11, kind: "u8", enumField: "runtimeRole" },
    { name: "sessionId", offset: 12, kind: "u32" },
    { name: "byteSize", offset: 16, kind: "u64" },
    { name: "computeCostUnits", offset: 24, kind: "u32" },
    { name: "memoryLocationHint", offset: 28, kind: "u16", enumField: "memoryLocationHint" },
    { name: "ownershipHint", offset: 30, kind: "u16", enumField: "ownershipHint" },
    { name: "lifetimeHintMs", offset: 32, kind: "u32" },
    { name: "metadataBytes", offset: 36, kind: "u32" },
  ],
  tailFields: ["metadataBytes"],
  reserved: [{ offset: 40, kind: "u64" }],
};

const OBJECT_REFERENCE_LAYOUT: RuntimeObjectLayout = {
  name: "ObjectReferenceMetadata",
  length: 48,
  fields: [
    { name: "objectId", offset: 0, kind: "u64" },
    { name: "operationId", offset: 8, kind: "u64" },
    { name: "objectVersion", offset: 16, kind: "u64" },
    { name: "offset", offset: 24, kind: "u64" },
    { name: "length", offset: 32, kind: "u64" },
    { name: "flags", offset: 40, kind: "u32" },
    { name: "metadataBytes", offset: 44, kind: "u32" },
  ],
  flagMask: 0x07,
  tailFields: ["metadataBytes"],
};

const OBJECT_RELEASE_LAYOUT: RuntimeObjectLayout = {
  name: "ObjectReleaseMetadata",
  length: 32,
  fields: [
    { name: "objectId", offset: 0, kind: "u64" },
    { name: "operationId", offset: 8, kind: "u64" },
    { name: "releaseReason", offset: 16, kind: "u16", enumField: "objectReleaseReason" },
    { name: "sourceRole", offset: 18, kind: "u8", enumField: "runtimeRole" },
    { name: "flags", offset: 19, kind: "u8" },
    { name: "diagnosticBytes", offset: 20, kind: "u32" },
  ],
  flagMask: 0x03,
  tailFields: ["diagnosticBytes"],
  reserved: [{ offset: 24, kind: "u64" }],
};

const OBJECT_DELTA_LAYOUT: RuntimeObjectLayout = {
  name: "ObjectDeltaMetadata",
  length: 40,
  fields: [
    { name: "objectId", offset: 0, kind: "u64" },
    { name: "deltaSequence", offset: 8, kind: "u64" },
    { name: "regionOffset", offset: 16, kind: "u64" },
    { name: "regionBytes", offset: 24, kind: "u32" },
    { name: "deltaBytes", offset: 28, kind: "u32" },
    { name: "flags", offset: 32, kind: "u32" },
    { name: "metadataBytes", offset: 36, kind: "u32" },
  ],
  flagMask: 0x07,
  tailFields: ["metadataBytes", "deltaBytes"],
};

const CACHE_REFERENCE_LAYOUT: RuntimeObjectLayout = {
  name: "CacheReferenceMetadata",
  length: 48,
  fields: [
    { name: "cacheKeyHi", offset: 0, kind: "u64" },
    { name: "cacheKeyLo", offset: 8, kind: "u64" },
    { name: "profileId", offset: 16, kind: "u16" },
    { name: "reuseScope", offset: 18, kind: "u16", enumField: "cacheReuseScope" },
    { name: "leaseId", offset: 20, kind: "u64" },
    { name: "producerTraceId", offset: 28, kind: "u64" },
    { name: "expirationHintMs", offset: 36, kind: "u32" },
    { name: "metadataBytes", offset: 40, kind: "u32" },
    { name: "flags", offset: 44, kind: "u32" },
  ],
  flagMask: 0x03,
  tailFields: ["metadataBytes"],
};

const CACHE_MISS_LAYOUT: RuntimeObjectLayout = {
  name: "CacheMissMetadata",
  length: 32,
  fields: [
    { name: "cacheKeyHi", offset: 0, kind: "u64" },
    { name: "cacheKeyLo", offset: 8, kind: "u64" },
    { name: "missReason", offset: 16, kind: "u16", enumField: "cacheMissReason" },
    { name: "profileId", offset: 18, kind: "u16" },
    { name: "diagnosticBytes", offset: 20, kind: "u32" },
  ],
  tailFields: ["diagnosticBytes"],
  reserved: [{ offset: 24, kind: "u64" }],
};

const CONTROL_REQUEST_LAYOUT: RuntimeControlLayout = {
  name: "ControlRequestMetadata",
  length: 32,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "controlSequence", offset: 8, kind: "u64" },
    { name: "reasonCode", offset: 16, kind: "u16" },
    { name: "sourceRole", offset: 18, kind: "u8", runtimeRole: true },
    { name: "flags", offset: 19, kind: "u8" },
    { name: "diagnosticBytes", offset: 20, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "diagnosticBytes",
  reserved: [{ offset: 24, kind: "u64" }],
};

const SCHEDULING_LAYOUT: RuntimeControlLayout = {
  name: "SchedulingMetadata",
  length: 32,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "controlSequence", offset: 8, kind: "u64" },
    { name: "priorityClass", offset: 16, kind: "u16" },
    { name: "priorityDelta", offset: 18, kind: "i16" },
    { name: "deadlineUnixMs", offset: 20, kind: "u64" },
    { name: "flags", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
};

const SUPERSEDE_LAYOUT: RuntimeControlLayout = {
  name: "SupersedeMetadata",
  length: 32,
  fields: [
    { name: "oldOperationId", offset: 0, kind: "u64" },
    { name: "newOperationId", offset: 8, kind: "u64" },
    { name: "controlSequence", offset: 16, kind: "u64" },
    { name: "dropReasonCode", offset: 24, kind: "u16" },
    { name: "flags", offset: 26, kind: "u16" },
    { name: "diagnosticBytes", offset: 28, kind: "u32" },
  ],
  flagMask: 0x01,
  tailField: "diagnosticBytes",
};

const BUDGET_LAYOUT: RuntimeControlLayout = {
  name: "BudgetMetadata",
  length: 40,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "computeBudgetUnits", offset: 8, kind: "u64" },
    { name: "memoryBudgetBytes", offset: 16, kind: "u64" },
    { name: "bandwidthBudgetBytes", offset: 24, kind: "u64" },
    { name: "tokenBudget", offset: 32, kind: "u32" },
    { name: "flags", offset: 36, kind: "u32" },
  ],
  flagMask: 0x03,
};

const PROGRESS_LAYOUT: RuntimeControlLayout = {
  name: "ProgressMetadata",
  length: 32,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "progressSequence", offset: 8, kind: "u64" },
    { name: "stageCode", offset: 16, kind: "u16" },
    { name: "percentX100", offset: 18, kind: "u16" },
    { name: "objectId", offset: 20, kind: "u64" },
    { name: "bodyBytes", offset: 28, kind: "u32" },
  ],
  tailField: "bodyBytes",
  percentField: "percentX100",
};

const PARTIAL_RESULT_LAYOUT: RuntimeControlLayout = {
  name: "PartialResultMetadata",
  length: 40,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "resultSequence", offset: 8, kind: "u64" },
    { name: "objectId", offset: 16, kind: "u64" },
    { name: "deltaSequence", offset: 24, kind: "u64" },
    { name: "bodyBytes", offset: 32, kind: "u32" },
    { name: "flags", offset: 36, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "bodyBytes",
};

const PRESSURE_LAYOUT: RuntimeControlLayout = {
  name: "PressureMetadata",
  length: 32,
  fields: [
    { name: "scopeId", offset: 0, kind: "u64" },
    { name: "creditWindow", offset: 8, kind: "u64" },
    { name: "pressureLevel", offset: 16, kind: "u16" },
    { name: "pressureReason", offset: 18, kind: "u16" },
    { name: "retryAfterMs", offset: 20, kind: "u32" },
    { name: "flags", offset: 24, kind: "u32" },
  ],
  flagMask: 0x03,
  reserved: [{ offset: 28, kind: "u32" }],
};

const CAPABILITY_LAYOUT: RuntimeControlLayout = {
  name: "CapabilityMetadata",
  length: 32,
  fields: [
    { name: "profileId", offset: 0, kind: "u16" },
    { name: "capabilityCount", offset: 2, kind: "u16" },
    { name: "costModelId", offset: 4, kind: "u16" },
    { name: "preferenceRank", offset: 6, kind: "u16" },
    { name: "limitBytes", offset: 8, kind: "u64" },
    { name: "limitUnits", offset: 16, kind: "u64" },
    { name: "bodyBytes", offset: 24, kind: "u32" },
    { name: "flags", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "bodyBytes",
};

const ROUTE_HINT_LAYOUT: RuntimeControlLayout = {
  name: "RouteHintMetadata",
  length: 32,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "routeId", offset: 8, kind: "u32" },
    { name: "executorClass", offset: 12, kind: "u16" },
    { name: "affinityClass", offset: 14, kind: "u16" },
    { name: "deadlineUnixMs", offset: 16, kind: "u64" },
    { name: "bodyBytes", offset: 24, kind: "u32" },
    { name: "flags", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "bodyBytes",
};

const TRACE_CONTEXT_LAYOUT: RuntimeControlLayout = {
  name: "TraceContextMetadata",
  length: 32,
  fields: [
    { name: "traceId", offset: 0, kind: "u64" },
    { name: "spanId", offset: 8, kind: "u64" },
    { name: "parentSpanId", offset: 16, kind: "u64" },
    { name: "stageCode", offset: 24, kind: "u16" },
    { name: "flags", offset: 26, kind: "u16" },
    { name: "bodyBytes", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "bodyBytes",
};

const RESULT_DROP_REASON_LAYOUT: RuntimeControlLayout = {
  name: "ResultDropReasonMetadata",
  length: 32,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "resultSequence", offset: 8, kind: "u64" },
    { name: "dropReasonCode", offset: 16, kind: "u16" },
    { name: "sourceRole", offset: 18, kind: "u8", runtimeRole: true },
    { name: "flags", offset: 19, kind: "u8" },
    { name: "diagnosticBytes", offset: 20, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "diagnosticBytes",
  reserved: [{ offset: 24, kind: "u64" }],
};

const RECOVERABLE_ERROR_LAYOUT: RuntimeControlLayout = {
  name: "RecoverableErrorMetadata",
  length: 32,
  fields: [
    { name: "errorCode", offset: 0, kind: "u32" },
    { name: "errorScope", offset: 4, kind: "u32", errorScope: true },
    { name: "recoveryAction", offset: 8, kind: "u16" },
    { name: "sourceRole", offset: 10, kind: "u8", runtimeRole: true },
    { name: "flags", offset: 11, kind: "u8" },
    { name: "retryAfterMs", offset: 12, kind: "u32" },
    { name: "relatedSessionId", offset: 16, kind: "u32" },
    { name: "relatedFrameId", offset: 20, kind: "u32" },
    { name: "relatedViewId", offset: 24, kind: "u32" },
    { name: "diagnosticBytes", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "diagnosticBytes",
};

const RETRY_AFTER_LAYOUT: RuntimeControlLayout = {
  name: "RetryAfterMetadata",
  length: 32,
  fields: [
    { name: "scopeId", offset: 0, kind: "u64" },
    { name: "controlSequence", offset: 8, kind: "u64" },
    { name: "retryAfterMs", offset: 16, kind: "u32" },
    { name: "jitterMs", offset: 20, kind: "u32" },
    { name: "reasonCode", offset: 24, kind: "u16" },
    { name: "sourceRole", offset: 26, kind: "u8", runtimeRole: true },
    { name: "flags", offset: 27, kind: "u8" },
    { name: "diagnosticBytes", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "diagnosticBytes",
};

function getRuntimeControlLayout(messageType: NnrpMessageType): RuntimeControlLayout {
  switch (messageType) {
    case NnrpMessageType.Cancel:
    case NnrpMessageType.Abort:
      return CONTROL_REQUEST_LAYOUT;
    case NnrpMessageType.PriorityUpdate:
    case NnrpMessageType.Deadline:
    case NnrpMessageType.ExpireAt:
      return SCHEDULING_LAYOUT;
    case NnrpMessageType.Supersede:
      return SUPERSEDE_LAYOUT;
    case NnrpMessageType.BudgetUpdate:
      return BUDGET_LAYOUT;
    case NnrpMessageType.Progress:
      return PROGRESS_LAYOUT;
    case NnrpMessageType.PartialResult:
      return PARTIAL_RESULT_LAYOUT;
    case NnrpMessageType.Backpressure:
    case NnrpMessageType.CreditUpdate:
      return PRESSURE_LAYOUT;
    case NnrpMessageType.CapabilityNegotiation:
    case NnrpMessageType.DegradeProfile:
      return CAPABILITY_LAYOUT;
    case NnrpMessageType.RouteHint:
    case NnrpMessageType.ExecutionHint:
      return ROUTE_HINT_LAYOUT;
    case NnrpMessageType.TraceContext:
      return TRACE_CONTEXT_LAYOUT;
    case NnrpMessageType.ResultDropReason:
      return RESULT_DROP_REASON_LAYOUT;
    case NnrpMessageType.ErrorRecoverable:
      return RECOVERABLE_ERROR_LAYOUT;
    case NnrpMessageType.RetryAfter:
      return RETRY_AFTER_LAYOUT;
    default:
      throw runtimeControlError(
        "NNRP_CONTROL_MESSAGE_UNSUPPORTED",
        `Message type ${messageType} does not use Preview4 runtime control metadata.`,
      );
  }
}

function getRuntimeObjectLayout(messageType: NnrpMessageType): RuntimeObjectLayout {
  switch (messageType) {
    case NnrpMessageType.ObjectDeclare:
      return OBJECT_DESCRIPTOR_LAYOUT;
    case NnrpMessageType.ObjectRef:
      return OBJECT_REFERENCE_LAYOUT;
    case NnrpMessageType.ObjectRelease:
      return OBJECT_RELEASE_LAYOUT;
    case NnrpMessageType.ObjectPatch:
    case NnrpMessageType.ObjectDelta:
      return OBJECT_DELTA_LAYOUT;
    case NnrpMessageType.CacheReference:
      return CACHE_REFERENCE_LAYOUT;
    case NnrpMessageType.CacheMiss:
      return CACHE_MISS_LAYOUT;
    default:
      throw runtimeObjectError(
        "NNRP_OBJECT_MESSAGE_UNSUPPORTED",
        `Message type ${messageType} does not use Preview4 runtime object metadata.`,
      );
  }
}

function validateRuntimeObjectMetadata(layout: RuntimeObjectLayout, metadata: RuntimeObjectMetadata): void {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw runtimeObjectError("NNRP_OBJECT_METADATA_MISMATCH", `${layout.name} must be a metadata object.`);
  }

  const values = metadata as unknown as Record<string, unknown>;
  const actualFields = Object.keys(values).sort();
  const expectedFields = layout.fields.map((field) => field.name).sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    throw runtimeObjectError(
      "NNRP_OBJECT_METADATA_MISMATCH",
      `Message requires ${layout.name} fields: ${expectedFields.join(", ")}.`,
    );
  }

  for (const field of layout.fields) {
    validateRuntimeObjectInteger(field, values[field.name]);
    if (field.enumField !== undefined) {
      validateRuntimeObjectEnum(field.enumField, values[field.name] as number);
    }
  }

  if (layout.flagMask !== undefined) {
    const flags = values.flags as number;
    if ((flags & ~layout.flagMask) !== 0) {
      throw runtimeObjectError(
        "NNRP_OBJECT_FLAGS_INVALID",
        `${layout.name}.flags contains reserved bits outside 0x${layout.flagMask.toString(16)}.`,
      );
    }
  }
}

function validateRuntimeObjectTail(
  layout: RuntimeObjectLayout,
  metadata: RuntimeObjectMetadata,
  actualBytes: number,
): void {
  const values = metadata as unknown as Record<string, number>;
  const declaredBytes = (layout.tailFields ?? []).reduce((total, field) => total + (values[field] as number), 0);
  if (declaredBytes !== actualBytes) {
    throw runtimeObjectError(
      "NNRP_OBJECT_TAIL_LENGTH_INVALID",
      `${layout.name} declares ${declaredBytes} tail bytes but received ${actualBytes}.`,
    );
  }
}

function validateRuntimeObjectInteger(field: RuntimeIntegerField, value: unknown): void {
  if (field.kind === "u64") {
    if (typeof value !== "bigint" || value < 0n || value > 0xffff_ffff_ffff_ffffn) {
      throw runtimeObjectError(
        "NNRP_OBJECT_INTEGER_INVALID",
        `${field.name} must be a bigint in the u64 wire range.`,
      );
    }
    return;
  }

  const maximum = field.kind === "u32" ? 0xffff_ffff : field.kind === "u16" ? 0xffff : 0xff;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) {
    throw runtimeObjectError(
      "NNRP_OBJECT_INTEGER_INVALID",
      `${field.name} must be an integer in the ${field.kind} wire range.`,
    );
  }
}

function validateRuntimeObjectEnum(field: RuntimeObjectEnumField, value: number): void {
  const [lastStandard, privateStart, privateEnd] = field === "runtimeRole"
    ? [RuntimeRole.ConformanceRunner, 0x80, 0xff]
    : [
      field === "objectKind"
        ? RuntimeObjectKind.CacheManifest
        : field === "memoryLocationHint"
        ? MemoryLocationHint.ObjectStore
        : field === "ownershipHint"
        ? OwnershipHint.ReleaseOnDrop
        : field === "objectReleaseReason"
        ? ObjectReleaseReason.ConformanceInjection
        : field === "cacheReuseScope"
        ? CacheReuseScope.Profile
        : CacheMissReason.PermissionDenied,
      0x8000,
      0xffff,
    ];
  if ((value >= 0 && value <= lastStandard) || (value >= privateStart && value <= privateEnd)) {
    return;
  }
  throw runtimeObjectError(
    "NNRP_OBJECT_ENUM_INVALID",
    `${field} must use a frozen standard value or its private extension range.`,
  );
}

function validateCacheInvalidateMetadata(metadata: CacheInvalidateMetadata): void {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_METADATA_MISMATCH",
      "CacheInvalidateMetadata must be a metadata object.",
    );
  }
  const values = metadata as unknown as Record<string, unknown>;
  const expectedFields = ["cacheKeyHi", "cacheKeyLo", "cacheNamespace", "invalidateScope", "reasonCode"];
  const actualFields = Object.keys(values).sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_METADATA_MISMATCH",
      `CacheInvalidateMetadata requires fields: ${expectedFields.join(", ")}.`,
    );
  }
  for (const field of expectedFields) {
    validateRuntimeObjectInteger({ name: field, offset: 0, kind: "u32" }, values[field]);
  }
  if ((values.invalidateScope as number) > 3) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_SCOPE_INVALID",
      "invalidateScope must be WholeSession, Namespace, ObjectKind, or ObjectKey.",
    );
  }
}

function validateRuntimeControlMetadata(
  layout: RuntimeControlLayout,
  metadata: RuntimeControlMetadata,
): void {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw runtimeControlError(
      "NNRP_CONTROL_METADATA_MISMATCH",
      `${layout.name} must be a metadata object.`,
    );
  }

  const values = metadata as unknown as Record<string, unknown>;
  const actualFields = Object.keys(values).sort();
  const expectedFields = layout.fields.map((field) => field.name).sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    throw runtimeControlError(
      "NNRP_CONTROL_METADATA_MISMATCH",
      `Message requires ${layout.name} fields: ${expectedFields.join(", ")}.`,
    );
  }

  for (const field of layout.fields) {
    validateRuntimeInteger(field, values[field.name]);
    if (field.runtimeRole) {
      validateRuntimeRole(values[field.name] as number);
    }
    if (field.errorScope) {
      validateErrorScope(values[field.name] as number);
    }
  }

  if (layout.flagMask !== undefined) {
    const flags = values.flags as number;
    if ((flags & ~layout.flagMask) !== 0) {
      throw runtimeControlError(
        "NNRP_CONTROL_FLAGS_INVALID",
        `${layout.name}.flags contains reserved bits outside 0x${layout.flagMask.toString(16)}.`,
      );
    }
  }

  if (
    layout.percentField !== undefined &&
    (values[layout.percentField] as number) > 10_000 &&
    (values[layout.percentField] as number) !== 0xffff
  ) {
    throw runtimeControlError(
      "NNRP_CONTROL_PROGRESS_INVALID",
      `${layout.name}.percentX100 must be 0..10000 or the 0xffff unknown-value sentinel.`,
    );
  }
}

function validateRuntimeControlTail(
  layout: RuntimeControlLayout,
  metadata: RuntimeControlMetadata,
  actualBytes: number,
): void {
  const declaredBytes = layout.tailField === undefined
    ? 0
    : (metadata as unknown as Record<string, number>)[layout.tailField];
  if (declaredBytes !== actualBytes) {
    throw runtimeControlError(
      "NNRP_CONTROL_TAIL_LENGTH_INVALID",
      `${layout.name} declares ${declaredBytes} tail bytes but received ${actualBytes}.`,
    );
  }
}

function validateRuntimeInteger(field: RuntimeIntegerField, value: unknown): void {
  if (field.kind === "u64") {
    if (typeof value !== "bigint" || value < 0n || value > 0xffff_ffff_ffff_ffffn) {
      throw runtimeControlError(
        "NNRP_CONTROL_INTEGER_INVALID",
        `${field.name} must be a bigint in the u64 wire range.`,
      );
    }
    return;
  }

  const [minimum, maximum] = field.kind === "i16"
    ? [-0x8000, 0x7fff]
    : [0, field.kind === "u32" ? 0xffff_ffff : field.kind === "u16" ? 0xffff : 0xff];
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw runtimeControlError(
      "NNRP_CONTROL_INTEGER_INVALID",
      `${field.name} must be an integer in the ${field.kind} wire range.`,
    );
  }
}

function validateRuntimeRole(value: number): void {
  if (
    (value >= RuntimeRole.Unspecified && value <= RuntimeRole.ConformanceRunner) || (value >= 0x80 && value <= 0xff)
  ) {
    return;
  }
  throw runtimeControlError(
    "NNRP_CONTROL_ROLE_INVALID",
    "Runtime role must use a frozen standard value or the private extension range 0x80-0xff.",
  );
}

function validateErrorScope(value: number): void {
  if (value >= ErrorScope.Connection && value <= ErrorScope.Frame) {
    return;
  }
  throw runtimeControlError(
    "NNRP_CONTROL_ERROR_SCOPE_INVALID",
    "Error scope must be Connection, Session, or Frame.",
  );
}

function writeRuntimeInteger(view: DataView, field: RuntimeIntegerField, value: unknown): void {
  switch (field.kind) {
    case "u64":
      view.setBigUint64(field.offset, value as bigint, true);
      break;
    case "u32":
      view.setUint32(field.offset, value as number, true);
      break;
    case "u16":
      view.setUint16(field.offset, value as number, true);
      break;
    case "u8":
      view.setUint8(field.offset, value as number);
      break;
    case "i16":
      view.setInt16(field.offset, value as number, true);
      break;
  }
}

function readRuntimeInteger(
  view: DataView,
  field: RuntimeIntegerField | RuntimeReservedField,
): bigint | number {
  switch (field.kind) {
    case "u64":
      return view.getBigUint64(field.offset, true);
    case "u32":
      return view.getUint32(field.offset, true);
    case "u16":
      return view.getUint16(field.offset, true);
    case "u8":
      return view.getUint8(field.offset);
    case "i16":
      return view.getInt16(field.offset, true);
  }
}

function runtimeControlError(code: string, message: string): NnrpProtocolError {
  return new NnrpProtocolError({
    code,
    message,
    source: "protocol",
    retryable: false,
  });
}

function runtimeObjectError(code: string, message: string): NnrpProtocolError {
  return new NnrpProtocolError({
    code,
    message,
    source: "protocol",
    retryable: false,
  });
}
