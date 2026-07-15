import {
  type NnrpDiagnostic,
  type NnrpNativeTransportBinding,
  type NnrpTransportAcceptOptions,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportProbeMetrics,
  type NnrpTransportProbeOptions,
  type NnrpTransportReceiveOptions,
  type NnrpTransportServer,
} from "@nnrp/core";

const TRANSPORT_ID_TCP = 2;
const HANDLE_KIND_INVALID = 0;
const HANDLE_KIND_BUFFER = 5;
const HANDLE_KIND_CONNECTION = 10;
const HANDLE_KIND_LISTENER = 11;
const ABI_VERSION = "1.12.1";
const HANDLE_SIZE = 24;
const BUFFER_VIEW_SIZE = 16;
const STATUS_SIZE = 16;

const HANDLE_STRUCT = { struct: ["u32", "u64", "u32", "u32"] } as const;
const BUFFER_VIEW_STRUCT = { struct: ["pointer", "usize"] } as const;
const STATUS_STRUCT = { struct: ["u32", "u32", "u32", "u32"] } as const;
const OPEN_REQUEST_STRUCT = {
  struct: ["u32", "u32", BUFFER_VIEW_STRUCT, HANDLE_STRUCT, "u64", "u32", "u32"],
} as const;
const ACCEPT_REQUEST_STRUCT = { struct: [HANDLE_STRUCT, "u32", "u32"] } as const;
const WRITE_BATCH_REQUEST_STRUCT = { struct: [HANDLE_STRUCT, "pointer", "u32", "u32"] } as const;
const READ_BATCH_REQUEST_STRUCT = { struct: [HANDLE_STRUCT, "u32", "u32", "u64"] } as const;
const PROBE_REQUEST_STRUCT = { struct: [OPEN_REQUEST_STRUCT, "u32", "u32"] } as const;

const DENO_TRANSPORT_SYMBOLS = {
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
  nnrp_buffer_release: { parameters: [HANDLE_STRUCT], result: STATUS_STRUCT },
} as const;

interface DenoTransportSymbols {
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
  nnrp_buffer_release(handle: Uint8Array): Uint8Array;
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

interface PackagedBindingResult {
  readonly binding?: NnrpNativeTransportBinding;
  readonly diagnostic?: NnrpDiagnostic;
}

let cachedBinding: PackagedBindingResult | undefined;

export function loadPackagedTcpBinding(): PackagedBindingResult {
  if (cachedBinding !== undefined) return cachedBinding;
  try {
    cachedBinding = { binding: hasDenoFfi() ? loadLazyDenoTcpBinding() : loadLazyNodeTcpBinding() };
  } catch (cause) {
    cachedBinding = {
      diagnostic: {
        code: "NNRP_TCP_NATIVE_ARTIFACT_UNAVAILABLE",
        message: cause instanceof Error ? cause.message : "TCP native artifact could not be loaded.",
        source: "transport",
        retryable: false,
        transport: "tcp",
        cause,
      },
    };
  }
  return cachedBinding;
}

function loadLazyDenoTcpBinding(): NnrpNativeTransportBinding {
  const runtime = denoRuntime();
  const platform = nativePlatform(runtime.build.os, runtime.build.arch);
  const manifestUrl = new URL(`../native/${platform.tag}/manifest.json`, import.meta.url);
  const manifest = JSON.parse(runtime.readTextFileSync(fileURLToPath(manifestUrl))) as unknown;
  const libraryName = validateManifest(manifest, platform.os, platform.arch);
  const libraryPath = fileURLToPath(new URL(`../native/${platform.tag}/${libraryName}`, import.meta.url));
  if (!runtime.statSync(libraryPath).isFile) throw new Error(`TCP native library is not a file: ${libraryPath}`);
  let binding: NnrpNativeTransportBinding | undefined;
  const load = () => binding ??= loadDenoTcpBinding(runtime, libraryPath);
  return {
    mode: "deno-ffi",
    probe: async (options) => await load().probe(options),
    connect: async (options) => await load().connect(options),
    listen: async (options) => await load().listen(options),
  };
}

function loadLazyNodeTcpBinding(): NnrpNativeTransportBinding {
  const nodeProcess = (globalThis as typeof globalThis & {
    process?: { release?: { name?: string } };
  }).process;
  if (nodeProcess?.release?.name !== "node") {
    throw new Error("TCP packaged native loading requires Node.js or Deno FFI.");
  }
  let binding: Promise<NnrpNativeTransportBinding> | undefined;
  const load = () => binding ??= import("./native-node.js").then((module) => module.loadNodeTcpBinding());
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

function loadDenoTcpBinding(runtime: DenoRuntime, libraryPath: string): NnrpNativeTransportBinding {
  const library = runtime.dlopen(libraryPath, DENO_TRANSPORT_SYMBOLS);
  return new DenoTcpBinding(library);
}

class DenoTcpBinding implements NnrpNativeTransportBinding {
  readonly mode = "deno-ffi" as const;

  constructor(readonly library: DenoTransportLibrary) {}

  async probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics> {
    assertNoSecurity(options);
    const endpoint = endpointBytes(options.endpoint, "probe");
    const request = packProbeRequest(options, endpoint);
    const output = bytes(24);
    assertStatus(await this.library.symbols.nnrp_transport_probe(request, output), "transport probe");
    const view = dataView(output);
    return {
      sampleCount: view.getUint32(0, true),
      successCount: view.getUint32(4, true),
      medianThroughputBytesPerSecond: view.getBigUint64(8, true),
      medianRttMicroseconds: view.getBigUint64(16, true),
    };
  }

  async connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection> {
    assertNoSecurity(options);
    const endpoint = endpointBytes(options.endpoint, "connect");
    const output = bytes(HANDLE_SIZE);
    assertStatus(
      await this.library.symbols.nnrp_transport_connect(packOpenRequest(options, endpoint), output),
      "transport connect",
    );
    return new DenoTcpConnection(this.library, decodeHandle(output, HANDLE_KIND_CONNECTION), String(options.endpoint));
  }

  async listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer> {
    assertNoSecurity(options);
    const endpoint = endpointBytes(options.endpoint, "listen");
    const output = bytes(HANDLE_SIZE);
    assertStatus(
      await this.library.symbols.nnrp_transport_listen(packOpenRequest(options, endpoint), output),
      "transport listen",
    );
    const handle = decodeHandle(output, HANDLE_KIND_LISTENER);
    try {
      const boundEndpoint = await readListenerEndpoint(this.library, handle);
      return new DenoTcpServer(this.library, handle, boundEndpoint);
    } catch (error) {
      closeHandle(this.library, handle, "transport listener cleanup");
      throw error;
    }
  }
}

class DenoTcpConnection implements NnrpTransportConnection {
  readonly kind = "tcp" as const;
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
        throw transportError("NNRP_TCP_NATIVE_OWNER_INVALID", `Transport returned owner handle kind ${owner.kind}.`);
      }
      const outputView = dataView(output);
      const payload = copyNativeBytes(outputView.getBigUint64(24, true), outputView.getBigUint64(32, true));
      return decodePacketBatch(payload, outputView.getUint32(40, true));
    } finally {
      if (owner.kind === HANDLE_KIND_BUFFER) releaseBuffer(this.library, owner);
    }
  }

  close(): void {
    if (this.#closed) return;
    closeHandle(this.library, this.handle, "transport connection close");
    this.#closed = true;
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_TCP_CONNECTION_CLOSED", "TCP connection is closed.");
  }
}

