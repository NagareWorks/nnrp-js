export const NNRP_PROTOCOL_NAME = "NNRP";
export const NNRP_PROTOCOL_VERSION = "1.0.0";

export type NnrpBuildMode = "backend-native" | "browser-wasm";

export type NnrpTransportKind = "tcp" | "quic" | "webtransport" | "websocket";

export type NnrpTransportPolicy = "score" | "tcp-only" | "quic-only";

export type NnrpOperationId = bigint;

export type NnrpOperationState = "pending" | "dispatched" | "completed" | "dropped" | "cancelled";

export type NnrpOperationRef = NnrpOperationId | number;

export type NnrpCapability =
  | "client.session"
  | "server.session"
  | "native.loader"
  | "wasm.loader"
  | "transport.tcp"
  | "transport.quic"
  | "transport.websocket"
  | "transport.webtransport"
  | "flow.update"
  | "result.hint"
  | "cache"
  | "schema"
  | "recovery";

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

export type NnrpTransportRejectionReason =
  | "peer-unsupported"
  | "local-unavailable"
  | "policy-rejected"
  | "probe-failed";

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

export const NNRP_STANDARD_INPUT_PROFILES = ["tensor", "token", "structured_event", "tool_delta"] as const;

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

export type NnrpRuntimeEvent =
  | { readonly type: "result"; readonly result: NnrpResult }
  | { readonly type: "flow-update"; readonly update: NnrpFlowUpdateMetadata; readonly diagnostic?: NnrpDiagnostic }
  | { readonly type: "result-hint"; readonly hint: NnrpResultHintMetadata; readonly diagnostic?: NnrpDiagnostic }
  | { readonly type: "drop"; readonly frameId: number; readonly diagnostic: NnrpDiagnostic }
  | { readonly type: "close"; readonly diagnostic?: NnrpDiagnostic }
  | { readonly type: "diagnostic"; readonly diagnostic: NnrpDiagnostic };

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

export interface NnrpEventPollOptions {
  readonly timeoutMillis?: number;
}

export class NnrpError extends Error {
  public readonly diagnostic: NnrpDiagnostic;

  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic.message);
    this.name = "NnrpError";
    this.diagnostic = diagnostic;
  }
}

export class NnrpCapabilityError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpCapabilityError";
  }
}

export class NnrpTransportError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpTransportError";
  }
}

export class NnrpTimeoutError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpTimeoutError";
  }
}

export class NnrpProtocolError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpProtocolError";
  }
}

export interface NnrpCapabilityManifestOptions {
  readonly buildMode: NnrpBuildMode;
  readonly transports?: readonly NnrpTransportKind[];
  readonly capabilities?: readonly NnrpCapability[];
}

export function createCapabilityManifest(options: NnrpCapabilityManifestOptions): NnrpCapabilityManifest {
  validateCapabilityManifestOptions(options);

  return {
    protocol: NNRP_PROTOCOL_NAME,
    version: NNRP_PROTOCOL_VERSION,
    buildMode: options.buildMode,
    transports: [...(options.transports ?? [])],
    capabilities: [...(options.capabilities ?? [])],
  };
}

export function createBackendNativeManifest(
  capabilities: readonly NnrpCapability[] = [],
): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp", "quic"],
    capabilities: ["client.session", "server.session", "native.loader", ...capabilities],
  });
}

export function createBrowserWasmManifest(
  capabilities: readonly NnrpCapability[] = [],
): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "browser-wasm",
    transports: ["websocket", "webtransport"],
    capabilities: ["client.session", "wasm.loader", ...capabilities],
  });
}

export function selectTransport(
  candidates: readonly NnrpTransportCandidate[],
  policy: NnrpTransportPolicy = "score",
): NnrpTransportSelection {
  const eligible = candidates
    .filter((candidate) => isTransportEligible(candidate, policy))
    .sort((left, right) => right.score - left.score);

  return {
    selected: eligible[0] ?? null,
    candidates: [...candidates],
    policy,
  };
}

export interface NormalizeSubmitRequestOptions {
  readonly copyPayloads?: boolean;
  readonly strictProfiles?: boolean;
}

export function createCacheKey(
  kind: NnrpCacheObjectKind,
  key: bigint | number | string,
  namespaceId?: number,
): NnrpCacheKey {
  validateCacheKey({ kind, key, ...(namespaceId === undefined ? {} : { namespaceId }) });
  return { kind, key, ...(namespaceId === undefined ? {} : { namespaceId }) };
}

export function createSchemaDescriptor(descriptor: NnrpSchemaDescriptor): NnrpSchemaDescriptor {
  validateSchemaDescriptor(descriptor);
  return {
    id: descriptor.id,
    name: descriptor.name,
    version: descriptor.version,
    ...(descriptor.flags === undefined ? {} : { flags: [...descriptor.flags] }),
    ...(descriptor.metadata === undefined ? {} : { metadata: { ...descriptor.metadata } }),
  };
}

