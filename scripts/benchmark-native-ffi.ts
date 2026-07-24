const NNRP_HANDLE_SIZE = 24;
const NNRP_FFI_STATUS_SIZE = 16;
const NNRP_BENCHMARK_SESSION_OPEN_REQUEST_SIZE = 16;
const NNRP_CLIENT_SUBMIT_RESULT_BATCH_REQUEST_SIZE = 88;
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
const NNRP_BENCHMARK_SESSION_OPEN_REQUEST_STRUCT = { struct: ["u64", "u32", "u32"] } as const;
const NNRP_CLIENT_SUBMIT_RESULT_BATCH_REQUEST_STRUCT = {
  struct: [NNRP_HANDLE_STRUCT, "u64", "u32", "u32", NNRP_BUFFER_VIEW_STRUCT, NNRP_BUFFER_VIEW_STRUCT, "usize", "usize"],
} as const;

const BENCHMARK_SYMBOLS = {
  nnrp_runtime_capabilities: { parameters: [], result: NNRP_RUNTIME_CAPABILITIES_STRUCT },
  nnrp_benchmark_open_session: {
    parameters: [NNRP_BENCHMARK_SESSION_OPEN_REQUEST_STRUCT, "buffer"],
    result: NNRP_FFI_STATUS_STRUCT,
  },
  nnrp_benchmark_close_session: {
    parameters: [NNRP_HANDLE_STRUCT],
    result: NNRP_FFI_STATUS_STRUCT,
  },
  nnrp_benchmark_client_submit_result_compact_batch: {
    parameters: [NNRP_CLIENT_SUBMIT_RESULT_BATCH_REQUEST_STRUCT, "buffer", "buffer"],
    result: NNRP_FFI_STATUS_STRUCT,
  },
} as const;

interface FfiHandle {
  readonly kind: number;
  readonly id: bigint;
  readonly generation: number;
  readonly flags: number;
}

export interface NativeBenchmarkFfi {
  readonly abiVersion: string;
  readonly protocolVersion: string;
  submitResultBatch(frameIdStart: number, iterations: number, payload: Uint8Array): number;
  close(): void;
}

export function openNativeBenchmarkFfi(libraryPath: string): NativeBenchmarkFfi {
  if (libraryPath.length === 0) throw new TypeError("benchmark FFI library path must not be empty");
  const library = Deno.dlopen(libraryPath, BENCHMARK_SYMBOLS);
  let session: FfiHandle | undefined;
  let closed = false;
  try {
    const capabilities = library.symbols.nnrp_runtime_capabilities();
    const benchmarkSession = createSession(library);
    session = benchmarkSession;
    const request = new Uint8Array(NNRP_CLIENT_SUBMIT_RESULT_BATCH_REQUEST_SIZE);
    const requestView = new DataView(request.buffer);
    const output = new Uint8Array(NNRP_COMPACT_RESULT_SIZE);
    const completed = new Uint8Array(8);
    writeHandle(requestView, 0, benchmarkSession);
    requestView.setUint32(36, 1, true);
    requestView.setBigUint64(72, 16n, true);

    return {
      abiVersion: `${readU16(capabilities, 0)}.${readU16(capabilities, 2)}.${readU16(capabilities, 4)}`,
      protocolVersion: `${capabilities[8] ?? 0}.${capabilities[9] ?? 0}`,
      submitResultBatch(frameIdStart, iterations, payload) {
        if (!Number.isInteger(frameIdStart) || frameIdStart < 1 || frameIdStart > 0xffff_ffff) {
          throw new RangeError(`frameIdStart must be an unsigned non-zero u32, got ${frameIdStart}`);
        }
        if (!Number.isSafeInteger(iterations) || iterations < 1) {
          throw new RangeError(`iterations must be a positive safe integer, got ${iterations}`);
        }
        requestView.setBigUint64(24, BigInt(frameIdStart), true);
        requestView.setUint32(32, frameIdStart, true);
        writeBufferView(requestView, 40, payload);
        writeBufferView(requestView, 56, payload);
        requestView.setBigUint64(80, BigInt(iterations), true);
        assertFfiOk(
          library.symbols.nnrp_benchmark_client_submit_result_compact_batch(request, output, completed),
          "benchmark submit/result batch",
        );
        return Number(new DataView(completed.buffer).getBigUint64(0, true));
      },
      close() {
        if (closed) return;
        closed = true;
        try {
          assertFfiOk(
            library.symbols.nnrp_benchmark_close_session(encodeHandle(benchmarkSession)),
            "benchmark close session",
          );
        } finally {
          library.close();
        }
      },
    };
  } catch (error) {
    try {
      if (session !== undefined) {
        assertFfiOk(
          library.symbols.nnrp_benchmark_close_session(encodeHandle(session)),
          "benchmark close session after setup failure",
        );
      }
    } finally {
      library.close();
    }
    throw error;
  }
}

function createSession(library: Deno.DynamicLibrary<typeof BENCHMARK_SYMBOLS>): FfiHandle {
  const sessionOutput = new Uint8Array(NNRP_HANDLE_SIZE);
  const sessionRequest = new Uint8Array(NNRP_BENCHMARK_SESSION_OPEN_REQUEST_SIZE);
  const sessionView = new DataView(sessionRequest.buffer);
  sessionView.setBigUint64(0, 1n, true);
  sessionView.setUint32(8, 1, true);
  sessionView.setUint32(12, 1, true);
  assertFfiOk(library.symbols.nnrp_benchmark_open_session(sessionRequest, sessionOutput), "benchmark open session");
  return decodeHandle(sessionOutput);
}

function decodeHandle(source: Uint8Array): FfiHandle {
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

function encodeHandle(handle: FfiHandle): Uint8Array<ArrayBuffer> {
  const buffer = new Uint8Array(new ArrayBuffer(NNRP_HANDLE_SIZE));
  writeHandle(new DataView(buffer.buffer), 0, handle);
  return buffer;
}

function writeBufferView(view: DataView, offset: number, payload: Uint8Array): void {
  const pointer = payload.byteLength === 0
    ? 0n
    : Deno.UnsafePointer.value(Deno.UnsafePointer.of(payload as Uint8Array<ArrayBuffer>));
  view.setBigUint64(offset, pointer, true);
  view.setBigUint64(offset + 8, BigInt(payload.byteLength), true);
}

function assertFfiOk(status: Uint8Array, operation: string): void {
  if (status.byteLength < NNRP_FFI_STATUS_SIZE) {
    throw new Error(`${operation} returned a short FFI status`);
  }
  const view = new DataView(status.buffer, status.byteOffset, status.byteLength);
  if (view.getUint32(0, true) !== 0) {
    throw new Error(
      `${operation} failed: status=${view.getUint32(0, true)}, family=${view.getUint32(4, true)}, ` +
        `protocol=${view.getUint32(8, true)}, detail=${view.getUint32(12, true)}`,
    );
  }
}

function readU16(source: Uint8Array, offset: number): number {
  return new DataView(source.buffer, source.byteOffset, source.byteLength).getUint16(offset, true);
}
