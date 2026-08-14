import {
  type BudgetMetadata,
  type CacheInvalidateMetadata,
  type CacheMissMetadata,
  type CacheReferenceMetadata,
  type CapabilityMetadata,
  type ControlRequestMetadata,
  createCapabilityManifest,
  createNnrpResultFromLifecycle,
  createNnrpResultFromRuntimeEvent,
  createTransportSelectionSummary,
  decodeNnrpRuntimeEvent,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  encodeRuntimeObjectMetadataSegments,
  encodeSubmitPayload,
  NNRP_STANDARD_PROFILE_TOKEN,
  NNRP_TOKEN_DELTA_SCHEMA_ID,
  NNRP_TOKEN_DELTA_SCHEMA_VERSION,
  type NnrpAbortSignalLike,
  type NnrpCacheObjectKind,
  type NnrpCapability,
  NnrpCapabilityError,
  type NnrpCapabilityManifest,
  type NnrpClientEvent,
  type NnrpClientProviderRoutes,
  type NnrpDiagnostic,
  NnrpEndpoint,
  type NnrpEventPollOptions,
  NnrpFlowScopeKind,
  NnrpMessageType,
  type NnrpNormalizedSubmitRequest,
  type NnrpOperationLifecycleEvent,
  type NnrpOperationState,
  NnrpProtocolError,
  NnrpRecoveryError,
  type NnrpResult,
  type NnrpRuntimeEvent,
  type NnrpRuntimeFrameHeader,
  type NnrpSessionMigrationRequest,
  type NnrpSessionPatchRequest,
  type NnrpSessionPatchResult,
  NnrpSessionPriorityClass,
  NnrpSessionRecoveryTicket,
  type NnrpSubmitOptions,
  type NnrpSubmitRequest,
  NnrpTimeoutError,
  type NnrpTransportCandidateReadiness,
  type NnrpTransportClientSecurity,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  type NnrpTransportProbeMetrics,
  type NnrpTransportProbeObservation,
  type NnrpTransportProbeOptions,
  type NnrpTransportProvider,
  type NnrpTransportProviderDescriptor,
  type NnrpTransportRejectionReason,
  type NnrpTransportSelectionOptions,
  type NnrpTransportSelectionSummary,
  normalizeSessionMigrationRequest,
  normalizeSessionPatchRequest,
  normalizeSubmitRequest,
  type ObjectDeltaMetadata,
  type ObjectDescriptorMetadata,
  type ObjectReferenceMetadata,
  type ObjectReleaseMetadata,
  ObjectReleaseReason,
  OwnershipHint,
  resolveProviderEndpoint,
  type RouteHintMetadata,
  type RuntimeControlMetadata,
  RuntimeRole,
  type SchedulingMetadata,
  selectTransport,
  type SupersedeMetadata,
  type TraceContextMetadata,
  validateEventPollOptions,
} from "@nnrp/core";
const EXPECTED_PROTOCOL_MAJOR = 1;
const EXPECTED_PROTOCOL_WIRE_FORMAT = 0;
const EXPECTED_ABI_MAJOR = 4;
const EXPECTED_ABI_MINOR = 4;
const EXPECTED_ABI_PATCH = 0;
const TRANSPORT_KINDS = ["tcp", "quic", "ipc", "websocket"] as const satisfies readonly NnrpTransportKind[];

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
const RUNTIME_FEATURE_CLIENT_API = 0x0000000000000002n;
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
  RUNTIME_FEATURE_CLIENT_API |
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
const CLIENT_ROLE_ADOPT = Symbol.for("nnrp.internal.native.client-role-adopt.v1");
const NATIVE_ROLE_IDS = Symbol.for("nnrp.internal.native.role-handle-ids.v1");
const EVENT_KIND_RESULT_PUSHED = 6;
const EVENT_KIND_OPERATION_LIFECYCLE = 14;

const clientRoleSessionClosers = new WeakMap<NnrpBackendRuntime, (sessionId: string) => Promise<void>>();
const clientRoutedEventReaders = new WeakMap<
  NnrpClient,
  (routingKey: string, options?: NnrpEventPollOptions) => Promise<NnrpClientEvent>
>();
const clientSessionStateReleasers = new WeakMap<
  NnrpClient,
  (sessionId: number, routingKey: string) => void
>();
const clientSessionRoutingKeys = new WeakMap<NnrpClientSession, string>();
interface InternalClientSessionRegistration {
  readonly routingKey: string;
  readonly sessionId: number;
}

const clientRoleSessionOpeners = new WeakMap<
  NnrpBackendRuntime,
  (options: NnrpNormalizedSessionOptions) => Promise<InternalClientSessionRegistration>
>();
const clientRoleSessionResumers = new WeakMap<
  NnrpBackendRuntime,
  (
    ticket: NnrpSessionRecoveryTicket,
    options: NnrpNormalizedSessionOptions,
  ) => Promise<InternalClientSessionRegistration>
>();
const clientRoleRecoveryTicketReaders = new WeakMap<
  NnrpBackendRuntime,
  (routingKey: string) => Uint8Array | undefined
>();
const runtimeEventOperationIds = new WeakMap<NnrpRuntimeEvent, bigint>();
const runtimeSessionRoutingKeys = new WeakMap<NnrpSessionOptions, string>();

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

interface InternalClientRoleSession {
  readonly handle: InternalNativeHandle;
  readonly sessionId: number;
  submit(
    operationId: bigint,
    frameId: number,
    headerFlags: number,
    viewId: number,
    routeId: number,
    traceId: bigint,
    payload: Uint8Array,
  ): Promise<InternalNativeHandle>;
  poll(maxEvents: number, timeoutMillis: number): Promise<readonly InternalRoleEvent[]>;
  sendRuntimeFrame(messageType: number, frameId: number, payload: Uint8Array): Promise<void>;
  recoveryTicket(): Uint8Array | undefined;
  close(): Promise<void>;
}

interface InternalClientRoleConnection {
  openSession(options: InternalClientSessionOpenOptions): Promise<InternalClientRoleSession>;
  resumeSession(
    options: InternalClientSessionOpenOptions,
    recoveryTicket: Uint8Array,
  ): Promise<InternalClientRoleSession>;
  close(): Promise<void>;
}

interface InternalClientSessionOpenOptions {
  readonly requestedSessionId: number;
  readonly sessionHandleId: bigint;
  readonly generation: number;
  readonly profileId: number;
  readonly priorityClass: number;
  readonly allowResume: boolean;
  readonly schemaId: number;
  readonly schemaVersion: number;
  readonly defaultDeadlineMillis: number;
  readonly maxInFlightOperations: number;
  readonly leaseTtlHintMillis: number;
  readonly resumeTokenBytes: number;
  readonly cacheHints: readonly number[];
}

interface InternalRoleCarrier {
  [CLIENT_ROLE_ADOPT](connectionId: bigint, generation: number): Promise<InternalClientRoleConnection>;
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

export interface NnrpNativeSubmitResultCompactRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly submit: NnrpNormalizedSubmitRequest;
  readonly resultPayload?: Uint8Array;
  readonly maxEvents?: number;
}

export interface NnrpNativeSubmitNoWaitRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly submit: NnrpNormalizedSubmitRequest;
}

export interface NnrpNativeSubmitValidationRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly submit: NnrpNormalizedSubmitRequest;
}

export interface NnrpNativeRuntimeFrameSendRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly messageType: NnrpMessageType;
  readonly frameId: number;
  readonly payload: Uint8Array;
}

export interface NnrpNativeSessionPatchRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly patch: NnrpSessionPatchRequest;
}

export interface NnrpNativeEventBatchRequest {
  readonly maxEvents: number;
  readonly timeoutMillis?: number;
}

export interface NnrpNativeClientEventBatchItem {
  readonly sessionId: number;
  readonly event: NnrpClientEvent;
}

export interface NnrpNativeFfiBinding {
  readonly mode?: "native-addon" | "node-ffi" | "deno-ffi" | "nano-ffi" | "test";
  runtimeCapabilities?(): NnrpNativeRuntimeCapabilities | Promise<NnrpNativeRuntimeCapabilities>;
  validateSubmit?(
    request: NnrpNativeSubmitValidationRequest,
  ): NnrpNormalizedSubmitRequest | void | Promise<NnrpNormalizedSubmitRequest | void>;
  submitResultCompact?(request: NnrpNativeSubmitResultCompactRequest): NnrpResult | Promise<NnrpResult>;
  submitNoWait?(request: NnrpNativeSubmitNoWaitRequest): bigint | Promise<bigint>;
  sendRuntimeFrame?(request: NnrpNativeRuntimeFrameSendRequest): void | Promise<void>;
  patchSession?(
    request: NnrpNativeSessionPatchRequest,
  ): NnrpSessionPatchResult | void | Promise<NnrpSessionPatchResult | void>;
  awaitEvents?(
    request: NnrpNativeEventBatchRequest,
  ): readonly NnrpNativeClientEventBatchItem[] | Promise<readonly NnrpNativeClientEventBatchItem[]>;
  close?(): void | Promise<void>;
}