class DenoTcpServer implements NnrpTransportServer {
  readonly kind = "tcp" as const;
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
    if (this.#closed) throw transportError("NNRP_TCP_LISTENER_CLOSED", "TCP listener is closed.");
    const request = bytes(32);
    const view = dataView(request);
    writeHandle(view, 0, this.handle);
    view.setUint32(24, boundedU32("timeoutMillis", options.timeoutMillis ?? 0), true);
    const output = bytes(HANDLE_SIZE);
    assertStatus(await this.library.symbols.nnrp_transport_accept(request, output), "transport accept");
    return new DenoTcpConnection(this.library, decodeHandle(output, HANDLE_KIND_CONNECTION), this.endpoint);
  }

  close(): void {
    if (this.#closed) return;
    closeHandle(this.library, this.handle, "transport listener close");
    this.#closed = true;
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
      throw transportError("NNRP_TCP_NATIVE_OWNER_INVALID", `Transport returned owner handle kind ${owner.kind}.`);
    }
    const view = dataView(endpointView);
    return new TextDecoder().decode(copyNativeBytes(view.getBigUint64(0, true), view.getBigUint64(8, true)));
  } finally {
    if (owner.kind === HANDLE_KIND_BUFFER) releaseBuffer(library, owner);
  }
}

function packOpenRequest(options: NnrpTransportEndpoint, endpoint: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const request = bytes(64);
  const view = dataView(request);
  view.setUint32(0, TRANSPORT_ID_TCP, true);
  writeBufferView(view, 8, endpoint);
  writeHandle(view, 24, invalidHandle());
  view.setBigUint64(48, boundedU64("maxPacketBytes", options.maxPacketBytes ?? 0n), true);
  view.setUint32(56, boundedU32("timeoutMillis", options.timeoutMillis ?? 0), true);
  return request;
}

function packProbeRequest(
  options: NnrpTransportProbeOptions,
  endpoint: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const request = bytes(72);
  request.set(packOpenRequest(options, endpoint), 0);
  const view = dataView(request);
  view.setUint32(64, boundedU32("sampleCount", options.sampleCount ?? 0), true);
  view.setUint32(68, boundedU32("payloadBytes", options.payloadBytes ?? 0), true);
  return request;
}

function endpointBytes(endpoint: string | URL, operation: string): Uint8Array<ArrayBuffer> {
  const value = String(endpoint);
  if (value.length === 0) throw transportError("NNRP_TCP_ENDPOINT_INVALID", `TCP ${operation} endpoint is empty.`);
  return new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
}

