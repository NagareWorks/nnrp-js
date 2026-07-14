import { type BudgetMetadata, type CacheInvalidateMetadata, type CacheMissMetadata, type CacheReferenceMetadata, type CapabilityMetadata, type ControlRequestMetadata, NnrpCapabilityError, type NnrpCapabilityManifest, type NnrpDiagnostic, type NnrpEventPollOptions, type NnrpInputProfile, NnrpMessageType, type NnrpNormalizedSubmitRequest, type NnrpResult, type NnrpRuntimeEvent, type NnrpSessionFlowControlOptions, type NnrpSessionMigrationRequest, type NnrpSessionPatchRequest, type NnrpSessionPatchResult, type NnrpSubmitRequest, type NnrpTransportCandidate, type NnrpTransportKind, type NnrpTransportPolicy, type NnrpTransportProvider, type NnrpTransportSelectionSummary, type ObjectDeltaMetadata, type ObjectDescriptorMetadata, type ObjectReferenceMetadata, type ObjectReleaseMetadata, type RouteHintMetadata, type RuntimeControlMetadata, type SchedulingMetadata, type SupersedeMetadata, type TraceContextMetadata } from "@nnrp/core";
export interface NnrpNativeLibraryOptions {
    readonly path?: string;
    readonly artifactDir?: string;
    readonly manifestPath?: string;
    readonly packageName?: string;
    readonly requiredSymbols?: readonly string[];
    readonly systemPolicy?: boolean;
    readonly systemLibraryDir?: string;
}
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
export interface NnrpNativeTransportScoreRequest {
    readonly candidates: readonly NnrpTransportCandidate[];
    readonly policy: NnrpTransportPolicy;
}
export interface NnrpNativeAcceptRequest {
    readonly endpoint: string;
    readonly transportPolicy: NnrpTransportPolicy;
}
export interface NnrpNativeAcceptedSession {
    readonly sessionOptions?: NnrpSessionOptions;
}
export interface NnrpNativeServerReceiveRequest {
    readonly sessionOptions: NnrpSessionOptions;
    readonly timeoutMillis?: number;
}
export interface NnrpNativeFfiBinding {
    readonly mode?: "native-addon" | "node-ffi" | "deno-ffi" | "nano-ffi" | "test";
    runtimeCapabilities?(): NnrpNativeRuntimeCapabilities | Promise<NnrpNativeRuntimeCapabilities>;
    scoreTransportCandidates?(request: NnrpNativeTransportScoreRequest): readonly NnrpTransportCandidate[] | Promise<readonly NnrpTransportCandidate[]>;
    validateSubmit?(request: NnrpNativeSubmitValidationRequest): NnrpNormalizedSubmitRequest | void | Promise<NnrpNormalizedSubmitRequest | void>;
    submitResultCompact?(request: NnrpNativeSubmitResultCompactRequest): NnrpResult | Promise<NnrpResult>;
    submitNoWait?(request: NnrpNativeSubmitNoWaitRequest): bigint | Promise<bigint>;
    sendRuntimeFrame?(request: NnrpNativeRuntimeFrameSendRequest): void | Promise<void>;
    patchSession?(request: NnrpNativeSessionPatchRequest): NnrpSessionPatchResult | void | Promise<NnrpSessionPatchResult | void>;
    awaitEvents?(request: NnrpNativeEventBatchRequest): readonly NnrpRuntimeEvent[] | Promise<readonly NnrpRuntimeEvent[]>;
    accept?(request: NnrpNativeAcceptRequest): NnrpNativeAcceptedSession | void | Promise<NnrpNativeAcceptedSession | void>;
    receive?(request: NnrpNativeServerReceiveRequest): NnrpRuntimeEvent | Promise<NnrpRuntimeEvent>;
    close?(): void | Promise<void>;
}
export interface NnrpNativeArtifactManifest {
    readonly package: "nnrp-ffi";
    readonly profile: "debug" | "release";
    readonly os: string;
    readonly arch: string;
    readonly target?: string | null;
    readonly library_kind: "dynamic" | "static";
    readonly library: string;
    readonly libraries: readonly string[];
    readonly header: string;
    readonly headers: readonly string[];
    readonly legacy_header?: string;
    readonly exports: readonly string[];
}
export interface NnrpResolvedNativeArtifact {
    readonly packageName: string;
    readonly packageDir: string;
    readonly manifestPath: string;
    readonly libraryPath: string;
    readonly manifest: NnrpNativeArtifactManifest;
}
export interface NnrpSessionOptions extends NnrpSessionFlowControlOptions {
    readonly sessionId?: string;
    readonly inputProfile?: NnrpInputProfile;
    readonly targetCadence?: number;
    readonly qualityTier?: number;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpNativeClientOptions {
    readonly endpoint: string | URL;
    readonly nativeLibrary?: NnrpNativeLibraryOptions;
    readonly transports?: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly sessionDefaults?: NnrpSessionOptions;
    readonly env?: Record<string, string | undefined>;
    readonly platform?: NodePlatform;
    readonly arch?: NodeArchitecture;
    readonly ffi?: NnrpNativeFfiBinding;
}
export interface NnrpConnectOptions {
    readonly endpoint: string | URL;
    readonly transports?: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly sessionDefaults?: NnrpSessionOptions;
}
interface NnrpListenOptions {
    readonly endpoint: string | URL;
    readonly transports?: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy?: NnrpTransportPolicy;
}
export interface NnrpNativeTransportProvider extends NnrpTransportProvider {
    readonly kind: Extract<NnrpTransportKind, "tcp" | "quic">;
    probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
}
export interface NnrpTransportSelectionOptions {
    readonly peerManifest: NnrpCapabilityManifest;
    readonly transports?: readonly NnrpNativeTransportProvider[];
    readonly scores?: Readonly<Partial<Record<NnrpTransportKind, number>>>;
}
export interface NnrpNativeBindingOptions {
    readonly libraryPath?: string;
    readonly nativeLibrary?: NnrpNativeLibraryOptions;
    readonly env?: Record<string, string | undefined>;
    readonly platform?: NodePlatform;
    readonly arch?: NodeArchitecture;
    readonly ffi?: NnrpNativeFfiBinding;
}
export interface NnrpDenoNativeFfiBindingOptions {
    readonly libraryPath?: string;
    readonly nativeLibrary?: NnrpNativeLibraryOptions;
    readonly env?: Record<string, string | undefined>;
    readonly platform?: NodePlatform;
    readonly arch?: NodeArchitecture;
}
export interface NnrpDenoNativeCompactSubmitterOptions extends NnrpDenoNativeFfiBindingOptions {
    readonly sessionId?: number;
}
export interface NnrpDenoNativeCompactSubmitter {
    readonly mode: "deno-ffi";
    runtimeCapabilities(): NnrpNativeRuntimeCapabilities;
    submit(frameId: number, payload: Uint8Array, resultPayload?: Uint8Array): void;
    submitBatch(frameIdStart: number, iterations: number, payload: Uint8Array, resultPayload?: Uint8Array): number;
    close(): void;
}
export interface NnrpNativeRuntimeBinding {
    readonly manifest: NnrpCapabilityManifest;
    readonly libraryPath: string;
    readonly requiredSymbols: readonly string[];
    readonly artifact?: NnrpResolvedNativeArtifact;
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
    get libraryPath(): string;
    get runtimeCapabilities(): NnrpNativeRuntimeCapabilities | undefined;
    get artifact(): NnrpResolvedNativeArtifact | undefined;
    get bindingMode(): string;
    submitResultCompact(request: NnrpNativeSubmitResultCompactRequest): Promise<NnrpResult>;
    submitNoWait(request: NnrpNativeSubmitNoWaitRequest): Promise<bigint>;
    sendRuntimeFrame(request: NnrpNativeRuntimeFrameSendRequest): Promise<void>;
    patchSession(request: NnrpNativeSessionPatchRequest): Promise<NnrpSessionPatchResult>;
    awaitEvents(request: NnrpNativeEventBatchRequest): Promise<readonly NnrpRuntimeEvent[]>;
    acceptServerSession(request: NnrpNativeAcceptRequest): Promise<NnrpNativeAcceptedSession>;
    receiveServerEvent(request: NnrpNativeServerReceiveRequest): Promise<NnrpRuntimeEvent>;
    connect(options: NnrpConnectOptions): NnrpClient;
    listen(options: NnrpListenOptions): NnrpServer;
    selectTransport(options: NnrpTransportSelectionOptions): NnrpTransportSelectionSummary;
    selectTransportWithNative(options: NnrpTransportSelectionOptions): Promise<NnrpTransportSelectionSummary>;
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
    openSession(options?: NnrpSessionOptions): NnrpClientSession;
    nextSessionEvent(sessionId: string, options?: NnrpEventPollOptions): Promise<NnrpRuntimeEvent>;
    close(): Promise<void>;
    get closed(): boolean;
}
export interface NnrpClientSessionState {
    readonly client: NnrpClient;
    options: NnrpSessionOptions;
}
export declare class NnrpClientSession {
    #private;
    constructor(state: NnrpClientSessionState);
    get options(): NnrpSessionOptions;
    get sessionId(): string;
    submit(request: NnrpSubmitRequest): Promise<NnrpResult>;
    submitNoWait(request: NnrpSubmitRequest): Promise<bigint>;
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
    sendTraceContext(metadata: TraceContextMetadata, body?: Uint8Array): Promise<void>;
    sendControl(messageType: NnrpMessageType, metadata: RuntimeControlMetadata, tail?: Uint8Array): Promise<void>;
    declareObject(metadata: ObjectDescriptorMetadata, body?: Uint8Array): Promise<void>;
    referenceObject(metadata: ObjectReferenceMetadata, body?: Uint8Array): Promise<void>;
    releaseObject(metadata: ObjectReleaseMetadata, diagnostic?: Uint8Array): Promise<void>;
    patchObject(metadata: ObjectDeltaMetadata, delta: Uint8Array): Promise<void>;
    sendObjectDelta(metadata: ObjectDeltaMetadata, delta: Uint8Array): Promise<void>;
    referenceCache(metadata: CacheReferenceMetadata, body?: Uint8Array): Promise<void>;
    reportCacheMiss(metadata: CacheMissMetadata, diagnostic?: Uint8Array): Promise<void>;
    invalidateCache(metadata: CacheInvalidateMetadata): Promise<void>;
    inFlightFrames(): readonly number[];
    completeEvent(event: NnrpRuntimeEvent): void;
    nextEvent(options?: NnrpEventPollOptions): Promise<NnrpRuntimeEvent>;
    nextResult(options?: NnrpEventPollOptions): Promise<NnrpResult>;
    migrate(request: NnrpSessionMigrationRequest): Promise<void>;
    patch(request: NnrpSessionPatchRequest): Promise<NnrpSessionPatchResult>;
    events(options?: NnrpEventPollOptions): AsyncIterable<NnrpRuntimeEvent>;
    close(): Promise<void>;
    get closed(): boolean;
}
interface NnrpServerState {
    readonly endpoint: string;
    readonly runtime: NnrpBackendRuntime;
    readonly transports: readonly NnrpNativeTransportProvider[];
    readonly transportPolicy: NnrpTransportPolicy;
}
declare class NnrpServer {
    #private;
    constructor(state: NnrpServerState);
    get endpoint(): string;
    get transportPolicy(): NnrpTransportPolicy;
    accept(): Promise<NnrpServerSession>;
    close(): Promise<void>;
    get closed(): boolean;
}
interface NnrpServerSessionState {
    readonly runtime: NnrpBackendRuntime;
    readonly options: NnrpSessionOptions;
}
declare class NnrpServerSession {
    #private;
    constructor(state?: NnrpServerSessionState);
    get options(): NnrpSessionOptions;
    get sessionId(): string;
    receive(options?: NnrpEventPollOptions): Promise<NnrpRuntimeEvent>;
    sendResult(_result: NnrpResult): Promise<void>;
    close(): Promise<void>;
    get closed(): boolean;
}
export declare function resolveNativeLibraryPath(options?: NnrpNativeBindingOptions): string;
export declare function createNativeRuntimeBinding(options?: NnrpNativeBindingOptions): NnrpNativeRuntimeBinding;
export declare function createDenoNativeFfiBinding(options?: NnrpDenoNativeFfiBindingOptions): NnrpNativeFfiBinding;
export declare function createDenoNativeCompactSubmitter(options?: NnrpDenoNativeCompactSubmitterOptions): NnrpDenoNativeCompactSubmitter;
export declare function validateNativeRuntimeCapabilities(capabilities: NnrpNativeRuntimeCapabilities): void;
export declare function resolveNativeArtifact(options: NnrpNativeBindingOptions): NnrpResolvedNativeArtifact | null;
export declare function readNativeArtifactManifest(manifestPath: string): NnrpNativeArtifactManifest;
export declare function validateNativeArtifactManifest(manifest: NnrpNativeArtifactManifest, options?: Pick<NnrpNativeBindingOptions, "platform" | "arch" | "nativeLibrary">): void;
type NodePlatform = NodeJS.Platform;
type NodeArchitecture = NodeJS.Architecture;
export {};
//# sourceMappingURL=index.d.ts.map
