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

export const NNRP_STANDARD_INPUT_PROFILES = ["tensor", "token", "structured_event", "tool_delta"] as const;

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

export type NnrpSessionMigrationEvent =
  | {
    readonly type: "migration-requested";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | {
    readonly type: "migration-accepted";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | {
    readonly type: "migration-rejected";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic: NnrpDiagnostic;
  };

export type NnrpRuntimeEvent =
  | {
    readonly type: "submit";
    readonly submit: NnrpNormalizedSubmitRequest;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | { readonly type: "result"; readonly result: NnrpResult; readonly sessionId?: string }
  | {
    readonly type: "flow-update";
    readonly update: NnrpFlowUpdateMetadata;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | {
    readonly type: "result-hint";
    readonly hint: NnrpResultHintMetadata;
    readonly sessionId?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | {
    readonly type: "drop";
    readonly frameId: number;
    readonly sessionId?: string;
    readonly diagnostic: NnrpDiagnostic;
  }
  | NnrpSessionMigrationEvent
  | { readonly type: "close"; readonly sessionId?: string; readonly diagnostic?: NnrpDiagnostic }
  | { readonly type: "diagnostic"; readonly sessionId?: string; readonly diagnostic: NnrpDiagnostic };

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
  addEventListener?(type: "abort", listener: () => void, options?: { readonly once?: boolean }): void;
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

export class NnrpResultDropError extends NnrpProtocolError {
  public readonly frameId: number;
  public readonly sessionId?: string;

  public constructor(event: Extract<NnrpRuntimeEvent, { readonly type: "drop" }>) {
    super(event.diagnostic);
    this.name = "NnrpResultDropError";
    this.frameId = event.frameId;
    if (event.sessionId !== undefined) {
      this.sessionId = event.sessionId;
    }
  }
}

export class NnrpRecoveryError extends NnrpCapabilityError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpRecoveryError";
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
  const annotatedCandidates = candidates.map((candidate) => annotateTransportCandidate(candidate, policy));
  const eligible = annotatedCandidates
    .filter((candidate) => candidate.rejectionReason === undefined)
    .sort((left, right) => right.score - left.score);

  return {
    selected: eligible[0] ?? null,
    candidates: annotatedCandidates,
    policy,
  };
}

export function createTransportCandidates(
  options: NnrpTransportCandidateOptions,
): readonly NnrpTransportCandidate[] {
  const kinds = uniqueTransports([...options.local.transports, ...options.peer.transports]);

  return kinds.map((kind) => ({
    kind,
    peerSupported: options.peer.transports.includes(kind),
    localAvailable: options.local.transports.includes(kind),
    score: options.scores?.[kind] ?? defaultTransportScore(kind),
  }));
}

export function createTransportSelectionSummary(
  selection: NnrpTransportSelection,
): NnrpTransportSelectionSummary {
  return {
    policy: selection.policy,
    selected: selection.selected?.kind ?? null,
    rejected: selection.candidates
      .filter((
        candidate,
      ): candidate is NnrpTransportCandidate & { readonly rejectionReason: NnrpTransportRejectionReason } =>
        candidate.rejectionReason !== undefined
      )
      .map((candidate) => ({
        kind: candidate.kind,
        reason: candidate.rejectionReason,
        score: candidate.score,
        ...(candidate.diagnostic === undefined ? {} : { diagnostic: candidate.diagnostic }),
      })),
    candidates: [...selection.candidates],
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

export function normalizeCachePutRequest(request: NnrpCachePutRequest): NnrpCachePutRequest {
  validateCacheKey(request.key);
  validateLeaseMillis(request.leaseMillis);

  return {
    key: createCacheKey(request.key.kind, request.key.key, request.key.namespaceId),
    ...(request.payload === undefined ? {} : { payload: normalizeBinaryPayload(request.payload, true) }),
    ...(request.descriptor === undefined ? {} : { descriptor: createPayloadDescriptor(request.descriptor) }),
    ...(request.leaseMillis === undefined ? {} : { leaseMillis: request.leaseMillis }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

export function normalizeCacheInvalidateRequest(
  request: NnrpCacheInvalidateRequest,
): NnrpCacheInvalidateRequest {
  validateCacheKey(request.key);

  return {
    key: createCacheKey(request.key.kind, request.key.key, request.key.namespaceId),
    ...(request.version === undefined ? {} : { version: request.version }),
    ...(request.recursive === undefined ? {} : { recursive: request.recursive }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
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
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
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

export function createRecoveryToken(
  token: string | NnrpBinaryPayload,
  metadata?: Readonly<Record<string, string>>,
): NnrpRecoveryToken {
  const normalized = typeof token === "string" ? token : normalizeBinaryPayload(token, true);
  validateRecoveryToken({ token: normalized, ...(metadata === undefined ? {} : { metadata }) });

  return {
    token: normalized,
    ...(metadata === undefined ? {} : { metadata: normalizeMetadataMap(metadata) }),
  };
}

export function normalizeSessionMigrationRequest(request: NnrpSessionMigrationRequest): NnrpSessionMigrationRequest {
  validateRecoveryToken(request.recoveryToken);
  if (request.metadata !== undefined) {
    normalizeMetadataMap(request.metadata);
  }

  return {
    recoveryToken: createRecoveryToken(request.recoveryToken.token, request.recoveryToken.metadata),
    ...(request.targetEndpoint === undefined ? {} : { targetEndpoint: request.targetEndpoint }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

export function throwIfResultDrop(event: NnrpRuntimeEvent): void {
  if (event.type === "drop") {
    throw new NnrpResultDropError(event);
  }
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

  if (options.signal?.aborted) {
    throw new NnrpTimeoutError({
      code: "NNRP_EVENT_POLL_CANCELLED",
      message: "Event polling was cancelled.",
      source: "runtime",
      retryable: false,
      cause: options.signal.reason,
    });
  }
}

export function validateSessionMetadata(options: NnrpSessionMetadataOptions = {}): void {
  if (options.metadata !== undefined) {
    normalizeMetadataMap(options.metadata);
  }
}

export function normalizeSessionPatchRequest(request: NnrpSessionPatchRequest): NnrpSessionPatchRequest {
  if (request.inputProfile !== undefined) {
    validateInputProfile(request.inputProfile, true);
  }

  if (request.targetCadence !== undefined && (!Number.isFinite(request.targetCadence) || request.targetCadence < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_SESSION_TARGET_CADENCE_INVALID",
      message: "Session targetCadence must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }

  if (request.qualityTier !== undefined && (!Number.isSafeInteger(request.qualityTier) || request.qualityTier < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_SESSION_QUALITY_TIER_INVALID",
      message: "Session qualityTier must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }

  if (
    request.initialCredits !== undefined && (!Number.isFinite(request.initialCredits) || request.initialCredits < 0)
  ) {
    throw new NnrpProtocolError({
      code: "NNRP_SESSION_INITIAL_CREDITS_INVALID",
      message: "Session initialCredits must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }

  return {
    ...(request.inputProfile === undefined ? {} : { inputProfile: request.inputProfile }),
    ...(request.targetCadence === undefined ? {} : { targetCadence: request.targetCadence }),
    ...(request.qualityTier === undefined ? {} : { qualityTier: request.qualityTier }),
    ...(request.submitCapacityPolicy === undefined ? {} : { submitCapacityPolicy: request.submitCapacityPolicy }),
    ...(request.initialCredits === undefined ? {} : { initialCredits: request.initialCredits }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

function annotateTransportCandidate(
  candidate: NnrpTransportCandidate,
  policy: NnrpTransportPolicy,
): NnrpTransportCandidate {
  const rejectionReason = transportRejectionReason(candidate, policy);
  if (rejectionReason === undefined && candidate.rejectionReason === undefined) {
    return { ...candidate };
  }

  const reason = candidate.rejectionReason ?? rejectionReason;
  return {
    ...candidate,
    ...(reason === undefined ? {} : { rejectionReason: reason }),
  };
}

function transportRejectionReason(
  candidate: NnrpTransportCandidate,
  policy: NnrpTransportPolicy,
): NnrpTransportRejectionReason | undefined {
  if (candidate.rejectionReason !== undefined) {
    return candidate.rejectionReason;
  }

  if (!candidate.peerSupported || !candidate.localAvailable) {
    return candidate.peerSupported ? "local-unavailable" : "peer-unsupported";
  }

  if (policy === "tcp-only") {
    return candidate.kind === "tcp" ? undefined : "policy-rejected";
  }

  if (policy === "quic-only") {
    return candidate.kind === "quic" ? undefined : "policy-rejected";
  }

  return undefined;
}

function uniqueTransports(kinds: readonly NnrpTransportKind[]): readonly NnrpTransportKind[] {
  return [...new Set(kinds)].sort((left, right) => defaultTransportScore(right) - defaultTransportScore(left));
}

function defaultTransportScore(kind: NnrpTransportKind): number {
  switch (kind) {
    case "webtransport":
      return 90;
    case "quic":
      return 80;
    case "websocket":
      return 70;
    case "tcp":
      return 60;
  }
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
  validateLeaseMillis(metadata.leaseMillis);

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

  if (request.metadata !== undefined) {
    normalizeMetadataMap(request.metadata);
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

function validateRecoveryToken(token: NnrpRecoveryToken): void {
  if (typeof token.token === "string") {
    if (token.token.trim().length === 0 || token.token.length > 4096) {
      throw new NnrpProtocolError({
        code: "NNRP_RECOVERY_TOKEN_INVALID",
        message: "Recovery token strings must be non-empty and at most 4096 characters.",
        source: "core",
        retryable: false,
      });
    }
  } else if (token.token.byteLength === 0 || token.token.byteLength > 4096) {
    throw new NnrpProtocolError({
      code: "NNRP_RECOVERY_TOKEN_INVALID",
      message: "Recovery token payloads must be non-empty and at most 4096 bytes.",
      source: "core",
      retryable: false,
    });
  }

  if (token.metadata !== undefined) {
    normalizeMetadataMap(token.metadata);
  }
}

function validateLeaseMillis(leaseMillis: number | undefined): void {
  if (leaseMillis !== undefined && (!Number.isSafeInteger(leaseMillis) || leaseMillis < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_LEASE_INVALID",
      message: "Cache leaseMillis must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }
}

function normalizeMetadataMap(metadata: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const entries = Object.entries(metadata);
  if (entries.length > 32) {
    throw new NnrpProtocolError({
      code: "NNRP_METADATA_TOO_MANY_ENTRIES",
      message: "Metadata maps must contain at most 32 entries.",
      source: "core",
      retryable: false,
    });
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (key.trim().length === 0 || key.length > 64) {
      throw new NnrpProtocolError({
        code: "NNRP_METADATA_KEY_INVALID",
        message: "Metadata keys must be non-empty and at most 64 characters.",
        source: "core",
        retryable: false,
      });
    }

    if (value.length > 1024) {
      throw new NnrpProtocolError({
        code: "NNRP_METADATA_VALUE_INVALID",
        message: "Metadata values must be at most 1024 characters.",
        source: "core",
        retryable: false,
      });
    }

    normalized[key] = value;
  }

  return normalized;
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
