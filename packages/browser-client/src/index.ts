import {
  type BudgetMetadata,
  type CacheInvalidateMetadata,
  type CacheMissMetadata,
  type CacheReferenceMetadata,
  type CapabilityMetadata,
  type ControlRequestMetadata,
  createBrowserWasmManifest,
  createNnrpResultFromLifecycle,
  createNnrpResultFromRuntimeEvent,
  createTransportSelectionSummary,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  encodeRuntimeObjectMetadataSegments,
  encodeSessionOpenMetadata,
  encodeSubmitPayload,
  NNRP_PROTOCOL_VERSION,
  NNRP_STANDARD_PROFILE_TOKEN,
  NNRP_TOKEN_DELTA_SCHEMA_ID,
  NNRP_TOKEN_DELTA_SCHEMA_VERSION,
  type NnrpAbortSignalLike,
  NnrpCacheObjectKind,
  NnrpCapabilityError,
  type NnrpCapabilityManifest,
  type NnrpClientEvent,
  type NnrpClientProviderRoutes,
  NnrpEndpoint,
  type NnrpEventPollOptions,
  NnrpFlowScopeKind,
  type NnrpInputProfile,
  NnrpMessageType,
  type NnrpNormalizedSubmitRequest,
  type NnrpOperationState,
  NnrpProtocolError,
  NnrpRecoveryError,
  type NnrpResult,
  type NnrpRuntimeEvent,
  type NnrpSessionMigrationRequest,
  type NnrpSessionPatchRequest,
  type NnrpSessionPatchResult,
  NnrpSessionPriorityClass,
  NnrpSessionRecoveryTicket,
  type NnrpSubmitOptions,
  type NnrpSubmitRequest,
  NnrpTimeoutError,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  type NnrpTransportProvider,
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
  type RouteHintMetadata,
  type RuntimeControlMetadata,
  RuntimeRole,
  type SchedulingMetadata,
  selectTransport,
  type SupersedeMetadata,
  type TraceContextMetadata,
  validateEventPollOptions,
} from "@nnrp/core";
import {
  assertNegotiatedBrowserSessionId,
  type BrowserPatchAck,
  type BrowserWasmConnection,
  type BrowserWasmModule,
  type BrowserWasmRole,
  loadBrowserWasmModule,
  openBrowserWasmConnection,
} from "./wasm-role.js";
import { NnrpWasmBindingUnavailableError } from "./errors.js";

export { NnrpWasmBindingUnavailableError };

const EMPTY_PAYLOAD = new Uint8Array();
const BROWSER_SESSION_DEFAULTS: NormalizedBrowserSessionOptions = Object.freeze({
  requestedSessionId: 0,
  profileId: NNRP_STANDARD_PROFILE_TOKEN,
  schemaId: NNRP_TOKEN_DELTA_SCHEMA_ID,
  schemaVersion: NNRP_TOKEN_DELTA_SCHEMA_VERSION,
  priorityClass: NnrpSessionPriorityClass.Balanced,
  defaultDeadlineMillis: 500,
  maxInFlightOperations: 4,
  leaseTtlHintMillis: 30_000,
  allowResume: false,
  resumeTokenBytes: 0,
  cacheHints: Object.freeze([]),
});
const CACHE_OBJECT_KINDS = new Set<number>(
  Object.values(NnrpCacheObjectKind).filter((value): value is number => typeof value === "number"),
);

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
  readonly endpoint: NnrpEndpoint;
  readonly providerRoutes?: NnrpClientProviderRoutes;
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly transportProviders?: readonly NnrpBrowserTransportProvider[];
  readonly sessionDefaults?: NnrpBrowserSessionOptions;
}

export type NnrpBrowserTransportKind = Extract<NnrpTransportKind, "websocket">;

export interface NnrpBrowserTransportProvider extends NnrpTransportProvider {
  readonly kind: NnrpBrowserTransportKind;
  connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
}

