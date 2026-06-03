import { type NnrpCancelOptions, type NnrpCancelRequest, NnrpCapabilityError, type NnrpCapabilityManifest, type NnrpDiagnostic, type NnrpEventPollOptions, type NnrpInputProfile, type NnrpNormalizedSubmitRequest, type NnrpOperationRef, type NnrpResult, type NnrpRuntimeEvent, type NnrpSessionFlowControlOptions, type NnrpSessionMigrationRequest, type NnrpSessionPatchRequest, type NnrpSessionPatchResult, type NnrpSubmitRequest, type NnrpTransportCandidate, type NnrpTransportKind, type NnrpTransportPolicy, type NnrpTransportProvider, type NnrpTransportSelectionSummary } from "@nnrp/core";
export interface NnrpWasmRuntimeOptions {
    readonly moduleUrl?: string | URL;
    readonly module?: WebAssembly.Module;
    readonly artifact?: NnrpWasmArtifactOptions;
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly transportProviders?: readonly NnrpBrowserTransportProvider[];
    readonly primitives?: NnrpWasmPrimitiveBinding;
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
export type NnrpBrowserTransportKind = Extract<NnrpTransportKind, "websocket">;
export interface NnrpBrowserTransportProvider extends NnrpTransportProvider {
    readonly kind: NnrpBrowserTransportKind;
    readonly available?: boolean;
    readonly score?: number;
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpBrowserTransportProviderOptions {
    readonly available?: boolean;
    readonly score?: number;
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpBrowserSessionOptions extends NnrpSessionFlowControlOptions {
    readonly sessionId?: string;
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
    readonly primitives?: NnrpWasmPrimitiveBinding;
}
export interface NnrpWasmRuntimeBinding {
    readonly manifest: NnrpCapabilityManifest;
    readonly moduleUrl: string;
    readonly module?: WebAssembly.Module;
    readonly artifact?: NnrpResolvedWasmArtifact;
    readonly transportProviders: readonly NnrpBrowserTransportProvider[];
    readonly primitives?: NnrpWasmPrimitiveBinding;
}
export interface NnrpWasmSubmitRequest {
    readonly sessionOptions: NnrpBrowserSessionOptions;
    readonly submit: NnrpNormalizedSubmitRequest;
}
export interface NnrpWasmCancelRequest {
    readonly sessionOptions: NnrpBrowserSessionOptions;
    readonly cancel: NnrpCancelRequest;
}
export interface NnrpWasmSessionPatchRequest {
    readonly sessionOptions: NnrpBrowserSessionOptions;
    readonly patch: NnrpSessionPatchRequest;
}
export interface NnrpWasmSubmitNoWaitRequest {
    readonly sessionOptions: NnrpBrowserSessionOptions;
    readonly submit: NnrpNormalizedSubmitRequest;
}
export interface NnrpWasmEventBatchRequest {
    readonly maxEvents: number;
    readonly timeoutMillis?: number;
}
export interface NnrpWasmProtocolVersion {
    readonly protocolMajor: number;
    readonly wireFormat: number;
    readonly version: string;
}
export interface NnrpWasmTransportScoreRequest {
    readonly candidates: readonly NnrpTransportCandidate[];
    readonly policy: NnrpTransportPolicy;
}
export interface NnrpWasmSubmitValidationRequest {
    readonly sessionOptions: NnrpBrowserSessionOptions;
    readonly submit: NnrpNormalizedSubmitRequest;
}
export interface NnrpWasmPrimitiveBinding {
    protocolVersion?(): NnrpWasmProtocolVersion | Promise<NnrpWasmProtocolVersion>;
    scoreTransportCandidates?(request: NnrpWasmTransportScoreRequest): readonly NnrpTransportCandidate[] | Promise<readonly NnrpTransportCandidate[]>;
    validateSubmit?(request: NnrpWasmSubmitValidationRequest): NnrpNormalizedSubmitRequest | void | Promise<NnrpNormalizedSubmitRequest | void>;
    submit?(request: NnrpWasmSubmitRequest): NnrpResult | Promise<NnrpResult>;
    submitNoWait?(request: NnrpWasmSubmitNoWaitRequest): bigint | Promise<bigint>;
    cancel?(request: NnrpWasmCancelRequest): void | Promise<void>;
    patchSession?(request: NnrpWasmSessionPatchRequest): NnrpSessionPatchResult | void | Promise<NnrpSessionPatchResult | void>;
    awaitEvents?(request: NnrpWasmEventBatchRequest): readonly NnrpRuntimeEvent[] | Promise<readonly NnrpRuntimeEvent[]>;
    close?(): void | Promise<void>;
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
    selectTransportWithPrimitives(options: NnrpBrowserTransportSelectionOptions): Promise<NnrpTransportSelectionSummary>;
    protocolVersion(): Promise<NnrpWasmProtocolVersion>;
    submit(request: NnrpWasmSubmitRequest): Promise<NnrpResult>;
    submitNoWait(request: NnrpWasmSubmitNoWaitRequest): Promise<bigint>;
    cancel(request: NnrpWasmCancelRequest): Promise<void>;
    patchSession(request: NnrpWasmSessionPatchRequest): Promise<NnrpSessionPatchResult>;
    awaitEvents(request: NnrpWasmEventBatchRequest): Promise<readonly NnrpRuntimeEvent[]>;
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
    get runtime(): NnrpBrowserRuntime;
    openSession(options?: NnrpBrowserSessionOptions): NnrpBrowserClientSession;
    nextSessionEvent(sessionId: string, options?: NnrpEventPollOptions): Promise<NnrpRuntimeEvent>;
    close(): Promise<void>;
    get closed(): boolean;
}
export interface NnrpBrowserClientSessionState {
    readonly client: NnrpBrowserClient;
    options: NnrpBrowserSessionOptions;
}
export declare class NnrpBrowserClientSession {
    #private;
    constructor(state: NnrpBrowserClientSessionState);
    get options(): NnrpBrowserSessionOptions;
    get sessionId(): string;
    submit(request: NnrpSubmitRequest): Promise<NnrpResult>;
    submitNoWait(request: NnrpSubmitRequest): Promise<bigint>;
    cancel(operation: NnrpOperationRef, options?: NnrpCancelOptions): Promise<void>;
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
export declare function createWasmRuntimeBinding(options?: NnrpWasmBindingOptions): NnrpWasmRuntimeBinding;
export declare function resolveWasmArtifact(options: NnrpWasmArtifactOptions): NnrpResolvedWasmArtifact;
export declare function validateWasmArtifactManifest(manifest: NnrpWasmArtifactManifest, requiredExports?: readonly string[]): void;
export declare function createBrowserTransportProvider(kind: NnrpBrowserTransportKind, options?: NnrpBrowserTransportProviderOptions): NnrpBrowserTransportProvider;
//# sourceMappingURL=index.d.ts.map