export function isStandardInputProfile(profile: string): profile is NnrpInputProfile {
  return (NNRP_STANDARD_INPUT_PROFILES as readonly string[]).includes(profile);
}

export function normalizeSubmitRequest(
  request: NnrpSubmitRequest,
  options: NormalizeSubmitRequestOptions = {},
): NnrpNormalizedSubmitRequest {
  validateSubmitRequestShape(request, options);

  const copyPayloads = options.copyPayloads ?? true;
  return {
    frameId: request.frameId,
    ...(request.payload === undefined ? {} : { payload: normalizeBinaryPayload(request.payload, copyPayloads) }),
    ...(request.tensors === undefined ? {} : {
      tensors: request.tensors.map((section) => ({
        payload: normalizeBinaryPayload(section.payload, copyPayloads),
        ...(section.codecId === undefined ? {} : { codecId: section.codecId }),
      })),
    }),
    ...(request.inputProfile === undefined ? {} : { inputProfile: request.inputProfile }),
    ...(request.submitMode === undefined ? {} : { submitMode: request.submitMode }),
    ...(request.cacheKey === undefined ? {} : { cacheKey: request.cacheKey }),
    ...(request.descriptor === undefined ? {} : { descriptor: createPayloadDescriptor(request.descriptor) }),
    ...(request.metadata === undefined ? {} : { metadata: { ...request.metadata } }),
  };
}

export function normalizeOperationRef(operation: NnrpOperationRef): NnrpOperationId {
  if (typeof operation === "bigint") {
    if (operation < 0n) {
      throw new NnrpProtocolError({
        code: "NNRP_OPERATION_ID_INVALID",
        message: "Operation ids must be non-negative.",
        source: "core",
        retryable: false,
      });
    }

    return operation;
  }

  if (!Number.isSafeInteger(operation) || operation < 0) {
    throw new NnrpProtocolError({
      code: "NNRP_OPERATION_ID_INVALID",
      message: "Operation ids must be non-negative safe integers.",
      source: "core",
      retryable: false,
    });
  }

  return BigInt(operation);
}

export function normalizeCancelRequest(
  operation: NnrpOperationRef,
  options: NnrpCancelOptions = {},
): NnrpCancelRequest {
  const normalized = normalizeOperationRef(operation);

  return {
    operation: normalized,
    options: {
      ...(options.reason === undefined ? {} : { reason: options.reason }),
      ...(options.metadata === undefined ? {} : { metadata: { ...options.metadata } }),
    },
  };
}

