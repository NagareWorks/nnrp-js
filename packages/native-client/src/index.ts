import {
  type BudgetMetadata,
  type CacheInvalidateMetadata,
  type CacheMissMetadata,
  type CacheReferenceMetadata,
  type CapabilityMetadata,
  type ControlRequestMetadata,
  createBackendNativeManifest,
  createCapabilityManifest,
  createTransportCandidates,
  createTransportSelectionSummary,
  decodeCacheInvalidateMetadata,
  decodeRuntimeControlMetadata,
  decodeRuntimeObjectMetadata,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  type NnrpAbortSignalLike,
  type NnrpCapability,
  NnrpCapabilityError,
  type NnrpCapabilityManifest,
  type NnrpDiagnostic,
  type NnrpEventPollOptions,
  type NnrpInputProfile,
  NnrpMessageType,
  type NnrpNormalizedSubmitRequest,
  NnrpProtocolError,
  NnrpRecoveryError,
  type NnrpResult,
  type NnrpRuntimeEvent,
  type NnrpRuntimeFrameEvent,
  type NnrpSessionFlowControlOptions,
  type NnrpSessionMigrationRequest,
  type NnrpSessionPatchRequest,
  type NnrpSessionPatchResult,
  type NnrpSubmitOptions,
  type NnrpSubmitRequest,
  NnrpTimeoutError,
  type NnrpTransportCandidate,
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
  type PressureMetadata,
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
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const EXPECTED_PROTOCOL_MAJOR = 1;
const EXPECTED_PROTOCOL_WIRE_FORMAT = 0;
const EXPECTED_ABI_MAJOR = 1;
const MINIMUM_ABI_MINOR = 12;
const TRANSPORT_SLOT_QUIC = 0x00000001;
const TRANSPORT_SLOT_TCP = 0x00000002;
const REQUIRED_TRANSPORT_SLOTS = TRANSPORT_SLOT_TCP;
const NATIVE_RUNTIME_CAPABILITIES = ["cache", "schema", "recovery", "flow.update", "result.hint"] as const;
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
const RUNTIME_FEATURE_CLIENT_COMPLETION_HELPERS = 0x0000000000004000n;
const RUNTIME_FEATURE_CLIENT_COARSE_RESULT_HELPERS = 0x0000000000008000n;
const RUNTIME_FEATURE_CLIENT_COMPACT_RESULT_HELPERS = 0x0000000000010000n;
const RUNTIME_FEATURE_PREVIEW4_RUNTIME_FRAME_SEND = 0x0000000000080000n;
const REQUIRED_NATIVE_SYMBOLS = [
  "nnrp_runtime_capabilities",
  "nnrp_client_submit_result_compact",
  "nnrp_client_submit_result_compact_batch",
  "nnrp_client_await_events",
  "nnrp_runtime_frame_send",
] as const;
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
  RUNTIME_FEATURE_CLIENT_COMPLETION_HELPERS |
  RUNTIME_FEATURE_CLIENT_COARSE_RESULT_HELPERS |
  RUNTIME_FEATURE_CLIENT_COMPACT_RESULT_HELPERS |
  RUNTIME_FEATURE_PREVIEW4_RUNTIME_FRAME_SEND;

export interface NnrpNativeLibraryOptions {
  readonly path?: string;
  readonly artifactDir?: string;
  readonly manifestPath?: string;
  readonly packageName?: string;
  readonly requiredSymbols?: readonly string[];
  readonly systemPolicy?: boolean;
  readonly systemLibraryDir?: string;
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
  ): readonly NnrpRuntimeEvent[] | Promise<readonly NnrpRuntimeEvent[]>;
  close?(): void | Promise<void>;
}

export interface NnrpNativeArtifactManifest {
  readonly package: "nnrp-ffi";
  readonly profile: "debug" | "release";
  readonly os: string;
  readonly arch: string;
  readonly target?: string | null;
  readonly library_kind: "dynamic" | "static";
  readonly library: string;
  readonly libraries: readonly string[];
  readonly header: string;
  readonly headers: readonly string[];
  readonly legacy_header?: string;
  readonly exports: readonly string[];
}

export interface NnrpResolvedNativeArtifact {
  readonly packageName: string;
  readonly packageDir: string;
  readonly manifestPath: string;
  readonly libraryPath: string;
  readonly manifest: NnrpNativeArtifactManifest;
}

