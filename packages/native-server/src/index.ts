import {
  type CacheInvalidateMetadata,
  type CacheMissMetadata,
  type CacheReferenceMetadata,
  createCapabilityManifest,
  createTransportCandidates,
  createTransportSelectionSummary,
  decodeNnrpRuntimeEvent,
  encodeCacheInvalidateMetadata,
  encodeResultPushPayload,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  encodeRuntimeObjectMetadataSegments,
  type NnrpAbortSignalLike,
  type NnrpCapability,
  NnrpCapabilityError,
  type NnrpCapabilityManifest,
  type NnrpDiagnostic,
  type NnrpEventPollOptions,
  NnrpMessageType,
  type NnrpOperationLifecycleEvent,
  type NnrpOperationState,
  NnrpProtocolError,
  type NnrpResultPushMetadata,
  type NnrpRuntimeEvent,
  type NnrpRuntimeFrameHeader,
  type NnrpSchemaDescriptorHeader,
  NnrpSchemaRegistry,
  type NnrpServerProviderRoutes,
  type NnrpSessionOpenMetadata,
  NnrpStandardProfile,
  NnrpTimeoutError,
  type NnrpTransportCandidate,
  type NnrpTransportCandidateReadiness,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  type NnrpTransportProbeMetrics,
  type NnrpTransportProbeObservation,
  type NnrpTransportProbeOptions,
  type NnrpTransportProvider,
  type NnrpTransportRejectionReason,
  type NnrpTransportSelectionSummary,
  type NnrpTransportServer,
  type NnrpTransportServerSecurity,
  type ObjectDeltaMetadata,
  type ObjectDescriptorMetadata,
  type ObjectReferenceMetadata,
  type ObjectReleaseMetadata,
  ObjectReleaseReason,
  OwnershipHint,
  parseApplicationEndpoint,
  type PartialResultMetadata,
  type PressureMetadata,
  type ProgressMetadata,
  type RecoverableErrorMetadata,
  resolveProviderEndpoint,
  type ResultDropReasonMetadata,
  type RetryAfterMetadata,
  type RuntimeControlMetadata,
  RuntimeRole,
  selectTransport,
  tokenDeltaSchemaDescriptor,
  type TraceContextMetadata,
  validateEventPollOptions,
} from "@nnrp/core";

const EXPECTED_PROTOCOL_MAJOR = 1;
const EMPTY_PAYLOAD = new Uint8Array();

type RuntimeObjectSendMetadata =
  | ObjectDescriptorMetadata
  | ObjectReferenceMetadata
  | ObjectReleaseMetadata
  | ObjectDeltaMetadata
  | CacheReferenceMetadata
  | CacheMissMetadata;

interface TrackedRuntimeObject {
  readonly descriptor: ObjectDescriptorMetadata;
  readonly operations: Set<bigint>;
  readonly releasedOperations: Set<bigint>;
  objectVersion?: bigint;
  deltaSequence?: bigint;
  released: boolean;
}

class RuntimeObjectLifecycle {
  readonly #objects = new Map<bigint, TrackedRuntimeObject>();

  public validate(messageType: NnrpMessageType, metadata: RuntimeObjectSendMetadata): void {
    if (messageType === NnrpMessageType.ObjectDeclare) {
      const declaration = metadata as ObjectDescriptorMetadata;
      const existing = this.#objects.get(declaration.objectId);
      if (existing !== undefined && !existing.released) {
        throw objectLifecycleError(declaration.objectId, "is already declared");
      }
      return;
    }
    if (messageType === NnrpMessageType.ObjectRef) {
      const reference = metadata as ObjectReferenceMetadata;
      const object = this.#active(reference.objectId);
      if (reference.operationId !== 0n && object.releasedOperations.has(reference.operationId)) {
        throw objectLifecycleError(reference.objectId, `was already released by operation ${reference.operationId}`);
      }
      if (object.objectVersion !== undefined && reference.objectVersion < object.objectVersion) {
        throw objectLifecycleError(
          reference.objectId,
          `version ${reference.objectVersion} is older than ${object.objectVersion}`,
        );
      }
      return;
    }
    if (messageType === NnrpMessageType.ObjectPatch || messageType === NnrpMessageType.ObjectDelta) {
      const delta = metadata as ObjectDeltaMetadata;
      const object = this.#active(delta.objectId);
      if (object.deltaSequence !== undefined && delta.deltaSequence <= object.deltaSequence) {
        throw objectLifecycleError(
          delta.objectId,
          `delta sequence ${delta.deltaSequence} does not advance ${object.deltaSequence}`,
        );
      }
      return;
    }
    if (messageType === NnrpMessageType.ObjectRelease) {
      const release = metadata as ObjectReleaseMetadata;
      const object = this.#active(release.objectId);
      if (release.operationId !== 0n && object.releasedOperations.has(release.operationId)) {
        throw objectLifecycleError(release.objectId, `was already released by operation ${release.operationId}`);
      }
    }
  }

  public commit(messageType: NnrpMessageType, metadata: RuntimeObjectSendMetadata): void {
    if (messageType === NnrpMessageType.ObjectDeclare) {
      const descriptor = metadata as ObjectDescriptorMetadata;
      this.#objects.set(descriptor.objectId, {
        descriptor,
        operations: new Set(),
        releasedOperations: new Set(),
        released: false,
      });
      return;
    }
    if (messageType === NnrpMessageType.ObjectRef) {
      const reference = metadata as ObjectReferenceMetadata;
      const object = this.#active(reference.objectId);
      object.objectVersion = reference.objectVersion;
      if (reference.operationId !== 0n) object.operations.add(reference.operationId);
      return;
    }
    if (messageType === NnrpMessageType.ObjectPatch || messageType === NnrpMessageType.ObjectDelta) {
      const delta = metadata as ObjectDeltaMetadata;
      this.#active(delta.objectId).deltaSequence = delta.deltaSequence;
      return;
    }
    if (messageType === NnrpMessageType.ObjectRelease) {
      const release = metadata as ObjectReleaseMetadata;
      const object = this.#active(release.objectId);
      if (release.operationId === 0n || object.descriptor.ownershipHint === OwnershipHint.ReleaseOnDrop) {
        object.released = true;
        object.operations.clear();
      } else {
        object.operations.delete(release.operationId);
        object.releasedOperations.add(release.operationId);
      }
    }
  }

  public releaseOnDropObjectIds(operationId: bigint): readonly bigint[] {
    const objectIds: bigint[] = [];
    for (const [objectId, object] of this.#objects) {
      if (
        !object.released && object.descriptor.ownershipHint === OwnershipHint.ReleaseOnDrop &&
        object.operations.has(operationId)
      ) {
        objectIds.push(objectId);
      }
    }
    return objectIds.sort(compareBigInt);
  }

  public clear(): void {
    this.#objects.clear();
  }

  #active(objectId: bigint): TrackedRuntimeObject {
    const object = this.#objects.get(objectId);
    if (object === undefined) throw objectLifecycleError(objectId, "has not been declared");
    if (object.released) throw objectLifecycleError(objectId, "was already released");
    return object;
  }
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function objectLifecycleError(objectId: bigint, detail: string): NnrpProtocolError {
  return new NnrpProtocolError({
    code: "NNRP_OBJECT_LIFECYCLE_INVALID",
    message: `Runtime object ${objectId} ${detail}.`,
    source: "protocol",
    retryable: false,
  });
}
const EXPECTED_PROTOCOL_WIRE_FORMAT = 0;
const EXPECTED_ABI_MAJOR = 4;
const EXPECTED_ABI_MINOR = 4;
const EXPECTED_ABI_PATCH = 0;
const NATIVE_RUNTIME_CAPABILITIES = [
  "cache",
  "schema",
  "recovery",
  "flow.update",
  "result.hint",
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
  "object.lifecycle",
  "object.delta",
  "object.cost",
  "object.ownership",
  "cache.reference",
] as const;
const RUNTIME_FEATURE_PROTOCOL_CORE = 0x0000000000000001n;
const RUNTIME_FEATURE_SERVER_API = 0x0000000000000004n;
const RUNTIME_FEATURE_EVENT_POLLING = 0x0000000000000008n;
const RUNTIME_FEATURE_CALLBACK_DISPATCH = 0x0000000000000010n;
const RUNTIME_FEATURE_CACHE_SCHEMA = 0x0000000000000020n;
const RUNTIME_FEATURE_RECOVERY = 0x0000000000000040n;
const RUNTIME_FEATURE_TYPED_PAYLOAD = 0x0000000000000080n;
const RUNTIME_FEATURE_TRANSPORT_SLOTS = 0x0000000000000100n;
const RUNTIME_FEATURE_BATCH_POLLING = 0x0000000000000200n;
const RUNTIME_FEATURE_CACHE_LEASE_OPS = 0x0000000000000400n;
const RUNTIME_FEATURE_SCHEMA_REGISTRY_HANDLES = 0x0000000000000800n;
const RUNTIME_FEATURE_BUFFER_HANDLES = 0x0000000000001000n;
const RUNTIME_FEATURE_EXECUTABLE_RESUME = 0x0000000000002000n;
const RUNTIME_FEATURE_PREVIEW4_RUNTIME_FRAME_SEND = 0x0000000000080000n;
const REQUIRED_RUNTIME_FEATURES = RUNTIME_FEATURE_PROTOCOL_CORE |
  RUNTIME_FEATURE_SERVER_API |
  RUNTIME_FEATURE_EVENT_POLLING |
  RUNTIME_FEATURE_CALLBACK_DISPATCH |
  RUNTIME_FEATURE_CACHE_SCHEMA |
  RUNTIME_FEATURE_RECOVERY |
  RUNTIME_FEATURE_TYPED_PAYLOAD |
  RUNTIME_FEATURE_TRANSPORT_SLOTS |
  RUNTIME_FEATURE_BATCH_POLLING |
  RUNTIME_FEATURE_CACHE_LEASE_OPS |
  RUNTIME_FEATURE_SCHEMA_REGISTRY_HANDLES |
  RUNTIME_FEATURE_BUFFER_HANDLES |
  RUNTIME_FEATURE_EXECUTABLE_RESUME |
  RUNTIME_FEATURE_PREVIEW4_RUNTIME_FRAME_SEND;
