export const NNRP_PROTOCOL_NAME = "NNRP";
export const NNRP_PROTOCOL_VERSION = "1.0.0";

export enum NnrpMessageType {
  ClientHello = 0x01,
  ServerHelloAck = 0x02,
  SessionPatch = 0x03,
  SessionPatchAck = 0x04,
  Close = 0x05,
  Error = 0x06,
  SessionOpen = 0x07,
  SessionOpenAck = 0x08,
  SessionClose = 0x09,
  SessionCloseAck = 0x0a,
  FrameSubmit = 0x10,
  FrameCancel = 0x11,
  ResultPush = 0x12,
  ResultDrop = 0x13,
  CachePut = 0x14,
  CacheAck = 0x15,
  CacheInvalidate = 0x16,
  FlowUpdate = 0x17,
  ResultHint = 0x18,
  TransportProbe = 0x19,
  TransportProbeAck = 0x1a,
  SessionMigrate = 0x1b,
  SessionMigrateAck = 0x1c,
  Ping = 0x20,
  Pong = 0x21,
  Cancel = 0x30,
  Abort = 0x31,
  PriorityUpdate = 0x32,
  Deadline = 0x33,
  ExpireAt = 0x34,
  Supersede = 0x35,
  BudgetUpdate = 0x36,
  Progress = 0x37,
  PartialResult = 0x38,
  Backpressure = 0x39,
  CreditUpdate = 0x3a,
  CapabilityNegotiation = 0x3b,
  DegradeProfile = 0x3c,
  RouteHint = 0x3d,
  ExecutionHint = 0x3e,
  TraceContext = 0x3f,
  ResultDropReason = 0x40,
  ObjectDeclare = 0x41,
  ObjectRef = 0x42,
  ObjectRelease = 0x43,
  ObjectPatch = 0x44,
  ObjectDelta = 0x45,
  CacheReference = 0x46,
  CacheMiss = 0x47,
  ErrorRecoverable = 0x48,
  RetryAfter = 0x49,
}

export type NnrpBuildMode = "backend-native" | "browser-wasm";

export type NnrpTransportKind = "tcp" | "quic" | "ipc" | "websocket";

export type NnrpTransportPolicy =
  | "auto"
  | "prefer-quic"
  | "prefer-tcp"
  | "prefer-ipc"
  | "prefer-websocket"
  | "force-quic"
  | "force-tcp"
  | "force-ipc"
  | "force-websocket";

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
  | "transport.ipc"
  | "transport.websocket"
  | "flow.update"
  | "result.hint"
  | "cache"
  | "schema"
  | "recovery"
  | "control.cancel_abort"
  | "control.supersede"
  | "control.priority_update"
  | "control.deadline_expire"
  | "control.progress_partial"
  | "control.credit_backpressure"
  | "control.capability_costs"
  | "control.route_execution_hint"
  | "control.trace_context"
  | "control.result_drop_reason"
  | "control.degrade_profile"
  | "control.budget_update"
  | "control.recoverable_error"
  | "control.retry_after"
  | "object.lifecycle"
  | "object.delta"
  | "object.cost"
  | "object.ownership"
  | "cache.reference";

const NNRP_CAPABILITY_TOKENS = new Set<NnrpCapability>([
  "client.session",
  "server.session",
  "native.loader",
  "wasm.loader",
  "transport.tcp",
  "transport.quic",
  "transport.ipc",
  "transport.websocket",
  "flow.update",
  "result.hint",
  "cache",
  "schema",
  "recovery",
  "control.cancel_abort",
  "control.supersede",
  "control.priority_update",
  "control.deadline_expire",
  "control.progress_partial",
  "control.credit_backpressure",
  "control.capability_costs",
  "control.route_execution_hint",
  "control.trace_context",
  "control.result_drop_reason",
  "control.degrade_profile",
  "control.budget_update",
  "control.recoverable_error",
  "control.retry_after",
  "object.lifecycle",
  "object.delta",
  "object.cost",
  "object.ownership",
  "cache.reference",
]);

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

export interface NnrpTransportEndpoint {
  readonly endpoint: string | URL;
}

const NNRP_DEFAULT_PORT = 4433;

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
    transports: ["websocket"],
    capabilities: ["client.session", "wasm.loader", ...capabilities],
  });
}

