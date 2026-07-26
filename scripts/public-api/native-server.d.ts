import { type CacheInvalidateMetadata, type CacheMissMetadata, type CacheReferenceMetadata, NnrpCapabilityError, type NnrpCapabilityManifest, type NnrpDiagnostic, type NnrpEventPollOptions, type NnrpInputProfile, NnrpMessageType, type NnrpResult, type NnrpRuntimeEvent, type NnrpServerProviderRoutes, type NnrpSessionFlowControlOptions, type NnrpTransportEndpoint, type NnrpTransportKind, type NnrpTransportPolicy, type NnrpTransportProbeMetrics, type NnrpTransportProbeOptions, type NnrpTransportProvider, type NnrpTransportSelectionSummary, type NnrpTransportServer, type ObjectDeltaMetadata, type ObjectDescriptorMetadata, type ObjectReferenceMetadata, type ObjectReleaseMetadata, type PartialResultMetadata, type PressureMetadata, type ProgressMetadata, type RecoverableErrorMetadata, type ResultDropReasonMetadata, type RetryAfterMetadata, type RuntimeControlMetadata, type TraceContextMetadata } from "@nnrp/core";
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
    readonly sessionOptions: NnrpSessionOptions;
    readonly messageType: NnrpMessageType;
    readonly frameId: number;
    readonly payload: Uint8Array;
}
export interface NnrpNativeAcceptRequest {
    readonly endpoint: string;
    readonly providerRoutes?: NnrpServerProviderRoutes;
    readonly transportPolicy: NnrpTransportPolicy;
}
export interface NnrpNativeAcceptedSession {
    readonly sessionOptions?: NnrpSessionOptions;
    readonly activeTransport: NnrpTransportKind;
}
export interface NnrpNativeServerReceiveRequest {
    readonly sessionOptions: NnrpSessionOptions;
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
export interface NnrpSessionOptions extends NnrpSessionFlowControlOptions {
    readonly sessionId?: string;
    readonly inputProfile?: NnrpInputProfile;
    readonly targetCadence?: number;
    readonly qualityTier?: number;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpBackendRuntimeOptions {
    readonly transports?: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly ffi?: NnrpNativeFfiBinding;
}
export interface NnrpListenOptions {
    readonly endpoint: string | URL;
    readonly providerRoutes?: NnrpServerProviderRoutes;
    readonly transports?: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy?: NnrpTransportPolicy;
}
export interface NnrpNativeTransportProvider extends NnrpTransportProvider {
    readonly kind: NnrpTransportKind;
    probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
    listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}
export interface NnrpTransportSelectionOptions {
    readonly peerManifest: NnrpCapabilityManifest;
    readonly providers?: readonly NnrpNativeTransportProvider[];
    readonly policy?: NnrpTransportPolicy;
    readonly requestedMaxFrameBytes?: bigint;
    readonly probeMetricsByProviderId?: Readonly<Record<string, NnrpTransportProbeMetrics>>;
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
}
export declare class NnrpServer {
    #private;
    constructor(state: NnrpServerState);
    get endpoint(): string;
    get transportPolicy(): NnrpTransportPolicy;
    get boundProviderEndpoints(): Readonly<Partial<Record<NnrpTransportKind, string>>>;
    accept(): Promise<NnrpServerSession>;
    close(): Promise<void>;
    get closed(): boolean;
}
export interface NnrpServerSessionState {
    readonly runtime: NnrpBackendRuntime;
    readonly options: NnrpSessionOptions;
    readonly activeTransport: NnrpTransportKind;
}
export declare class NnrpServerSession {
    #private;
    constructor(state?: NnrpServerSessionState);
    get options(): NnrpSessionOptions;
    get sessionId(): string;
    get activeTransport(): NnrpTransportKind;
    receive(options?: NnrpEventPollOptions): Promise<NnrpRuntimeEvent>;
    sendResult(result: NnrpResult): Promise<void>;
    sendProgress(metadata: ProgressMetadata, body?: Uint8Array): Promise<void>;
    sendPartialResult(metadata: PartialResultMetadata, body?: Uint8Array): Promise<void>;
    sendBackpressure(metadata: PressureMetadata): Promise<void>;
    sendCreditUpdate(metadata: PressureMetadata): Promise<void>;
    sendResultDropReason(metadata: ResultDropReasonMetadata, diagnostic?: Uint8Array): Promise<void>;
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
//# sourceMappingURL=index.d.ts.map
