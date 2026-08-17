import { type CacheInvalidateMetadata, type CacheMissMetadata, type CacheReferenceMetadata, NnrpCapabilityError, type NnrpCapabilityManifest, type NnrpDiagnostic, NnrpEndpoint, type NnrpEventPollOptions, NnrpMessageType, type NnrpOperationLifecycleEvent, type NnrpResultPushMetadata, type NnrpRuntimeEvent, NnrpSchemaRegistry, type NnrpServerProviderRoutes, type NnrpSessionOpenMetadata, type NnrpTransportEndpoint, type NnrpTransportKind, type NnrpTransportPolicy, type NnrpTransportProbeMetrics, type NnrpTransportProbeOptions, type NnrpTransportProvider, type NnrpTransportSelectionOptions, type NnrpTransportSelectionSummary, type NnrpTransportServer, type ObjectDeltaMetadata, type ObjectDescriptorMetadata, type ObjectReferenceMetadata, type ObjectReleaseMetadata, type PartialResultMetadata, type PressureMetadata, type ProgressMetadata, type RecoverableErrorMetadata, type ResultDropReasonMetadata, type RetryAfterMetadata, type RuntimeControlMetadata, type TraceContextMetadata } from "@nnrp/core";
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
export interface NnrpNativeRuntimeFrameSendRequest {
    readonly sessionId: number;
    readonly messageType: NnrpMessageType;
    readonly frameId: number;
    readonly payload: Uint8Array;
}
export interface NnrpNativeAcceptRequest {
    readonly endpoint: string;
    readonly providerRoutes?: NnrpServerProviderRoutes;
    readonly transportPolicy: NnrpTransportPolicy;
    readonly sessionDefaults: NnrpServerSessionOptions;
    readonly acceptOptions: NnrpServerAcceptOptions;
}
export interface NnrpNativeAcceptedSession {
    readonly sessionId: number;
    readonly activeTransport: NnrpTransportKind;
}
export interface NnrpNativeServerReceiveRequest {
    readonly sessionId: number;
    readonly timeoutMillis?: number;
}
export interface NnrpNativeFfiBinding {
    readonly mode?: "native-addon" | "node-ffi" | "deno-ffi" | "nano-ffi" | "test";
    runtimeCapabilities?(): NnrpNativeRuntimeCapabilities | Promise<NnrpNativeRuntimeCapabilities>;
    sendRuntimeFrame?(request: NnrpNativeRuntimeFrameSendRequest): void | Promise<void>;
    accept?(request: NnrpNativeAcceptRequest): NnrpNativeAcceptedSession | void | Promise<NnrpNativeAcceptedSession | void>;
    receive?(request: NnrpNativeServerReceiveRequest): NnrpRuntimeEvent | Promise<NnrpRuntimeEvent>;
    close?(): void | Promise<void>;
}
export interface NnrpBackendRuntimeOptions {
    readonly transports?: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly ffi?: NnrpNativeFfiBinding;
}
export interface NnrpServerSessionPolicyDecision {
    readonly accepted: boolean;
    readonly sessionErrorCode: number;
    readonly diagnostic?: string;
}
export interface NnrpServerSessionPolicy {
    evaluate(open: NnrpSessionOpenMetadata): Promise<NnrpServerSessionPolicyDecision>;
}
export interface NnrpServerSessionOptions {
    readonly supportedProfiles?: readonly number[];
    readonly supportedCacheObjects?: readonly number[];
    readonly maxCacheObjects?: bigint;
    readonly maxCacheObjectBytes?: number;
    readonly schemaRegistry?: NnrpSchemaRegistry;
    readonly resumeTokenBytes?: number;
    readonly maxInFlightOperations?: number;
    readonly grantedOperationCredit?: number;
    readonly leaseTtlMs?: number;
    readonly resumeWindowMs?: number;
    readonly applicationPolicy?: NnrpServerSessionPolicy;
}
export interface NnrpServerAcceptOptions {
    readonly timeoutMs?: number;
}
export interface NnrpListenOptions {
    readonly endpoint: NnrpEndpoint;
    readonly providerRoutes?: NnrpServerProviderRoutes;
    readonly transports?: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly sessionDefaults?: NnrpServerSessionOptions;
}
export interface NnrpNativeTransportProvider extends NnrpTransportProvider {
    readonly kind: NnrpTransportKind;
    probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
    listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}
