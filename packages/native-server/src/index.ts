import {
  type BudgetMetadata,
  type CacheInvalidateMetadata,
  type CacheMissMetadata,
  type CacheReferenceMetadata,
  type ControlRequestMetadata,
  createCapabilityManifest,
  createTransportCandidates,
  createTransportSelectionSummary,
  decodeCacheInvalidateMetadata,
  decodeRuntimeControlMetadata,
  decodeRuntimeObjectMetadata,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  encodeRuntimeObjectMetadataSegments,
  type NnrpAbortSignalLike,
  type NnrpCapability,
  NnrpCapabilityError,
  type NnrpCapabilityManifest,
  type NnrpDiagnostic,
  type NnrpEventPollOptions,
  type NnrpInputProfile,
  NnrpMessageType,
  NnrpProtocolError,
  type NnrpResult,
  type NnrpRuntimeEvent,
  type NnrpRuntimeFrameEvent,
  type NnrpServerProviderRoutes,
  type NnrpSessionFlowControlOptions,
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
  type SchedulingMetadata,
  selectTransport,
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
const EXPECTED_ABI_MAJOR = 3;
const EXPECTED_ABI_MINOR = 0;
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
const FRAME_SUBMIT_METADATA_SIZE = 72;
const RESULT_PUSH_METADATA_SIZE = 64;
const EVENT_KIND_SESSION_CLOSED = 4;
const EVENT_KIND_SUBMIT_ACCEPTED = 5;
const EVENT_KIND_RUNTIME_FRAME = 13;

const serverRoleSessionClosers = new WeakMap<NnrpBackendRuntime, (sessionId: string) => Promise<void>>();
const serverAcceptors = new WeakMap<NnrpServer, () => Promise<NnrpNativeAcceptedSession>>();
const serverClosers = new WeakMap<NnrpServer, () => Promise<void>>();
const serverBoundProviderEndpoints = new WeakMap<
  NnrpServer,
  Readonly<Partial<Record<NnrpTransportKind, string>>>
>();
const serverRoleEventReceivers = new WeakMap<
  NnrpBackendRuntime,
  (request: NnrpNativeServerReceiveRequest) => Promise<NnrpRuntimeEvent>
>();
const serverRoleFrameSenders = new WeakMap<
  NnrpBackendRuntime,
  (request: NnrpNativeRuntimeFrameSendRequest) => Promise<void>
>();
const serverRoleResultSenders = new WeakMap<
  NnrpBackendRuntime,
  (sessionOptions: NnrpSessionOptions, result: NnrpResult) => Promise<void>
>();

interface InternalNativeHandle {
  readonly kind: number;
  readonly id: bigint | number;
  readonly generation: number;
  readonly flags: number;
}

interface InternalRoleEvent {
  readonly kind: number;
  readonly messageType: number;
  readonly connection: InternalNativeHandle;
  readonly session: InternalNativeHandle;
  readonly operation: InternalNativeHandle;
  readonly frameId: number;
  readonly payload: Uint8Array;
}

interface InternalServerRoleSession {
  readonly handle: InternalNativeHandle;
  poll(maxEvents: number, timeoutMillis: number): Promise<readonly InternalRoleEvent[]>;
  sendResult(operation: InternalNativeHandle, payload: Uint8Array): Promise<void>;
  sendRuntimeFrame(messageType: number, frameId: number, payload: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface InternalTransportServerRole {
  accept(sessionHandleId: bigint, generation: number, timeoutMillis: number): Promise<InternalServerRoleSession>;
  close(): Promise<void>;
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
  [SERVER_ROLE_ADOPT](serverId: bigint, generation: number): Promise<InternalTransportServerRole>;
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
  readonly sessionOptions: NnrpSessionOptions;
  readonly messageType: NnrpMessageType;
  readonly frameId: number;
  readonly payload: Uint8Array;
}

export interface NnrpNativeAcceptRequest {
  readonly endpoint: string;
  readonly providerRoutes?: NnrpServerProviderRoutes;
  readonly transportPolicy: NnrpTransportPolicy;
}

export interface NnrpNativeAcceptedSession {
  readonly sessionOptions?: NnrpSessionOptions;
  readonly activeTransport: NnrpTransportKind;
}

export interface NnrpNativeServerReceiveRequest {
  readonly sessionOptions: NnrpSessionOptions;
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

export interface NnrpSessionOptions extends NnrpSessionFlowControlOptions {
  readonly sessionId?: string;
  readonly inputProfile?: NnrpInputProfile;
  readonly targetCadence?: number;
  readonly qualityTier?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpBackendRuntimeOptions {
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly ffi?: NnrpNativeFfiBinding;
}

export interface NnrpListenOptions {
  readonly endpoint: string | URL;
  readonly providerRoutes?: NnrpServerProviderRoutes;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
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
  readonly #roleOperations = new Map<string, InternalNativeHandle>();

  public constructor(
    binding: NnrpNativeRuntimeBinding,
    transportPolicy: NnrpTransportPolicy = "auto",
    transportProviders: readonly NnrpNativeTransportProvider[] = [],
  ) {
    this.#binding = binding;
    this.#transportPolicy = transportPolicy;
    this.#transportProviders = [...transportProviders];
    serverRoleSessionClosers.set(this, (sessionId) => this.#closeRoleSession(sessionId));
    serverRoleEventReceivers.set(this, (request) => this.#receiveServerEvent(request));
    serverRoleFrameSenders.set(this, (request) => this.#sendRuntimeFrame(request));
    serverRoleResultSenders.set(this, (sessionOptions, result) => this.#sendServerResult(sessionOptions, result));
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

  #sendRuntimeFrame(request: NnrpNativeRuntimeFrameSendRequest): Promise<void> {
    this.#ensureOpen();
    const sendRuntimeFrame = this.#binding.ffi?.sendRuntimeFrame;
    if (sendRuntimeFrame !== undefined) {
      return Promise.resolve(sendRuntimeFrame(request));
    }
    const sessionId = request.sessionOptions.sessionId;
    if (sessionId === undefined) throw bindingNotConnectedError("sendRuntimeFrame");
    const session = this.#roleSessions.get(sessionId);
    if (session === undefined) return Promise.reject(bindingNotConnectedError("sendRuntimeFrame"));
    return session.sendRuntimeFrame(request.messageType, request.frameId, request.payload);
  }

  async #acceptServerSession(
    listenerKey: object,
    request: NnrpNativeAcceptRequest,
    providers: readonly NnrpNativeTransportProvider[],
  ): Promise<NnrpNativeAcceptedSession> {
    this.#ensureOpen();
    const accept = this.#binding.ffi?.accept;
    if (accept !== undefined) {
      const accepted = await accept(request);
      if (accepted === undefined) throw bindingNotConnectedError("accept");
      return accepted;
    }
    const server = await this.#roleServer(
      listenerKey,
      request.endpoint,
      request.providerRoutes,
      request.transportPolicy,
      providers,
    );
    const accepted = await server.accept(allocateNativeRoleId("session"), 1, 0);
    const nativeSession = accepted.session;
    const sessionId = `native-server-session-${nativeSession.handle.id.toString()}`;
    this.#roleSessions.set(sessionId, nativeSession);
    return { sessionOptions: { sessionId }, activeTransport: accepted.activeTransport };
  }

  async #receiveServerEvent(request: NnrpNativeServerReceiveRequest): Promise<NnrpRuntimeEvent> {
    this.#ensureOpen();
    const receive = this.#binding.ffi?.receive;
    if (receive !== undefined) {
      return await receive(request);
    }
    const sessionId = request.sessionOptions.sessionId;
    if (sessionId === undefined) throw bindingNotConnectedError("receive");
    const session = this.#roleSessions.get(sessionId);
    if (session === undefined) throw bindingNotConnectedError("receive");
    const events = await session.poll(1, request.timeoutMillis ?? 0);
    const event = events[0];
    if (event === undefined) throw eventPollTimeoutError("native");
    if (event.kind === EVENT_KIND_SUBMIT_ACCEPTED) {
      this.#roleOperations.set(`${sessionId}:${event.frameId}`, event.operation);
      return decodeServerSubmitEvent(event, sessionId);
    }
    if (event.kind === EVENT_KIND_SESSION_CLOSED) {
      return { type: "close", sessionId };
    }
    if (event.kind === EVENT_KIND_RUNTIME_FRAME) {
      return decodeRuntimeFrameEvent(event.messageType as NnrpMessageType, event.payload, sessionId);
    }
    return {
      type: "diagnostic",
      sessionId,
      diagnostic: {
        code: "NNRP_NATIVE_SERVER_ROLE_EVENT",
        message: `Native server role emitted event kind ${event.kind}.`,
        source: "native",
        retryable: false,
      },
    };
  }

  #sendServerResult(sessionOptions: NnrpSessionOptions, result: NnrpResult): Promise<void> {
    const sessionId = sessionOptions.sessionId;
    const session = sessionId === undefined ? undefined : this.#roleSessions.get(sessionId);
    const operation = sessionId === undefined ? undefined : this.#roleOperations.get(`${sessionId}:${result.frameId}`);
    if (session === undefined || operation === undefined) {
      return Promise.reject(bindingNotConnectedError("sendResult"));
    }
    return session.sendResult(operation, encodeResultPushPayload(result)).then(() => {
      this.#roleOperations.delete(`${sessionId}:${result.frameId}`);
    });
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
    const listenerKey = {};
    const providerRoutes = copyServerProviderRoutes(options.providerRoutes);
    const state: NnrpServerState = {
      endpoint: normalizeEndpoint(options.endpoint),
      ...(providerRoutes === undefined ? {} : { providerRoutes }),
      runtime: this,
      transports: providers,
      transportPolicy: options.transportPolicy ?? this.#transportPolicy,
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
      () =>
        this.#acceptServerSession(
          listenerKey,
          {
            endpoint: state.endpoint,
            ...(state.providerRoutes === undefined ? {} : { providerRoutes: state.providerRoutes }),
            transportPolicy: state.transportPolicy,
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

  async #closeRoleSession(sessionId: string): Promise<void> {
    const session = this.#roleSessions.get(sessionId);
    if (session === undefined) return;
    this.#roleSessions.delete(sessionId);
    for (const operationKey of this.#roleOperations.keys()) {
      if (operationKey.startsWith(`${sessionId}:`)) this.#roleOperations.delete(operationKey);
    }
    await session.close();
  }

  #roleServer(
    listenerKey: object,
    endpoint: string,
    providerRoutes: NnrpServerProviderRoutes | undefined,
    policy: NnrpTransportPolicy,
    providers: readonly NnrpNativeTransportProvider[],
  ): Promise<InternalServerRole> {
    let server = this.#roleServers.get(listenerKey);
    if (server !== undefined) return server;
    server = listenServerRoles(
      endpoint,
      providerRoutes,
      providers,
      policy,
      allocateNativeRoleId("connection"),
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
          role: await adoption.call(listener, nextServerId, 1),
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

function decodeServerSubmitEvent(event: InternalRoleEvent, sessionId: string): NnrpRuntimeEvent {
  if (event.payload.byteLength < FRAME_SUBMIT_METADATA_SIZE) {
    throw new NnrpProtocolError({
      code: "NNRP_NATIVE_SUBMIT_METADATA_TRUNCATED",
      message: "Native server submit event omitted the fixed FRAME_SUBMIT metadata.",
      source: "native",
      retryable: false,
    });
  }
  const view = new DataView(event.payload.buffer, event.payload.byteOffset, event.payload.byteLength);
  const payloadKind = view.getUint32(64, true);
  const inputProfile = payloadKind === 0x01
    ? "tensor"
    : payloadKind === 0x02
    ? "token"
    : payloadKind === 0x10
    ? "structured_event"
    : payloadKind === 0x20
    ? "tool_delta"
    : undefined;
  return {
    type: "submit",
    sessionId,
    submit: {
      operationId: view.getBigUint64(40, true),
      frameId: event.frameId,
      payload: event.payload.slice(FRAME_SUBMIT_METADATA_SIZE),
      ...(inputProfile === undefined ? {} : { inputProfile }),
      submitMode: view.getUint8(52) === 1 ? "object-reference" : "inline",
    },
  };
}

function encodeResultPushPayload(result: NnrpResult): Uint8Array {
  const payload = result.payload ?? EMPTY_PAYLOAD;
  const output = new Uint8Array(RESULT_PUSH_METADATA_SIZE + payload.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(56, 0x40, true);
  view.setUint16(60, 1, true);
  output.set(payload, RESULT_PUSH_METADATA_SIZE);
  return output;
}

function decodeRuntimeFrameEvent(
  messageType: NnrpMessageType,
  payload: Uint8Array,
  sessionId: string,
): NnrpRuntimeFrameEvent {
  const scope = { sessionId };
  switch (messageType) {
    case NnrpMessageType.Cancel:
    case NnrpMessageType.Abort: {
      const { metadata, tail } = decodeRuntimeControlMetadata(messageType, payload);
      return {
        type: messageType === NnrpMessageType.Cancel ? "cancel" : "abort",
        messageType,
        metadata: metadata as ControlRequestMetadata,
        diagnostic: tail,
        ...scope,
      } as NnrpRuntimeFrameEvent;
    }
    case NnrpMessageType.PriorityUpdate:
    case NnrpMessageType.Deadline:
    case NnrpMessageType.ExpireAt: {
      const { metadata } = decodeRuntimeControlMetadata(messageType, payload);
      const type = messageType === NnrpMessageType.PriorityUpdate
        ? "priority-update"
        : messageType === NnrpMessageType.Deadline
        ? "deadline"
        : "expire-at";
      return { type, messageType, metadata: metadata as SchedulingMetadata, ...scope } as NnrpRuntimeFrameEvent;
    }
    case NnrpMessageType.Supersede:
    case NnrpMessageType.CapabilityNegotiation:
    case NnrpMessageType.DegradeProfile:
    case NnrpMessageType.RouteHint:
    case NnrpMessageType.ExecutionHint:
    case NnrpMessageType.TraceContext:
    case NnrpMessageType.Progress:
    case NnrpMessageType.PartialResult:
    case NnrpMessageType.ResultDropReason:
    case NnrpMessageType.ErrorRecoverable:
    case NnrpMessageType.RetryAfter: {
      const { metadata, tail } = decodeRuntimeControlMetadata(messageType, payload);
      return runtimeControlEventWithTail(messageType, metadata, tail, scope);
    }
    case NnrpMessageType.BudgetUpdate:
    case NnrpMessageType.Backpressure:
    case NnrpMessageType.CreditUpdate: {
      const { metadata } = decodeRuntimeControlMetadata(messageType, payload);
      if (messageType === NnrpMessageType.BudgetUpdate) {
        return { type: "budget-update", messageType, metadata: metadata as BudgetMetadata, ...scope };
      }
      return {
        type: messageType === NnrpMessageType.Backpressure ? "backpressure" : "credit-update",
        messageType,
        metadata: metadata as PressureMetadata,
        ...scope,
      } as NnrpRuntimeFrameEvent;
    }
    case NnrpMessageType.ObjectDeclare:
    case NnrpMessageType.ObjectRef:
    case NnrpMessageType.ObjectRelease:
    case NnrpMessageType.ObjectPatch:
    case NnrpMessageType.ObjectDelta:
    case NnrpMessageType.CacheReference:
    case NnrpMessageType.CacheMiss: {
      const { metadata, tail } = decodeRuntimeObjectMetadata(messageType, payload);
      return runtimeObjectEvent(messageType, metadata, tail, scope);
    }
    case NnrpMessageType.CacheInvalidate:
      return {
        type: "cache-invalidate",
        messageType,
        metadata: decodeCacheInvalidateMetadata(payload),
        ...scope,
      };
    default:
      throw nativeArtifactError(
        "NNRP_NATIVE_RUNTIME_MESSAGE_UNSUPPORTED",
        `Native server event returned unsupported runtime message type 0x${Number(messageType).toString(16)}.`,
      );
  }
}

function runtimeControlEventWithTail(
  messageType: NnrpMessageType,
  metadata: RuntimeControlMetadata,
  tail: Uint8Array,
  scope: { readonly sessionId: string },
): NnrpRuntimeFrameEvent {
  const mapping = RUNTIME_CONTROL_EVENT_MAPPINGS[messageType];
  if (mapping === undefined) throw new Error(`runtime control message ${messageType} has no event mapping`);
  return {
    type: mapping.type,
    messageType,
    metadata,
    [mapping.tail]: tail,
    ...scope,
  } as NnrpRuntimeFrameEvent;
}

function runtimeObjectEvent(
  messageType: NnrpMessageType,
  metadata:
    | ObjectDescriptorMetadata
    | ObjectReferenceMetadata
    | ObjectReleaseMetadata
    | ObjectDeltaMetadata
    | CacheReferenceMetadata
    | CacheMissMetadata,
  tail: Uint8Array,
  scope: { readonly sessionId: string },
): NnrpRuntimeFrameEvent {
  if (messageType === NnrpMessageType.ObjectPatch || messageType === NnrpMessageType.ObjectDelta) {
    const delta = metadata as ObjectDeltaMetadata;
    return {
      type: messageType === NnrpMessageType.ObjectPatch ? "object-patch" : "object-delta",
      messageType,
      metadata: delta,
      metadataBody: tail.slice(0, delta.metadataBytes),
      delta: tail.slice(delta.metadataBytes),
      ...scope,
    } as NnrpRuntimeFrameEvent;
  }
  const mapping = RUNTIME_OBJECT_EVENT_MAPPINGS[messageType];
  if (mapping === undefined) throw new Error(`runtime object message ${messageType} has no event mapping`);
  return {
    type: mapping.type,
    messageType,
    metadata,
    [mapping.tail]: tail,
    ...scope,
  } as NnrpRuntimeFrameEvent;
}

const RUNTIME_CONTROL_EVENT_MAPPINGS: Readonly<
  Partial<Record<NnrpMessageType, { readonly type: string; readonly tail: "body" | "diagnostic" }>>
> = {
  [NnrpMessageType.Supersede]: { type: "supersede", tail: "diagnostic" },
  [NnrpMessageType.CapabilityNegotiation]: { type: "capability-negotiation", tail: "body" },
  [NnrpMessageType.DegradeProfile]: { type: "degrade-profile", tail: "body" },
  [NnrpMessageType.RouteHint]: { type: "route-hint", tail: "body" },
  [NnrpMessageType.ExecutionHint]: { type: "execution-hint", tail: "body" },
  [NnrpMessageType.TraceContext]: { type: "trace-context", tail: "body" },
  [NnrpMessageType.Progress]: { type: "progress", tail: "body" },
  [NnrpMessageType.PartialResult]: { type: "partial-result", tail: "body" },
  [NnrpMessageType.ResultDropReason]: { type: "result-drop-reason", tail: "diagnostic" },
  [NnrpMessageType.ErrorRecoverable]: { type: "recoverable-error", tail: "diagnostic" },
  [NnrpMessageType.RetryAfter]: { type: "retry-after", tail: "diagnostic" },
};

const RUNTIME_OBJECT_EVENT_MAPPINGS: Readonly<
  Partial<Record<NnrpMessageType, { readonly type: string; readonly tail: "body" | "diagnostic" }>>
> = {
  [NnrpMessageType.ObjectDeclare]: { type: "object-declare", tail: "body" },
  [NnrpMessageType.ObjectRef]: { type: "object-ref", tail: "body" },
  [NnrpMessageType.ObjectRelease]: { type: "object-release", tail: "diagnostic" },
  [NnrpMessageType.CacheReference]: { type: "cache-reference", tail: "body" },
  [NnrpMessageType.CacheMiss]: { type: "cache-miss", tail: "diagnostic" },
};

export interface NnrpServerState {
  readonly endpoint: string;
  readonly providerRoutes?: NnrpServerProviderRoutes;
  readonly runtime: NnrpBackendRuntime;
  readonly transports: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy: NnrpTransportPolicy;
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

  public accept(): Promise<NnrpServerSession> {
    try {
      this.#ensureOpen();
    } catch (error) {
      return Promise.reject(error);
    }

    const accept = serverAcceptors.get(this);
    if (accept === undefined) return Promise.reject(bindingNotConnectedError("accept"));
    return accept().then(
      async (accepted) => {
        const session = new NnrpServerSession({
          runtime: this.#state.runtime,
          options: accepted.sessionOptions ?? {},
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

export interface NnrpServerSessionState {
  readonly runtime: NnrpBackendRuntime;
  readonly options: NnrpSessionOptions;
  readonly activeTransport: NnrpTransportKind;
}

export class NnrpServerSession {
  readonly #state: NnrpServerSessionState | undefined;
  readonly #runtimeObjects = new RuntimeObjectLifecycle();
  readonly #frameByOperation = new Map<bigint, number>();
  readonly #terminalFrames = new Set<number>();
  #runtimeObjectQueue: Promise<void> = Promise.resolve();
  #nextRuntimeFrameId = 1;
  #closed = false;

  public constructor(state?: NnrpServerSessionState) {
    this.#state = state;
  }

  public get options(): NnrpSessionOptions {
    return this.#state?.options ?? {};
  }

  public get sessionId(): string {
    return this.options.sessionId ?? "";
  }

  public get activeTransport(): NnrpTransportKind {
    const activeTransport = this.#state?.activeTransport;
    if (activeTransport === undefined) throw bindingNotConnectedError("activeTransport");
    return activeTransport;
  }

  public receive(options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    const state = this.#state;
    if (state === undefined) {
      return Promise.reject(bindingNotConnectedError("receive"));
    }

    return raceEventPoll(
      (serverRoleEventReceivers.get(state.runtime) ?? (() => Promise.reject(bindingNotConnectedError("receive"))))({
        sessionOptions: state.options,
        ...(options.timeoutMillis === undefined ? {} : { timeoutMillis: options.timeoutMillis }),
      }),
      options,
    ).then(async (event) => {
      await this.#releaseForTerminalControl(event);
      if (event.type === "submit") this.#frameByOperation.set(event.submit.operationId, event.submit.frameId);
      return event;
    });
  }

  public sendResult(result: NnrpResult): Promise<void> {
    this.#ensureOpen();
    const state = this.#state;
    if (state === undefined) return Promise.reject(bindingNotConnectedError("sendResult"));
    const sendResult = serverRoleResultSenders.get(state.runtime);
    if (sendResult === undefined) return Promise.reject(bindingNotConnectedError("sendResult"));
    if (this.#terminalFrames.has(result.frameId)) {
      return Promise.reject(serverTerminalDuplicateError(result.frameId));
    }
    this.#terminalFrames.add(result.frameId);
    return sendResult(state.options, result).catch((error) => {
      this.#terminalFrames.delete(result.frameId);
      throw error;
    });
  }

  public sendProgress(metadata: ProgressMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.Progress, metadata, body);
  }

  public sendPartialResult(metadata: PartialResultMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.PartialResult, metadata, body);
  }

  public sendBackpressure(metadata: PressureMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.Backpressure, metadata);
  }

  public sendCreditUpdate(metadata: PressureMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.CreditUpdate, metadata);
  }

  public sendResultDropReason(
    metadata: ResultDropReasonMetadata,
    diagnostic: Uint8Array = EMPTY_PAYLOAD,
  ): Promise<void> {
    return this.sendControl(NnrpMessageType.ResultDropReason, metadata, diagnostic);
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
      if (messageType === NnrpMessageType.Progress || messageType === NnrpMessageType.PartialResult) {
        this.#ensureIncrementalAllowed((metadata as ProgressMetadata | PartialResultMetadata).operationId);
      }
      return this.#sendRuntimeFrame(messageType, encodeRuntimeControlMetadata(messageType, metadata, tail));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#frameByOperation.clear();
    this.#terminalFrames.clear();
    this.#runtimeObjects.clear();
    const state = this.#state;
    const closeRoleSession = state === undefined ? undefined : serverRoleSessionClosers.get(state.runtime);
    if (closeRoleSession !== undefined) {
      await closeRoleSession(this.sessionId);
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
      await this.#sendRuntimeFrame(messageType, payload);
      this.#runtimeObjects.commit(messageType, metadata);
    });
    this.#runtimeObjectQueue = send.catch(() => undefined);
    return send;
  }

  async #releaseForTerminalControl(event: NnrpRuntimeEvent): Promise<void> {
    if (event.type === "cancel" || event.type === "abort") {
      await this.#releaseOperationObjects(event.metadata.operationId, ObjectReleaseReason.Cancelled);
    } else if (event.type === "supersede") {
      await this.#releaseOperationObjects(event.metadata.oldOperationId, ObjectReleaseReason.Replaced);
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

  #ensureIncrementalAllowed(operationId: bigint): void {
    const frameId = this.#frameByOperation.get(operationId);
    if (frameId !== undefined && this.#terminalFrames.has(frameId)) {
      throw new NnrpProtocolError({
        code: "NNRP_SERVER_INCREMENTAL_AFTER_TERMINAL",
        message: `Operation ${operationId} already reached terminal frame ${frameId}.`,
        source: "protocol",
        retryable: false,
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
      return sendRuntimeFrame({
        sessionOptions: state.options,
        messageType,
        frameId,
        payload,
      });
    } catch (error) {
      return Promise.reject(error);
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
    messageType === NnrpMessageType.Progress ||
    messageType === NnrpMessageType.PartialResult ||
    messageType === NnrpMessageType.Backpressure ||
    messageType === NnrpMessageType.CreditUpdate ||
    messageType === NnrpMessageType.TraceContext ||
    messageType === NnrpMessageType.ResultDropReason ||
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
