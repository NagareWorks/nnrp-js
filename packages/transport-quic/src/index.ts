import {
  type NnrpDiagnostic,
  type NnrpTransportCandidate,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportProvider,
  type NnrpTransportServer,
} from "@nnrp/core";

export interface NnrpQuicNativeBinding {
  connect?(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
  listen?(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}

export interface NnrpQuicTransportProviderOptions {
  readonly available?: boolean;
  readonly score?: number;
  readonly diagnostic?: NnrpDiagnostic;
  readonly native?: NnrpQuicNativeBinding;
}

export interface NnrpQuicTransportProvider extends NnrpTransportProvider {
  readonly kind: "quic";
  readonly endpointSchemes: readonly ["quic"];
  probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
  connect(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
  listen(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}

export function createQuicTransportProvider(
  options: NnrpQuicTransportProviderOptions = {},
): NnrpQuicTransportProvider {
  const diagnostic = options.diagnostic ?? unavailableDiagnostic("NNRP_QUIC_NATIVE_BINDING_MISSING");
  const hasNative = options.native !== undefined;
  return {
    kind: "quic",
    endpointSchemes: ["quic"],
    probe: () => ({
      kind: "quic",
      peerSupported: true,
      localAvailable: options.available ?? hasNative,
      score: options.score ?? 80,
      ...((options.available ?? hasNative) ? {} : { diagnostic }),
    }),
    connect: (endpoint) => {
      if (options.native?.connect === undefined) {
        throw unavailable("connect");
      }
      return options.native.connect(endpoint);
    },
    listen: (endpoint) => {
      if (options.native?.listen === undefined) {
        throw unavailable("listen");
      }
      return options.native.listen(endpoint);
    },
  };
}

function unavailable(operation: "connect" | "listen"): NnrpTransportError {
  return new NnrpTransportError({
    ...unavailableDiagnostic("NNRP_QUIC_NATIVE_BINDING_MISSING"),
    message: `QUIC transport ${operation} requires an injected native QUIC transport binding.`,
  });
}

function unavailableDiagnostic(code: string): NnrpDiagnostic {
  return {
    code,
    message: "QUIC transport requires an injected native QUIC transport binding.",
    source: "transport",
    retryable: false,
    transport: "quic",
  };
}
