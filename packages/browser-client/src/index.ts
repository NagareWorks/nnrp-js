import {
  type BudgetMetadata,
  type CacheInvalidateMetadata,
  type CacheMissMetadata,
  type CacheReferenceMetadata,
  type CapabilityMetadata,
  type ControlRequestMetadata,
  createBrowserWasmManifest,
  createTransportCandidates,
  createTransportSelectionSummary,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  encodeRuntimeObjectMetadataSegments,
  NNRP_PROTOCOL_VERSION,
  type NnrpAbortSignalLike,
  NnrpCapabilityError,
  type NnrpCapabilityManifest,
  type NnrpEventPollOptions,
  type NnrpInputProfile,
  NnrpMessageType,
  type NnrpNormalizedSubmitRequest,
  NnrpProtocolError,
  NnrpRecoveryError,
  type NnrpResult,
  type NnrpRuntimeEvent,
  type NnrpSessionFlowControlOptions,
  type NnrpSessionMigrationRequest,
  type NnrpSessionPatchRequest,
  type NnrpSessionPatchResult,
  type NnrpSubmitOptions,
  type NnrpSubmitRequest,
  NnrpTimeoutError,
  type NnrpTransportCandidate,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  type NnrpTransportProbeMetrics,
  type NnrpTransportProvider,
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
  throwIfResultDrop,
  type TraceContextMetadata,
  validateEventPollOptions,
  validateSessionMetadata,
} from "@nnrp/core";
import {
  type BrowserPatchAck,
  type BrowserWasmModule,
  type BrowserWasmRole,
  loadBrowserWasmModule,
  openBrowserWasmRole,
  standardProfileId,
  standardProfileSchema,
} from "./wasm-role.js";
import { NnrpWasmBindingUnavailableError } from "./errors.js";

export { NnrpWasmBindingUnavailableError };

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
const FRAME_SUBMIT_METADATA_SIZE = 72;
const DEFAULT_BROWSER_WASM_URL = new URL("../wasm/nnrp_wasm_bg.wasm", import.meta.url).href;
const DEFAULT_BROWSER_WASM_GLUE_URL = new URL("../wasm/nnrp_wasm.js", import.meta.url).href;
const BROWSER_RUNTIME_CAPABILITIES = [
  "cache",
  "schema",
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

const browserRuntimeModules = new WeakMap<NnrpBrowserRuntime, BrowserWasmModule>();
const browserRuntimeRoles = new WeakMap<NnrpBrowserRuntime, Set<BrowserWasmRole>>();
const browserClientRoleOpeners = new WeakMap<
  NnrpBrowserClient,
  (options: NnrpBrowserSessionOptions, wireSessionId: number) => Promise<BrowserWasmRole>
>();
const browserClientSessionReleasers = new WeakMap<
  NnrpBrowserClient,
  (session: NnrpBrowserClientSession) => void
>();

export async function openBrowserRuntime(options: NnrpBrowserRuntimeOptions = {}): Promise<NnrpBrowserRuntime> {
  const transportProviders = options.transportProviders ?? await discoverBrowserTransportProviders();
  const binding = createWasmRuntimeBinding({ ...options, transportProviders });
  const wasm = await loadBrowserWasmModule(
    binding.artifact?.glueUrl ?? DEFAULT_BROWSER_WASM_GLUE_URL,
    binding.moduleUrl,
    binding.module,
  );
  const runtime = new NnrpBrowserRuntime(binding, options.transportPolicy ?? "auto");
  browserRuntimeModules.set(runtime, wasm);
  browserRuntimeRoles.set(runtime, new Set());
  return runtime;
}

export class NnrpBrowserRuntime {
  readonly #binding: NnrpWasmRuntimeBinding;
  readonly #transportPolicy: NnrpTransportPolicy;
  #closed = false;

  public constructor(binding: NnrpWasmRuntimeBinding, transportPolicy: NnrpTransportPolicy = "auto") {
    this.#binding = binding;
    this.#transportPolicy = transportPolicy;
  }

  public get manifest(): NnrpCapabilityManifest {
    return this.#binding.manifest;
  }

  public get moduleUrl(): string {
    return this.#binding.moduleUrl;
  }

  public get artifact(): NnrpResolvedWasmArtifact | undefined {
    return this.#binding.artifact;
  }

  public get transportProviders(): readonly NnrpBrowserTransportProvider[] {
    return this.#binding.transportProviders;
  }

  public connect(options: NnrpBrowserConnectOptions): NnrpBrowserClient {
    this.#ensureOpen();
    this.#ensureConnectReady();
    validateEndpoint(options.endpoint);
    const transportProviders = options.transportProviders ?? this.#binding.transportProviders;
    const transportPolicy = options.transportPolicy ?? this.#transportPolicy;
    validateBrowserTransportProviders(transportProviders);
    const provider = selectBrowserTransportProvider(transportProviders, transportPolicy, this.#binding.manifest);
    const providerEndpoint = resolveProviderEndpoint(options.endpoint, provider.kind, options.providerEndpoint);

    return new NnrpBrowserClient({
      endpoint: normalizeEndpoint(options.endpoint),
      providerEndpoint,
      provider,
      runtime: this,
      transportPolicy,
      ...(options.sessionDefaults === undefined ? {} : { sessionDefaults: options.sessionDefaults }),
    });
  }

  public selectTransport(options: NnrpBrowserTransportSelectionOptions): NnrpTransportSelectionSummary {
    this.#ensureOpen();

    return createTransportSelectionSummary(
      selectTransport(
        this.#createTransportCandidates(options),
        options.policy ?? this.#transportPolicy,
      ),
    );
  }

  public protocolVersion(): Promise<NnrpWasmProtocolVersion> {
    this.#ensureOpen();
    const wasm = requireBrowserWasmModule(this);
    return Promise.resolve({
      protocolMajor: wasm.nnrp_wasm_protocol_major(),
      wireFormat: wasm.nnrp_wasm_wire_format(),
      version: NNRP_PROTOCOL_VERSION,
    });
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const roles = browserRuntimeRoles.get(this);
    if (roles !== undefined) {
      const results = await Promise.allSettled([...roles].map(async (role) => await role.close()));
      roles.clear();
      throwFirstRejected(results);
    }
  }

  public get closed(): boolean {
    return this.#closed;
  }

  #ensureOpen(): void {
    if (this.#closed) {
      throw closedError("browser runtime");
    }
  }

  #ensureConnectReady(): void {
    if (this.#binding.manifest.buildMode !== "browser-wasm") {
      throw wasmRuntimeReadinessError(
        "NNRP_WASM_RUNTIME_MANIFEST_INVALID",
        "Browser runtime connect requires a browser-wasm capability manifest.",
      );
    }

    if (this.#binding.moduleUrl.trim().length === 0) {
      throw wasmRuntimeReadinessError(
        "NNRP_WASM_RUNTIME_MODULE_UNRESOLVED",
        "Browser runtime connect requires a validated WASM module URL or injected module.",
      );
    }

    const artifact = this.#binding.artifact;
    if (artifact !== undefined) {
      const missing = artifact.requiredExports.filter((name) => !artifact.manifest.exports.includes(name));
      if (missing.length > 0) {
        throw wasmRuntimeReadinessError(
          "NNRP_WASM_RUNTIME_EXPORTS_UNVALIDATED",
          `Browser runtime connect requires validated WASM exports: ${missing.join(", ")}.`,
        );
      }
    }
  }

  #createTransportCandidates(options: NnrpBrowserTransportSelectionOptions): readonly NnrpTransportCandidate[] {
    const providers = options.providers ?? this.#binding.transportProviders;
    return createTransportCandidates({
      local: { ...this.#binding.manifest, transports: providers.map((provider) => provider.kind) },
      peer: options.peerManifest,
      providers,
      ...(options.requestedMaxFrameBytes === undefined
        ? {}
        : { requestedMaxFrameBytes: options.requestedMaxFrameBytes }),
      ...(options.probeMetricsByProviderId === undefined
        ? {}
        : { probeMetricsByProviderId: options.probeMetricsByProviderId }),
    });
  }
}

