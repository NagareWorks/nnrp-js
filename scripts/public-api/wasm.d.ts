import { type NnrpCancelOptions, NnrpCapabilityError, type NnrpCapabilityManifest, type NnrpDiagnostic, type NnrpEventPollOptions, type NnrpInputProfile, type NnrpOperationRef, type NnrpResult, type NnrpRuntimeEvent, type NnrpSubmitRequest, type NnrpTransportKind, type NnrpTransportPolicy, type NnrpTransportSelectionSummary } from "@nnrp/core";
export interface NnrpWasmRuntimeOptions {
    readonly moduleUrl?: string | URL;
    readonly module?: WebAssembly.Module;
    readonly artifact?: NnrpWasmArtifactOptions;
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly transportProviders?: readonly NnrpBrowserTransportProvider[];
}
export interface NnrpBrowserConnectOptions {
    readonly endpoint: string | URL;
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly sessionDefaults?: NnrpBrowserSessionOptions;
}
export interface NnrpBrowserTransportSelectionOptions {
    readonly peerManifest: NnrpCapabilityManifest;
    readonly scores?: Readonly<Partial<Record<NnrpTransportKind, number>>>;
}
export type NnrpBrowserTransportKind = Extract<NnrpTransportKind, "websocket" | "webtransport">;
export interface NnrpBrowserTransportProvider {
    readonly kind: NnrpBrowserTransportKind;
    readonly available?: boolean;
    readonly score?: number;
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpBrowserSessionOptions {
    readonly inputProfile?: NnrpInputProfile;
    readonly targetCadence?: number;
    readonly qualityTier?: number;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpWasmBindingOptions {
    readonly moduleUrl?: string | URL;
    readonly module?: WebAssembly.Module;
    readonly artifact?: NnrpWasmArtifactOptions;
    readonly transportProviders?: readonly NnrpBrowserTransportProvider[];
}
export interface NnrpWasmRuntimeBinding {
    readonly manifest: NnrpCapabilityManifest;
    readonly moduleUrl: string;
    readonly module?: WebAssembly.Module;
    readonly artifact?: NnrpResolvedWasmArtifact;
    readonly transportProviders: readonly NnrpBrowserTransportProvider[];
}
export interface NnrpWasmArtifactOptions {
    readonly manifest: NnrpWasmArtifactManifest;
    readonly baseUrl?: string | URL;
    readonly requiredExports?: readonly string[];
}
export interface NnrpWasmArtifactManifest {
    readonly package: "nnrp-wasm";
    readonly wasm: string;
    readonly types: string;
    readonly owner?: string;
    readonly downstream_wrapper?: string;
    readonly exports: readonly string[];
}
export interface NnrpResolvedWasmArtifact {
    readonly manifest: NnrpWasmArtifactManifest;
    readonly moduleUrl: string;
    readonly typesUrl: string;
    readonly requiredExports: readonly string[];
}
export declare class NnrpWasmBindingUnavailableError extends NnrpCapabilityError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare function openBrowserRuntime(options?: NnrpWasmRuntimeOptions): Promise<NnrpBrowserRuntime>;
export declare class NnrpBrowserRuntime {
    #private;
    constructor(binding: NnrpWasmRuntimeBinding, transportPolicy?: NnrpTransportPolicy);
    get manifest(): NnrpCapabilityManifest;
    get moduleUrl(): string;
    get artifact(): NnrpResolvedWasmArtifact | undefined;
    connect(options: NnrpBrowserConnectOptions): NnrpBrowserClient;
    selectTransport(options: NnrpBrowserTransportSelectionOptions): NnrpTransportSelectionSummary;
    close(): Promise<void>;
    get closed(): boolean;
}
export interface NnrpBrowserClientState {
    readonly endpoint: string;
    readonly runtime: NnrpBrowserRuntime;
    readonly transportPolicy: NnrpTransportPolicy;
    readonly sessionDefaults?: NnrpBrowserSessionOptions;
}
export declare class NnrpBrowserClient {
    #private;
    constructor(state: NnrpBrowserClientState);
    get endpoint(): string;
    get transportPolicy(): NnrpTransportPolicy;
    openSession(options?: NnrpBrowserSessionOptions): NnrpBrowserClientSession;
    close(): Promise<void>;
    get closed(): boolean;
}
export interface NnrpBrowserClientSessionState {
    readonly client: NnrpBrowserClient;
    readonly options: NnrpBrowserSessionOptions;
}
export declare class NnrpBrowserClientSession {
    #private;
    constructor(state: NnrpBrowserClientSessionState);
    get options(): NnrpBrowserSessionOptions;
    submit(request: NnrpSubmitRequest): Promise<NnrpResult>;
    cancel(operation: NnrpOperationRef, options?: NnrpCancelOptions): Promise<void>;
    nextEvent(options?: NnrpEventPollOptions): Promise<NnrpRuntimeEvent>;
    events(options?: NnrpEventPollOptions): AsyncIterable<NnrpRuntimeEvent>;
    close(): Promise<void>;
    get closed(): boolean;
}
export declare function createWasmRuntimeBinding(options?: NnrpWasmBindingOptions): NnrpWasmRuntimeBinding;
export declare function resolveWasmArtifact(options: NnrpWasmArtifactOptions): NnrpResolvedWasmArtifact;
export declare function validateWasmArtifactManifest(manifest: NnrpWasmArtifactManifest, requiredExports?: readonly string[]): void;
export declare function createBrowserTransportProvider(kind: NnrpBrowserTransportKind, options?: Omit<NnrpBrowserTransportProvider, "kind">): NnrpBrowserTransportProvider;
//# sourceMappingURL=index.d.ts.map