const SERVER_ROLE_ADOPT = Symbol.for("nnrp.internal.native.server-role-adopt.v1");
const NATIVE_ROLE_IDS = Symbol.for("nnrp.internal.native.role-handle-ids.v1");
const EVENT_KIND_SUBMIT_ACCEPTED = 5;
const EVENT_KIND_OPERATION_LIFECYCLE = 14;

const serverRoleSessionClosers = new WeakMap<NnrpBackendRuntime, (routingKey: string) => Promise<void>>();
const serverAcceptors = new WeakMap<
  NnrpServer,
  (options: NnrpServerAcceptOptions) => Promise<InternalServerSessionRegistration>
>();
const serverClosers = new WeakMap<NnrpServer, () => Promise<void>>();
const serverBoundProviderEndpoints = new WeakMap<
  NnrpServer,
  Readonly<Partial<Record<NnrpTransportKind, string>>>
>();
const serverRoleEventReceivers = new WeakMap<
  NnrpBackendRuntime,
  (routingKey: string, request: NnrpNativeServerReceiveRequest) => Promise<InternalDecodedServerRoleEvent>
>();
const serverRoleFrameSenders = new WeakMap<
  NnrpBackendRuntime,
  (routingKey: string, request: NnrpNativeRuntimeFrameSendRequest) => Promise<void>
>();
const serverOperationFrameSenders = new WeakMap<
  NnrpBackendRuntime,
  (
    routingKey: string,
    operation: InternalNativeHandle,
    request: NnrpNativeRuntimeFrameSendRequest,
  ) => Promise<void>
>();
const serverOperationResultSenders = new WeakMap<
  NnrpBackendRuntime,
  (
    routingKey: string,
    operation: InternalNativeHandle,
    metadata: NnrpResultPushMetadata,
    body: Uint8Array,
  ) => Promise<void>
>();

interface InternalNativeHandle {
  readonly kind: number;
  readonly id: bigint | number;
  readonly generation: number;
  readonly flags: number;
}

interface InternalRoleEvent {
  readonly kind: number;
  readonly headerPresent: boolean;
  readonly messageType: number;
  readonly versionMajor: number;
  readonly wireFormat: number;
  readonly headerFlags: number;
  readonly wireSessionId: number;
  readonly connection: InternalNativeHandle;
  readonly session: InternalNativeHandle;
  readonly operation: InternalNativeHandle;
  readonly relatedOperationId: bigint;
  readonly relatedFrameId: number;
  readonly frameId: number;
  readonly viewId: number;
  readonly routeId: number;
  readonly traceId: bigint;
  readonly payload: Uint8Array;
}

type InternalDecodedServerRoleEvent =
  | {
    readonly type: "runtime";
    readonly event: NnrpRuntimeEvent;
    readonly operation?: InternalNativeHandle;
  }
  | { readonly type: "lifecycle"; readonly event: NnrpOperationLifecycleEvent };

interface InternalServerRoleSession {
  readonly handle: InternalNativeHandle;
  readonly sessionId: number;
  poll(maxEvents: number, timeoutMillis: number): Promise<readonly InternalRoleEvent[]>;
  sendResult(operation: InternalNativeHandle, payload: Uint8Array): Promise<void>;
  sendRuntimeFrame(
    handle: InternalNativeHandle,
    messageType: number,
    frameId: number,
    payload: Uint8Array,
  ): Promise<void>;
  close(): Promise<void>;
}

interface InternalTransportServerRole {
  accept(sessionHandleId: bigint, generation: number, timeoutMillis: number): Promise<InternalServerRoleSession>;
  close(): Promise<void>;
}

interface InternalServerRoleOptions {
  readonly supportedProfiles: readonly number[];
  readonly supportedCacheObjects: readonly number[];
  readonly maxCacheObjects: bigint;
  readonly maxCacheObjectBytes: number;
  readonly schemaDescriptors: readonly NnrpSchemaDescriptorHeader[];
  readonly resumeTokenBytes: number;
  readonly maxInFlightOperations: number;
  readonly grantedOperationCredit: number;
  readonly leaseTtlMs: number;
  readonly resumeWindowMs: number;
  readonly evaluateSession?: (open: NnrpSessionOpenMetadata) => Promise<NnrpServerSessionPolicyDecision>;
}

interface InternalAcceptedServerRoleSession {
  readonly session: InternalServerRoleSession;
  readonly activeTransport: NnrpTransportKind;
}

interface InternalServerRole {
  readonly boundProviderEndpoints: Readonly<Partial<Record<NnrpTransportKind, string>>>;
  accept(
    sessionHandleId: bigint,
    generation: number,
    timeoutMillis: number,
  ): Promise<InternalAcceptedServerRoleSession>;
  close(): Promise<void>;
}

interface InternalServerRoleEntry {
  readonly kind: NnrpTransportKind;
  readonly endpoint: string;
  readonly role: InternalTransportServerRole;
  pending: Promise<void> | undefined;
  settlement: InternalServerRoleSettlement | undefined;
}

interface InternalServerRoleSettlement {
  readonly session?: InternalServerRoleSession;
  readonly error?: unknown;
}

interface InternalServerRoleWaiter {
  readonly resolve: (session: InternalAcceptedServerRoleSession) => void;
  readonly reject: (error: unknown) => void;
}

class InternalServerRoleGroup implements InternalServerRole {
  readonly #entries: InternalServerRoleEntry[];
  readonly #waiters: InternalServerRoleWaiter[] = [];
  readonly #sessionHandleIds: bigint[] = [];
  readonly boundProviderEndpoints: Readonly<Partial<Record<NnrpTransportKind, string>>>;
  #terminalError: unknown;
  #closed = false;

  public constructor(entries: readonly Omit<InternalServerRoleEntry, "pending" | "settlement">[]) {
    this.#entries = entries.map((entry) => ({ ...entry, pending: undefined, settlement: undefined }));
    this.boundProviderEndpoints = Object.freeze(
      Object.fromEntries(entries.map((entry) => [entry.kind, entry.endpoint])) as Partial<
        Record<NnrpTransportKind, string>
      >,
    );
  }

