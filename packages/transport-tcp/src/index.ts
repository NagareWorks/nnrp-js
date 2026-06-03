import { type NnrpDiagnostic, type NnrpTransportCandidate } from "@nnrp/core";

export interface NnrpTcpTransportProviderOptions {
  readonly available?: boolean;
  readonly score?: number;
  readonly endpointScheme?: "tcp";
  readonly diagnostic?: NnrpDiagnostic;
}

export interface NnrpTcpTransportProvider {
  readonly kind: "tcp";
  readonly endpointScheme: "tcp";
  probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
}

export function createTcpTransportProvider(
  options: NnrpTcpTransportProviderOptions = {},
): NnrpTcpTransportProvider {
  return {
    kind: "tcp",
    endpointScheme: options.endpointScheme ?? "tcp",
    probe: () => ({
      kind: "tcp",
      peerSupported: true,
      localAvailable: options.available ?? true,
      score: options.score ?? 60,
      ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
    }),
  };
}
