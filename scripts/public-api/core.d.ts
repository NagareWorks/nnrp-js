export declare const NNRP_PROTOCOL_NAME = "NNRP";
export declare const NNRP_PROTOCOL_VERSION = "1.0.0";
export declare const NNRP_TYPED_PAYLOAD_DESCRIPTOR_BYTES = 24;
export declare const NNRP_SESSION_OPEN_METADATA_BYTES = 48;
export declare const NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES = 28;
export declare const NNRP_SCHEMA_DESCRIPTOR_HEADER_BYTES = 32;
export declare const NNRP_STANDARD_PROFILE_TOKEN = 2;
export declare const NNRP_TOKEN_DELTA_SCHEMA_ID = 4097;
export declare const NNRP_TOKEN_DELTA_SCHEMA_VERSION = 3;
export declare const NNRP_TOKEN_DELTA_SCHEMA_HASH = 7957423418925607731n;
export declare enum NnrpStandardProfile {
    Unspecified = 0,
    Tensor = 1,
    Token = 2
}
export declare enum NnrpStreamSemantics {
    Unspecified = 0,
    Snapshot = 1,
    Append = 2
}
export declare enum NnrpSchemaDescriptorFlags {
    None = 0,
    BreakingChange = 1,
    CompatibleUpdate = 2,
    DependencyBound = 4,
    BodySchemaPresent = 8
}
export declare enum NnrpSchemaRegistryAction {
    Installed = 1,
    AlreadyInstalled = 2,
    Updated = 3,
    Invalidated = 4
}
export declare enum NnrpSchemaRegistryFailure {
    Unknown = 1,
    VersionUnknown = 2,
    HashConflict = 3,
    Incompatible = 4,
    UpdateRejected = 5
}
export interface NnrpSchemaDescriptorHeader {
    readonly schemaId: number;
    readonly schemaVersion: number;
    readonly profileId: NnrpStandardProfile | number;
    readonly schemaFlags: NnrpSchemaDescriptorFlags | number;
    readonly minVersionMajor: number;
    readonly maxVersionMajor: number;
    readonly bodyBytes: number;
    readonly dependencyCount: number;
    readonly defaultStreamSemantics: NnrpStreamSemantics | number;
    readonly schemaHash: bigint;
}
export declare class NnrpSchemaRegistry {
    #private;
    constructor(descriptors?: readonly NnrpSchemaDescriptorHeader[]);
    install(descriptor: NnrpSchemaDescriptorHeader): NnrpSchemaRegistryAction;
    lookup(schemaId: number, schemaVersion: number): NnrpSchemaDescriptorHeader;
    invalidate(schemaId: number, schemaVersion: number): NnrpSchemaRegistryAction;
    validateBinding(descriptor: NnrpTypedPayloadDescriptor): void;
    snapshot(): readonly NnrpSchemaDescriptorHeader[];
}
export declare function tokenDeltaSchemaDescriptor(): NnrpSchemaDescriptorHeader;
export declare enum NnrpPayloadKind {
    Tensor = 1,
    TokenChunk = 2,
    AudioChunk = 4,
    VideoChunk = 8,
    StructuredEvent = 16,
    ToolDelta = 32,
    OpaqueBytes = 64
}
export declare enum NnrpTypedPayloadDescriptorFlags {
    None = 0,
    Terminal = 1,
    Partial = 2,
    SchemaOverride = 4,
    ProfileHintPresent = 8
}
export interface NnrpTypedPayloadDescriptor {
    profileId: number;
    payloadKind: NnrpPayloadKind;
    descriptorFlags: NnrpTypedPayloadDescriptorFlags;
    schemaId: number;
    schemaVersion: number;
    streamSemantics: number;
    offset: number;
    length: number;
}
export interface NnrpTypedPayloadFrame {
    descriptor: NnrpTypedPayloadDescriptor;
    payload: Uint8Array;
}
export declare function encodeTypedPayloadDescriptor(descriptor: NnrpTypedPayloadDescriptor): Uint8Array;
export declare function decodeTypedPayloadDescriptor(source: Uint8Array): NnrpTypedPayloadDescriptor;
export declare enum NnrpSessionPriorityClass {
    Interactive = 0,
    Balanced = 1,
    Background = 2
}
export interface ClientHelloMetadata {
    readonly minVersionMajor: number;
    readonly maxVersionMajor: number;
    readonly supportedWireFormatBitmap: number;
    readonly supportedProfileBitmap: number;
    readonly supportedPayloadKindBitmap: number;
    readonly supportedCodecBitmap: number;
    readonly supportedCompressionBitmap: number;
    readonly supportedDtypeBitmap: number;
    readonly supportedLayoutBitmap: number;
    readonly cacheDigestBitmap: number;
    readonly cacheObjectBitmap: number;
    readonly cacheNamespaceCount: number;
    readonly maxLaneCount: number;
    readonly maxCacheEntries: number;
    readonly maxCacheBytes: number;
    readonly targetCadenceX100: number;
    readonly latencyBudgetMs: number;
    readonly qualityTier: number;
    readonly degradePolicy: number;
    readonly requestedSessionId: number;
    readonly authBytes: number;
    readonly controlExtensionBytes: number;
}
export declare enum SessionPatchAckStatus {
    Accepted = 0,
    PartiallyApplied = 1,
    Rejected = 2
}
export declare enum SessionPatchRejectReason {
    None = 0,
    UnsupportedField = 1,
    InvalidRange = 2,
    UnsupportedStrategy = 3,
    InvalidLaneMask = 4,
    RateLimited = 5
}
export interface SessionPatchAckMetadata {
    readonly ackStatus: SessionPatchAckStatus;
    readonly rejectReason: SessionPatchRejectReason;
    readonly appliedPatchMask: number;
    readonly rejectedPatchMask: number;
    readonly retryAfterMs: number;
    readonly effectiveProfileId: number;
    readonly effectiveTargetCadenceX100: number;
    readonly effectiveQualityTier: number;
    readonly effectiveDegradePolicy: number;
    readonly effectiveLaneMask: bigint;
    readonly effectiveCodecBitmap: number;
    readonly effectiveCompressionBitmap: number;
    readonly profilePatchAckBytes: number;
}
export declare function encodeClientHelloMetadata(metadata: ClientHelloMetadata): Uint8Array;
export declare function decodeClientHelloMetadata(encoded: Uint8Array): ClientHelloMetadata;
export declare function encodeSessionPatchAckMetadata(metadata: SessionPatchAckMetadata): Uint8Array;
export declare function decodeSessionPatchAckMetadata(encoded: Uint8Array): SessionPatchAckMetadata;
export interface NnrpSessionOpenMetadata {
    readonly requestedSessionId: number;
    readonly profileId: number;
    readonly priorityClass: NnrpSessionPriorityClass;
    readonly sessionFlags: number;
    readonly schemaId: number;
    readonly schemaVersion: number;
    readonly defaultDeadlineMillis: number;
    readonly maxInFlightOperations: number;
    readonly leaseTtlHintMillis: number;
    readonly resumeTokenBytes: number;
    readonly authBytes: number;
    readonly sessionExtensionBytes: number;
    readonly clientSessionTag: bigint;
}
export declare function encodeSessionOpenMetadata(metadata: NnrpSessionOpenMetadata): Uint8Array;
export declare function decodeSessionOpenMetadata(encoded: Uint8Array): NnrpSessionOpenMetadata;
export declare class NnrpSessionRecoveryTicket {
    #private;
    readonly sessionId: number;
    readonly resumeFromOperationId: bigint | undefined;
    readonly resumeWindowMillis: number;
    private constructor();
    get resumeToken(): Uint8Array;
    toBytes(): Uint8Array;
    static fromBytes(encoded: Uint8Array): NnrpSessionRecoveryTicket;
}
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
export interface NnrpCacheObjectVersion {
    readonly objectId: CacheObjectId;
    readonly objectVersion: bigint;
    readonly schemaId: number;
    readonly schemaVersion: number;
}
export type NnrpCacheLeaseOutcome = "valid" | "expired" | "renewed" | "released" | "missing";
export type NnrpCacheInvalidationReason = "explicit" | "dependency-invalidated" | "lease-expired" | "version-mismatch" | "schema-mismatch";
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
    readonly invalidateScope: CacheInvalidateScope;
    readonly cacheNamespace: number;
    readonly cacheKeyHi: bigint;
    readonly cacheKeyLo: bigint;
    readonly reasonCode: number;
}
export declare enum CacheAckStatus {
    Accepted = 0,
    Rejected = 1,
    Replaced = 2
}
export declare enum CacheInvalidateScope {
    WholeSession = 0,
    Namespace = 1,
    ObjectKind = 2,
    ObjectKey = 3
}
export interface CachePutMetadata {
    readonly cacheNamespace: number;
    readonly cacheKeyHi: bigint;
    readonly cacheKeyLo: bigint;
    readonly objectKind: NnrpCacheObjectKind;
    readonly ttlMs: number;
    readonly objectBytes: number;
    readonly codecBitmap: number;
    readonly flags: number;
}
export interface CacheAckMetadata {
    readonly cacheNamespace: number;
    readonly cacheKeyHi: bigint;
    readonly cacheKeyLo: bigint;
    readonly status: CacheAckStatus;
    readonly acceptedTtlMs: number;
    readonly maxObjectBytes: number;
    readonly detailCode: number;
}
export interface TransportProbeMetadata {
    readonly probeId: number;
    readonly probePayloadBytes: number;
    readonly clientSendTsUs: bigint;
}
export interface TransportProbeAckMetadata {
    readonly probeId: number;
    readonly serverRecvTsUs: bigint;
}
export declare function encodeCachePutMetadata(metadata: CachePutMetadata): Uint8Array;
export declare function decodeCachePutMetadata(encoded: Uint8Array): CachePutMetadata;
export declare function encodeCacheAckMetadata(metadata: CacheAckMetadata): Uint8Array;
export declare function decodeCacheAckMetadata(encoded: Uint8Array): CacheAckMetadata;
export declare function encodeTransportProbeMetadata(metadata: TransportProbeMetadata): Uint8Array;
export declare function decodeTransportProbeMetadata(encoded: Uint8Array): TransportProbeMetadata;
export declare function encodeTransportProbeAckMetadata(metadata: TransportProbeAckMetadata): Uint8Array;
export declare function decodeTransportProbeAckMetadata(encoded: Uint8Array): TransportProbeAckMetadata;
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
export declare class NnrpCacheLeaseResult {
    readonly objectId: CacheObjectId;
    readonly outcome: NnrpCacheLeaseOutcome;
    readonly lease?: CacheLease;
    readonly objectVersion?: NnrpCacheObjectVersion;
    readonly diagnostic?: string;
    constructor(options: {
        readonly objectId: CacheObjectId;
        readonly outcome: NnrpCacheLeaseOutcome;
        readonly lease?: CacheLease;
        readonly objectVersion?: NnrpCacheObjectVersion;
        readonly diagnostic?: string;
    });
}
export declare class NnrpCachePolicyOptions {
    readonly enabled: boolean;
    readonly reuseScope?: CacheReuseScope;
    readonly expirationHintMs: bigint;
    readonly invalidationReason: NnrpCacheInvalidationReason;
    constructor(options: {
        readonly enabled: boolean;
        readonly reuseScope?: CacheReuseScope;
        readonly expirationHintMs?: bigint;
        readonly invalidationReason?: NnrpCacheInvalidationReason;
    });
}
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
export type NnrpConnectionLifecycleState = "open" | "closing" | "closed";
export type NnrpSessionLifecycleState = "open" | "resumed" | "closing" | "draining" | "closed";
export declare class NnrpSessionLifecycle {
    readonly sessionId: number;
    readonly state: NnrpSessionLifecycleState;
    readonly profileId: number;
    readonly priorityClass: NnrpSessionPriorityClass;
    readonly schemaId: number;
    readonly schemaVersion: number;
    readonly maxInFlightOperations: number;
    readonly routeScopeId: number;
    readonly lastOperationId: bigint;
    readonly sessionErrorCode: number;
    constructor(options: {
        readonly sessionId: number;
        readonly state: NnrpSessionLifecycleState;
        readonly profileId: number;
        readonly priorityClass: NnrpSessionPriorityClass;
        readonly schemaId: number;
        readonly schemaVersion: number;
        readonly maxInFlightOperations: number;
        readonly routeScopeId: number;
        readonly lastOperationId: bigint;
        readonly sessionErrorCode: number;
    });
    get acceptsSessionScopedMessages(): boolean;
    get acceptsNewOperations(): boolean;
}
export declare class NnrpConnectionLifecycle {
    readonly state: NnrpConnectionLifecycleState;
    readonly sessions: readonly NnrpSessionLifecycle[];
    constructor(options: {
        readonly state: NnrpConnectionLifecycleState;
        readonly sessions?: readonly NnrpSessionLifecycle[];
    });
}
export type NnrpTransportPolicy = "auto" | "prefer-quic" | "prefer-tcp" | "prefer-ipc" | "prefer-websocket" | "force-quic" | "force-tcp" | "force-ipc" | "force-websocket";
export type NnrpOperationId = bigint;
export type NnrpOperationState = "accepted" | "running" | "partial" | "waiting-tool" | "superseded" | "cancelled" | "failed" | "completed";
export type NnrpCapability = "client.session" | "server.session" | "native.loader" | "wasm.loader" | "transport.tcp" | "transport.quic" | "transport.ipc" | "transport.websocket" | "flow.update" | "result.hint" | "cache" | "schema" | "recovery" | "handshake.basic" | "session.open_close" | "session.resume" | "flow_update" | "frame_submit.tensor.inline" | "result_push.basic" | "cache.lifecycle" | "payload.typed" | "control.cancel_abort" | "control.supersede" | "control.priority_update" | "control.deadline_expire" | "control.progress_partial" | "control.credit_backpressure" | "control.capability_costs" | "control.route_execution_hint" | "control.trace_context" | "control.result_drop_reason" | "control.degrade_profile" | "control.budget_update" | "control.recoverable_error" | "object.lifecycle" | "object.delta" | "object.cost" | "object.ownership" | "cache.reference";
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
export type NnrpTransportRejectionReason = "policy-disallowed" | "local-unavailable" | "peer-unsupported" | "limit-exceeded" | "route-unresolved" | "security-unsatisfied" | "probe-missing" | "probe-failed";
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
export type NnrpTransportProviderKind = "pure-rust" | "native-dynamic" | "wasm";
export interface NnrpTransportProviderDescriptor {
    readonly name: string;
    readonly version: string;
    readonly transportId: NnrpTransportKind;
    readonly kind: NnrpTransportProviderKind;
    readonly available: boolean;
    readonly libraryPath?: string;
    readonly metadata: NnrpTransportProviderMetadata;
    readonly diagnostic?: string;
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
export interface NnrpTransportCandidateReadiness {
    readonly transportId: NnrpTransportKind;
    readonly providerId: string;
    readonly routeResolved: boolean;
    readonly securitySatisfied: boolean;
    readonly diagnostic?: string;
}
export interface NnrpTransportProbeObservation {
    readonly transportId: NnrpTransportKind;
    readonly providerId: string;
    readonly state: "succeeded" | "failed";
    readonly metrics?: NnrpTransportProbeMetrics;
    readonly diagnostic?: string;
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
export interface NnrpClientProviderRoute {
    readonly endpoint?: NnrpProviderEndpoint;
    readonly security?: NnrpTransportClientSecurity;
}
export interface NnrpServerProviderRoute {
    readonly endpoint?: NnrpProviderEndpoint;
    readonly security?: NnrpTransportServerSecurity;
}
export type NnrpClientProviderRoutes = Readonly<Partial<Record<NnrpTransportKind, NnrpClientProviderRoute>>>;
export type NnrpServerProviderRoutes = Readonly<Partial<Record<NnrpTransportKind, NnrpServerProviderRoute>>>;
export interface NnrpTransportCandidate {
    readonly transportId: NnrpTransportKind;
    readonly provider: NnrpTransportProviderMetadata;
    readonly localAvailable: boolean;
    readonly peerSupported: boolean;
    readonly withinLimits: boolean;
    readonly probeState: NnrpTransportProbeState;
    readonly probe?: NnrpTransportProbeMetrics;
    readonly selectionRank?: number;
    readonly rejectionReason?: NnrpTransportRejectionReason;
    readonly diagnostic?: string;
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
export declare class NnrpEndpoint {
    #private;
    readonly uri: string;
    constructor(uri: string | URL);
    static parse(uri: string | URL): NnrpEndpoint;
    get protocol(): "nnrp:" | "nnrps:";
    get host(): string;
    get hostname(): string;
    get port(): string;
    get pathname(): string;
    get search(): string;
    get hash(): string;
    get secure(): boolean;
    toString(): string;
}
export declare class NnrpProviderEndpoint {
    readonly uri: string;
    readonly scheme: "tcp" | "quic" | "unix" | "npipe" | "ws" | "wss";
    constructor(uri: string | URL);
    static parse(uri: string | URL): NnrpProviderEndpoint;
    matchesTransport(transport: NnrpTransportKind): boolean;
    get secure(): boolean;
    toString(): string;
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
    readonly descriptor: NnrpTransportProviderDescriptor;
    readonly endpointSchemes: readonly string[];
    probe?(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
    connect?(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
    listen?(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}
export interface NnrpTransportSelection {
    readonly selectedProvider: NnrpTransportProviderDescriptor;
    readonly candidates: readonly NnrpTransportCandidate[];
    readonly policy: NnrpTransportPolicy;
    readonly diagnostic?: string;
}
export interface NnrpTransportSelectionOptions {
    readonly peerSupportedTransports: readonly NnrpTransportKind[];
    readonly policy: NnrpTransportPolicy;
    readonly requestedMaxFrameBytes?: bigint;
    readonly candidateReadiness: readonly NnrpTransportCandidateReadiness[];
    readonly probeObservations: readonly NnrpTransportProbeObservation[];
}
export type NnrpTransportSelectionErrorCode = "INVALID_EVIDENCE" | "FORCED_TRANSPORT_UNAVAILABLE" | "NO_VIABLE_TRANSPORT";
export interface NnrpTransportSelectionSummary {
    readonly policy: NnrpTransportPolicy;
    readonly selected: NnrpTransportKind | null;
    readonly rejected: readonly NnrpRejectedTransportCandidate[];
    readonly candidates: readonly NnrpTransportCandidate[];
}
export interface NnrpRejectedTransportCandidate {
    readonly transportId: NnrpTransportKind;
    readonly provider: NnrpTransportProviderMetadata;
    readonly reason: NnrpTransportRejectionReason;
    readonly diagnostic?: string;
}
export declare const NNRP_STANDARD_INPUT_PROFILES: readonly ["tensor", "token", "structured_event", "tool_delta"];
export type NnrpInputProfile = (typeof NNRP_STANDARD_INPUT_PROFILES)[number];
export declare enum NnrpSubmitMode {
    Inline = 0,
    Reference = 1,
    Mixed = 2
}
export declare enum NnrpHeaderFlags {
    None = 0,
    AckRequired = 1,
    CanDrop = 2,
    Stale = 4,
    EndOfStream = 8,
    Retransmit = 16,
    Keyframe = 32
}
export declare enum NnrpBudgetPolicy {
    None = 0,
    AllowPartial = 1,
    AllowStaleReuse = 2,
    AllowDegraded = 4,
    AllowDrop = 8
}
export declare enum NnrpLossTolerancePolicy {
    Strict = 0,
    BestEffort = 1,
    LowLatency = 2,
    FireAndForget = 3,
    InheritSession = 255
}
export declare enum NnrpTensorInputProfile {
    Unspecified = 0,
    ChangedTilesLuma = 1,
    DenseLumaFrame = 2
}
export declare enum NnrpTileIndexMode {
    DenseRange = 0,
    RawU16 = 1,
    DeltaU16 = 2,
    Bitset = 3
}
export type NnrpSubmitCapacityPolicy = "reject" | "await";
export type NnrpBinaryPayload = Uint8Array | ArrayBufferView;
export interface NnrpSubmitHeaderContext {
    readonly flags: NnrpHeaderFlags | number;
    readonly viewId: number;
    readonly routeId: number;
    readonly traceId: bigint;
}
export interface NnrpSubmitIdentity {
    readonly operationId: bigint;
    readonly frameId: number;
    readonly header: NnrpSubmitHeaderContext;
}
export interface NnrpSubmitPolicy {
    readonly frameClass: number;
    readonly latencyBudgetMs: number;
    readonly targetFpsX100: number;
    readonly retryOfFrame: number;
    readonly budgetPolicy: NnrpBudgetPolicy | number;
    readonly lossTolerancePolicy: NnrpLossTolerancePolicy | number;
    readonly dependencyFrameId: number;
}
export interface NnrpTensorSection {
    readonly roleId: number;
    readonly defaultCodecId: number;
    readonly dtypeId: number;
    readonly layoutId: number;
    readonly scalePolicy: number;
    readonly elementCountPerTile: number;
    readonly tilePayloads: readonly NnrpBinaryPayload[];
    readonly codecIds: readonly number[];
    readonly payloadStrideBytes: number;
}
export interface NnrpObjectReferenceBlock {
    readonly objectKind: NnrpCacheObjectKind;
    readonly refFlags: number;
    readonly cacheNamespace: number;
    readonly cacheKeyHi: bigint;
    readonly cacheKeyLo: bigint;
}
export interface NnrpSubmitObjectReferences {
    readonly camera?: NnrpObjectReferenceBlock;
    readonly tileIndex?: NnrpObjectReferenceBlock;
    readonly tensorSectionTable?: NnrpObjectReferenceBlock;
}
export interface NnrpTensorSubmitInput {
    readonly identity: NnrpSubmitIdentity;
    readonly policy: NnrpSubmitPolicy;
    readonly srcWidth: number;
    readonly srcHeight: number;
    readonly tileWidth: number;
    readonly tileHeight: number;
    readonly tileIds: readonly number[];
    readonly sections: readonly NnrpTensorSection[];
    readonly cameraBlock: NnrpBinaryPayload;
    readonly inputProfile: NnrpTensorInputProfile;
    readonly tileIndexMode: NnrpTileIndexMode;
    readonly tileBaseId: number;
    readonly references: NnrpSubmitObjectReferences;
}
export interface NnrpTokenChunk {
    readonly payload: NnrpBinaryPayload;
    readonly descriptorFlags?: NnrpTypedPayloadDescriptorFlags;
}
export interface NnrpTokenSubmitInput {
    readonly identity: NnrpSubmitIdentity;
    readonly policy: NnrpSubmitPolicy;
    readonly chunks: readonly NnrpTokenChunk[];
}
export interface NnrpTypedPayloadInputFrame {
    readonly profileId: number;
    readonly payloadKind: NnrpPayloadKind;
    readonly descriptorFlags?: NnrpTypedPayloadDescriptorFlags;
    readonly schemaId?: number;
    readonly schemaVersion?: number;
    readonly streamSemantics?: number;
    readonly payload: NnrpBinaryPayload;
}
export interface NnrpTypedPayloadSubmitInput {
    readonly identity: NnrpSubmitIdentity;
    readonly policy: NnrpSubmitPolicy;
    readonly frames: readonly NnrpTypedPayloadInputFrame[];
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
    readonly header: NnrpSubmitHeaderContext;
    readonly metadata: NnrpSubmitMetadata;
    readonly body: Uint8Array;
}
export interface NnrpSubmitMetadata {
    readonly srcWidth: number;
    readonly srcHeight: number;
    readonly tileWidth: number;
    readonly tileHeight: number;
    readonly tileCount: number;
    readonly sectionCount: number;
    readonly frameClass: number;
    readonly inputProfile: NnrpTensorInputProfile;
    readonly tileIndexMode: NnrpTileIndexMode;
    readonly latencyBudgetMs: number;
    readonly targetFpsX100: number;
    readonly retryOfFrame: number;
    readonly tileBaseId: number;
    readonly cameraBytes: number;
    readonly tileIndexBytes: number;
    readonly submitMode: NnrpSubmitMode;
    readonly budgetPolicy: NnrpBudgetPolicy | number;
    readonly lossTolerancePolicy: NnrpLossTolerancePolicy | number;
    readonly objectRefMask: number;
    readonly dependencyFrameId: number;
    readonly payloadKindBitmap: number;
    readonly payloadFrameCount: number;
}
export type NnrpNormalizedSubmitRequest = NnrpSubmitRequest;
export declare enum NnrpResultClass {
    Complete = 0,
    Partial = 1,
    StaleReuse = 2,
    Degraded = 3
}
export interface NnrpResultPushMetadata {
    readonly statusCode: number;
    readonly resultFlags: number;
    readonly sectionCount: number;
    readonly tileCount: number;
    readonly activeProfileId: number;
    readonly inferenceMs: number;
    readonly queueMs: number;
    readonly serverTotalMs: number;
    readonly tileBaseId: number;
    readonly tileIndexBytes: number;
    readonly resultClass: NnrpResultClass;
    readonly appliedBudgetPolicy: number;
    readonly reusedFrameId: number;
    readonly coveredTileCount: number;
    readonly droppedTileCount: number;
    readonly payloadKindBitmap: number;
    readonly payloadFrameCount: number;
}
export declare enum NnrpFlowScopeKind {
    Connection = 0,
    Session = 1,
    Operation = 2
}
export declare enum NnrpFlowUpdateReason {
    Grant = 0,
    Reduce = 1,
    Pause = 2,
    Resume = 3,
    Congestion = 4
}
export declare enum NnrpBackpressureLevel {
    None = 0,
    Soft = 1,
    Hard = 2,
    Paused = 3
}
export interface NnrpFlowUpdateMetadata {
    readonly scopeKind: NnrpFlowScopeKind;
    readonly updateReason: NnrpFlowUpdateReason;
    readonly backpressureLevel: NnrpBackpressureLevel;
    readonly connectionCredit: number;
    readonly sessionCredit: number;
    readonly operationCredit: number;
    readonly operationId: bigint;
    readonly retryAfterMs: number;
    readonly creditEpoch: number;
    readonly flowFlags: number;
}
export declare enum NnrpResultHintBudgetPolicy {
    None = 0,
    Full = 1,
    Partial = 2,
    StaleReuse = 3,
    Drop = 4
}
export declare enum NnrpResultHintCongestionState {
    None = 0,
    Steady = 1,
    Elevated = 2,
    Saturated = 3
}
export declare enum NnrpResultHintReason {
    None = 0,
    QueueFull = 1,
    ServerBusy = 2,
    BudgetExceeded = 3,
    Superseded = 4
}
export interface NnrpResultHintMetadata {
    readonly appliedBudgetPolicy: NnrpResultHintBudgetPolicy;
    readonly congestionState: NnrpResultHintCongestionState;
    readonly reason: NnrpResultHintReason;
    readonly retryAfterMs: number;
}
export declare enum NnrpSessionCloseReason {
    Normal = 0,
    ClientShutdown = 1,
    ServerShutdown = 2,
    IdleTimeout = 3,
    ProtocolError = 4,
    AuthRevoked = 5
}
export declare enum NnrpInFlightPolicy {
    Drain = 0,
    Abort = 1
}
export interface NnrpSessionCloseMetadata {
    readonly closeReason: NnrpSessionCloseReason;
    readonly inFlightPolicy: NnrpInFlightPolicy;
    readonly drainTimeoutMs: number;
    readonly lastOperationId: bigint;
    readonly sessionErrorCode: number;
    readonly sessionCloseTag: number;
}
export interface NnrpRuntimeFrameHeader {
    readonly versionMajor: 1;
    readonly wireFormat: 0;
    readonly messageType: NnrpMessageType;
    readonly flags: NnrpHeaderFlags | number;
    readonly sessionId: number;
    readonly frameId: number;
    readonly viewId: number;
    readonly routeId: number;
    readonly traceId: bigint;
}
export interface NnrpFrameSubmitMetadata extends NnrpSubmitMetadata {
    readonly operationId: bigint;
}
export type NnrpRuntimeEventMetadata = {
    readonly type: "none";
} | {
    readonly type: "frame_submit";
    readonly value: NnrpFrameSubmitMetadata;
} | {
    readonly type: "result_push";
    readonly value: NnrpResultPushMetadata;
} | {
    readonly type: "result_hint";
    readonly value: NnrpResultHintMetadata;
} | {
    readonly type: "control_request";
    readonly value: ControlRequestMetadata;
} | {
    readonly type: "scheduling";
    readonly value: SchedulingMetadata;
} | {
    readonly type: "supersede";
    readonly value: SupersedeMetadata;
} | {
    readonly type: "budget";
    readonly value: BudgetMetadata;
} | {
    readonly type: "progress";
    readonly value: ProgressMetadata;
} | {
    readonly type: "partial_result";
    readonly value: PartialResultMetadata;
} | {
    readonly type: "pressure";
    readonly value: PressureMetadata;
} | {
    readonly type: "capability";
    readonly value: CapabilityMetadata;
} | {
    readonly type: "route_hint";
    readonly value: RouteHintMetadata;
} | {
    readonly type: "trace_context";
    readonly value: TraceContextMetadata;
} | {
    readonly type: "result_drop_reason";
    readonly value: ResultDropReasonMetadata;
} | {
    readonly type: "recoverable_error";
    readonly value: RecoverableErrorMetadata;
} | {
    readonly type: "retry_after";
    readonly value: RetryAfterMetadata;
} | {
    readonly type: "flow_update";
    readonly value: NnrpFlowUpdateMetadata;
} | {
    readonly type: "object_descriptor";
    readonly value: ObjectDescriptorMetadata;
} | {
    readonly type: "object_reference";
    readonly value: ObjectReferenceMetadata;
} | {
    readonly type: "object_release";
    readonly value: ObjectReleaseMetadata;
} | {
    readonly type: "object_delta";
    readonly value: ObjectDeltaMetadata;
} | {
    readonly type: "cache_reference";
    readonly value: CacheReferenceMetadata;
} | {
    readonly type: "cache_miss";
    readonly value: CacheMissMetadata;
} | {
    readonly type: "cache_invalidate";
    readonly value: CacheInvalidateMetadata;
} | {
    readonly type: "session_close";
    readonly value: NnrpSessionCloseMetadata;
};
export type NnrpRuntimeEventTail = {
    readonly type: "none";
} | {
    readonly type: "body";
    readonly body: Uint8Array;
} | {
    readonly type: "diagnostic";
    readonly diagnostic: Uint8Array;
} | {
    readonly type: "metadata_body_and_delta";
    readonly metadataBody: Uint8Array;
    readonly delta: Uint8Array;
};
export interface NnrpRuntimeEvent {
    readonly header: NnrpRuntimeFrameHeader;
    readonly metadata: NnrpRuntimeEventMetadata;
    readonly tail: NnrpRuntimeEventTail;
}
export interface NnrpOperationLifecycleEvent {
    readonly operationId: bigint;
    readonly state: NnrpOperationState;
}
export type NnrpClientEvent = {
    readonly type: "runtime";
    readonly event: NnrpRuntimeEvent;
} | {
    readonly type: "lifecycle";
    readonly event: NnrpOperationLifecycleEvent;
};
export type NnrpTerminalEvent = {
    readonly type: "runtime";
    readonly event: NnrpRuntimeEvent;
} | {
    readonly type: "lifecycle";
    readonly event: NnrpOperationLifecycleEvent;
};
export type NnrpResultTerminalState = "success" | "cancelled" | "dropped" | "error";
export interface NnrpResult {
    readonly operationId: bigint;
    readonly terminalState: NnrpResultTerminalState;
    readonly event: NnrpTerminalEvent;
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
    readonly sessionId?: number;
    readonly diagnostic?: NnrpDiagnostic;
    readonly metadata?: Readonly<Record<string, string>>;
}
export declare class NnrpError<TDiagnostic extends NnrpDiagnostic | string = NnrpDiagnostic> extends Error {
    readonly diagnostic: TDiagnostic;
    constructor(diagnostic: TDiagnostic);
}
export declare class NnrpCapabilityError extends NnrpError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NnrpTransportError<TDiagnostic extends NnrpDiagnostic | string = NnrpDiagnostic> extends NnrpError<TDiagnostic> {
    constructor(diagnostic: TDiagnostic);
}
export declare class NnrpTransportSelectionError extends NnrpTransportError<string> {
    readonly code: NnrpTransportSelectionErrorCode;
    readonly policy?: NnrpTransportPolicy;
    readonly transportId?: NnrpTransportKind;
    readonly candidates: readonly NnrpTransportCandidate[];
    constructor(code: NnrpTransportSelectionErrorCode, diagnostic: string, evidence?: {
        readonly policy?: NnrpTransportPolicy;
        readonly transportId?: NnrpTransportKind;
        readonly candidates?: readonly NnrpTransportCandidate[];
    });
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
export declare function encodeRuntimeObjectMetadataSegments(messageType: NnrpMessageType, metadata: RuntimeObjectMetadata, tailSegments: readonly Uint8Array[]): Uint8Array;
export declare function decodeRuntimeObjectMetadata(messageType: NnrpMessageType, payload: Uint8Array): DecodedRuntimeObjectMetadata;
export declare function encodeCacheInvalidateMetadata(metadata: CacheInvalidateMetadata): Uint8Array;
export declare function decodeCacheInvalidateMetadata(payload: Uint8Array): CacheInvalidateMetadata;
export declare class NnrpResultDropError extends NnrpProtocolError {
    readonly event: NnrpRuntimeEvent;
    readonly frameId: number;
    readonly sessionId: number;
    constructor(event: NnrpRuntimeEvent);
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
export declare function selectTransport(providers: readonly NnrpTransportProviderDescriptor[], options: NnrpTransportSelectionOptions): NnrpTransportSelection;
export declare function createTransportCandidates(providers: readonly NnrpTransportProviderDescriptor[], options: NnrpTransportSelectionOptions): readonly NnrpTransportCandidate[];
export declare function createTransportSelectionSummary(selection: NnrpTransportSelection): NnrpTransportSelectionSummary;
export declare function parseApplicationEndpoint(endpoint: string | URL): NnrpEndpoint;
export declare function resolveProviderEndpoint(endpoint: NnrpEndpoint, transport: NnrpTransportKind, providerEndpoint?: NnrpProviderEndpoint): string;
export interface NormalizeSubmitRequestOptions {
    readonly copyPayloads?: boolean;
}
export declare function createCacheKey(kind: NnrpCacheObjectKind, key: bigint | number | string, namespaceId?: number): NnrpCacheKey;
export declare function createSchemaDescriptor(descriptor: NnrpSchemaDescriptor): NnrpSchemaDescriptor;
export declare function normalizeCachePutRequest(request: NnrpCachePutRequest): NnrpCachePutRequest;
export declare function normalizeCacheInvalidateRequest(request: NnrpCacheInvalidateRequest): NnrpCacheInvalidateRequest;
export declare function isStandardInputProfile(profile: string): profile is NnrpInputProfile;
export declare const NNRP_DEFAULT_SUBMIT_HEADER: NnrpSubmitHeaderContext;
export declare const NNRP_DEFAULT_SUBMIT_POLICY: NnrpSubmitPolicy;
export declare function createTensorSubmitRequest(input: NnrpTensorSubmitInput): NnrpSubmitRequest;
export declare function createTokenSubmitRequest(input: NnrpTokenSubmitInput): NnrpSubmitRequest;
export declare function createTypedPayloadSubmitRequest(input: NnrpTypedPayloadSubmitInput): NnrpSubmitRequest;
export declare function encodeFrameSubmitMetadata(metadata: NnrpFrameSubmitMetadata): Uint8Array;
export declare function decodeFrameSubmitMetadata(payload: Uint8Array): NnrpFrameSubmitMetadata;
export declare function encodeSubmitMetadata(request: NnrpSubmitRequest): Uint8Array;
export declare function encodeSubmitPayload(request: NnrpSubmitRequest): Uint8Array;
export declare function decodeSubmitPayload(payload: Uint8Array): {
    readonly operationId: bigint;
    readonly metadata: NnrpSubmitMetadata;
    readonly body: Uint8Array;
};
export declare function encodeResultPushPayload(metadata: NnrpResultPushMetadata, body?: Uint8Array): Uint8Array;
export declare function encodeResultPushMetadata(metadata: NnrpResultPushMetadata): Uint8Array;
export declare function decodeResultPushMetadata(payload: Uint8Array): NnrpResultPushMetadata;
export declare function decodeResultPushPayload(payload: Uint8Array): {
    readonly metadata: NnrpResultPushMetadata;
    readonly body: Uint8Array;
};
export declare function decodeNnrpRuntimeEvent(header: NnrpRuntimeFrameHeader, payload: Uint8Array): NnrpRuntimeEvent;
export declare function createNnrpResultFromRuntimeEvent(operationId: bigint, event: NnrpRuntimeEvent): NnrpResult;
export declare function createNnrpResultFromLifecycle(event: NnrpOperationLifecycleEvent): NnrpResult;
export declare function normalizeSubmitRequest(request: NnrpSubmitRequest, options?: NormalizeSubmitRequestOptions): NnrpNormalizedSubmitRequest;
export declare function encodeResultHintMetadata(metadata: NnrpResultHintMetadata): Uint8Array;
export declare function decodeResultHintMetadata(payload: Uint8Array): NnrpResultHintMetadata;
export declare function encodeFlowUpdateMetadata(metadata: NnrpFlowUpdateMetadata): Uint8Array;
export declare function decodeFlowUpdateMetadata(payload: Uint8Array): NnrpFlowUpdateMetadata;
export declare function createRecoveryToken(token: string | NnrpBinaryPayload, metadata?: Readonly<Record<string, string>>): NnrpRecoveryToken;
export declare function normalizeSessionMigrationRequest(request: NnrpSessionMigrationRequest): NnrpSessionMigrationRequest;
export declare function throwIfResultDrop(event: NnrpRuntimeEvent): void;
export declare function validateEventPollOptions(options?: NnrpEventPollOptions): void;
export declare function validateSessionMetadata(options?: NnrpSessionMetadataOptions): void;
export declare function normalizeSessionPatchRequest(request: NnrpSessionPatchRequest): NnrpSessionPatchRequest;
export declare function encodeObjectReferenceBlock(reference: NnrpObjectReferenceBlock): Uint8Array;
export declare function decodeObjectReferenceBlock(encoded: Uint8Array): NnrpObjectReferenceBlock;
//# sourceMappingURL=index.d.ts.map