export interface NnrpBrowserSessionOptions {
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

interface NormalizedBrowserSessionOptions {
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
const browserRuntimeConnections = new WeakMap<NnrpBrowserRuntime, Set<BrowserWasmConnection>>();
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
  browserRuntimeConnections.set(runtime, new Set());
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
    const { provider, endpoint: providerEndpoint } = selectBrowserTransportProvider(
      options.endpoint,
      options.providerRoutes,
      transportProviders,
      transportPolicy,
      this.#binding.manifest,
    );

    return new NnrpBrowserClient({
      endpoint: normalizeEndpoint(options.endpoint),
      providerEndpoint,
      provider,
      runtime: this,
      transportPolicy,
      ...(options.sessionDefaults === undefined ? {} : { sessionDefaults: options.sessionDefaults }),
    });
  }

  public selectTransport(options: NnrpTransportSelectionOptions): NnrpTransportSelectionSummary {
    this.#ensureOpen();

    return createTransportSelectionSummary(
      selectTransport(this.#binding.transportProviders.map((provider) => provider.descriptor), options),
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
    const connections = browserRuntimeConnections.get(this);
    if (connections !== undefined) {
      const results = await Promise.allSettled([...connections].map(async (connection) => await connection.close()));
      connections.clear();
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
  readonly #sessions = new Map<number, NnrpBrowserClientSession>();
  #connectionPromise: Promise<BrowserWasmConnection> | undefined;
  #closed = false;

  public constructor(state: NnrpBrowserClientState) {
    this.#state = state;
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

  public async openSession(options: NnrpBrowserSessionOptions = {}): Promise<NnrpBrowserClientSession> {
    this.#ensureOpen();
    const normalized = this.#createSessionOptions(options);
    const role = await (await this.#connection()).openSession(browserRoleConfig(normalized));
    return await this.#registerSession(normalized, role);
  }

  public async resumeSession(
    ticket: NnrpSessionRecoveryTicket,
    options: NnrpBrowserSessionOptions = {},
  ): Promise<NnrpBrowserClientSession> {
    this.#ensureOpen();
    if (!(ticket instanceof NnrpSessionRecoveryTicket)) {
      throw new TypeError("ticket must be an NnrpSessionRecoveryTicket");
    }
    const normalized = this.#createSessionOptions({
      ...options,
      requestedSessionId: ticket.sessionId,
      allowResume: true,
    });
    const role = await (await this.#connection()).resumeSession(ticket, browserRoleConfig(normalized));
    return await this.#registerSession(normalized, role);
  }

  async #registerSession(
    options: NormalizedBrowserSessionOptions,
    role: BrowserWasmRole,
  ): Promise<NnrpBrowserClientSession> {
    if (this.closed) {
      await role.close();
      throw closedError("browser client");
    }
    const sessionId = assertNegotiatedBrowserSessionId(role.sessionId);
    if (this.#sessions.has(sessionId)) {
      await role.close();
      throw duplicateBrowserSessionError(sessionId);
    }
    const activeProfile = standardInputProfile(options.profileId);
    const session = new NnrpBrowserClientSession({
      client: this,
      options,
      wireSessionId: sessionId,
    });
    browserSessionRoles.set(session, role);
    if (activeProfile !== undefined) browserSessionActiveProfiles.set(session, activeProfile);
    this.#sessions.set(sessionId, session);
    return session;
  }

  public nextSessionEvent(sessionId: number, options: NnrpEventPollOptions = {}): Promise<NnrpClientEvent> {
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
    if (this.#connectionPromise !== undefined) {
      const connection = await this.#connectionPromise.catch(() => undefined);
      if (connection !== undefined) {
        const connectionResult = await Promise.allSettled([connection.close()]);
        browserRuntimeConnections.get(this.#state.runtime)?.delete(connection);
        results.push(...connectionResult);
      }
    }
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

  #createSessionOptions(options: NnrpBrowserSessionOptions): NormalizedBrowserSessionOptions {
    return normalizeBrowserSessionOptions(this.#state.sessionDefaults, options);
  }

  #connection(): Promise<BrowserWasmConnection> {
    this.#ensureOpen();
    if (this.#connectionPromise === undefined) {
      const opening = (async () => {
        const carrier = await this.#state.provider.connect({
          endpoint: this.#state.providerEndpoint,
          maxPacketBytes: this.#state.provider.metadata.limits.maxFrameBytes,
        });
        const connection = await openBrowserWasmConnection(
          requireBrowserWasmModule(this.#state.runtime),
          carrier,
          { maxPacketBytes: browserMaxPacketBytes(this.#state.provider) },
        );
        if (this.closed) {
          await connection.close();
          throw closedError("browser client");
        }
        browserRuntimeConnections.get(this.#state.runtime)?.add(connection);
        return connection;
      })();
      const tracked = opening.catch((error) => {
        if (this.#connectionPromise === tracked) this.#connectionPromise = undefined;
        throw error;
      });
      this.#connectionPromise = tracked;
    }
    return this.#connectionPromise;
  }
}

export interface NnrpBrowserClientSessionState {
  readonly client: NnrpBrowserClient;
  readonly options: NnrpBrowserSessionOptions;
  readonly wireSessionId: number;
}

interface BrowserEventWaiter {
  readonly resolve: (event: NnrpClientEvent) => void;
  readonly reject: (error: unknown) => void;
}

interface BrowserResultWaiter {
  readonly resolve: (result: NnrpResult) => void;
  readonly reject: (error: unknown) => void;
}

const browserRuntimeEventOperationIds = new WeakMap<NnrpRuntimeEvent, bigint>();
const browserSessionRoles = new WeakMap<NnrpBrowserClientSession, BrowserWasmRole>();
const browserSessionActiveProfiles = new WeakMap<NnrpBrowserClientSession, NnrpInputProfile>();

export class NnrpBrowserClientSession {
  readonly #state: NnrpBrowserClientSessionState;
  readonly #runtimeObjects = new RuntimeObjectLifecycle();
  readonly #inFlightFrames = new Set<number>();
  readonly #terminalFrames = new Set<number>();
  readonly #operationByFrame = new Map<number, bigint>();
  readonly #cancelledOperations = new Set<bigint>();
  readonly #submitCancellationCleanups = new Map<number, () => void>();
  readonly #capacityWaiters: Array<() => void> = [];
  readonly #eventQueue: NnrpClientEvent[] = [];
  readonly #eventWaiters: BrowserEventWaiter[] = [];
  readonly #resultWaiters = new Map<number, BrowserResultWaiter>();
  #runtimeObjectQueue: Promise<void> = Promise.resolve();
  #eventPump: Promise<void> | undefined;
  #availableCredits: number;
  #submitCapacityPolicy: "reject" | "await" = "reject";
  #nextControlSequence = 1n;
  #nextRuntimeFrameId = 1;
  #closed = false;

  public constructor(state: NnrpBrowserClientSessionState) {
    this.#state = state;
    this.#availableCredits = Number.POSITIVE_INFINITY;
  }

  public get options(): NnrpBrowserSessionOptions {
    return this.#state.options;
  }

  public get sessionId(): number {
    return this.#state.wireSessionId;
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
      this.#beginFrame(normalized.frameId, normalized.operationId);
    } catch (error) {
      return Promise.reject(error);
    }

    try {
      this.#prepareSubmitDispatch(options, deadlineMillis);
      const role = this.#role();
      const result = this.#waitForResult(normalized.frameId);
      try {
        await role.submitNoWait(normalized.frameId, normalized.header, encodeSubmitPayload(normalized));
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
      this.#beginFrame(normalized.frameId, normalized.operationId);
    } catch (error) {
      return Promise.reject(error);
    }

    try {
      this.#prepareSubmitDispatch(options, deadlineMillis);
      const operationId = await this.#role().submitNoWait(
        normalized.frameId,
        normalized.header,
        encodeSubmitPayload(normalized),
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
      const operationId = browserRuntimeEventOperationIds.get(event) ??
        terminalOperationId(event, this.#operationByFrame.get(event.header.frameId));
      if (operationId !== undefined) browserRuntimeEventOperationIds.set(event, operationId);
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
      throw error;
    }
    const event = await this.#readNextEvent(options);
    if (event.type === "runtime") {
      await this.#releaseForTerminalControl(event.event);
    } else if (isTerminalOperationState(event.event.state)) {
      const frameId = this.#frameForOperation(event.event.operationId);
      if (frameId !== undefined) this.#finishTerminalFrame(frameId);
    }
    return event;
  }

  public async nextResult(options: NnrpEventPollOptions = {}): Promise<NnrpResult> {
    while (true) {
      const event = await this.nextEvent(options);
      if (event.type === "lifecycle") {
        if (isTerminalOperationState(event.event.state)) return createNnrpResultFromLifecycle(event.event);
        continue;
      }
      if (isRuntimeTerminalEvent(event.event)) {
        const operationId = browserRuntimeEventOperationIds.get(event.event) ?? terminalOperationId(event.event);
        if (operationId === undefined) {
          throw new NnrpProtocolError({
            code: "NNRP_TERMINAL_OPERATION_UNKNOWN",
            message: `Terminal frame ${event.event.header.frameId} has no associated operation id.`,
            source: "wasm",
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
      ? await this.#role().patchSession(patch, browserSessionActiveProfiles.get(this))
      : { accepted: true, appliedPatch: patch, metadata: { ackStatus: "local-only" } };

    if (ack.accepted) {
      if (ack.appliedPatch.inputProfile !== undefined) {
        browserSessionActiveProfiles.set(this, ack.appliedPatch.inputProfile);
      }
      if (ack.appliedPatch.submitCapacityPolicy !== undefined) {
        this.#submitCapacityPolicy = ack.appliedPatch.submitCapacityPolicy;
      }
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

  public async *events(options: NnrpEventPollOptions = {}): AsyncIterable<NnrpClientEvent> {
    while (!this.closed) {
      yield await this.nextEvent(options);
    }
  }

  public recoveryTicket(): NnrpSessionRecoveryTicket | undefined {
    this.#ensureOpen();
    return this.#role().recoveryTicket();
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
    const closed = closedError("browser client session");
    for (const waiter of this.#eventWaiters.splice(0)) waiter.reject(closed);
    for (const waiter of this.#resultWaiters.values()) waiter.reject(closed);
    this.#resultWaiters.clear();
    try {
      await this.#role().close();
    } finally {
      releaseBrowserSession(this.#state.client, this);
    }
  }

  public get closed(): boolean {
    return this.#closed || this.#state.client.closed;
  }

  #readNextEvent(options: NnrpEventPollOptions = {}): Promise<NnrpClientEvent> {
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
    const pending = new Promise<NnrpClientEvent>((resolve, reject) => {
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

  #role(): BrowserWasmRole {
    const role = browserSessionRoles.get(this);
    if (role === undefined) {
      throw wasmRuntimeReadinessError(
        "NNRP_BROWSER_SESSION_ROLE_UNAVAILABLE",
        "Browser session role is not connected.",
      );
    }
    return role;
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
      onCancelled?.(error);
      cleanup();
      const cancellation = this.cancel({
        operationId,
        controlSequence: this.#allocateControlSequence(),
        reasonCode,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      });
      void cancellation.catch(() => {});
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
    if (this.#submitCapacityPolicy !== "await") {
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

    const operationId = event.header.messageType === NnrpMessageType.ResultPush
      ? browserRuntimeEventOperationIds.get(event) ?? this.#operationByFrame.get(event.header.frameId)
      : undefined;
    if (operationId !== undefined && this.#cancelledOperations.has(operationId)) {
      this.#terminalFrames.add(event.header.frameId);
      this.#finishFrame(event.header.frameId);
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
      return this.#role().sendRuntimeFrame(messageType, frameId, payload);
    } catch (error) {
      return Promise.reject(error);
    }
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
      const role = this.#role();
      while (!this.#closed && (this.#eventWaiters.length > 0 || this.#resultWaiters.size > 0)) {
        const event = await role.awaitEvent();
        if (event.type === "runtime" && this.#shouldSuppressCancelledPayload(event.event)) continue;
        if (event.type === "runtime" && isRuntimeTerminalEvent(event.event)) {
          const frameId = event.event.header.frameId;
          const operationId = terminalOperationId(event.event, this.#operationByFrame.get(frameId));
          const waiter = this.#resultWaiters.get(frameId);
          if (waiter !== undefined) {
            if (operationId === undefined) {
              throw new NnrpProtocolError({
                code: "NNRP_TERMINAL_OPERATION_UNKNOWN",
                message: `Terminal frame ${frameId} has no associated operation id.`,
                source: "wasm",
                retryable: false,
              });
            }
            browserRuntimeEventOperationIds.set(event.event, operationId);
            this.#resultWaiters.delete(frameId);
            this.completeEvent(event.event);
            waiter.resolve(createNnrpResultFromRuntimeEvent(operationId, event.event));
            continue;
          }
        }
        if (event.type === "lifecycle" && isTerminalOperationState(event.event.state)) {
          const frameId = this.#frameForOperation(event.event.operationId);
          const waiter = frameId === undefined ? undefined : this.#resultWaiters.get(frameId);
          if (frameId !== undefined) {
            this.#finishTerminalFrame(frameId);
          }
          if (frameId !== undefined && waiter !== undefined) {
            this.#resultWaiters.delete(frameId);
            waiter.resolve(createNnrpResultFromLifecycle(event.event));
            continue;
          }
        }
        if (event.type === "runtime") this.completeEvent(event.event);
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

  #takeQueuedEvent(): NnrpClientEvent | undefined {
    while (this.#eventQueue.length > 0) {
      const event = this.#eventQueue.shift()!;
      if (event.type === "runtime" && this.#shouldSuppressCancelledPayload(event.event)) continue;
      if (event.type === "runtime") this.completeEvent(event.event);
      return event;
    }
    return undefined;
  }

  #frameForOperation(operationId: bigint): number | undefined {
    for (const [frameId, candidate] of this.#operationByFrame) {
      if (candidate === operationId) return frameId;
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
      "openBrowserClientConnection",
      "selectTransportWithProbeJson",
      "summarizeProviderProbeJson",
      ...(requiredExports ?? []),
    ]),
  ];
}

function validateBrowserTransportProviders(providers: readonly NnrpBrowserTransportProvider[]): void {
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
  endpoint: NnrpEndpoint,
  providerRoutes: NnrpClientProviderRoutes | undefined,
  providers: readonly NnrpBrowserTransportProvider[],
  policy: NnrpTransportPolicy,
  manifest: NnrpCapabilityManifest,
): { readonly provider: NnrpBrowserTransportProvider; readonly endpoint: string } {
  validateBrowserProviderRoutes(providerRoutes);
  const route = providerRoutes?.websocket;
  let providerEndpoint: string | undefined;
  let routeResolved = true;
  try {
    providerEndpoint = resolveBrowserWebSocketEndpoint(route?.endpoint);
  } catch {
    routeResolved = false;
  }
  const securitySatisfied = routeResolved && providerEndpoint !== undefined &&
    !(route !== undefined && "security" in route) && browserRouteSecuritySatisfied(endpoint, providerEndpoint);
  const descriptors = providers.length === 0
    ? [uninstalledBrowserProviderDescriptor()]
    : providers.map((provider) => provider.descriptor);
  const selection = selectTransport(descriptors, {
    peerSupportedTransports: manifest.transports,
    policy,
    candidateReadiness: descriptors.map((provider) => ({
      transportId: provider.transportId,
      providerId: provider.metadata.id,
      routeResolved,
      securitySatisfied,
      ...(!routeResolved || !securitySatisfied
        ? {
          diagnostic: !routeResolved
            ? "Browser WebSocket provider route is unresolved."
            : "Browser WebSocket provider route cannot satisfy the application endpoint security intent.",
        }
        : {}),
    })),
    probeObservations: [],
  });
  const selected = providers.find((provider) => provider.metadata.id === selection.selectedProvider.metadata.id);
  if (selected === undefined || providerEndpoint === undefined) {
    throw new NnrpTransportError({
      code: "NNRP_BROWSER_TRANSPORT_SELECTION_INCONSISTENT",
      message: "Selected browser transport does not have an installed provider and resolved route.",
      source: "transport",
      retryable: false,
      transport: "websocket",
      cause: createTransportSelectionSummary(selection),
    });
  }
  return { provider: selected, endpoint: providerEndpoint };
}

function validateBrowserProviderRoutes(providerRoutes: NnrpClientProviderRoutes | undefined): void {
  const invalidKey = Object.keys(providerRoutes ?? {}).find((key) => key !== "websocket");
  if (invalidKey !== undefined) {
    throw new NnrpTransportError({
      code: "NNRP_BROWSER_PROVIDER_ROUTE_KEY_INVALID",
      message: `Browser client provider routes accept only websocket; received ${invalidKey}.`,
      source: "transport",
      retryable: false,
      transport: "websocket",
    });
  }
}

function browserRouteSecuritySatisfied(applicationEndpoint: NnrpEndpoint, providerEndpoint: string): boolean {
  return !applicationEndpoint.secure ||
    new URL(providerEndpoint).protocol === "wss:";
}

function resolveBrowserWebSocketEndpoint(endpoint: import("@nnrp/core").NnrpProviderEndpoint | undefined): string {
  if (endpoint === undefined) throw new TypeError("Browser WebSocket routes require an explicit endpoint.");
  const parsed = new URL(endpoint.uri);
  if ((parsed.protocol !== "ws:" && parsed.protocol !== "wss:") || parsed.hostname.length === 0) {
    throw new TypeError("Browser WebSocket routes require a ws:// or wss:// endpoint.");
  }
  return parsed.toString();
}

function uninstalledBrowserProviderDescriptor(): import("@nnrp/core").NnrpTransportProviderDescriptor {
  const metadata = {
    id: "nnrp.transport.websocket.uninstalled",
    cost: { modelId: 0, units: 0n },
    preferenceRank: 0xffff,
    limits: { maxFrameBytes: 67_108_864n },
    limitations: ["browser-host-only"] as const,
  };
  return {
    name: "@nnrp/transport-websocket",
    version: "uninstalled",
    transportId: "websocket",
    kind: "wasm",
    available: false,
    metadata,
    diagnostic: "Browser WebSocket provider is not installed.",
  };
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

function normalizeEndpoint(endpoint: NnrpEndpoint): string {
  return endpoint.uri;
}

function validateEndpoint(endpoint: NnrpEndpoint): void {
  if (!(endpoint instanceof NnrpEndpoint)) {
    throw new NnrpCapabilityError({
      code: "NNRP_WASM_ENDPOINT_INVALID",
      message: "NNRP browser endpoint must be an NnrpEndpoint value.",
      source: "wasm",
      retryable: false,
    });
  }
}

function normalizeBrowserSessionOptions(
  defaults: NnrpBrowserSessionOptions | undefined,
  options: NnrpBrowserSessionOptions,
): NormalizedBrowserSessionOptions {
  const merged = {
    ...BROWSER_SESSION_DEFAULTS,
    ...defaults,
    ...options,
  };
  const cacheHints = Object.freeze([
    ...(options.cacheHints ?? defaults?.cacheHints ?? BROWSER_SESSION_DEFAULTS.cacheHints),
  ]);
  for (const cacheHint of cacheHints) {
    if (!CACHE_OBJECT_KINDS.has(cacheHint)) {
      throw new RangeError(`cacheHints contains unknown cache object kind ${cacheHint}`);
    }
  }
  if (new Set(cacheHints).size !== cacheHints.length) {
    throw new RangeError("cacheHints must not contain duplicate cache object kinds");
  }
  assertBrowserUnsigned("resumeTokenBytes", merged.resumeTokenBytes, 0xffff_ffff);
  encodeSessionOpenMetadata({
    requestedSessionId: merged.requestedSessionId,
    profileId: merged.profileId,
    priorityClass: merged.priorityClass,
    sessionFlags: merged.allowResume ? 1 : 0,
    schemaId: merged.schemaId,
    schemaVersion: merged.schemaVersion,
    defaultDeadlineMillis: merged.defaultDeadlineMillis,
    maxInFlightOperations: merged.maxInFlightOperations,
    leaseTtlHintMillis: merged.leaseTtlHintMillis,
    resumeTokenBytes: merged.resumeTokenBytes,
    authBytes: 0,
    sessionExtensionBytes: 0,
    clientSessionTag: 0n,
  });
  return Object.freeze({ ...merged, cacheHints });
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

function browserRoleConfig(options: NormalizedBrowserSessionOptions) {
  return {
    requestedSessionId: options.requestedSessionId,
    profileId: options.profileId,
    schemaId: options.schemaId,
    schemaVersion: options.schemaVersion,
    priorityClass: options.priorityClass,
    defaultDeadlineMs: options.defaultDeadlineMillis,
    maxInFlightOperations: options.maxInFlightOperations,
    leaseTtlHintMs: options.leaseTtlHintMillis,
    allowResume: options.allowResume,
    resumeTokenBytes: options.resumeTokenBytes,
    cacheHints: options.cacheHints,
  } as const;
}

function releaseBrowserSession(client: NnrpBrowserClient, session: NnrpBrowserClientSession): void {
  browserClientSessionReleasers.get(client)?.(session);
}

function standardInputProfile(profileId: number): NnrpInputProfile | undefined {
  if (profileId === 1) return "tensor";
  if (profileId === NNRP_STANDARD_PROFILE_TOKEN) return "token";
  return undefined;
}

function assertBrowserUnsigned(name: string, value: number, maximum: number): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} is outside its unsigned wire range`);
  }
}

function normalizeCreditWindow(creditWindow: bigint): number {
  return creditWindow > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(creditWindow);
}

function isRuntimeTerminalEvent(event: NnrpRuntimeEvent): boolean {
  return event.header.messageType === NnrpMessageType.ResultPush ||
    event.header.messageType === NnrpMessageType.ResultDrop ||
    event.header.messageType === NnrpMessageType.ResultDropReason;
}

function isTerminalOperationState(state: NnrpOperationState): boolean {
  return state === "superseded" || state === "cancelled" || state === "failed" || state === "completed";
}

function terminalOperationId(event: NnrpRuntimeEvent, frameOperationId?: bigint): bigint | undefined {
  if (event.metadata.type === "result_drop_reason") return event.metadata.value.operationId;
  return browserRuntimeEventOperationIds.get(event) ?? frameOperationId;
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

function duplicateBrowserSessionError(sessionId: number): NnrpProtocolError {
  return new NnrpProtocolError({
    code: "NNRP_SESSION_ID_DUPLICATE",
    message: `Browser client session id '${sessionId}' is already open.`,
    source: "runtime",
    retryable: false,
  });
}

function sessionNotOpenError(sessionId: number): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code: "NNRP_BROWSER_SESSION_NOT_OPEN",
    message: `Browser session '${sessionId}' is not open on this client.`,
    source: "runtime",
    retryable: false,
  });
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
