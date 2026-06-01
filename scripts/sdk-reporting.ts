import {
  createBackendNativeManifest,
  createBrowserWasmManifest,
  createCapabilityManifest,
  createTransportCandidates,
  createTransportSelectionSummary,
  type NnrpBuildMode,
  type NnrpCapability,
  type NnrpCapabilityManifest,
  type NnrpDiagnostic,
  type NnrpTransportSelectionSummary,
  selectTransport,
} from "@nnrp/core";

export type SdkCommandMode = NnrpBuildMode | "all";

export interface SdkCommandOptions {
  readonly mode: SdkCommandMode;
  readonly artifactVersion?: string;
}

export interface SdkCapabilityManifestReport {
  readonly sdk: "nnrp-js";
  readonly generatedAt: string;
  readonly manifests: readonly SdkBuildManifest[];
}

export interface SdkBuildManifest {
  readonly buildMode: NnrpBuildMode;
  readonly artifactVersion: string | null;
  readonly manifest: NnrpCapabilityManifest;
}

export interface SdkConformanceReport {
  readonly sdk: "nnrp-js";
  readonly generatedAt: string;
  readonly buildMode: NnrpBuildMode;
  readonly artifactVersion: string | null;
  readonly manifest: NnrpCapabilityManifest;
  readonly cases: readonly SdkConformanceCaseResult[];
  readonly transport: NnrpTransportSelectionSummary;
  readonly diagnostics: readonly NnrpDiagnostic[];
}

export interface SdkConformanceCaseResult {
  readonly id: string;
  readonly status: "passed" | "skipped";
  readonly capability: NnrpCapability;
  readonly diagnostic?: NnrpDiagnostic;
}

export interface SdkBenchmarkReport {
  readonly sdk: "nnrp-js";
  readonly generatedAt: string;
  readonly buildMode: NnrpBuildMode;
  readonly artifactVersion: string | null;
  readonly manifest: NnrpCapabilityManifest;
  readonly transport: NnrpTransportSelectionSummary;
  readonly results: readonly SdkBenchmarkResult[];
  readonly diagnostics: readonly NnrpDiagnostic[];
}

export interface SdkBenchmarkResult {
  readonly name: string;
  readonly category: "capability" | "latency" | "throughput" | "transport";
  readonly status: "measured" | "skipped";
  readonly unit: "count" | "milliseconds" | "operations" | "operations/second";
  readonly value: number;
  readonly diagnostic?: NnrpDiagnostic;
}

export function createCapabilityManifestReport(options: SdkCommandOptions): SdkCapabilityManifestReport {
  return {
    sdk: "nnrp-js",
    generatedAt: new Date().toISOString(),
    manifests: selectBuildModes(options.mode).map((buildMode) => createBuildManifest(buildMode, options)),
  };
}

export function createConformanceReport(
  buildMode: NnrpBuildMode,
  options: Omit<SdkCommandOptions, "mode"> = {},
): SdkConformanceReport {
  const buildManifest = createBuildManifest(buildMode, { mode: buildMode, ...options });
  const transport = createSdkTransportSelection(buildManifest.manifest);

  return {
    sdk: "nnrp-js",
    generatedAt: new Date().toISOString(),
    buildMode,
    artifactVersion: options.artifactVersion ?? null,
    manifest: buildManifest.manifest,
    transport,
    cases: [
      ...buildManifest.manifest.capabilities.map((capability) => ({
        id: `${buildMode}.${capability}`,
        status: "passed" as const,
        capability,
      })),
      unavailableArtifactCase(buildMode),
    ],
    diagnostics: [adapterDiagnostic(buildMode), unavailableArtifactDiagnostic(buildMode)],
  };
}

export function createBenchmarkReport(
  buildMode: NnrpBuildMode,
  options: Omit<SdkCommandOptions, "mode"> = {},
): SdkBenchmarkReport {
  const buildManifest = createBuildManifest(buildMode, { mode: buildMode, ...options });
  const transport = createSdkTransportSelection(buildManifest.manifest);

  return {
    sdk: "nnrp-js",
    generatedAt: new Date().toISOString(),
    buildMode,
    artifactVersion: options.artifactVersion ?? null,
    manifest: buildManifest.manifest,
    transport,
    results: [
      {
        name: "capability_manifest_generation",
        category: "capability",
        status: "measured",
        unit: "operations",
        value: buildManifest.manifest.capabilities.length,
      },
      {
        name: "runtime_latency_p50",
        category: "latency",
        status: "skipped",
        unit: "milliseconds",
        value: 0,
        diagnostic: benchmarkDiagnostic(buildMode),
      },
      {
        name: "runtime_throughput",
        category: "throughput",
        status: "skipped",
        unit: "operations/second",
        value: 0,
        diagnostic: benchmarkDiagnostic(buildMode),
      },
      {
        name: "transport_candidates",
        category: "transport",
        status: "measured",
        unit: "count",
        value: transport.candidates.length,
      },
      {
        name: "transport_rejections",
        category: "transport",
        status: "measured",
        unit: "count",
        value: transport.rejected.length,
        ...(transport.rejected[0]?.diagnostic === undefined ? {} : { diagnostic: transport.rejected[0].diagnostic }),
      },
    ],
    diagnostics: [benchmarkDiagnostic(buildMode), ...transportDiagnostics(buildMode, transport)],
  };
}

