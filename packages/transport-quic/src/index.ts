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
  type NnrpTransportProviderMetadata,
  type NnrpTransportServer,
} from "@nnrp/core";
import { loadPackagedQuicBinding } from "./native.js";

export type NnrpQuicNativeBinding = NnrpNativeTransportBinding;

export interface NnrpQuicTransportProviderOptions {
  readonly available?: boolean;
  readonly cost?: NnrpTransportProviderCost;
  readonly preferenceRank?: number;
  readonly maxFrameBytes?: bigint;
  readonly diagnostic?: NnrpDiagnostic;
  readonly binding?: NnrpNativeTransportBinding;
}

export interface NnrpQuicTransportProvider extends NnrpTransportProvider {
  readonly kind: "quic";
  readonly endpointSchemes: readonly ["quic"];
  probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
  connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
  listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}

export function createQuicTransportProvider(
  options: NnrpQuicTransportProviderOptions = {},
): NnrpQuicTransportProvider {
  const loaded = options.binding !== undefined
    ? { binding: options.binding }
    : options.available === false
    ? {}
    : loadPackagedQuicBinding();
  const available = options.available ?? loaded.binding !== undefined;
  const diagnostic = options.diagnostic ?? loaded.diagnostic ?? unavailableDiagnostic();
  const metadata = {
    id: "nnrp.transport.quic.native",
    cost: options.cost ?? { modelId: 0, units: 0n },
    preferenceRank: options.preferenceRank ?? 1,
    limits: { maxFrameBytes: options.maxFrameBytes ?? 67_108_864n },
    limitations: ["requires-udp", "native-host-only"],
  } satisfies NnrpTransportProviderMetadata;
  return {
    kind: "quic",
    descriptor: {
      name: "@nnrp/transport-quic",
      version: "1.0.0-preview.4.4",
      transportId: "quic",
      kind: "native-dynamic",
      available,
      metadata,
      ...(available ? {} : { diagnostic: diagnostic.message }),
    },
    metadata,
    localAvailable: available,
    ...(available ? {} : { diagnostic }),
    endpointSchemes: ["quic"],
    probe: async (endpoint) => await requireBinding(loaded.binding, diagnostic, "probe").probe(endpoint),
    connect: async (endpoint) => await requireBinding(loaded.binding, diagnostic, "connect").connect(endpoint),
    listen: async (endpoint) => await requireBinding(loaded.binding, diagnostic, "listen").listen(endpoint),
  };
}

function requireBinding(
  binding: NnrpNativeTransportBinding | undefined,
  diagnostic: NnrpDiagnostic,
  operation: "probe" | "connect" | "listen",
): NnrpNativeTransportBinding {
  if (binding === undefined) {
    throw new NnrpTransportError({
      ...diagnostic,
      message: `QUIC transport ${operation} requires its package-owned native binding.`,
    });
  }
  return binding;
}

function unavailableDiagnostic(): NnrpDiagnostic {
  return {
    code: "NNRP_QUIC_NATIVE_BINDING_MISSING",
    message: "QUIC transport requires its package-owned Rust transport binding.",
    source: "transport",
    retryable: false,
    transport: "quic",
  };
}
