import {
  createBackendNativeManifest,
  createCapabilityManifest,
  createTransportCandidates,
  createTransportSelectionSummary,
  type NnrpAbortSignalLike,
  type NnrpCancelOptions,
  type NnrpCancelRequest,
  type NnrpCapability,
  NnrpCapabilityError,
  type NnrpCapabilityManifest,
  type NnrpDiagnostic,
  type NnrpEventPollOptions,
  type NnrpInputProfile,
  type NnrpNormalizedSubmitRequest,
  type NnrpOperationRef,
  NnrpProtocolError,
  NnrpRecoveryError,
  type NnrpResult,
  type NnrpRuntimeEvent,
  type NnrpSessionFlowControlOptions,
  type NnrpSessionMigrationRequest,
  type NnrpSessionPatchRequest,
  type NnrpSessionPatchResult,
  type NnrpSubmitRequest,
  NnrpTimeoutError,
  type NnrpTransportCandidate,
  NnrpTransportError,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  type NnrpTransportProvider,
  type NnrpTransportSelectionSummary,
  normalizeCancelRequest,
  normalizeSessionMigrationRequest,
  normalizeSessionPatchRequest,
  normalizeSubmitRequest,
  selectTransport,
  throwIfResultDrop,
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
const MINIMUM_ABI_MINOR = 5;
const TRANSPORT_SLOT_QUIC = 0x00000001;
const TRANSPORT_SLOT_TCP = 0x00000002;
const REQUIRED_TRANSPORT_SLOTS = TRANSPORT_SLOT_TCP;
const NATIVE_RUNTIME_CAPABILITIES = ["cache", "schema", "recovery", "flow.update", "result.hint"] as const;
const RUNTIME_FEATURE_PROTOCOL_CORE = 0x0000000000000001n;
const RUNTIME_FEATURE_CLIENT_API = 0x0000000000000002n;
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
const RUNTIME_FEATURE_CLIENT_COMPLETION_HELPERS = 0x0000000000004000n;
const RUNTIME_FEATURE_CLIENT_COARSE_RESULT_HELPERS = 0x0000000000008000n;
const RUNTIME_FEATURE_CLIENT_COMPACT_RESULT_HELPERS = 0x0000000000010000n;
const REQUIRED_NATIVE_SYMBOLS = [
  "nnrp_runtime_capabilities",
  "nnrp_client_submit_result_compact",
  "nnrp_client_await_events",
] as const;
const REQUIRED_RUNTIME_FEATURES = RUNTIME_FEATURE_PROTOCOL_CORE |
  RUNTIME_FEATURE_CLIENT_API |
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
  RUNTIME_FEATURE_CLIENT_COMPLETION_HELPERS |
  RUNTIME_FEATURE_CLIENT_COARSE_RESULT_HELPERS |
  RUNTIME_FEATURE_CLIENT_COMPACT_RESULT_HELPERS;

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

export interface NnrpNativeCancelRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly cancel: NnrpCancelRequest;
}

export interface NnrpNativeSessionPatchRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly patch: NnrpSessionPatchRequest;
}

export interface NnrpNativeEventBatchRequest {
  readonly maxEvents: number;
  readonly timeoutMillis?: number;
}

export interface NnrpNativeTransportScoreRequest {
  readonly candidates: readonly NnrpTransportCandidate[];
  readonly policy: NnrpTransportPolicy;
}

export interface NnrpNativeAcceptRequest {
  readonly endpoint: string;
  readonly transportPolicy: NnrpTransportPolicy;
}

export interface NnrpNativeAcceptedSession {
  readonly sessionOptions?: NnrpSessionOptions;
}

export interface NnrpNativeServerReceiveRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly timeoutMillis?: number;
}

