import {
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
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import koffi, { type LibraryHandle } from "koffi";

const TRANSPORT_ID = 4;
const TRANSPORT_KIND = "websocket" as const;
const TRANSPORT_LABEL = "WEBSOCKET";
const PACKAGE_NAME = "nnrp-ffi-transport-websocket";
const TRANSPORT_SCOPE = "websocket";
const SECURITY_MODE: "none" | "required" | "websocket" = "websocket";
const ABI_VERSION = "1.12.1";
const HANDLE_KIND_INVALID = 0;
const HANDLE_KIND_BUFFER = 5;
const HANDLE_KIND_CONNECTION = 10;
const HANDLE_KIND_LISTENER = 11;
const HANDLE_KIND_SECURITY_CONFIG = 12;

interface NativeHandle {
  kind: number;
  id: number | bigint;
  generation: number;
  flags: number;
}

interface NativeStatus {
  status_code: number;
  error_family: number;
  protocol_error_code: number;
  detail_code: number;
}

interface NativeBufferView {
  ptr: unknown;
  len: number | bigint;
}

interface NativeProbeResult {
  sample_count: number;
  success_count: number;
  median_throughput_bytes_per_second: number | bigint;
  median_rtt_microseconds: number | bigint;
}

interface NativeFrameBatch {
  payload_owner: NativeHandle;
  payload: NativeBufferView;
  frame_count: number;
  reserved0: number;
}

type NativeFunction = ReturnType<LibraryHandle["func"]>;

const StatusType = koffi.struct({
  status_code: "uint32_t",
  error_family: "uint32_t",
  protocol_error_code: "uint32_t",
  detail_code: "uint32_t",
});
const HandleType = koffi.struct({
  kind: "uint32_t",
  id: "uint64_t",
  generation: "uint32_t",
  flags: "uint32_t",
});
const BufferViewType = koffi.struct({ ptr: "const uint8_t *", len: "size_t" });
const OpenRequestType = koffi.struct({
  transport_id: "uint32_t",
  flags: "uint32_t",
  endpoint: BufferViewType,
  config: HandleType,
  max_packet_bytes: "uint64_t",
  timeout_ms: "uint32_t",
  reserved0: "uint32_t",
});
const AcceptRequestType = koffi.struct({ listener: HandleType, timeout_ms: "uint32_t", reserved0: "uint32_t" });
const WriteBatchRequestType = koffi.struct({
  connection: HandleType,
  frames: koffi.pointer(BufferViewType),
  frame_count: "uint32_t",
  flags: "uint32_t",
});
const ReadBatchRequestType = koffi.struct({
  connection: HandleType,
  max_frames: "uint32_t",
  timeout_ms: "uint32_t",
  max_bytes: "uint64_t",
});
const FrameBatchType = koffi.struct({
  payload_owner: HandleType,
  payload: BufferViewType,
  frame_count: "uint32_t",
  reserved0: "uint32_t",
});
const ProbeRequestType = koffi.struct({
  open: OpenRequestType,
  sample_count: "uint32_t",
  probe_payload_bytes: "uint32_t",
});
const ProbeResultType = koffi.struct({
  sample_count: "uint32_t",
  success_count: "uint32_t",
  median_throughput_bytes_per_second: "uint64_t",
  median_rtt_microseconds: "uint64_t",
});
const SecurityConfigRequestType = koffi.struct({
  transport_id: "uint32_t",
  flags: "uint32_t",
  first: BufferViewType,
  second: BufferViewType,
});

interface NodeSymbols {
  readonly probe: NativeFunction;
  readonly connect: NativeFunction;
  readonly listen: NativeFunction;
  readonly listenerEndpoint: NativeFunction;
  readonly accept: NativeFunction;
  readonly writeBatch: NativeFunction;
  readonly readBatch: NativeFunction;
  readonly close: NativeFunction;
  readonly releaseBuffer: NativeFunction;
  readonly createClientSecurity: NativeFunction;
  readonly createServerSecurity: NativeFunction;
}

export function loadNodeWebSocketBinding(): NnrpNativeTransportBinding {
  const platform = nativePlatform(process.platform, process.arch);
  const manifestUrl = new URL(`../native/${platform.tag}/manifest.json`, import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as unknown;
  const libraryName = validateManifest(manifest, platform.os, platform.arch);
  const library = koffi.load(fileURLToPath(new URL(`../native/${platform.tag}/${libraryName}`, import.meta.url)));
  return new NodeTransportBinding(library, bindSymbols(library));
}

class NodeTransportBinding implements NnrpNativeTransportBinding {
  readonly mode = "managed-ffi" as const;

  constructor(readonly library: LibraryHandle, readonly symbols: NodeSymbols) {}

  async probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics> {
    return await withEndpointSecurity(this.symbols, options, "client", async (config) => {
      const result: Partial<NativeProbeResult> = {};
      const status = await invoke<NativeStatus>(this.symbols.probe, [
        {
          open: openRequest(options, config),
          sample_count: boundedU32("sampleCount", options.sampleCount ?? 0),
          probe_payload_bytes: boundedU32("payloadBytes", options.payloadBytes ?? 0),
        },
        result,
      ]);
      assertStatus(status, "transport probe");
      return {
        sampleCount: requiredNumber(result.sample_count, "probe sample count"),
        successCount: requiredNumber(result.success_count, "probe success count"),
        medianThroughputBytesPerSecond: requiredBigInt(
          result.median_throughput_bytes_per_second,
          "probe throughput",
        ),
        medianRttMicroseconds: requiredBigInt(result.median_rtt_microseconds, "probe RTT"),
      };
    });
  }

  async connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection> {
    return await withEndpointSecurity(this.symbols, options, "client", async (config) => {
      const output: Partial<NativeHandle> = {};
      assertStatus(
        await invoke<NativeStatus>(this.symbols.connect, [openRequest(options, config), output]),
        "transport connect",
      );
      return new NodeTransportConnection(
        this.symbols,
        requiredHandle(output, HANDLE_KIND_CONNECTION),
        String(options.endpoint),
      );
    });
  }

  async listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer> {
    return await withEndpointSecurity(this.symbols, options, "server", async (config) => {
      const output: Partial<NativeHandle> = {};
      assertStatus(
        await invoke<NativeStatus>(this.symbols.listen, [openRequest(options, config), output]),
        "transport listen",
      );
      const handle = requiredHandle(output, HANDLE_KIND_LISTENER);
      try {
        return new NodeTransportServer(this.symbols, handle, await readListenerEndpoint(this.symbols, handle));
      } catch (error) {
        closeHandle(this.symbols, handle, "transport listener cleanup");
        throw error;
      }
    });
  }
}

class NodeTransportConnection implements NnrpTransportConnection {
  readonly kind = TRANSPORT_KIND;
  #closed = false;

  constructor(readonly symbols: NodeSymbols, readonly handle: NativeHandle, readonly endpoint: string) {}

  get connected(): boolean {
    return !this.#closed;
  }

  async send(packets: Uint8Array | readonly Uint8Array[]): Promise<void> {
    this.#requireOpen();
    const payloads = normalizePackets(packets).map((packet) => Buffer.from(packet));
    const frames = payloads.map((packet) => ({ ptr: packet, len: packet.byteLength }));
    assertStatus(
      await invoke<NativeStatus>(this.symbols.writeBatch, [{
        connection: this.handle,
        frames,
        frame_count: frames.length,
        flags: 0,
      }]),
      "transport write batch",
    );
  }

  async receive(options: NnrpTransportReceiveOptions = {}): Promise<readonly Uint8Array[]> {
    this.#requireOpen();
    const output: Partial<NativeFrameBatch> = {};
    assertStatus(
      await invoke<NativeStatus>(this.symbols.readBatch, [{
        connection: this.handle,
        max_frames: boundedU32("maxPackets", options.maxPackets ?? 0),
        timeout_ms: boundedU32("timeoutMillis", options.timeoutMillis ?? 0),
        max_bytes: boundedU64("maxBytes", options.maxBytes ?? 0n),
      }, output]),
      "transport read batch",
    );
    const owner = requiredHandle(output.payload_owner ?? {}, undefined);
    try {
      if (owner.kind !== HANDLE_KIND_INVALID && owner.kind !== HANDLE_KIND_BUFFER) {
        throw transportError("NNRP_NATIVE_OWNER_INVALID", `Transport returned owner handle kind ${owner.kind}.`);
      }
      const payload = output.payload;
      if (payload === undefined) {
        throw transportError("NNRP_NATIVE_BUFFER_INVALID", "Transport omitted its batch buffer.");
      }
      return decodePacketBatch(copyNativeBytes(payload), requiredNumber(output.frame_count, "batch frame count"));
    } finally {
      if (owner.kind === HANDLE_KIND_BUFFER) releaseBuffer(this.symbols, owner);
    }
  }

  close(): void {
    if (this.#closed) return;
    closeHandle(this.symbols, this.handle, "transport connection close");
    this.#closed = true;
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_CONNECTION_CLOSED", `${TRANSPORT_LABEL} connection is closed.`);
  }
}

class NodeTransportServer implements NnrpTransportServer {
  readonly kind = TRANSPORT_KIND;
  #closed = false;

  constructor(readonly symbols: NodeSymbols, readonly handle: NativeHandle, readonly endpoint: string) {}

  get listening(): boolean {
    return !this.#closed;
  }

  async accept(options: NnrpTransportAcceptOptions = {}): Promise<NnrpTransportConnection> {
    if (this.#closed) throw transportError("NNRP_LISTENER_CLOSED", `${TRANSPORT_LABEL} listener is closed.`);
    const output: Partial<NativeHandle> = {};
    assertStatus(
      await invoke<NativeStatus>(this.symbols.accept, [{
        listener: this.handle,
        timeout_ms: boundedU32("timeoutMillis", options.timeoutMillis ?? 0),
        reserved0: 0,
      }, output]),
      "transport accept",
    );
    return new NodeTransportConnection(this.symbols, requiredHandle(output, HANDLE_KIND_CONNECTION), this.endpoint);
  }

  close(): void {
    if (this.#closed) return;
    closeHandle(this.symbols, this.handle, "transport listener close");
    this.#closed = true;
  }
}

function bindSymbols(library: LibraryHandle): NodeSymbols {
  const outHandle = koffi.out(koffi.pointer(HandleType));
  return {
    probe: library.func("nnrp_transport_probe", StatusType, [
      ProbeRequestType,
      koffi.out(koffi.pointer(ProbeResultType)),
    ]),
    connect: library.func("nnrp_transport_connect", StatusType, [OpenRequestType, outHandle]),
    listen: library.func("nnrp_transport_listen", StatusType, [OpenRequestType, outHandle]),
    listenerEndpoint: library.func("nnrp_transport_listener_endpoint", StatusType, [
      HandleType,
      outHandle,
      koffi.out(koffi.pointer(BufferViewType)),
    ]),
    accept: library.func("nnrp_transport_accept", StatusType, [AcceptRequestType, outHandle]),
    writeBatch: library.func("nnrp_transport_write_batch", StatusType, [WriteBatchRequestType]),
    readBatch: library.func("nnrp_transport_read_batch", StatusType, [
      ReadBatchRequestType,
      koffi.out(koffi.pointer(FrameBatchType)),
    ]),
    close: library.func("nnrp_transport_close", StatusType, [HandleType]),
    releaseBuffer: library.func("nnrp_buffer_release", StatusType, [HandleType]),
    createClientSecurity: library.func("nnrp_transport_client_security_config_create", StatusType, [
      SecurityConfigRequestType,
      outHandle,
    ]),
    createServerSecurity: library.func("nnrp_transport_server_security_config_create", StatusType, [
      SecurityConfigRequestType,
      outHandle,
    ]),
  };
}

function openRequest(options: NnrpTransportEndpoint, config: NativeHandle): Record<string, unknown> {
  const endpoint = Buffer.from(String(options.endpoint));
  if (endpoint.byteLength === 0) throw transportError("NNRP_ENDPOINT_INVALID", `${TRANSPORT_LABEL} endpoint is empty.`);
  return {
    transport_id: TRANSPORT_ID,
    flags: 0,
    endpoint: { ptr: endpoint, len: endpoint.byteLength },
    config,
    max_packet_bytes: boundedU64("maxPacketBytes", options.maxPacketBytes ?? 0n),
    timeout_ms: boundedU32("timeoutMillis", options.timeoutMillis ?? 0),
    reserved0: 0,
  };
}

async function readListenerEndpoint(symbols: NodeSymbols, listener: NativeHandle): Promise<string> {
  const ownerOutput: Partial<NativeHandle> = {};
  const endpointOutput: Partial<NativeBufferView> = {};
  assertStatus(
    await invoke<NativeStatus>(symbols.listenerEndpoint, [listener, ownerOutput, endpointOutput]),
    "transport listener endpoint",
  );
  const owner = requiredHandle(ownerOutput);
  try {
    if (owner.kind !== HANDLE_KIND_INVALID && owner.kind !== HANDLE_KIND_BUFFER) {
      throw transportError("NNRP_NATIVE_OWNER_INVALID", `Transport returned owner handle kind ${owner.kind}.`);
    }
    return new TextDecoder().decode(copyNativeBytes(endpointOutput as NativeBufferView));
  } finally {
    if (owner.kind === HANDLE_KIND_BUFFER) releaseBuffer(symbols, owner);
  }
}

async function withEndpointSecurity<T>(
  symbols: NodeSymbols,
  options: NnrpTransportEndpoint,
  mode: "client" | "server",
  operation: (config: NativeHandle) => Promise<T>,
): Promise<T> {
  if (SECURITY_MODE === "none") {
    if (options.security !== undefined) {
      throw transportError(
        "NNRP_SECURITY_INVALID",
        `${TRANSPORT_LABEL} endpoints reject transport security configuration.`,
      );
    }
    return await operation(invalidHandle());
  }
  if (SECURITY_MODE === "websocket" && new URL(options.endpoint).protocol === "ws:") {
    if (options.security !== undefined) {
      throw transportError("NNRP_SECURITY_INVALID", "ws:// endpoints reject security configuration.");
    }
    return await operation(invalidHandle());
  }
  const config = createSecurityConfig(symbols, options, mode);
  try {
    return await operation(config);
  } finally {
    closeHandle(symbols, config, "transport security config close");
  }
}

function createSecurityConfig(
  symbols: NodeSymbols,
  options: NnrpTransportEndpoint,
  mode: "client" | "server",
): NativeHandle {
  const security = options.security;
  if (security === undefined || security.mode !== mode) {
    throw transportError(
      "NNRP_SECURITY_REQUIRED",
      `${TRANSPORT_LABEL} ${mode} requires ${mode} security configuration.`,
    );
  }
  const first = Buffer.from(
    security.mode === "client" ? new TextEncoder().encode(security.serverName) : security.certificateDer,
  );
  const second = Buffer.from(security.mode === "client" ? security.trustedCertificateDer : security.privateKeyPkcs8Der);
  if (first.byteLength === 0 || second.byteLength === 0) {
    throw transportError("NNRP_SECURITY_INVALID", `${TRANSPORT_LABEL} ${mode} security fields must be non-empty.`);
  }
  const output: Partial<NativeHandle> = {};
  const fn = mode === "client" ? symbols.createClientSecurity : symbols.createServerSecurity;
  assertStatus(
    fn({
      transport_id: TRANSPORT_ID,
      flags: 0,
      first: { ptr: first, len: first.byteLength },
      second: { ptr: second, len: second.byteLength },
    }, output) as NativeStatus,
    `transport ${mode} security config create`,
  );
  return requiredHandle(output, HANDLE_KIND_SECURITY_CONFIG);
}

function normalizePackets(packets: Uint8Array | readonly Uint8Array[]): readonly Uint8Array[] {
  const values = packets instanceof Uint8Array ? [packets] : packets;
  if (values.length === 0 || values.some((packet) => !(packet instanceof Uint8Array) || packet.byteLength === 0)) {
    throw new TypeError("transport send requires one or more non-empty complete NNRP packets");
  }
  return values;
}

function decodePacketBatch(payload: Uint8Array, frameCount: number): readonly Uint8Array[] {
  const packets: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; index < frameCount; index++) {
    if (offset + 4 > payload.byteLength) throw transportError("NNRP_BATCH_INVALID", "Packet batch is truncated.");
    const length = new DataView(payload.buffer, payload.byteOffset + offset, 4).getUint32(0, true);
    offset += 4;
    if (offset + length > payload.byteLength) {
      throw transportError("NNRP_BATCH_INVALID", "Packet payload is truncated.");
    }
    packets.push(payload.slice(offset, offset + length));
    offset += length;
  }
  if (offset !== payload.byteLength) throw transportError("NNRP_BATCH_INVALID", "Packet batch has trailing bytes.");
  return packets;
}

function copyNativeBytes(view: NativeBufferView): Uint8Array {
  const length = Number(view.len);
  if (length === 0) return new Uint8Array();
  if (view.ptr == null || !Number.isSafeInteger(length) || length < 0) {
    throw transportError("NNRP_NATIVE_BUFFER_INVALID", "Transport returned an invalid native buffer view.");
  }
  return new Uint8Array(koffi.view(view.ptr, length)).slice();
}

function requiredHandle(value: Partial<NativeHandle>, expectedKind?: number): NativeHandle {
  const handle = {
    kind: requiredNumber(value.kind, "handle kind"),
    id: requiredBigInt(value.id, "handle id"),
    generation: requiredNumber(value.generation, "handle generation"),
    flags: requiredNumber(value.flags, "handle flags"),
  };
  if (expectedKind !== undefined && (handle.kind !== expectedKind || handle.id === 0n || handle.generation === 0)) {
    throw transportError(
      "NNRP_NATIVE_HANDLE_INVALID",
      `Expected native handle kind ${expectedKind}, got ${handle.kind}.`,
    );
  }
  return handle;
}

function invalidHandle(): NativeHandle {
  return { kind: HANDLE_KIND_INVALID, id: 0n, generation: 0, flags: 0 };
}

function releaseBuffer(symbols: NodeSymbols, owner: NativeHandle): void {
  assertStatus(symbols.releaseBuffer(owner) as NativeStatus, "transport buffer release");
}

function closeHandle(symbols: NodeSymbols, handle: NativeHandle, operation: string): void {
  assertStatus(symbols.close(handle) as NativeStatus, operation);
}

function assertStatus(status: NativeStatus, operation: string): void {
  if (status.status_code !== 0) {
    throw transportError(
      "NNRP_FFI_STATUS_ERROR",
      `${operation} failed with status=${status.status_code}, family=${status.error_family}, protocol=${status.protocol_error_code}, detail=${status.detail_code}.`,
      status.status_code === 5 || status.status_code === 6,
    );
  }
}

function invoke<T>(fn: NativeFunction, args: readonly unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    fn.async(...args, (error: unknown, result: T) => error == null ? resolve(result) : reject(error));
  });
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
  const required = [
    "nnrp_transport_probe",
    "nnrp_transport_connect",
    "nnrp_transport_listen",
    "nnrp_transport_listener_endpoint",
    "nnrp_transport_accept",
    "nnrp_transport_write_batch",
    "nnrp_transport_read_batch",
    "nnrp_transport_close",
  ];
  const missing = required.filter((name) => !exports.includes(name));
  if (missing.length > 0) {
    throw new Error(`${TRANSPORT_LABEL} artifact is missing transport exports: ${missing.join(", ")}.`);
  }
  return manifest.library;
}

function nativePlatform(platform: string, archValue: string): { tag: string; os: string; arch: string } {
  const os = platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform;
  const arch = archValue === "x64"
    ? "x86_64"
    : archValue === "ia32"
    ? "x86"
    : archValue === "arm64"
    ? "aarch64"
    : archValue;
  if (!(["windows", "macos", "linux"] as const).includes(os as "windows" | "macos" | "linux")) {
    throw new Error(`${TRANSPORT_LABEL} Node FFI does not support ${platform}.`);
  }
  if (!(["x86_64", "x86", "aarch64", "armv7"] as const).includes(arch as "x86_64" | "x86" | "aarch64" | "armv7")) {
    throw new Error(`${TRANSPORT_LABEL} Node FFI does not support ${archValue}.`);
  }
  return { tag: `${os}-${arch}`, os, arch };
}

function boundedU32(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${name} must fit u32`);
  return value;
}

function boundedU64(name: string, value: bigint): bigint {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new RangeError(`${name} must fit u64`);
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw transportError("NNRP_NATIVE_RESULT_INVALID", `Native ${label} is invalid.`);
  }
  return value;
}

function requiredBigInt(value: unknown, label: string): bigint {
  if ((typeof value !== "number" && typeof value !== "bigint") || value < 0) {
    throw transportError("NNRP_NATIVE_RESULT_INVALID", `Native ${label} is invalid.`);
  }
  return BigInt(value);
}

function transportError(code: string, message: string, retryable = false): NnrpTransportError {
  return new NnrpTransportError({
    code: `${code}_${TRANSPORT_SCOPE.toUpperCase()}`,
    message,
    source: "transport",
    retryable,
    transport: TRANSPORT_KIND,
  });
}
