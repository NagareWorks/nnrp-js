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
import { loadPackagedIpcBinding } from "./native.js";

export interface NnrpIpcTransportProviderOptions {
  readonly available?: boolean;
  readonly cost?: NnrpTransportProviderCost;
  readonly preferenceRank?: number;
  readonly maxFrameBytes?: bigint;
  readonly diagnostic?: NnrpDiagnostic;
  readonly binding?: NnrpNativeTransportBinding;
  readonly platform?: "unix" | "windows";
}

export interface NnrpIpcTransportProvider extends NnrpTransportProvider {
  readonly kind: "ipc";
  readonly endpointSchemes: readonly ["unix", "npipe"];
  probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
  connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
  listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}

export function createIpcTransportProvider(options: NnrpIpcTransportProviderOptions = {}): NnrpIpcTransportProvider {
  const platform = options.platform ?? hostIpcPlatform();
  const loaded = options.binding !== undefined
    ? { binding: options.binding }
    : options.available === false
    ? {}
    : loadPackagedIpcBinding();
  const available = options.available ?? loaded.binding !== undefined;
  const diagnostic = options.diagnostic ?? loaded.diagnostic ?? unavailableDiagnostic();
  return {
    kind: "ipc",
    metadata: {
      id: "nnrp.transport.ipc.native",
      cost: options.cost ?? { modelId: 0, units: 0n },
      preferenceRank: options.preferenceRank ?? 0,
      limits: { maxFrameBytes: options.maxFrameBytes ?? 67_108_864n },
      limitations: [
        "local-host-only",
        "native-host-only",
        platform === "windows" ? "windows-named-pipe" : "unix-domain-socket",
      ],
    },
    localAvailable: available,
    ...(available ? {} : { diagnostic }),
    endpointSchemes: ["unix", "npipe"],
    probe: async (endpoint) =>
      await requireBinding(loaded.binding, loaded.diagnostic, "probe").probe(validateEndpoint(endpoint, platform)),
    connect: async (endpoint) =>
      await requireBinding(loaded.binding, loaded.diagnostic, "connect").connect(validateEndpoint(endpoint, platform)),
    listen: async (endpoint) =>
      await requireBinding(loaded.binding, loaded.diagnostic, "listen").listen(validateEndpoint(endpoint, platform)),
  };
}

function validateEndpoint<T extends NnrpTransportEndpoint>(options: T, platform: "unix" | "windows"): T {
  const expected = platform === "windows" ? "npipe:" : "unix:";
  const endpoint = String(options.endpoint);
  const separator = endpoint.indexOf(":");
  const protocol = separator < 0 ? "" : endpoint.slice(0, separator + 1).toLowerCase();
  if (protocol !== expected || !endpoint.startsWith(`${expected}//`) || endpoint.length === expected.length + 2) {
    throw new NnrpTransportError({
      code: "NNRP_IPC_ENDPOINT_PLATFORM_MISMATCH",
      message: `IPC ${platform} host requires a non-empty ${expected}// endpoint, got ${protocol || "no scheme"}.`,
      source: "transport",
      retryable: false,
      transport: "ipc",
    });
  }
  if (options.security !== undefined) {
    throw new NnrpTransportError({
      code: "NNRP_IPC_SECURITY_INVALID",
      message: "IPC endpoints do not accept transport security configuration.",
      source: "transport",
      retryable: false,
      transport: "ipc",
    });
  }
  return options;
}

function hostIpcPlatform(): "unix" | "windows" {
  const runtime = (globalThis as typeof globalThis & { Deno?: { build?: { os?: string } } }).Deno;
  if (runtime?.build?.os === "windows") return "windows";
  if (runtime?.build?.os !== undefined) return "unix";
  const nodeProcess = (globalThis as typeof globalThis & { process?: { platform?: string } }).process;
  if (nodeProcess !== undefined) return nodeProcess.platform === "win32" ? "windows" : "unix";
  throw new NnrpTransportError({
    code: "NNRP_IPC_BROWSER_UNSUPPORTED",
    message: "IPC transport is not available in browser runtimes.",
    source: "transport",
    retryable: false,
    transport: "ipc",
  });
}

function requireBinding(
  binding: NnrpNativeTransportBinding | undefined,
  diagnostic: NnrpDiagnostic | undefined,
  operation: "probe" | "connect" | "listen",
): NnrpNativeTransportBinding {
  if (binding === undefined) {
    throw new NnrpTransportError({
      ...(diagnostic ?? unavailableDiagnostic()),
      message: `IPC transport ${operation} requires its packaged Rust transport artifact.`,
    });
  }
  return binding;
}

function unavailableDiagnostic(): NnrpDiagnostic {
  return {
    code: "NNRP_IPC_NATIVE_BINDING_MISSING",
    message: "IPC transport requires its packaged Rust transport artifact.",
    source: "transport",
    retryable: false,
    transport: "ipc",
  };
}