export interface NnrpNativeFfiBinding {
  readonly mode?: "native-addon" | "node-ffi" | "nano-ffi" | "test";
  runtimeCapabilities?(): NnrpNativeRuntimeCapabilities | Promise<NnrpNativeRuntimeCapabilities>;
  scoreTransportCandidates?(
    request: NnrpNativeTransportScoreRequest,
  ): readonly NnrpTransportCandidate[] | Promise<readonly NnrpTransportCandidate[]>;
  validateSubmit?(
    request: NnrpNativeSubmitValidationRequest,
  ): NnrpNormalizedSubmitRequest | void | Promise<NnrpNormalizedSubmitRequest | void>;
  submitResultCompact?(request: NnrpNativeSubmitResultCompactRequest): NnrpResult | Promise<NnrpResult>;
  submitNoWait?(request: NnrpNativeSubmitNoWaitRequest): bigint | Promise<bigint>;
  cancel?(request: NnrpNativeCancelRequest): void | Promise<void>;
  patchSession?(
    request: NnrpNativeSessionPatchRequest,
  ): NnrpSessionPatchResult | void | Promise<NnrpSessionPatchResult | void>;
  awaitEvents?(
    request: NnrpNativeEventBatchRequest,
  ): readonly NnrpRuntimeEvent[] | Promise<readonly NnrpRuntimeEvent[]>;
  accept?(
    request: NnrpNativeAcceptRequest,
  ): NnrpNativeAcceptedSession | void | Promise<NnrpNativeAcceptedSession | void>;
  receive?(request: NnrpNativeServerReceiveRequest): NnrpRuntimeEvent | Promise<NnrpRuntimeEvent>;
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

interface NnrpNativeClientOptions {
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

export interface NnrpBackendRuntimeOptions {
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

export interface NnrpListenOptions {
  readonly endpoint: string | URL;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
}

export interface NnrpNativeTransportProvider extends NnrpTransportProvider {
  readonly kind: Extract<NnrpTransportKind, "tcp" | "quic">;
  probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
}

export interface NnrpTransportSelectionOptions {
  readonly peerManifest: NnrpCapabilityManifest;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly scores?: Readonly<Partial<Record<NnrpTransportKind, number>>>;
}

export interface NnrpNativeBindingOptions {
  readonly libraryPath?: string;
  readonly nativeLibrary?: NnrpNativeLibraryOptions;
  readonly env?: Record<string, string | undefined>;
  readonly platform?: NodePlatform;
  readonly arch?: NodeArchitecture;
  readonly ffi?: NnrpNativeFfiBinding;
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

export async function openBackendRuntime(options: NnrpBackendRuntimeOptions = {}): Promise<NnrpBackendRuntime> {
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
    options.transportPolicy ?? "score",
    transportProviders,
  );
}

export class NnrpBackendRuntime {
  readonly #binding: NnrpNativeRuntimeBinding;
  readonly #transportPolicy: NnrpTransportPolicy;
  readonly #transportProviders: readonly NnrpNativeTransportProvider[];
  #closed = false;