export interface NnrpBrowserClientState {
  readonly endpoint: string;
  readonly providerEndpoint: string;
  readonly provider: NnrpBrowserTransportProvider;
  readonly runtime: NnrpBrowserRuntime;
  readonly transportPolicy: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpBrowserSessionOptions;
}

export class NnrpBrowserClient {
  readonly #state: NnrpBrowserClientState;
  readonly #sessions = new Map<string, NnrpBrowserClientSession>();
  #nextSessionId = 1;
  #nextWireSessionId = 1;
  #closed = false;

  public constructor(state: NnrpBrowserClientState) {
    this.#state = state;
    browserClientRoleOpeners.set(this, async (options, wireSessionId) => {
      this.#ensureOpen();
      const connection = await this.#state.provider.connect({
        endpoint: this.#state.providerEndpoint,
        maxPacketBytes: this.#state.provider.metadata.limits.maxFrameBytes,
      });
      const schema = standardProfileSchema(options.inputProfile);
      const role = await openBrowserWasmRole(requireBrowserWasmModule(this.#state.runtime), connection, {
        requestedSessionId: wireSessionId,
        profileId: standardProfileId(options.inputProfile),
        schemaId: schema.id,
        schemaVersion: schema.version,
        priorityClass: 1,
        defaultDeadlineMs: 30_000,
        maxInFlightOperations: normalizedMaxInFlightOperations(options.initialCredits),
        leaseTtlHintMs: 0,
        maxPacketBytes: browserMaxPacketBytes(this.#state.provider),
      });
      browserRuntimeRoles.get(this.#state.runtime)?.add(role);
      return role;
    });
    browserClientSessionReleasers.set(this, (session) => {
      if (this.#sessions.get(session.sessionId) === session) this.#sessions.delete(session.sessionId);
    });
  }

  public get endpoint(): string {
    return this.#state.endpoint;
  }

  public get transportPolicy(): NnrpTransportPolicy {
    return this.#state.transportPolicy;
  }

  public get runtime(): NnrpBrowserRuntime {
    return this.#state.runtime;
  }

  public openSession(options: NnrpBrowserSessionOptions = {}): NnrpBrowserClientSession {
    this.#ensureOpen();
    validateSessionMetadata(options);
    const normalized = this.#createSessionOptions(options);
    const sessionId = normalized.sessionId!;
    if (this.#sessions.has(sessionId)) {
      throw new NnrpProtocolError({
        code: "NNRP_SESSION_ID_DUPLICATE",
        message: `Browser client session id '${sessionId}' is already open.`,
        source: "runtime",
        retryable: false,
      });
    }
    const session = new NnrpBrowserClientSession({
      client: this,
      options: normalized,
      wireSessionId: this.#nextWireSessionId++,
    });
    this.#sessions.set(sessionId, session);
    return session;
  }

  public nextSessionEvent(sessionId: string, options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    this.#ensureOpen();
    validateEventPollOptions(options);
    const session = this.#sessions.get(sessionId);
    return session === undefined ? Promise.reject(sessionNotOpenError(sessionId)) : session.nextEvent(options);
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const results = await Promise.allSettled(
      [...this.#sessions.values()].map(async (session) => await session.close()),
    );
    this.#sessions.clear();
    throwFirstRejected(results);
  }

  public get closed(): boolean {
    return this.#closed || this.#state.runtime.closed;
  }

  #ensureOpen(): void {
    if (this.closed) {
      throw closedError("browser client");
    }
  }

  #createSessionOptions(options: NnrpBrowserSessionOptions): NnrpBrowserSessionOptions {
    const merged = mergeSessionOptions(this.#state.sessionDefaults, options);
    return {
      ...merged,
      sessionId: merged.sessionId ?? `browser-session-${this.#nextSessionId++}`,
    };
  }
}

export interface NnrpBrowserClientSessionState {
  readonly client: NnrpBrowserClient;
  options: NnrpBrowserSessionOptions;
  readonly wireSessionId: number;
}

interface BrowserEventWaiter {
  readonly resolve: (event: NnrpRuntimeEvent) => void;
  readonly reject: (error: unknown) => void;
}

interface BrowserResultWaiter {
  readonly resolve: (result: NnrpResult) => void;
  readonly reject: (error: unknown) => void;
}

export class NnrpBrowserClientSession {
  readonly #state: NnrpBrowserClientSessionState;
  readonly #runtimeObjects = new RuntimeObjectLifecycle();
  readonly #inFlightFrames = new Set<number>();
  readonly #terminalFrames = new Set<number>();
  readonly #cancelledOperations = new Set<bigint>();
  readonly #submitCancellationCleanups = new Map<number, () => void>();
  readonly #capacityWaiters: Array<() => void> = [];
  readonly #eventQueue: NnrpRuntimeEvent[] = [];
  readonly #eventWaiters: BrowserEventWaiter[] = [];
  readonly #resultWaiters = new Map<number, BrowserResultWaiter>();
  #runtimeObjectQueue: Promise<void> = Promise.resolve();
  #rolePromise: Promise<BrowserWasmRole> | undefined;
  #eventPump: Promise<void> | undefined;
  #availableCredits: number;
  #nextControlSequence = 1n;
  #nextRuntimeFrameId = 1;
  #closed = false;