export interface NnrpNativeRuntimeBinding {
    readonly manifest: NnrpCapabilityManifest;
    readonly ffi?: NnrpNativeFfiBinding;
    readonly runtimeCapabilities?: NnrpNativeRuntimeCapabilities;
}
export declare class NnrpNativeBindingUnavailableError extends NnrpCapabilityError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare function openBackendRuntime(options?: NnrpBackendRuntimeOptions): Promise<NnrpBackendRuntime>;
export declare class NnrpBackendRuntime {
    #private;
    constructor(binding: NnrpNativeRuntimeBinding, transportPolicy?: NnrpTransportPolicy, transportProviders?: readonly NnrpNativeTransportProvider[]);
    get manifest(): NnrpCapabilityManifest;
    get runtimeCapabilities(): NnrpNativeRuntimeCapabilities | undefined;
    get bindingMode(): string;
    listen(options: NnrpListenOptions): NnrpServer;
    selectTransport(options: NnrpTransportSelectionOptions): NnrpTransportSelectionSummary;
    close(): Promise<void>;
    get closed(): boolean;
}
export interface NnrpServerState {
    readonly endpoint: string;
    readonly providerRoutes?: NnrpServerProviderRoutes;
    readonly runtime: NnrpBackendRuntime;
    readonly transports: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy: NnrpTransportPolicy;
    readonly sessionDefaults: NnrpServerSessionOptions;
}
export declare class NnrpServer {
    #private;
    constructor(state: NnrpServerState);
    get endpoint(): string;
    get transportPolicy(): NnrpTransportPolicy;
    get boundProviderEndpoints(): Readonly<Partial<Record<NnrpTransportKind, string>>>;
    accept(options?: NnrpServerAcceptOptions): Promise<NnrpServerSession>;
    close(): Promise<void>;
    get closed(): boolean;
}
export type NnrpServerEvent = {
    readonly type: "submit";
    readonly operation: NnrpServerOperation;
} | {
    readonly type: "runtime";
    readonly event: NnrpRuntimeEvent;
} | {
    readonly type: "lifecycle";
    readonly event: NnrpOperationLifecycleEvent;
};
export declare class NnrpServerOperation {
    #private;
    private constructor();
    get operationId(): bigint;
    get frameId(): number;
    get submit(): NnrpRuntimeEvent;
    sendResult(metadata: NnrpResultPushMetadata, body?: Uint8Array): Promise<void>;
    sendResultDrop(metadata: ResultDropReasonMetadata, diagnostic?: Uint8Array): Promise<void>;
    sendProgress(metadata: ProgressMetadata, body?: Uint8Array): Promise<void>;
    sendPartialResult(metadata: PartialResultMetadata, body?: Uint8Array): Promise<void>;
}
interface NnrpServerSessionState {
    readonly runtime: NnrpBackendRuntime;
    readonly routingKey: string;
    readonly sessionId: number;
    readonly activeTransport: NnrpTransportKind;
}
export declare class NnrpServerSession {
    #private;
    constructor(state?: NnrpServerSessionState);
    get activeTransport(): NnrpTransportKind;
    get sessionId(): number;
    nextEvent(options?: NnrpEventPollOptions): Promise<NnrpServerEvent>;
    receiveSubmit(options?: NnrpEventPollOptions): Promise<NnrpServerOperation>;
    sendBackpressure(metadata: PressureMetadata): Promise<void>;
    sendCreditUpdate(metadata: PressureMetadata): Promise<void>;
    sendTraceContext(metadata: TraceContextMetadata, body?: Uint8Array): Promise<void>;
    sendRecoverableError(metadata: RecoverableErrorMetadata, diagnostic?: Uint8Array): Promise<void>;
    sendRetryAfter(metadata: RetryAfterMetadata, diagnostic?: Uint8Array): Promise<void>;
    declareObject(metadata: ObjectDescriptorMetadata, body?: Uint8Array): Promise<void>;
    referenceObject(metadata: ObjectReferenceMetadata, body?: Uint8Array): Promise<void>;
    releaseObject(metadata: ObjectReleaseMetadata, diagnostic?: Uint8Array): Promise<void>;
    patchObject(metadata: ObjectDeltaMetadata, delta: Uint8Array, metadataBody?: Uint8Array): Promise<void>;
    sendObjectDelta(metadata: ObjectDeltaMetadata, delta: Uint8Array, metadataBody?: Uint8Array): Promise<void>;
    referenceCache(metadata: CacheReferenceMetadata, body?: Uint8Array): Promise<void>;
    reportCacheMiss(metadata: CacheMissMetadata, diagnostic?: Uint8Array): Promise<void>;
    invalidateCache(metadata: CacheInvalidateMetadata): Promise<void>;
    sendControl(messageType: NnrpMessageType, metadata: RuntimeControlMetadata, tail?: Uint8Array): Promise<void>;
    close(): Promise<void>;
    get closed(): boolean;
}
export declare function validateNativeRuntimeCapabilities(capabilities: NnrpNativeRuntimeCapabilities): void;
export {};
//# sourceMappingURL=index.d.ts.map