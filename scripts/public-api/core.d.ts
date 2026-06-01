export declare const NNRP_PROTOCOL_NAME = "NNRP";
export declare const NNRP_PROTOCOL_VERSION = "1.0.0";
export type NnrpBuildMode = "backend-native" | "browser-wasm";
export type NnrpTransportKind = "tcp" | "quic" | "webtransport" | "websocket";
export type NnrpTransportPolicy = "score" | "tcp-only" | "quic-only";
export type NnrpOperationId = bigint;
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
export interface NnrpTransportSelection {
    readonly selected: NnrpTransportCandidate | null;
    readonly candidates: readonly NnrpTransportCandidate[];
    readonly policy: NnrpTransportPolicy;
}
export declare const NNRP_STANDARD_INPUT_PROFILES: readonly ["tensor", "token", "structured_event", "tool_delta"];
export type NnrpInputProfile = (typeof NNRP_STANDARD_INPUT_PROFILES)[number];
export type NnrpSubmitMode = "inline" | "object-reference";
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
    readonly metadata?: Readonly<Record<string, string>>;
}
export type NnrpRuntimeEvent = {
    readonly type: "result";
    readonly result: NnrpResult;
} | {
    readonly type: "flow-update";
    readonly update: NnrpFlowUpdateMetadata;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "result-hint";
    readonly hint: NnrpResultHintMetadata;
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "drop";
    readonly frameId: number;
    readonly diagnostic: NnrpDiagnostic;
} | {
    readonly type: "close";
    readonly diagnostic?: NnrpDiagnostic;
} | {
    readonly type: "diagnostic";
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
export interface NnrpCapabilityManifestOptions {
    readonly buildMode: NnrpBuildMode;
    readonly transports?: readonly NnrpTransportKind[];
    readonly capabilities?: readonly NnrpCapability[];
}
export declare function createCapabilityManifest(options: NnrpCapabilityManifestOptions): NnrpCapabilityManifest;
export declare function createBackendNativeManifest(capabilities?: readonly NnrpCapability[]): NnrpCapabilityManifest;
export declare function createBrowserWasmManifest(capabilities?: readonly NnrpCapability[]): NnrpCapabilityManifest;
export declare function selectTransport(candidates: readonly NnrpTransportCandidate[], policy?: NnrpTransportPolicy): NnrpTransportSelection;
export interface NormalizeSubmitRequestOptions {
    readonly copyPayloads?: boolean;
    readonly strictProfiles?: boolean;
}
export declare function createCacheKey(kind: NnrpCacheObjectKind, key: bigint | number | string, namespaceId?: number): NnrpCacheKey;
export declare function createSchemaDescriptor(descriptor: NnrpSchemaDescriptor): NnrpSchemaDescriptor;
export declare function isStandardInputProfile(profile: string): profile is NnrpInputProfile;
export declare function normalizeSubmitRequest(request: NnrpSubmitRequest, options?: NormalizeSubmitRequestOptions): NnrpNormalizedSubmitRequest;
//# sourceMappingURL=index.d.ts.map