  public constructor(state: NnrpBrowserClientSessionState) {
    this.#state = state;
    this.#availableCredits = state.options.initialCredits ?? Number.POSITIVE_INFINITY;
  }

  public get options(): NnrpBrowserSessionOptions {
    return this.#state.options;
  }

  public get sessionId(): string {
    return this.#state.options.sessionId ?? "";
  }

  public async submit(request: NnrpSubmitRequest, options: NnrpSubmitOptions = {}): Promise<NnrpResult> {
    let normalized: NnrpNormalizedSubmitRequest;
    const deadlineMillis = validateSubmitOptions(options, "wasm");
    try {
      this.#ensureOpen();
      const capacityWait = this.#reserveOrAwaitSubmitCapacity(options, deadlineMillis);
      if (capacityWait !== undefined) {
        await capacityWait;
      }
      normalized = normalizeSubmitRequest(request);
      this.#beginFrame(normalized.frameId);
    } catch (error) {
      return Promise.reject(error);
    }

    try {
      this.#prepareSubmitDispatch(options, deadlineMillis);
      const role = await this.#role();
      const result = this.#waitForResult(normalized.frameId);
      try {
        await role.submitNoWait(normalized.frameId, encodeFrameSubmitPayload(normalized));
      } catch (error) {
        this.#resultWaiters.delete(normalized.frameId);
        throw error;
      }
      const cancellation = this.#armSubmitCancellation(
        normalized.frameId,
        normalized.operationId,
        options,
        deadlineMillis,
      );
      await this.#sendSubmitDeadline(normalized.operationId, deadlineMillis);
      this.#ensureEventPump();
      return await Promise.race([result, cancellation.promise]).finally(cancellation.cleanup);
    } finally {
      this.#resultWaiters.delete(normalized.frameId);
      this.#finishFrame(normalized.frameId);
    }
  }