  public accept(
    sessionHandleId: bigint,
    generation: number,
    timeoutMillis: number,
  ): Promise<InternalAcceptedServerRoleSession> {
    if (this.#terminalError !== undefined) return Promise.reject(this.#terminalError);
    if (this.#closed) return Promise.reject(closedError("server listener"));
    this.#sessionHandleIds.push(sessionHandleId);
    return new Promise((resolve, reject) => {
      this.#waiters.push({ resolve, reject });
      this.#drain(generation, timeoutMillis);
    });
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const error = closedError("server listener");
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
    const readySessions = this.#entries.flatMap(({ settlement }) =>
      settlement?.session === undefined ? [] : [settlement.session]
    );
    for (const entry of this.#entries) entry.settlement = undefined;
    await Promise.all([
      ...readySessions.map(async (session) => await session.close()),
      ...this.#entries.map(async ({ role }) => await role.close()),
    ]);
    await Promise.allSettled(this.#entries.flatMap(({ pending }) => pending === undefined ? [] : [pending]));
  }

  #drain(generation: number, timeoutMillis: number): void {
    while (this.#waiters.length > 0) {
      const readyEntry = this.#entries.find((entry) => entry.settlement !== undefined);
      if (readyEntry === undefined) break;
      const waiter = this.#waiters.shift()!;
      const settlement = readyEntry.settlement!;
      readyEntry.settlement = undefined;
      if (settlement.session !== undefined) {
        waiter.resolve({ session: settlement.session, activeTransport: readyEntry.kind });
      } else waiter.reject(settlement.error);
    }
    if (this.#waiters.length === 0 || this.#closed) return;
    for (const entry of this.#entries) {
      if (entry.pending !== undefined) continue;
      const handleId = this.#sessionHandleIds.shift() ?? allocateNativeRoleId("session");
      const pending = entry.role.accept(handleId, generation, timeoutMillis).then(
        async (session) => {
          if (this.#closed) {
            await session.close();
            return;
          }
          entry.settlement = { session };
        },
        (error) => {
          if (this.#closed) return;
          if (isTerminalListenerError(error)) {
            void this.#fail(error);
            return;
          }
          entry.settlement = { error };
        },
      ).finally(() => {
        if (entry.pending === pending) entry.pending = undefined;
        queueMicrotask(() => this.#drain(generation, timeoutMillis));
      });
      entry.pending = pending;
    }
  }

  async #fail(error: unknown): Promise<void> {
    if (this.#terminalError !== undefined || this.#closed) return;
    this.#terminalError = error;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
    await this.close();
  }
}

interface InternalServerRoleCarrier {
  [SERVER_ROLE_ADOPT](
    serverId: bigint,
    generation: number,
    options: InternalServerRoleOptions,
  ): Promise<InternalTransportServerRole>;
}

interface NativeRoleIdState {
  connection: bigint;
  session: bigint;
}

export interface NnrpNativeRuntimeCapabilities {
  readonly abiMajor: number;
  readonly abiMinor: number;
  readonly abiPatch: number;
  readonly protocolMajor: number;
  readonly protocolWireFormat: number;
  readonly sdkMajor: number;
  readonly sdkMinor: number;
  readonly sdkPatch: number;
  readonly sdkChannel: number;
  readonly sdkRevision: number;
  readonly transportSlots: number;
  readonly featureFlags: bigint;
}

export interface NnrpNativeRuntimeFrameSendRequest {
  readonly sessionId: number;
  readonly messageType: NnrpMessageType;
  readonly frameId: number;
  readonly payload: Uint8Array;
}

export interface NnrpNativeAcceptRequest {
  readonly endpoint: string;
  readonly providerRoutes?: NnrpServerProviderRoutes;
  readonly transportPolicy: NnrpTransportPolicy;
  readonly sessionDefaults: NnrpServerSessionOptions;
  readonly acceptOptions: NnrpServerAcceptOptions;
}

export interface NnrpNativeAcceptedSession {
  readonly sessionId: number;
  readonly activeTransport: NnrpTransportKind;
}

interface InternalServerSessionRegistration extends NnrpNativeAcceptedSession {
  readonly routingKey: string;
}

export interface NnrpNativeServerReceiveRequest {
  readonly sessionId: number;
  readonly timeoutMillis?: number;
}

export interface NnrpNativeFfiBinding {
  readonly mode?: "native-addon" | "node-ffi" | "deno-ffi" | "nano-ffi" | "test";
  runtimeCapabilities?(): NnrpNativeRuntimeCapabilities | Promise<NnrpNativeRuntimeCapabilities>;
  sendRuntimeFrame?(request: NnrpNativeRuntimeFrameSendRequest): void | Promise<void>;
  accept?(
    request: NnrpNativeAcceptRequest,
  ): NnrpNativeAcceptedSession | void | Promise<NnrpNativeAcceptedSession | void>;
  receive?(request: NnrpNativeServerReceiveRequest): NnrpRuntimeEvent | Promise<NnrpRuntimeEvent>;
  close?(): void | Promise<void>;
}

export interface NnrpBackendRuntimeOptions {
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly ffi?: NnrpNativeFfiBinding;
}

export interface NnrpServerSessionPolicyDecision {
  readonly accepted: boolean;
  readonly sessionErrorCode: number;
  readonly diagnostic?: string;
}

export interface NnrpServerSessionPolicy {
  evaluate(open: NnrpSessionOpenMetadata): Promise<NnrpServerSessionPolicyDecision>;
}

export interface NnrpServerSessionOptions {
  readonly supportedProfiles?: readonly number[];
  readonly supportedCacheObjects?: readonly number[];
  readonly maxCacheObjects?: bigint;
  readonly maxCacheObjectBytes?: number;
  readonly schemaRegistry?: NnrpSchemaRegistry;
  readonly resumeTokenBytes?: number;
  readonly maxInFlightOperations?: number;
  readonly grantedOperationCredit?: number;
  readonly leaseTtlMs?: number;
  readonly resumeWindowMs?: number;
  readonly applicationPolicy?: NnrpServerSessionPolicy;
}

export interface NnrpServerAcceptOptions {
  readonly timeoutMs?: number;
}

export interface NnrpListenOptions {
  readonly endpoint: string | URL;
  readonly providerRoutes?: NnrpServerProviderRoutes;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpServerSessionOptions;
}

interface NormalizedServerSessionOptions extends InternalServerRoleOptions {
  readonly schemaRegistry: NnrpSchemaRegistry;
  readonly applicationPolicy: NnrpServerSessionPolicy;
}

const ACCEPT_VALID_SERVER_SESSIONS: NnrpServerSessionPolicy = Object.freeze({
  evaluate: () => Promise.resolve({ accepted: true, sessionErrorCode: 0 }),
});

function normalizeServerSessionOptions(options: NnrpServerSessionOptions = {}): NormalizedServerSessionOptions {
  const supportedProfiles = Object.freeze([...(options.supportedProfiles ?? [NnrpStandardProfile.Token])]);
  const supportedCacheObjects = Object.freeze([...(options.supportedCacheObjects ?? [])]);
  const maxCacheObjects = options.maxCacheObjects ?? 0n;
  const maxCacheObjectBytes = options.maxCacheObjectBytes ?? 0;
  const schemaRegistry = options.schemaRegistry ?? new NnrpSchemaRegistry([tokenDeltaSchemaDescriptor()]);
  const resumeTokenBytes = options.resumeTokenBytes ?? 24;
  const maxInFlightOperations = options.maxInFlightOperations ?? 4;
  const grantedOperationCredit = options.grantedOperationCredit ?? 2;
  const leaseTtlMs = options.leaseTtlMs ?? 30_000;
  const resumeWindowMs = options.resumeWindowMs ?? 120_000;
  const applicationPolicy = options.applicationPolicy ?? ACCEPT_VALID_SERVER_SESSIONS;

  if (supportedProfiles.length === 0) throw new RangeError("supportedProfiles must not be empty");
  for (const profile of supportedProfiles) boundedInteger("supportedProfiles", profile, 0xffff);
  for (const objectKind of supportedCacheObjects) boundedInteger("supportedCacheObjects", objectKind, 0xffff_ffff);
  if (maxCacheObjects < 0n || maxCacheObjects > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError("maxCacheObjects must fit in u64");
  }
  boundedInteger("maxCacheObjectBytes", maxCacheObjectBytes, 0xffff_ffff);
  boundedInteger("resumeTokenBytes", resumeTokenBytes, 0xffff_ffff);
  boundedInteger("maxInFlightOperations", maxInFlightOperations, 0xffff, 1);
  boundedInteger("grantedOperationCredit", grantedOperationCredit, maxInFlightOperations);
  boundedInteger("leaseTtlMs", leaseTtlMs, 0xffff_ffff);
  boundedInteger("resumeWindowMs", resumeWindowMs, 0xffff_ffff);
  if (!(schemaRegistry instanceof NnrpSchemaRegistry)) {
    throw new TypeError("schemaRegistry must be NnrpSchemaRegistry");
  }
  if (typeof applicationPolicy.evaluate !== "function") {
    throw new TypeError("applicationPolicy must implement evaluate(open)");
  }

  return Object.freeze({
    supportedProfiles,
    supportedCacheObjects,
    maxCacheObjects,
    maxCacheObjectBytes,
    schemaRegistry,
    schemaDescriptors: schemaRegistry.snapshot(),
    resumeTokenBytes,
    maxInFlightOperations,
    grantedOperationCredit,
    leaseTtlMs,
    resumeWindowMs,
    applicationPolicy,
    ...(applicationPolicy === ACCEPT_VALID_SERVER_SESSIONS ? {} : {
      evaluateSession: async (open: NnrpSessionOpenMetadata) =>
        validateServerPolicyDecision(await applicationPolicy.evaluate(open)),
    }),
  });
}

function validateServerPolicyDecision(decision: NnrpServerSessionPolicyDecision): NnrpServerSessionPolicyDecision {
  if (typeof decision !== "object" || decision === null || typeof decision.accepted !== "boolean") {
    throw new TypeError("applicationPolicy.evaluate(open) must return a policy decision");
  }
  boundedInteger("sessionErrorCode", decision.sessionErrorCode, 0xffff_ffff);
  if (decision.accepted !== (decision.sessionErrorCode === 0)) {
    throw new RangeError("accepted policy decisions require error code zero and rejections require a non-zero code");
  }
  if (decision.diagnostic !== undefined && typeof decision.diagnostic !== "string") {
    throw new TypeError("policy decision diagnostic must be a string");
  }
  return Object.freeze({ ...decision });
}

function normalizeServerAcceptOptions(options: NnrpServerAcceptOptions = {}): Required<NnrpServerAcceptOptions> {
  return Object.freeze({ timeoutMs: boundedInteger("timeoutMs", options.timeoutMs ?? 0, 0xffff_ffff) });
}

function boundedInteger(name: string, value: number, maximum: number, minimum = 0): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export interface NnrpNativeTransportProvider extends NnrpTransportProvider {
  readonly kind: NnrpTransportKind;
  probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
  listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}

export interface NnrpTransportSelectionOptions {
  readonly peerManifest: NnrpCapabilityManifest;
  readonly providers?: readonly NnrpNativeTransportProvider[];
  readonly policy?: NnrpTransportPolicy;
  readonly requestedMaxFrameBytes?: bigint;
  readonly candidateReadiness: readonly NnrpTransportCandidateReadiness[];
  readonly probeObservations?: readonly NnrpTransportProbeObservation[];
}

export interface NnrpNativeRuntimeBinding {
  readonly manifest: NnrpCapabilityManifest;
  readonly ffi?: NnrpNativeFfiBinding;
  readonly runtimeCapabilities?: NnrpNativeRuntimeCapabilities;
}

export class NnrpNativeBindingUnavailableError extends NnrpCapabilityError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpNativeBindingUnavailableError";
  }
}

export async function openBackendRuntime(options: NnrpBackendRuntimeOptions = {}): Promise<NnrpBackendRuntime> {
  const transportProviders = options.transports ?? await discoverNativeTransportProviders();
  const binding = createNativeRuntimeBinding(options.ffi, transportKinds(transportProviders));
  const runtimeCapabilities = await resolveRuntimeCapabilities(binding);
  return new NnrpBackendRuntime(
    {
      ...binding,
      ...(runtimeCapabilities === undefined ? {} : {
        manifest: createNativeRuntimeManifest(transportKinds(transportProviders)),
        runtimeCapabilities,
      }),
    },
    options.transportPolicy ?? "auto",
    transportProviders,
  );
}

export class NnrpBackendRuntime {
  readonly #binding: NnrpNativeRuntimeBinding;
  readonly #transportPolicy: NnrpTransportPolicy;
  readonly #transportProviders: readonly NnrpNativeTransportProvider[];
  #closed = false;
  readonly #roleServers = new Map<object, Promise<InternalServerRole>>();
  readonly #roleSessions = new Map<string, InternalServerRoleSession>();

  public constructor(
    binding: NnrpNativeRuntimeBinding,
    transportPolicy: NnrpTransportPolicy = "auto",
    transportProviders: readonly NnrpNativeTransportProvider[] = [],
  ) {
    this.#binding = binding;
    this.#transportPolicy = transportPolicy;
    this.#transportProviders = [...transportProviders];
    serverRoleSessionClosers.set(this, (routingKey) => this.#closeRoleSession(routingKey));
    serverRoleEventReceivers.set(this, (routingKey, request) => this.#receiveServerEvent(routingKey, request));
    serverRoleFrameSenders.set(this, (routingKey, request) => this.#sendRuntimeFrame(routingKey, request));
    serverOperationFrameSenders.set(
      this,
      (routingKey, operation, request) => this.#sendOperationRuntimeFrame(routingKey, operation, request),
    );
    serverOperationResultSenders.set(
      this,
      (routingKey, operation, metadata, body) => this.#sendOperationResult(routingKey, operation, metadata, body),
    );
  }

  public get manifest(): NnrpCapabilityManifest {
    return this.#binding.manifest;
  }

  public get runtimeCapabilities(): NnrpNativeRuntimeCapabilities | undefined {
    return this.#binding.runtimeCapabilities;
  }

  public get bindingMode(): string {
    return this.#binding.ffi?.mode ?? "unbound";
  }

  #sendRuntimeFrame(routingKey: string, request: NnrpNativeRuntimeFrameSendRequest): Promise<void> {
    this.#ensureOpen();
    const sendRuntimeFrame = this.#binding.ffi?.sendRuntimeFrame;
    if (sendRuntimeFrame !== undefined) {
      return Promise.resolve(sendRuntimeFrame(request));
    }
    const session = this.#roleSessions.get(routingKey);
    if (session === undefined) return Promise.reject(bindingNotConnectedError("sendRuntimeFrame"));
    return session.sendRuntimeFrame(session.handle, request.messageType, request.frameId, request.payload);
  }

  #sendOperationRuntimeFrame(
    routingKey: string,
    operation: InternalNativeHandle,
    request: NnrpNativeRuntimeFrameSendRequest,
  ): Promise<void> {
    this.#ensureOpen();
    const session = this.#roleSessions.get(routingKey);
    if (session === undefined) return Promise.reject(bindingNotConnectedError("sendOperationRuntimeFrame"));
    return session.sendRuntimeFrame(operation, request.messageType, request.frameId, request.payload);
  }

  async #acceptServerSession(
    listenerKey: object,
    request: NnrpNativeAcceptRequest,
    providers: readonly NnrpNativeTransportProvider[],
  ): Promise<InternalServerSessionRegistration> {
    this.#ensureOpen();
    const accept = this.#binding.ffi?.accept;
    if (accept !== undefined) {
      const accepted = await accept(request);
      if (accepted === undefined) throw bindingNotConnectedError("accept");
      return { ...accepted, routingKey: `ffi-session-${allocateNativeRoleId("session")}` };
    }
    const server = await this.#roleServer(
      listenerKey,
      request.endpoint,
      request.providerRoutes,
      request.transportPolicy,
      providers,
      normalizeServerSessionOptions(request.sessionDefaults),
    );
    const sessionHandleId = allocateNativeRoleId("session");
    const accepted = await server.accept(
      sessionHandleId,
      1,
      normalizeServerAcceptOptions(request.acceptOptions).timeoutMs,
    );
    const nativeSession = accepted.session;
    const sessionId = nativeSession.sessionId;
    const routingKey = `native-session-${sessionHandleId}`;
    this.#roleSessions.set(routingKey, nativeSession);
    return { routingKey, sessionId, activeTransport: accepted.activeTransport };
  }

  async #receiveServerEvent(
    routingKey: string,
    request: NnrpNativeServerReceiveRequest,
  ): Promise<InternalDecodedServerRoleEvent> {
    this.#ensureOpen();
    const receive = this.#binding.ffi?.receive;
    if (receive !== undefined) {
      const event = await receive(request);
      return { type: "runtime", event };
    }
    const session = this.#roleSessions.get(routingKey);
    if (session === undefined) throw bindingNotConnectedError("nextEvent");
    const events = await session.poll(1, request.timeoutMillis ?? 0);
    const event = events[0];
    if (event === undefined) throw eventPollTimeoutError("native");
    return decodeServerRoleEvent(event);
  }

  #sendOperationResult(
    routingKey: string,
    operation: InternalNativeHandle,
    metadata: NnrpResultPushMetadata,
    body: Uint8Array,
  ): Promise<void> {
    const session = this.#roleSessions.get(routingKey);
    if (session === undefined) {
      return Promise.reject(bindingNotConnectedError("sendResult"));
    }
    return session.sendResult(operation, encodeResultPushPayload(metadata, body));
  }

