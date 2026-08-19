import { type BudgetMetadata, type CacheInvalidateMetadata, type CacheMissMetadata, type CacheReferenceMetadata, type CapabilityMetadata, type ControlRequestMetadata, type NnrpCacheObjectKind, NnrpCapabilityError, type NnrpCapabilityManifest, type NnrpClientEvent, type NnrpClientProviderRoutes, type NnrpDiagnostic, NnrpEndpoint, type NnrpEventPollOptions, NnrpMessageType, type NnrpNormalizedSubmitRequest, type NnrpResult, type NnrpRuntimeEvent, type NnrpSessionMigrationRequest, type NnrpSessionPatchRequest, type NnrpSessionPatchResult, NnrpSessionPriorityClass, NnrpSessionRecoveryTicket, type NnrpSubmitOptions, type NnrpSubmitRequest, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportKind, type NnrpTransportPolicy, type NnrpTransportProbeMetrics, type NnrpTransportProbeOptions, type NnrpTransportProvider, type NnrpTransportSelectionOptions, type NnrpTransportSelectionSummary, type ObjectDeltaMetadata, type ObjectDescriptorMetadata, type ObjectReferenceMetadata, type ObjectReleaseMetadata, type RouteHintMetadata, type RuntimeControlMetadata, type SchedulingMetadata, type SupersedeMetadata, type TraceContextMetadata } from "@nnrp/core";
export interface NnrpNativeRuntimeCapabilities {
    readonly abiMajor: number;
    readonly abiMinor: number;
    readonly abiPatch: number;
    readonly protocolMajor: number;
    readonly protocolWireFormat: number;
    readonly sdkMajor: number;
    readonly sdkMinor: number;
    readonly sdkPatch: number;
    readonly sdkChannel: number;
    readonly sdkRevision: number;
    readonly transportSlots: number;
    readonly featureFlags: bigint;
}
export interface NnrpNativeSubmitResultCompactRequest {
    readonly sessionOptions: NnrpSessionOptions;
    readonly submit: NnrpNormalizedSubmitRequest;
    readonly resultPayload?: Uint8Array;
    readonly maxEvents?: number;
}
export interface NnrpNativeSubmitNoWaitRequest {
    readonly sessionOptions: NnrpSessionOptions;
    readonly submit: NnrpNormalizedSubmitRequest;
}
export interface NnrpNativeSubmitValidationRequest {
    readonly sessionOptions: NnrpSessionOptions;
    readonly submit: NnrpNormalizedSubmitRequest;
}
export interface NnrpNativeRuntimeFrameSendRequest {
    readonly sessionOptions: NnrpSessionOptions;
    readonly messageType: NnrpMessageType;
    readonly frameId: number;
    readonly payload: Uint8Array;
}
export interface NnrpNativeSessionPatchRequest {
    readonly sessionOptions: NnrpSessionOptions;
    readonly patch: NnrpSessionPatchRequest;
}
export interface NnrpNativeEventBatchRequest {
    readonly maxEvents: number;
    readonly timeoutMillis?: number;
}
export interface NnrpNativeClientEventBatchItem {
    readonly sessionId: number;
    readonly event: NnrpClientEvent;
}
export interface NnrpNativeFfiBinding {
    readonly mode?: "native-addon" | "node-ffi" | "deno-ffi" | "nano-ffi" | "test";
    runtimeCapabilities?(): NnrpNativeRuntimeCapabilities | Promise<NnrpNativeRuntimeCapabilities>;
    validateSubmit?(request: NnrpNativeSubmitValidationRequest): NnrpNormalizedSubmitRequest | void | Promise<NnrpNormalizedSubmitRequest | void>;
    submitResultCompact?(request: NnrpNativeSubmitResultCompactRequest): NnrpResult | Promise<NnrpResult>;
    submitNoWait?(request: NnrpNativeSubmitNoWaitRequest): bigint | Promise<bigint>;
    sendRuntimeFrame?(request: NnrpNativeRuntimeFrameSendRequest): void | Promise<void>;
    patchSession?(request: NnrpNativeSessionPatchRequest): NnrpSessionPatchResult | void | Promise<NnrpSessionPatchResult | void>;
    awaitEvents?(request: NnrpNativeEventBatchRequest): readonly NnrpNativeClientEventBatchItem[] | Promise<readonly NnrpNativeClientEventBatchItem[]>;
    close?(): void | Promise<void>;
}
export interface NnrpSessionOptions {
    readonly requestedSessionId?: number;
    readonly profileId?: number;
    readonly schemaId?: number;
    readonly schemaVersion?: number;
    readonly priorityClass?: NnrpSessionPriorityClass;
    readonly defaultDeadlineMillis?: number;
    readonly maxInFlightOperations?: number;
    readonly leaseTtlHintMillis?: number;
    readonly allowResume?: boolean;
    readonly resumeTokenBytes?: number;
    readonly cacheHints?: readonly NnrpCacheObjectKind[];
}
export interface NnrpNativeClientOptions {
    readonly endpoint: NnrpEndpoint;
    readonly providerRoutes?: NnrpClientProviderRoutes;
    readonly transports?: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly sessionDefaults?: NnrpSessionOptions;
    readonly ffi?: NnrpNativeFfiBinding;
}
export interface NnrpConnectOptions {
    readonly endpoint: NnrpEndpoint;
    readonly providerRoutes?: NnrpClientProviderRoutes;
    readonly transports?: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly sessionDefaults?: NnrpSessionOptions;
}
export interface NnrpNativeTransportProvider extends NnrpTransportProvider {
    readonly kind: NnrpTransportKind;
    probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
    connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
}
export interface NnrpNativeRuntimeBinding {
    readonly manifest: NnrpCapabilityManifest;
    readonly ffi?: NnrpNativeFfiBinding;
    readonly runtimeCapabilities?: NnrpNativeRuntimeCapabilities;
}
export declare class NnrpNativeBindingUnavailableError extends NnrpCapabilityError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare function openNativeClient(options: NnrpNativeClientOptions): Promise<NnrpClient>;
declare class NnrpBackendRuntime {
    #private;
    constructor(binding: NnrpNativeRuntimeBinding, transportPolicy?: NnrpTransportPolicy, transportProviders?: readonly NnrpNativeTransportProvider[]);
    get manifest(): NnrpCapabilityManifest;
    get runtimeCapabilities(): NnrpNativeRuntimeCapabilities | undefined;
    get bindingMode(): string;
    submitResultCompact(request: NnrpNativeSubmitResultCompactRequest): Promise<NnrpResult>;
    submitNoWait(request: NnrpNativeSubmitNoWaitRequest): Promise<bigint>;
    sendRuntimeFrame(request: NnrpNativeRuntimeFrameSendRequest): Promise<void>;
    patchSession(request: NnrpNativeSessionPatchRequest): Promise<NnrpSessionPatchResult>;
    awaitEvents(request: NnrpNativeEventBatchRequest): Promise<readonly NnrpNativeClientEventBatchItem[]>;
    connect(options: NnrpConnectOptions): Promise<NnrpClient>;
    selectTransport(options: NnrpTransportSelectionOptions): NnrpTransportSelectionSummary;
    close(): Promise<void>;
    get closed(): boolean;
}
export interface NnrpClientState {
    readonly endpoint: string;
    readonly runtime: NnrpBackendRuntime;
    readonly transports: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy: NnrpTransportPolicy;
    readonly sessionDefaults?: NnrpSessionOptions;
}
export declare class NnrpClient {
    #private;
    constructor(state: NnrpClientState);
    get endpoint(): string;
    get transportPolicy(): NnrpTransportPolicy;
    get runtime(): NnrpBackendRuntime;
    openSession(options?: NnrpSessionOptions): Promise<NnrpClientSession>;
    resumeSession(ticket: NnrpSessionRecoveryTicket, options?: NnrpSessionOptions): Promise<NnrpClientSession>;
    nextSessionEvent(sessionId: number, options?: NnrpEventPollOptions): Promise<NnrpClientEvent>;
    close(): Promise<void>;
    get closed(): boolean;
}
export interface NnrpClientSessionState {
    readonly client: NnrpClient;
    readonly options: NnrpSessionOptions;
    readonly sessionId: number;
}
export declare class NnrpClientSession {
    #private;
    constructor(state: NnrpClientSessionState);
    get options(): NnrpSessionOptions;
    get sessionId(): number;
    submit(request: NnrpSubmitRequest, options?: NnrpSubmitOptions): Promise<NnrpResult>;
    submitNoWait(request: NnrpSubmitRequest, options?: NnrpSubmitOptions): Promise<bigint>;
    cancel(metadata: ControlRequestMetadata, diagnostic?: Uint8Array): Promise<void>;
    abort(metadata: ControlRequestMetadata, diagnostic?: Uint8Array): Promise<void>;
    updatePriority(metadata: SchedulingMetadata): Promise<void>;
    updateDeadline(metadata: SchedulingMetadata): Promise<void>;
    expireAt(metadata: SchedulingMetadata): Promise<void>;
    supersede(metadata: SupersedeMetadata, diagnostic?: Uint8Array): Promise<void>;
    updateBudget(metadata: BudgetMetadata): Promise<void>;
    negotiateCapabilities(metadata: CapabilityMetadata, body?: Uint8Array): Promise<void>;
    degradeProfile(metadata: CapabilityMetadata, body?: Uint8Array): Promise<void>;
    sendRouteHint(metadata: RouteHintMetadata, body?: Uint8Array): Promise<void>;
    sendExecutionHint(metadata: RouteHintMetadata, body?: Uint8Array): Promise<void>;
    sendTraceContext(metadata: TraceContextMetadata, body?: Uint8Array, operationId?: bigint): Promise<void>;
    sendControl(messageType: NnrpMessageType, metadata: RuntimeControlMetadata, tail?: Uint8Array): Promise<void>;
    declareObject(metadata: ObjectDescriptorMetadata, body?: Uint8Array): Promise<void>;
    referenceObject(metadata: ObjectReferenceMetadata, body?: Uint8Array): Promise<void>;
    releaseObject(metadata: ObjectReleaseMetadata, diagnostic?: Uint8Array): Promise<void>;
    patchObject(metadata: ObjectDeltaMetadata, delta: Uint8Array, metadataBody?: Uint8Array): Promise<void>;
    sendObjectDelta(metadata: ObjectDeltaMetadata, delta: Uint8Array, metadataBody?: Uint8Array): Promise<void>;
    referenceCache(metadata: CacheReferenceMetadata, body?: Uint8Array): Promise<void>;
    reportCacheMiss(metadata: CacheMissMetadata, diagnostic?: Uint8Array): Promise<void>;
    invalidateCache(metadata: CacheInvalidateMetadata): Promise<void>;
    inFlightFrames(): readonly number[];
    completeEvent(event: NnrpRuntimeEvent): void;
    nextEvent(options?: NnrpEventPollOptions): Promise<NnrpClientEvent>;
    nextResult(options?: NnrpEventPollOptions): Promise<NnrpResult>;
    migrate(request: NnrpSessionMigrationRequest): Promise<void>;
    patch(request: NnrpSessionPatchRequest): Promise<NnrpSessionPatchResult>;
    events(options?: NnrpEventPollOptions): AsyncIterable<NnrpClientEvent>;
    recoveryTicket(): NnrpSessionRecoveryTicket | undefined;
    close(): Promise<void>;
    get closed(): boolean;
}
export declare function validateNativeRuntimeCapabilities(capabilities: NnrpNativeRuntimeCapabilities): void;
export {};
//# sourceMappingURL=index.d.ts.map
