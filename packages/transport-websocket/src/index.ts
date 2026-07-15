import {
  type NnrpDiagnostic,
  type NnrpNativeTransportBinding,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportProbeMetrics,
  type NnrpTransportProbeOptions,
  type NnrpTransportProvider,
  type NnrpTransportProviderCost,
  type NnrpTransportReceiveOptions,
  type NnrpTransportServer,
} from "@nnrp/core";
import { loadPackagedWebSocketBinding } from "./native.js";

export interface NnrpWebSocketTransportProviderOptions {
  readonly available?: boolean;
  readonly cost?: NnrpTransportProviderCost;
  readonly preferenceRank?: number;
  readonly maxFrameBytes?: bigint;
  readonly diagnostic?: NnrpDiagnostic;
  readonly binding?: NnrpNativeTransportBinding;
  readonly WebSocket?: typeof WebSocket;
}

export interface NnrpWebSocketTransportProvider extends NnrpTransportProvider {
  readonly kind: "websocket";
  readonly endpointSchemes: readonly ["ws", "wss"];
  probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
  connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
  listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}

export function createWebSocketTransportProvider(
  options: NnrpWebSocketTransportProviderOptions = {},
): NnrpWebSocketTransportProvider {
  const browserOverride = "WebSocket" in options && options.binding === undefined;
  const nativeHost = !browserOverride && isNativeHost();
  const loaded = options.binding !== undefined
    ? { binding: options.binding }
    : options.available === false
    ? {}
    : nativeHost
    ? loadPackagedWebSocketBinding()
    : {};
  const socketCtor = options.available === false
    ? undefined
    : "WebSocket" in options
    ? options.WebSocket
    : globalThis.WebSocket;
  const native = loaded.binding !== undefined;
  const browser = !nativeHost && socketCtor !== undefined;
  const available = options.available ?? (native || browser);
  const diagnostic = options.diagnostic ?? loaded.diagnostic ?? unavailableDiagnostic();
  return {
    kind: "websocket",
    metadata: {
      id: native ? "nnrp.transport.websocket.native" : "nnrp.transport.websocket.browser-wasm",
      cost: options.cost ?? { modelId: 0, units: 0n },
      preferenceRank: options.preferenceRank ?? 3,
      limits: { maxFrameBytes: options.maxFrameBytes ?? 67_108_864n },
      limitations: native ? ["requires-tcp", "native-host-only"] : ["requires-tcp", "browser-host-only"],
    },
    localAvailable: available,
    ...(available ? {} : { diagnostic }),
    endpointSchemes: ["ws", "wss"],
    probe: async (endpoint) => await requireNativeBinding(loaded.binding, diagnostic, "probe").probe(endpoint),
    connect: async (endpoint) =>
      await (loaded.binding?.connect(endpoint) ?? connectBrowserWebSocket(endpoint, socketCtor)),
    listen: async (endpoint) => await requireNativeBinding(loaded.binding, diagnostic, "listen").listen(endpoint),
  };
}

function requireNativeBinding(
  binding: NnrpNativeTransportBinding | undefined,
  diagnostic: NnrpDiagnostic,
  operation: "probe" | "listen",
): NnrpNativeTransportBinding {
  if (binding === undefined) {
    throw new NnrpTransportError({
      ...diagnostic,
      message: `WebSocket transport ${operation} requires its package-owned native binding.`,
    });
  }
  return binding;
}

function isNativeHost(): boolean {
  const runtime = globalThis as typeof globalThis & { process?: unknown };
  return "Deno" in globalThis || runtime.process !== undefined;
}

async function connectBrowserWebSocket(
  options: NnrpTransportEndpoint,
  socketCtor: typeof WebSocket | undefined,
): Promise<NnrpTransportConnection> {
  if (socketCtor === undefined) {
    throw new NnrpTransportError(unavailableDiagnostic());
  }
  if (options.security !== undefined) {
    throw transportError("NNRP_WEBSOCKET_SECURITY_INVALID", "Browser WebSocket security is owned by the host.");
  }

  const endpoint = normalizeWebSocketEndpoint(options.endpoint);
  const socket = new socketCtor(endpoint);
  socket.binaryType = "arraybuffer";
  await waitForOpen(socket);
  return new BrowserWebSocketConnection(socket, socketCtor, endpoint);
}

class BrowserWebSocketConnection implements NnrpTransportConnection {
  readonly kind = "websocket" as const;
  readonly #packets: Uint8Array[] = [];
  readonly #waiters: Array<() => void> = [];
  #protocolError: NnrpTransportError | undefined;

