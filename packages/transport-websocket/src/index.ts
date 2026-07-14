import {
  type NnrpDiagnostic,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportProvider,
  type NnrpTransportProviderCost,
} from "@nnrp/core";

export interface NnrpWebSocketTransportProviderOptions {
  readonly available?: boolean;
  readonly cost?: NnrpTransportProviderCost;
  readonly preferenceRank?: number;
  readonly maxFrameBytes?: bigint;
  readonly diagnostic?: NnrpDiagnostic;
  readonly WebSocket?: typeof WebSocket;
}

export interface NnrpWebSocketTransportProvider extends NnrpTransportProvider {
  readonly kind: "websocket";
  readonly endpointSchemes: readonly ["ws", "wss"];
  connect(options: NnrpTransportEndpoint): Promise<NnrpWebSocketTransportConnection>;
}

export interface NnrpWebSocketTransportConnection extends NnrpTransportConnection {
  readonly kind: "websocket";
  readonly socket: WebSocket;
}

export function createWebSocketTransportProvider(
  options: NnrpWebSocketTransportProviderOptions = {},
): NnrpWebSocketTransportProvider {
  const socketCtor = "WebSocket" in options ? options.WebSocket : globalThis.WebSocket;
  const available = options.available ?? socketCtor !== undefined;
  return {
    kind: "websocket",
    metadata: {
      id: "nnrp.transport.websocket.browser-wasm",
      cost: options.cost ?? { modelId: 0, units: 0n },
      preferenceRank: options.preferenceRank ?? 3,
      limits: { maxFrameBytes: options.maxFrameBytes ?? 67_108_864n },
      limitations: ["requires-tcp", "browser-host-only"],
    },
    localAvailable: available,
    ...(available ? {} : { diagnostic: options.diagnostic ?? unavailableDiagnostic() }),
    endpointSchemes: ["ws", "wss"],
    connect: (endpoint) => connectWebSocket(endpoint, socketCtor),
  };
}

async function connectWebSocket(
  options: NnrpTransportEndpoint,
  socketCtor: typeof WebSocket | undefined,
): Promise<NnrpWebSocketTransportConnection> {
  if (socketCtor === undefined) {
    throw new NnrpTransportError(unavailableDiagnostic());
  }

  const endpoint = normalizeWebSocketEndpoint(options.endpoint);
  const socket = new socketCtor(endpoint);

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () =>
      reject(
        new NnrpTransportError({
          code: "NNRP_WEBSOCKET_CONNECT_FAILED",
          message: "WebSocket transport failed to connect.",
          source: "transport",
          retryable: true,
          transport: "websocket",
        }),
      ), { once: true });
  });

  return {
    kind: "websocket",
    endpoint,
    socket,
    get connected() {
      return socket.readyState === socketCtor.OPEN;
    },
    send: (payload) => socket.send(payload),
    close: () => socket.close(),
  };
}

function normalizeWebSocketEndpoint(endpoint: string | URL): string {
  const url = endpoint instanceof URL ? endpoint : new URL(endpoint);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new NnrpTransportError({
      code: "NNRP_WEBSOCKET_ENDPOINT_INVALID",
      message: `WebSocket transport requires ws:// or wss:// endpoint, got ${url.protocol}.`,
      source: "transport",
      retryable: false,
      transport: "websocket",
    });
  }
  return url.toString();
}

function unavailableDiagnostic(): NnrpDiagnostic {
  return {
    code: "NNRP_WEBSOCKET_RUNTIME_MISSING",
    message: "WebSocket transport requires a WebSocket runtime implementation.",
    source: "transport",
    retryable: false,
    transport: "websocket",
  };
}
