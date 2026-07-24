import { type BudgetMetadata, type CacheInvalidateMetadata, type CacheMissMetadata, type CacheReferenceMetadata, type CapabilityMetadata, type ControlRequestMetadata, type NnrpCapabilityManifest, type NnrpEventPollOptions, type NnrpInputProfile, NnrpMessageType, type NnrpResult, type NnrpRuntimeEvent, type NnrpSessionFlowControlOptions, type NnrpSessionMigrationRequest, type NnrpSessionPatchRequest, type NnrpSessionPatchResult, type NnrpSubmitOptions, type NnrpSubmitRequest, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportKind, type NnrpTransportPolicy, type NnrpTransportProbeMetrics, type NnrpTransportProvider, type NnrpTransportSelectionSummary, type ObjectDeltaMetadata, type ObjectDescriptorMetadata, type ObjectReferenceMetadata, type ObjectReleaseMetadata, type RouteHintMetadata, type RuntimeControlMetadata, type SchedulingMetadata, type SupersedeMetadata, type TraceContextMetadata } from "@nnrp/core";
import { NnrpWasmBindingUnavailableError } from "./errors.js";
export { NnrpWasmBindingUnavailableError };
export interface NnrpBrowserRuntimeOptions {
    readonly moduleUrl?: string | URL;
    readonly module?: WebAssembly.Module;
    readonly artifact?: NnrpWasmArtifactOptions;
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly transportProviders?: readonly NnrpBrowserTransportProvider[];
}
export interface NnrpBrowserConnectOptions {
    readonly endpoint: string;
    readonly providerEndpoint?: string | URL;
    readonly transportPolicy?: NnrpTransportPolicy;
    readonly transportProviders?: readonly NnrpBrowserTransportProvider[];
    readonly sessionDefaults?: NnrpBrowserSessionOptions;
}
export interface NnrpBrowserTransportSelectionOptions {
    readonly peerManifest: NnrpCapabilityManifest;
    readonly providers?: readonly NnrpBrowserTransportProvider[];
    readonly policy?: NnrpTransportPolicy;
    readonly requestedMaxFrameBytes?: bigint;
    readonly probeMetricsByProviderId?: Readonly<Record<string, NnrpTransportProbeMetrics>>;
}
export type NnrpBrowserTransportKind = Extract<NnrpTransportKind, "websocket">;
export interface NnrpBrowserTransportProvider extends NnrpTransportProvider {
    readonly kind: NnrpBrowserTransportKind;
    connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
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
}
export interface NnrpWasmRuntimeBinding {
    readonly manifest: NnrpCapabilityManifest;
    readonly moduleUrl: string;
    readonly module?: WebAssembly.Module;
    readonly artifact?: NnrpResolvedWasmArtifact;
    readonly transportProviders: readonly NnrpBrowserTransportProvider[];
}
export interface NnrpWasmProtocolVersion {
    readonly protocolMajor: number;
    readonly wireFormat: number;
    readonly version: string;
}
export interface NnrpWasmArtifactOptions {
    readonly manifest: NnrpWasmArtifactManifest;
    readonly baseUrl?: string | URL;
    readonly requiredExports?: readonly string[];
}
export interface NnrpWasmArtifactManifest {
    readonly package: "nnrp-wasm";
    readonly wasm: string;
    readonly glue: string;
    readonly types: string;
    readonly owner?: string;
    readonly downstream_wrapper?: string;
    readonly exports: readonly string[];
}
export interface NnrpResolvedWasmArtifact {
    readonly manifest: NnrpWasmArtifactManifest;
    readonly moduleUrl: string;
    readonly glueUrl: string;
    readonly typesUrl: string;
    readonly requiredExports: readonly string[];
}
export declare function openBrowserRuntime(options?: NnrpBrowserRuntimeOptions): Promise<NnrpBrowserRuntime>;
export declare class NnrpBrowserRuntime {
    #private;
    constructor(binding: NnrpWasmRuntimeBinding, transportPolicy?: NnrpTransportPolicy);
    get manifest(): NnrpCapabilityManifest;
    get moduleUrl(): string;
    get artifact(): NnrpResolvedWasmArtifact | undefined;
    get transportProviders(): readonly NnrpBrowserTransportProvider[];
    connect(options: NnrpBrowserConnectOptions): NnrpBrowserClient;
    selectTransport(options: NnrpBrowserTransportSelectionOptions): NnrpTransportSelectionSummary;
    protocolVersion(): Promise<NnrpWasmProtocolVersion>;
    close(): Promise<void>;
    get closed(): boolean;
}
export interface NnrpBrowserClientState {
    readonly endpoint: string;
    readonly providerEndpoint: string;
    readonly provider: NnrpBrowserTransportProvider;
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
    readonly wireSessionId: number;
}
export declare class NnrpBrowserClientSession {
    #private;
    constructor(state: NnrpBrowserClientSessionState);
    get options(): NnrpBrowserSessionOptions;
    get sessionId(): string;
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
    sendTraceContext(metadata: TraceContextMetadata, body?: Uint8Array): Promise<void>;
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
//# sourceMappingURL=index.d.ts.map