export interface NnrpSessionOptions {
  readonly requestedSessionId?: number;
  readonly profileId?: number;
  readonly schemaId?: number;
  readonly schemaVersion?: number;
  readonly priorityClass?: NnrpSessionPriorityClass;
  readonly defaultDeadlineMillis?: number;
  readonly maxInFlightOperations?: number;
  readonly leaseTtlHintMillis?: number;
  readonly allowResume?: boolean;
  readonly resumeTokenBytes?: number;
  readonly cacheHints?: readonly NnrpCacheObjectKind[];
}

interface NnrpNormalizedSessionOptions {
  readonly requestedSessionId: number;
  readonly profileId: number;
  readonly schemaId: number;
  readonly schemaVersion: number;
  readonly priorityClass: NnrpSessionPriorityClass;
  readonly defaultDeadlineMillis: number;
  readonly maxInFlightOperations: number;
  readonly leaseTtlHintMillis: number;
  readonly allowResume: boolean;
  readonly resumeTokenBytes: number;
  readonly cacheHints: readonly NnrpCacheObjectKind[];
}

export interface NnrpNativeClientOptions {
  readonly endpoint: NnrpEndpoint;
  readonly providerRoutes?: NnrpClientProviderRoutes;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
  readonly ffi?: NnrpNativeFfiBinding;
}

interface NnrpBackendRuntimeOptions {
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly ffi?: NnrpNativeFfiBinding;
}

export interface NnrpConnectOptions {
  readonly endpoint: NnrpEndpoint;
  readonly providerRoutes?: NnrpClientProviderRoutes;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
}

