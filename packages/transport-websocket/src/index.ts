import { type NnrpDiagnostic, type NnrpTransportCandidate } from "@nnrp/core";

export interface NnrpWebSocketTransportProviderOptions {
  readonly available?: boolean;
  readonly score?: number;
  readonly endpointScheme?: "ws" | "wss";
  readonly diagnostic?: NnrpDiagnostic;
}

export interface NnrpWebSocketTransportProvider {
  readonly kind: "websocket";
  readonly endpointScheme: "ws" | "wss";
  probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
}

export function createWebSocketTransportProvider(
  options: NnrpWebSocketTransportProviderOptions = {},
): NnrpWebSocketTransportProvider {
  return {
    kind: "websocket",
    endpointScheme: options.endpointScheme ?? "wss",
    probe: () => ({
      kind: "websocket",
      peerSupported: true,
      localAvailable: options.available ?? true,
      score: options.score ?? 70,
      ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
    }),
  };
}