  constructor(
    readonly socket: WebSocket,
    readonly socketCtor: typeof WebSocket,
    readonly endpoint: string,
  ) {
    socket.addEventListener("message", (event) => void this.#onMessage(event));
    socket.addEventListener("close", () => this.#wake());
    socket.addEventListener("error", () => {
      this.#protocolError ??= transportError("NNRP_WEBSOCKET_IO_FAILED", "WebSocket transport I/O failed.", true);
      this.#wake();
    });
  }

  get connected(): boolean {
    return this.socket.readyState === this.socketCtor.OPEN;
  }

  async send(packets: Uint8Array | readonly Uint8Array[]): Promise<void> {
    if (!this.connected) {
      throw transportError("NNRP_WEBSOCKET_CLOSED", "WebSocket connection is closed.");
    }
    for (const packet of normalizePackets(packets)) {
      await waitForBufferedAmount(this.socket);
      this.socket.send(packet);
    }
  }

  async receive(options: NnrpTransportReceiveOptions = {}): Promise<readonly Uint8Array[]> {
    const maxPackets = options.maxPackets ?? 16;
    const timeoutMillis = options.timeoutMillis ?? 30_000;
    if (!Number.isInteger(maxPackets) || maxPackets <= 0) {
      throw new RangeError("maxPackets must be a positive integer");
    }
    if (this.#packets.length === 0 && this.#protocolError === undefined && this.connected) {
      await this.#wait(timeoutMillis);
    }
    if (this.#protocolError !== undefined) {
      throw this.#protocolError;
    }
    if (this.#packets.length === 0 && !this.connected) {
      throw transportError("NNRP_WEBSOCKET_CLOSED", "WebSocket connection closed before a packet arrived.");
    }
    return this.#packets.splice(0, maxPackets);
  }

  close(): void {
    if (this.socket.readyState < this.socketCtor.CLOSING) {
      this.socket.close();
    }
  }

  async #onMessage(event: MessageEvent): Promise<void> {
    try {
      this.#packets.push(await binaryMessage(event.data));
    } catch (error) {
      this.#protocolError = error instanceof NnrpTransportError
        ? error
        : transportError("NNRP_WEBSOCKET_BINARY_REQUIRED", "WebSocket transport accepts binary messages only.");
    }
    this.#wake();
  }

  #wait(timeoutMillis: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const index = this.#waiters.indexOf(wake);
        if (index >= 0) this.#waiters.splice(index, 1);
        reject(transportError("NNRP_WEBSOCKET_RECEIVE_TIMEOUT", "WebSocket receive timed out.", true));
      }, timeoutMillis);
      this.#waiters.push(wake);
    });
  }

  #wake(): void {
    for (const waiter of this.#waiters.splice(0)) waiter();
  }
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(transportError("NNRP_WEBSOCKET_CONNECT_FAILED", "WebSocket transport failed to connect.", true)),
      { once: true },
    );
  });
}

async function waitForBufferedAmount(socket: WebSocket): Promise<void> {
  while (socket.bufferedAmount > 1_048_576) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function normalizePackets(packets: Uint8Array | readonly Uint8Array[]): readonly Uint8Array[] {
  const normalized = packets instanceof Uint8Array ? [packets] : packets;
  if (
    normalized.length === 0 || normalized.some((packet) => !(packet instanceof Uint8Array) || packet.byteLength === 0)
  ) {
    throw new TypeError("transport send requires one or more non-empty complete NNRP packets");
  }
  return normalized;
}

async function binaryMessage(value: unknown): Promise<Uint8Array> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value).slice();
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  if (typeof Blob !== "undefined" && value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  throw transportError("NNRP_WEBSOCKET_BINARY_REQUIRED", "WebSocket transport accepts binary messages only.");
}

function normalizeWebSocketEndpoint(endpoint: string | URL): string {
  const url = endpoint instanceof URL ? endpoint : new URL(endpoint);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw transportError(
      "NNRP_WEBSOCKET_ENDPOINT_INVALID",
      `WebSocket transport requires ws:// or wss:// endpoint, got ${url.protocol}.`,
    );
  }
  return url.toString();
}

function transportError(code: string, message: string, retryable = false): NnrpTransportError {
  return new NnrpTransportError({ code, message, source: "transport", retryable, transport: "websocket" });
}

function unavailableDiagnostic(): NnrpDiagnostic {
  return {
    code: "NNRP_WEBSOCKET_RUNTIME_MISSING",
    message: "WebSocket transport requires a native binding or browser WebSocket runtime.",
    source: "transport",
    retryable: false,
    transport: "websocket",
  };
}
