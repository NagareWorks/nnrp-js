import {
  type NnrpDiagnostic,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportProvider,
  type NnrpTransportProviderCost,
  type NnrpTransportServer,
} from "@nnrp/core";

export interface NnrpQuicNativeBinding {
  connect?(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
  listen?(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}

export interface NnrpQuicTransportProviderOptions {
  readonly available?: boolean;
  readonly cost?: NnrpTransportProviderCost;
  readonly preferenceRank?: number;
  readonly maxFrameBytes?: bigint;
  readonly diagnostic?: NnrpDiagnostic;
  readonly binding?: NnrpQuicNativeBinding;
}

export interface NnrpQuicTransportProvider extends NnrpTransportProvider {
  readonly kind: "quic";
  readonly endpointSchemes: readonly ["quic"];
  connect(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
  listen(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}

export function createQuicTransportProvider(
  options: NnrpQuicTransportProviderOptions = {},
): NnrpQuicTransportProvider {
  const diagnostic = options.diagnostic ?? unavailableDiagnostic("NNRP_QUIC_NATIVE_BINDING_MISSING");
  const hasNative = options.binding !== undefined;
  return {
    kind: "quic",
    metadata: {
      id: "nnrp.transport.quic.native",
      cost: options.cost ?? { modelId: 0, units: 0n },
      preferenceRank: options.preferenceRank ?? 1,
      limits: { maxFrameBytes: options.maxFrameBytes ?? 67_108_864n },
      limitations: ["requires-udp", "native-host-only"],
    },
    localAvailable: options.available ?? hasNative,
    ...((options.available ?? hasNative) ? {} : { diagnostic }),
    endpointSchemes: ["quic"],
    connect: (endpoint) => {
      if (options.binding?.connect === undefined) {
        throw unavailable("connect");
      }
      return options.binding.connect(endpoint);
    },
    listen: (endpoint) => {
      if (options.binding?.listen === undefined) {
        throw unavailable("listen");
      }
      return options.binding.listen(endpoint);
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
    message: "QUIC transport requires a native QUIC transport binding.",
    source: "transport",
    retryable: false,
    transport: "quic",
  };
}