export function selectTransport(
  candidates: readonly NnrpTransportCandidate[],
  policy: NnrpTransportPolicy = "auto",
): NnrpTransportSelection {
  const annotatedCandidates = candidates
    .map((candidate) => annotateTransportCandidate(candidate, policy))
    .sort((left, right) => compareTransportCandidates(left, right, policy));
  const eligible = annotatedCandidates.filter((candidate) => candidate.rejectionReason === undefined);

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

export function parseApplicationEndpoint(endpoint: string | URL): URL {
  const raw = normalizeEndpointValue(endpoint);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (cause) {
    throw invalidApplicationEndpoint("NNRP application endpoint is malformed.", cause);
  }

  if (parsed.protocol !== "nnrp:" && parsed.protocol !== "nnrps:") {
    throw invalidApplicationEndpoint("NNRP application endpoint must use nnrp:// or nnrps://.");
  }
  if (parsed.hostname.length === 0) {
    throw invalidApplicationEndpoint("NNRP application endpoint requires an authority host.");
  }

  return parsed;
}

export function resolveProviderEndpoint(
  endpoint: string | URL,
  transport: NnrpTransportKind,
  providerEndpoint?: string | URL,
): string {
  const applicationEndpoint = parseApplicationEndpoint(endpoint);

  switch (transport) {
    case "tcp":
    case "quic":
      return providerEndpoint === undefined
        ? applicationHostPort(applicationEndpoint)
        : parseHostPortProviderEndpoint(providerEndpoint, transport);
    case "ipc":
      return parseIpcProviderEndpoint(providerEndpoint, transport);
    case "websocket":
      return parseWebsocketProviderEndpoint(applicationEndpoint, providerEndpoint, transport);
  }
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

  const forcedKind = forcedTransportKind(policy);
  if (forcedKind !== undefined && candidate.kind !== forcedKind) {
    return "policy-rejected";
  }

  return undefined;
}

function uniqueTransports(kinds: readonly NnrpTransportKind[]): readonly NnrpTransportKind[] {
  return [...new Set(kinds)].sort((left, right) => defaultTransportScore(right) - defaultTransportScore(left));
}

function defaultTransportScore(kind: NnrpTransportKind): number {
  switch (kind) {
    case "ipc":
      return 100;
    case "quic":
      return 90;
    case "tcp":
      return 80;
    case "websocket":
      return 70;
  }
}

function compareTransportCandidates(
  left: NnrpTransportCandidate,
  right: NnrpTransportCandidate,
  policy: NnrpTransportPolicy,
): number {
  const leftScore = left.score + transportPreferenceBonus(left.kind, policy);
  const rightScore = right.score + transportPreferenceBonus(right.kind, policy);
  return rightScore - leftScore ||
    transportPreferenceRank(left.kind, policy) - transportPreferenceRank(right.kind, policy) ||
    left.kind.localeCompare(right.kind);
}

function transportPreferenceBonus(kind: NnrpTransportKind, policy: NnrpTransportPolicy): number {
  const preferred = preferredTransportKind(policy);
  return preferred === kind ? 1_000 : 0;
}

function transportPreferenceRank(kind: NnrpTransportKind, policy: NnrpTransportPolicy): number {
  const preferred = preferredTransportKind(policy);
  if (preferred !== undefined) {
    return kind === preferred ? 0 : 1;
  }

  switch (kind) {
    case "ipc":
      return 0;
    case "quic":
      return 1;
    case "tcp":
      return 2;
    case "websocket":
      return 3;
  }
}

function preferredTransportKind(policy: NnrpTransportPolicy): NnrpTransportKind | undefined {
  switch (policy) {
    case "prefer-quic":
    case "force-quic":
      return "quic";
    case "prefer-tcp":
    case "force-tcp":
      return "tcp";
    case "prefer-ipc":
    case "force-ipc":
      return "ipc";
    case "prefer-websocket":
    case "force-websocket":
      return "websocket";
    case "auto":
      return undefined;
  }
}

function forcedTransportKind(policy: NnrpTransportPolicy): NnrpTransportKind | undefined {
  return policy.startsWith("force-") ? preferredTransportKind(policy) : undefined;
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

function normalizeEndpointValue(endpoint: string | URL): string {
  const value = endpoint instanceof URL ? endpoint.toString() : endpoint.trim();
  if (value.length === 0) {
    throw invalidApplicationEndpoint("NNRP application endpoint cannot be empty.");
  }
  return value;
}

function applicationHostPort(endpoint: URL): string {
  return `${endpoint.hostname}:${endpoint.port || NNRP_DEFAULT_PORT}`;
}

function parseHostPortProviderEndpoint(
  endpoint: string | URL,
  transport: Extract<NnrpTransportKind, "tcp" | "quic">,
): string {
  if (endpoint instanceof URL) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint must use host:port form.`);
  }

  const value = endpoint.trim();
  if (value.length === 0 || value.includes("://")) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint must use host:port form.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(`tcp://${value}`);
  } catch (cause) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint is malformed.`, cause);
  }

  if (
    parsed.hostname.length === 0 || parsed.port.length === 0 || parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    (parsed.pathname !== "" && parsed.pathname !== "/") || parsed.search.length > 0 || parsed.hash.length > 0
  ) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint must contain only host and port.`);
  }

  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint has an invalid port.`);
  }

  return `${parsed.hostname}:${port}`;
}

function parseIpcProviderEndpoint(
  endpoint: string | URL | undefined,
  transport: Extract<NnrpTransportKind, "ipc">,
): string {
  if (endpoint === undefined) {
    throw invalidProviderEndpoint(transport, "IPC selection requires an explicit unix:// or npipe:// endpoint.");
  }

  const value = endpoint instanceof URL ? endpoint.toString() : endpoint.trim();
  const scheme = value.startsWith("unix://") ? "unix://" : value.startsWith("npipe://") ? "npipe://" : undefined;
  if (scheme === undefined || value.slice(scheme.length).replace(/^\/+|\/+$/g, "").length === 0) {
    throw invalidProviderEndpoint(transport, "IPC provider endpoint must use unix:// or npipe:// with a locator.");
  }

  return value;
}

function parseWebsocketProviderEndpoint(
  applicationEndpoint: URL,
  endpoint: string | URL | undefined,
  transport: Extract<NnrpTransportKind, "websocket">,
): string {
  if (endpoint === undefined) {
    throw invalidProviderEndpoint(transport, "websocket selection requires an explicit ws:// or wss:// endpoint.");
  }

  let parsed: URL;
  try {
    parsed = endpoint instanceof URL ? new URL(endpoint.toString()) : new URL(endpoint.trim());
  } catch (cause) {
    throw invalidProviderEndpoint(transport, "websocket provider endpoint is malformed.", cause);
  }

  if ((parsed.protocol !== "ws:" && parsed.protocol !== "wss:") || parsed.hostname.length === 0) {
    throw invalidProviderEndpoint(transport, "websocket provider endpoint must use ws:// or wss://.");
  }
  if (
    (applicationEndpoint.protocol === "nnrps:" && parsed.protocol !== "wss:") ||
    (applicationEndpoint.protocol === "nnrp:" && parsed.protocol !== "ws:")
  ) {
    throw invalidProviderEndpoint(transport, "websocket provider endpoint must preserve application security intent.");
  }

  return parsed.toString();
}

function invalidApplicationEndpoint(message: string, cause?: unknown): NnrpProtocolError {
  return new NnrpProtocolError({
    code: "NNRP_APPLICATION_ENDPOINT_INVALID",
    message,
    source: "core",
    retryable: false,
    ...(cause === undefined ? {} : { cause }),
  });
}

function invalidProviderEndpoint(
  transport: NnrpTransportKind,
  message: string,
  cause?: unknown,
): NnrpTransportError {
  return new NnrpTransportError({
    code: "NNRP_PROVIDER_ENDPOINT_INVALID",
    message,
    source: "transport",
    retryable: false,
    transport,
    ...(cause === undefined ? {} : { cause }),
  });
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

  const unknownCapability = (capabilities as readonly string[]).find(
    (capability) => !NNRP_CAPABILITY_TOKENS.has(capability as NnrpCapability),
  );
  if (unknownCapability !== undefined) {
    throw new NnrpCapabilityError({
      code: "NNRP_CAPABILITY_UNKNOWN",
      message: `Capability manifest contains an unknown NNRP/1 capability token: ${unknownCapability}.`,
      source: "core",
      retryable: false,
    });
  }

  if (options.buildMode === "browser-wasm") {
    if (capabilities.includes("server.session") || capabilities.includes("native.loader")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_BROWSER_FORBIDDEN",
        message: "Browser WASM manifests cannot claim server or native loader capabilities.",
        source: "core",
        retryable: false,
      });
    }

    if (transports.some((transport) => transport !== "websocket")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_BROWSER_TRANSPORT_FORBIDDEN",
        message: "Browser WASM manifests can claim only the websocket transport.",
        source: "core",
        retryable: false,
      });
    }
  }
}