  public async submitNoWait(request: NnrpSubmitRequest, options: NnrpSubmitOptions = {}): Promise<bigint> {
    let normalized: NnrpNormalizedSubmitRequest;
    const deadlineMillis = validateSubmitOptions(options, "wasm");
    try {
      this.#ensureOpen();
      this.#reserveImmediateCapacity();
      normalized = normalizeSubmitRequest(request);
      this.#beginFrame(normalized.frameId);
    } catch (error) {
      return Promise.reject(error);
    }

    try {
      this.#prepareSubmitDispatch(options, deadlineMillis);
      const operationId = await (await this.#role()).submitNoWait(
        normalized.frameId,
        encodeFrameSubmitPayload(normalized),
      );
      this.#armDetachedSubmitCancellation(normalized.frameId, normalized.operationId, options, deadlineMillis);
      await this.#sendSubmitDeadline(normalized.operationId, deadlineMillis);
      return operationId;
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
      return this.#sendRuntimeFrame(messageType, payload).then(
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
    if (event.type === "cancel" || event.type === "abort") {
      this.#cancelledOperations.add(event.metadata.operationId);
      return;
    }

    if (event.type === "result") {
      this.#finishTerminalFrame(event.result.frameId);
      return;
    }

    if (event.type === "drop") {
      this.#finishTerminalFrame(event.frameId);
      return;
    }

    if (event.type === "flow-update") {
      this.#availableCredits = event.update.credits;
      this.#drainCapacityWaiters();
      return;
    }

    if (event.type === "credit-update") {
      this.#availableCredits = normalizeCreditWindow(event.metadata.creditWindow);
      this.#drainCapacityWaiters();
      return;
    }

    if (event.type === "close") {
      this.#inFlightFrames.clear();
      this.#terminalFrames.clear();
      this.#cancelledOperations.clear();
      this.#drainCapacityWaiters();
    }
  }

  public async nextEvent(options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      throw error;
    }
    const event = await this.#readNextEvent(options);
    await this.#releaseForTerminalControl(event);
    return event;
  }

  public async nextResult(options: NnrpEventPollOptions = {}): Promise<NnrpResult> {
    while (true) {
      const event = await this.nextEvent(options);
      throwIfResultDrop(event);
      if (event.type === "result") {
        return event.result;
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

    return Promise.reject(recoveryUnsupportedError("wasm"));
  }

  public async patch(request: NnrpSessionPatchRequest): Promise<NnrpSessionPatchResult> {
    let patch: NnrpSessionPatchRequest;
    try {
      this.#ensureOpen();
      patch = normalizeSessionPatchRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }

    const hasWirePatch = patch.inputProfile !== undefined || patch.targetCadence !== undefined ||
      patch.qualityTier !== undefined;
    const ack: BrowserPatchAck = hasWirePatch
      ? await (await this.#role()).patchSession(patch, this.#state.options.inputProfile)
      : { accepted: true, appliedPatch: patch, metadata: { ackStatus: "local-only" } };

    if (ack.accepted) {
      this.#state.options = mergeSessionOptions(this.#state.options, ack.appliedPatch);
    }
    if (ack.appliedPatch.initialCredits !== undefined) {
      this.#availableCredits = ack.appliedPatch.initialCredits;
      this.#drainCapacityWaiters();
    }

    return {
      accepted: ack.accepted,
      sessionId: this.sessionId,
      metadata: ack.metadata,
      ...(ack.diagnostic === undefined ? {} : { diagnostic: ack.diagnostic }),
    };
  }

  public async *events(options: NnrpEventPollOptions = {}): AsyncIterable<NnrpRuntimeEvent> {
    while (!this.closed) {
      yield await this.nextEvent(options);
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#inFlightFrames.clear();
    this.#terminalFrames.clear();
    this.#cancelledOperations.clear();
    this.#runtimeObjects.clear();
    for (const cleanup of this.#submitCancellationCleanups.values()) {
      cleanup();
    }
    this.#submitCancellationCleanups.clear();
    this.#drainCapacityWaiters();
    const closed = closedError("browser client session");
    for (const waiter of this.#eventWaiters.splice(0)) waiter.reject(closed);
    for (const waiter of this.#resultWaiters.values()) waiter.reject(closed);
    this.#resultWaiters.clear();
    let role: BrowserWasmRole | undefined;
    try {
      if (this.#rolePromise !== undefined) {
        role = await this.#rolePromise;
        await role.close();
      }
    } finally {
      if (role !== undefined) browserRuntimeRoles.get(this.#state.client.runtime)?.delete(role);
      releaseBrowserSession(this.#state.client, this);
    }
  }

  public get closed(): boolean {
    return this.#closed || this.#state.client.closed;
  }

  #readNextEvent(options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }
    if (options.signal?.aborted) return Promise.reject(eventPollCancelledError(options.signal));
    const queued = this.#takeQueuedEvent();
    if (queued !== undefined) return Promise.resolve(queued);

    let waiter: BrowserEventWaiter;
    const pending = new Promise<NnrpRuntimeEvent>((resolve, reject) => {
      waiter = { resolve, reject };
      this.#eventWaiters.push(waiter);
    });
    this.#ensureEventPump();
    return raceEventPoll(pending, options).finally(() => {
      const index = this.#eventWaiters.indexOf(waiter);
      if (index >= 0) this.#eventWaiters.splice(index, 1);
    });
  }

  #ensureOpen(): void {
    if (this.closed) {
      throw closedError("browser client session");
    }
  }

  #beginFrame(frameId: number): void {
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
  }

  #prepareSubmitDispatch(options: NnrpSubmitOptions, deadlineMillis: number | undefined): void {
    throwIfSubmitCancelledBeforeDispatch(options, "wasm");
    if (deadlineMillis !== undefined) {
      throwIfSubmitCancelledBeforeDispatch(options, "wasm", deadlineMillis);
    }
  }

  #sendSubmitDeadline(operationId: bigint, deadlineMillis: number | undefined): Promise<void> {
    if (deadlineMillis === undefined) return Promise.resolve();
    return this.updateDeadline({
      operationId,
      controlSequence: this.#allocateControlSequence(),
      priorityClass: 0,
      priorityDelta: 0,
      deadlineUnixMs: BigInt(Math.ceil(deadlineMillis)),
      flags: 0,
    });
  }

  #armSubmitCancellation(
    frameId: number,
    operationId: bigint,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): { readonly promise: Promise<never>; readonly cleanup: () => void } {
    let rejectCancellation: (error: unknown) => void = () => {};
    const promise = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const cleanup = this.#installSubmitCancellation(
      frameId,
      operationId,
      options,
      deadlineMillis,
      rejectCancellation,
    );
    return { promise, cleanup };
  }

  #armDetachedSubmitCancellation(
    frameId: number,
    operationId: bigint,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): void {
    this.#installSubmitCancellation(frameId, operationId, options, deadlineMillis);
  }

