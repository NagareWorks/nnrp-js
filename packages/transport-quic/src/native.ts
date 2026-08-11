import {
  decodeSessionOpenMetadata,
  type NnrpDiagnostic,
  type NnrpNativeTransportBinding,
  type NnrpSchemaDescriptorHeader,
  type NnrpSessionOpenMetadata,
  type NnrpTransportAcceptOptions,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportProbeMetrics,
  type NnrpTransportProbeOptions,
  type NnrpTransportReceiveOptions,
  type NnrpTransportServer,
} from "@nnrp/core";

const TRANSPORT_ID = 1;
const TRANSPORT_KIND = "quic" as const;
const TRANSPORT_LABEL = "QUIC";
const PACKAGE_NAME = "nnrp-ffi-transport-quic";
const TRANSPORT_SCOPE = "quic";
const DEFAULT_ENDPOINT_SCHEME: string | undefined = "quic";
const HANDLE_KIND_INVALID = 0;
const HANDLE_KIND_BUFFER = 5;
const HANDLE_KIND_CONNECTION = 10;
const HANDLE_KIND_LISTENER = 11;
const HANDLE_KIND_SECURITY_CONFIG = 12;
const HANDLE_KIND_SERVER_ACCEPT = 13;
const ABI_VERSION = "4.4.0";
const HANDLE_SIZE = 24;
const BUFFER_VIEW_SIZE = 16;
const STATUS_SIZE = 16;
const ROLE_EVENT_SIZE = 200;
const CLIENT_ROLE_ADOPT = Symbol.for("nnrp.internal.native.client-role-adopt.v1");
const SERVER_ROLE_ADOPT = Symbol.for("nnrp.internal.native.server-role-adopt.v1");

const HANDLE_STRUCT = { struct: ["u32", "u64", "u32", "u32"] } as const;
const BUFFER_VIEW_STRUCT = { struct: ["pointer", "usize"] } as const;
const U16_SLICE_STRUCT = { struct: ["pointer", "usize"] } as const;
const U32_SLICE_STRUCT = { struct: ["pointer", "usize"] } as const;
const STATUS_STRUCT = { struct: ["u32", "u32", "u32", "u32"] } as const;
const SERVER_POLICY_CALLBACK_DEFINITION = {
  parameters: ["pointer", "u64", BUFFER_VIEW_STRUCT],
  result: "u32",
} as const;
const SERVER_POLICY_SINK_STRUCT = { struct: ["pointer", "pointer"] } as const;
const SERVER_POLICY_DECISION_STRUCT = {
  struct: ["u8", "u8", "u8", "u8", "u32", BUFFER_VIEW_STRUCT],
} as const;
const SERVER_POLICY_COMPLETE_REQUEST_STRUCT = { struct: ["u64", SERVER_POLICY_DECISION_STRUCT] } as const;
const SCHEMA_DESCRIPTOR_HEADER_STRUCT = {
  struct: ["u32", "u32", "u16", "u16", "u8", "u8", "u16", "u32", "u16", "u16", "u64"],
} as const;
const OPEN_REQUEST_STRUCT = {
  struct: ["u32", "u32", BUFFER_VIEW_STRUCT, HANDLE_STRUCT, "u64", "u32", "u32"],
} as const;
const ACCEPT_REQUEST_STRUCT = { struct: [HANDLE_STRUCT, "u32", "u32"] } as const;
const WRITE_BATCH_REQUEST_STRUCT = { struct: [HANDLE_STRUCT, "pointer", "u32", "u32"] } as const;
const READ_BATCH_REQUEST_STRUCT = { struct: [HANDLE_STRUCT, "u32", "u32", "u64"] } as const;
const PROBE_REQUEST_STRUCT = { struct: [OPEN_REQUEST_STRUCT, "u32", "u32"] } as const;
const SECURITY_CONFIG_REQUEST_STRUCT = {
  struct: ["u32", "u32", BUFFER_VIEW_STRUCT, BUFFER_VIEW_STRUCT],
} as const;
const CLIENT_CONNECT_REQUEST_STRUCT = { struct: ["u64", "u32", "u32", HANDLE_STRUCT] } as const;
const SERVER_BIND_REQUEST_STRUCT = {
  struct: [
    "u64",
    "u32",
    "u32",
    HANDLE_STRUCT,
    U16_SLICE_STRUCT,
    U32_SLICE_STRUCT,
    "u64",
    "u32",
    "u32",
    "u16",
    "u16",
    "u32",
    "u32",
    HANDLE_STRUCT,
    SERVER_POLICY_SINK_STRUCT,
  ],
} as const;
const SESSION_OPEN_REQUEST_STRUCT = {
  struct: [
    HANDLE_STRUCT,
    "u32",
    "u64",
    "u32",
    "u16",
    "u8",
    "u8",
    "u32",
    "u32",
    "u32",
    "u16",
    "u16",
    "u32",
    "u32",
    U32_SLICE_STRUCT,
  ],
} as const;
const SESSION_RESUME_REQUEST_STRUCT = { struct: [SESSION_OPEN_REQUEST_STRUCT, BUFFER_VIEW_STRUCT] } as const;
const SUBMIT_REQUEST_STRUCT = {
  struct: [HANDLE_STRUCT, "u64", "u32", "u32", "u16", "u16", "u64", BUFFER_VIEW_STRUCT],
} as const;
const ROLE_EVENT_POLL_REQUEST_STRUCT = {
  struct: [HANDLE_STRUCT, "u32", "u32", "u32", "u32"],
} as const;
const SERVER_ACCEPT_REQUEST_STRUCT = { struct: [HANDLE_STRUCT, "u64", "u32", "u32"] } as const;
const SERVER_ACCEPT_WAIT_REQUEST_STRUCT = { struct: [HANDLE_STRUCT, "u32", "u32"] } as const;
const SERVER_SEND_RESULT_REQUEST_STRUCT = { struct: [HANDLE_STRUCT, BUFFER_VIEW_STRUCT] } as const;
const RUNTIME_FRAME_SEND_REQUEST_STRUCT = {
  struct: [HANDLE_STRUCT, "u32", "u32", BUFFER_VIEW_STRUCT],
} as const;