export interface NnrpSessionOptions extends NnrpSessionFlowControlOptions {
  readonly sessionId?: string;
  readonly inputProfile?: NnrpInputProfile;
  readonly targetCadence?: number;
  readonly qualityTier?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpNativeClientOptions {
  readonly endpoint: string | URL;
  readonly nativeLibrary?: NnrpNativeLibraryOptions;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
  readonly env?: Record<string, string | undefined>;
  readonly platform?: NodePlatform;
  readonly arch?: NodeArchitecture;
  readonly ffi?: NnrpNativeFfiBinding;
}

interface NnrpBackendRuntimeOptions {
  readonly nativeLibrary?: NnrpNativeLibraryOptions;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly env?: Record<string, string | undefined>;
  readonly platform?: NodePlatform;
  readonly arch?: NodeArchitecture;
  readonly ffi?: NnrpNativeFfiBinding;
}

export interface NnrpConnectOptions {
  readonly endpoint: string | URL;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
}

export interface NnrpNativeTransportProvider extends NnrpTransportProvider {
  readonly kind: NnrpTransportKind;
}

export interface NnrpTransportSelectionOptions {
  readonly peerManifest: NnrpCapabilityManifest;
  readonly providers?: readonly NnrpNativeTransportProvider[];
  readonly policy?: NnrpTransportPolicy;
  readonly requestedMaxFrameBytes?: bigint;
  readonly probeMetricsByProviderId?: Readonly<Record<string, NnrpTransportProbeMetrics>>;
}

export interface NnrpNativeBindingOptions {
  readonly libraryPath?: string;
  readonly nativeLibrary?: NnrpNativeLibraryOptions;
  readonly env?: Record<string, string | undefined>;
  readonly platform?: NodePlatform;
  readonly arch?: NodeArchitecture;
  readonly ffi?: NnrpNativeFfiBinding;
}

export interface NnrpDenoNativeFfiBindingOptions {
  readonly libraryPath?: string;
  readonly nativeLibrary?: NnrpNativeLibraryOptions;
  readonly env?: Record<string, string | undefined>;
  readonly platform?: NodePlatform;
  readonly arch?: NodeArchitecture;
}

export interface NnrpDenoNativeCompactSubmitterOptions extends NnrpDenoNativeFfiBindingOptions {
  readonly sessionId?: number;
}

export interface NnrpDenoNativeCompactSubmitter {
  readonly mode: "deno-ffi";
  runtimeCapabilities(): NnrpNativeRuntimeCapabilities;
  submit(frameId: number, payload: Uint8Array, resultPayload?: Uint8Array): void;
  submitBatch(frameIdStart: number, iterations: number, payload: Uint8Array, resultPayload?: Uint8Array): number;
  close(): void;
}

interface DenoNativeSymbols {
  readonly nnrp_runtime_capabilities: () => Uint8Array;
  readonly nnrp_client_connect: (request: Uint8Array, outConnection: Uint8Array) => Uint8Array;
  readonly nnrp_client_open_session: (request: Uint8Array, outSession: Uint8Array) => Uint8Array;
  readonly nnrp_client_submit_result_compact: (request: Uint8Array, outResult: Uint8Array) => Uint8Array;
  readonly nnrp_client_submit_result_compact_batch: (
    request: Uint8Array,
    outLastResult: Uint8Array,
    outCompleted: Uint8Array,
  ) => Uint8Array;
  readonly nnrp_runtime_frame_send: (request: Uint8Array) => Uint8Array;
  readonly nnrp_client_await_event: (connection: Uint8Array, outResult: Uint8Array) => Uint8Array;
  readonly nnrp_buffer_release: (buffer: Uint8Array) => Uint8Array;
}

interface DenoNativeLibrary {
  readonly symbols: DenoNativeSymbols;
  close(): void;
}

interface DenoRuntime {
  readonly UnsafePointer: {
    of(payload: Uint8Array<ArrayBuffer>): unknown;
    create(address: bigint): unknown;
    value(pointer: unknown): bigint;
  };
  readonly UnsafePointerView: new (pointer: unknown) => {
    getArrayBuffer(byteLength: number, offset?: number): ArrayBuffer;
  };
  dlopen(path: string, symbols: typeof DENO_NATIVE_SYMBOLS): DenoNativeLibrary;
}

export interface NnrpNativeRuntimeBinding {
  readonly manifest: NnrpCapabilityManifest;
  readonly libraryPath: string;
  readonly requiredSymbols: readonly string[];
  readonly artifact?: NnrpResolvedNativeArtifact;
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
    return runtime.connect({
      endpoint: options.endpoint,
      ...(options.transportPolicy === undefined ? {} : { transportPolicy: options.transportPolicy }),
      ...(options.sessionDefaults === undefined ? {} : { sessionDefaults: options.sessionDefaults }),
    });
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

async function openBackendRuntime(options: NnrpBackendRuntimeOptions = {}): Promise<NnrpBackendRuntime> {
  const binding = createNativeRuntimeBinding(options);
  const runtimeCapabilities = await resolveRuntimeCapabilities(binding);
  const transportProviders = options.transports ?? await discoverNativeTransportProviders();
  return new NnrpBackendRuntime(
    {
      ...binding,
      ...(runtimeCapabilities === undefined ? {} : {
        manifest: createNativeRuntimeManifest(runtimeCapabilities),
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

  public constructor(
    binding: NnrpNativeRuntimeBinding,
    transportPolicy: NnrpTransportPolicy = "auto",
    transportProviders: readonly NnrpNativeTransportProvider[] = [],
  ) {
    this.#binding = binding;
    this.#transportPolicy = transportPolicy;
    this.#transportProviders = [...transportProviders];
  }

  public get manifest(): NnrpCapabilityManifest {
    return this.#binding.manifest;
  }

  public get libraryPath(): string {
    return this.#binding.libraryPath;
  }

  public get runtimeCapabilities(): NnrpNativeRuntimeCapabilities | undefined {
    return this.#binding.runtimeCapabilities;
  }

  public get artifact(): NnrpResolvedNativeArtifact | undefined {
    return this.#binding.artifact;
  }

  public get bindingMode(): string {
    return this.#binding.ffi?.mode ?? "unbound";
  }

  public async submitResultCompact(request: NnrpNativeSubmitResultCompactRequest): Promise<NnrpResult> {
    this.#ensureOpen();
    const submitResultCompact = this.#binding.ffi?.submitResultCompact;
    if (submitResultCompact === undefined) {
      throw bindingNotConnectedError("submitResultCompact");
    }

    return await submitResultCompact(await this.#validateSubmit(request));
  }

  public async submitNoWait(request: NnrpNativeSubmitNoWaitRequest): Promise<bigint> {
    this.#ensureOpen();
    const submitNoWait = this.#binding.ffi?.submitNoWait;
    if (submitNoWait === undefined) {
      throw bindingNotConnectedError("submitNoWait");
    }

    return await submitNoWait(await this.#validateSubmit(request));
  }

  public sendRuntimeFrame(request: NnrpNativeRuntimeFrameSendRequest): Promise<void> {
    this.#ensureOpen();
    const sendRuntimeFrame = this.#binding.ffi?.sendRuntimeFrame;
    if (sendRuntimeFrame === undefined) {
      return Promise.reject(bindingNotConnectedError("sendRuntimeFrame"));
    }

    return Promise.resolve(sendRuntimeFrame(request));
  }

  public async patchSession(request: NnrpNativeSessionPatchRequest): Promise<NnrpSessionPatchResult> {
    this.#ensureOpen();
    const patchSession = this.#binding.ffi?.patchSession;
    if (patchSession === undefined) {
      throw bindingNotConnectedError("patchSession");
    }

    return await patchSession(request) ?? {
      accepted: true,
      ...(request.sessionOptions.sessionId === undefined ? {} : { sessionId: request.sessionOptions.sessionId }),
    };
  }

  public async awaitEvents(request: NnrpNativeEventBatchRequest): Promise<readonly NnrpRuntimeEvent[]> {
    this.#ensureOpen();
    const awaitEvents = this.#binding.ffi?.awaitEvents;
    if (awaitEvents === undefined) {
      throw bindingNotConnectedError("awaitEvents");
    }

    return await awaitEvents(request);
  }

  public connect(options: NnrpConnectOptions): NnrpClient {
    this.#ensureOpen();
    this.#ensureConnectReady("connect");
    validateEndpoint(options.endpoint);
    validateTransportProvidersForPolicy(
      options.transports ?? this.#transportProviders,
      options.transportPolicy ?? this.#transportPolicy,
    );

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
      selectTransport(
        this.#createTransportCandidates(options),
        options.policy ?? this.#transportPolicy,
      ),
    );
  }

  public async close(): Promise<void> {
    this.#closed = true;
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

    const missing = REQUIRED_NATIVE_SYMBOLS.filter((symbol) => !this.#binding.requiredSymbols.includes(symbol));
    if (missing.length > 0) {
      throw nativeRuntimeReadinessError(
        "NNRP_NATIVE_RUNTIME_SYMBOLS_UNVALIDATED",
        `Native runtime ${operation} requires validated symbols: ${missing.join(", ")}.`,
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

  #createTransportCandidates(options: NnrpTransportSelectionOptions): readonly NnrpTransportCandidate[] {
    const providers = options.providers ?? this.#transportProviders;
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

async function discoverNativeTransportProviders(): Promise<readonly NnrpNativeTransportProvider[]> {
  const providers: NnrpNativeTransportProvider[] = [];
  const tcp = await importOptionalTransportModule("@nnrp/transport-tcp");
  const quic = await importOptionalTransportModule("@nnrp/transport-quic");

  if (isTransportFactory(tcp?.createTcpTransportProvider)) {
    providers.push(tcp.createTcpTransportProvider());
  }
  if (isTransportFactory(quic?.createQuicTransportProvider)) {
    providers.push(quic.createQuicTransportProvider());
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

export interface NnrpClientState {
  readonly endpoint: string;
  readonly runtime: NnrpBackendRuntime;
  readonly transports: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
}

export class NnrpClient {
  readonly #state: NnrpClientState;
  readonly #eventQueues = new Map<string, NnrpRuntimeEvent[]>();
  #nextSessionId = 1;
  #closed = false;

  public constructor(state: NnrpClientState) {
    this.#state = state;
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

  public openSession(options: NnrpSessionOptions = {}): NnrpClientSession {
    this.#ensureOpen();
    validateSessionMetadata(options);

    return new NnrpClientSession({
      client: this,
      options: this.#createSessionOptions(options),
    });
  }

  public async nextSessionEvent(sessionId: string, options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    this.#ensureOpen();
    validateEventPollOptions(options);

    while (true) {
      const queued = this.#eventQueues.get(sessionId);
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
        const candidateSessionId = eventSessionId(candidate) ?? sessionId;
        const queue = this.#eventQueues.get(candidateSessionId) ?? [];
        queue.push(candidate);
        this.#eventQueues.set(candidateSessionId, queue);
      }
    }
  }

  public close(): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }

  public get closed(): boolean {
    return this.#closed || this.#state.runtime.closed;
  }

  #ensureOpen(): void {
    if (this.closed) {
      throw closedError("client");
    }
  }

  #createSessionOptions(options: NnrpSessionOptions): NnrpSessionOptions {
    const merged = mergeSessionOptions(this.#state.sessionDefaults, options);
    return {
      ...merged,
      sessionId: merged.sessionId ?? `native-session-${this.#nextSessionId++}`,
    };
  }
}

export interface NnrpClientSessionState {
  readonly client: NnrpClient;
  options: NnrpSessionOptions;
}

export class NnrpClientSession {
  readonly #state: NnrpClientSessionState;
  readonly #inFlightFrames = new Set<number>();
  readonly #terminalFrames = new Set<number>();
  readonly #cancelledOperations = new Set<bigint>();
  readonly #submitCancellationCleanups = new Map<number, () => void>();
  readonly #capacityWaiters: Array<() => void> = [];
  #availableCredits: number;
  #nextControlSequence = 1n;
  #nextRuntimeFrameId = 1;
  #closed = false;

  public constructor(state: NnrpClientSessionState) {
    this.#state = state;
    this.#availableCredits = state.options.initialCredits ?? Number.POSITIVE_INFINITY;
  }

  public get options(): NnrpSessionOptions {
    return this.#state.options;
  }

  public get sessionId(): string {
    return this.#state.options.sessionId ?? "";
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
      this.#beginFrame(normalized.frameId);
    } catch (error) {
      return Promise.reject(error);
    }

    try {
      const preparation = this.#prepareSubmitDispatch(normalized.frameId, options, deadlineMillis);
      if (preparation !== undefined) {
        await preparation;
      }
      const cancellation = this.#armSubmitCancellation(normalized.frameId, options, deadlineMillis);
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
      this.#beginFrame(normalized.frameId);
    } catch (error) {
      return Promise.reject(error);
    }

    try {
      const preparation = this.#prepareSubmitDispatch(normalized.frameId, options, deadlineMillis);
      if (preparation !== undefined) {
        await preparation;
      }
      this.#armDetachedSubmitCancellation(normalized.frameId, options, deadlineMillis);
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
    return this.sendControl(NnrpMessageType.Cancel, metadata, diagnostic).then(() => {
      this.#cancelledOperations.add(metadata.operationId);
    });
  }

  public abort(metadata: ControlRequestMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.Abort, metadata, diagnostic).then(() => {
      this.#cancelledOperations.add(metadata.operationId);
    });
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
      return this.#sendRuntimeFrame(messageType, payload);
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

  public patchObject(metadata: ObjectDeltaMetadata, delta: Uint8Array): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectPatch, metadata, delta);
  }

  public sendObjectDelta(metadata: ObjectDeltaMetadata, delta: Uint8Array): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectDelta, metadata, delta);
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
      return Promise.reject(error);
    }

    const deadlineMillis = options.timeoutMillis === undefined ? undefined : Date.now() + options.timeoutMillis;
    while (true) {
      const pollOptions = deadlineMillis === undefined
        ? options
        : { ...options, timeoutMillis: Math.max(0, deadlineMillis - Date.now()) };
      const event = await this.#state.client.nextSessionEvent(this.sessionId, pollOptions);
      if (this.#shouldSuppressCancelledPayload(event)) {
        continue;
      }
      this.completeEvent(event);
      return event;
    }
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

    this.#state.options = mergeSessionOptions(this.#state.options, patch);
    if (patch.initialCredits !== undefined) {
      this.#availableCredits = patch.initialCredits;
      this.#drainCapacityWaiters();
    }

    return result;
  }

  public async *events(options: NnrpEventPollOptions = {}): AsyncIterable<NnrpRuntimeEvent> {
    while (!this.closed) {
      yield await this.nextEvent(options);
    }
  }

  public close(): Promise<void> {
    this.#closed = true;
    this.#inFlightFrames.clear();
    this.#terminalFrames.clear();
    this.#cancelledOperations.clear();
    for (const cleanup of this.#submitCancellationCleanups.values()) {
      cleanup();
    }
    this.#submitCancellationCleanups.clear();
    this.#drainCapacityWaiters();
    return Promise.resolve();
  }

  public get closed(): boolean {
    return this.#closed || this.#state.client.closed;
  }

  #ensureOpen(): void {
    if (this.closed) {
      throw closedError("client session");
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

  #prepareSubmitDispatch(
    frameId: number,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): Promise<void> | undefined {
    throwIfSubmitCancelledBeforeDispatch(options, "native");
    if (deadlineMillis === undefined) {
      return undefined;
    }
    return this.updateDeadline({
      operationId: BigInt(frameId),
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
    frameId: number,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): { readonly promise: Promise<never>; readonly cleanup: () => void } {
    let rejectCancellation: (error: unknown) => void = () => {};
    const promise = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const cleanup = this.#installSubmitCancellation(
      frameId,
      options,
      deadlineMillis,
      rejectCancellation,
    );
    return { promise, cleanup };
  }

  #armDetachedSubmitCancellation(
    frameId: number,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): void {
    this.#installSubmitCancellation(frameId, options, deadlineMillis);
  }

  #installSubmitCancellation(
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
      this.#cancelledOperations.add(BigInt(frameId));
      onCancelled?.(error);
      cleanup();
      void this.cancel({
        operationId: BigInt(frameId),
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
    if (this.#state.options.submitCapacityPolicy !== "await-credit") {
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
    if (this.#state.options.submitCapacityPolicy !== "await-credit") {
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
    metadata:
      | ObjectDescriptorMetadata
      | ObjectReferenceMetadata
      | ObjectReleaseMetadata
      | ObjectDeltaMetadata
      | CacheReferenceMetadata
      | CacheMissMetadata,
    tail: Uint8Array,
  ): Promise<void> {
    try {
      return this.#sendRuntimeFrame(messageType, encodeRuntimeObjectMetadata(messageType, metadata, tail));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  #sendRuntimeFrame(messageType: NnrpMessageType, payload: Uint8Array): Promise<void> {
    try {
      this.#ensureOpen();
      const frameId = this.#nextRuntimeFrameId;
      this.#nextRuntimeFrameId = frameId === 0xffff_ffff ? 1 : frameId + 1;
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

export function resolveNativeLibraryPath(options: NnrpNativeBindingOptions = {}): string {
  const explicit = resolveExplicitNativeLibraryPath(options);
  if (explicit && explicit.length > 0) {
    return explicit;
  }

  const artifact = resolveNativeArtifact(options);
  if (artifact !== null) {
    return artifact.libraryPath;
  }

  const systemPolicy = resolveSystemPolicyNativeLibraryPath(options);
  if (systemPolicy !== undefined) {
    return systemPolicy;
  }

  return defaultNativeLibraryPath(options);
}

function defaultNativeLibraryPath(options: NnrpNativeBindingOptions): string {
  const platform = options.platform ?? process.platform;
  const suffix = nativeLibrarySuffix(platform);
  const artifactDir = options.nativeLibrary?.artifactDir ?? "native";
  const packageName = options.nativeLibrary?.packageName ?? nativePackageName(platform, options.arch ?? process.arch);

  return path.posix.join(toPosixPath(artifactDir), packageName, nativeLibraryFileName(platform, suffix));
}

export function createNativeRuntimeBinding(options: NnrpNativeBindingOptions = {}): NnrpNativeRuntimeBinding {
  const explicit = resolveExplicitNativeLibraryPath(options);
  const shouldResolveArtifact = explicit === undefined && options.nativeLibrary?.manifestPath !== undefined;
  const artifact = shouldResolveArtifact ? resolveNativeArtifact(options) : null;
  const requiredSymbols = requiredNativeSymbols(options.nativeLibrary);

  return {
    manifest: createNativeRuntimeManifest(),
    libraryPath: artifact?.libraryPath ?? explicit ?? defaultNativeLibraryPath(options),
    requiredSymbols,
    ...(artifact === null ? {} : { artifact }),
    ...(options.ffi === undefined ? {} : { ffi: options.ffi }),
  };
}

export function createDenoNativeFfiBinding(options: NnrpDenoNativeFfiBindingOptions = {}): NnrpNativeFfiBinding {
  const libraryPath = resolveNativeLibraryPath(options);
  const library = denoRuntime().dlopen(libraryPath, DENO_NATIVE_SYMBOLS);
  const sessions = new Map<string, DenoFfiSession>();
  let nextConnectionId = 1n;
  let nextSessionId = 1;

  const ffi: NnrpNativeFfiBinding = {
    mode: "deno-ffi",
    runtimeCapabilities: () => decodeRuntimeCapabilities(library.symbols.nnrp_runtime_capabilities()),
    submitResultCompact: (request) => {
      const session = ensureDenoFfiSession(library, sessions, request.sessionOptions);

      const submitPayload = request.submit.payload ?? EMPTY_PAYLOAD;
      const resultPayload = request.resultPayload ?? submitPayload;
      const outResult = new Uint8Array(NNRP_COMPACT_RESULT_SIZE);
      const submitRequest = packClientSubmitResultRequest({
        session: session.session,
        operationId: BigInt(request.submit.frameId),
        frameId: request.submit.frameId,
        submitPayload,
        resultPayload,
        maxEvents: Math.max(request.maxEvents ?? 16, 16),
      });
      assertFfiOk(library.symbols.nnrp_client_submit_result_compact(submitRequest, outResult), "submitResultCompact");

      return {
        frameId: request.submit.frameId,
        payload: resultPayload,
        ...(request.sessionOptions.sessionId === undefined ? {} : { sessionId: request.sessionOptions.sessionId }),
      };
    },
    sendRuntimeFrame: (request) => {
      const session = ensureDenoFfiSession(library, sessions, request.sessionOptions);
      assertFfiOk(
        library.symbols.nnrp_runtime_frame_send(packRuntimeFrameSendRequest({
          session: session.session,
          messageType: request.messageType,
          frameId: request.frameId,
          payload: request.payload,
        })),
        "sendRuntimeFrame",
      );
    },
    awaitEvents: ({ maxEvents }) => {
      const events: NnrpRuntimeEvent[] = [];
      const seenConnections = new Set<bigint>();
      for (const session of sessions.values()) {
        if (seenConnections.has(session.connection.id)) {
          continue;
        }
        seenConnections.add(session.connection.id);

        while (events.length < maxEvents) {
          const event = pollDenoRuntimeEvent(library, session.connection, sessions);
          if (event === undefined) {
            break;
          }
          events.push(event);
        }
      }
      return events;
    },
    close: () => library.close(),
  };

  function ensureDenoFfiSession(
    dylib: DenoNativeLibrary,
    cache: Map<string, DenoFfiSession>,
    options: NnrpSessionOptions,
  ): DenoFfiSession {
    const cacheKey = options.sessionId ?? `session-${nextSessionId}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const session = createDenoFfiSession(dylib, nextConnectionId, nextSessionId);
    nextConnectionId += 1n;
    nextSessionId += 1;
    const cachedSession = { cacheKey, ...session };
    cache.set(cacheKey, cachedSession);
    return cachedSession;
  }

  return ffi;
}

export function createDenoNativeCompactSubmitter(
  options: NnrpDenoNativeCompactSubmitterOptions = {},
): NnrpDenoNativeCompactSubmitter {
  const libraryPath = resolveNativeLibraryPath(options);
  const library = denoRuntime().dlopen(libraryPath, DENO_NATIVE_SYMBOLS);
  const session = createDenoFfiSession(library, 1n, options.sessionId ?? 1).session;
  const requestBuffer = bytes(NNRP_CLIENT_SUBMIT_RESULT_REQUEST_SIZE);
  const requestView = new DataView(requestBuffer.buffer);
  const batchRequestBuffer = bytes(NNRP_CLIENT_SUBMIT_RESULT_BATCH_REQUEST_SIZE);
  const batchRequestView = new DataView(batchRequestBuffer.buffer);
  const outResult = bytes(NNRP_COMPACT_RESULT_SIZE);
  const outCompleted = bytes(8);
  writeHandle(requestView, 0, session);
  requestView.setBigUint64(72, 16n, true);
  writeHandle(batchRequestView, 0, session);
  batchRequestView.setUint32(36, 1, true);
  batchRequestView.setBigUint64(72, 16n, true);

  return {
    mode: "deno-ffi",
    runtimeCapabilities: () => decodeRuntimeCapabilities(library.symbols.nnrp_runtime_capabilities()),
    submit: (frameId, payload, resultPayload = payload) => {
      requestView.setBigUint64(24, BigInt(frameId), true);
      requestView.setUint32(32, frameId, true);
      writeBufferView(requestView, 40, payload);
      writeBufferView(requestView, 56, resultPayload);
      assertFfiOk(
        library.symbols.nnrp_client_submit_result_compact(requestBuffer, outResult),
        "submitResultCompact",
      );
    },
    submitBatch: (frameIdStart, iterations, payload, resultPayload = payload) => {
      batchRequestView.setBigUint64(24, BigInt(frameIdStart), true);
      batchRequestView.setUint32(32, frameIdStart, true);
      writeBufferView(batchRequestView, 40, payload);
      writeBufferView(batchRequestView, 56, resultPayload);
      batchRequestView.setBigUint64(80, BigInt(iterations), true);
      assertFfiOk(
        library.symbols.nnrp_client_submit_result_compact_batch(batchRequestBuffer, outResult, outCompleted),
        "submitResultCompactBatch",
      );
      return Number(new DataView(outCompleted.buffer).getBigUint64(0, true));
    },
    close: () => library.close(),
  };
}

function createDenoFfiSession(
  dylib: DenoNativeLibrary,
  connectionId: bigint,
  sessionId: number,
): Omit<DenoFfiSession, "cacheKey"> {
  const connectionOut = bytes(NNRP_HANDLE_SIZE);
  assertFfiOk(
    dylib.symbols.nnrp_client_connect(packClientConnectRequest(connectionId), connectionOut),
    "clientConnect",
  );
  const sessionOut = bytes(NNRP_HANDLE_SIZE);
  assertFfiOk(
    dylib.symbols.nnrp_client_open_session(
      packSessionOpenRequest({
        connection: decodeHandle(connectionOut),
        requestedSessionId: sessionId,
      }),
      sessionOut,
    ),
    "clientOpenSession",
  );
  return {
    connection: decodeHandle(connectionOut),
    session: decodeHandle(sessionOut),
  };
}

const EMPTY_PAYLOAD = new Uint8Array();
const NNRP_HANDLE_SIZE = 24;
const NNRP_FFI_STATUS_SIZE = 16;
const NNRP_RUNTIME_CAPABILITIES_SIZE = 40;
const NNRP_CLIENT_CONNECT_REQUEST_SIZE = 16;
const NNRP_SESSION_OPEN_REQUEST_SIZE = 48;
const NNRP_CLIENT_SUBMIT_RESULT_REQUEST_SIZE = 80;
const NNRP_CLIENT_SUBMIT_RESULT_BATCH_REQUEST_SIZE = 88;
const NNRP_RUNTIME_FRAME_SEND_REQUEST_SIZE = 48;
const NNRP_POLL_RESULT_SIZE = 200;
const NNRP_COMPACT_RESULT_SIZE = 136;

const NNRP_PROTOCOL_VERSION_STRUCT = { struct: ["u8", "u8"] } as const;
const NNRP_FFI_STATUS_STRUCT = { struct: ["u32", "u32", "u32", "u32"] } as const;
const NNRP_HANDLE_STRUCT = { struct: ["u32", "u64", "u32", "u32"] } as const;
const NNRP_BUFFER_VIEW_STRUCT = { struct: ["pointer", "usize"] } as const;
const NNRP_RUNTIME_CAPABILITIES_STRUCT = {
  struct: [
    "u16",
    "u16",
    "u16",
    "u16",
    NNRP_PROTOCOL_VERSION_STRUCT,
    "u16",
    "u16",
    "u16",
    "u16",
    "u16",
    "u16",
    "u32",
    "u64",
  ],
} as const;
const NNRP_CLIENT_CONNECT_REQUEST_STRUCT = { struct: ["u64", "u32", "u32"] } as const;
const NNRP_SESSION_OPEN_REQUEST_STRUCT = {
  struct: [NNRP_HANDLE_STRUCT, "u32", "u32", "u16", "u32", "u32"],
} as const;
const NNRP_CLIENT_SUBMIT_RESULT_REQUEST_STRUCT = {
  struct: [NNRP_HANDLE_STRUCT, "u64", "u32", NNRP_BUFFER_VIEW_STRUCT, NNRP_BUFFER_VIEW_STRUCT, "usize"],
} as const;
const NNRP_CLIENT_SUBMIT_RESULT_BATCH_REQUEST_STRUCT = {
  struct: [NNRP_HANDLE_STRUCT, "u64", "u32", "u32", NNRP_BUFFER_VIEW_STRUCT, NNRP_BUFFER_VIEW_STRUCT, "usize", "usize"],
} as const;
const NNRP_RUNTIME_FRAME_SEND_REQUEST_STRUCT = {
  struct: [NNRP_HANDLE_STRUCT, "u32", "u32", NNRP_BUFFER_VIEW_STRUCT],
} as const;
const DENO_NATIVE_SYMBOLS = {
  nnrp_runtime_capabilities: { parameters: [], result: NNRP_RUNTIME_CAPABILITIES_STRUCT },
  nnrp_client_connect: { parameters: [NNRP_CLIENT_CONNECT_REQUEST_STRUCT, "buffer"], result: NNRP_FFI_STATUS_STRUCT },
  nnrp_client_open_session: {
    parameters: [NNRP_SESSION_OPEN_REQUEST_STRUCT, "buffer"],
    result: NNRP_FFI_STATUS_STRUCT,
  },
  nnrp_client_submit_result_compact: {
    parameters: [NNRP_CLIENT_SUBMIT_RESULT_REQUEST_STRUCT, "buffer"],
    result: NNRP_FFI_STATUS_STRUCT,
  },
  nnrp_client_submit_result_compact_batch: {
    parameters: [NNRP_CLIENT_SUBMIT_RESULT_BATCH_REQUEST_STRUCT, "buffer", "buffer"],
    result: NNRP_FFI_STATUS_STRUCT,
  },
  nnrp_runtime_frame_send: {
    parameters: [NNRP_RUNTIME_FRAME_SEND_REQUEST_STRUCT],
    result: NNRP_FFI_STATUS_STRUCT,
  },
  nnrp_client_await_event: {
    parameters: [NNRP_HANDLE_STRUCT, "buffer"],
    result: NNRP_FFI_STATUS_STRUCT,
  },
  nnrp_buffer_release: {
    parameters: [NNRP_HANDLE_STRUCT],
    result: NNRP_FFI_STATUS_STRUCT,
  },
} as const;

interface FfiHandle {
  readonly kind: number;
  readonly id: bigint;
  readonly generation: number;
  readonly flags: number;
}

interface DenoFfiSession {
  readonly cacheKey: string;
  readonly connection: FfiHandle;
  readonly session: FfiHandle;
}

function decodeRuntimeCapabilities(source: Uint8Array): NnrpNativeRuntimeCapabilities {
  if (source.byteLength < NNRP_RUNTIME_CAPABILITIES_SIZE) {
    throw new Error(`runtime capabilities result is too small: ${source.byteLength}`);
  }

  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  return {
    abiMajor: view.getUint16(0, true),
    abiMinor: view.getUint16(2, true),
    abiPatch: view.getUint16(4, true),
    protocolMajor: view.getUint8(8),
    protocolWireFormat: view.getUint8(9),
    sdkMajor: view.getUint16(10, true),
    sdkMinor: view.getUint16(12, true),
    sdkPatch: view.getUint16(14, true),
    sdkChannel: view.getUint16(16, true),
    sdkRevision: view.getUint16(18, true),
    transportSlots: view.getUint32(24, true),
    featureFlags: view.getBigUint64(32, true),
  };
}

function packClientConnectRequest(connectionId: bigint): Uint8Array<ArrayBuffer> {
  const output = bytes(NNRP_CLIENT_CONNECT_REQUEST_SIZE);
  const view = new DataView(output.buffer);
  view.setBigUint64(0, connectionId, true);
  view.setUint32(8, 1, true);
  view.setUint32(12, 2, true);
  return output;
}

function packSessionOpenRequest(
  request: { readonly connection: FfiHandle; readonly requestedSessionId: number },
): Uint8Array<ArrayBuffer> {
  const output = bytes(NNRP_SESSION_OPEN_REQUEST_SIZE);
  const view = new DataView(output.buffer);
  writeHandle(view, 0, request.connection);
  view.setUint32(24, request.requestedSessionId, true);
  view.setUint32(28, 1, true);
  view.setUint16(32, 0, true);
  view.setUint32(36, 0, true);
  view.setUint32(40, 0, true);
  return output;
}

function packClientSubmitResultRequest(
  request: {
    readonly session: FfiHandle;
    readonly operationId: bigint;
    readonly frameId: number;
    readonly submitPayload: Uint8Array;
    readonly resultPayload: Uint8Array;
    readonly maxEvents: number;
  },
): Uint8Array<ArrayBuffer> {
  const output = bytes(NNRP_CLIENT_SUBMIT_RESULT_REQUEST_SIZE);
  const view = new DataView(output.buffer);
  writeHandle(view, 0, request.session);
  view.setBigUint64(24, request.operationId, true);
  view.setUint32(32, request.frameId, true);
  writeBufferView(view, 40, request.submitPayload);
  writeBufferView(view, 56, request.resultPayload);
  view.setBigUint64(72, BigInt(request.maxEvents), true);
  return output;
}

function packRuntimeFrameSendRequest(
  request: {
    readonly session: FfiHandle;
    readonly messageType: NnrpMessageType;
    readonly frameId: number;
    readonly payload: Uint8Array;
  },
): Uint8Array<ArrayBuffer> {
  const output = bytes(NNRP_RUNTIME_FRAME_SEND_REQUEST_SIZE);
  const view = new DataView(output.buffer);
  writeHandle(view, 0, request.session);
  view.setUint32(24, request.messageType, true);
  view.setUint32(28, request.frameId, true);
  writeBufferView(view, 32, request.payload);
  return output;
}

function packHandle(handle: FfiHandle): Uint8Array<ArrayBuffer> {
  const output = bytes(NNRP_HANDLE_SIZE);
  writeHandle(new DataView(output.buffer), 0, handle);
  return output;
}

function pollDenoRuntimeEvent(
  library: DenoNativeLibrary,
  connection: FfiHandle,
  sessions: ReadonlyMap<string, DenoFfiSession>,
): NnrpRuntimeEvent | undefined {
  while (true) {
    const output = bytes(NNRP_POLL_RESULT_SIZE);
    const status = library.symbols.nnrp_client_await_event(packHandle(connection), output);
    const statusCode = ffiStatusCode(status, "awaitEvent");
    if (statusCode === 5) {
      return undefined;
    }
    assertFfiOk(status, "awaitEvent");

    const view = new DataView(output.buffer);
    if (view.getUint8(16) === 0) {
      return undefined;
    }

    const kind = view.getUint32(24, true);
    const owner = decodeHandle(output.subarray(112, 136));
    try {
      if (kind !== 13) {
        continue;
      }

      const messageType = view.getUint32(28, true) as NnrpMessageType;
      const nativeSession = decodeHandle(output.subarray(56, 80));
      const payloadAddress = view.getBigUint64(136, true);
      const payloadLength = Number(view.getBigUint64(144, true));
      const payload = copyDenoPayload(payloadAddress, payloadLength);
      const sessionId = [...sessions.values()].find((session) => session.session.id === nativeSession.id)?.cacheKey;
      return decodeRuntimeFrameEvent(messageType, payload, sessionId);
    } finally {
      if (owner.kind === 5) {
        assertFfiOk(library.symbols.nnrp_buffer_release(packHandle(owner)), "bufferRelease");
      }
    }
  }
}

function copyDenoPayload(address: bigint, length: number): Uint8Array {
  if (length === 0) {
    return EMPTY_PAYLOAD;
  }
  if (address === 0n || !Number.isSafeInteger(length) || length < 0) {
    throw nativeArtifactError("NNRP_DENO_FFI_EVENT_PAYLOAD_INVALID", "Native event returned an invalid payload view.");
  }

  const runtime = denoRuntime();
  const pointer = runtime.UnsafePointer.create(address);
  return new Uint8Array(new runtime.UnsafePointerView(pointer).getArrayBuffer(length)).slice();
}

function decodeRuntimeFrameEvent(
  messageType: NnrpMessageType,
  payload: Uint8Array,
  sessionId: string | undefined,
): NnrpRuntimeFrameEvent {
  const scope = sessionId === undefined ? {} : { sessionId };
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
        "NNRP_DENO_FFI_RUNTIME_MESSAGE_UNSUPPORTED",
        `Native event returned unsupported runtime message type 0x${Number(messageType).toString(16)}.`,
      );
  }
}

function runtimeControlEventWithTail(
  messageType: NnrpMessageType,
  metadata: RuntimeControlMetadata,
  tail: Uint8Array,
  scope: { readonly sessionId?: string },
): NnrpRuntimeFrameEvent {
  const mapping = RUNTIME_CONTROL_EVENT_MAPPINGS[messageType];
  if (mapping === undefined) {
    throw new Error(`runtime control message ${messageType} has no event mapping`);
  }
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
  scope: { readonly sessionId?: string },
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
  if (mapping === undefined) {
    throw new Error(`runtime object message ${messageType} has no event mapping`);
  }
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

function decodeHandle(source: Uint8Array): FfiHandle {
  if (source.byteLength < NNRP_HANDLE_SIZE) {
    throw new Error(`handle result is too small: ${source.byteLength}`);
  }

  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  return {
    kind: view.getUint32(0, true),
    id: view.getBigUint64(8, true),
    generation: view.getUint32(16, true),
    flags: view.getUint32(20, true),
  };
}

function writeHandle(view: DataView, offset: number, handle: FfiHandle): void {
  view.setUint32(offset, handle.kind, true);
  view.setBigUint64(offset + 8, handle.id, true);
  view.setUint32(offset + 16, handle.generation, true);
  view.setUint32(offset + 20, handle.flags, true);
}

function writeBufferView(view: DataView, offset: number, payload: Uint8Array): void {
  const pointer = payload.byteLength === 0
    ? 0n
    : denoRuntime().UnsafePointer.value(denoRuntime().UnsafePointer.of(payload as Uint8Array<ArrayBuffer>));
  view.setBigUint64(offset, pointer, true);
  view.setBigUint64(offset + 8, BigInt(payload.byteLength), true);
}

function denoRuntime(): DenoRuntime {
  const runtime = (globalThis as typeof globalThis & { readonly Deno?: DenoRuntime }).Deno;
  if (runtime === undefined) {
    throw nativeArtifactError(
      "NNRP_DENO_FFI_UNAVAILABLE",
      "Deno native FFI helpers require a Deno runtime with dlopen and UnsafePointer support.",
    );
  }
  return runtime;
}

function bytes(size: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(size);
}

function assertFfiOk(statusBytes: Uint8Array, operation: string): void {
  const statusCode = ffiStatusCode(statusBytes, operation);
  if (statusCode !== 0) {
    const view = new DataView(statusBytes.buffer, statusBytes.byteOffset, statusBytes.byteLength);
    const errorFamily = view.getUint32(4, true);
    const protocolErrorCode = view.getUint32(8, true);
    const detailCode = view.getUint32(12, true);
    throw nativeArtifactError(
      "NNRP_DENO_FFI_STATUS_ERROR",
      `${operation} failed with status=${statusCode}, family=${errorFamily}, protocol=${protocolErrorCode}, detail=${detailCode}.`,
    );
  }
}

function ffiStatusCode(statusBytes: Uint8Array, operation: string): number {
  if (statusBytes.byteLength < NNRP_FFI_STATUS_SIZE) {
    throw new Error(`${operation} returned a short FFI status: ${statusBytes.byteLength}`);
  }

  const view = new DataView(statusBytes.buffer, statusBytes.byteOffset, statusBytes.byteLength);
  return view.getUint32(0, true);
}

function createNativeRuntimeManifest(capabilities?: NnrpNativeRuntimeCapabilities): NnrpCapabilityManifest {
  if (capabilities === undefined) {
    return createBackendNativeManifest(NATIVE_RUNTIME_CAPABILITIES);
  }

  return createCapabilityManifest({
    buildMode: "backend-native",
    transports: nativeTransportsFromSlots(capabilities.transportSlots),
    capabilities: [
      "client.session",
      "server.session",
      "native.loader",
      ...NATIVE_RUNTIME_CAPABILITIES,
    ] satisfies readonly NnrpCapability[],
  });
}

function nativeTransportsFromSlots(slots: number): readonly NnrpTransportKind[] {
  const transports: NnrpTransportKind[] = [];
  if ((slots & TRANSPORT_SLOT_TCP) !== 0) {
    transports.push("tcp");
  }

  if ((slots & TRANSPORT_SLOT_QUIC) !== 0) {
    transports.push("quic");
  }

  return transports;
}

function resolveExplicitNativeLibraryPath(options: NnrpNativeBindingOptions): string | undefined {
  const env = options.env ?? process.env;
  const explicit = options.libraryPath ?? options.nativeLibrary?.path ?? env.NNRP_NATIVE_LIBRARY;
  return explicit && explicit.length > 0 ? explicit : undefined;
}

function resolveSystemPolicyNativeLibraryPath(options: NnrpNativeBindingOptions): string | undefined {
  if (options.nativeLibrary?.systemPolicy !== true) {
    return undefined;
  }

  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const root = options.nativeLibrary.systemLibraryDir ?? env.NNRP_NATIVE_SYSTEM_LIBRARY_DIR ??
    defaultSystemLibraryDir(platform);
  const packageName = options.nativeLibrary.packageName ?? nativePackageName(platform, arch);
  return joinNativeLibraryPath(
    root,
    packageName,
    nativeLibraryFileName(platform, nativeLibrarySuffix(platform)),
    platform,
  );
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
  if (capabilities.abiMajor !== EXPECTED_ABI_MAJOR || capabilities.abiMinor < MINIMUM_ABI_MINOR) {
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

  if ((capabilities.transportSlots & REQUIRED_TRANSPORT_SLOTS) !== REQUIRED_TRANSPORT_SLOTS) {
    throw nativeArtifactError("NNRP_NATIVE_TRANSPORT_MISSING", "Native artifact must expose TCP transport support.");
  }
}

function nativeLibrarySuffix(platform: NodePlatform): "dll" | "dylib" | "so" {
  if (platform === "win32") {
    return "dll";
  }

  if (platform === "darwin") {
    return "dylib";
  }

  return "so";
}

function nativeLibraryFileName(platform: NodePlatform, suffix: "dll" | "dylib" | "so"): string {
  if (platform === "win32") {
    return `nnrp_ffi.${suffix}`;
  }

  return `libnnrp_ffi.${suffix}`;
}

function defaultSystemLibraryDir(platform: NodePlatform): string {
  if (platform === "win32") {
    return "C:\\Program Files\\NNRP\\native";
  }

  if (platform === "darwin") {
    return "/usr/local/lib/nnrp";
  }

  return "/usr/lib/nnrp";
}

function joinNativeLibraryPath(root: string, packageName: string, libraryName: string, platform: NodePlatform): string {
  if (platform === "win32") {
    return path.win32.join(root, packageName, libraryName);
  }

  return path.posix.join(toPosixPath(root), packageName, libraryName);
}

export function resolveNativeArtifact(options: NnrpNativeBindingOptions): NnrpResolvedNativeArtifact | null {
  const nativeLibrary = options.nativeLibrary;
  const manifestPath = nativeLibrary?.manifestPath ?? defaultManifestPath(options);
  if (!existsSync(manifestPath)) {
    if (nativeLibrary?.manifestPath !== undefined) {
      throw nativeArtifactError(
        "NNRP_NATIVE_ARTIFACT_MANIFEST_MISSING",
        `Native artifact manifest not found: ${manifestPath}`,
      );
    }

    return null;
  }

  const manifest = readNativeArtifactManifest(manifestPath);
  validateNativeArtifactManifest(manifest, options);

  const packageDir = path.dirname(manifestPath);
  const libraryPath = path.join(packageDir, manifest.library);
  if (!existsSync(libraryPath)) {
    throw nativeArtifactError(
      "NNRP_NATIVE_ARTIFACT_LIBRARY_MISSING",
      `Native artifact library not found: ${libraryPath}`,
    );
  }

  return {
    packageName: path.basename(packageDir),
    packageDir,
    manifestPath,
    libraryPath,
    manifest,
  };
}

function defaultManifestPath(options: NnrpNativeBindingOptions): string {
  const artifactDir = options.nativeLibrary?.artifactDir ?? path.join(packageRootDir(), "native");
  const packageName = options.nativeLibrary?.packageName ?? nativePackageName(
    options.platform ?? process.platform,
    options.arch ?? process.arch,
  );
  return path.join(artifactDir, packageName, "manifest.json");
}

export function readNativeArtifactManifest(manifestPath: string): NnrpNativeArtifactManifest {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  if (!isNativeArtifactManifest(manifest)) {
    throw nativeArtifactError(
      "NNRP_NATIVE_ARTIFACT_MANIFEST_INVALID",
      `Invalid native artifact manifest: ${manifestPath}`,
    );
  }

  return manifest;
}

export function validateNativeArtifactManifest(
  manifest: NnrpNativeArtifactManifest,
  options: Pick<NnrpNativeBindingOptions, "platform" | "arch" | "nativeLibrary"> = {},
): void {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const expectedOs = nativeArtifactOs(platform);
  const expectedArch = nativeArtifactArch(arch);

  if (manifest.os !== expectedOs) {
    throw nativeArtifactError(
      "NNRP_NATIVE_ARTIFACT_OS_MISMATCH",
      `Native artifact OS ${manifest.os} does not match ${expectedOs}.`,
    );
  }

  if (manifest.arch !== expectedArch) {
    throw nativeArtifactError(
      "NNRP_NATIVE_ARTIFACT_ARCH_MISMATCH",
      `Native artifact architecture ${manifest.arch} does not match ${expectedArch}.`,
    );
  }

  if (manifest.library_kind !== "dynamic") {
    throw nativeArtifactError(
      "NNRP_NATIVE_ARTIFACT_KIND_UNSUPPORTED",
      "JavaScript native loading requires dynamic artifacts.",
    );
  }

  const missing = requiredNativeSymbols(options.nativeLibrary).filter((symbol) => !manifest.exports.includes(symbol));
  if (missing.length > 0) {
    throw nativeArtifactError(
      "NNRP_NATIVE_ARTIFACT_EXPORT_MISSING",
      `Native artifact manifest is missing exports: ${missing.join(", ")}.`,
    );
  }
}

function requiredNativeSymbols(nativeLibrary: NnrpNativeLibraryOptions | undefined): readonly string[] {
  return [...new Set([...REQUIRED_NATIVE_SYMBOLS, ...(nativeLibrary?.requiredSymbols ?? [])])];
}

function isNativeArtifactManifest(value: unknown): value is NnrpNativeArtifactManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const manifest = value as Record<string, unknown>;
  return manifest.package === "nnrp-ffi" &&
    (manifest.profile === "debug" || manifest.profile === "release") &&
    typeof manifest.os === "string" &&
    typeof manifest.arch === "string" &&
    (manifest.target === undefined || manifest.target === null || typeof manifest.target === "string") &&
    (manifest.library_kind === "dynamic" || manifest.library_kind === "static") &&
    typeof manifest.library === "string" &&
    Array.isArray(manifest.libraries) &&
    manifest.libraries.every((entry) => typeof entry === "string") &&
    typeof manifest.header === "string" &&
    Array.isArray(manifest.headers) &&
    manifest.headers.every((entry) => typeof entry === "string") &&
    (manifest.legacy_header === undefined || typeof manifest.legacy_header === "string") &&
    Array.isArray(manifest.exports) &&
    manifest.exports.every((entry) => typeof entry === "string");
}

function nativePackageName(platform: NodePlatform, arch: NodeArchitecture): string {
  return `${nativeArtifactOs(platform)}-${nativeArtifactArch(arch)}`;
}

function nativeArtifactOs(platform: NodePlatform): string {
  if (platform === "win32") {
    return "windows";
  }

  if (platform === "darwin") {
    return "macos";
  }

  return platform;
}

function nativeArtifactArch(arch: NodeArchitecture): string {
  if (arch === "x64") {
    return "x86_64";
  }

  if (arch === "ia32") {
    return "x86";
  }

  if (arch === "arm64") {
    return "aarch64";
  }

  if (arch === "arm") {
    return "armv7";
  }

  return arch;
}

function packageRootDir(): string {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
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

function mergeSessionOptions(
  defaults: NnrpSessionOptions | undefined,
  options: NnrpSessionOptions,
): NnrpSessionOptions {
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

function eventSessionId(event: NnrpRuntimeEvent): string | undefined {
  if (event.type === "result") {
    return event.sessionId ?? event.result.sessionId;
  }

  return event.sessionId;
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

type NodePlatform = NodeJS.Platform;

type NodeArchitecture = NodeJS.Architecture;