  #installSubmitCancellation(
    frameId: number,
    operationId: bigint,
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
      cleanup();
      const cancellation = this.cancel({
        operationId,
        controlSequence: this.#allocateControlSequence(),
        reasonCode,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      });
      if (onCancelled === undefined) {
        void cancellation.catch(() => {});
      } else {
        void cancellation.then(
          () => onCancelled(error),
          (sendError) => onCancelled(sendError),
        );
      }
    };
    const onAbort = () => trigger(1, submitCancelledError("wasm", options.signal));

    options.signal?.addEventListener?.("abort", onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return cleanup;
    }
    if (deadlineMillis !== undefined) {
      timeout = setTimeout(
        () => trigger(3, submitTimeoutError("wasm")),
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
    if (this.#state.options.submitCapacityPolicy !== "await") {
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
    throwIfSubmitCancelledBeforeDispatch(options, "wasm", deadlineMillis);
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
      const onAbort = () => finish(submitCancelledError("wasm", options.signal));

      this.#capacityWaiters.push(wake);
      options.signal?.addEventListener?.("abort", onAbort, { once: true });
      if (deadlineMillis !== undefined) {
        timeout = setTimeout(
          () => finish(submitTimeoutError("wasm")),
          Math.max(0, deadlineMillis - Date.now()),
        );
      }
    });
  }

  #reserveImmediateCapacity(): void {
    if (this.#state.options.submitCapacityPolicy !== "await") {
      return;
    }

    if (this.#availableCredits <= 0) {
      throw backpressureCreditExhaustedError("wasm");
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
    if (event.type === "partial-result") {
      return this.#cancelledOperations.has(event.metadata.operationId);
    }

    if (event.type === "result" && this.#cancelledOperations.has(BigInt(event.result.frameId))) {
      this.#terminalFrames.add(event.result.frameId);
      this.#finishFrame(event.result.frameId);
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

  #sendRuntimeFrame(messageType: NnrpMessageType, payload: Uint8Array): Promise<void> {
    try {
      this.#ensureOpen();
      const frameId = this.#nextRuntimeFrameId;
      this.#nextRuntimeFrameId = frameId === 0xffff_ffff ? 1 : frameId + 1;
      return this.#role().then(async (role) => await role.sendRuntimeFrame(messageType, frameId, payload));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  #role(): Promise<BrowserWasmRole> {
    this.#ensureOpen();
    return this.#rolePromise ??= openBrowserClientRole(
      this.#state.client,
      this.#state.options,
      this.#state.wireSessionId,
    );
  }

  #waitForResult(frameId: number): Promise<NnrpResult> {
    return new Promise((resolve, reject) => {
      this.#resultWaiters.set(frameId, { resolve, reject });
    });
  }

  #ensureEventPump(): void {
    if (this.#eventPump !== undefined || this.#closed) return;
    this.#eventPump = this.#pumpEvents().finally(() => {
      this.#eventPump = undefined;
      if (!this.#closed && (this.#eventWaiters.length > 0 || this.#resultWaiters.size > 0)) {
        this.#ensureEventPump();
      }
    });
  }

  async #pumpEvents(): Promise<void> {
    try {
      const role = await this.#role();
      while (!this.#closed && (this.#eventWaiters.length > 0 || this.#resultWaiters.size > 0)) {
        const event = await role.awaitEvent(this.sessionId);
        if (event.type === "result") {
          const waiter = this.#resultWaiters.get(event.result.frameId);
          if (waiter !== undefined) {
            this.#resultWaiters.delete(event.result.frameId);
            waiter.resolve(event.result);
            continue;
          }
        }
        if (event.type === "drop") {
          const waiter = this.#resultWaiters.get(event.frameId);
          if (waiter !== undefined) {
            this.#resultWaiters.delete(event.frameId);
            try {
              throwIfResultDrop(event);
            } catch (error) {
              waiter.reject(error);
            }
            continue;
          }
        }
        if (this.#shouldSuppressCancelledPayload(event)) continue;
        this.completeEvent(event);
        const waiter = this.#eventWaiters.shift();
        if (waiter === undefined) this.#eventQueue.push(event);
        else waiter.resolve(event);
      }
    } catch (error) {
      for (const waiter of this.#eventWaiters.splice(0)) waiter.reject(error);
      for (const waiter of this.#resultWaiters.values()) waiter.reject(error);
      this.#resultWaiters.clear();
    }
  }

  #takeQueuedEvent(): NnrpRuntimeEvent | undefined {
    while (this.#eventQueue.length > 0) {
      const event = this.#eventQueue.shift()!;
      if (this.#shouldSuppressCancelledPayload(event)) continue;
      this.completeEvent(event);
      return event;
    }
    return undefined;
  }
}

export function createWasmRuntimeBinding(options: NnrpWasmBindingOptions = {}): NnrpWasmRuntimeBinding {
  const artifact = options.artifact === undefined ? undefined : resolveWasmArtifact(options.artifact);

  return {
    manifest: createBrowserWasmManifest(BROWSER_RUNTIME_CAPABILITIES),
    moduleUrl: normalizeModuleUrl(options.moduleUrl ?? artifact?.moduleUrl ?? DEFAULT_BROWSER_WASM_URL),
    ...(options.module === undefined ? {} : { module: options.module }),
    ...(artifact === undefined ? {} : { artifact }),
    transportProviders: [...(options.transportProviders ?? [])],
  };
}

export function resolveWasmArtifact(options: NnrpWasmArtifactOptions): NnrpResolvedWasmArtifact {
  validateWasmArtifactManifest(options.manifest, options.requiredExports);
  const baseUrl = options.baseUrl === undefined ? undefined : normalizeModuleUrl(options.baseUrl);

  return {
    manifest: options.manifest,
    moduleUrl: resolveArtifactUrl(options.manifest.wasm, baseUrl),
    glueUrl: resolveArtifactUrl(options.manifest.glue, baseUrl),
    typesUrl: resolveArtifactUrl(options.manifest.types, baseUrl),
    requiredExports: requiredWasmExports(options.requiredExports),
  };
}

export function validateWasmArtifactManifest(
  manifest: NnrpWasmArtifactManifest,
  requiredExports?: readonly string[],
): void {
  if (!isWasmArtifactManifest(manifest)) {
    throw wasmArtifactError("NNRP_WASM_ARTIFACT_MANIFEST_INVALID", "Invalid WASM artifact manifest.");
  }

  const missing = requiredWasmExports(requiredExports).filter((name) => !manifest.exports.includes(name));
  if (missing.length > 0) {
    throw wasmArtifactError(
      "NNRP_WASM_ARTIFACT_EXPORT_MISSING",
      `WASM artifact manifest is missing exports: ${missing.join(", ")}.`,
    );
  }
}

function normalizeModuleUrl(moduleUrl: string | URL): string {
  return moduleUrl instanceof URL ? moduleUrl.toString() : moduleUrl;
}

function resolveArtifactUrl(asset: string, baseUrl: string | undefined): string {
  if (baseUrl === undefined || isAbsoluteUrl(asset)) {
    return asset;
  }

  if (isAbsoluteUrl(baseUrl)) {
    return new URL(asset, ensureTrailingSlash(baseUrl)).toString();
  }

  return `${baseUrl.replace(/\/+$/, "")}/${asset.replace(/^\/+/, "")}`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function isWasmArtifactManifest(value: unknown): value is NnrpWasmArtifactManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const manifest = value as Record<string, unknown>;
  return manifest.package === "nnrp-wasm" &&
    isNonEmptyString(manifest.wasm) &&
    isNonEmptyString(manifest.glue) &&
    isNonEmptyString(manifest.types) &&
    (manifest.owner === undefined || typeof manifest.owner === "string") &&
    (manifest.downstream_wrapper === undefined || typeof manifest.downstream_wrapper === "string") &&
    Array.isArray(manifest.exports) &&
    manifest.exports.every((entry) => typeof entry === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requiredWasmExports(requiredExports: readonly string[] | undefined): readonly string[] {
  return [
    ...new Set([
      "nnrp_wasm_protocol_major",
      "nnrp_wasm_wire_format",
      "openBrowserClientRole",
      "selectTransportWithProbeJson",
      "summarizeProviderProbeJson",
      ...(requiredExports ?? []),
    ]),
  ];
}

function validateBrowserTransportProviders(providers: readonly NnrpBrowserTransportProvider[]): void {
  if (providers.length === 0) {
    throw new NnrpCapabilityError({
      code: "NNRP_BROWSER_TRANSPORT_PROVIDER_MISSING",
      message: "At least one browser transport provider package or explicit provider is required.",
      source: "transport",
      retryable: false,
      transport: "websocket",
    });
  }
  for (const provider of providers) {
    if (!isBrowserTransportProvider(provider) || typeof provider.connect !== "function") {
      throw new NnrpCapabilityError({
        code: "NNRP_BROWSER_TRANSPORT_PROVIDER_INVALID",
        message: "Browser transport providers must own a WebSocket connect implementation.",
        source: "transport",
        retryable: false,
        transport: "websocket",
      });
    }
  }
}

function selectBrowserTransportProvider(
  providers: readonly NnrpBrowserTransportProvider[],
  policy: NnrpTransportPolicy,
  manifest: NnrpCapabilityManifest,
): NnrpBrowserTransportProvider {
  if (policy.startsWith("force-") && policy !== "force-websocket") {
    throw new NnrpTransportError({
      code: "NNRP_BROWSER_TRANSPORT_POLICY_UNSATISFIED",
      message: `${policy} cannot be satisfied by the browser WebSocket carrier.`,
      source: "transport",
      retryable: false,
      transport: policy.slice("force-".length) as NnrpTransportKind,
    });
  }
  const available = providers.filter((provider) => provider.localAvailable);
  const selection = selectTransport(
    createTransportCandidates({
      local: { ...manifest, transports: ["websocket"] },
      peer: { ...manifest, transports: ["websocket"] },
      providers: available,
    }),
    policy,
  );
  const selected = available.find((provider) => provider.metadata.id === selection.selected?.provider.id);
  if (selected === undefined) {
    throw new NnrpTransportError({
      code: "NNRP_BROWSER_TRANSPORT_PROVIDER_UNAVAILABLE",
      message: "No installed browser WebSocket provider can satisfy the selected policy.",
      source: "transport",
      retryable: false,
      transport: "websocket",
    });
  }
  return selected;
}

async function discoverBrowserTransportProviders(): Promise<readonly NnrpBrowserTransportProvider[]> {
  const websocket = await importOptionalTransportModule("@nnrp/transport-websocket");
  if (!isTransportFactory(websocket?.createWebSocketTransportProvider)) {
    return [];
  }

  const provider = websocket.createWebSocketTransportProvider({ WebSocket: globalThis.WebSocket });
  if (!isBrowserTransportProvider(provider)) {
    return [];
  }
  return [provider];
}

async function importOptionalTransportModule(specifier: string): Promise<Record<string, unknown> | undefined> {
  try {
    return await import(specifier) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function isTransportFactory(
  value: unknown,
): value is (options?: { readonly WebSocket?: typeof WebSocket }) => NnrpBrowserTransportProvider {
  return typeof value === "function";
}

function isBrowserTransportProvider(value: unknown): value is NnrpBrowserTransportProvider {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const provider = value as Record<string, unknown>;
  return provider.kind === "websocket" &&
    Array.isArray(provider.endpointSchemes) &&
    provider.endpointSchemes.every((scheme) => scheme === "ws" || scheme === "wss") &&
    typeof provider.metadata === "object" &&
    typeof provider.localAvailable === "boolean";
}

function normalizeEndpoint(endpoint: string | URL): string {
  return endpoint instanceof URL ? endpoint.toString() : endpoint;
}

function validateEndpoint(endpoint: string | URL): void {
  if (normalizeEndpoint(endpoint).trim().length === 0) {
    throw new NnrpCapabilityError({
      code: "NNRP_WASM_ENDPOINT_EMPTY",
      message: "NNRP browser endpoint must not be empty.",
      source: "wasm",
      retryable: false,
    });
  }
}

function mergeSessionOptions(
  defaults: NnrpBrowserSessionOptions | undefined,
  options: NnrpBrowserSessionOptions,
): NnrpBrowserSessionOptions {
  const merged = {
    ...defaults,
    ...options,
    metadata: {
      ...(defaults?.metadata ?? {}),
      ...(options.metadata ?? {}),
    },
  };
  validateSessionMetadata(merged);
  return merged;
}

function closedError(target: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code: "NNRP_WASM_CLOSED",
    message: `Cannot use a closed ${target}.`,
    source: "wasm",
    retryable: false,
  });
}

function requireBrowserWasmModule(runtime: NnrpBrowserRuntime): BrowserWasmModule {
  const wasm = browserRuntimeModules.get(runtime);
  if (wasm === undefined) {
    throw new NnrpWasmBindingUnavailableError({
      code: "NNRP_WASM_BINDING_NOT_INSTANTIATED",
      message: "Browser runtime was not opened through the package-owned WASM lifecycle.",
      source: "wasm",
      retryable: false,
    });
  }
  return wasm;
}

function openBrowserClientRole(
  client: NnrpBrowserClient,
  options: NnrpBrowserSessionOptions,
  wireSessionId: number,
): Promise<BrowserWasmRole> {
  const open = browserClientRoleOpeners.get(client);
  if (open === undefined) throw closedError("browser client");
  return open(options, wireSessionId);
}

function releaseBrowserSession(client: NnrpBrowserClient, session: NnrpBrowserClientSession): void {
  browserClientSessionReleasers.get(client)?.(session);
}

function normalizedMaxInFlightOperations(initialCredits: number | undefined): number {
  if (initialCredits === undefined || !Number.isFinite(initialCredits)) return 4;
  return Math.max(1, Math.min(0xffff, Math.trunc(initialCredits)));
}

function normalizeCreditWindow(creditWindow: bigint): number {
  return creditWindow > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(creditWindow);
}

function browserMaxPacketBytes(provider: NnrpBrowserTransportProvider): number {
  const value = provider.metadata.limits.maxFrameBytes;
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new NnrpCapabilityError({
      code: "NNRP_BROWSER_TRANSPORT_FRAME_LIMIT_INVALID",
      message: "Browser provider maxFrameBytes must be representable by the WASM host.",
      source: "transport",
      retryable: false,
      transport: "websocket",
    });
  }
  return Number(value);
}

function sessionNotOpenError(sessionId: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code: "NNRP_BROWSER_SESSION_NOT_OPEN",
    message: `Browser session '${sessionId}' is not open on this client.`,
    source: "runtime",
    retryable: false,
  });
}