export interface NnrpNativeTransportProvider extends NnrpTransportProvider {
  readonly kind: NnrpTransportKind;
  probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
  connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
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

export async function openNativeClient(options: NnrpNativeClientOptions): Promise<NnrpClient> {
  const runtime = await openBackendRuntime(options);

  try {
    return await runtime.connect({
      endpoint: options.endpoint,
      ...(options.providerRoutes === undefined ? {} : { providerRoutes: options.providerRoutes }),
      ...(options.transportPolicy === undefined ? {} : { transportPolicy: options.transportPolicy }),
      ...(options.sessionDefaults === undefined ? {} : { sessionDefaults: options.sessionDefaults }),
    });
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

async function openBackendRuntime(options: NnrpBackendRuntimeOptions = {}): Promise<NnrpBackendRuntime> {
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

class NnrpBackendRuntime {
  readonly #binding: NnrpNativeRuntimeBinding;
  readonly #transportPolicy: NnrpTransportPolicy;
  readonly #transportProviders: readonly NnrpNativeTransportProvider[];
  #closed = false;
  #roleConnection: InternalClientRoleConnection | undefined;
  readonly #roleSessions = new Map<string, Promise<InternalClientRoleSession>>();
  readonly #resolvedRoleSessions = new Map<string, InternalClientRoleSession>();

  public constructor(
    binding: NnrpNativeRuntimeBinding,
    transportPolicy: NnrpTransportPolicy = "auto",
    transportProviders: readonly NnrpNativeTransportProvider[] = [],
  ) {
    this.#binding = binding;
    this.#transportPolicy = transportPolicy;
    this.#transportProviders = [...transportProviders];
    clientRoleSessionOpeners.set(
      this,
      async (options) =>
        this.#binding.ffi === undefined ? await this.#roleSession(options) : {
          routingKey: `wire-${options.requestedSessionId}`,
          sessionId: options.requestedSessionId,
        },
    );
    clientRoleSessionResumers.set(this, async (ticket, options) => {
      if (this.#binding.ffi !== undefined) {
        throw new NnrpRecoveryError({
          code: "NNRP_NATIVE_RESUME_UNAVAILABLE",
          message: "The explicit FFI binding does not expose executable session resume.",
          source: "native",
          retryable: false,
        });
      }
      return await this.#roleSession(options, ticket);
    });
    clientRoleRecoveryTicketReaders.set(
      this,
      (routingKey) => this.#resolvedRoleSessions.get(routingKey)?.recoveryTicket(),
    );
    clientRoleSessionClosers.set(this, (sessionId) => this.#closeRoleSession(sessionId));
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

  public async submitResultCompact(request: NnrpNativeSubmitResultCompactRequest): Promise<NnrpResult> {
    this.#ensureOpen();
    const submitResultCompact = this.#binding.ffi?.submitResultCompact;
    if (submitResultCompact !== undefined) {
      return await submitResultCompact(await this.#validateSubmit(request));
    }
    const validated = await this.#validateSubmit(request);
    const session = await this.#roleSessionForOptions(validated.sessionOptions);
    await session.submit(
      validated.submit.operationId,
      validated.submit.frameId,
      validated.submit.header.flags,
      validated.submit.header.viewId,
      validated.submit.header.routeId,
      validated.submit.header.traceId,
      encodeSubmitPayload(validated.submit),
    );
    while (true) {
      const events = await session.poll(Math.max(validated.maxEvents ?? 1, 1), 1);
      for (const candidate of events) {
        if (candidate.relatedOperationId !== validated.submit.operationId) continue;
        if (candidate.relatedFrameId !== 0 && candidate.relatedFrameId !== validated.submit.frameId) {
          throw new NnrpProtocolError({
            code: "NNRP_OPERATION_FRAME_MISMATCH",
            message:
              `Operation ${validated.submit.operationId} is bound to frame ${validated.submit.frameId}, but the native result referenced frame ${candidate.relatedFrameId}.`,
            source: "native",
            retryable: false,
          });
        }
        const decoded = decodeClientRoleEvent(candidate);
        if (decoded.type === "runtime" && candidate.kind === EVENT_KIND_RESULT_PUSHED) {
          return createNnrpResultFromRuntimeEvent(validated.submit.operationId, decoded.event);
        }
        if (decoded.type === "lifecycle" && isTerminalOperationState(decoded.event.state)) {
          return createNnrpResultFromLifecycle(decoded.event);
        }
      }
    }
  }

  public async submitNoWait(request: NnrpNativeSubmitNoWaitRequest): Promise<bigint> {
    this.#ensureOpen();
    const submitNoWait = this.#binding.ffi?.submitNoWait;
    if (submitNoWait !== undefined) {
      return await submitNoWait(await this.#validateSubmit(request));
    }
    const validated = await this.#validateSubmit(request);
    const session = await this.#roleSessionForOptions(validated.sessionOptions);
    await session.submit(
      validated.submit.operationId,
      validated.submit.frameId,
      validated.submit.header.flags,
      validated.submit.header.viewId,
      validated.submit.header.routeId,
      validated.submit.header.traceId,
      encodeSubmitPayload(validated.submit),
    );
    return validated.submit.operationId;
  }

  public sendRuntimeFrame(request: NnrpNativeRuntimeFrameSendRequest): Promise<void> {
    this.#ensureOpen();
    const sendRuntimeFrame = this.#binding.ffi?.sendRuntimeFrame;
    if (sendRuntimeFrame !== undefined) {
      return Promise.resolve(sendRuntimeFrame(request));
    }
    return this.#roleSessionForOptions(request.sessionOptions).then((session) =>
      session.sendRuntimeFrame(request.messageType, request.frameId, request.payload)
    );
  }

  public async patchSession(request: NnrpNativeSessionPatchRequest): Promise<NnrpSessionPatchResult> {
    this.#ensureOpen();
    const patchSession = this.#binding.ffi?.patchSession;
    if (patchSession === undefined) {
      throw bindingNotConnectedError("patchSession");
    }

    return await patchSession(request) ?? {
      accepted: true,
      ...(request.sessionOptions.requestedSessionId === undefined
        ? {}
        : { sessionId: request.sessionOptions.requestedSessionId }),
    };
  }

  public async awaitEvents(request: NnrpNativeEventBatchRequest): Promise<readonly NnrpNativeClientEventBatchItem[]> {
    this.#ensureOpen();
    const awaitEvents = this.#binding.ffi?.awaitEvents;
    if (awaitEvents !== undefined) {
      return await awaitEvents(request);
    }
    const events: NnrpNativeClientEventBatchItem[] = [];
    for (const pendingSession of this.#roleSessions.values()) {
      if (events.length >= request.maxEvents) break;
      const session = await pendingSession;
      const polled = await session.poll(
        request.maxEvents - events.length,
        request.timeoutMillis ?? 0,
      );
      events.push(...polled.map((event) => ({
        sessionId: session.sessionId,
        event: decodeClientRoleEvent(event),
      })));
    }
    return events;
  }

  public async connect(options: NnrpConnectOptions): Promise<NnrpClient> {
    this.#ensureOpen();
    this.#ensureConnectReady("connect");
    validateEndpoint(options.endpoint);
    validateTransportProvidersForPolicy(
      options.transports ?? this.#transportProviders,
      options.transportPolicy ?? this.#transportPolicy,
    );
    validateClientProviderRouteKeys(options.providerRoutes);

    if (this.#binding.ffi === undefined) {
      this.#roleConnection = await connectClientRole(
        options.endpoint,
        options.providerRoutes,
        options.transports ?? this.#transportProviders,
        options.transportPolicy ?? this.#transportPolicy,
      );
    }

    return new NnrpClient({
      endpoint: normalizeEndpoint(options.endpoint),
      runtime: this,
      transports: options.transports ?? this.#transportProviders,
      transportPolicy: options.transportPolicy ?? this.#transportPolicy,
      ...(options.sessionDefaults === undefined ? {} : { sessionDefaults: options.sessionDefaults }),
    });
  }

  public selectTransport(options: NnrpTransportSelectionOptions): NnrpTransportSelectionSummary {
    this.#ensureOpen();

    return createTransportSelectionSummary(
      selectTransport(this.#transportProviders.map((provider) => provider.descriptor), options),
    );
  }

  public async close(): Promise<void> {
    this.#closed = true;
    await Promise.all((await Promise.all(this.#roleSessions.values())).map(async (session) => await session.close()));
    if (this.#roleConnection !== undefined) await this.#roleConnection.close();
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

  #ensureConnectReady(operation: "connect"): void {
    if (this.#binding.manifest.buildMode !== "backend-native") {
      throw nativeRuntimeReadinessError(
        "NNRP_NATIVE_RUNTIME_MANIFEST_INVALID",
        `Native runtime ${operation} requires a backend-native capability manifest.`,
      );
    }
  }

  async #validateSubmit<TRequest extends NnrpNativeSubmitValidationRequest>(request: TRequest): Promise<TRequest> {
    const validateSubmit = this.#binding.ffi?.validateSubmit;
    if (validateSubmit === undefined) {
      return request;
    }

    const validated = await validateSubmit(request);
    if (validated === undefined) {
      return request;
    }

    return {
      ...request,
      submit: validated,
    };
  }

  async #roleSession(
    options: NnrpNormalizedSessionOptions,
    recoveryTicket?: NnrpSessionRecoveryTicket,
  ): Promise<InternalClientSessionRegistration> {
    const connection = this.#roleConnection;
    if (connection === undefined) throw bindingNotConnectedError("clientRole");
    const sessionHandleId = allocateNativeRoleId("session", 0xffff_ffffn);
    const routingKey = `native-session-${sessionHandleId}`;
    const request = internalSessionOpenOptions(options, sessionHandleId);
    const session = recoveryTicket === undefined
      ? connection.openSession(request)
      : connection.resumeSession(request, recoveryTicket.toBytes());
    this.#roleSessions.set(routingKey, session);
    try {
      const resolved = await session;
      this.#resolvedRoleSessions.set(routingKey, resolved);
      return {
        routingKey,
        sessionId: assertNegotiatedSessionId(resolved.sessionId),
      };
    } catch (error) {
      this.#roleSessions.delete(routingKey);
      throw error;
    }
  }

  async #roleSessionForOptions(options: NnrpSessionOptions): Promise<InternalClientRoleSession> {
    const routingKey = runtimeSessionRoutingKeys.get(options);
    if (routingKey === undefined) throw bindingNotConnectedError("clientRoleSession");
    const session = this.#roleSessions.get(routingKey);
    if (session === undefined) throw bindingNotConnectedError("clientRoleSession");
    return await session;
  }

  async #closeRoleSession(sessionId: string): Promise<void> {
    const session = this.#roleSessions.get(sessionId);
    if (session === undefined) return;
    this.#roleSessions.delete(sessionId);
    this.#resolvedRoleSessions.delete(sessionId);
    await (await session).close();
  }
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

  const forcedKind = forcedTransportKind(policy);
  if (forcedKind !== undefined && !providers.some((provider) => provider.kind === forcedKind)) {
    throw new NnrpTransportError({
      code: "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED",
      message: `${policy} transport policy requires an installed or explicit ${forcedKind} provider.`,
      source: "transport",
      retryable: false,
      transport: forcedKind,
    });
  }
}

function forcedTransportKind(policy: NnrpTransportPolicy): NnrpTransportKind | undefined {
  return policy.startsWith("force-") ? policy.slice("force-".length) as NnrpTransportKind : undefined;
}

async function connectClientRole(
  endpoint: NnrpEndpoint,
  providerRoutes: NnrpClientProviderRoutes | undefined,
  providers: readonly NnrpNativeTransportProvider[],
  policy: NnrpTransportPolicy,
): Promise<InternalClientRoleConnection> {
  const selected = await selectClientProvider(endpoint, providerRoutes, providers, policy);
  const provider = selected.provider;
  const carrier = await provider.connect({
    endpoint: resolvedRouteEndpoint(selected),
    ...(selected.security === undefined ? {} : { security: selected.security }),
  });
  const adoption = (carrier as NnrpTransportConnection & Partial<InternalRoleCarrier>)[CLIENT_ROLE_ADOPT];
  if (typeof adoption !== "function") {
    await carrier.close();
    throw new NnrpCapabilityError({
      code: "NNRP_NATIVE_ROLE_ADOPTION_UNAVAILABLE",
      message: `${provider.kind} provider does not expose its package-owned client role adoption path.`,
      source: "native",
      retryable: false,
      transport: provider.kind,
    });
  }
  try {
    return await adoption.call(carrier, allocateNativeRoleId("connection"), 1);
  } catch (error) {
    await carrier.close();
    throw error;
  }
}

function allocateNativeRoleId(kind: keyof NativeRoleIdState, maximum = 0xffff_ffff_ffff_ffffn): bigint {
  const root = globalThis as typeof globalThis & { [NATIVE_ROLE_IDS]?: NativeRoleIdState };
  const state = root[NATIVE_ROLE_IDS] ??= { connection: 1n, session: 1n };
  const id = state[kind];
  if (id > maximum) throw new RangeError(`Native ${kind} handle id space is exhausted.`);
  state[kind] = id + 1n;
  return id;
}

async function selectClientProvider(
  endpoint: NnrpEndpoint,
  providerRoutes: NnrpClientProviderRoutes | undefined,
  providers: readonly NnrpNativeTransportProvider[],
  policy: NnrpTransportPolicy,
): Promise<ResolvedClientProviderRoute> {
  validateClientProviderRouteKeys(providerRoutes);
  const resolutions = providers.map((provider) => resolveClientProviderRoute(endpoint, provider, providerRoutes));
  const forced = forcedTransportKind(policy);
  const configuredKinds = configuredClientProviderKinds(providerRoutes);
  const peerSupportedKinds = [...new Set<NnrpTransportKind>(["tcp", "quic", ...configuredKinds])];
  const probeTargets = resolutions.filter(({ provider, rejectionReason }) =>
    provider.localAvailable &&
    peerSupportedKinds.includes(provider.kind) &&
    rejectionReason === undefined &&
    (forced === undefined || provider.kind === forced)
  );
  const samples = probeTargets.length <= 1 ? [] : await Promise.all(probeTargets.map(async (resolution) => {
    try {
      const metrics = await resolution.provider.probe({
        endpoint: resolvedRouteEndpoint(resolution),
        ...(resolution.security === undefined ? {} : { security: resolution.security }),
        sampleCount: 3,
        payloadBytes: 64,
        timeoutMillis: 1_000,
      });
      return { provider: resolution.provider, metrics };
    } catch {
      return { provider: resolution.provider };
    }
  }));
  const installedKinds = transportKinds(providers);
  const descriptors: NnrpTransportProviderDescriptor[] = [
    ...providers.map((provider) => provider.descriptor),
    ...configuredKinds
      .filter((kind) => !installedKinds.includes(kind))
      .map(uninstalledProviderObservation),
  ];
  const resolutionByProviderId = new Map(
    resolutions.map((resolution) => [resolution.provider.metadata.id, resolution]),
  );
  const candidateReadiness = descriptors.map((provider): NnrpTransportCandidateReadiness => {
    const resolution = resolutionByProviderId.get(provider.metadata.id);
    return {
      transportId: provider.transportId,
      providerId: provider.metadata.id,
      routeResolved: resolution?.rejectionReason !== "route-unresolved",
      securitySatisfied: resolution?.rejectionReason !== "security-unsatisfied",
      ...(resolution?.rejectionReason === undefined ? {} : {
        diagnostic: `${provider.transportId} client provider route is ${resolution.rejectionReason}.`,
      }),
    };
  });
  const probeObservations = samples.map(({ provider, metrics }): NnrpTransportProbeObservation =>
    metrics === undefined
      ? {
        transportId: provider.kind,
        providerId: provider.metadata.id,
        state: "failed",
        diagnostic: `${provider.kind} transport probe failed.`,
      }
      : { transportId: provider.kind, providerId: provider.metadata.id, state: "succeeded", metrics }
  );
  const selection = selectTransport(descriptors, {
    peerSupportedTransports: peerSupportedKinds,
    policy,
    candidateReadiness,
    probeObservations,
  });
  const selected = resolutions.find((resolution) =>
    resolution.provider.metadata.id === selection.selectedProvider.metadata.id
  );
  if (selected === undefined || selected.endpoint === undefined) {
    throw new NnrpTransportError({
      code: "NNRP_NATIVE_TRANSPORT_SELECTION_INCONSISTENT",
      message: "Selected native client transport does not have a resolved provider route.",
      source: "transport",
      retryable: false,
      cause: createTransportSelectionSummary(selection),
    });
  }
  return { ...selected, endpoint: selected.endpoint };
}

interface ResolvedClientProviderRoute {
  readonly provider: NnrpNativeTransportProvider;
  readonly endpoint?: string;
  readonly security?: NnrpTransportClientSecurity;
  readonly rejectionReason?: Extract<NnrpTransportRejectionReason, "route-unresolved" | "security-unsatisfied">;
}

function resolveClientProviderRoute(
  endpoint: NnrpEndpoint,
  provider: NnrpNativeTransportProvider,
  providerRoutes: NnrpClientProviderRoutes | undefined,
): ResolvedClientProviderRoute {
  const route = providerRoutes?.[provider.kind];
  let resolvedEndpoint: string;
  try {
    resolvedEndpoint = provider.kind === "websocket"
      ? resolveNativeWebSocketEndpoint(route?.endpoint)
      : resolveProviderEndpoint(endpoint, provider.kind, route?.endpoint);
  } catch {
    return { provider, rejectionReason: "route-unresolved" };
  }
  const security = route?.security;
  if (!clientRouteSecuritySatisfied(endpoint, provider.kind, resolvedEndpoint, security !== undefined)) {
    return {
      provider,
      endpoint: resolvedEndpoint,
      ...(security === undefined ? {} : { security }),
      rejectionReason: "security-unsatisfied",
    };
  }
  return {
    provider,
    endpoint: resolvedEndpoint,
    ...(security === undefined ? {} : { security }),
  };
}

function clientRouteSecuritySatisfied(
  applicationEndpoint: NnrpEndpoint,
  kind: NnrpTransportKind,
  providerEndpoint: string,
  hasSecurity: boolean,
): boolean {
  const secureApplication = applicationEndpoint.secure;
  if (kind === "tcp") return !secureApplication || hasSecurity;
  if (kind === "quic") return hasSecurity;
  if (kind === "ipc") return !secureApplication && !hasSecurity;
  const secureWebSocket = new URL(providerEndpoint).protocol === "wss:";
  return (!secureApplication || secureWebSocket) && secureWebSocket === hasSecurity;
}

function resolveNativeWebSocketEndpoint(endpoint: import("@nnrp/core").NnrpProviderEndpoint | undefined): string {
  if (endpoint === undefined) throw new TypeError("Native ws/wss routes require an explicit endpoint.");
  const parsed = new URL(endpoint.uri);
  if ((parsed.protocol !== "ws:" && parsed.protocol !== "wss:") || parsed.hostname.length === 0) {
    throw new TypeError("Native ws/wss routes require a ws:// or wss:// endpoint.");
  }
  return parsed.toString();
}

function validateClientProviderRouteKeys(providerRoutes: NnrpClientProviderRoutes | undefined): void {
  for (const key of Object.keys(providerRoutes ?? {})) {
    if (!(TRANSPORT_KINDS as readonly string[]).includes(key)) {
      throw new NnrpTransportError({
        code: "NNRP_NATIVE_PROVIDER_ROUTE_KEY_INVALID",
        message: `Unknown native client provider route key: ${key}.`,
        source: "transport",
        retryable: false,
      });
    }
  }
}

function configuredClientProviderKinds(providerRoutes: NnrpClientProviderRoutes | undefined): NnrpTransportKind[] {
  return Object.keys(providerRoutes ?? {}) as NnrpTransportKind[];
}

function uninstalledProviderObservation(kind: NnrpTransportKind): NnrpTransportProviderDescriptor {
  return {
    name: `@nnrp/transport-${kind}`,
    version: "uninstalled",
    transportId: kind,
    kind: "native-dynamic",
    available: false,
    metadata: {
      id: `nnrp.transport.${kind}.uninstalled`,
      cost: { modelId: 0, units: 0n },
      preferenceRank: 0xffff,
      limits: { maxFrameBytes: 67_108_864n },
      limitations: [],
    },
    diagnostic: `${kind} provider is configured but not installed.`,
  };
}

function resolvedRouteEndpoint(resolution: ResolvedClientProviderRoute): string {
  if (resolution.endpoint !== undefined) return resolution.endpoint;
  throw new NnrpTransportError({
    code: "NNRP_NATIVE_PROVIDER_ROUTE_UNRESOLVED",
    message: `${resolution.provider.kind} client provider route is unresolved.`,
    source: "transport",
    retryable: false,
    transport: resolution.provider.kind,
  });
}

function decodeClientRoleEvent(event: InternalRoleEvent): NnrpClientEvent {
  if (!event.headerPresent) {
    if (
      event.kind === EVENT_KIND_OPERATION_LIFECYCLE && event.relatedOperationId !== 0n &&
      event.payload.byteLength === 1
    ) {
      const lifecycle: NnrpOperationLifecycleEvent = {
        operationId: event.relatedOperationId,
        state: decodeOperationState(event.payload[0]!),
      };
      return { type: "lifecycle", event: lifecycle };
    }
    throw new NnrpProtocolError({
      code: "NNRP_NATIVE_LIFECYCLE_EVENT_UNEXPECTED",
      message: `Native client role emitted invalid headerless event kind ${event.kind} on the role event pump.`,
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
  if (event.relatedOperationId !== 0n) runtimeEventOperationIds.set(decoded, event.relatedOperationId);
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

function isTerminalOperationState(state: NnrpOperationState): boolean {
  return state === "superseded" || state === "cancelled" || state === "failed" || state === "completed";
}

export interface NnrpClientState {
  readonly endpoint: string;
  readonly runtime: NnrpBackendRuntime;
  readonly transports: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
}

export class NnrpClient {
  readonly #state: NnrpClientState;
  readonly #eventQueues = new Map<string, NnrpClientEvent[]>();
  readonly #routingKeyByWireSessionId = new Map<number, string>();
  #closed = false;

  public constructor(state: NnrpClientState) {
    this.#state = state;
    clientRoutedEventReaders.set(this, (routingKey, options) => this.#nextRoutedEvent(routingKey, options));
    clientSessionStateReleasers.set(this, (sessionId, routingKey) => {
      const observedRoutingKey = this.#routingKeyByWireSessionId.get(sessionId);
      this.#routingKeyByWireSessionId.delete(sessionId);
      this.#eventQueues.delete(routingKey);
      this.#eventQueues.delete(`wire-${sessionId}`);
      if (observedRoutingKey !== undefined) this.#eventQueues.delete(observedRoutingKey);
    });
  }

  public get endpoint(): string {
    return this.#state.endpoint;
  }

  public get transportPolicy(): NnrpTransportPolicy {
    return this.#state.transportPolicy;
  }

  public get runtime(): NnrpBackendRuntime {
    return this.#state.runtime;
  }

  public async openSession(options: NnrpSessionOptions = {}): Promise<NnrpClientSession> {
    this.#ensureOpen();
    const normalized = this.#createSessionOptions(options);
    const registration = await (clientRoleSessionOpeners.get(this.#state.runtime)?.(normalized) ??
      Promise.resolve({
        routingKey: `wire-${normalized.requestedSessionId}`,
        sessionId: normalized.requestedSessionId,
      }));
    const sessionId = assertNegotiatedSessionId(registration.sessionId);
    runtimeSessionRoutingKeys.set(normalized, registration.routingKey);

    const session = new NnrpClientSession({
      client: this,
      options: normalized,
      sessionId,
    });
    this.#routingKeyByWireSessionId.set(sessionId, registration.routingKey);
    clientSessionRoutingKeys.set(session, registration.routingKey);
    return session;
  }

  public async resumeSession(
    ticket: NnrpSessionRecoveryTicket,
    options: NnrpSessionOptions = {},
  ): Promise<NnrpClientSession> {
    this.#ensureOpen();
    if (!(ticket instanceof NnrpSessionRecoveryTicket)) {
      throw new TypeError("ticket must be NnrpSessionRecoveryTicket");
    }
    const normalized = this.#createSessionOptions({
      ...options,
      requestedSessionId: ticket.sessionId,
      allowResume: true,
    });
    const resume = clientRoleSessionResumers.get(this.#state.runtime);
    if (resume === undefined) throw bindingNotConnectedError("resumeSession");
    const registration = await resume(ticket, normalized);
    const sessionId = assertNegotiatedSessionId(registration.sessionId);
    runtimeSessionRoutingKeys.set(normalized, registration.routingKey);
    const session = new NnrpClientSession({
      client: this,
      options: normalized,
      sessionId,
    });
    this.#routingKeyByWireSessionId.set(sessionId, registration.routingKey);
    clientSessionRoutingKeys.set(session, registration.routingKey);
    return session;
  }

  public async nextSessionEvent(sessionId: number, options: NnrpEventPollOptions = {}): Promise<NnrpClientEvent> {
    assertNegotiatedSessionId(sessionId);
    return await this.#nextRoutedEvent(
      this.#routingKeyByWireSessionId.get(sessionId) ?? `wire-${sessionId}`,
      options,
    );
  }

  async #nextRoutedEvent(
    routingKey: string,
    options: NnrpEventPollOptions = {},
  ): Promise<NnrpClientEvent> {
    this.#ensureOpen();
    validateEventPollOptions(options);

    while (true) {
      const queued = this.#eventQueues.get(routingKey);
      const event = queued?.shift();
      if (event !== undefined) {
        return event;
      }

      const events = await raceEventPoll(
        this.#state.runtime.awaitEvents({
          maxEvents: 16,
          ...(options.timeoutMillis === undefined ? {} : { timeoutMillis: options.timeoutMillis }),
        }),
        options,
      );
      if (events.length === 0) {
        if (options.timeoutMillis !== undefined) {
          throw eventPollTimeoutError("native");
        }
        throw bindingNotConnectedError("nextEvent");
      }

      for (const candidate of events) {
        const candidateSessionId = assertNegotiatedSessionId(candidate.sessionId);
        if (candidate.event.type === "runtime" && candidate.event.event.header.sessionId !== candidateSessionId) {
          throw new NnrpProtocolError({
            code: "NNRP_NATIVE_EVENT_SESSION_MISMATCH",
            message:
              `Native event batch item declared session ${candidateSessionId}, but its wire header declared session ${candidate.event.event.header.sessionId}.`,
            source: "native",
            retryable: false,
          });
        }
        const candidateRoutingKey = this.#routingKeyByWireSessionId.get(candidateSessionId) ??
          `wire-${candidateSessionId}`;
        const queue = this.#eventQueues.get(candidateRoutingKey) ?? [];
        queue.push(candidate.event);
        this.#eventQueues.set(candidateRoutingKey, queue);
        if (
          candidate.event.type === "runtime" && candidate.event.event.header.sessionId !== 0 &&
          routingKey === `wire-${candidate.event.event.header.sessionId}`
        ) {
          this.#eventQueues.set(routingKey, queue);
        }
      }
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    try {
      await this.#state.runtime.close();
    } finally {
      this.#eventQueues.clear();
      this.#routingKeyByWireSessionId.clear();
    }
  }

  public get closed(): boolean {
    return this.#closed || this.#state.runtime.closed;
  }

  #ensureOpen(): void {
    if (this.closed) {
      throw closedError("client");
    }
  }

  #createSessionOptions(options: NnrpSessionOptions): NnrpNormalizedSessionOptions {
    return normalizeNativeSessionOptions(mergeSessionOptions(this.#state.sessionDefaults, options));
  }
}

export interface NnrpClientSessionState {
  readonly client: NnrpClient;
  readonly options: NnrpSessionOptions;
  readonly sessionId: number;
}

export class NnrpClientSession {
  readonly #state: NnrpClientSessionState;
  readonly #runtimeObjects = new RuntimeObjectLifecycle();
  readonly #inFlightFrames = new Set<number>();
  readonly #terminalFrames = new Set<number>();
  readonly #operationByFrame = new Map<number, bigint>();
  readonly #cancelledOperations = new Set<bigint>();
  readonly #submitCancellationCleanups = new Map<number, () => void>();
  readonly #capacityWaiters: Array<() => void> = [];
  #runtimeObjectQueue: Promise<void> = Promise.resolve();
  #availableCredits: number;
  #submitCapacityPolicy: "reject" | "await" = "reject";
  #nextControlSequence = 1n;
  #nextRuntimeFrameId = 1;
  #closed = false;

  public constructor(state: NnrpClientSessionState) {
    this.#state = state;
    this.#availableCredits = Number.POSITIVE_INFINITY;
  }

  public get options(): NnrpSessionOptions {
    return this.#state.options;
  }

  public get sessionId(): number {
    return this.#state.sessionId;
  }

  public async submit(request: NnrpSubmitRequest, options: NnrpSubmitOptions = {}): Promise<NnrpResult> {
    let normalized: NnrpNormalizedSubmitRequest;
    const deadlineMillis = validateSubmitOptions(options, "native");
    try {
      this.#ensureOpen();
      const capacityWait = this.#reserveOrAwaitSubmitCapacity(options, deadlineMillis);
      if (capacityWait !== undefined) {
        await capacityWait;
      }
      normalized = normalizeSubmitRequest(request, { copyPayloads: false });
      this.#beginFrame(normalized.frameId, normalized.operationId);
    } catch (error) {
      return Promise.reject(error);
    }

    try {
      const preparation = this.#prepareSubmitDispatch(normalized.operationId, options, deadlineMillis);
      if (preparation !== undefined) {
        await preparation;
      }
      const cancellation = this.#armSubmitCancellation(
        normalized.operationId,
        normalized.frameId,
        options,
        deadlineMillis,
      );
      return await Promise.race([
        this.#state.client.runtime.submitResultCompact({
          sessionOptions: this.#state.options,
          submit: normalized,
          maxEvents: 1,
        }),
        cancellation.promise,
      ]).finally(cancellation.cleanup);
    } finally {
      this.#finishFrame(normalized.frameId);
    }
  }

  public async submitNoWait(request: NnrpSubmitRequest, options: NnrpSubmitOptions = {}): Promise<bigint> {
    let normalized: NnrpNormalizedSubmitRequest;
    const deadlineMillis = validateSubmitOptions(options, "native");
    try {
      this.#ensureOpen();
      this.#reserveImmediateCapacity();
      normalized = normalizeSubmitRequest(request, { copyPayloads: false });
      this.#beginFrame(normalized.frameId, normalized.operationId);
    } catch (error) {
      return Promise.reject(error);
    }

    try {
      const preparation = this.#prepareSubmitDispatch(normalized.operationId, options, deadlineMillis);
      if (preparation !== undefined) {
        await preparation;
      }
      this.#armDetachedSubmitCancellation(normalized.operationId, normalized.frameId, options, deadlineMillis);
      return await this.#state.client.runtime.submitNoWait({
        sessionOptions: this.#state.options,
        submit: normalized,
      });
    } catch (error) {
      this.#finishFrame(normalized.frameId);
      throw error;
    }
  }

  public cancel(metadata: ControlRequestMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.Cancel, metadata, diagnostic);
  }

  public abort(metadata: ControlRequestMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.Abort, metadata, diagnostic);
  }

  public updatePriority(metadata: SchedulingMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.PriorityUpdate, metadata);
  }