  public listen(options: NnrpListenOptions): NnrpServer {
    this.#ensureOpen();
    this.#ensureListenReady();
    validateEndpoint(options.endpoint);
    validateTransportProvidersForPolicy(
      options.transports ?? this.#transportProviders,
      options.transportPolicy ?? this.#transportPolicy,
    );

    const providers = options.transports ?? this.#transportProviders;
    const sessionDefaults = normalizeServerSessionOptions(options.sessionDefaults);
    const listenerKey = {};
    const providerRoutes = copyServerProviderRoutes(options.providerRoutes);
    const state: NnrpServerState = {
      endpoint: normalizeEndpoint(options.endpoint),
      ...(providerRoutes === undefined ? {} : { providerRoutes }),
      runtime: this,
      transports: providers,
      transportPolicy: options.transportPolicy ?? this.#transportPolicy,
      sessionDefaults,
    };
    const server = new NnrpServer(state);
    serverBoundProviderEndpoints.set(server, Object.freeze({}));
    const roleServer = this.#binding.ffi?.accept === undefined
      ? this.#roleServer(
        listenerKey,
        state.endpoint,
        state.providerRoutes,
        state.transportPolicy,
        providers,
        sessionDefaults,
      )
      : undefined;
    if (roleServer !== undefined) {
      void roleServer.then(
        (role) => serverBoundProviderEndpoints.set(server, role.boundProviderEndpoints),
        () => undefined,
      );
    }
    serverAcceptors.set(
      server,
      (acceptOptions) =>
        this.#acceptServerSession(
          listenerKey,
          {
            endpoint: state.endpoint,
            ...(state.providerRoutes === undefined ? {} : { providerRoutes: state.providerRoutes }),
            transportPolicy: state.transportPolicy,
            sessionDefaults,
            acceptOptions,
          },
          providers,
        ),
    );
    serverClosers.set(server, () => this.#closeRoleServer(listenerKey));
    return server;
  }

  public selectTransport(options: NnrpTransportSelectionOptions): NnrpTransportSelectionSummary {
    this.#ensureOpen();

    return createTransportSelectionSummary(
      selectTransport(
        this.#createTransportCandidates(options),
        options.policy ?? this.#transportPolicy,
      ),
    );
  }

  public async close(): Promise<void> {
    this.#closed = true;
    await Promise.all([...this.#roleSessions.values()].map(async (session) => await session.close()));
    const roleServers = await Promise.allSettled(this.#roleServers.values());
    await Promise.all(
      roleServers.flatMap((result) => result.status === "fulfilled" ? [result.value.close()] : []),
    );
    this.#roleServers.clear();
    await this.#binding.ffi?.close?.();
  }

  public get closed(): boolean {
    return this.#closed;
  }

  #ensureOpen(): void {
    if (this.#closed) {
      throw closedError("runtime");
    }
  }

  #ensureListenReady(): void {
    if (this.#binding.manifest.buildMode !== "backend-native") {
      throw nativeRuntimeReadinessError(
        "NNRP_NATIVE_RUNTIME_MANIFEST_INVALID",
        "Native runtime listen requires a backend-native capability manifest.",
      );
    }
  }

  async #closeRoleSession(routingKey: string): Promise<void> {
    const session = this.#roleSessions.get(routingKey);
    if (session === undefined) return;
    this.#roleSessions.delete(routingKey);
    await session.close();
  }

  #roleServer(
    listenerKey: object,
    endpoint: string,
    providerRoutes: NnrpServerProviderRoutes | undefined,
    policy: NnrpTransportPolicy,
    providers: readonly NnrpNativeTransportProvider[],
    sessionDefaults: NormalizedServerSessionOptions,
  ): Promise<InternalServerRole> {
    let server = this.#roleServers.get(listenerKey);
    if (server !== undefined) return server;
    server = listenServerRoles(
      endpoint,
      providerRoutes,
      providers,
      policy,
      allocateNativeRoleId("connection"),
      sessionDefaults,
    );
    this.#roleServers.set(listenerKey, server);
    return server;
  }

  async #closeRoleServer(listenerKey: object): Promise<void> {
    const server = this.#roleServers.get(listenerKey);
    this.#roleServers.delete(listenerKey);
    if (server === undefined) return;
    let role: InternalServerRole;
    try {
      role = await server;
    } catch {
      // A failed atomic open has already closed every listener it created.
      return;
    }
    await role.close();
  }

  #createTransportCandidates(options: NnrpTransportSelectionOptions): readonly NnrpTransportCandidate[] {
    const providers = options.providers ?? this.#transportProviders;
    return createTransportCandidates({
      local: { ...this.#binding.manifest, transports: providers.map((provider) => provider.kind) },
      peer: options.peerManifest,
      providers,
      ...(options.requestedMaxFrameBytes === undefined
        ? {}
        : { requestedMaxFrameBytes: options.requestedMaxFrameBytes }),
      candidateReadiness: options.candidateReadiness,
      ...(options.probeObservations === undefined ? {} : { probeObservations: options.probeObservations }),
    });
  }
}

function allocateNativeRoleId(kind: keyof NativeRoleIdState): bigint {
  const root = globalThis as typeof globalThis & { [NATIVE_ROLE_IDS]?: NativeRoleIdState };
  const state = root[NATIVE_ROLE_IDS] ??= { connection: 1n, session: 1n };
  const id = state[kind];
  if (id > 0xffff_ffff_ffff_ffffn) throw new RangeError(`Native ${kind} handle id space is exhausted.`);
  state[kind] = id + 1n;
  return id;
}

async function discoverNativeTransportProviders(): Promise<readonly NnrpNativeTransportProvider[]> {
  const providers: NnrpNativeTransportProvider[] = [];
  const tcp = await importOptionalTransportModule("@nnrp/transport-tcp");
  const quic = await importOptionalTransportModule("@nnrp/transport-quic");
  const ipc = await importOptionalTransportModule("@nnrp/transport-ipc");
  const websocket = await importOptionalTransportModule("@nnrp/transport-websocket");

  if (isTransportFactory(tcp?.createTcpTransportProvider)) {
    providers.push(tcp.createTcpTransportProvider());
  }
  if (isTransportFactory(quic?.createQuicTransportProvider)) {
    providers.push(quic.createQuicTransportProvider());
  }
  if (isTransportFactory(ipc?.createIpcTransportProvider)) {
    providers.push(ipc.createIpcTransportProvider());
  }
  if (isTransportFactory(websocket?.createWebSocketTransportProvider)) {
    providers.push(websocket.createWebSocketTransportProvider());
  }

  return providers;
}