function encodeFrameSubmitPayload(submit: NnrpNormalizedSubmitRequest): Uint8Array {
  const bodyParts = submit.tensors?.map((tensor) => tensor.payload) ??
    (submit.payload === undefined ? [] : [submit.payload]);
  const bodyBytes = bodyParts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(FRAME_SUBMIT_METADATA_SIZE + bodyBytes);
  const view = new DataView(output.buffer);
  view.setUint16(10, submit.tensors?.length ?? 0, true);
  view.setBigUint64(40, submit.operationId, true);
  view.setUint8(52, submit.submitMode === "object-reference" ? 1 : 0);
  view.setUint8(54, 0xff);
  view.setUint32(64, payloadKind(submit), true);
  view.setUint16(68, Math.max(bodyParts.length, 1), true);
  let offset = FRAME_SUBMIT_METADATA_SIZE;
  for (const part of bodyParts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function payloadKind(submit: NnrpNormalizedSubmitRequest): number {
  const profile = submit.inputProfile ?? submit.descriptor?.profile;
  if (profile === "tensor" || submit.tensors !== undefined) return 0x01;
  if (profile === "token") return 0x02;
  if (profile === "structured_event") return 0x10;
  if (profile === "tool_delta") return 0x20;
  return 0x40;
}

function throwFirstRejected(results: readonly PromiseSettledResult<unknown>[]): void {
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (rejected !== undefined) throw rejected.reason;
}

function raceEventPoll<T>(promise: Promise<T>, options: NnrpEventPollOptions): Promise<T> {
  if (options.signal?.aborted) {
    return Promise.reject(eventPollCancelledError(options.signal));
  }

  if (options.timeoutMillis !== undefined) {
    return raceEventTimeout(promise, options.timeoutMillis, "wasm", options.signal);
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
  source: "wasm",
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

function eventPollTimeoutError(source: "wasm"): NnrpTimeoutError {
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

function validateSubmitOptions(options: NnrpSubmitOptions, source: "wasm"): number | undefined {
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
  source: "wasm",
  deadlineMillis?: number,
): void {
  if (options.signal?.aborted) {
    throw submitCancelledError(source, options.signal);
  }
  if (deadlineMillis !== undefined && Date.now() >= deadlineMillis) {
    throw submitTimeoutError(source);
  }
}

function submitCancelledError(source: "wasm", signal: NnrpAbortSignalLike | undefined): NnrpTimeoutError {
  return new NnrpTimeoutError({
    code: "NNRP_SUBMIT_CANCELLED",
    message: "Submit was cancelled.",
    source,
    retryable: false,
    cause: signal?.reason,
  });
}

function submitTimeoutError(source: "wasm"): NnrpTimeoutError {
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

function backpressureCreditExhaustedError(source: "native" | "wasm"): NnrpTransportError {
  return new NnrpTransportError({
    code: "NNRP_BACKPRESSURE_CREDIT_EXHAUSTED",
    message: "Submit cannot dispatch because the session has no available flow-control credits.",
    source,
    retryable: true,
  });
}

function wasmArtifactError(code: string, message: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code,
    message,
    source: "wasm",
    retryable: false,
  });
}

function wasmRuntimeReadinessError(code: string, message: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code,
    message,
    source: "wasm",
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