export function validateEventPollOptions(options: NnrpEventPollOptions = {}): void {
  if (
    options.timeoutMillis !== undefined &&
    (!Number.isFinite(options.timeoutMillis) || options.timeoutMillis < 0)
  ) {
    throw new NnrpProtocolError({
      code: "NNRP_EVENT_TIMEOUT_INVALID",
      message: "Event timeoutMillis must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }
}

function isTransportEligible(candidate: NnrpTransportCandidate, policy: NnrpTransportPolicy): boolean {
  if (!candidate.peerSupported || !candidate.localAvailable) {
    return false;
  }

  if (policy === "tcp-only") {
    return candidate.kind === "tcp";
  }

  if (policy === "quic-only") {
    return candidate.kind === "quic";
  }

  return true;
}

function createPayloadDescriptor(descriptor: NnrpPayloadDescriptor): NnrpPayloadDescriptor {
  validateInputProfile(descriptor.profile, true);

  return {
    profile: descriptor.profile,
    ...(descriptor.schema === undefined ? {} : { schema: createSchemaDescriptor(descriptor.schema) }),
    ...(descriptor.cache === undefined ? {} : { cache: createCacheMetadata(descriptor.cache) }),
    ...(descriptor.metadata === undefined ? {} : { metadata: { ...descriptor.metadata } }),
  };
}

function createCacheMetadata(metadata: NnrpCacheMetadata): NnrpCacheMetadata {
  validateCacheKey(metadata.key);

  return {
    key: metadata.key,
    ...(metadata.version === undefined ? {} : { version: metadata.version }),
    ...(metadata.leaseMillis === undefined ? {} : { leaseMillis: metadata.leaseMillis }),
    ...(metadata.dependencies === undefined
      ? {}
      : { dependencies: metadata.dependencies.map((key) => createCacheKey(key.kind, key.key, key.namespaceId)) }),
  };
}

function validateSubmitRequestShape(
  request: NnrpSubmitRequest,
  options: NormalizeSubmitRequestOptions,
): void {
  if (!Number.isSafeInteger(request.frameId) || request.frameId < 0) {
    throw new NnrpProtocolError({
      code: "NNRP_SUBMIT_FRAME_ID_INVALID",
      message: "Submit request frameId must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }

  if (request.inputProfile !== undefined) {
    validateInputProfile(request.inputProfile, options.strictProfiles ?? true);
  }

  if (request.cacheKey !== undefined) {
    validateCacheKey(request.cacheKey);
  }

  if (request.tensors !== undefined) {
    for (const section of request.tensors) {
      if (section.codecId !== undefined && (!Number.isSafeInteger(section.codecId) || section.codecId < 0)) {
        throw new NnrpProtocolError({
          code: "NNRP_TENSOR_CODEC_ID_INVALID",
          message: "Tensor section codecId must be a non-negative safe integer.",
          source: "core",
          retryable: false,
        });
      }
    }
  }
}

function validateInputProfile(profile: string, strictProfiles: boolean): void {
  if (strictProfiles && !isStandardInputProfile(profile)) {
    throw new NnrpProtocolError({
      code: "NNRP_INPUT_PROFILE_UNKNOWN",
      message: `Unknown NNRP input profile '${profile}'.`,
      source: "core",
      retryable: false,
    });
  }
}

function validateCacheKey(key: NnrpCacheKey): void {
  if (!["tensor", "token", "schema", "artifact", "tool"].includes(key.kind)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_KIND_INVALID",
      message: `Unsupported NNRP cache object kind '${key.kind}'.`,
      source: "core",
      retryable: false,
    });
  }

  if (typeof key.key === "string" && key.key.trim().length === 0) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_KEY_EMPTY",
      message: "Cache key strings must not be empty.",
      source: "core",
      retryable: false,
    });
  }

  if (typeof key.key === "number" && (!Number.isSafeInteger(key.key) || key.key < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_KEY_NUMBER_INVALID",
      message: "Numeric cache keys must be non-negative safe integers.",
      source: "core",
      retryable: false,
    });
  }

  if (key.namespaceId !== undefined && (!Number.isSafeInteger(key.namespaceId) || key.namespaceId < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_NAMESPACE_INVALID",
      message: "Cache namespaceId must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }
}

function validateSchemaDescriptor(descriptor: NnrpSchemaDescriptor): void {
  validateIdentifier("NNRP_SCHEMA_ID_INVALID", "Schema id", descriptor.id);
  validateIdentifier("NNRP_SCHEMA_NAME_INVALID", "Schema name", descriptor.name);
  validateIdentifier("NNRP_SCHEMA_VERSION_INVALID", "Schema version", descriptor.version);

  if (descriptor.flags !== undefined) {
    const allowed = new Set<NnrpSchemaFlag>(["required", "streamable", "lossless", "opaque"]);
    for (const flag of descriptor.flags) {
      if (!allowed.has(flag)) {
        throw new NnrpProtocolError({
          code: "NNRP_SCHEMA_FLAG_INVALID",
          message: `Unsupported schema flag '${flag}'.`,
          source: "core",
          retryable: false,
        });
      }
    }
  }
}

function validateIdentifier(code: string, label: string, value: string): void {
  if (value.trim().length === 0 || value.length > 128) {
    throw new NnrpProtocolError({
      code,
      message: `${label} must be non-empty and at most 128 characters.`,
      source: "core",
      retryable: false,
    });
  }
}

function normalizeBinaryPayload(payload: NnrpBinaryPayload, copyPayload: boolean): Uint8Array {
  const view = payload instanceof Uint8Array
    ? payload
    : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);

  if (!copyPayload) {
    return view;
  }

  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

function validateCapabilityManifestOptions(options: NnrpCapabilityManifestOptions): void {
  const transports = options.transports ?? [];
  const capabilities = options.capabilities ?? [];

  if (options.buildMode === "browser-wasm") {
    if (capabilities.includes("server.session") || capabilities.includes("native.loader")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_BROWSER_FORBIDDEN",
        message: "Browser WASM manifests cannot claim server or native loader capabilities.",
        source: "core",
        retryable: false,
      });
    }

    if (transports.includes("tcp") || transports.includes("quic")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_BROWSER_TRANSPORT_FORBIDDEN",
        message: "Browser WASM manifests cannot claim native TCP or QUIC transports.",
        source: "core",
        retryable: false,
      });
    }
  }

  if (options.buildMode === "backend-native") {
    if (transports.includes("websocket") || transports.includes("webtransport")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_NATIVE_TRANSPORT_FORBIDDEN",
        message: "Backend native manifests cannot claim browser transport slots without an explicit adapter.",
        source: "core",
        retryable: false,
      });
    }
  }
}
