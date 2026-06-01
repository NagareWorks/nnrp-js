import { type NnrpCancelOptions, NnrpCapabilityError, type NnrpCapabilityManifest, type NnrpDiagnostic, type NnrpEventPollOptions, type NnrpInputProfile, type NnrpOperationRef, type NnrpResult, type NnrpRuntimeEvent, type NnrpSubmitRequest, type NnrpTransportKind, type NnrpTransportPolicy, type NnrpTransportSelectionSummary } from "@nnrp/core";
export interface NnrpWasmRuntimeOptions {
    readonly moduleUrl?: string | URL;
    readonly module?: WebAssembly.Module;
    readonly transportPolicy?: NnrpTransportPolicy;
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
export interface NnrpBrowserSessionOptions {
    readonly inputProfile?: NnrpInputProfile;
    readonly targetCadence?: number;
    readonly qualityTier?: number;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface WasmRuntimeOptions {
    readonly moduleUrl?: string | URL;
    readonly module?: WebAssembly.Module;
}
export interface WasmRuntimeBinding {
    readonly manifest: NnrpCapabilityManifest;
    readonly moduleUrl: string;
    readonly module?: WebAssembly.Module;
}
export declare class NnrpWasmBindingUnavailableError extends NnrpCapabilityError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare function openBrowserRuntime(options?: NnrpWasmRuntimeOptions): Promise<NnrpBrowserRuntime>;
export declare class NnrpBrowserRuntime {
    #private;
    constructor(binding: WasmRuntimeBinding, transportPolicy?: NnrpTransportPolicy);
    get manifest(): NnrpCapabilityManifest;
    get moduleUrl(): string;
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
export declare function createWasmRuntimeBinding(options?: WasmRuntimeOptions): WasmRuntimeBinding;
//# sourceMappingURL=index.d.ts.map