import { type NnrpCancelOptions, type NnrpCancelRequest, NnrpCapabilityError, type NnrpCapabilityManifest, type NnrpDiagnostic, type NnrpEventPollOptions, type NnrpInputProfile, type NnrpNormalizedSubmitRequest, type NnrpOperationRef, type NnrpResult, type NnrpRuntimeEvent, type NnrpSessionMigrationRequest, type NnrpSubmitRequest, type NnrpTransportCandidate, type NnrpTransportKind, type NnrpTransportPolicy, type NnrpTransportSelectionSummary } from "@nnrp/core";
export interface NnrpNativeLibraryOptions {
    readonly path?: string;
    readonly artifactDir?: string;
    readonly manifestPath?: string;
    readonly packageName?: string;
    readonly requiredSymbols?: readonly string[];
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
export interface NnrpNativeCancelRequest {
    readonly sessionOptions: NnrpSessionOptions;
    readonly cancel: NnrpCancelRequest;
}
export interface NnrpNativeEventBatchRequest {
    readonly maxEvents: number;
    readonly timeoutMillis?: number;
}
export interface NnrpNativeTransportScoreRequest {
    readonly candidates: readonly NnrpTransportCandidate[];
    readonly policy: NnrpTransportPolicy;
}
export interface NnrpNativeFfiBinding {
    readonly mode?: "native-addon" | "node-ffi" | "nano-ffi" | "test";
    runtimeCapabilities?(): NnrpNativeRuntimeCapabilities | Promise<NnrpNativeRuntimeCapabilities>;
    scoreTransportCandidates?(request: NnrpNativeTransportScoreRequest): readonly NnrpTransportCandidate[] | Promise<readonly NnrpTransportCandidate[]>;
    submitResultCompact?(request: NnrpNativeSubmitResultCompactRequest): NnrpResult | Promise<NnrpResult>;
    submitNoWait?(request: NnrpNativeSubmitNoWaitRequest): bigint | Promise<bigint>;
    cancel?(request: NnrpNativeCancelRequest): void | Promise<void>;
    awaitEvents?(request: NnrpNativeEventBatchRequest): readonly NnrpRuntimeEvent[] | Promise<readonly NnrpRuntimeEvent[]>;
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
export interface NnrpSessionOptions {
    readonly sessionId?: string;
    readonly inputProfile?: NnrpInputProfile;
    readonly targetCadence?: number;
    readonly qualityTier?: number;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpNativeClientOptions {
    readonly endpoint: string | URL;
    readonly nativeLibrary?: NnrpNativeLibraryOptions;
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly sessionDefaults?: NnrpSessionOptions;
    readonly env?: Record<string, string | undefined>;
    readonly platform?: NodePlatform;
    readonly arch?: NodeArchitecture;
    readonly ffi?: NnrpNativeFfiBinding;
}
export interface NnrpBackendRuntimeOptions {
    readonly nativeLibrary?: NnrpNativeLibraryOptions;
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly env?: Record<string, string | undefined>;
    readonly platform?: NodePlatform;
    readonly arch?: NodeArchitecture;
    readonly ffi?: NnrpNativeFfiBinding;
}
export interface NnrpConnectOptions {
    readonly endpoint: string | URL;
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly sessionDefaults?: NnrpSessionOptions;
}
export interface NnrpListenOptions {
    readonly endpoint: string | URL;
    readonly transportPolicy?: NnrpTransportPolicy;
}
export interface NnrpTransportSelectionOptions {
    readonly peerManifest: NnrpCapabilityManifest;
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
export declare function openBackendRuntime(options?: NnrpBackendRuntimeOptions): Promise<NnrpBackendRuntime>;
export declare class NnrpBackendRuntime {
    #private;
    constructor(binding: NnrpNativeRuntimeBinding, transportPolicy?: NnrpTransportPolicy);
    get manifest(): NnrpCapabilityManifest;
    get libraryPath(): string;
    get runtimeCapabilities(): NnrpNativeRuntimeCapabilities | undefined;
    get artifact(): NnrpResolvedNativeArtifact | undefined;
    get bindingMode(): string;
    submitResultCompact(request: NnrpNativeSubmitResultCompactRequest): Promise<NnrpResult>;
    submitNoWait(request: NnrpNativeSubmitNoWaitRequest): Promise<bigint>;
    cancel(request: NnrpNativeCancelRequest): Promise<void>;
    awaitEvents(request: NnrpNativeEventBatchRequest): Promise<readonly NnrpRuntimeEvent[]>;
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
    readonly options: NnrpSessionOptions;
}
export declare class NnrpClientSession {
    #private;
    constructor(state: NnrpClientSessionState);
    get options(): NnrpSessionOptions;
    get sessionId(): string;
    submit(request: NnrpSubmitRequest): Promise<NnrpResult>;
    submitNoWait(request: NnrpSubmitRequest): Promise<bigint>;
    cancel(operation: NnrpOperationRef, options?: NnrpCancelOptions): Promise<void>;
    inFlightFrames(): readonly number[];
    completeEvent(event: NnrpRuntimeEvent): void;
    nextEvent(options?: NnrpEventPollOptions): Promise<NnrpRuntimeEvent>;
    nextResult(options?: NnrpEventPollOptions): Promise<NnrpResult>;
    migrate(request: NnrpSessionMigrationRequest): Promise<void>;
    events(options?: NnrpEventPollOptions): AsyncIterable<NnrpRuntimeEvent>;
    close(): Promise<void>;
    get closed(): boolean;
}
export interface NnrpServerState {
    readonly endpoint: string;
    readonly runtime: NnrpBackendRuntime;
    readonly transportPolicy: NnrpTransportPolicy;
}
export declare class NnrpServer {
    #private;
    constructor(state: NnrpServerState);
    get endpoint(): string;
    get transportPolicy(): NnrpTransportPolicy;
    accept(): Promise<NnrpServerSession>;
    close(): Promise<void>;
    get closed(): boolean;
}
export declare class NnrpServerSession {
    #private;
    receive(options?: NnrpEventPollOptions): Promise<NnrpRuntimeEvent>;
    sendResult(_result: NnrpResult): Promise<void>;
    close(): Promise<void>;
    get closed(): boolean;
}
export declare function resolveNativeLibraryPath(options?: NnrpNativeBindingOptions): string;
export declare function createNativeRuntimeBinding(options?: NnrpNativeBindingOptions): NnrpNativeRuntimeBinding;
export declare function validateNativeRuntimeCapabilities(capabilities: NnrpNativeRuntimeCapabilities): void;
export declare function resolveNativeArtifact(options: NnrpNativeBindingOptions): NnrpResolvedNativeArtifact | null;
export declare function readNativeArtifactManifest(manifestPath: string): NnrpNativeArtifactManifest;
export declare function validateNativeArtifactManifest(manifest: NnrpNativeArtifactManifest, options?: Pick<NnrpNativeBindingOptions, "platform" | "arch" | "nativeLibrary">): void;
type NodePlatform = NodeJS.Platform;
type NodeArchitecture = NodeJS.Architecture;
export {};
//# sourceMappingURL=index.d.ts.map