import {
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

const DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.22";
const PREVIEW4_RUNTIME_CAPABILITIES = [
  "cache",
  "schema",
  "flow.update",
  "result.hint",
  "control.cancel_abort",
  "control.supersede",
  "control.priority_update",
  "control.deadline_expire",
  "control.progress_partial",
  "control.credit_backpressure",
  "control.capability_costs",
  "control.route_execution_hint",
  "control.trace_context",
  "control.result_drop_reason",
  "control.degrade_profile",
  "control.budget_update",
  "control.recoverable_error",
  "object.lifecycle",
  "object.delta",
  "object.cost",
  "object.ownership",
  "cache.reference",
] as const satisfies readonly NnrpCapability[];

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

export interface SdkBenchmarkSmokeThresholds {
  readonly minCapabilities: number;
  readonly minTransportCandidates: number;
}

export const DEFAULT_BENCHMARK_SMOKE_THRESHOLDS: SdkBenchmarkSmokeThresholds = {
  minCapabilities: 3,
  minTransportCandidates: 1,
};

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
    artifactVersion: buildManifest.artifactVersion,
    manifest: buildManifest.manifest,
    transport,
    cases: buildManifest.manifest.capabilities.map((capability) => ({
      id: `${buildMode}.${capability}.adapter-contract`,
      status: "skipped" as const,
      capability,
      diagnostic: adapterCapabilityDiagnostic(buildMode, capability),
    })),
    diagnostics: [adapterDiagnostic(buildMode)],
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
    artifactVersion: buildManifest.artifactVersion,
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

export function assertBenchmarkSmokeThresholds(
  report: SdkBenchmarkReport,
  thresholds: SdkBenchmarkSmokeThresholds = DEFAULT_BENCHMARK_SMOKE_THRESHOLDS,
): void {
  const capabilityCount = benchmarkValue(report, "capability_manifest_generation");
  if (capabilityCount < thresholds.minCapabilities) {
    throw new Error(
      `${report.buildMode} benchmark smoke capability count ${capabilityCount} is below ${thresholds.minCapabilities}`,
    );
  }

  const transportCandidateCount = benchmarkValue(report, "transport_candidates");
  if (transportCandidateCount < thresholds.minTransportCandidates) {
    throw new Error(
      `${report.buildMode} benchmark smoke transport candidate count ${transportCandidateCount} is below ${thresholds.minTransportCandidates}`,
    );
  }

  if (report.transport.selected === null) {
    throw new Error(`${report.buildMode} benchmark smoke did not select a transport`);
  }
}

function benchmarkValue(report: SdkBenchmarkReport, name: string): number {
  const result = report.results.find((entry) => entry.name === name);
  if (result === undefined || result.status !== "measured") {
    throw new Error(`${report.buildMode} benchmark smoke is missing measured result ${name}`);
  }
  return result.value;
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
    providers: peerManifest.transports.map((kind) => ({
      kind,
      metadata: {
        id: `nnrp.transport.${kind}.benchmark`,
        cost: { modelId: 0, units: 0n },
        preferenceRank: 0,
        limits: { maxFrameBytes: 67_108_864n },
        limitations: [],
      },
      localAvailable: true,
    })),
    candidateReadiness: peerManifest.transports.map((kind) => ({
      kind,
      providerId: `nnrp.transport.${kind}.benchmark`,
      routeResolved: true,
      securitySatisfied: true,
    })),
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
  console.log(JSON.stringify(value, (_key, entry) => typeof entry === "bigint" ? entry.toString(10) : entry, 2));
}

function createBuildManifest(buildMode: NnrpBuildMode, options: SdkCommandOptions): SdkBuildManifest {
  return {
    buildMode,
    artifactVersion: options.artifactVersion ?? DEFAULT_RUST_ARTIFACT_VERSION,
    manifest: createCapabilityManifest({
      buildMode,
      transports: buildMode === "backend-native" ? ["tcp", "quic", "ipc", "websocket"] : ["websocket"],
      capabilities: buildMode === "backend-native"
        ? ["client.session", "server.session", "recovery", ...PREVIEW4_RUNTIME_CAPABILITIES]
        : ["client.session", "wasm.loader", ...PREVIEW4_RUNTIME_CAPABILITIES],
    }),
  };
}

function adapterDiagnostic(buildMode: NnrpBuildMode): NnrpDiagnostic {
  return {
    code: "NNRP_JS_ADAPTER_CONTRACT_ONLY",
    message:
      `${buildMode} adapter smoke validates report and manifest shape; runtime wire evidence belongs to the separate wire-conformance harness.`,
    source: "runtime",
    retryable: false,
  };
}

function adapterCapabilityDiagnostic(buildMode: NnrpBuildMode, capability: NnrpCapability): NnrpDiagnostic {
  return {
    code: "NNRP_JS_WIRE_CONFORMANCE_NOT_EXECUTED",
    message:
      `${buildMode} adapter smoke does not execute ${capability}; use the wire-conformance harness for runtime evidence.`,
    source: "runtime",
    retryable: false,
  };
}

function benchmarkDiagnostic(buildMode: NnrpBuildMode): NnrpDiagnostic {
  return {
    code: "NNRP_JS_BENCHMARK_SMOKE",
    message:
      `${buildMode} command-shape smoke does not execute benchmark workloads; use benchmark:conformance with an execution plan for measured runtime results.`,
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
