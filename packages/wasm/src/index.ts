import {
  createBrowserWasmManifest,
  createTransportCandidates,
  createTransportSelectionSummary,
  type NnrpCancelOptions,
  NnrpCapabilityError,
  type NnrpCapabilityManifest,
  type NnrpDiagnostic,
  type NnrpEventPollOptions,
  type NnrpInputProfile,
  type NnrpOperationRef,
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
} from "@nnrp/core";

export interface NnrpWasmRuntimeOptions {
  readonly moduleUrl?: string | URL;
  readonly module?: WebAssembly.Module;
  readonly artifact?: NnrpWasmArtifactOptions;
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly transportProviders?: readonly NnrpBrowserTransportProvider[];
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
}

export interface NnrpWasmRuntimeBinding {
  readonly manifest: NnrpCapabilityManifest;
  readonly moduleUrl: string;
  readonly module?: WebAssembly.Module;
  readonly artifact?: NnrpResolvedWasmArtifact;
  readonly transportProviders: readonly NnrpBrowserTransportProvider[];
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

  public close(): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
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

  public openSession(options: NnrpBrowserSessionOptions = {}): NnrpBrowserClientSession {
    this.#ensureOpen();

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
  #closed = false;

  public constructor(state: NnrpBrowserClientSessionState) {
    this.#state = state;
  }

  public get options(): NnrpBrowserSessionOptions {
    return this.#state.options;
  }

  public submit(request: NnrpSubmitRequest): Promise<NnrpResult> {
    try {
      this.#ensureOpen();
      normalizeSubmitRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.reject(bindingNotInstantiatedError("submit"));
  }

  public cancel(operation: NnrpOperationRef, options: NnrpCancelOptions = {}): Promise<void> {
    try {
      this.#ensureOpen();
      normalizeCancelRequest(operation, options);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.reject(bindingNotInstantiatedError("cancel"));
  }

  public nextEvent(options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.reject(bindingNotInstantiatedError("nextEvent"));
  }

  public async *events(options: NnrpEventPollOptions = {}): AsyncIterable<NnrpRuntimeEvent> {
    while (!this.closed) {
      yield await this.nextEvent(options);
    }
  }

  public close(): Promise<void> {
    this.#closed = true;
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
}

export function createWasmRuntimeBinding(options: NnrpWasmBindingOptions = {}): NnrpWasmRuntimeBinding {
  const artifact = options.artifact === undefined ? undefined : resolveWasmArtifact(options.artifact);

  return {
    manifest: createBrowserWasmManifest(),
    moduleUrl: normalizeModuleUrl(options.moduleUrl ?? artifact?.moduleUrl ?? "./nnrp_wasm.wasm"),
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
  return {
    ...defaults,
    ...options,
    metadata: {
      ...(defaults?.metadata ?? {}),
      ...(options.metadata ?? {}),
    },
  };
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
