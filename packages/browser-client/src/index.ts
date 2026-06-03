import {
  createBrowserWasmManifest,
  createTransportCandidates,
  createTransportSelectionSummary,
  NNRP_PROTOCOL_VERSION,
  type NnrpAbortSignalLike,
  type NnrpCancelOptions,
  type NnrpCancelRequest,
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

export interface NnrpWasmRuntimeOptions {
  readonly moduleUrl?: string | URL;
  readonly module?: WebAssembly.Module;
  readonly artifact?: NnrpWasmArtifactOptions;
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly transportProviders?: readonly NnrpBrowserTransportProvider[];
  readonly primitives?: NnrpWasmPrimitiveBinding;
}

export interface NnrpBrowserConnectOptions {
  readonly endpoint: string | URL;
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpBrowserSessionOptions;
}

export interface NnrpBrowserTransportSelectionOptions {
  readonly peerManifest: NnrpCapabilityManifest;
  readonly scores?: Readonly<Partial<Record<NnrpTransportKind, number>>>;
}

export type NnrpBrowserTransportKind = Extract<NnrpTransportKind, "websocket">;

export interface NnrpBrowserTransportProvider extends NnrpTransportProvider {
  readonly kind: NnrpBrowserTransportKind;
  readonly available?: boolean;
  readonly score?: number;
  readonly diagnostic?: NnrpDiagnostic;
}

export interface NnrpBrowserTransportProviderOptions {
  readonly available?: boolean;
  readonly score?: number;
  readonly diagnostic?: NnrpDiagnostic;
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
  readonly primitives?: NnrpWasmPrimitiveBinding;
}

export interface NnrpWasmRuntimeBinding {
  readonly manifest: NnrpCapabilityManifest;
  readonly moduleUrl: string;
  readonly module?: WebAssembly.Module;
  readonly artifact?: NnrpResolvedWasmArtifact;
  readonly transportProviders: readonly NnrpBrowserTransportProvider[];
  readonly primitives?: NnrpWasmPrimitiveBinding;
}

export interface NnrpWasmSubmitRequest {
  readonly sessionOptions: NnrpBrowserSessionOptions;
  readonly submit: NnrpNormalizedSubmitRequest;
}

export interface NnrpWasmCancelRequest {
  readonly sessionOptions: NnrpBrowserSessionOptions;
  readonly cancel: NnrpCancelRequest;
}

export interface NnrpWasmSessionPatchRequest {
  readonly sessionOptions: NnrpBrowserSessionOptions;
  readonly patch: NnrpSessionPatchRequest;
}

export interface NnrpWasmSubmitNoWaitRequest {
  readonly sessionOptions: NnrpBrowserSessionOptions;
  readonly submit: NnrpNormalizedSubmitRequest;
}

export interface NnrpWasmEventBatchRequest {
  readonly maxEvents: number;
  readonly timeoutMillis?: number;
}

export interface NnrpWasmProtocolVersion {
  readonly protocolMajor: number;
  readonly wireFormat: number;
  readonly version: string;
}

export interface NnrpWasmTransportScoreRequest {
  readonly candidates: readonly NnrpTransportCandidate[];
  readonly policy: NnrpTransportPolicy;
}

export interface NnrpWasmSubmitValidationRequest {
  readonly sessionOptions: NnrpBrowserSessionOptions;
  readonly submit: NnrpNormalizedSubmitRequest;
}

export interface NnrpWasmPrimitiveBinding {
  protocolVersion?(): NnrpWasmProtocolVersion | Promise<NnrpWasmProtocolVersion>;
  scoreTransportCandidates?(
    request: NnrpWasmTransportScoreRequest,
  ): readonly NnrpTransportCandidate[] | Promise<readonly NnrpTransportCandidate[]>;
  validateSubmit?(
    request: NnrpWasmSubmitValidationRequest,
  ): NnrpNormalizedSubmitRequest | void | Promise<NnrpNormalizedSubmitRequest | void>;
  submit?(request: NnrpWasmSubmitRequest): NnrpResult | Promise<NnrpResult>;
  submitNoWait?(request: NnrpWasmSubmitNoWaitRequest): bigint | Promise<bigint>;
  cancel?(request: NnrpWasmCancelRequest): void | Promise<void>;
  patchSession?(
    request: NnrpWasmSessionPatchRequest,
  ): NnrpSessionPatchResult | void | Promise<NnrpSessionPatchResult | void>;
  awaitEvents?(request: NnrpWasmEventBatchRequest): readonly NnrpRuntimeEvent[] | Promise<readonly NnrpRuntimeEvent[]>;
  close?(): void | Promise<void>;
}

export interface NnrpWasmArtifactOptions {
  readonly manifest: NnrpWasmArtifactManifest;
  readonly baseUrl?: string | URL;
  readonly requiredExports?: readonly string[];
}

export interface NnrpWasmArtifactManifest {
  readonly package: "nnrp-wasm";
  readonly wasm: string;
  readonly types: string;
  readonly owner?: string;
  readonly downstream_wrapper?: string;
  readonly exports: readonly string[];
}

export interface NnrpResolvedWasmArtifact {
  readonly manifest: NnrpWasmArtifactManifest;
  readonly moduleUrl: string;
  readonly typesUrl: string;
  readonly requiredExports: readonly string[];
}

export class NnrpWasmBindingUnavailableError extends NnrpCapabilityError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpWasmBindingUnavailableError";
  }
}

