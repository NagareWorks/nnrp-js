import {
  createBrowserWasmManifest,
  createTransportCandidates,
  createTransportSelectionSummary,
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
  type NnrpResult,
  type NnrpRuntimeEvent,
  type NnrpSubmitRequest,
  type NnrpTransportCandidate,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  type NnrpTransportSelectionSummary,
  normalizeCancelRequest,
  normalizeSubmitRequest,
  selectTransport,
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

export type NnrpBrowserTransportKind = Extract<NnrpTransportKind, "websocket" | "webtransport">;

export interface NnrpBrowserTransportProvider {
  readonly kind: NnrpBrowserTransportKind;
  readonly available?: boolean;
  readonly score?: number;
  readonly diagnostic?: NnrpDiagnostic;
}

export interface NnrpBrowserSessionOptions {
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

export interface NnrpWasmSubmitNoWaitRequest {
  readonly sessionOptions: NnrpBrowserSessionOptions;
  readonly submit: NnrpNormalizedSubmitRequest;
}

export interface NnrpWasmEventBatchRequest {
  readonly maxEvents: number;
}

export interface NnrpWasmPrimitiveBinding {
  submit?(request: NnrpWasmSubmitRequest): NnrpResult | Promise<NnrpResult>;
  submitNoWait?(request: NnrpWasmSubmitNoWaitRequest): bigint | Promise<bigint>;
  cancel?(request: NnrpWasmCancelRequest): void | Promise<void>;
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

export function openBrowserRuntime(options: NnrpWasmRuntimeOptions = {}): Promise<NnrpBrowserRuntime> {
  return Promise.resolve(new NnrpBrowserRuntime(createWasmRuntimeBinding(options), options.transportPolicy ?? "score"));
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

  public connect(options: NnrpBrowserConnectOptions): NnrpBrowserClient {
    this.#ensureOpen();
    validateEndpoint(options.endpoint);

    return new NnrpBrowserClient({
      endpoint: normalizeEndpoint(options.endpoint),
      runtime: this,
      transportPolicy: options.transportPolicy ?? this.#transportPolicy,
      ...(options.sessionDefaults === undefined ? {} : { sessionDefaults: options.sessionDefaults }),
    });
  }

  public selectTransport(options: NnrpBrowserTransportSelectionOptions): NnrpTransportSelectionSummary {
    this.#ensureOpen();
    const providerMap = new Map(this.#binding.transportProviders.map((provider) => [provider.kind, provider]));
    const candidates = createTransportCandidates({
      local: this.#binding.manifest,
      peer: options.peerManifest,
      ...(options.scores === undefined ? {} : { scores: options.scores }),
    }).map((candidate) => withBrowserProvider(candidate, providerMap.get(candidate.kind as NnrpBrowserTransportKind)));

    return createTransportSelectionSummary(
      selectTransport(
        candidates,
        this.#transportPolicy,
      ),
    );
  }

  public submit(request: NnrpWasmSubmitRequest): Promise<NnrpResult> {
    this.#ensureOpen();
    const submit = this.#binding.primitives?.submit;
    if (submit === undefined) {
      return Promise.reject(bindingNotInstantiatedError("submit"));
    }

    return Promise.resolve(submit(request));
  }

  public submitNoWait(request: NnrpWasmSubmitNoWaitRequest): Promise<bigint> {
    this.#ensureOpen();
    const submitNoWait = this.#binding.primitives?.submitNoWait;
    if (submitNoWait === undefined) {
      return Promise.reject(bindingNotInstantiatedError("submitNoWait"));
    }

    return Promise.resolve(submitNoWait(request));
  }

  public cancel(request: NnrpWasmCancelRequest): Promise<void> {
    this.#ensureOpen();
    const cancel = this.#binding.primitives?.cancel;
    if (cancel === undefined) {
      return Promise.reject(bindingNotInstantiatedError("cancel"));
    }

    return Promise.resolve(cancel(request));
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
}

export interface NnrpBrowserClientState {
  readonly endpoint: string;
  readonly runtime: NnrpBrowserRuntime;
  readonly transportPolicy: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpBrowserSessionOptions;
}

export class NnrpBrowserClient {
  readonly #state: NnrpBrowserClientState;
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
      options: mergeSessionOptions(this.#state.sessionDefaults, options),
    });
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
}

export interface NnrpBrowserClientSessionState {
  readonly client: NnrpBrowserClient;
  readonly options: NnrpBrowserSessionOptions;
}

export class NnrpBrowserClientSession {
  readonly #state: NnrpBrowserClientSessionState;
  readonly #inFlightFrames = new Set<number>();
  readonly #terminalFrames = new Set<number>();
  readonly #cancelledOperations = new Set<string>();
  #closed = false;

  public constructor(state: NnrpBrowserClientSessionState) {
    this.#state = state;
  }

  public get options(): NnrpBrowserSessionOptions {
    return this.#state.options;
  }

  public submit(request: NnrpSubmitRequest): Promise<NnrpResult> {
    let normalized: NnrpNormalizedSubmitRequest;
    try {
      this.#ensureOpen();
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

    if (event.type === "close") {
      this.#inFlightFrames.clear();
      this.#terminalFrames.clear();
      this.#cancelledOperations.clear();
    }
  }

  public nextEvent(options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    return this.#state.client.runtime.awaitEvents({ maxEvents: 1 }).then((events) => {
      const [event] = events;
      if (event === undefined) {
        throw bindingNotInstantiatedError("nextEvent");
      }

      this.completeEvent(event);
      return event;
    });
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
  options: Omit<NnrpBrowserTransportProvider, "kind"> = {},
): NnrpBrowserTransportProvider {
  return {
    kind,
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
    typeof manifest.wasm === "string" &&
    typeof manifest.types === "string" &&
    (manifest.owner === undefined || typeof manifest.owner === "string") &&
    (manifest.downstream_wrapper === undefined || typeof manifest.downstream_wrapper === "string") &&
    Array.isArray(manifest.exports) &&
    manifest.exports.every((entry) => typeof entry === "string");
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
    return candidate;
  }

  return {
    ...candidate,
    localAvailable: provider.available ?? candidate.localAvailable,
    score: provider.score ?? candidate.score,
    ...(provider.diagnostic === undefined ? {} : { diagnostic: provider.diagnostic }),
  };
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

function bindingNotInstantiatedError(operation: string): NnrpWasmBindingUnavailableError {
  return new NnrpWasmBindingUnavailableError({
    code: "NNRP_WASM_BINDING_NOT_INSTANTIATED",
    message: `WASM binding operation '${operation}' is not connected to instantiated primitives yet.`,
    source: "wasm",
    retryable: false,
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