function createSdkTransportSelection(manifest: NnrpCapabilityManifest): NnrpTransportSelectionSummary {
  const peerManifest = createCapabilityManifest({
    buildMode: manifest.buildMode,
    transports: manifest.buildMode === "backend-native" ? ["tcp"] : ["websocket"],
    capabilities: ["client.session"],
  });
  const candidates = createTransportCandidates({
    local: manifest,
    peer: peerManifest,
  });

  return createTransportSelectionSummary(selectTransport(candidates));
}

export function parseCommandOptions(args: readonly string[]): SdkCommandOptions {
  let mode: SdkCommandMode = "all";
  let artifactVersion: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--mode" && next) {
      mode = parseMode(next);
      index += 1;
      continue;
    }

    if (arg === "--artifact-version" && next) {
      artifactVersion = next;
      index += 1;
      continue;
    }
  }

  return {
    mode,
    ...(artifactVersion === undefined ? {} : { artifactVersion }),
  };
}

export function parseMode(value: string): SdkCommandMode {
  if (value === "all" || value === "backend-native" || value === "browser-wasm") {
    return value;
  }

  throw new Error(`Unsupported JS SDK command mode: ${value}`);
}

export function selectBuildModes(mode: SdkCommandMode): readonly NnrpBuildMode[] {
  if (mode === "all") {
    return ["backend-native", "browser-wasm"];
  }

  return [mode];
}

export function writeJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function createBuildManifest(buildMode: NnrpBuildMode, options: SdkCommandOptions): SdkBuildManifest {
  return {
    buildMode,
    artifactVersion: options.artifactVersion ?? null,
    manifest: buildMode === "backend-native"
      ? createBackendNativeManifest(["transport.tcp", "transport.quic"])
      : createBrowserWasmManifest(["transport.websocket", "transport.webtransport"]),
  };
}

function adapterDiagnostic(buildMode: NnrpBuildMode): NnrpDiagnostic {
  return {
    code: "NNRP_JS_ADAPTER_SMOKE",
    message: `${buildMode} adapter report covers manifest-level smoke cases; runtime execution is wired later.`,
    source: "runtime",
    retryable: false,
  };
}

function unavailableArtifactCase(buildMode: NnrpBuildMode): SdkConformanceCaseResult {
  return {
    id: `${buildMode}.artifact-unavailable`,
    status: "skipped",
    capability: buildMode === "backend-native" ? "native.loader" : "wasm.loader",
    diagnostic: unavailableArtifactDiagnostic(buildMode),
  };
}

function unavailableArtifactDiagnostic(buildMode: NnrpBuildMode): NnrpDiagnostic {
  const native = buildMode === "backend-native";
  return {
    code: native ? "NNRP_JS_NATIVE_ARTIFACT_UNAVAILABLE" : "NNRP_JS_WASM_ARTIFACT_UNAVAILABLE",
    message: native
      ? "Backend native conformance execution is skipped until the native FFI artifact is connected."
      : "Browser WASM conformance execution is skipped until the WASM primitive artifact is connected.",
    source: native ? "native" : "wasm",
    retryable: false,
  };
}

function benchmarkDiagnostic(buildMode: NnrpBuildMode): NnrpDiagnostic {
  return {
    code: "NNRP_JS_BENCHMARK_SMOKE",
    message: `${buildMode} benchmark report is a command-shape smoke until runtime execution is wired.`,
    source: "runtime",
    retryable: false,
  };
}

function transportDiagnostics(
  buildMode: NnrpBuildMode,
  transport: NnrpTransportSelectionSummary,
): readonly NnrpDiagnostic[] {
  return [
    {
      code: "NNRP_JS_TRANSPORT_SELECTION",
      message: transport.selected === null
        ? `${buildMode} benchmark smoke did not select a transport.`
        : `${buildMode} benchmark smoke selected ${transport.selected}.`,
      source: "transport",
      retryable: false,
      ...(transport.selected === null ? {} : { transport: transport.selected }),
    },
    ...transport.rejected.map((candidate): NnrpDiagnostic => ({
      code: "NNRP_JS_TRANSPORT_REJECTED",
      message: `${buildMode} rejected ${candidate.kind}: ${candidate.reason}.`,
      source: "transport",
      retryable: candidate.reason === "local-unavailable",
      transport: candidate.kind,
      ...(candidate.diagnostic === undefined ? {} : { cause: candidate.diagnostic }),
    })),
  ];
}