async function importOptionalTransportModule(specifier: string): Promise<Record<string, unknown> | undefined> {
  try {
    return await import(specifier) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function isTransportFactory(value: unknown): value is () => NnrpNativeTransportProvider {
  return typeof value === "function";
}

function validateTransportProvidersForPolicy(
  providers: readonly NnrpNativeTransportProvider[],
  policy: NnrpTransportPolicy,
): void {
  if (providers.length === 0) {
    throw new NnrpCapabilityError({
      code: "NNRP_NATIVE_TRANSPORT_PROVIDER_MISSING",
      message: "At least one native transport provider package or explicit provider is required.",
      source: "transport",
      retryable: false,
    });
  }

  const duplicateKind = providers.find((provider, index) =>
    providers.findIndex((candidate) => candidate.kind === provider.kind) !== index
  )?.kind;
  if (duplicateKind !== undefined) {
    throw new NnrpTransportError({
      code: "NNRP_NATIVE_TRANSPORT_PROVIDER_DUPLICATE",
      message: `Only one ${duplicateKind} provider can own a carrier listener in one logical server.`,
      source: "transport",
      retryable: false,
      transport: duplicateKind,
    });
  }

  const forcedKind = forcedTransportKind(policy);
  if (
    forcedKind !== undefined &&
    !providers.some((provider) => provider.kind === forcedKind && provider.localAvailable)
  ) {
    throw new NnrpTransportError({
      code: "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED",
      message: `${policy} transport policy requires an available installed or explicit ${forcedKind} provider.`,
      source: "transport",
      retryable: false,
      transport: forcedKind,
    });
  }
  if (forcedKind === undefined && !providers.some((provider) => provider.localAvailable)) {
    throw new NnrpCapabilityError({
      code: "NNRP_NATIVE_TRANSPORT_PROVIDER_UNAVAILABLE",
      message: "At least one native transport provider must be locally available for listen.",
      source: "transport",
      retryable: false,
    });
  }
}

function forcedTransportKind(policy: NnrpTransportPolicy): NnrpTransportKind | undefined {
  return policy.startsWith("force-") ? policy.slice("force-".length) as NnrpTransportKind : undefined;
}

async function listenServerRoles(
  endpoint: string,
  providerRoutes: NnrpServerProviderRoutes | undefined,
  providers: readonly NnrpNativeTransportProvider[],
  policy: NnrpTransportPolicy,
  firstServerId: bigint,
  sessionDefaults: NormalizedServerSessionOptions,
): Promise<InternalServerRole> {
  const entries: Array<{
    readonly kind: NnrpTransportKind;
    readonly endpoint: string;
    readonly role: InternalTransportServerRole;
  }> = [];
  let nextServerId = firstServerId;
  try {
    const resolutions = resolveServerProviderRoutes(endpoint, providerRoutes, providers, policy);
    for (const resolution of resolutions) {
      const provider = resolution.provider;
      const listener = await provider.listen({
        endpoint: resolution.endpoint,
        ...(resolution.security === undefined ? {} : { security: resolution.security }),
      });
      const adoption = (listener as NnrpTransportServer & Partial<InternalServerRoleCarrier>)[SERVER_ROLE_ADOPT];
      if (typeof adoption !== "function") {
        await listener.close();
        throw new NnrpCapabilityError({
          code: "NNRP_NATIVE_ROLE_ADOPTION_UNAVAILABLE",
          message: `${provider.kind} provider does not expose its package-owned server role adoption path.`,
          source: "native",
          retryable: false,
          transport: provider.kind,
        });
      }
      try {
        entries.push({
          kind: provider.kind,
          endpoint: listener.endpoint,
          role: await adoption.call(listener, nextServerId, 1, sessionDefaults),
        });
      } catch (error) {
        await listener.close();
        throw error;
      }
      nextServerId = allocateNativeRoleId("connection");
    }
    return new InternalServerRoleGroup(entries);
  } catch (error) {
    await Promise.allSettled(entries.map(async ({ role }) => await role.close()));
    throw error;
  }
}

function orderedServerProviders(
  providers: readonly NnrpNativeTransportProvider[],
  policy: NnrpTransportPolicy,
): readonly NnrpNativeTransportProvider[] {
  const available = providers.filter((provider) => provider.localAvailable);
  const forced = forcedTransportKind(policy);
  if (forced !== undefined) {
    return available.filter((provider) => provider.kind === forced);
  }
  const preferred = policy.startsWith("prefer-") ? policy.slice("prefer-".length) as NnrpTransportKind : undefined;
  return [...available].sort((left, right) => {
    if (preferred !== undefined && left.kind !== right.kind) {
      if (left.kind === preferred) return -1;
      if (right.kind === preferred) return 1;
    }
    return left.metadata.preferenceRank - right.metadata.preferenceRank ||
      transportKindOrder(left.kind) - transportKindOrder(right.kind) ||
      left.metadata.id.localeCompare(right.metadata.id);
  });
}

function transportKindOrder(kind: NnrpTransportKind): number {
  switch (kind) {
    case "quic":
      return 1;
    case "tcp":
      return 2;
    case "ipc":
      return 3;
    case "websocket":
      return 4;
  }
}

interface ResolvedServerProviderRoute {
  readonly provider: NnrpNativeTransportProvider;
  readonly endpoint: string;
  readonly security?: NnrpTransportServerSecurity;
}

function resolveServerProviderRoutes(
  endpoint: string | URL,
  providerRoutes: NnrpServerProviderRoutes | undefined,
  providers: readonly NnrpNativeTransportProvider[],
  policy: NnrpTransportPolicy,
): readonly ResolvedServerProviderRoute[] {
  const installedKinds = new Set(providers.map((provider) => provider.kind));
  const uninstalledKind = (Object.keys(providerRoutes ?? {}) as NnrpTransportKind[]).find((kind) =>
    !installedKinds.has(kind)
  );
  if (uninstalledKind !== undefined) {
    throw serverRouteError(uninstalledKind, "local-unavailable");
  }
  return orderedServerProviders(providers, policy).map((provider) => {
    const route = providerRoutes?.[provider.kind];
    let resolvedEndpoint: string;
    try {
      resolvedEndpoint = provider.kind === "websocket"
        ? resolveNativeWebSocketEndpoint(route?.endpoint)
        : resolveServerProviderEndpoint(endpoint, provider.kind, route?.endpoint);
    } catch (cause) {
      throw serverRouteError(provider.kind, "route-unresolved", cause);
    }
    if (!serverRouteSecuritySatisfied(endpoint, provider.kind, resolvedEndpoint, route?.security !== undefined)) {
      throw serverRouteError(provider.kind, "security-unsatisfied");
    }
    return {
      provider,
      endpoint: resolvedEndpoint,
      ...(route?.security === undefined ? {} : { security: route.security }),
    };
  });
}

function resolveServerProviderEndpoint(
  applicationEndpoint: string | URL,
  kind: Exclude<NnrpTransportKind, "websocket">,
  providerEndpoint: string | URL | undefined,
): string {
  if ((kind !== "tcp" && kind !== "quic") || providerEndpoint === undefined) {
    return resolveProviderEndpoint(applicationEndpoint, kind, providerEndpoint);
  }
  if (providerEndpoint instanceof URL) {
    return resolveProviderEndpoint(applicationEndpoint, kind, providerEndpoint);
  }

  const value = providerEndpoint.trim();
  if (!value.endsWith(":0")) {
    return resolveProviderEndpoint(applicationEndpoint, kind, providerEndpoint);
  }
  if (value.length === 0 || value.includes("://")) {
    throw new TypeError(`${kind} server provider endpoint must use host:port form.`);
  }

  const parsed = new URL(`tcp://${value}`);
  if (
    parsed.hostname.length === 0 || parsed.port !== "0" || parsed.username.length > 0 ||
    parsed.password.length > 0 || (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search.length > 0 || parsed.hash.length > 0
  ) {
    throw new TypeError(`${kind} server provider endpoint must contain only host and port.`);
  }
  return `${parsed.hostname}:0`;
}

function serverRouteSecuritySatisfied(
  applicationEndpoint: string | URL,
  kind: NnrpTransportKind,
  providerEndpoint: string,
  hasSecurity: boolean,
): boolean {
  const secureApplication = parseApplicationEndpoint(applicationEndpoint).protocol === "nnrps:";
  if (kind === "tcp") return !secureApplication || hasSecurity;
  if (kind === "quic") return hasSecurity;
  if (kind === "ipc") return !secureApplication && !hasSecurity;
  const secureWebSocket = new URL(providerEndpoint).protocol === "wss:";
  return (!secureApplication || secureWebSocket) && secureWebSocket === hasSecurity;
}

function resolveNativeWebSocketEndpoint(endpoint: string | URL | undefined): string {
  if (endpoint === undefined) throw new TypeError("Native ws/wss routes require an explicit endpoint.");
  const parsed = endpoint instanceof URL ? new URL(endpoint.toString()) : new URL(endpoint.trim());
  if ((parsed.protocol !== "ws:" && parsed.protocol !== "wss:") || parsed.hostname.length === 0) {
    throw new TypeError("Native ws/wss routes require a ws:// or wss:// endpoint.");
  }
  return parsed.toString();
}

function serverRouteError(
  kind: NnrpTransportKind,
  reason: Extract<
    NnrpTransportRejectionReason,
    "local-unavailable" | "route-unresolved" | "security-unsatisfied"
  >,
  cause?: unknown,
): NnrpTransportError {
  return new NnrpTransportError({
    code: reason === "local-unavailable"
      ? "NNRP_NATIVE_PROVIDER_ROUTE_LOCAL_UNAVAILABLE"
      : reason === "route-unresolved"
      ? "NNRP_NATIVE_PROVIDER_ROUTE_UNRESOLVED"
      : "NNRP_NATIVE_PROVIDER_ROUTE_SECURITY_UNSATISFIED",
    message: reason === "local-unavailable"
      ? `${kind} server provider route is configured but its provider is not installed.`
      : reason === "route-unresolved"
      ? `${kind} server provider route is unresolved.`
      : `${kind} server provider route cannot satisfy the application endpoint security intent.`,
    source: "transport",
    retryable: false,
    transport: kind,
    cause: { reason, ...(cause === undefined ? {} : { cause }) },
  });
}

function isTerminalListenerError(error: unknown): boolean {
  if (error instanceof NnrpTimeoutError) return false;
  return !(error instanceof NnrpTransportError && error.diagnostic.retryable);
}

const TRANSPORT_KINDS = ["tcp", "quic", "ipc", "websocket"] as const;

function copyServerProviderRoutes(
  providerRoutes: NnrpServerProviderRoutes | undefined,
): NnrpServerProviderRoutes | undefined {
  if (providerRoutes === undefined) return undefined;
  const unknownKind = Object.keys(providerRoutes).find((kind) =>
    !(TRANSPORT_KINDS as readonly string[]).includes(kind)
  );
  if (unknownKind !== undefined) {
    throw new NnrpTransportError({
      code: "NNRP_NATIVE_PROVIDER_ROUTE_KEY_INVALID",
      message: `Unknown native server provider route key: ${unknownKind}.`,
      source: "transport",
      retryable: false,
    });
  }
  const copy: Partial<Record<NnrpTransportKind, NonNullable<NnrpServerProviderRoutes[NnrpTransportKind]>>> = {};
  for (const kind of TRANSPORT_KINDS) {
    const route = providerRoutes[kind];
    if (route === undefined) continue;
    copy[kind] = {
      ...(route.endpoint === undefined
        ? {}
        : { endpoint: route.endpoint instanceof URL ? new URL(route.endpoint.toString()) : route.endpoint }),
      ...(route.security === undefined ? {} : {
        security: {
          mode: "server",
          certificateDer: route.security.certificateDer.slice(),
          privateKeyPkcs8Der: route.security.privateKeyPkcs8Der.slice(),
        },
      }),
    };
  }
  return copy;
}

function decodeServerRoleEvent(event: InternalRoleEvent): InternalDecodedServerRoleEvent {
  if (!event.headerPresent) {
    if (
      event.kind === EVENT_KIND_OPERATION_LIFECYCLE && event.relatedOperationId !== 0n &&
      event.payload.byteLength === 1
    ) {
      return {
        type: "lifecycle",
        event: {
          operationId: event.relatedOperationId,
          state: decodeOperationState(event.payload[0]!),
        },
      };
    }
    throw new NnrpProtocolError({
      code: "NNRP_NATIVE_LIFECYCLE_EVENT_UNEXPECTED",
      message: `Native server role emitted invalid headerless event kind ${event.kind} on the role event pump.`,
      source: "native",
      retryable: false,
    });
  }
  const header: NnrpRuntimeFrameHeader = {
    versionMajor: event.versionMajor as 1,
    wireFormat: event.wireFormat as 0,
    messageType: event.messageType as NnrpMessageType,
    flags: event.headerFlags,
    sessionId: event.wireSessionId,
    frameId: event.frameId,
    viewId: event.viewId,
    routeId: event.routeId,
    traceId: event.traceId,
  };
  const decoded = decodeNnrpRuntimeEvent(header, event.payload);
  if (decoded.header.messageType === NnrpMessageType.FrameSubmit) {
    if (event.kind !== EVENT_KIND_SUBMIT_ACCEPTED) {
      throw new NnrpProtocolError({
        code: "NNRP_NATIVE_SUBMIT_EVENT_KIND_INVALID",
        message: `Native server role emitted FRAME_SUBMIT with event kind ${event.kind}.`,
        source: "native",
        retryable: false,
      });
    }
    return { type: "runtime", event: decoded, operation: event.operation };
  }
  return { type: "runtime", event: decoded };
}

function decodeOperationState(value: number): NnrpOperationState {
  const states = [
    "accepted",
    "running",
    "partial",
    "waiting-tool",
    "superseded",
    "cancelled",
    "failed",
    "completed",
  ] as const satisfies readonly NnrpOperationState[];
  const state = states[value];
  if (state === undefined) {
    throw new NnrpProtocolError({
      code: "NNRP_NATIVE_OPERATION_STATE_INVALID",
      message: `Native role emitted unknown operation lifecycle state ${value}.`,
      source: "native",
      retryable: false,
    });
  }
  return state;
}

export interface NnrpServerState {
  readonly endpoint: string;
  readonly providerRoutes?: NnrpServerProviderRoutes;
  readonly runtime: NnrpBackendRuntime;
  readonly transports: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy: NnrpTransportPolicy;
  readonly sessionDefaults: NnrpServerSessionOptions;
}

export class NnrpServer {
  readonly #state: NnrpServerState;
  readonly #sessions = new Set<NnrpServerSession>();
  #closed = false;

  public constructor(state: NnrpServerState) {
    this.#state = state;
  }

  public get endpoint(): string {
    return this.#state.endpoint;
  }

  public get transportPolicy(): NnrpTransportPolicy {
    return this.#state.transportPolicy;
  }

  public get boundProviderEndpoints(): Readonly<Partial<Record<NnrpTransportKind, string>>> {
    return serverBoundProviderEndpoints.get(this) ?? Object.freeze({});
  }

  public accept(options: NnrpServerAcceptOptions = {}): Promise<NnrpServerSession> {
    try {
      this.#ensureOpen();
    } catch (error) {
      return Promise.reject(error);
    }

    const accept = serverAcceptors.get(this);
    if (accept === undefined) return Promise.reject(bindingNotConnectedError("accept"));
    let normalizedOptions: Required<NnrpServerAcceptOptions>;
    try {
      normalizedOptions = normalizeServerAcceptOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }
    return accept(normalizedOptions).then(
      async (accepted) => {
        const sessionId = assertNegotiatedSessionId(accepted.sessionId);
        const session = new NnrpServerSession({
          runtime: this.#state.runtime,
          routingKey: accepted.routingKey,
          sessionId,
          activeTransport: accepted.activeTransport,
        });
        if (this.closed) {
          await session.close();
          throw closedError("server");
        }
        this.#sessions.add(session);
        return session;
      },
      async (error) => {
        if (isTerminalListenerError(error)) await this.close();
        throw error;
      },
    );
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.all([...this.#sessions].map(async (session) => await session.close()));
    this.#sessions.clear();
    await serverClosers.get(this)?.();
  }

  public get closed(): boolean {
    return this.#closed || this.#state.runtime.closed;
  }

  #ensureOpen(): void {
    if (this.closed) {
      throw closedError("server");
    }
  }
}

interface NnrpServerOperationState {
  readonly runtime: NnrpBackendRuntime;
  readonly routingKey: string;
  readonly sessionId: number;
  readonly handle: InternalNativeHandle;
  readonly operationId: bigint;
  readonly frameId: number;
  readonly submit: NnrpRuntimeEvent;
  readonly sessionClosed: () => boolean;
  readonly complete: (operationId: bigint, frameId: number) => void;
}

let createServerOperation: (state: NnrpServerOperationState) => NnrpServerOperation;

export type NnrpServerEvent =
  | { readonly type: "submit"; readonly operation: NnrpServerOperation }
  | { readonly type: "runtime"; readonly event: NnrpRuntimeEvent }
  | { readonly type: "lifecycle"; readonly event: NnrpOperationLifecycleEvent };

export class NnrpServerOperation {
  readonly #state: NnrpServerOperationState;
  #terminal = false;

  private constructor(state: NnrpServerOperationState) {
    this.#state = state;
  }

  static {
    createServerOperation = (state) => new NnrpServerOperation(state);
  }

  public get operationId(): bigint {
    return this.#state.operationId;
  }

  public get frameId(): number {
    return this.#state.frameId;
  }

  public get submit(): NnrpRuntimeEvent {
    return this.#state.submit;
  }

  public sendResult(metadata: NnrpResultPushMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    try {
      this.#ensureReplyAllowed(this.#state.operationId, true);
      const send = serverOperationResultSenders.get(this.#state.runtime);
      if (send === undefined) return Promise.reject(bindingNotConnectedError("sendResult"));
      this.#terminal = true;
      return send(
        this.#state.routingKey,
        this.#state.handle,
        metadata,
        body.slice(),
      ).then(() => this.#state.complete(this.#state.operationId, this.#state.frameId)).catch((error) => {
        this.#terminal = false;
        throw error;
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  public sendResultDrop(
    metadata: ResultDropReasonMetadata,
    diagnostic: Uint8Array = EMPTY_PAYLOAD,
  ): Promise<void> {
    return this.#sendRuntimeFrame(
      NnrpMessageType.ResultDropReason,
      metadata.operationId,
      encodeRuntimeControlMetadata(NnrpMessageType.ResultDropReason, metadata, diagnostic.slice()),
      true,
    );
  }

  public sendProgress(metadata: ProgressMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeFrame(
      NnrpMessageType.Progress,
      metadata.operationId,
      encodeRuntimeControlMetadata(NnrpMessageType.Progress, metadata, body.slice()),
      false,
    );
  }

  public sendPartialResult(metadata: PartialResultMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeFrame(
      NnrpMessageType.PartialResult,
      metadata.operationId,
      encodeRuntimeControlMetadata(NnrpMessageType.PartialResult, metadata, body.slice()),
      false,
    );
  }

  #sendRuntimeFrame(
    messageType: NnrpMessageType,
    operationId: bigint,
    payload: Uint8Array,
    terminal: boolean,
  ): Promise<void> {
    try {
      this.#ensureReplyAllowed(operationId, terminal);
      const send = serverOperationFrameSenders.get(this.#state.runtime);
      if (send === undefined) return Promise.reject(bindingNotConnectedError("sendOperationRuntimeFrame"));
      if (terminal) this.#terminal = true;
      return send(this.#state.routingKey, this.#state.handle, {
        sessionId: this.#state.sessionId,
        messageType,
        frameId: this.#state.frameId,
        payload,
      }).then(() => {
        if (terminal) this.#state.complete(this.#state.operationId, this.#state.frameId);
      }).catch((error) => {
        if (terminal) this.#terminal = false;
        throw error;
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  #ensureReplyAllowed(operationId: bigint, terminal: boolean): void {
    if (this.#state.sessionClosed()) throw closedError("server session");
    if (operationId !== this.#state.operationId) {
      throw new NnrpProtocolError({
        code: "NNRP_SERVER_OPERATION_ID_MISMATCH",
        message: `Reply operation ${operationId} does not match accepted operation ${this.#state.operationId}.`,
        source: "protocol",
        retryable: false,
      });
    }
    if (this.#terminal) {
      throw terminal ? serverTerminalDuplicateError(this.#state.frameId) : new NnrpProtocolError({
        code: "NNRP_SERVER_INCREMENTAL_AFTER_TERMINAL",
        message: `Operation ${operationId} already reached a terminal server reply.`,
        source: "protocol",
        retryable: false,
      });
    }
  }
}

interface NnrpServerSessionState {
  readonly runtime: NnrpBackendRuntime;
  readonly routingKey: string;
  readonly sessionId: number;
  readonly activeTransport: NnrpTransportKind;
}

function assertNegotiatedSessionId(sessionId: number): number {
  if (!Number.isInteger(sessionId) || sessionId <= 0 || sessionId > 0xffff_ffff) {
    throw new RangeError("negotiated sessionId must be a non-zero u32");
  }
  return sessionId;
}

export class NnrpServerSession {
  readonly #state: NnrpServerSessionState | undefined;
  readonly #runtimeObjects = new RuntimeObjectLifecycle();
  readonly #pendingEvents: NnrpServerEvent[] = [];
  readonly #operationByFrame = new Map<number, bigint>();
  readonly #frameByOperation = new Map<bigint, number>();
  #receiveQueue: Promise<void> = Promise.resolve();
  #runtimeObjectQueue: Promise<void> = Promise.resolve();
  #nextRuntimeFrameId = 1;
  #closed = false;

  public constructor(state?: NnrpServerSessionState) {
    this.#state = state;
  }

  public get activeTransport(): NnrpTransportKind {
    const activeTransport = this.#state?.activeTransport;
    if (activeTransport === undefined) throw bindingNotConnectedError("activeTransport");
    return activeTransport;
  }

  public get sessionId(): number {
    const sessionId = this.#state?.sessionId;
    if (sessionId === undefined) throw bindingNotConnectedError("sessionId");
    return sessionId;
  }

  public nextEvent(options: NnrpEventPollOptions = {}): Promise<NnrpServerEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    return this.#serializeReceive(async () => {
      const queued = this.#pendingEvents.shift();
      if (queued !== undefined) return await raceEventPoll(Promise.resolve(queued), options);
      return await this.#pollServerEvent(options);
    });
  }

  public receiveSubmit(options: NnrpEventPollOptions = {}): Promise<NnrpServerOperation> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    return this.#serializeReceive(async () => {
      const queuedIndex = this.#pendingEvents.findIndex((event) => event.type === "submit");
      if (queuedIndex >= 0) {
        const queued = this.#pendingEvents.splice(queuedIndex, 1)[0]!;
        if (queued.type !== "submit") throw new Error("pending server event selection invariant failed");
        return await raceEventPoll(Promise.resolve(queued.operation), options);
      }

      const deadline = options.timeoutMillis === undefined ? undefined : Date.now() + options.timeoutMillis;
      while (true) {
        const remaining = deadline === undefined ? undefined : Math.max(0, deadline - Date.now());
        const event = await this.#pollServerEvent({
          ...(remaining === undefined ? {} : { timeoutMillis: remaining }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        if (event.type === "submit") return event.operation;
        this.#pendingEvents.push(event);
      }
    });
  }

  public sendBackpressure(metadata: PressureMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.Backpressure, metadata);
  }

  public sendCreditUpdate(metadata: PressureMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.CreditUpdate, metadata);
  }

  public sendTraceContext(metadata: TraceContextMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.TraceContext, metadata, body);
  }

  public sendRecoverableError(
    metadata: RecoverableErrorMetadata,
    diagnostic: Uint8Array = EMPTY_PAYLOAD,
  ): Promise<void> {
    return this.sendControl(NnrpMessageType.ErrorRecoverable, metadata, diagnostic);
  }

  public sendRetryAfter(metadata: RetryAfterMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.RetryAfter, metadata, diagnostic);
  }

  public declareObject(metadata: ObjectDescriptorMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectDeclare, metadata, body);
  }

  public referenceObject(metadata: ObjectReferenceMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectRef, metadata, body);
  }

  public releaseObject(metadata: ObjectReleaseMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectRelease, metadata, diagnostic);
  }

  public patchObject(
    metadata: ObjectDeltaMetadata,
    delta: Uint8Array,
    metadataBody: Uint8Array = EMPTY_PAYLOAD,
  ): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectPatch, metadata, delta, metadataBody);
  }

  public sendObjectDelta(
    metadata: ObjectDeltaMetadata,
    delta: Uint8Array,
    metadataBody: Uint8Array = EMPTY_PAYLOAD,
  ): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectDelta, metadata, delta, metadataBody);
  }

  public referenceCache(metadata: CacheReferenceMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.CacheReference, metadata, body);
  }

  public reportCacheMiss(metadata: CacheMissMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.CacheMiss, metadata, diagnostic);
  }

  public invalidateCache(metadata: CacheInvalidateMetadata): Promise<void> {
    try {
      return this.#sendRuntimeFrame(NnrpMessageType.CacheInvalidate, encodeCacheInvalidateMetadata(metadata));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  public sendControl(
    messageType: NnrpMessageType,
    metadata: RuntimeControlMetadata,
    tail: Uint8Array = EMPTY_PAYLOAD,
  ): Promise<void> {
    try {
      assertServerRuntimeControlMessage(messageType);
      return this.#sendRuntimeFrame(messageType, encodeRuntimeControlMetadata(messageType, metadata, tail));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#pendingEvents.length = 0;
    this.#operationByFrame.clear();
    this.#frameByOperation.clear();
    this.#runtimeObjects.clear();
    const state = this.#state;
    const closeRoleSession = state === undefined ? undefined : serverRoleSessionClosers.get(state.runtime);
    if (closeRoleSession !== undefined && state !== undefined) {
      await closeRoleSession(state.routingKey);
    }
  }

  public get closed(): boolean {
    return this.#closed;
  }

  #ensureOpen(): void {
    if (this.#closed) {
      throw closedError("server session");
    }
  }

  #serializeReceive<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.#receiveQueue.then(operation, operation);
    this.#receiveQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  async #pollServerEvent(options: NnrpEventPollOptions): Promise<NnrpServerEvent> {
    const state = this.#state;
    if (state === undefined) throw bindingNotConnectedError("nextEvent");
    const receive = serverRoleEventReceivers.get(state.runtime);
    if (receive === undefined) throw bindingNotConnectedError("nextEvent");
    const decoded = await raceEventPoll(
      receive(state.routingKey, {
        sessionId: state.sessionId,
        ...(options.timeoutMillis === undefined ? {} : { timeoutMillis: options.timeoutMillis }),
      }),
      options,
    );
    if (decoded.type === "lifecycle") return decoded;

    const event = decoded.event;
    await this.#releaseForTerminalControl(event);
    if (event.header.messageType === NnrpMessageType.SessionClose) {
      this.#operationByFrame.clear();
      this.#frameByOperation.clear();
    }
    if (event.header.messageType !== NnrpMessageType.FrameSubmit) {
      return { type: "runtime", event };
    }
    if (event.metadata.type !== "frame_submit" || decoded.operation === undefined) {
      throw new NnrpProtocolError({
        code: "NNRP_NATIVE_SUBMIT_OPERATION_MISSING",
        message: "Native server submit delivery did not include an owning operation handle.",
        source: "native",
        retryable: false,
      });
    }
    const operation = createServerOperation({
      runtime: state.runtime,
      routingKey: state.routingKey,
      sessionId: state.sessionId,
      handle: decoded.operation,
      operationId: event.metadata.value.operationId,
      frameId: event.header.frameId,
      submit: event,
      sessionClosed: () => this.closed,
      complete: (operationId, frameId) => this.#finishOperation(operationId, frameId),
    });
    this.#operationByFrame.set(operation.frameId, operation.operationId);
    this.#frameByOperation.set(operation.operationId, operation.frameId);
    return { type: "submit", operation };
  }

  #sendRuntimeObject(
    messageType: NnrpMessageType,
    metadata: RuntimeObjectSendMetadata,
    tail: Uint8Array,
    metadataBody?: Uint8Array,
  ): Promise<void> {
    const send = this.#runtimeObjectQueue.then(async () => {
      this.#runtimeObjects.validate(messageType, metadata);
      const payload = metadataBody === undefined
        ? encodeRuntimeObjectMetadata(messageType, metadata, tail)
        : encodeRuntimeObjectMetadataSegments(messageType, metadata, [metadataBody, tail]);
      const operationFrameId = this.#runtimeObjectFrameId(messageType, metadata);
      if (operationFrameId === undefined) {
        await this.#sendRuntimeFrame(messageType, payload);
      } else {
        await this.#sendRuntimeFrameForFrame(messageType, operationFrameId, payload);
      }
      this.#runtimeObjects.commit(messageType, metadata);
    });
    this.#runtimeObjectQueue = send.catch(() => undefined);
    return send;
  }

  async #releaseForTerminalControl(event: NnrpRuntimeEvent): Promise<void> {
    if (
      (event.header.messageType === NnrpMessageType.Cancel || event.header.messageType === NnrpMessageType.Abort) &&
      event.metadata.type === "control_request"
    ) {
      await this.#releaseOperationObjects(event.metadata.value.operationId, ObjectReleaseReason.Cancelled);
    } else if (event.header.messageType === NnrpMessageType.Supersede && event.metadata.type === "supersede") {
      await this.#releaseOperationObjects(event.metadata.value.oldOperationId, ObjectReleaseReason.Replaced);
    }
  }

  async #releaseOperationObjects(operationId: bigint, releaseReason: ObjectReleaseReason): Promise<void> {
    await this.#runtimeObjectQueue;
    for (const objectId of this.#runtimeObjects.releaseOnDropObjectIds(operationId)) {
      await this.releaseObject({
        objectId,
        operationId,
        releaseReason,
        sourceRole: RuntimeRole.Server,
        flags: 0,
        diagnosticBytes: 0,
      });
    }
  }

  #sendRuntimeFrame(messageType: NnrpMessageType, payload: Uint8Array): Promise<void> {
    try {
      this.#ensureOpen();
      const state = this.#state;
      if (state === undefined) {
        return Promise.reject(bindingNotConnectedError("sendRuntimeFrame"));
      }
      const frameId = this.#nextRuntimeFrameId;
      this.#nextRuntimeFrameId = frameId === 0xffff_ffff ? 1 : frameId + 1;
      const sendRuntimeFrame = serverRoleFrameSenders.get(state.runtime);
      if (sendRuntimeFrame === undefined) return Promise.reject(bindingNotConnectedError("sendRuntimeFrame"));
      return sendRuntimeFrame(state.routingKey, {
        sessionId: state.sessionId,
        messageType,
        frameId,
        payload,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  #sendRuntimeFrameForFrame(messageType: NnrpMessageType, frameId: number, payload: Uint8Array): Promise<void> {
    try {
      this.#ensureOpen();
      const state = this.#state;
      if (state === undefined) return Promise.reject(bindingNotConnectedError("sendRuntimeFrame"));
      const sendRuntimeFrame = serverRoleFrameSenders.get(state.runtime);
      if (sendRuntimeFrame === undefined) return Promise.reject(bindingNotConnectedError("sendRuntimeFrame"));
      return sendRuntimeFrame(state.routingKey, {
        sessionId: state.sessionId,
        messageType,
        frameId,
        payload,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  #runtimeObjectFrameId(messageType: NnrpMessageType, metadata: RuntimeObjectSendMetadata): number | undefined {
    if (messageType !== NnrpMessageType.ObjectRef && messageType !== NnrpMessageType.ObjectRelease) return undefined;
    const operationId = (metadata as ObjectReferenceMetadata | ObjectReleaseMetadata).operationId;
    if (operationId === 0n) return 0;
    const frameId = this.#frameForOperation(operationId);
    if (frameId === undefined) throw inactiveOperationError(messageType, operationId);
    return frameId;
  }

  #frameForOperation(operationId: bigint): number | undefined {
    return this.#frameByOperation.get(operationId);
  }

  #finishOperation(operationId: bigint, expectedFrameId?: number): void {
    if (operationId === 0n) return;
    const frameId = expectedFrameId ?? this.#frameForOperation(operationId);
    if (frameId !== undefined && this.#operationByFrame.get(frameId) === operationId) {
      this.#operationByFrame.delete(frameId);
      if (this.#frameByOperation.get(operationId) === frameId) {
        this.#frameByOperation.delete(operationId);
      }
    }
  }
}

function createNativeRuntimeBinding(
  ffi: NnrpNativeFfiBinding | undefined,
  transports: readonly NnrpTransportKind[],
): NnrpNativeRuntimeBinding {
  return {
    manifest: createNativeRuntimeManifest(transports),
    ...(ffi === undefined ? {} : { ffi }),
  };
}

function createNativeRuntimeManifest(transports: readonly NnrpTransportKind[]): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "backend-native",
    transports,
    capabilities: [
      "server.session",
      ...NATIVE_RUNTIME_CAPABILITIES,
    ] satisfies readonly NnrpCapability[],
  });
}