  public constructor(
    binding: NnrpNativeRuntimeBinding,
    transportPolicy: NnrpTransportPolicy = "score",
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

  public cancel(request: NnrpNativeCancelRequest): Promise<void> {
    this.#ensureOpen();
    const cancel = this.#binding.ffi?.cancel;
    if (cancel === undefined) {
      return Promise.reject(bindingNotConnectedError("cancel"));
    }

    return Promise.resolve(cancel(request));
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

  public async acceptServerSession(request: NnrpNativeAcceptRequest): Promise<NnrpNativeAcceptedSession> {
    this.#ensureOpen();
    const accept = this.#binding.ffi?.accept;
    if (accept === undefined) {
      throw bindingNotConnectedError("accept");
    }

    return await accept(request) ?? {};
  }

  public async receiveServerEvent(request: NnrpNativeServerReceiveRequest): Promise<NnrpRuntimeEvent> {
    this.#ensureOpen();
    const receive = this.#binding.ffi?.receive;
    if (receive === undefined) {
      throw bindingNotConnectedError("receive");
    }

    return await receive(request);
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

  public listen(options: NnrpListenOptions): NnrpServer {
    this.#ensureOpen();
    this.#ensureConnectReady("listen");
    validateEndpoint(options.endpoint);
    validateTransportProvidersForPolicy(
      options.transports ?? this.#transportProviders,
      options.transportPolicy ?? this.#transportPolicy,
    );

    return new NnrpServer({
      endpoint: normalizeEndpoint(options.endpoint),
      runtime: this,
      transports: options.transports ?? this.#transportProviders,
      transportPolicy: options.transportPolicy ?? this.#transportPolicy,
    });
  }

  public selectTransport(options: NnrpTransportSelectionOptions): NnrpTransportSelectionSummary {
    this.#ensureOpen();

    return createTransportSelectionSummary(
      selectTransport(
        this.#createTransportCandidates(options),
        this.#transportPolicy,
      ),
    );
  }

  public async selectTransportWithNative(
    options: NnrpTransportSelectionOptions,
  ): Promise<NnrpTransportSelectionSummary> {
    this.#ensureOpen();
    const candidates = this.#createTransportCandidates(options);
    const probedCandidates = await applyNativeTransportProbes(
      candidates,
      options.transports ?? this.#transportProviders,
    );
    const scoreTransportCandidates = this.#binding.ffi?.scoreTransportCandidates;
    const scoredCandidates = scoreTransportCandidates === undefined
      ? probedCandidates
      : await scoreTransportCandidates({
        candidates: probedCandidates,
        policy: this.#transportPolicy,
      });

    return createTransportSelectionSummary(
      selectTransport(
        scoredCandidates,
        this.#transportPolicy,
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

  #ensureConnectReady(operation: "connect" | "listen"): void {
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
    return createTransportCandidates({
      local: this.#binding.manifest,
      peer: options.peerManifest,
      ...(options.scores === undefined ? {} : { scores: options.scores }),
    });
  }
}

async function applyNativeTransportProbes(
  candidates: readonly NnrpTransportCandidate[],
  providers: readonly NnrpNativeTransportProvider[],
): Promise<readonly NnrpTransportCandidate[]> {
  const probes = new Map<NnrpTransportKind, NnrpTransportCandidate>();
  for (const provider of providers) {
    probes.set(provider.kind, await provider.probe());
  }

  return candidates.map((candidate) => {
    const probe = probes.get(candidate.kind);
    if (probe === undefined) {
      return {
        ...candidate,
        localAvailable: false,
        rejectionReason: candidate.rejectionReason ?? "local-unavailable",
      };
    }

    return {
      ...candidate,
      localAvailable: probe.localAvailable,
      score: probe.score,
      ...(probe.diagnostic === undefined ? {} : { diagnostic: probe.diagnostic }),
      ...(probe.rejectionReason === undefined ? {} : { rejectionReason: probe.rejectionReason }),
    };
  });
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

  const kinds = new Set(providers.map((provider) => provider.kind));
  if (policy === "tcp-only" && !kinds.has("tcp")) {
    throw new NnrpTransportError({
      code: "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED",
      message: "tcp-only transport policy requires an installed or explicit TCP provider.",
      source: "transport",
      retryable: false,
      transport: "tcp",
    });
  }
  if (policy === "quic-only" && !kinds.has("quic")) {
    throw new NnrpTransportError({
      code: "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED",
      message: "quic-only transport policy requires an installed or explicit QUIC provider.",
      source: "transport",
      retryable: false,
      transport: "quic",
    });
  }
}

interface NnrpClientState {
  readonly endpoint: string;
  readonly runtime: NnrpBackendRuntime;
  readonly transports: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
}

class NnrpClient {
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

    const queued = this.#eventQueues.get(sessionId);
    const event = queued?.shift();
    if (event !== undefined) {
      return event;
    }

    while (true) {
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
        const candidateSessionId = eventSessionId(candidate);
        if (candidateSessionId === undefined || candidateSessionId === sessionId) {
          return candidate;
        }

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

interface NnrpClientSessionState {
  readonly client: NnrpClient;
  options: NnrpSessionOptions;
}

class NnrpClientSession {
  readonly #state: NnrpClientSessionState;
  readonly #inFlightFrames = new Set<number>();
  readonly #terminalFrames = new Set<number>();
  readonly #cancelledOperations = new Set<string>();
  readonly #capacityWaiters: Array<() => void> = [];
  #availableCredits: number;
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

  public async submit(request: NnrpSubmitRequest): Promise<NnrpResult> {
    let normalized: NnrpNormalizedSubmitRequest;
    try {
      this.#ensureOpen();
      const capacityWait = this.#reserveOrAwaitSubmitCapacity();
      if (capacityWait !== undefined) {
        await capacityWait;
      }
      normalized = normalizeSubmitRequest(request);
      this.#beginFrame(normalized.frameId);
    } catch (error) {
      return Promise.reject(error);
    }

    return this.#state.client.runtime.submitResultCompact({
      sessionOptions: this.#state.options,
      submit: normalized,
      maxEvents: 1,
    }).finally(() => this.#finishFrame(normalized.frameId));
  }

  public submitNoWait(request: NnrpSubmitRequest): Promise<bigint> {
    let normalized: NnrpNormalizedSubmitRequest;
    try {
      this.#ensureOpen();
      this.#reserveImmediateCapacity();
      normalized = normalizeSubmitRequest(request);
      this.#beginFrame(normalized.frameId);
    } catch (error) {
      return Promise.reject(error);
    }

    return this.#state.client.runtime.submitNoWait({
      sessionOptions: this.#state.options,
      submit: normalized,
    }).catch((error) => {
      this.#finishFrame(normalized.frameId);
      throw error;
    });
  }

  public cancel(operation: NnrpOperationRef, options: NnrpCancelOptions = {}): Promise<void> {
    let normalized: NnrpCancelRequest;
    try {
      this.#ensureOpen();
      normalized = normalizeCancelRequest(operation, options);
      this.#beginCancel(normalized.operation);
    } catch (error) {
      return Promise.reject(error);
    }

    return this.#state.client.runtime.cancel({
      sessionOptions: this.#state.options,
      cancel: normalized,
    }).then(() => {
      this.#finishOperation(normalized.operation);
    }).catch((error) => {
      this.#cancelledOperations.delete(operationKey(normalized.operation));
      throw error;
    });
  }

  public inFlightFrames(): readonly number[] {
    return [...this.#inFlightFrames].sort((left, right) => left - right);
  }

  public completeEvent(event: NnrpRuntimeEvent): void {
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

  public nextEvent(options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    return this.#state.client.nextSessionEvent(this.sessionId, options).then((event) => {
      this.completeEvent(event);
      return event;
    });
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
    this.#cancelledOperations.delete(operationKey(frameId));
  }

  #reserveOrAwaitSubmitCapacity(): Promise<void> | undefined {
    if (this.#state.options.submitCapacityPolicy !== "await-credit") {
      return undefined;
    }

    if (this.#availableCredits > 0) {
      this.#availableCredits -= 1;
      return undefined;
    }

    return this.#awaitSubmitCapacity();
  }

  async #awaitSubmitCapacity(): Promise<void> {
    do {
      this.#ensureOpen();
      await new Promise<void>((resolve) => this.#capacityWaiters.push(resolve));
    } while (this.#availableCredits <= 0);

    this.#availableCredits -= 1;
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
    this.#inFlightFrames.delete(frameId);
  }

  #finishOperation(operation: NnrpOperationRef): void {
    if (typeof operation === "number") {
      this.#finishFrame(operation);
      this.#terminalFrames.add(operation);
      return;
    }

    if (operation <= BigInt(Number.MAX_SAFE_INTEGER)) {
      const frameId = Number(operation);
      this.#finishFrame(frameId);
      this.#terminalFrames.add(frameId);
    }
  }

  #beginCancel(operation: NnrpOperationRef): void {
    const key = operationKey(operation);
    if (this.#cancelledOperations.has(key)) {
      throw new NnrpProtocolError({
        code: "NNRP_OPERATION_CANCEL_DUPLICATE",
        message: `Operation ${key} has already been cancelled for this session.`,
        source: "core",
        retryable: false,
      });
    }

    const frameId = operationFrameId(operation);
    if (frameId !== undefined && this.#terminalFrames.has(frameId)) {
      throw new NnrpProtocolError({
        code: "NNRP_OPERATION_TERMINAL",
        message: `Operation ${key} already reached a terminal state.`,
        source: "core",
        retryable: false,
      });
    }

    this.#cancelledOperations.add(key);
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
    this.#cancelledOperations.delete(operationKey(frameId));
  }
}

export interface NnrpServerState {
  readonly endpoint: string;
  readonly runtime: NnrpBackendRuntime;
  readonly transports: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy: NnrpTransportPolicy;
}

export class NnrpServer {
  readonly #state: NnrpServerState;
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