export async function openBrowserRuntime(options: NnrpWasmRuntimeOptions = {}): Promise<NnrpBrowserRuntime> {
  const transportProviders = options.transportProviders ?? await discoverBrowserTransportProviders();
  return new NnrpBrowserRuntime(
    createWasmRuntimeBinding({ ...options, transportProviders }),
    options.transportPolicy ?? "score",
  );
}

export class NnrpBrowserRuntime {
  readonly #binding: NnrpWasmRuntimeBinding;
  readonly #transportPolicy: NnrpTransportPolicy;
  #closed = false;

  public constructor(binding: NnrpWasmRuntimeBinding, transportPolicy: NnrpTransportPolicy = "score") {
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
    validateBrowserTransportProviders(this.#binding.transportProviders);

    return new NnrpBrowserClient({
      endpoint: normalizeEndpoint(options.endpoint),
      runtime: this,
      transportPolicy: options.transportPolicy ?? this.#transportPolicy,
      ...(options.sessionDefaults === undefined ? {} : { sessionDefaults: options.sessionDefaults }),
    });
  }

  public selectTransport(options: NnrpBrowserTransportSelectionOptions): NnrpTransportSelectionSummary {
    this.#ensureOpen();

    return createTransportSelectionSummary(
      selectTransport(
        this.#createTransportCandidates(options),
        this.#transportPolicy,
      ),
    );
  }

  public async selectTransportWithPrimitives(
    options: NnrpBrowserTransportSelectionOptions,
  ): Promise<NnrpTransportSelectionSummary> {
    this.#ensureOpen();
    const candidates = this.#createTransportCandidates(options);
    const scoreTransportCandidates = this.#binding.primitives?.scoreTransportCandidates;
    const scoredCandidates = scoreTransportCandidates === undefined ? candidates : await scoreTransportCandidates({
      candidates,
      policy: this.#transportPolicy,
    });

    return createTransportSelectionSummary(
      selectTransport(
        scoredCandidates,
        this.#transportPolicy,
      ),
    );
  }

  public protocolVersion(): Promise<NnrpWasmProtocolVersion> {
    this.#ensureOpen();
    const protocolVersion = this.#binding.primitives?.protocolVersion;
    if (protocolVersion === undefined) {
      return Promise.resolve({
        protocolMajor: 1,
        wireFormat: 0,
        version: NNRP_PROTOCOL_VERSION,
      });
    }

    return Promise.resolve(protocolVersion());
  }

  public async submit(request: NnrpWasmSubmitRequest): Promise<NnrpResult> {
    this.#ensureOpen();
    const submit = this.#binding.primitives?.submit;
    if (submit === undefined) {
      throw bindingNotInstantiatedError("submit");
    }

    return await submit(await this.#validateSubmit(request));
  }

  public async submitNoWait(request: NnrpWasmSubmitNoWaitRequest): Promise<bigint> {
    this.#ensureOpen();
    const submitNoWait = this.#binding.primitives?.submitNoWait;
    if (submitNoWait === undefined) {
      throw bindingNotInstantiatedError("submitNoWait");
    }

    return await submitNoWait(await this.#validateSubmit(request));
  }

  public cancel(request: NnrpWasmCancelRequest): Promise<void> {
    this.#ensureOpen();
    const cancel = this.#binding.primitives?.cancel;
    if (cancel === undefined) {
      return Promise.reject(bindingNotInstantiatedError("cancel"));
    }

    return Promise.resolve(cancel(request));
  }

  public async patchSession(request: NnrpWasmSessionPatchRequest): Promise<NnrpSessionPatchResult> {
    this.#ensureOpen();
    const patchSession = this.#binding.primitives?.patchSession;
    if (patchSession === undefined) {
      throw bindingNotInstantiatedError("patchSession");
    }

    return await patchSession(request) ?? {
      accepted: true,
      ...(request.sessionOptions.sessionId === undefined ? {} : { sessionId: request.sessionOptions.sessionId }),
    };
  }

  public async awaitEvents(request: NnrpWasmEventBatchRequest): Promise<readonly NnrpRuntimeEvent[]> {
    this.#ensureOpen();
    const awaitEvents = this.#binding.primitives?.awaitEvents;
    if (awaitEvents === undefined) {
      throw bindingNotInstantiatedError("nextEvent");
    }

    return await awaitEvents(request);
  }

  public close(): Promise<void> {
    this.#closed = true;
    return Promise.resolve(this.#binding.primitives?.close?.());
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

  async #validateSubmit<TRequest extends NnrpWasmSubmitValidationRequest>(request: TRequest): Promise<TRequest> {
    const validateSubmit = this.#binding.primitives?.validateSubmit;
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

  #createTransportCandidates(options: NnrpBrowserTransportSelectionOptions): readonly NnrpTransportCandidate[] {
    const providerMap = new Map(this.#binding.transportProviders.map((provider) => [provider.kind, provider]));
    return createTransportCandidates({
      local: this.#binding.manifest,
      peer: options.peerManifest,
      ...(options.scores === undefined ? {} : { scores: options.scores }),
    }).map((candidate: NnrpTransportCandidate) =>
      withBrowserProvider(candidate, providerMap.get(candidate.kind as NnrpBrowserTransportKind))
    );
  }
}

export interface NnrpBrowserClientState {
  readonly endpoint: string;
  readonly runtime: NnrpBrowserRuntime;
  readonly transportPolicy: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpBrowserSessionOptions;
}

export class NnrpBrowserClient {
  readonly #state: NnrpBrowserClientState;
  readonly #eventQueues = new Map<string, NnrpRuntimeEvent[]>();
  #nextSessionId = 1;
  #closed = false;

  public constructor(state: NnrpBrowserClientState) {
    this.#state = state;
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

    return new NnrpBrowserClientSession({
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
          throw eventPollTimeoutError("wasm");
        }
        throw bindingNotInstantiatedError("nextEvent");
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
}

export class NnrpBrowserClientSession {
  readonly #state: NnrpBrowserClientSessionState;
  readonly #inFlightFrames = new Set<number>();
  readonly #terminalFrames = new Set<number>();
  readonly #cancelledOperations = new Set<string>();
  readonly #capacityWaiters: Array<() => void> = [];
  #availableCredits: number;
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

    return this.#state.client.runtime.submit({
      sessionOptions: this.#state.options,
      submit: normalized,
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

export function createWasmRuntimeBinding(options: NnrpWasmBindingOptions = {}): NnrpWasmRuntimeBinding {
  const artifact = options.artifact === undefined ? undefined : resolveWasmArtifact(options.artifact);

  return {
    manifest: createBrowserWasmManifest(["cache", "schema", "flow.update", "result.hint"]),
    moduleUrl: normalizeModuleUrl(options.moduleUrl ?? artifact?.moduleUrl ?? "./nnrp_wasm.wasm"),
    ...(options.module === undefined ? {} : { module: options.module }),
    ...(artifact === undefined ? {} : { artifact }),
    transportProviders: [...(options.transportProviders ?? [])],
    ...(options.primitives === undefined ? {} : { primitives: options.primitives }),
  };
}

export function resolveWasmArtifact(options: NnrpWasmArtifactOptions): NnrpResolvedWasmArtifact {
  validateWasmArtifactManifest(options.manifest, options.requiredExports);
  const baseUrl = options.baseUrl === undefined ? undefined : normalizeModuleUrl(options.baseUrl);

  return {
    manifest: options.manifest,
    moduleUrl: resolveArtifactUrl(options.manifest.wasm, baseUrl),
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

export function createBrowserTransportProvider(
  kind: NnrpBrowserTransportKind,
  options: NnrpBrowserTransportProviderOptions = {},
): NnrpBrowserTransportProvider {
  return {
    kind,
    endpointSchemes: ["ws", "wss"],
    probe: () => ({
      kind,
      peerSupported: true,
      localAvailable: options.available ?? true,
      score: options.score ?? 70,
      ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
    }),
    ...(options.available === undefined ? {} : { available: options.available }),
    ...(options.score === undefined ? {} : { score: options.score }),
    ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
  };
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
      "selectTransportWithProbeJson",
      "scoreProviderProbeJson",
      ...(requiredExports ?? []),
    ]),
  ];
}

function withBrowserProvider(
  candidate: NnrpTransportCandidate,
  provider: NnrpBrowserTransportProvider | undefined,
): NnrpTransportCandidate {
  if (provider === undefined) {
    return {
      ...candidate,
      localAvailable: false,
      rejectionReason: candidate.rejectionReason ?? "local-unavailable",
    };
  }

  return {
    ...candidate,
    localAvailable: provider.available ?? candidate.localAvailable,
    score: provider.score ?? candidate.score,
    ...(provider.diagnostic === undefined ? {} : { diagnostic: provider.diagnostic }),
  };
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
}

async function discoverBrowserTransportProviders(): Promise<readonly NnrpBrowserTransportProvider[]> {
  const websocket = await importOptionalTransportModule("@nnrp/transport-websocket");
  if (!isTransportFactory(websocket?.createWebSocketTransportProvider)) {
    return [];
  }

  const provider = websocket.createWebSocketTransportProvider();
  const candidate = await provider.probe();
  if (!isBrowserTransportProvider(provider)) {
    return [];
  }

  return [{
    ...provider,
    available: candidate.localAvailable,
    score: candidate.score,
    ...(candidate.diagnostic === undefined ? {} : { diagnostic: candidate.diagnostic }),
  }];
}

async function importOptionalTransportModule(specifier: string): Promise<Record<string, unknown> | undefined> {
  try {
    return await import(specifier) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function isTransportFactory(value: unknown): value is () => {
  probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
} {
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
    typeof provider.probe === "function";
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

function eventSessionId(event: NnrpRuntimeEvent): string | undefined {
  if (event.type === "result") {
    return event.sessionId ?? event.result.sessionId;
  }

  return event.sessionId;
}

function closedError(target: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code: "NNRP_WASM_CLOSED",
    message: `Cannot use a closed ${target}.`,
    source: "wasm",
    retryable: false,
  });
}

function bindingNotInstantiatedError(operation: string): NnrpWasmBindingUnavailableError {
  return new NnrpWasmBindingUnavailableError({
    code: "NNRP_WASM_BINDING_NOT_INSTANTIATED",
    message: `WASM binding operation '${operation}' is not connected to instantiated primitives yet.`,
    source: "wasm",
    retryable: false,
  });
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
