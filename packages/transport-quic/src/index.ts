import { type NnrpDiagnostic, type NnrpTransportCandidate } from "@nnrp/core";

export interface NnrpQuicTransportProviderOptions {
  readonly available?: boolean;
  readonly score?: number;
  readonly endpointScheme?: "quic";
  readonly diagnostic?: NnrpDiagnostic;
}

export interface NnrpQuicTransportProvider {
  readonly kind: "quic";
  readonly endpointScheme: "quic";
  probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
}

export function createQuicTransportProvider(
  options: NnrpQuicTransportProviderOptions = {},
): NnrpQuicTransportProvider {
  return {
    kind: "quic",
    endpointScheme: options.endpointScheme ?? "quic",
    probe: () => ({
      kind: "quic",
      peerSupported: true,
      localAvailable: options.available ?? true,
      score: options.score ?? 80,
      ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
    }),
  };
}