  public accept(): Promise<NnrpServerSession> {
    try {
      this.#ensureOpen();
    } catch (error) {
      return Promise.reject(error);
    }

    return this.#state.runtime.acceptServerSession({
      endpoint: this.#state.endpoint,
      transportPolicy: this.#state.transportPolicy,
    }).then((accepted) =>
      new NnrpServerSession({
        runtime: this.#state.runtime,
        options: accepted.sessionOptions ?? {},
      })
    );
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
      throw closedError("server");
    }
  }
}

export interface NnrpServerSessionState {
  readonly runtime: NnrpBackendRuntime;
  readonly options: NnrpSessionOptions;
}

export class NnrpServerSession {
  readonly #state: NnrpServerSessionState | undefined;
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
      state.runtime.receiveServerEvent({
        sessionOptions: state.options,
        ...(options.timeoutMillis === undefined ? {} : { timeoutMillis: options.timeoutMillis }),
      }),
      options,
    );
  }

  public sendResult(_result: NnrpResult): Promise<void> {
    this.#ensureOpen();
    return Promise.reject(bindingNotConnectedError("sendResult"));
  }

  public close(): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }

  public get closed(): boolean {
    return this.#closed;
  }

  #ensureOpen(): void {
    if (this.#closed) {
      throw closedError("server session");
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

function operationKey(operation: NnrpOperationRef): string {
  return operation.toString();
}

function operationFrameId(operation: NnrpOperationRef): number | undefined {
  if (typeof operation === "number") {
    return operation;
  }

  if (operation <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(operation);
  }

  return undefined;
}

type NodePlatform = NodeJS.Platform;

type NodeArchitecture = NodeJS.Architecture;
