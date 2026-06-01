import { type NnrpCancelOptions, NnrpCapabilityError, type NnrpCapabilityManifest, type NnrpDiagnostic, type NnrpEventPollOptions, type NnrpInputProfile, type NnrpOperationRef, type NnrpResult, type NnrpRuntimeEvent, type NnrpSubmitRequest, type NnrpTransportKind, type NnrpTransportPolicy, type NnrpTransportSelectionSummary } from "@nnrp/core";
export interface NnrpNativeLibraryOptions {
    readonly path?: string;
    readonly artifactDir?: string;
    readonly requiredSymbols?: readonly string[];
}
export interface NnrpSessionOptions {
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
}
export interface NnrpBackendRuntimeOptions {
    readonly nativeLibrary?: NnrpNativeLibraryOptions;
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly env?: Record<string, string | undefined>;
    readonly platform?: NodePlatform;
    readonly arch?: NodeArchitecture;
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
export interface NativeRuntimeOptions {
    readonly libraryPath?: string;
    readonly nativeLibrary?: NnrpNativeLibraryOptions;
    readonly env?: Record<string, string | undefined>;
    readonly platform?: NodePlatform;
    readonly arch?: NodeArchitecture;
}
export interface NativeRuntimeBinding {
    readonly manifest: NnrpCapabilityManifest;
    readonly libraryPath: string;
    readonly requiredSymbols: readonly string[];
}
export declare class NnrpNativeBindingUnavailableError extends NnrpCapabilityError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NativeBindingUnavailableError extends NnrpNativeBindingUnavailableError {
}
export declare function openNativeClient(options: NnrpNativeClientOptions): Promise<NnrpClient>;
export declare function openBackendRuntime(options?: NnrpBackendRuntimeOptions): Promise<NnrpBackendRuntime>;
export declare class NnrpBackendRuntime {
    #private;
    constructor(binding: NativeRuntimeBinding, transportPolicy?: NnrpTransportPolicy);
    get manifest(): NnrpCapabilityManifest;
    get libraryPath(): string;
    connect(options: NnrpConnectOptions): NnrpClient;
    listen(options: NnrpListenOptions): NnrpServer;
    selectTransport(options: NnrpTransportSelectionOptions): NnrpTransportSelectionSummary;
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
    openSession(options?: NnrpSessionOptions): NnrpClientSession;
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
    submit(request: NnrpSubmitRequest): Promise<NnrpResult>;
    submitNoWait(request: NnrpSubmitRequest): Promise<bigint>;
    cancel(operation: NnrpOperationRef, options?: NnrpCancelOptions): Promise<void>;
    nextEvent(options?: NnrpEventPollOptions): Promise<NnrpRuntimeEvent>;
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
export declare function resolveNativeLibraryPath(options?: NativeRuntimeOptions): string;
export declare function createNativeRuntimeBinding(options?: NativeRuntimeOptions): NativeRuntimeBinding;
type NodePlatform = NodeJS.Platform;
type NodeArchitecture = NodeJS.Architecture;
export {};
//# sourceMappingURL=index.d.ts.map