const DENO_TRANSPORT_SYMBOLS = {
  nnrp_transport_client_security_config_create: {
    parameters: [SECURITY_CONFIG_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
  },
  nnrp_transport_server_security_config_create: {
    parameters: [SECURITY_CONFIG_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
  },
  nnrp_transport_probe: {
    parameters: [PROBE_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_transport_connect: {
    parameters: [OPEN_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_transport_listen: {
    parameters: [OPEN_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_transport_listener_endpoint: {
    parameters: [HANDLE_STRUCT, "buffer", "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_transport_accept: {
    parameters: [ACCEPT_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_transport_write_batch: {
    parameters: [WRITE_BATCH_REQUEST_STRUCT],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_transport_read_batch: {
    parameters: [READ_BATCH_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_transport_close: { parameters: [HANDLE_STRUCT], result: STATUS_STRUCT },
  nnrp_transport_runtime_shutdown: { parameters: [], result: STATUS_STRUCT },
  nnrp_buffer_release: { parameters: [HANDLE_STRUCT], result: STATUS_STRUCT },
  nnrp_client_connect: {
    parameters: [CLIENT_CONNECT_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_client_open_session: {
    parameters: [SESSION_OPEN_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_session_id: { parameters: [HANDLE_STRUCT, "buffer"], result: STATUS_STRUCT },
  nnrp_client_resume_session: {
    parameters: [SESSION_RESUME_REQUEST_STRUCT, "buffer", "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_client_session_recovery_ticket: {
    parameters: [HANDLE_STRUCT, "buffer", "buffer"],
    result: STATUS_STRUCT,
  },
  nnrp_client_submit: {
    parameters: [SUBMIT_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_client_await_events: {
    parameters: [ROLE_EVENT_POLL_REQUEST_STRUCT, "buffer", "usize", "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_client_close: { parameters: [HANDLE_STRUCT], result: STATUS_STRUCT, nonblocking: true },
  nnrp_connection_close: { parameters: [HANDLE_STRUCT], result: STATUS_STRUCT, nonblocking: true },
  nnrp_client_close_connection: { parameters: [HANDLE_STRUCT], result: STATUS_STRUCT, nonblocking: true },
  nnrp_server_bind: {
    parameters: [SERVER_BIND_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_schema_registry_create: { parameters: ["buffer"], result: STATUS_STRUCT },
  nnrp_schema_registry_install: {
    parameters: [HANDLE_STRUCT, SCHEMA_DESCRIPTOR_HEADER_STRUCT, "buffer"],
    result: STATUS_STRUCT,
  },
  nnrp_schema_registry_release: { parameters: [HANDLE_STRUCT], result: STATUS_STRUCT },
  nnrp_server_policy_complete: {
    parameters: [SERVER_POLICY_COMPLETE_REQUEST_STRUCT],
    result: STATUS_STRUCT,
  },
  nnrp_server_accept_begin: {
    parameters: [SERVER_ACCEPT_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
  },
  nnrp_server_accept_wait: {
    parameters: [SERVER_ACCEPT_WAIT_REQUEST_STRUCT],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_server_accept_claim: {
    parameters: [SERVER_ACCEPT_REQUEST_STRUCT, "buffer"],
    result: STATUS_STRUCT,
  },
  nnrp_server_accept_release: { parameters: [HANDLE_STRUCT], result: STATUS_STRUCT },
  nnrp_server_await_events: {
    parameters: [ROLE_EVENT_POLL_REQUEST_STRUCT, "buffer", "usize", "buffer"],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_server_send_result: {
    parameters: [SERVER_SEND_RESULT_REQUEST_STRUCT],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
  nnrp_server_close: { parameters: [HANDLE_STRUCT], result: STATUS_STRUCT, nonblocking: true },
  nnrp_runtime_frame_send: {
    parameters: [RUNTIME_FRAME_SEND_REQUEST_STRUCT],
    result: STATUS_STRUCT,
    nonblocking: true,
  },
} as const;

interface DenoTransportSymbols {
  nnrp_transport_client_security_config_create(request: Uint8Array, output: Uint8Array): Uint8Array;
  nnrp_transport_server_security_config_create(request: Uint8Array, output: Uint8Array): Uint8Array;
  nnrp_transport_probe(request: Uint8Array, output: Uint8Array): Promise<Uint8Array>;
  nnrp_transport_connect(request: Uint8Array, output: Uint8Array): Promise<Uint8Array>;
  nnrp_transport_listen(request: Uint8Array, output: Uint8Array): Promise<Uint8Array>;
  nnrp_transport_listener_endpoint(
    listener: Uint8Array,
    owner: Uint8Array,
    endpoint: Uint8Array,
  ): Promise<Uint8Array>;
  nnrp_transport_accept(request: Uint8Array, output: Uint8Array): Promise<Uint8Array>;
  nnrp_transport_write_batch(request: Uint8Array): Promise<Uint8Array>;
  nnrp_transport_read_batch(request: Uint8Array, output: Uint8Array): Promise<Uint8Array>;
  nnrp_transport_close(handle: Uint8Array): Uint8Array;
  nnrp_transport_runtime_shutdown(): Uint8Array;
  nnrp_buffer_release(handle: Uint8Array): Uint8Array;
  nnrp_client_connect(request: Uint8Array, output: Uint8Array): Promise<Uint8Array>;
  nnrp_client_open_session(request: Uint8Array, output: Uint8Array): Promise<Uint8Array>;
  nnrp_session_id(session: Uint8Array, output: Uint8Array): Uint8Array;
  nnrp_client_resume_session(request: Uint8Array, output: Uint8Array, outcome: Uint8Array): Promise<Uint8Array>;
  nnrp_client_session_recovery_ticket(
    session: Uint8Array,
    owner: Uint8Array,
    ticket: Uint8Array,
  ): Uint8Array;
  nnrp_client_submit(request: Uint8Array, output: Uint8Array): Promise<Uint8Array>;
  nnrp_client_await_events(
    request: Uint8Array,
    events: Uint8Array,
    capacity: number,
    count: Uint8Array,
  ): Promise<Uint8Array>;
  nnrp_client_close(handle: Uint8Array): Promise<Uint8Array>;
  nnrp_connection_close(handle: Uint8Array): Promise<Uint8Array>;
  nnrp_client_close_connection(handle: Uint8Array): Promise<Uint8Array>;
  nnrp_server_bind(request: Uint8Array, output: Uint8Array): Promise<Uint8Array>;
  nnrp_schema_registry_create(output: Uint8Array): Uint8Array;
  nnrp_schema_registry_install(registry: Uint8Array, descriptor: Uint8Array, action: Uint8Array): Uint8Array;
  nnrp_schema_registry_release(registry: Uint8Array): Uint8Array;
  nnrp_server_policy_complete(request: Uint8Array): Uint8Array;
  nnrp_server_accept_begin(request: Uint8Array, output: Uint8Array): Uint8Array;
  nnrp_server_accept_wait(request: Uint8Array): Promise<Uint8Array>;
  nnrp_server_accept_claim(request: Uint8Array, output: Uint8Array): Uint8Array;
  nnrp_server_accept_release(accept: Uint8Array): Uint8Array;
  nnrp_server_await_events(
    request: Uint8Array,
    events: Uint8Array,
    capacity: number,
    count: Uint8Array,
  ): Promise<Uint8Array>;
  nnrp_server_send_result(request: Uint8Array): Promise<Uint8Array>;
  nnrp_server_close(handle: Uint8Array): Promise<Uint8Array>;
  nnrp_runtime_frame_send(request: Uint8Array): Promise<Uint8Array>;
}

interface DenoTransportLibrary {
  readonly symbols: DenoTransportSymbols;
  close(): void;
}

interface DenoRuntime {
  readonly build: { readonly os: string; readonly arch: string };
  readonly UnsafePointer: {
    of(payload: Uint8Array<ArrayBuffer>): unknown;
    create(address: bigint): unknown;
    value(pointer: unknown): bigint;
  };
  readonly UnsafePointerView: new (pointer: unknown) => {
    getArrayBuffer(byteLength: number, offset?: number): ArrayBuffer;
  };
  readonly UnsafeCallback: new (
    definition: typeof SERVER_POLICY_CALLBACK_DEFINITION,
    callback: (userData: unknown, requestId: bigint, metadata: Uint8Array) => number,
  ) => {
    readonly pointer: unknown;
    close(): void;
  };
  readTextFileSync(path: string): string;
  statSync(path: string): { isFile: boolean };
  dlopen(path: string, symbols: typeof DENO_TRANSPORT_SYMBOLS): DenoTransportLibrary;
}

interface FfiHandle {
  readonly kind: number;
  readonly id: bigint;
  readonly generation: number;
  readonly flags: number;
}

interface InternalServerPolicyDecision {
  readonly accepted: boolean;
  readonly sessionErrorCode: number;
  readonly diagnostic?: string;
}

interface InternalServerRoleOptions {
  readonly supportedProfiles: readonly number[];
  readonly supportedCacheObjects: readonly number[];
  readonly maxCacheObjects: bigint;
  readonly maxCacheObjectBytes: number;
  readonly schemaDescriptors: readonly NnrpSchemaDescriptorHeader[];
  readonly resumeTokenBytes: number;
  readonly maxInFlightOperations: number;
  readonly grantedOperationCredit: number;
  readonly leaseTtlMs: number;
  readonly resumeWindowMs: number;
  readonly evaluateSession?: (open: NnrpSessionOpenMetadata) => Promise<InternalServerPolicyDecision>;
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

interface InternalRoleEvent {
  readonly kind: number;
  readonly headerPresent: boolean;
  readonly messageType: number;
  readonly versionMajor: number;
  readonly wireFormat: number;
  readonly headerFlags: number;
  readonly wireSessionId: number;
  readonly connection: FfiHandle;
  readonly session: FfiHandle;
  readonly operation: FfiHandle;
  readonly relatedOperationId: bigint;
  readonly relatedFrameId: number;
  readonly frameId: number;
  readonly viewId: number;
  readonly routeId: number;
  readonly traceId: bigint;
  readonly payload: Uint8Array;
}

interface PackagedBindingResult {
  readonly binding?: NnrpNativeTransportBinding;
  readonly diagnostic?: NnrpDiagnostic;
}

let cachedBinding: PackagedBindingResult | undefined;

export function loadPackagedQuicBinding(): PackagedBindingResult {
  if (cachedBinding !== undefined) return cachedBinding;
  try {
    cachedBinding = { binding: hasDenoFfi() ? loadLazyDenoQuicBinding() : loadLazyNodeQuicBinding() };
  } catch (cause) {
    cachedBinding = {
      diagnostic: {
        code: "NNRP_QUIC_NATIVE_ARTIFACT_UNAVAILABLE",
        message: cause instanceof Error ? cause.message : "QUIC native artifact could not be loaded.",
        source: "transport",
        retryable: false,
        transport: "quic",
        cause,
      },
    };
  }
  return cachedBinding;
}

function loadLazyDenoQuicBinding(): NnrpNativeTransportBinding {
  const runtime = denoRuntime();
  const platform = nativePlatform(runtime.build.os, runtime.build.arch);
  const manifestUrl = new URL(`../native/${platform.tag}/manifest.json`, import.meta.url);
  const manifest = JSON.parse(runtime.readTextFileSync(fileURLToPath(manifestUrl))) as unknown;
  const libraryName = validateManifest(manifest, platform.os, platform.arch);
  const libraryPath = fileURLToPath(new URL(`../native/${platform.tag}/${libraryName}`, import.meta.url));
  if (!runtime.statSync(libraryPath).isFile) throw new Error(`QUIC native library is not a file: ${libraryPath}`);
  let binding: NnrpNativeTransportBinding | undefined;
  const load = () => binding ??= loadDenoQuicBinding(runtime, libraryPath);
  return {
    mode: "deno-ffi",
    probe: async (options) => await load().probe(options),
    connect: async (options) => await load().connect(options),
    listen: async (options) => await load().listen(options),
  };
}

function loadLazyNodeQuicBinding(): NnrpNativeTransportBinding {
  const nodeProcess = (globalThis as typeof globalThis & {
    process?: { release?: { name?: string } };
  }).process;
  if (nodeProcess?.release?.name !== "node") {
    throw new Error("QUIC packaged native loading requires Node.js or Deno FFI.");
  }
  let binding: Promise<NnrpNativeTransportBinding> | undefined;
  const load = () => binding ??= import("./native-node.js").then((module) => module.loadNodeQuicBinding());
  return {
    mode: "managed-ffi",
    probe: async (options) => await (await load()).probe(options),
    connect: async (options) => await (await load()).connect(options),
    listen: async (options) => await (await load()).listen(options),
  };
}

function hasDenoFfi(): boolean {
  return typeof (globalThis as typeof globalThis & { Deno?: { dlopen?: unknown } }).Deno?.dlopen === "function";
}

function loadDenoQuicBinding(runtime: DenoRuntime, libraryPath: string): NnrpNativeTransportBinding {
  const library = runtime.dlopen(libraryPath, DENO_TRANSPORT_SYMBOLS);
  registerDenoRuntimeShutdown(library);
  return new DenoQuicBinding(library);
}

const denoRuntimeLibraries = new Set<DenoTransportLibrary>();
let denoRuntimeShutdownRegistered = false;

function registerDenoRuntimeShutdown(library: DenoTransportLibrary): void {
  denoRuntimeLibraries.add(library);
  if (denoRuntimeShutdownRegistered) return;
  denoRuntimeShutdownRegistered = true;
  const runtimeGlobal = globalThis as typeof globalThis & {
    addEventListener(type: "unload", listener: () => void): void;
  };
  runtimeGlobal.addEventListener("unload", () => {
    for (const runtimeLibrary of denoRuntimeLibraries) {
      try {
        const status = runtimeLibrary.symbols.nnrp_transport_runtime_shutdown();
        const view = dataView(status);
        if (view.getUint32(0, true) !== 0) {
          console.error(`${TRANSPORT_LABEL} native runtime shutdown failed with status ${view.getUint32(0, true)}.`);
        }
      } catch (error) {
        console.error(`${TRANSPORT_LABEL} native runtime shutdown threw: ${String(error)}.`);
      } finally {
        try {
          runtimeLibrary.close();
        } catch (error) {
          console.error(`${TRANSPORT_LABEL} native library close threw: ${String(error)}.`);
        }
      }
    }
    denoRuntimeLibraries.clear();
  });
}

class DenoQuicBinding implements NnrpNativeTransportBinding {
  readonly mode = "deno-ffi" as const;

  constructor(readonly library: DenoTransportLibrary) {}

  async probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics> {
    const endpoint = endpointBytes(options.endpoint, "probe");
    return await withTransportSecurityConfig(this.library, options, "client", async (config) => {
      const request = packProbeRequest(options, endpoint, config);
      const output = bytes(24);
      assertStatus(await this.library.symbols.nnrp_transport_probe(request, output), "transport probe");
      const view = dataView(output);
      return {
        sampleCount: view.getUint32(0, true),
        successCount: view.getUint32(4, true),
        medianThroughputBytesPerSecond: view.getBigUint64(8, true),
        medianRttMicroseconds: view.getBigUint64(16, true),
      };
    });
  }

  async connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection> {
    const endpoint = endpointBytes(options.endpoint, "connect");
    return await withTransportSecurityConfig(this.library, options, "client", async (config) => {
      const output = bytes(HANDLE_SIZE);
      assertStatus(
        await this.library.symbols.nnrp_transport_connect(packOpenRequest(options, endpoint, config), output),
        "transport connect",
      );
      return new DenoQuicConnection(
        this.library,
        decodeHandle(output, HANDLE_KIND_CONNECTION),
        String(options.endpoint),
      );
    });
  }

  async listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer> {
    const endpoint = endpointBytes(options.endpoint, "listen");
    return await withTransportSecurityConfig(this.library, options, "server", async (config) => {
      const output = bytes(HANDLE_SIZE);
      assertStatus(
        await this.library.symbols.nnrp_transport_listen(packOpenRequest(options, endpoint, config), output),
        "transport listen",
      );
      const handle = decodeHandle(output, HANDLE_KIND_LISTENER);
      try {
        const boundEndpoint = await readListenerEndpoint(this.library, handle);
        return new DenoQuicServer(this.library, handle, boundEndpoint);
      } catch (error) {
        closeHandle(this.library, handle, "transport listener cleanup");
        throw error;
      }
    });
  }
}

class DenoQuicConnection implements NnrpTransportConnection {
  readonly kind = TRANSPORT_KIND;
  #closed = false;

  constructor(
    readonly library: DenoTransportLibrary,
    readonly handle: FfiHandle,
    readonly endpoint: string,
  ) {}

  get connected(): boolean {
    return !this.#closed;
  }

  async send(packets: Uint8Array | readonly Uint8Array[]): Promise<void> {
    this.#requireOpen();
    const payloads = normalizePackets(packets);
    const views = bytes(BUFFER_VIEW_SIZE * payloads.length);
    const view = dataView(views);
    for (const [index, packet] of payloads.entries()) writeBufferView(view, index * BUFFER_VIEW_SIZE, packet);
    const request = bytes(40);
    const requestView = dataView(request);
    writeHandle(requestView, 0, this.handle);
    writePointer(requestView, 24, views);
    requestView.setUint32(32, payloads.length, true);
    assertStatus(await this.library.symbols.nnrp_transport_write_batch(request), "transport write batch");
  }

  async receive(options: NnrpTransportReceiveOptions = {}): Promise<readonly Uint8Array[]> {
    this.#requireOpen();
    const request = bytes(40);
    const view = dataView(request);
    writeHandle(view, 0, this.handle);
    view.setUint32(24, boundedU32("maxPackets", options.maxPackets ?? 0), true);
    view.setUint32(28, boundedU32("timeoutMillis", options.timeoutMillis ?? 0), true);
    view.setBigUint64(32, boundedU64("maxBytes", options.maxBytes ?? 0n), true);
    const output = bytes(48);
    assertStatus(await this.library.symbols.nnrp_transport_read_batch(request, output), "transport read batch");
    const owner = decodeHandle(output.subarray(0, HANDLE_SIZE));
    try {
      if (owner.kind !== HANDLE_KIND_INVALID && owner.kind !== HANDLE_KIND_BUFFER) {
        throw transportError("NNRP_QUIC_NATIVE_OWNER_INVALID", `Transport returned owner handle kind ${owner.kind}.`);
      }
      const outputView = dataView(output);
      const payload = copyNativeBytes(outputView.getBigUint64(24, true), outputView.getBigUint64(32, true));
      return decodePacketBatch(payload, outputView.getUint32(40, true));
    } finally {
      if (owner.kind === HANDLE_KIND_BUFFER) releaseBuffer(this.library, owner);
    }
  }

  async [CLIENT_ROLE_ADOPT](connectionId: bigint, generation: number): Promise<DenoClientRoleConnection> {
    this.#requireOpen();
    const output = bytes(HANDLE_SIZE);
    const request = bytes(40);
    const view = dataView(request);
    view.setBigUint64(0, connectionId, true);
    view.setUint32(8, generation, true);
    writeHandle(view, 16, this.handle);
    assertStatus(await this.library.symbols.nnrp_client_connect(request, output), "client role adoption");
    this.#closed = true;
    return new DenoClientRoleConnection(this.library, decodeHandle(output));
  }

  close(): void {
    if (this.#closed) return;
    closeHandle(this.library, this.handle, "transport connection close");
    this.#closed = true;
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_QUIC_CONNECTION_CLOSED", "QUIC connection is closed.");
  }
}

class DenoQuicServer implements NnrpTransportServer {
  readonly kind = TRANSPORT_KIND;
  #closed = false;

  constructor(
    readonly library: DenoTransportLibrary,
    readonly handle: FfiHandle,
    readonly endpoint: string,
  ) {}

  get listening(): boolean {
    return !this.#closed;
  }

  async accept(options: NnrpTransportAcceptOptions = {}): Promise<NnrpTransportConnection> {
    if (this.#closed) throw transportError("NNRP_QUIC_LISTENER_CLOSED", "QUIC listener is closed.");
    const request = bytes(32);
    const view = dataView(request);
    writeHandle(view, 0, this.handle);
    view.setUint32(24, boundedU32("timeoutMillis", options.timeoutMillis ?? 0), true);
    const output = bytes(HANDLE_SIZE);
    assertStatus(await this.library.symbols.nnrp_transport_accept(request, output), "transport accept");
    return new DenoQuicConnection(this.library, decodeHandle(output, HANDLE_KIND_CONNECTION), this.endpoint);
  }

  async [SERVER_ROLE_ADOPT](
    serverId: bigint,
    generation: number,
    options: InternalServerRoleOptions,
  ): Promise<DenoServerRole> {
    if (this.#closed) throw transportError("NNRP_QUIC_LISTENER_CLOSED", "QUIC listener is closed.");
    const output = bytes(HANDLE_SIZE);
    const request = bytes(144);
    const view = dataView(request);
    view.setBigUint64(0, serverId, true);
    view.setUint32(8, generation, true);
    writeHandle(view, 16, this.handle);
    const profiles = u16Bytes(options.supportedProfiles);
    const cacheObjects = u32Bytes(options.supportedCacheObjects);
    writeBufferView(view, 40, profiles);
    view.setBigUint64(48, BigInt(options.supportedProfiles.length), true);
    writeBufferView(view, 56, cacheObjects);
    view.setBigUint64(64, BigInt(options.supportedCacheObjects.length), true);
    view.setBigUint64(72, options.maxCacheObjects, true);
    view.setUint32(80, options.maxCacheObjectBytes, true);
    view.setUint32(84, options.resumeTokenBytes, true);
    view.setUint16(88, options.maxInFlightOperations, true);
    view.setUint16(90, options.grantedOperationCredit, true);
    view.setUint32(92, options.leaseTtlMs, true);
    view.setUint32(96, options.resumeWindowMs, true);
    const schemaRegistry = createDenoSchemaRegistry(this.library, options.schemaDescriptors);
    writeHandle(view, 104, schemaRegistry);
    let policyCallback: InstanceType<DenoRuntime["UnsafeCallback"]> | undefined;
    try {
      policyCallback = registerDenoServerPolicy(this.library, options.evaluateSession);
      if (policyCallback !== undefined) {
        view.setBigUint64(136, denoRuntime().UnsafePointer.value(policyCallback.pointer), true);
      }
      assertStatus(await this.library.symbols.nnrp_server_bind(request, output), "server role adoption");
    } catch (error) {
      policyCallback?.close();
      throw error;
    } finally {
      assertStatus(
        this.library.symbols.nnrp_schema_registry_release(packHandle(schemaRegistry)),
        "schema registry release",
      );
    }
    this.#closed = true;
    return new DenoServerRole(this.library, decodeHandle(output), policyCallback);
  }

  close(): void {
    if (this.#closed) return;
    closeHandle(this.library, this.handle, "transport listener close");
    this.#closed = true;
  }
}

class DenoClientRoleConnection {
  #closed = false;

  constructor(readonly library: DenoTransportLibrary, readonly handle: FfiHandle) {}

  async openSession(options: InternalClientSessionOpenOptions): Promise<DenoClientRoleSession> {
    this.#requireOpen();
    const output = bytes(HANDLE_SIZE);
    const cacheHints = u32Bytes(options.cacheHints);
    const request = packSessionOpenRequest(this.handle, options, cacheHints);
    assertStatus(await this.library.symbols.nnrp_client_open_session(request, output), "client session open");
    const handle = decodeHandle(output);
    return new DenoClientRoleSession(this.library, handle, readDenoSessionId(this.library, handle));
  }

  async resumeSession(
    options: InternalClientSessionOpenOptions,
    recoveryTicket: Uint8Array,
  ): Promise<DenoClientRoleSession> {
    this.#requireOpen();
    const ticket = recoveryTicket.slice() as Uint8Array<ArrayBuffer>;
    const cacheHints = u32Bytes(options.cacheHints);
    const request = bytes(104);
    request.set(packSessionOpenRequest(this.handle, options, cacheHints));
    writeBufferView(dataView(request), 88, ticket);
    const output = bytes(HANDLE_SIZE);
    const outcome = bytes(8);
    assertStatus(
      await this.library.symbols.nnrp_client_resume_session(request, output, outcome),
      "client session resume",
    );
    const handle = decodeHandle(output);
    return new DenoClientRoleSession(this.library, handle, readDenoSessionId(this.library, handle));
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    assertStatus(
      await this.library.symbols.nnrp_client_close_connection(packHandle(this.handle)),
      "client connection close",
    );
    this.#closed = true;
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_CLIENT_CONNECTION_CLOSED", "Native client role connection is closed.");
  }
}

class DenoClientRoleSession {
  #closed = false;

  constructor(
    readonly library: DenoTransportLibrary,
    readonly handle: FfiHandle,
    readonly sessionId: number,
  ) {}

  async submit(
    operationId: bigint,
    frameId: number,
    headerFlags: number,
    viewId: number,
    routeId: number,
    traceId: bigint,
    payload: Uint8Array,
  ): Promise<FfiHandle> {
    this.#requireOpen();
    const output = bytes(HANDLE_SIZE);
    const request = bytes(72);
    const view = dataView(request);
    writeHandle(view, 0, this.handle);
    view.setBigUint64(24, operationId, true);
    view.setUint32(32, frameId, true);
    view.setUint32(36, headerFlags, true);
    view.setUint16(40, viewId, true);
    view.setUint16(42, routeId, true);
    view.setBigUint64(48, traceId, true);
    writeBufferView(view, 56, new Uint8Array(payload));
    assertStatus(await this.library.symbols.nnrp_client_submit(request, output), "client submit");
    return decodeHandle(output);
  }

  async poll(maxEvents: number, timeoutMillis: number): Promise<readonly InternalRoleEvent[]> {
    this.#requireOpen();
    return await pollRoleEvents(this.library, "client", this.handle, maxEvents, timeoutMillis);
  }

  async sendRuntimeFrame(messageType: number, frameId: number, payload: Uint8Array): Promise<void> {
    this.#requireOpen();
    assertStatus(
      await this.library.symbols.nnrp_runtime_frame_send(
        packRuntimeFrameRequest(this.handle, messageType, frameId, payload),
      ),
      "client runtime frame send",
    );
  }

  recoveryTicket(): Uint8Array | undefined {
    this.#requireOpen();
    const ownerOutput = bytes(HANDLE_SIZE);
    const ticketOutput = bytes(BUFFER_VIEW_SIZE);
    const status = this.library.symbols.nnrp_client_session_recovery_ticket(
      packHandle(this.handle),
      ownerOutput,
      ticketOutput,
    );
    if (statusCode(status) === 4) return undefined;
    assertStatus(status, "client recovery ticket snapshot");
    const owner = decodeHandle(ownerOutput, HANDLE_KIND_BUFFER);
    try {
      const view = dataView(ticketOutput);
      return copyNativeBytes(view.getBigUint64(0, true), view.getBigUint64(8, true));
    } finally {
      assertStatus(this.library.symbols.nnrp_buffer_release(packHandle(owner)), "client recovery ticket release");
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    assertStatus(await this.library.symbols.nnrp_client_close(packHandle(this.handle)), "client session close");
    this.#closed = true;
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_CLIENT_SESSION_CLOSED", "Native client role session is closed.");
  }
}

function createDenoSchemaRegistry(
  library: DenoTransportLibrary,
  descriptors: readonly NnrpSchemaDescriptorHeader[],
): FfiHandle {
  const output = bytes(HANDLE_SIZE);
  assertStatus(library.symbols.nnrp_schema_registry_create(output), "schema registry create");
  const registry = decodeHandle(output);
  try {
    for (const descriptor of descriptors) {
      const action = bytes(4);
      assertStatus(
        library.symbols.nnrp_schema_registry_install(
          packHandle(registry),
          packSchemaDescriptor(descriptor),
          action,
        ),
        "schema registry install",
      );
    }
    return registry;
  } catch (error) {
    assertStatus(library.symbols.nnrp_schema_registry_release(packHandle(registry)), "schema registry release");
    throw error;
  }
}

function packSchemaDescriptor(descriptor: NnrpSchemaDescriptorHeader): Uint8Array<ArrayBuffer> {
  const packed = bytes(32);
  const view = dataView(packed);
  view.setUint32(0, descriptor.schemaId, true);
  view.setUint32(4, descriptor.schemaVersion, true);
  view.setUint16(8, descriptor.profileId, true);
  view.setUint16(10, descriptor.schemaFlags, true);
  view.setUint8(12, descriptor.minVersionMajor);
  view.setUint8(13, descriptor.maxVersionMajor);
  view.setUint32(16, descriptor.bodyBytes, true);
  view.setUint16(20, descriptor.dependencyCount, true);
  view.setUint16(22, descriptor.defaultStreamSemantics, true);
  view.setBigUint64(24, descriptor.schemaHash, true);
  return packed;
}

function registerDenoServerPolicy(
  library: DenoTransportLibrary,
  evaluateSession: InternalServerRoleOptions["evaluateSession"],
): InstanceType<DenoRuntime["UnsafeCallback"]> | undefined {
  if (evaluateSession === undefined) return undefined;
  return new (denoRuntime().UnsafeCallback)(SERVER_POLICY_CALLBACK_DEFINITION, (_userData, requestId, metadata) => {
    const metadataView = dataView(metadata);
    let evaluation: Promise<InternalServerPolicyDecision>;
    try {
      evaluation = evaluateSession(
        decodeSessionOpenMetadata(
          copyNativeBytes(metadataView.getBigUint64(0, true), metadataView.getBigUint64(8, true)),
        ),
      );
    } catch (error) {
      evaluation = Promise.reject(error);
    }
    void evaluation.then(
      (decision) => completeDenoServerPolicy(library, requestId, decision),
      (error) =>
        completeDenoServerPolicy(library, requestId, {
          accepted: false,
          sessionErrorCode: 0x0001_0007,
          diagnostic: error instanceof Error ? error.message : "Application policy evaluation failed.",
        }),
    );
    return 0;
  });
}

function completeDenoServerPolicy(
  library: DenoTransportLibrary,
  requestId: bigint,
  decision: InternalServerPolicyDecision,
): void {
  const diagnostic = new TextEncoder().encode(decision.diagnostic ?? "") as Uint8Array<ArrayBuffer>;
  const request = bytes(32);
  const view = dataView(request);
  view.setBigUint64(0, requestId, true);
  view.setUint8(8, decision.accepted ? 1 : 0);
  view.setUint32(12, decision.sessionErrorCode, true);
  writeBufferView(view, 16, diagnostic);
  assertStatus(library.symbols.nnrp_server_policy_complete(request), "server policy completion");
}

function u16Bytes(values: readonly number[]): Uint8Array<ArrayBuffer> {
  const packed = bytes(values.length * 2);
  const view = dataView(packed);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return packed;
}

function u32Bytes(values: readonly number[]): Uint8Array<ArrayBuffer> {
  const packed = bytes(values.length * 4);
  const view = dataView(packed);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return packed;
}

class DenoServerRole {
  #closed = false;
  readonly #accepts = new Set<FfiHandle>();

  constructor(
    readonly library: DenoTransportLibrary,
    readonly handle: FfiHandle,
    readonly policyCallback: InstanceType<DenoRuntime["UnsafeCallback"]> | undefined,
  ) {}

  async accept(sessionHandleId: bigint, generation: number, timeoutMillis: number): Promise<DenoServerRoleSession> {
    this.#requireOpen();
    const beginOutput = bytes(HANDLE_SIZE);
    assertStatus(
      this.library.symbols.nnrp_server_accept_begin(
        packServerAcceptRequest(this.handle, sessionHandleId, generation, 0),
        beginOutput,
      ),
      "server session accept begin",
    );
    const accept = decodeHandle(beginOutput, HANDLE_KIND_SERVER_ACCEPT);
    this.#accepts.add(accept);
    try {
      while (true) {
        const status = await this.library.symbols.nnrp_server_accept_wait(
          packServerAcceptWaitRequest(accept, timeoutMillis),
        );
        if (timeoutMillis === 0 && statusCode(status) === 5) continue;
        assertStatus(status, "server session accept wait");
        break;
      }
      const output = bytes(32);
      assertStatus(
        this.library.symbols.nnrp_server_accept_claim(
          packServerAcceptRequest(accept, sessionHandleId, generation, 0),
          output,
        ),
        "server session accept claim",
      );
      this.#accepts.delete(accept);
      const handle = decodeHandle(output);
      return new DenoServerRoleSession(this.library, handle, readDenoSessionId(this.library, handle));
    } finally {
      if (this.#accepts.delete(accept)) {
        assertStatus(
          this.library.symbols.nnrp_server_accept_release(packHandle(accept)),
          "server session accept release",
        );
      }
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    for (const accept of this.#accepts) {
      assertStatus(
        this.library.symbols.nnrp_server_accept_release(packHandle(accept)),
        "server session accept release",
      );
    }
    this.#accepts.clear();
    try {
      assertStatus(await this.library.symbols.nnrp_connection_close(packHandle(this.handle)), "server close");
    } finally {
      this.policyCallback?.close();
    }
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_SERVER_CLOSED", "Native server role is closed.");
  }
}

function packServerAcceptRequest(
  handle: FfiHandle,
  id: bigint,
  generation: number,
  finalValue: number,
): Uint8Array<ArrayBuffer> {
  const request = bytes(40);
  const view = dataView(request);
  writeHandle(view, 0, handle);
  view.setBigUint64(24, id, true);
  view.setUint32(32, generation, true);
  view.setUint32(36, finalValue, true);
  return request;
}

function packServerAcceptWaitRequest(accept: FfiHandle, timeoutMillis: number): Uint8Array<ArrayBuffer> {
  const request = bytes(32);
  const view = dataView(request);
  writeHandle(view, 0, accept);
  view.setUint32(24, timeoutMillis, true);
  return request;
}

class DenoServerRoleSession {
  #closed = false;

  constructor(
    readonly library: DenoTransportLibrary,
    readonly handle: FfiHandle,
    readonly sessionId: number,
  ) {}

  async poll(maxEvents: number, timeoutMillis: number): Promise<readonly InternalRoleEvent[]> {
    this.#requireOpen();
    return await pollRoleEvents(this.library, "server", this.handle, maxEvents, timeoutMillis);
  }

  async sendResult(operation: FfiHandle, payload: Uint8Array): Promise<void> {
    this.#requireOpen();
    const request = bytes(40);
    const view = dataView(request);
    writeHandle(view, 0, operation);
    writeBufferView(view, 24, new Uint8Array(payload));
    assertStatus(await this.library.symbols.nnrp_server_send_result(request), "server result send");
  }

  async sendRuntimeFrame(handle: FfiHandle, messageType: number, frameId: number, payload: Uint8Array): Promise<void> {
    this.#requireOpen();
    assertStatus(
      await this.library.symbols.nnrp_runtime_frame_send(
        packRuntimeFrameRequest(handle, messageType, frameId, payload),
      ),
      "server runtime frame send",
    );
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    assertStatus(await this.library.symbols.nnrp_server_close(packHandle(this.handle)), "server session close");
    this.#closed = true;
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_SERVER_SESSION_CLOSED", "Native server role session is closed.");
  }
}

function packSessionOpenRequest(
  connection: FfiHandle,
  options: InternalClientSessionOpenOptions,
  cacheHints: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const request = bytes(88);
  const view = dataView(request);
  writeHandle(view, 0, connection);
  view.setUint32(24, options.requestedSessionId, true);
  view.setBigUint64(32, options.sessionHandleId, true);
  view.setUint32(40, options.generation, true);
  view.setUint16(44, options.profileId, true);
  view.setUint8(46, options.priorityClass);
  view.setUint8(47, options.allowResume ? 1 : 0);
  view.setUint32(48, options.schemaId, true);
  view.setUint32(52, options.schemaVersion, true);
  view.setUint32(56, options.defaultDeadlineMillis, true);
  view.setUint16(60, options.maxInFlightOperations, true);
  view.setUint32(64, options.leaseTtlHintMillis, true);
  view.setUint32(68, options.resumeTokenBytes, true);
  writeBufferView(view, 72, cacheHints);
  view.setBigUint64(80, BigInt(options.cacheHints.length), true);
  return request;
}

function packRuntimeFrameRequest(
  handle: FfiHandle,
  messageType: number,
  frameId: number,
  payload: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const request = bytes(48);
  const view = dataView(request);
  writeHandle(view, 0, handle);
  view.setUint32(24, messageType, true);
  view.setUint32(28, frameId, true);
  writeBufferView(view, 32, new Uint8Array(payload));
  return request;
}

async function pollRoleEvents(
  library: DenoTransportLibrary,
  role: "client" | "server",
  scope: FfiHandle,
  maxEvents: number,
  timeoutMillis: number,
): Promise<readonly InternalRoleEvent[]> {
  if (maxEvents === 0) return [];
  const request = bytes(40);
  const view = dataView(request);
  writeHandle(view, 0, scope);
  view.setUint32(24, maxEvents, true);
  view.setUint32(28, timeoutMillis, true);
  const output = bytes(ROLE_EVENT_SIZE * maxEvents);
  const count = bytes(8);
  const status = role === "client"
    ? await library.symbols.nnrp_client_await_events(request, output, maxEvents, count)
    : await library.symbols.nnrp_server_await_events(request, output, maxEvents, count);
  const statusCode = dataView(status).getUint32(0, true);
  if (statusCode === 5) return [];
  assertStatus(status, `${role} event poll`);
  const eventCount = Number(dataView(count).getBigUint64(0, true));
  const events: InternalRoleEvent[] = [];
  for (let index = 0; index < eventCount; index += 1) {
    const event = output.subarray(index * ROLE_EVENT_SIZE, (index + 1) * ROLE_EVENT_SIZE);
    events.push(copyRoleEvent(library, event));
  }
  return events;
}

function copyRoleEvent(library: DenoTransportLibrary, source: Uint8Array): InternalRoleEvent {
  const view = dataView(source);
  const owner = decodeHandle(source.subarray(112, 136));
  try {
    return {
      kind: view.getUint32(0, true),
      headerPresent: view.getUint8(8) !== 0,
      messageType: view.getUint8(11),
      versionMajor: view.getUint8(9),
      wireFormat: view.getUint8(10),
      headerFlags: view.getUint32(12, true),
      wireSessionId: view.getUint32(16, true),
      connection: decodeHandle(source.subarray(40, 64)),
      session: decodeHandle(source.subarray(64, 88)),
      operation: decodeHandle(source.subarray(88, 112)),
      relatedOperationId: view.getBigUint64(184, true),
      relatedFrameId: view.getUint32(192, true),
      frameId: view.getUint32(20, true),
      viewId: view.getUint16(24, true),
      routeId: view.getUint16(26, true),
      traceId: view.getBigUint64(32, true),
      payload: copyNativeBytes(view.getBigUint64(136, true), view.getBigUint64(144, true)),
    };
  } finally {
    if (owner.kind === HANDLE_KIND_BUFFER) releaseBuffer(library, owner);
  }
}

async function readListenerEndpoint(library: DenoTransportLibrary, listener: FfiHandle): Promise<string> {
  const ownerBytes = bytes(HANDLE_SIZE);
  const endpointView = bytes(BUFFER_VIEW_SIZE);
  assertStatus(
    await library.symbols.nnrp_transport_listener_endpoint(packHandle(listener), ownerBytes, endpointView),
    "transport listener endpoint",
  );
  const owner = decodeHandle(ownerBytes);
  try {
    if (owner.kind !== HANDLE_KIND_INVALID && owner.kind !== HANDLE_KIND_BUFFER) {
      throw transportError("NNRP_QUIC_NATIVE_OWNER_INVALID", `Transport returned owner handle kind ${owner.kind}.`);
    }
    const view = dataView(endpointView);
    return new TextDecoder().decode(copyNativeBytes(view.getBigUint64(0, true), view.getBigUint64(8, true)));
  } finally {
    if (owner.kind === HANDLE_KIND_BUFFER) releaseBuffer(library, owner);
  }
}

function packOpenRequest(
  options: NnrpTransportEndpoint,
  endpoint: Uint8Array<ArrayBuffer>,
  config: FfiHandle,
): Uint8Array<ArrayBuffer> {
  const request = bytes(64);
  const view = dataView(request);
  view.setUint32(0, TRANSPORT_ID, true);
  writeBufferView(view, 8, endpoint);
  writeHandle(view, 24, config);
  view.setBigUint64(48, boundedU64("maxPacketBytes", options.maxPacketBytes ?? 0n), true);
  view.setUint32(56, boundedU32("timeoutMillis", options.timeoutMillis ?? 0), true);
  return request;
}

function packProbeRequest(
  options: NnrpTransportProbeOptions,
  endpoint: Uint8Array<ArrayBuffer>,
  config: FfiHandle,
): Uint8Array<ArrayBuffer> {
  const request = bytes(72);
  request.set(packOpenRequest(options, endpoint, config), 0);
  const view = dataView(request);
  view.setUint32(64, boundedU32("sampleCount", options.sampleCount ?? 0), true);
  view.setUint32(68, boundedU32("payloadBytes", options.payloadBytes ?? 0), true);
  return request;
}

function endpointBytes(endpoint: string | URL, operation: string): Uint8Array<ArrayBuffer> {
  const value = nativeEndpoint(endpoint);
  if (value.length === 0) throw transportError("NNRP_QUIC_ENDPOINT_INVALID", `QUIC ${operation} endpoint is empty.`);
  return new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
}

function nativeEndpoint(endpoint: string | URL): string {
  const value = String(endpoint).trim();
  return value.length > 0 && !value.includes("://") && DEFAULT_ENDPOINT_SCHEME !== undefined
    ? `${DEFAULT_ENDPOINT_SCHEME}://${value}`
    : value;
}

async function withTransportSecurityConfig<T>(
  library: DenoTransportLibrary,
  options: NnrpTransportEndpoint,
  mode: "client" | "server",
  operation: (config: FfiHandle) => Promise<T>,
): Promise<T> {
  const config = createSecurityConfig(library, options, mode);
  try {
    return await operation(config);
  } finally {
    closeHandle(library, config, "transport security config close");
  }
}

function createSecurityConfig(
  library: DenoTransportLibrary,
  options: NnrpTransportEndpoint,
  mode: "client" | "server",
): FfiHandle {
  const security = options.security;
  if (security === undefined || security.mode !== mode) {
    throw transportError(
      "NNRP_SECURITY_REQUIRED",
      `${TRANSPORT_LABEL} ${mode} requires ${mode} security configuration.`,
    );
  }
  const first = security.mode === "client"
    ? new TextEncoder().encode(security.serverName)
    : security.certificateDer.slice();
  const second = security.mode === "client"
    ? security.trustedCertificateDer.slice()
    : security.privateKeyPkcs8Der.slice();
  if (first.byteLength === 0 || second.byteLength === 0) {
    throw transportError("NNRP_SECURITY_INVALID", `${TRANSPORT_LABEL} ${mode} security fields must be non-empty.`);
  }
  const request = bytes(40);
  const view = dataView(request);
  view.setUint32(0, TRANSPORT_ID, true);
  writeBufferView(view, 8, first as Uint8Array<ArrayBuffer>);
  writeBufferView(view, 24, second as Uint8Array<ArrayBuffer>);
  const output = bytes(HANDLE_SIZE);
  const status = mode === "client"
    ? library.symbols.nnrp_transport_client_security_config_create(request, output)
    : library.symbols.nnrp_transport_server_security_config_create(request, output);
  assertStatus(status, `transport ${mode} security config create`);
  return decodeHandle(output, HANDLE_KIND_SECURITY_CONFIG);
}

function normalizePackets(packets: Uint8Array | readonly Uint8Array[]): readonly Uint8Array<ArrayBuffer>[] {
  const values = packets instanceof Uint8Array ? [packets] : packets;
  if (values.length === 0) throw new TypeError("transport send requires at least one complete NNRP packet");
  return values.map((packet) => {
    if (!(packet instanceof Uint8Array) || packet.byteLength === 0) {
      throw new TypeError("transport send accepts non-empty Uint8Array packets only");
    }
    return packet.slice() as Uint8Array<ArrayBuffer>;
  });
}

function decodePacketBatch(payload: Uint8Array, frameCount: number): readonly Uint8Array[] {
  const packets: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; index < frameCount; index++) {
    if (offset + 4 > payload.byteLength) throw transportError("NNRP_QUIC_BATCH_INVALID", "Packet batch is truncated.");
    const length = new DataView(payload.buffer, payload.byteOffset + offset, 4).getUint32(0, true);
    offset += 4;
    if (offset + length > payload.byteLength) {
      throw transportError("NNRP_QUIC_BATCH_INVALID", "Packet payload is truncated.");
    }
    packets.push(payload.slice(offset, offset + length));
    offset += length;
  }
  if (offset !== payload.byteLength) {
    throw transportError("NNRP_QUIC_BATCH_INVALID", "Packet batch has trailing bytes.");
  }
  return packets;
}

function copyNativeBytes(address: bigint, lengthValue: bigint): Uint8Array {
  const length = Number(lengthValue);
  if (length === 0) return new Uint8Array();
  if (address === 0n || !Number.isSafeInteger(length) || length < 0) {
    throw transportError("NNRP_QUIC_NATIVE_BUFFER_INVALID", "Transport returned an invalid native buffer view.");
  }
  const runtime = denoRuntime();
  return new Uint8Array(new runtime.UnsafePointerView(runtime.UnsafePointer.create(address)).getArrayBuffer(length))
    .slice();
}

function releaseBuffer(library: DenoTransportLibrary, owner: FfiHandle): void {
  assertStatus(library.symbols.nnrp_buffer_release(packHandle(owner)), "transport buffer release");
}

function closeHandle(library: DenoTransportLibrary, handle: FfiHandle, operation: string): void {
  assertStatus(library.symbols.nnrp_transport_close(packHandle(handle)), operation);
}

function decodeHandle(source: Uint8Array, expectedKind?: number): FfiHandle {
  if (source.byteLength < HANDLE_SIZE) {
    throw transportError("NNRP_QUIC_NATIVE_HANDLE_INVALID", "Native handle is truncated.");
  }
  const view = dataView(source);
  const handle = {
    kind: view.getUint32(0, true),
    id: view.getBigUint64(8, true),
    generation: view.getUint32(16, true),
    flags: view.getUint32(20, true),
  };
  if (expectedKind !== undefined && (handle.kind !== expectedKind || handle.id === 0n || handle.generation === 0)) {
    throw transportError(
      "NNRP_QUIC_NATIVE_HANDLE_INVALID",
      `Expected native handle kind ${expectedKind}, got ${handle.kind}.`,
    );
  }
  return handle;
}

function packHandle(handle: FfiHandle): Uint8Array<ArrayBuffer> {
  const output = bytes(HANDLE_SIZE);
  writeHandle(dataView(output), 0, handle);
  return output;
}

function writeHandle(view: DataView, offset: number, handle: FfiHandle): void {
  view.setUint32(offset, handle.kind, true);
  view.setBigUint64(offset + 8, handle.id, true);
  view.setUint32(offset + 16, handle.generation, true);
  view.setUint32(offset + 20, handle.flags, true);
}

function writeBufferView(view: DataView, offset: number, payload: Uint8Array<ArrayBuffer>): void {
  writePointer(view, offset, payload);
  view.setBigUint64(offset + 8, BigInt(payload.byteLength), true);
}

function writePointer(view: DataView, offset: number, payload: Uint8Array<ArrayBuffer>): void {
  const pointer = payload.byteLength === 0
    ? 0n
    : denoRuntime().UnsafePointer.value(denoRuntime().UnsafePointer.of(payload));
  view.setBigUint64(offset, pointer, true);
}

function assertStatus(status: Uint8Array, operation: string): void {
  if (status.byteLength < STATUS_SIZE) {
    throw transportError("NNRP_FFI_STATUS_INVALID", `${operation} returned a short status.`);
  }
  const view = dataView(status);
  const code = view.getUint32(0, true);
  if (code !== 0) {
    throw transportError(
      "NNRP_FFI_STATUS_ERROR",
      `${operation} failed with status=${code}, family=${view.getUint32(4, true)}, protocol=${
        view.getUint32(8, true)
      }, detail=${view.getUint32(12, true)}.`,
      code === 5 || code === 6,
    );
  }
}

function statusCode(status: Uint8Array): number {
  return status.byteLength < STATUS_SIZE ? -1 : dataView(status).getUint32(0, true);
}

function readDenoSessionId(library: DenoTransportLibrary, session: FfiHandle): number {
  const output = bytes(4);
  assertStatus(library.symbols.nnrp_session_id(packHandle(session), output), "negotiated session id");
  return dataView(output).getUint32(0, true);
}

function validateManifest(value: unknown, os: string, arch: string): string {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${TRANSPORT_LABEL} native artifact manifest is not an object.`);
  }
  const manifest = value as Record<string, unknown>;
  if (manifest.package !== PACKAGE_NAME || manifest.transport_scope !== TRANSPORT_SCOPE) {
    throw new Error(`${TRANSPORT_LABEL} package contains an artifact for another transport scope.`);
  }
  if (manifest.abi_version !== ABI_VERSION) throw new Error(`${TRANSPORT_LABEL} artifact requires ABI ${ABI_VERSION}.`);
  if (manifest.os !== os || manifest.arch !== arch || manifest.library_kind !== "dynamic") {
    throw new Error(`${TRANSPORT_LABEL} artifact does not match ${os}/${arch} dynamic loading.`);
  }
  if (typeof manifest.library !== "string" || !/^[A-Za-z0-9_.-]+$/u.test(manifest.library)) {
    throw new Error(`${TRANSPORT_LABEL} artifact manifest has an invalid library name.`);
  }
  if (typeof manifest.source_archive_sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(manifest.source_archive_sha256)) {
    throw new Error(`${TRANSPORT_LABEL} artifact manifest has invalid checksum metadata.`);
  }
  const exports = Array.isArray(manifest.exports) ? manifest.exports : [];
  const missing = Object.keys(DENO_TRANSPORT_SYMBOLS)
    .filter((name) => name !== "nnrp_buffer_release")
    .filter((name) => !exports.includes(name));
  if (missing.length > 0) {
    throw new Error(`${TRANSPORT_LABEL} artifact is missing transport exports: ${missing.join(", ")}.`);
  }
  return manifest.library;
}

function nativePlatform(
  osValue: string,
  archValue: string,
): { readonly tag: string; readonly os: string; readonly arch: string } {
  const os = osValue === "darwin" ? "macos" : osValue;
  const arch = archValue === "arm64" ? "aarch64" : archValue;
  if (!(["windows", "macos", "linux"] as const).includes(os as "windows" | "macos" | "linux")) {
    throw new Error(`${TRANSPORT_LABEL} Deno FFI does not support ${osValue}.`);
  }
  if (!(["x86_64", "x86", "aarch64", "armv7"] as const).includes(arch as "x86_64" | "x86" | "aarch64" | "armv7")) {
    throw new Error(`${TRANSPORT_LABEL} Deno FFI does not support ${archValue}.`);
  }
  return { tag: `${os}-${arch}`, os, arch };
}

function denoRuntime(): DenoRuntime {
  const runtime = (globalThis as typeof globalThis & { readonly Deno?: DenoRuntime }).Deno;
  if (runtime === undefined || typeof runtime.dlopen !== "function") {
    throw new Error(`${TRANSPORT_LABEL} packaged native loading requires Deno FFI or an explicit managed binding.`);
  }
  return runtime;
}

function fileURLToPath(url: URL): string {
  const path = decodeURIComponent(url.pathname);
  return url.protocol === "file:" && /^\/[A-Za-z]:\//u.test(path) ? path.slice(1) : path;
}

function boundedU32(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${name} must fit u32`);
  return value;
}

function boundedU64(name: string, value: bigint): bigint {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new RangeError(`${name} must fit u64`);
  return value;
}

function bytes(size: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(size);
}

function dataView(source: Uint8Array): DataView {
  return new DataView(source.buffer, source.byteOffset, source.byteLength);
}

function transportError(code: string, message: string, retryable = false): NnrpTransportError {
  return new NnrpTransportError({
    code,
    message,
    source: "transport",
    retryable,
    transport: TRANSPORT_KIND,
  });
}
