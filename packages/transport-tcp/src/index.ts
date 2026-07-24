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
import { loadPackagedTcpBinding } from "./native.js";

export interface NnrpTcpTransportProviderOptions {
  readonly available?: boolean;
  readonly cost?: NnrpTransportProviderCost;
  readonly preferenceRank?: number;
  readonly maxFrameBytes?: bigint;
  readonly diagnostic?: NnrpDiagnostic;
  readonly binding?: NnrpNativeTransportBinding;
}

export interface NnrpTcpTransportProvider extends NnrpTransportProvider {
  readonly kind: "tcp";
  readonly endpointSchemes: readonly ["tcp"];
  probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
  connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
  listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}

export function createTcpTransportProvider(
  options: NnrpTcpTransportProviderOptions = {},
): NnrpTcpTransportProvider {
  const loaded = options.binding !== undefined
    ? { binding: options.binding }
    : options.available === false
    ? {}
    : loadPackagedTcpBinding();
  const available = options.available ?? loaded.binding !== undefined;
  const diagnostic = options.diagnostic ?? loaded.diagnostic ?? unavailableDiagnostic();
  return {
    kind: "tcp",
    metadata: {
      id: "nnrp.transport.tcp.native",
      cost: options.cost ?? { modelId: 0, units: 0n },
      preferenceRank: options.preferenceRank ?? 2,
      limits: { maxFrameBytes: options.maxFrameBytes ?? 67_108_864n },
      limitations: ["requires-tcp", "native-host-only"],
    },
    localAvailable: available,
    ...(available ? {} : { diagnostic }),
    endpointSchemes: ["tcp"],
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
      message: `TCP transport ${operation} requires its package-owned native binding.`,
    });
  }
  return binding;
}

function unavailableDiagnostic(): NnrpDiagnostic {
  return {
    code: "NNRP_TCP_NATIVE_BINDING_MISSING",
    message: "TCP transport requires its package-owned Rust transport binding.",
    source: "transport",
    retryable: false,
    transport: "tcp",
  };
}