function transportKinds(providers: readonly NnrpNativeTransportProvider[]): readonly NnrpTransportKind[] {
  return [...new Set(providers.map((provider) => provider.kind))];
}

async function resolveRuntimeCapabilities(
  binding: NnrpNativeRuntimeBinding,
): Promise<NnrpNativeRuntimeCapabilities | undefined> {
  const capabilities = await binding.ffi?.runtimeCapabilities?.();
  if (capabilities === undefined) {
    return undefined;
  }

  validateNativeRuntimeCapabilities(capabilities);
  return capabilities;
}

export function validateNativeRuntimeCapabilities(capabilities: NnrpNativeRuntimeCapabilities): void {
  if (
    capabilities.abiMajor !== EXPECTED_ABI_MAJOR || capabilities.abiMinor !== EXPECTED_ABI_MINOR ||
    capabilities.abiPatch !== EXPECTED_ABI_PATCH
  ) {
    throw nativeArtifactError(
      "NNRP_NATIVE_ABI_MISMATCH",
      `Native artifact ABI ${capabilities.abiMajor}.${capabilities.abiMinor}.${capabilities.abiPatch} is not supported.`,
    );
  }

  if (
    capabilities.protocolMajor !== EXPECTED_PROTOCOL_MAJOR ||
    capabilities.protocolWireFormat !== EXPECTED_PROTOCOL_WIRE_FORMAT
  ) {
    throw nativeArtifactError(
      "NNRP_NATIVE_PROTOCOL_MISMATCH",
      `Native artifact protocol ${capabilities.protocolMajor}/${capabilities.protocolWireFormat} is not supported.`,
    );
  }

  const missing = REQUIRED_RUNTIME_FEATURES & ~capabilities.featureFlags;
  if (missing !== 0n) {
    throw nativeArtifactError(
      "NNRP_NATIVE_FEATURES_MISSING",
      `Native artifact is missing required runtime feature bits: 0x${missing.toString(16)}.`,
    );
  }
}