function assertNoSecurity(options: NnrpTransportEndpoint): void {
  if (options.security !== undefined) {
    throw transportError("NNRP_TCP_SECURITY_INVALID", "TCP endpoints do not accept transport security configuration.");
  }
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
    if (offset + 4 > payload.byteLength) throw transportError("NNRP_TCP_BATCH_INVALID", "Packet batch is truncated.");
    const length = new DataView(payload.buffer, payload.byteOffset + offset, 4).getUint32(0, true);
    offset += 4;
    if (offset + length > payload.byteLength) {
      throw transportError("NNRP_TCP_BATCH_INVALID", "Packet payload is truncated.");
    }
    packets.push(payload.slice(offset, offset + length));
    offset += length;
  }
  if (offset !== payload.byteLength) throw transportError("NNRP_TCP_BATCH_INVALID", "Packet batch has trailing bytes.");
  return packets;
}

function copyNativeBytes(address: bigint, lengthValue: bigint): Uint8Array {
  const length = Number(lengthValue);
  if (length === 0) return new Uint8Array();
  if (address === 0n || !Number.isSafeInteger(length) || length < 0) {
    throw transportError("NNRP_TCP_NATIVE_BUFFER_INVALID", "Transport returned an invalid native buffer view.");
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
    throw transportError("NNRP_TCP_NATIVE_HANDLE_INVALID", "Native handle is truncated.");
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
      "NNRP_TCP_NATIVE_HANDLE_INVALID",
      `Expected native handle kind ${expectedKind}, got ${handle.kind}.`,
    );
  }
  return handle;
}

function invalidHandle(): FfiHandle {
  return { kind: HANDLE_KIND_INVALID, id: 0n, generation: 0, flags: 0 };
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
    throw transportError("NNRP_TCP_FFI_STATUS_INVALID", `${operation} returned a short status.`);
  }
  const view = dataView(status);
  const code = view.getUint32(0, true);
  if (code !== 0) {
    throw transportError(
      "NNRP_TCP_FFI_STATUS_ERROR",
      `${operation} failed with status=${code}, family=${view.getUint32(4, true)}, protocol=${
        view.getUint32(8, true)
      }, detail=${view.getUint32(12, true)}.`,
      code === 5 || code === 6,
    );
  }
}

function validateManifest(value: unknown, os: string, arch: string): string {
  if (typeof value !== "object" || value === null) throw new Error("TCP native artifact manifest is not an object.");
  const manifest = value as Record<string, unknown>;
  if (manifest.package !== "nnrp-ffi-transport-tcp" || manifest.transport_scope !== "tcp") {
    throw new Error("TCP package contains an artifact for another transport scope.");
  }
  if (manifest.abi_version !== ABI_VERSION) throw new Error(`TCP artifact requires ABI ${ABI_VERSION}.`);
  if (manifest.os !== os || manifest.arch !== arch || manifest.library_kind !== "dynamic") {
    throw new Error(`TCP artifact does not match ${os}/${arch} dynamic loading.`);
  }
  if (typeof manifest.library !== "string" || !/^[A-Za-z0-9_.-]+$/u.test(manifest.library)) {
    throw new Error("TCP artifact manifest has an invalid library name.");
  }
  if (typeof manifest.source_archive_sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(manifest.source_archive_sha256)) {
    throw new Error("TCP artifact manifest has invalid checksum metadata.");
  }
  const exports = Array.isArray(manifest.exports) ? manifest.exports : [];
  const missing = Object.keys(DENO_TRANSPORT_SYMBOLS)
    .filter((name) => name !== "nnrp_buffer_release")
    .filter((name) => !exports.includes(name));
  if (missing.length > 0) throw new Error(`TCP artifact is missing transport exports: ${missing.join(", ")}.`);
  return manifest.library;
}

function nativePlatform(
  osValue: string,
  archValue: string,
): { readonly tag: string; readonly os: string; readonly arch: string } {
  const os = osValue === "darwin" ? "macos" : osValue;
  const arch = archValue === "arm64" ? "aarch64" : archValue;
  if (!(["windows", "macos", "linux"] as const).includes(os as "windows" | "macos" | "linux")) {
    throw new Error(`TCP Deno FFI does not support ${osValue}.`);
  }
  if (!(["x86_64", "x86", "aarch64", "armv7"] as const).includes(arch as "x86_64" | "x86" | "aarch64" | "armv7")) {
    throw new Error(`TCP Deno FFI does not support ${archValue}.`);
  }
  return { tag: `${os}-${arch}`, os, arch };
}

function denoRuntime(): DenoRuntime {
  const runtime = (globalThis as typeof globalThis & { readonly Deno?: DenoRuntime }).Deno;
  if (runtime === undefined || typeof runtime.dlopen !== "function") {
    throw new Error("TCP packaged native loading requires Deno FFI or an explicit managed binding.");
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
  return new NnrpTransportError({ code, message, source: "transport", retryable, transport: "tcp" });
}