  public updateDeadline(metadata: SchedulingMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.Deadline, metadata);
  }

  public expireAt(metadata: SchedulingMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.ExpireAt, metadata);
  }

  public supersede(metadata: SupersedeMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.Supersede, metadata, diagnostic);
  }

  public updateBudget(metadata: BudgetMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.BudgetUpdate, metadata);
  }

  public negotiateCapabilities(metadata: CapabilityMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.CapabilityNegotiation, metadata, body);
  }

  public degradeProfile(metadata: CapabilityMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.DegradeProfile, metadata, body);
  }

  public sendRouteHint(metadata: RouteHintMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.RouteHint, metadata, body);
  }

  public sendExecutionHint(metadata: RouteHintMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.ExecutionHint, metadata, body);
  }

  public sendTraceContext(metadata: TraceContextMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.TraceContext, metadata, body);
  }

  public sendControl(
    messageType: NnrpMessageType,
    metadata: RuntimeControlMetadata,
    tail: Uint8Array = EMPTY_PAYLOAD,
  ): Promise<void> {
    try {
      assertClientRuntimeControlMessage(messageType);
      const payload = encodeRuntimeControlMetadata(messageType, metadata, tail);
      this.#observeControlSequence(metadata);
      return this.#sendRuntimeFrame(messageType, payload, runtimeControlOperationId(messageType, metadata)).then(
        async () => await this.#applySentTerminalControl(messageType, metadata),
      );
    } catch (error) {
      return Promise.reject(error);
    }
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

  public inFlightFrames(): readonly number[] {
    return [...this.#inFlightFrames].sort((left, right) => left - right);
  }

  public completeEvent(event: NnrpRuntimeEvent): void {
    if (
      (event.header.messageType === NnrpMessageType.Cancel || event.header.messageType === NnrpMessageType.Abort) &&
      event.metadata.type === "control_request"
    ) {
      this.#cancelledOperations.add(event.metadata.value.operationId);
      return;
    }

    if (isRuntimeTerminalEvent(event)) {
      const operationId = runtimeEventOperationIds.get(event) ??
        terminalOperationId(event, this.#operationByFrame.get(event.header.frameId));
      if (operationId !== undefined) runtimeEventOperationIds.set(event, operationId);
      this.#finishTerminalFrame(event.header.frameId);
      return;
    }

    if (event.metadata.type === "flow_update") {
      this.#availableCredits = flowCredit(event.metadata.value);
      this.#drainCapacityWaiters();
      return;
    }

    if (event.header.messageType === NnrpMessageType.CreditUpdate && event.metadata.type === "pressure") {
      this.#availableCredits = normalizeCreditWindow(event.metadata.value.creditWindow);
      this.#drainCapacityWaiters();
      return;
    }

    if (event.header.messageType === NnrpMessageType.SessionClose) {
      this.#inFlightFrames.clear();
      this.#terminalFrames.clear();
      this.#operationByFrame.clear();
      this.#cancelledOperations.clear();
      this.#drainCapacityWaiters();
    }
  }

  public async nextEvent(options: NnrpEventPollOptions = {}): Promise<NnrpClientEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    const deadlineMillis = options.timeoutMillis === undefined ? undefined : Date.now() + options.timeoutMillis;
    while (true) {
      const pollOptions = deadlineMillis === undefined
        ? options
        : { ...options, timeoutMillis: Math.max(0, deadlineMillis - Date.now()) };
      const routingKey = clientSessionRoutingKeys.get(this);
      const nextEvent = clientRoutedEventReaders.get(this.#state.client);
      if (routingKey === undefined || nextEvent === undefined) throw bindingNotConnectedError("nextEvent");
      const event = await nextEvent(routingKey, pollOptions);
      if (event.type === "runtime") {
        await this.#releaseForTerminalControl(event.event);
        if (this.#shouldSuppressCancelledPayload(event.event)) {
          continue;
        }
        this.completeEvent(event.event);
      } else if (isTerminalOperationState(event.event.state)) {
        const frameId = this.#frameForOperation(event.event.operationId);
        if (frameId !== undefined) this.#finishTerminalFrame(frameId);
      }
      return event;
    }
  }

  public async nextResult(options: NnrpEventPollOptions = {}): Promise<NnrpResult> {
    while (true) {
      const event = await this.nextEvent(options);
      if (event.type === "lifecycle") {
        if (isTerminalOperationState(event.event.state)) return createNnrpResultFromLifecycle(event.event);
        continue;
      }
      if (isRuntimeTerminalEvent(event.event)) {
        const operationId = runtimeEventOperationIds.get(event.event) ?? terminalOperationId(event.event);
        if (operationId === undefined) {
          throw new NnrpProtocolError({
            code: "NNRP_TERMINAL_OPERATION_UNKNOWN",
            message: `Terminal frame ${event.event.header.frameId} has no associated operation id.`,
            source: "native",
            retryable: false,
          });
        }
        return createNnrpResultFromRuntimeEvent(operationId, event.event);
      }
    }
  }

  public migrate(request: NnrpSessionMigrationRequest): Promise<void> {
    try {
      this.#ensureOpen();
      normalizeSessionMigrationRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.reject(recoveryUnsupportedError("native"));
  }

  public async patch(request: NnrpSessionPatchRequest): Promise<NnrpSessionPatchResult> {
    let patch: NnrpSessionPatchRequest;
    try {
      this.#ensureOpen();
      patch = normalizeSessionPatchRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }

    const result = await this.#state.client.runtime.patchSession({
      sessionOptions: this.#state.options,
      patch,
    });

    if (result.accepted && patch.submitCapacityPolicy !== undefined) {
      this.#submitCapacityPolicy = patch.submitCapacityPolicy;
    }
    if (patch.initialCredits !== undefined) {
      this.#availableCredits = patch.initialCredits;
      this.#drainCapacityWaiters();
    }

    return result;
  }

  public async *events(options: NnrpEventPollOptions = {}): AsyncIterable<NnrpClientEvent> {
    while (!this.closed) {
      yield await this.nextEvent(options);
    }
  }

  public recoveryTicket(): NnrpSessionRecoveryTicket | undefined {
    this.#ensureOpen();
    const routingKey = clientSessionRoutingKeys.get(this);
    if (routingKey === undefined) return undefined;
    const encoded = clientRoleRecoveryTicketReaders.get(this.#state.client.runtime)?.(routingKey);
    return encoded === undefined ? undefined : NnrpSessionRecoveryTicket.fromBytes(encoded);
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#inFlightFrames.clear();
    this.#terminalFrames.clear();
    this.#operationByFrame.clear();
    this.#cancelledOperations.clear();
    this.#runtimeObjects.clear();
    for (const cleanup of this.#submitCancellationCleanups.values()) {
      cleanup();
    }
    this.#submitCancellationCleanups.clear();
    this.#drainCapacityWaiters();
    const closeRoleSession = clientRoleSessionClosers.get(this.#state.client.runtime);
    const routingKey = clientSessionRoutingKeys.get(this);
    try {
      if (closeRoleSession !== undefined && routingKey !== undefined) {
        await closeRoleSession(routingKey);
      }
    } finally {
      if (routingKey !== undefined) {
        clientSessionStateReleasers.get(this.#state.client)?.(this.sessionId, routingKey);
      }
      clientSessionRoutingKeys.delete(this);
    }
  }

  public get closed(): boolean {
    return this.#closed || this.#state.client.closed;
  }

  #ensureOpen(): void {
    if (this.closed) {
      throw closedError("client session");
    }
  }

  #beginFrame(frameId: number, operationId: bigint): void {
    if (this.#inFlightFrames.has(frameId)) {
      throw new NnrpProtocolError({
        code: "NNRP_FRAME_IN_FLIGHT",
        message: `Frame ${frameId} is already in flight for this session.`,
        source: "core",
        retryable: false,
      });
    }

    this.#inFlightFrames.add(frameId);
    this.#terminalFrames.delete(frameId);
    this.#operationByFrame.set(frameId, operationId);
  }

  #prepareSubmitDispatch(
    operationId: bigint,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): Promise<void> | undefined {
    throwIfSubmitCancelledBeforeDispatch(options, "native");
    if (deadlineMillis === undefined) {
      return undefined;
    }
    return this.updateDeadline({
      operationId,
      controlSequence: this.#allocateControlSequence(),
      priorityClass: 0,
      priorityDelta: 0,
      deadlineUnixMs: BigInt(Math.ceil(deadlineMillis)),
      flags: 0,
    }).then(() => {
      throwIfSubmitCancelledBeforeDispatch(options, "native", deadlineMillis);
    });
  }

  #armSubmitCancellation(
    operationId: bigint,
    frameId: number,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): { readonly promise: Promise<never>; readonly cleanup: () => void } {
    let rejectCancellation: (error: unknown) => void = () => {};
    const promise = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const cleanup = this.#installSubmitCancellation(
      operationId,
      frameId,
      options,
      deadlineMillis,
      rejectCancellation,
    );
    return { promise, cleanup };
  }

  #armDetachedSubmitCancellation(
    operationId: bigint,
    frameId: number,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): void {
    this.#installSubmitCancellation(operationId, frameId, options, deadlineMillis);
  }

  #installSubmitCancellation(
    operationId: bigint,
    frameId: number,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
    onCancelled?: (error: unknown) => void,
  ): () => void {
    if (options.signal === undefined && deadlineMillis === undefined) {
      return () => {};
    }

    let cleaned = false;
    let triggered = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      options.signal?.removeEventListener?.("abort", onAbort);
    };
    const trigger = (reasonCode: number, error: NnrpTimeoutError) => {
      if (triggered || cleaned) {
        return;
      }
      triggered = true;
      this.#cancelledOperations.add(operationId);
      onCancelled?.(error);
      cleanup();
      void this.cancel({
        operationId,
        controlSequence: this.#allocateControlSequence(),
        reasonCode,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      }).catch(() => {});
    };
    const onAbort = () => trigger(1, submitCancelledError("native", options.signal));

    options.signal?.addEventListener?.("abort", onAbort, { once: true });
    if (deadlineMillis !== undefined) {
      timeout = setTimeout(
        () => trigger(3, submitTimeoutError("native")),
        Math.max(0, deadlineMillis - Date.now()),
      );
    }
    this.#submitCancellationCleanups.set(frameId, cleanup);
    return cleanup;
  }

  #reserveOrAwaitSubmitCapacity(
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): Promise<void> | undefined {
    if (this.#submitCapacityPolicy !== "await") {
      return undefined;
    }

    if (this.#availableCredits > 0) {
      this.#availableCredits -= 1;
      return undefined;
    }

    return this.#awaitSubmitCapacity(options, deadlineMillis);
  }

  async #awaitSubmitCapacity(options: NnrpSubmitOptions, deadlineMillis: number | undefined): Promise<void> {
    do {
      this.#ensureOpen();
      await this.#waitForSubmitCapacity(options, deadlineMillis);
    } while (this.#availableCredits <= 0);

    this.#availableCredits -= 1;
  }

  #waitForSubmitCapacity(options: NnrpSubmitOptions, deadlineMillis: number | undefined): Promise<void> {
    throwIfSubmitCancelledBeforeDispatch(options, "native", deadlineMillis);
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        const index = this.#capacityWaiters.indexOf(wake);
        if (index >= 0) {
          this.#capacityWaiters.splice(index, 1);
        }
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
        options.signal?.removeEventListener?.("abort", onAbort);
      };
      const finish = (error?: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      };
      const wake = () => finish();
      const onAbort = () => finish(submitCancelledError("native", options.signal));

      this.#capacityWaiters.push(wake);
      options.signal?.addEventListener?.("abort", onAbort, { once: true });
      if (deadlineMillis !== undefined) {
        timeout = setTimeout(
          () => finish(submitTimeoutError("native")),
          Math.max(0, deadlineMillis - Date.now()),
        );
      }
    });
  }

  #reserveImmediateCapacity(): void {
    if (this.#submitCapacityPolicy !== "await") {
      return;
    }

    if (this.#availableCredits <= 0) {
      throw backpressureCreditExhaustedError("native");
    }

    this.#availableCredits -= 1;
  }

  #drainCapacityWaiters(): void {
    for (const waiter of this.#capacityWaiters.splice(0)) {
      waiter();
    }
  }

  #finishFrame(frameId: number): void {
    this.#submitCancellationCleanups.get(frameId)?.();
    this.#submitCancellationCleanups.delete(frameId);
    this.#inFlightFrames.delete(frameId);
    this.#operationByFrame.delete(frameId);
  }

  #finishTerminalFrame(frameId: number): void {
    if (this.#terminalFrames.has(frameId)) {
      throw new NnrpProtocolError({
        code: "NNRP_FRAME_TERMINAL_DUPLICATE",
        message: `Frame ${frameId} already reached a terminal state.`,
        source: "core",
        retryable: false,
      });
    }

    this.#terminalFrames.add(frameId);
    this.#finishFrame(frameId);
  }

  #frameForOperation(operationId: bigint): number | undefined {
    for (const [frameId, candidate] of this.#operationByFrame) {
      if (candidate === operationId) return frameId;
    }
    return undefined;
  }

  #allocateControlSequence(): bigint {
    const sequence = this.#nextControlSequence;
    this.#nextControlSequence = sequence === 0xffff_ffff_ffff_ffffn ? 1n : sequence + 1n;
    return sequence;
  }

  #observeControlSequence(metadata: RuntimeControlMetadata): void {
    if (!("controlSequence" in metadata) || metadata.controlSequence < this.#nextControlSequence) {
      return;
    }
    this.#nextControlSequence = metadata.controlSequence === 0xffff_ffff_ffff_ffffn
      ? 1n
      : metadata.controlSequence + 1n;
  }

  #shouldSuppressCancelledPayload(event: NnrpRuntimeEvent): boolean {
    if (event.metadata.type === "partial_result") {
      return this.#cancelledOperations.has(event.metadata.value.operationId);
    }

    const resultOperationId = event.header.messageType === NnrpMessageType.ResultPush
      ? runtimeEventOperationIds.get(event) ?? this.#operationByFrame.get(event.header.frameId)
      : undefined;
    if (
      event.header.messageType === NnrpMessageType.ResultPush && resultOperationId !== undefined &&
      this.#cancelledOperations.has(resultOperationId)
    ) {
      return true;
    }

    return false;
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
      await this.#sendRuntimeFrame(messageType, payload, runtimeObjectOperationId(messageType, metadata));
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

  async #applySentTerminalControl(messageType: NnrpMessageType, metadata: RuntimeControlMetadata): Promise<void> {
    if (messageType === NnrpMessageType.Cancel || messageType === NnrpMessageType.Abort) {
      const operationId = (metadata as ControlRequestMetadata).operationId;
      this.#cancelledOperations.add(operationId);
      await this.#releaseOperationObjects(operationId, ObjectReleaseReason.Cancelled);
    } else if (messageType === NnrpMessageType.Supersede) {
      await this.#releaseOperationObjects(
        (metadata as SupersedeMetadata).oldOperationId,
        ObjectReleaseReason.Replaced,
      );
    }
  }

  async #releaseOperationObjects(operationId: bigint, releaseReason: ObjectReleaseReason): Promise<void> {
    await this.#runtimeObjectQueue;
    for (const objectId of this.#runtimeObjects.releaseOnDropObjectIds(operationId)) {
      await this.releaseObject({
        objectId,
        operationId,
        releaseReason,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      });
    }
  }

  #sendRuntimeFrame(
    messageType: NnrpMessageType,
    payload: Uint8Array,
    operationId?: bigint,
  ): Promise<void> {
    try {
      this.#ensureOpen();
      let frameId: number;
      if (operationId === undefined) {
        frameId = this.#nextRuntimeFrameId;
        this.#nextRuntimeFrameId = frameId === 0xffff_ffff ? 1 : frameId + 1;
      } else if (operationId === 0n) {
        if (!allowsSessionScopedOperation(messageType)) {
          throw sessionScopedRuntimeOperationError(messageType);
        }
        frameId = 0;
      } else {
        const operationFrameId = this.#frameForOperation(operationId);
        if (operationFrameId === undefined) {
          throw inactiveRuntimeOperationError(messageType, operationId);
        }
        frameId = operationFrameId;
      }
      return this.#state.client.runtime.sendRuntimeFrame({
        sessionOptions: this.#state.options,
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

const EMPTY_PAYLOAD = new Uint8Array();

function createNativeRuntimeManifest(transports: readonly NnrpTransportKind[]): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "backend-native",
    transports,
    capabilities: [
      "client.session",
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

function normalizeEndpoint(endpoint: NnrpEndpoint): string {
  return endpoint.uri;
}

function validateEndpoint(endpoint: NnrpEndpoint): void {
  if (!(endpoint instanceof NnrpEndpoint)) {
    throw new NnrpCapabilityError({
      code: "NNRP_NATIVE_ENDPOINT_INVALID",
      message: "NNRP native endpoint must be an NnrpEndpoint value.",
      source: "native",
      retryable: false,
    });
  }
}

function mergeSessionOptions(
  defaults: NnrpSessionOptions | undefined,
  options: NnrpSessionOptions,
): NnrpSessionOptions {
  const cacheHints = options.cacheHints ?? defaults?.cacheHints;
  return {
    ...defaults,
    ...options,
    ...(cacheHints === undefined ? {} : { cacheHints }),
  };
}

function normalizeNativeSessionOptions(options: NnrpSessionOptions): NnrpNormalizedSessionOptions {
  const normalized: NnrpNormalizedSessionOptions = {
    requestedSessionId: options.requestedSessionId ?? 0,
    profileId: options.profileId ?? NNRP_STANDARD_PROFILE_TOKEN,
    schemaId: options.schemaId ?? NNRP_TOKEN_DELTA_SCHEMA_ID,
    schemaVersion: options.schemaVersion ?? NNRP_TOKEN_DELTA_SCHEMA_VERSION,
    priorityClass: options.priorityClass ?? NnrpSessionPriorityClass.Balanced,
    defaultDeadlineMillis: options.defaultDeadlineMillis ?? 500,
    maxInFlightOperations: options.maxInFlightOperations ?? 4,
    leaseTtlHintMillis: options.leaseTtlHintMillis ?? 30_000,
    allowResume: options.allowResume ?? false,
    resumeTokenBytes: options.resumeTokenBytes ?? 0,
    cacheHints: Object.freeze([...(options.cacheHints ?? [])]),
  };

  assertNativeSessionUnsigned("requestedSessionId", normalized.requestedSessionId, 0xffff_ffff);
  assertNativeSessionUnsigned("profileId", normalized.profileId, 0xffff);
  assertNativeSessionUnsigned("schemaId", normalized.schemaId, 0xffff_ffff);
  assertNativeSessionUnsigned("schemaVersion", normalized.schemaVersion, 0xffff_ffff);
  if (
    normalized.priorityClass !== NnrpSessionPriorityClass.Interactive &&
    normalized.priorityClass !== NnrpSessionPriorityClass.Balanced &&
    normalized.priorityClass !== NnrpSessionPriorityClass.Background
  ) {
    throw new RangeError("priorityClass is not a current SESSION_OPEN priority class");
  }
  assertNativeSessionUnsigned("defaultDeadlineMillis", normalized.defaultDeadlineMillis, 0xffff_ffff);
  assertNativeSessionUnsigned("maxInFlightOperations", normalized.maxInFlightOperations, 0xffff);
  if (normalized.maxInFlightOperations === 0) {
    throw new RangeError("maxInFlightOperations must be greater than zero");
  }
  assertNativeSessionUnsigned("leaseTtlHintMillis", normalized.leaseTtlHintMillis, 0xffff_ffff);
  assertNativeSessionUnsigned("resumeTokenBytes", normalized.resumeTokenBytes, 0xffff_ffff);
  for (const hint of normalized.cacheHints) {
    assertNativeSessionUnsigned("cacheHints entry", hint, 0xffff_ffff);
  }
  return Object.freeze(normalized);
}

function internalSessionOpenOptions(
  options: NnrpNormalizedSessionOptions,
  sessionHandleId: bigint,
): InternalClientSessionOpenOptions {
  return {
    requestedSessionId: options.requestedSessionId,
    sessionHandleId,
    generation: 1,
    profileId: options.profileId,
    priorityClass: options.priorityClass,
    allowResume: options.allowResume,
    schemaId: options.schemaId,
    schemaVersion: options.schemaVersion,
    defaultDeadlineMillis: options.defaultDeadlineMillis,
    maxInFlightOperations: options.maxInFlightOperations,
    leaseTtlHintMillis: options.leaseTtlHintMillis,
    resumeTokenBytes: options.resumeTokenBytes,
    cacheHints: options.cacheHints,
  };
}

function assertNativeSessionUnsigned(name: string, value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must fit in u${maximum === 0xffff ? 16 : 32}`);
  }
}

function assertNegotiatedSessionId(sessionId: number): number {
  if (!Number.isInteger(sessionId) || sessionId <= 0 || sessionId > 0xffff_ffff) {
    throw new RangeError("negotiated sessionId must be a non-zero u32");
  }
  return sessionId;
}

function isRuntimeTerminalEvent(event: NnrpRuntimeEvent): boolean {
  return event.header.messageType === NnrpMessageType.ResultPush ||
    event.header.messageType === NnrpMessageType.ResultDrop ||
    event.header.messageType === NnrpMessageType.ResultDropReason;
}

function terminalOperationId(event: NnrpRuntimeEvent, frameOperationId?: bigint): bigint | undefined {
  if (event.metadata.type === "result_drop_reason") return event.metadata.value.operationId;
  return runtimeEventOperationIds.get(event) ?? frameOperationId;
}

function flowCredit(update: import("@nnrp/core").NnrpFlowUpdateMetadata): number {
  switch (update.scopeKind) {
    case NnrpFlowScopeKind.Connection:
      return update.connectionCredit;
    case NnrpFlowScopeKind.Session:
      return update.sessionCredit;
    case NnrpFlowScopeKind.Operation:
      return update.operationCredit;
  }
}

function closedError(target: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code: "NNRP_NATIVE_CLOSED",
    message: `Cannot use a closed ${target}.`,
    source: "native",
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

function validateSubmitOptions(options: NnrpSubmitOptions, source: "native"): number | undefined {
  if (
    options.timeoutMillis !== undefined &&
    (!Number.isFinite(options.timeoutMillis) || options.timeoutMillis < 0)
  ) {
    throw new NnrpProtocolError({
      code: "NNRP_SUBMIT_TIMEOUT_INVALID",
      message: "Submit timeoutMillis must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }
  throwIfSubmitCancelledBeforeDispatch(options, source);
  return options.timeoutMillis === undefined ? undefined : Date.now() + options.timeoutMillis;
}

function throwIfSubmitCancelledBeforeDispatch(
  options: NnrpSubmitOptions,
  source: "native",
  deadlineMillis?: number,
): void {
  if (options.signal?.aborted) {
    throw submitCancelledError(source, options.signal);
  }
  if (deadlineMillis !== undefined && Date.now() >= deadlineMillis) {
    throw submitTimeoutError(source);
  }
}

function submitCancelledError(source: "native", signal: NnrpAbortSignalLike | undefined): NnrpTimeoutError {
  return new NnrpTimeoutError({
    code: "NNRP_SUBMIT_CANCELLED",
    message: "Submit was cancelled.",
    source,
    retryable: false,
    cause: signal?.reason,
  });
}

function submitTimeoutError(source: "native"): NnrpTimeoutError {
  return new NnrpTimeoutError({
    code: "NNRP_SUBMIT_TIMEOUT",
    message: "Submit timed out.",
    source,
    retryable: true,
  });
}

function recoveryUnsupportedError(source: "native" | "wasm"): NnrpRecoveryError {
  return new NnrpRecoveryError({
    code: "NNRP_RECOVERY_UNSUPPORTED",
    message: "Session migration is not supported by this runtime binding yet.",
    source,
    retryable: false,
  });
}

function normalizeCreditWindow(creditWindow: bigint): number {
  return creditWindow > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(creditWindow);
}

function backpressureCreditExhaustedError(source: "native" | "wasm"): NnrpTransportError {
  return new NnrpTransportError({
    code: "NNRP_BACKPRESSURE_CREDIT_EXHAUSTED",
    message: "Submit cannot dispatch because the session has no available flow-control credits.",
    source,
    retryable: true,
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

function assertClientRuntimeControlMessage(messageType: NnrpMessageType): void {
  if (
    messageType === NnrpMessageType.Cancel ||
    messageType === NnrpMessageType.Abort ||
    messageType === NnrpMessageType.PriorityUpdate ||
    messageType === NnrpMessageType.Deadline ||
    messageType === NnrpMessageType.ExpireAt ||
    messageType === NnrpMessageType.Supersede ||
    messageType === NnrpMessageType.BudgetUpdate ||
    messageType === NnrpMessageType.CapabilityNegotiation ||
    messageType === NnrpMessageType.DegradeProfile ||
    messageType === NnrpMessageType.RouteHint ||
    messageType === NnrpMessageType.ExecutionHint ||
    messageType === NnrpMessageType.TraceContext ||
    messageType === NnrpMessageType.ErrorRecoverable ||
    messageType === NnrpMessageType.RetryAfter
  ) {
    return;
  }

  throw new NnrpProtocolError({
    code: "NNRP_CLIENT_RUNTIME_MESSAGE_DIRECTION_INVALID",
    message: `Message type ${messageType} cannot be sent by a client session.`,
    source: "protocol",
    retryable: false,
  });
}

function runtimeControlOperationId(
  messageType: NnrpMessageType,
  metadata: RuntimeControlMetadata,
): bigint | undefined {
  if (messageType === NnrpMessageType.Cancel || messageType === NnrpMessageType.Abort) {
    return (metadata as ControlRequestMetadata).operationId;
  }
  if (
    messageType === NnrpMessageType.PriorityUpdate ||
    messageType === NnrpMessageType.Deadline ||
    messageType === NnrpMessageType.ExpireAt
  ) {
    return (metadata as SchedulingMetadata).operationId;
  }
  if (messageType === NnrpMessageType.Supersede) {
    return (metadata as SupersedeMetadata).oldOperationId;
  }
  if (messageType === NnrpMessageType.BudgetUpdate) {
    return (metadata as BudgetMetadata).operationId;
  }
  if (messageType === NnrpMessageType.RouteHint || messageType === NnrpMessageType.ExecutionHint) {
    return (metadata as RouteHintMetadata).operationId;
  }
  return undefined;
}

function runtimeObjectOperationId(
  messageType: NnrpMessageType,
  metadata: RuntimeObjectSendMetadata,
): bigint | undefined {
  if (messageType === NnrpMessageType.ObjectRef) {
    return (metadata as ObjectReferenceMetadata).operationId;
  }
  if (messageType === NnrpMessageType.ObjectRelease) {
    return (metadata as ObjectReleaseMetadata).operationId;
  }
  return undefined;
}

function inactiveRuntimeOperationError(messageType: NnrpMessageType, operationId: bigint): NnrpProtocolError {
  return new NnrpProtocolError({
    code: "NNRP_RUNTIME_OPERATION_INACTIVE",
    message: `${NnrpMessageType[messageType]} references inactive operation ${operationId}.`,
    source: "protocol",
    retryable: false,
  });
}

function allowsSessionScopedOperation(messageType: NnrpMessageType): boolean {
  return messageType === NnrpMessageType.Cancel ||
    messageType === NnrpMessageType.Abort ||
    messageType === NnrpMessageType.BudgetUpdate ||
    messageType === NnrpMessageType.ObjectRef ||
    messageType === NnrpMessageType.ObjectRelease;
}

function sessionScopedRuntimeOperationError(messageType: NnrpMessageType): NnrpProtocolError {
  return new NnrpProtocolError({
    code: "NNRP_RUNTIME_OPERATION_SCOPE_INVALID",
    message: `${NnrpMessageType[messageType]} requires a non-zero operation ID.`,
    source: "protocol",
    retryable: false,
  });
}

type NodePlatform = NodeJS.Platform;

type NodeArchitecture = NodeJS.Architecture;