function normalizeEndpoint(endpoint: string | URL): string {
  return endpoint instanceof URL ? endpoint.toString() : endpoint;
}

function validateEndpoint(endpoint: string | URL): void {
  if (normalizeEndpoint(endpoint).trim().length === 0) {
    throw new NnrpCapabilityError({
      code: "NNRP_NATIVE_ENDPOINT_EMPTY",
      message: "NNRP native endpoint must not be empty.",
      source: "native",
      retryable: false,
    });
  }
}

function assertServerRuntimeControlMessage(messageType: NnrpMessageType): void {
  if (
    messageType === NnrpMessageType.Backpressure ||
    messageType === NnrpMessageType.CreditUpdate ||
    messageType === NnrpMessageType.TraceContext ||
    messageType === NnrpMessageType.ErrorRecoverable ||
    messageType === NnrpMessageType.RetryAfter
  ) {
    return;
  }

  throw new NnrpProtocolError({
    code: "NNRP_SERVER_RUNTIME_MESSAGE_DIRECTION_INVALID",
    message: `Message type ${messageType} cannot be sent by a server session.`,
    source: "protocol",
    retryable: false,
  });
}

function closedError(target: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code: "NNRP_NATIVE_CLOSED",
    message: `Cannot use a closed ${target}.`,
    source: "native",
    retryable: false,
  });
}

