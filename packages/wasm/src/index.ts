import {
  createBrowserWasmManifest,
  NnrpCapabilityError,
  type NnrpCapabilityManifest,
  type NnrpDiagnostic,
  type NnrpInputProfile,
  type NnrpResult,
  type NnrpRuntimeEvent,
  type NnrpSubmitRequest,
  type NnrpTransportPolicy,
  normalizeSubmitRequest,
} from "@nnrp/core";

export interface NnrpWasmRuntimeOptions {
  readonly moduleUrl?: string | URL;
  readonly module?: WebAssembly.Module;
  readonly transportPolicy?: NnrpTransportPolicy;
}

export interface NnrpBrowserConnectOptions {
  readonly endpoint: string | URL;
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpBrowserSessionOptions;
}

export interface NnrpBrowserSessionOptions {
  readonly inputProfile?: NnrpInputProfile;
  readonly targetCadence?: number;
  readonly qualityTier?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface WasmRuntimeOptions {
  readonly moduleUrl?: string | URL;
  readonly module?: WebAssembly.Module;
}

export interface WasmRuntimeBinding {
  readonly manifest: NnrpCapabilityManifest;
  readonly moduleUrl: string;
  readonly module?: WebAssembly.Module;
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
  readonly #binding: WasmRuntimeBinding;
  readonly #transportPolicy: NnrpTransportPolicy;
  #closed = false;

  public constructor(binding: WasmRuntimeBinding, transportPolicy: NnrpTransportPolicy = "score") {
    this.#binding = binding;
    this.#transportPolicy = transportPolicy;
  }

  public get manifest(): NnrpCapabilityManifest {
    return this.#binding.manifest;
  }

  public get moduleUrl(): string {
    return this.#binding.moduleUrl;
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

  public nextEvent(): Promise<NnrpRuntimeEvent> {
    this.#ensureOpen();
    return Promise.reject(bindingNotInstantiatedError("nextEvent"));
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

export function createWasmRuntimeBinding(options: WasmRuntimeOptions = {}): WasmRuntimeBinding {
  return {
    manifest: createBrowserWasmManifest(),
    moduleUrl: normalizeModuleUrl(options.moduleUrl ?? "./nnrp_wasm_bg.wasm"),
    ...(options.module === undefined ? {} : { module: options.module }),
  };
}

function normalizeModuleUrl(moduleUrl: string | URL): string {
  return moduleUrl instanceof URL ? moduleUrl.toString() : moduleUrl;
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
