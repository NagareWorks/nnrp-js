export declare const NNRP_PROTOCOL_NAME = "NNRP";
export declare const NNRP_PROTOCOL_VERSION = "1.0.0";
export declare enum NnrpMessageType {
    ClientHello = 1,
    ServerHelloAck = 2,
    SessionPatch = 3,
    SessionPatchAck = 4,
    Close = 5,
    Error = 6,
    SessionOpen = 7,
    SessionOpenAck = 8,
    SessionClose = 9,
    SessionCloseAck = 10,
    FrameSubmit = 16,
    FrameCancel = 17,
    ResultPush = 18,
    ResultDrop = 19,
    CachePut = 20,
    CacheAck = 21,
    CacheInvalidate = 22,
    FlowUpdate = 23,
    ResultHint = 24,
    TransportProbe = 25,
    TransportProbeAck = 26,
    SessionMigrate = 27,
    SessionMigrateAck = 28,
    Ping = 32,
    Pong = 33,
    Cancel = 48,
    Abort = 49,
    PriorityUpdate = 50,
    Deadline = 51,
    ExpireAt = 52,
    Supersede = 53,
    BudgetUpdate = 54,
    Progress = 55,
    PartialResult = 56,
    Backpressure = 57,
    CreditUpdate = 58,
    CapabilityNegotiation = 59,
    DegradeProfile = 60,
    RouteHint = 61,
    ExecutionHint = 62,
    TraceContext = 63,
    ResultDropReason = 64,
    ObjectDeclare = 65,
    ObjectRef = 66,
    ObjectRelease = 67,
    ObjectPatch = 68,
    ObjectDelta = 69,
    CacheReference = 70,
    CacheMiss = 71,
    ErrorRecoverable = 72,
    RetryAfter = 73
}
export declare enum RuntimeRole {
    Unspecified = 0,
    Client = 1,
    Server = 2,
    Runtime = 3,
    Subagent = 4,
    Tool = 5,
    Scheduler = 6,
    ConformanceRunner = 7
}
export declare enum ErrorScope {
    Connection = 0,
    Session = 1,
    Frame = 2
}
export declare enum RuntimeObjectKind {
    Unspecified = 0,
    Tensor = 1,
    TokenBlock = 2,
    ImageTile = 3,
    FeatureMap = 4,
    ToolResult = 5,
    TraceSegment = 6,
    OpaqueBytes = 7,
    DocumentChunk = 8,
    AudioChunk = 9,
    VideoChunk = 10,
    RoutePlan = 11,
    CacheManifest = 12
}
export declare enum MemoryLocationHint {
    Unspecified = 0,
    HostMemory = 1,
    DeviceMemory = 2,
    SharedMemory = 3,
    RemoteMemory = 4,
    MmapFile = 5,
    ObjectStore = 6
}
export declare enum OwnershipHint {
    Unspecified = 0,
    ProducerOwned = 1,
    ConsumerOwned = 2,
    SessionOwned = 3,
    Borrowed = 4,
    TransferOnRef = 5,
    ReleaseOnDrop = 6
}
export declare enum ObjectReleaseReason {
    Completed = 0,
    Cancelled = 1,
    Expired = 2,
    Replaced = 3,
    Invalidated = 4,
    OwnerClosed = 5,
    LeaseExpired = 6,
    ConformanceInjection = 7
}
export declare enum CacheReuseScope {
    Operation = 0,
    Session = 1,
    Connection = 2,
    Global = 3,
    Tenant = 4,
    Profile = 5
}
export declare enum CacheMissReason {
    Unknown = 0,
    NotFound = 1,
    Expired = 2,
    Invalidated = 3,
    SchemaMismatch = 4,
    ProducerUnavailable = 5,
    LeaseRequired = 6,
    PermissionDenied = 7
}
export declare enum NnrpCacheObjectKind {
    CameraBlock = 1,
    TileIndexBlock = 2,
    TensorSectionTable = 3,
    CodecTable = 4,
    ReusableResultObject = 5,
    PayloadLayoutTemplate = 6,
    PromptSegment = 7,
    ToolSchema = 8,
    StructuredEventSchema = 9
}
export declare enum CacheLeaseOwnerScope {
    Connection = 0,
    Session = 1,
    Operation = 2
}
export interface CacheObjectId {
    readonly cacheNamespace: number;
    readonly cacheKeyHi: bigint;
    readonly cacheKeyLo: bigint;
    readonly objectKind: NnrpCacheObjectKind;
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
    readonly cacheNamespace: number;
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
    readonly cacheNamespace: number;
    readonly cacheKeyHi: bigint;
    readonly cacheKeyLo: bigint;
    readonly missReason: CacheMissReason;
    readonly profileId: number;
    readonly diagnosticBytes: number;
}
export type RuntimeObjectMetadata = ObjectDescriptorMetadata | ObjectReferenceMetadata | ObjectReleaseMetadata | ObjectDeltaMetadata | CacheReferenceMetadata | CacheMissMetadata;
export interface DecodedRuntimeObjectMetadata {
    readonly metadata: RuntimeObjectMetadata;
    readonly tail: Uint8Array;
}
export interface CacheInvalidateMetadata {
    readonly invalidateScope: number;
    readonly cacheNamespace: number;
    readonly cacheKeyHi: bigint;
    readonly cacheKeyLo: bigint;
    readonly reasonCode: number;
}
export declare class CacheLease {
    readonly objectId: CacheObjectId;
    readonly objectVersion: bigint;
    readonly leaseId: bigint;
    readonly ownerScope: CacheLeaseOwnerScope;
    readonly ownerId: bigint;
    readonly grantedAtMillis: bigint;
    readonly ttlMillis: number;
    constructor(objectId: CacheObjectId, objectVersion: bigint, leaseId: bigint, ownerScope: CacheLeaseOwnerScope, ownerId: bigint, grantedAtMillis: bigint, ttlMillis: number);
    get expiresAtMillis(): bigint;
    isExpiredAt(nowMillis: bigint): boolean;
    validateVersion(expectedVersion: bigint): void;
}
interface NnrpRuntimeFrameEventBase<TType extends string, TMessageType extends NnrpMessageType, TMetadata> {
    readonly type: TType;
    readonly messageType: TMessageType;
    readonly metadata: TMetadata;
    readonly sessionId?: string;
}
type NnrpRuntimeFrameEventWithTail<TType extends string, TMessageType extends NnrpMessageType, TMetadata, TTail extends string> = NnrpRuntimeFrameEventBase<TType, TMessageType, TMetadata> & Readonly<Partial<Record<TTail, Uint8Array>>>;
export type NnrpRuntimeFrameEvent = NnrpRuntimeFrameEventWithTail<"cancel", NnrpMessageType.Cancel, ControlRequestMetadata, "diagnostic"> | NnrpRuntimeFrameEventWithTail<"abort", NnrpMessageType.Abort, ControlRequestMetadata, "diagnostic"> | NnrpRuntimeFrameEventBase<"priority-update", NnrpMessageType.PriorityUpdate, SchedulingMetadata> | NnrpRuntimeFrameEventBase<"deadline", NnrpMessageType.Deadline, SchedulingMetadata> | NnrpRuntimeFrameEventBase<"expire-at", NnrpMessageType.ExpireAt, SchedulingMetadata> | NnrpRuntimeFrameEventWithTail<"supersede", NnrpMessageType.Supersede, SupersedeMetadata, "diagnostic"> | NnrpRuntimeFrameEventBase<"budget-update", NnrpMessageType.BudgetUpdate, BudgetMetadata> | NnrpRuntimeFrameEventWithTail<"progress", NnrpMessageType.Progress, ProgressMetadata, "body"> | NnrpRuntimeFrameEventWithTail<"partial-result", NnrpMessageType.PartialResult, PartialResultMetadata, "body"> | NnrpRuntimeFrameEventBase<"backpressure", NnrpMessageType.Backpressure, PressureMetadata> | NnrpRuntimeFrameEventBase<"credit-update", NnrpMessageType.CreditUpdate, PressureMetadata> | NnrpRuntimeFrameEventWithTail<"capability-negotiation", NnrpMessageType.CapabilityNegotiation, CapabilityMetadata, "body"> | NnrpRuntimeFrameEventWithTail<"degrade-profile", NnrpMessageType.DegradeProfile, CapabilityMetadata, "body"> | NnrpRuntimeFrameEventWithTail<"route-hint", NnrpMessageType.RouteHint, RouteHintMetadata, "body"> | NnrpRuntimeFrameEventWithTail<"execution-hint", NnrpMessageType.ExecutionHint, RouteHintMetadata, "body"> | NnrpRuntimeFrameEventWithTail<"trace-context", NnrpMessageType.TraceContext, TraceContextMetadata, "body"> | NnrpRuntimeFrameEventWithTail<"result-drop-reason", NnrpMessageType.ResultDropReason, ResultDropReasonMetadata, "diagnostic"> | NnrpRuntimeFrameEventWithTail<"recoverable-error", NnrpMessageType.ErrorRecoverable, RecoverableErrorMetadata, "diagnostic"> | NnrpRuntimeFrameEventWithTail<"retry-after", NnrpMessageType.RetryAfter, RetryAfterMetadata, "diagnostic"> | NnrpRuntimeFrameEventWithTail<"object-declare", NnrpMessageType.ObjectDeclare, ObjectDescriptorMetadata, "body"> | NnrpRuntimeFrameEventWithTail<"object-ref", NnrpMessageType.ObjectRef, ObjectReferenceMetadata, "body"> | NnrpRuntimeFrameEventWithTail<"object-release", NnrpMessageType.ObjectRelease, ObjectReleaseMetadata, "diagnostic"> | (NnrpRuntimeFrameEventBase<"object-patch", NnrpMessageType.ObjectPatch, ObjectDeltaMetadata> & {
    readonly metadataBody?: Uint8Array;
    readonly delta?: Uint8Array;
}) | (NnrpRuntimeFrameEventBase<"object-delta", NnrpMessageType.ObjectDelta, ObjectDeltaMetadata> & {
    readonly metadataBody?: Uint8Array;
    readonly delta?: Uint8Array;
}) | NnrpRuntimeFrameEventWithTail<"cache-reference", NnrpMessageType.CacheReference, CacheReferenceMetadata, "body"> | NnrpRuntimeFrameEventWithTail<"cache-miss", NnrpMessageType.CacheMiss, CacheMissMetadata, "diagnostic"> | NnrpRuntimeFrameEventBase<"cache-invalidate", NnrpMessageType.CacheInvalidate, CacheInvalidateMetadata>;
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
export type RuntimeControlMetadata = ControlRequestMetadata | SchedulingMetadata | SupersedeMetadata | BudgetMetadata | ProgressMetadata | PartialResultMetadata | PressureMetadata | CapabilityMetadata | RouteHintMetadata | TraceContextMetadata | ResultDropReasonMetadata | RecoverableErrorMetadata | RetryAfterMetadata;
export interface DecodedRuntimeControlMetadata {
    readonly metadata: RuntimeControlMetadata;
    readonly tail: Uint8Array;
}
export type NnrpBuildMode = "backend-native" | "browser-wasm";
export type NnrpTransportKind = "tcp" | "quic" | "ipc" | "websocket";
export type NnrpTransportPolicy = "auto" | "prefer-quic" | "prefer-tcp" | "prefer-ipc" | "prefer-websocket" | "force-quic" | "force-tcp" | "force-ipc" | "force-websocket";
export type NnrpOperationId = bigint;
export type NnrpOperationState = "pending" | "dispatched" | "completed" | "dropped" | "cancelled";
export type NnrpCapability = "client.session" | "server.session" | "native.loader" | "wasm.loader" | "transport.tcp" | "transport.quic" | "transport.ipc" | "transport.websocket" | "flow.update" | "result.hint" | "cache" | "schema" | "recovery" | "control.cancel_abort" | "control.supersede" | "control.priority_update" | "control.deadline_expire" | "control.progress_partial" | "control.credit_backpressure" | "control.capability_costs" | "control.route_execution_hint" | "control.trace_context" | "control.result_drop_reason" | "control.degrade_profile" | "control.budget_update" | "control.recoverable_error" | "object.lifecycle" | "object.delta" | "object.cost" | "object.ownership" | "cache.reference";
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
export type NnrpTransportRejectionReason = "policy-disallowed" | "local-unavailable" | "peer-unsupported" | "limit-exceeded" | "probe-missing" | "probe-failed";
export type NnrpTransportProviderLimitation = "requires-udp" | "requires-tcp" | "local-host-only" | "native-host-only" | "browser-host-only" | "unix-domain-socket" | "windows-named-pipe";
export type NnrpTransportProbeState = "not-run" | "succeeded" | "failed" | "missing";
export interface NnrpTransportProviderCost {
    readonly modelId: number;
    readonly units: bigint;
}
export interface NnrpTransportProviderLimits {
    readonly maxFrameBytes: bigint;
}
export interface NnrpTransportProviderMetadata {
    readonly id: string;
    readonly cost: NnrpTransportProviderCost;
    readonly preferenceRank: number;
    readonly limits: NnrpTransportProviderLimits;
    readonly limitations: readonly NnrpTransportProviderLimitation[];
}
export interface NnrpTransportProviderObservation {
    readonly kind: NnrpTransportKind;
    readonly metadata: NnrpTransportProviderMetadata;
    readonly localAvailable: boolean;
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpTransportProbeMetrics {
    readonly sampleCount: number;
    readonly successCount: number;
    readonly medianThroughputBytesPerSecond: bigint;
    readonly medianRttMicroseconds: bigint;
}
export interface NnrpTransportClientSecurity {
    readonly mode: "client";
    readonly serverName: string;
    readonly trustedCertificateDer: Uint8Array;
}
export interface NnrpTransportServerSecurity {
    readonly mode: "server";
    readonly certificateDer: Uint8Array;
    readonly privateKeyPkcs8Der: Uint8Array;
}
export type NnrpTransportSecurity = NnrpTransportClientSecurity | NnrpTransportServerSecurity;
export interface NnrpTransportCandidate {
    readonly kind: NnrpTransportKind;
    readonly provider: NnrpTransportProviderMetadata;
    readonly localAvailable: boolean;
    readonly peerSupported: boolean;
    readonly withinLimits: boolean;
    readonly probeState: NnrpTransportProbeState;
    readonly probe?: NnrpTransportProbeMetrics;
    readonly selectionRank?: number;
    readonly rejectionReason?: NnrpTransportRejectionReason;
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpTransportEndpoint {
    readonly endpoint: string | URL;
    readonly maxPacketBytes?: bigint;
    readonly timeoutMillis?: number;
    readonly security?: NnrpTransportSecurity;
}
export interface NnrpTransportProbeOptions extends NnrpTransportEndpoint {
    readonly sampleCount?: number;
    readonly payloadBytes?: number;
}
export interface NnrpTransportReceiveOptions {
    readonly maxPackets?: number;
    readonly maxBytes?: bigint;
    readonly timeoutMillis?: number;
}
export interface NnrpTransportAcceptOptions {
    readonly timeoutMillis?: number;
}
export interface NnrpTransportConnection {
    readonly kind: NnrpTransportKind;
    readonly endpoint: string;
    readonly connected: boolean;
    send(packets: Uint8Array | readonly Uint8Array[]): Promise<void>;
    receive(options?: NnrpTransportReceiveOptions): Promise<readonly Uint8Array[]>;
    close(): void | Promise<void>;
}
export interface NnrpTransportServer {
    readonly kind: NnrpTransportKind;
    readonly endpoint: string;
    readonly listening: boolean;
    accept(options?: NnrpTransportAcceptOptions): Promise<NnrpTransportConnection>;
    close(): void | Promise<void>;
}
export interface NnrpNativeTransportBinding {
    readonly mode: "deno-ffi" | "node-addon" | "managed-ffi" | "test";
    probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
    connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
    listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}
export interface NnrpTransportProvider extends NnrpTransportProviderObservation {
    readonly endpointSchemes: readonly string[];
    probe?(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
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
    readonly providers: readonly NnrpTransportProviderObservation[];
    readonly requestedMaxFrameBytes?: bigint;
    readonly probeMetricsByProviderId?: Readonly<Record<string, NnrpTransportProbeMetrics>>;
}
export interface NnrpTransportSelectionSummary {
    readonly policy: NnrpTransportPolicy;
    readonly selected: NnrpTransportKind | null;
    readonly rejected: readonly NnrpRejectedTransportCandidate[];
    readonly candidates: readonly NnrpTransportCandidate[];
}
export interface NnrpRejectedTransportCandidate {
    readonly kind: NnrpTransportKind;
    readonly provider: NnrpTransportProviderMetadata;
    readonly reason: NnrpTransportRejectionReason;
    readonly diagnostic?: NnrpDiagnostic;
}
export declare const NNRP_STANDARD_INPUT_PROFILES: readonly ["tensor", "token", "structured_event", "tool_delta"];
export type NnrpInputProfile = (typeof NNRP_STANDARD_INPUT_PROFILES)[number];
export type NnrpSubmitMode = "inline" | "object-reference";
export type NnrpSubmitCapacityPolicy = "reject" | "await";
export type NnrpBinaryPayload = Uint8Array | ArrayBufferView;
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
    readonly operationId: bigint;
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
    readonly operationId: bigint;
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
export type NnrpSessionMigrationEvent = {
    readonly type: "migration-requested";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "migration-accepted";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "migration-rejected";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic: NnrpDiagnostic;
};
export type NnrpRuntimeEvent = {
    readonly type: "submit";
    readonly submit: NnrpNormalizedSubmitRequest;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "result";
    readonly result: NnrpResult;
    readonly sessionId?: string;
} | {
    readonly type: "flow-update";
    readonly update: NnrpFlowUpdateMetadata;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "result-hint";
    readonly hint: NnrpResultHintMetadata;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "drop";
    readonly frameId: number;
    readonly sessionId?: string;
    readonly diagnostic: NnrpDiagnostic;
} | NnrpSessionMigrationEvent | NnrpRuntimeFrameEvent | {
    readonly type: "close";
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "diagnostic";
    readonly sessionId?: string;
    readonly diagnostic: NnrpDiagnostic;
};
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
    addEventListener?(type: "abort", listener: () => void, options?: {
        readonly once?: boolean;
    }): void;
    removeEventListener?(type: "abort", listener: () => void): void;
}
export interface NnrpEventPollOptions {
    readonly timeoutMillis?: number;
    readonly signal?: NnrpAbortSignalLike;
}
export interface NnrpSubmitOptions {
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
export declare class NnrpError extends Error {
    readonly diagnostic: NnrpDiagnostic;
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NnrpCapabilityError extends NnrpError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NnrpTransportError extends NnrpError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NnrpTimeoutError extends NnrpError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NnrpProtocolError extends NnrpError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare function encodeRuntimeControlMetadata(messageType: NnrpMessageType, metadata: RuntimeControlMetadata, tail?: Uint8Array): Uint8Array;
export declare function decodeRuntimeControlMetadata(messageType: NnrpMessageType, payload: Uint8Array): DecodedRuntimeControlMetadata;
export declare function encodeRuntimeObjectMetadata(messageType: NnrpMessageType, metadata: RuntimeObjectMetadata, tail?: Uint8Array): Uint8Array;
export declare function decodeRuntimeObjectMetadata(messageType: NnrpMessageType, payload: Uint8Array): DecodedRuntimeObjectMetadata;
export declare function encodeCacheInvalidateMetadata(metadata: CacheInvalidateMetadata): Uint8Array;
export declare function decodeCacheInvalidateMetadata(payload: Uint8Array): CacheInvalidateMetadata;
export declare class NnrpResultDropError extends NnrpProtocolError {
    readonly frameId: number;
    readonly sessionId?: string;
    constructor(event: Extract<NnrpRuntimeEvent, {
        readonly type: "drop";
    }>);
}
export declare class NnrpRecoveryError extends NnrpCapabilityError {
    constructor(diagnostic: NnrpDiagnostic);
}
export interface NnrpCapabilityManifestOptions {
    readonly buildMode: NnrpBuildMode;
    readonly transports?: readonly NnrpTransportKind[];
    readonly capabilities?: readonly NnrpCapability[];
}
export declare function createCapabilityManifest(options: NnrpCapabilityManifestOptions): NnrpCapabilityManifest;
export declare function createBackendNativeManifest(capabilities?: readonly NnrpCapability[]): NnrpCapabilityManifest;
export declare function createBrowserWasmManifest(capabilities?: readonly NnrpCapability[]): NnrpCapabilityManifest;
export declare function selectTransport(candidates: readonly NnrpTransportCandidate[], policy?: NnrpTransportPolicy): NnrpTransportSelection;
export declare function createTransportCandidates(options: NnrpTransportCandidateOptions): readonly NnrpTransportCandidate[];
export declare function createTransportSelectionSummary(selection: NnrpTransportSelection): NnrpTransportSelectionSummary;
export declare function parseApplicationEndpoint(endpoint: string | URL): URL;
export declare function resolveProviderEndpoint(endpoint: string | URL, transport: NnrpTransportKind, providerEndpoint?: string | URL): string;
export interface NormalizeSubmitRequestOptions {
    readonly copyPayloads?: boolean;
    readonly strictProfiles?: boolean;
}
export declare function createCacheKey(kind: NnrpCacheObjectKind, key: bigint | number | string, namespaceId?: number): NnrpCacheKey;
export declare function createSchemaDescriptor(descriptor: NnrpSchemaDescriptor): NnrpSchemaDescriptor;
export declare function normalizeCachePutRequest(request: NnrpCachePutRequest): NnrpCachePutRequest;
export declare function normalizeCacheInvalidateRequest(request: NnrpCacheInvalidateRequest): NnrpCacheInvalidateRequest;
export declare function isStandardInputProfile(profile: string): profile is NnrpInputProfile;
export declare function normalizeSubmitRequest(request: NnrpSubmitRequest, options?: NormalizeSubmitRequestOptions): NnrpNormalizedSubmitRequest;
export declare function createRecoveryToken(token: string | NnrpBinaryPayload, metadata?: Readonly<Record<string, string>>): NnrpRecoveryToken;
export declare function normalizeSessionMigrationRequest(request: NnrpSessionMigrationRequest): NnrpSessionMigrationRequest;
export declare function throwIfResultDrop(event: NnrpRuntimeEvent): void;
export declare function validateEventPollOptions(options?: NnrpEventPollOptions): void;
export declare function validateSessionMetadata(options?: NnrpSessionMetadataOptions): void;
export declare function normalizeSessionPatchRequest(request: NnrpSessionPatchRequest): NnrpSessionPatchRequest;
export {};
//# sourceMappingURL=index.d.ts.map