function serverTerminalDuplicateError(frameId: number): NnrpProtocolError {
  return new NnrpProtocolError({
    code: "NNRP_SERVER_RESULT_TERMINAL_DUPLICATE",
    message: `Frame ${frameId} already has a terminal server result.`,
    source: "protocol",
    retryable: false,
  });
}

function inactiveOperationError(messageType: NnrpMessageType, operationId: bigint): NnrpProtocolError {
  return new NnrpProtocolError({
    code: "NNRP_OPERATION_UNKNOWN",
    message: `${NnrpMessageType[messageType]} references inactive operation ${operationId}.`,
    source: "core",
    retryable: false,
  });
}

function bindingNotConnectedError(operation: string): NnrpNativeBindingUnavailableError {
  return new NnrpNativeBindingUnavailableError({
    code: "NNRP_NATIVE_BINDING_NOT_CONNECTED",
    message: `Native binding operation '${operation}' is not connected to an FFI implementation yet.`,
    source: "native",
    retryable: false,
  });
}

function raceEventPoll<T>(promise: Promise<T>, options: NnrpEventPollOptions): Promise<T> {
  if (options.signal?.aborted) {
    return Promise.reject(eventPollCancelledError(options.signal));
  }

  if (options.timeoutMillis !== undefined) {
    return raceEventTimeout(promise, options.timeoutMillis, "native", options.signal);
  }

  const signal = options.signal;
  if (signal === undefined || signal.addEventListener === undefined || signal.removeEventListener === undefined) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.reject(eventPollCancelledError(signal));
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(eventPollCancelledError(signal));
    signal.addEventListener?.("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener?.("abort", onAbort));
  });
}

function raceEventTimeout<T>(
  promise: Promise<T>,
  timeoutMillis: number,
  source: "native",
  signal: NnrpAbortSignalLike | undefined,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(eventPollTimeoutError(source));
    }, timeoutMillis);
    const onAbort = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(eventPollCancelledError(signal));
      }
    };

    signal?.addEventListener?.("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      },
    ).finally(() => signal?.removeEventListener?.("abort", onAbort));
  });
}

function eventPollTimeoutError(source: "native"): NnrpTimeoutError {
  return new NnrpTimeoutError({
    code: "NNRP_EVENT_POLL_TIMEOUT",
    message: "Event polling timed out without receiving an event.",
    source,
    retryable: true,
  });
}

function eventPollCancelledError(signal: NnrpAbortSignalLike | undefined): NnrpTimeoutError {
  return new NnrpTimeoutError({
    code: "NNRP_EVENT_POLL_CANCELLED",
    message: "Event polling was cancelled.",
    source: "runtime",
    retryable: false,
    cause: signal?.reason,
  });
}

function nativeArtifactError(code: string, message: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code,
    message,
    source: "native",
    retryable: false,
  });
}

function nativeRuntimeReadinessError(code: string, message: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code,
    message,
    source: "native",
    retryable: false,
  });
}

type NodePlatform = NodeJS.Platform;

type NodeArchitecture = NodeJS.Architecture;
