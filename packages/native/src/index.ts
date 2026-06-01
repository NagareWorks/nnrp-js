import {
  createBackendNativeManifest,
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
  type NnrpTransportPolicy,
  normalizeCancelRequest,
  normalizeSubmitRequest,
  validateEventPollOptions,
} from "@nnrp/core";
import process from "node:process";

export interface NnrpNativeLibraryOptions {
  readonly path?: string;
  readonly artifactDir?: string;
  readonly requiredSymbols?: readonly string[];
}

export interface NnrpSessionOptions {
  readonly inputProfile?: NnrpInputProfile;
  readonly targetCadence?: number;
  readonly qualityTier?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpNativeClientOptions {
  readonly endpoint: string | URL;
  readonly nativeLibrary?: NnrpNativeLibraryOptions;
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
  readonly env?: Record<string, string | undefined>;
  readonly platform?: NodePlatform;
  readonly arch?: NodeArchitecture;
}

export interface NnrpBackendRuntimeOptions {
  readonly nativeLibrary?: NnrpNativeLibraryOptions;
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly env?: Record<string, string | undefined>;
  readonly platform?: NodePlatform;
  readonly arch?: NodeArchitecture;
}

export interface NnrpConnectOptions {
  readonly endpoint: string | URL;
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
}

export interface NnrpListenOptions {
  readonly endpoint: string | URL;
  readonly transportPolicy?: NnrpTransportPolicy;
}

export interface NativeRuntimeOptions {
  readonly libraryPath?: string;
  readonly nativeLibrary?: NnrpNativeLibraryOptions;
  readonly env?: Record<string, string | undefined>;
  readonly platform?: NodePlatform;
  readonly arch?: NodeArchitecture;
}

export interface NativeRuntimeBinding {
  readonly manifest: NnrpCapabilityManifest;
  readonly libraryPath: string;
  readonly requiredSymbols: readonly string[];
}

export class NnrpNativeBindingUnavailableError extends NnrpCapabilityError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpNativeBindingUnavailableError";
  }
}

export class NativeBindingUnavailableError extends NnrpNativeBindingUnavailableError {}

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

export function openBackendRuntime(options: NnrpBackendRuntimeOptions = {}): Promise<NnrpBackendRuntime> {
  return Promise.resolve(
    new NnrpBackendRuntime(createNativeRuntimeBinding(options), options.transportPolicy ?? "score"),
  );
}

export class NnrpBackendRuntime {
  readonly #binding: NativeRuntimeBinding;
  readonly #transportPolicy: NnrpTransportPolicy;
  #closed = false;

  public constructor(binding: NativeRuntimeBinding, transportPolicy: NnrpTransportPolicy = "score") {
    this.#binding = binding;
    this.#transportPolicy = transportPolicy;
  }

  public get manifest(): NnrpCapabilityManifest {
    return this.#binding.manifest;
  }

  public get libraryPath(): string {
    return this.#binding.libraryPath;
  }

  public connect(options: NnrpConnectOptions): NnrpClient {
    this.#ensureOpen();
    validateEndpoint(options.endpoint);

    return new NnrpClient({
      endpoint: normalizeEndpoint(options.endpoint),
      runtime: this,
      transportPolicy: options.transportPolicy ?? this.#transportPolicy,
      ...(options.sessionDefaults === undefined ? {} : { sessionDefaults: options.sessionDefaults }),
    });
  }

  public listen(options: NnrpListenOptions): NnrpServer {
    this.#ensureOpen();
    validateEndpoint(options.endpoint);

    return new NnrpServer({
      endpoint: normalizeEndpoint(options.endpoint),
      runtime: this,
      transportPolicy: options.transportPolicy ?? this.#transportPolicy,
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
      throw closedError("runtime");
    }
  }
}

export interface NnrpClientState {
  readonly endpoint: string;
  readonly runtime: NnrpBackendRuntime;
  readonly transportPolicy: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
}

export class NnrpClient {
  readonly #state: NnrpClientState;
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

  public openSession(options: NnrpSessionOptions = {}): NnrpClientSession {
    this.#ensureOpen();

    return new NnrpClientSession({
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
      throw closedError("client");
    }
  }
}

export interface NnrpClientSessionState {
  readonly client: NnrpClient;
  readonly options: NnrpSessionOptions;
}

export class NnrpClientSession {
  readonly #state: NnrpClientSessionState;
  #closed = false;

  public constructor(state: NnrpClientSessionState) {
    this.#state = state;
  }

  public get options(): NnrpSessionOptions {
    return this.#state.options;
  }

  public submit(request: NnrpSubmitRequest): Promise<NnrpResult> {
    try {
      this.#ensureOpen();
      normalizeSubmitRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.reject(bindingNotConnectedError("submit"));
  }

  public submitNoWait(request: NnrpSubmitRequest): Promise<bigint> {
    try {
      this.#ensureOpen();
      normalizeSubmitRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.reject(bindingNotConnectedError("submitNoWait"));
  }

  public cancel(operation: NnrpOperationRef, options: NnrpCancelOptions = {}): Promise<void> {
    try {
      this.#ensureOpen();
      normalizeCancelRequest(operation, options);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.reject(bindingNotConnectedError("cancel"));
  }

  public nextEvent(options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.reject(bindingNotConnectedError("nextEvent"));
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
      throw closedError("client session");
    }
  }
}

export interface NnrpServerState {
  readonly endpoint: string;
  readonly runtime: NnrpBackendRuntime;
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
    this.#ensureOpen();
    return Promise.reject(bindingNotConnectedError("accept"));
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

export class NnrpServerSession {
  #closed = false;

  public receive(options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.reject(bindingNotConnectedError("receive"));
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

export function resolveNativeLibraryPath(options: NativeRuntimeOptions = {}): string {
  const env = options.env ?? process.env;
  const explicit = options.libraryPath ?? options.nativeLibrary?.path ?? env.NNRP_NATIVE_LIBRARY;

  if (explicit && explicit.length > 0) {
    return explicit;
  }

  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const suffix = nativeLibrarySuffix(platform);
  const artifactDir = options.nativeLibrary?.artifactDir ?? "native";

  return `${artifactDir}/${platform}-${arch}/nnrp_ffi.${suffix}`;
}

export function createNativeRuntimeBinding(options: NativeRuntimeOptions = {}): NativeRuntimeBinding {
  return {
    manifest: createBackendNativeManifest(),
    libraryPath: resolveNativeLibraryPath(options),
    requiredSymbols: [...(options.nativeLibrary?.requiredSymbols ?? [])],
  };
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

type NodePlatform = NodeJS.Platform;

type NodeArchitecture = NodeJS.Architecture;
