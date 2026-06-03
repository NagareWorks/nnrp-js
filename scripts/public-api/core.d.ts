export declare const NNRP_PROTOCOL_NAME = "NNRP";
export declare const NNRP_PROTOCOL_VERSION = "1.0.0";
export type NnrpBuildMode = "backend-native" | "browser-wasm";
export type NnrpTransportKind = "tcp" | "quic" | "webtransport" | "websocket";
export type NnrpTransportPolicy = "score" | "tcp-only" | "quic-only";
export type NnrpOperationId = bigint;
export type NnrpOperationState = "pending" | "dispatched" | "completed" | "dropped" | "cancelled";
export type NnrpOperationRef = NnrpOperationId | number;
export type NnrpCapability = "client.session" | "server.session" | "native.loader" | "wasm.loader" | "transport.tcp" | "transport.quic" | "transport.websocket" | "transport.webtransport" | "flow.update" | "result.hint" | "cache" | "schema" | "recovery";
export type NnrpDiagnosticSource = "core" | "native" | "wasm" | "transport" | "protocol" | "runtime";
export interface NnrpDiagnostic {
    readonly code: string;
    readonly message: string;
    readonly source: NnrpDiagnosticSource;
    readonly retryable?: boolean;
    readonly transport?: NnrpTransportKind;
    readonly cause?: unknown;
}
export interface NnrpCapabilityManifest {
    readonly protocol: typeof NNRP_PROTOCOL_NAME;
    readonly version: string;
    readonly buildMode: NnrpBuildMode;
    readonly transports: readonly NnrpTransportKind[];
    readonly capabilities: readonly NnrpCapability[];
}
export type NnrpTransportRejectionReason = "peer-unsupported" | "local-unavailable" | "policy-rejected" | "probe-failed";
export interface NnrpTransportCandidate {
    readonly kind: NnrpTransportKind;
    readonly peerSupported: boolean;
    readonly localAvailable: boolean;
    readonly score: number;
    readonly rejectionReason?: NnrpTransportRejectionReason;
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpTransportEndpoint {
    readonly endpoint: string | URL;
}
export interface NnrpTransportConnection {
    readonly kind: NnrpTransportKind;
    readonly endpoint: string;
    readonly connected: boolean;
    send(payload: Uint8Array): void | Promise<void>;
    close(): void | Promise<void>;
}
export interface NnrpTransportServer {
    readonly kind: NnrpTransportKind;
    readonly endpoint: string;
    readonly listening: boolean;
    close(): void | Promise<void>;
}
export interface NnrpTransportProvider {
    readonly kind: NnrpTransportKind;
    readonly endpointSchemes: readonly string[];
    probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
    connect?(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
    listen?(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}
export interface NnrpTransportSelection {
    readonly selected: NnrpTransportCandidate | null;
    readonly candidates: readonly NnrpTransportCandidate[];
    readonly policy: NnrpTransportPolicy;
}
export interface NnrpTransportCandidateOptions {
    readonly local: NnrpCapabilityManifest;
    readonly peer: NnrpCapabilityManifest;
    readonly scores?: Readonly<Partial<Record<NnrpTransportKind, number>>>;
}
export interface NnrpTransportSelectionSummary {
    readonly policy: NnrpTransportPolicy;
    readonly selected: NnrpTransportKind | null;
    readonly rejected: readonly NnrpRejectedTransportCandidate[];
    readonly candidates: readonly NnrpTransportCandidate[];
}
export interface NnrpRejectedTransportCandidate {
    readonly kind: NnrpTransportKind;
    readonly reason: NnrpTransportRejectionReason;
    readonly score: number;
    readonly diagnostic?: NnrpDiagnostic;
}
export declare const NNRP_STANDARD_INPUT_PROFILES: readonly ["tensor", "token", "structured_event", "tool_delta"];
export type NnrpInputProfile = (typeof NNRP_STANDARD_INPUT_PROFILES)[number];
export type NnrpSubmitMode = "inline" | "object-reference";
export type NnrpSubmitCapacityPolicy = "immediate" | "await-credit";
export type NnrpBinaryPayload = Uint8Array | ArrayBufferView;
export type NnrpCacheObjectKind = "tensor" | "token" | "schema" | "artifact" | "tool";
export interface NnrpTensorSection {
    readonly payload: NnrpBinaryPayload;
    readonly codecId?: number;
}
export interface NnrpCacheKey {
    readonly kind: NnrpCacheObjectKind;
    readonly key: bigint | number | string;
    readonly namespaceId?: number;
}
export interface NnrpCacheMetadata {
    readonly key: NnrpCacheKey;
    readonly version?: bigint | number | string;
    readonly leaseMillis?: number;
    readonly dependencies?: readonly NnrpCacheKey[];
}
export type NnrpCacheOperationStatus = "accepted" | "stored" | "invalidated" | "miss" | "rejected";
export interface NnrpCachePutRequest {
    readonly key: NnrpCacheKey;
    readonly payload?: NnrpBinaryPayload;
    readonly descriptor?: NnrpPayloadDescriptor;
    readonly leaseMillis?: number;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpCachePutResult {
    readonly key: NnrpCacheKey;
    readonly status: Extract<NnrpCacheOperationStatus, "accepted" | "stored" | "rejected">;
    readonly version?: bigint | number | string;
    readonly diagnostic?: NnrpDiagnostic;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpCacheInvalidateRequest {
    readonly key: NnrpCacheKey;
    readonly version?: bigint | number | string;
    readonly recursive?: boolean;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpCacheInvalidateResult {
    readonly key: NnrpCacheKey;
    readonly status: Extract<NnrpCacheOperationStatus, "invalidated" | "miss" | "rejected">;
    readonly diagnostic?: NnrpDiagnostic;
    readonly metadata?: Readonly<Record<string, string>>;
}
export type NnrpSchemaFlag = "required" | "streamable" | "lossless" | "opaque";
export interface NnrpSchemaDescriptor {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly flags?: readonly NnrpSchemaFlag[];
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpPayloadDescriptor {
    readonly profile: NnrpInputProfile;
    readonly schema?: NnrpSchemaDescriptor;
    readonly cache?: NnrpCacheMetadata;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpSubmitRequest {
    readonly frameId: number;
    readonly payload?: NnrpBinaryPayload;
    readonly tensors?: readonly NnrpTensorSection[];
    readonly inputProfile?: NnrpInputProfile;
    readonly submitMode?: NnrpSubmitMode;
    readonly cacheKey?: NnrpCacheKey;
    readonly descriptor?: NnrpPayloadDescriptor;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpNormalizedTensorSection {
    readonly payload: Uint8Array;
    readonly codecId?: number;
}
export interface NnrpNormalizedSubmitRequest {
    readonly frameId: number;
    readonly payload?: Uint8Array;
    readonly tensors?: readonly NnrpNormalizedTensorSection[];
    readonly inputProfile?: NnrpInputProfile;
    readonly submitMode?: NnrpSubmitMode;
    readonly cacheKey?: NnrpCacheKey;
    readonly descriptor?: NnrpPayloadDescriptor;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpResult {
    readonly frameId: number;
    readonly payload?: Uint8Array;
    readonly diagnostic?: NnrpDiagnostic;
    readonly sessionId?: string;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpRecoveryToken {
    readonly token: string | Uint8Array;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpSessionMigrationRequest {
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly metadata?: Readonly<Record<string, string>>;
}
export type NnrpSessionMigrationEvent = {
    readonly type: "migration-requested";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "migration-accepted";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "migration-rejected";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic: NnrpDiagnostic;
};
export type NnrpRuntimeEvent = {
    readonly type: "submit";
    readonly submit: NnrpNormalizedSubmitRequest;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "result";
    readonly result: NnrpResult;
    readonly sessionId?: string;
} | {
    readonly type: "flow-update";
    readonly update: NnrpFlowUpdateMetadata;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "result-hint";
    readonly hint: NnrpResultHintMetadata;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "drop";
    readonly frameId: number;
    readonly sessionId?: string;
    readonly diagnostic: NnrpDiagnostic;
} | NnrpSessionMigrationEvent | {
    readonly type: "close";
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "diagnostic";
    readonly sessionId?: string;
    readonly diagnostic: NnrpDiagnostic;
};
export interface NnrpFlowUpdateMetadata {
    readonly credits: number;
    readonly recommendedPacingMicros?: number;
    readonly transport?: NnrpTransportKind;
}
export interface NnrpResultHintMetadata {
    readonly frameId: number;
    readonly expectedBytes?: number;
    readonly transport?: NnrpTransportKind;
}
export interface NnrpCancelOptions {
    readonly reason?: string;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpCancelRequest {
    readonly operation: NnrpOperationRef;
    readonly options?: NnrpCancelOptions;
}
export interface NnrpCancelResult {
    readonly operation: NnrpOperationId;
    readonly state: Extract<NnrpOperationState, "cancelled">;
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpAbortSignalLike {
    readonly aborted: boolean;
    readonly reason?: unknown;
    addEventListener?(type: "abort", listener: () => void, options?: {
        readonly once?: boolean;
    }): void;
    removeEventListener?(type: "abort", listener: () => void): void;
}
export interface NnrpEventPollOptions {
    readonly timeoutMillis?: number;
    readonly signal?: NnrpAbortSignalLike;
}
export interface NnrpSessionMetadataOptions {
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface NnrpSessionFlowControlOptions {
    readonly submitCapacityPolicy?: NnrpSubmitCapacityPolicy;
    readonly initialCredits?: number;
}
export interface NnrpSessionPatchRequest extends NnrpSessionMetadataOptions, NnrpSessionFlowControlOptions {
    readonly inputProfile?: NnrpInputProfile;
    readonly targetCadence?: number;
    readonly qualityTier?: number;
}
export interface NnrpSessionPatchResult {
    readonly accepted: boolean;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
    readonly metadata?: Readonly<Record<string, string>>;
}
export declare class NnrpError extends Error {
    readonly diagnostic: NnrpDiagnostic;
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NnrpCapabilityError extends NnrpError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NnrpTransportError extends NnrpError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NnrpTimeoutError extends NnrpError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NnrpProtocolError extends NnrpError {
    constructor(diagnostic: NnrpDiagnostic);
}
export declare class NnrpResultDropError extends NnrpProtocolError {
    readonly frameId: number;
    readonly sessionId?: string;
    constructor(event: Extract<NnrpRuntimeEvent, {
        readonly type: "drop";
    }>);
}
export declare class NnrpRecoveryError extends NnrpCapabilityError {
    constructor(diagnostic: NnrpDiagnostic);
}
export interface NnrpCapabilityManifestOptions {
    readonly buildMode: NnrpBuildMode;
    readonly transports?: readonly NnrpTransportKind[];
    readonly capabilities?: readonly NnrpCapability[];
}
export declare function createCapabilityManifest(options: NnrpCapabilityManifestOptions): NnrpCapabilityManifest;
export declare function createBackendNativeManifest(capabilities?: readonly NnrpCapability[]): NnrpCapabilityManifest;
export declare function createBrowserWasmManifest(capabilities?: readonly NnrpCapability[]): NnrpCapabilityManifest;
export declare function selectTransport(candidates: readonly NnrpTransportCandidate[], policy?: NnrpTransportPolicy): NnrpTransportSelection;
export declare function createTransportCandidates(options: NnrpTransportCandidateOptions): readonly NnrpTransportCandidate[];
export declare function createTransportSelectionSummary(selection: NnrpTransportSelection): NnrpTransportSelectionSummary;
export interface NormalizeSubmitRequestOptions {
    readonly copyPayloads?: boolean;
    readonly strictProfiles?: boolean;
}
export declare function createCacheKey(kind: NnrpCacheObjectKind, key: bigint | number | string, namespaceId?: number): NnrpCacheKey;
export declare function createSchemaDescriptor(descriptor: NnrpSchemaDescriptor): NnrpSchemaDescriptor;
export declare function normalizeCachePutRequest(request: NnrpCachePutRequest): NnrpCachePutRequest;
export declare function normalizeCacheInvalidateRequest(request: NnrpCacheInvalidateRequest): NnrpCacheInvalidateRequest;
export declare function isStandardInputProfile(profile: string): profile is NnrpInputProfile;
export declare function normalizeSubmitRequest(request: NnrpSubmitRequest, options?: NormalizeSubmitRequestOptions): NnrpNormalizedSubmitRequest;
export declare function normalizeOperationRef(operation: NnrpOperationRef): NnrpOperationId;
export declare function normalizeCancelRequest(operation: NnrpOperationRef, options?: NnrpCancelOptions): NnrpCancelRequest;
export declare function createRecoveryToken(token: string | NnrpBinaryPayload, metadata?: Readonly<Record<string, string>>): NnrpRecoveryToken;
export declare function normalizeSessionMigrationRequest(request: NnrpSessionMigrationRequest): NnrpSessionMigrationRequest;
export declare function throwIfResultDrop(event: NnrpRuntimeEvent): void;
export declare function validateEventPollOptions(options?: NnrpEventPollOptions): void;
export declare function validateSessionMetadata(options?: NnrpSessionMetadataOptions): void;
export declare function normalizeSessionPatchRequest(request: NnrpSessionPatchRequest): NnrpSessionPatchRequest;
//# sourceMappingURL=index.d.ts.map