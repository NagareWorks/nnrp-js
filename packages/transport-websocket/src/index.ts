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
  type NnrpTransportServer,
} from "@nnrp/core";
import { connectBrowserWebSocket, websocketUnavailableDiagnostic } from "./browser.js";
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
  const diagnostic = options.diagnostic ?? loaded.diagnostic ?? websocketUnavailableDiagnostic();
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
