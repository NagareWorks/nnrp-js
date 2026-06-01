import {
  createBackendNativeManifest,
  createBrowserWasmManifest,
  type NnrpBuildMode,
  type NnrpCapability,
  type NnrpCapabilityManifest,
  type NnrpDiagnostic,
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
  readonly results: readonly SdkBenchmarkResult[];
  readonly diagnostics: readonly NnrpDiagnostic[];
}

export interface SdkBenchmarkResult {
  readonly name: string;
  readonly status: "measured" | "skipped";
  readonly unit: "operations";
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

  return {
    sdk: "nnrp-js",
    generatedAt: new Date().toISOString(),
    buildMode,
    artifactVersion: options.artifactVersion ?? null,
    manifest: buildManifest.manifest,
    cases: buildManifest.manifest.capabilities.map((capability) => ({
      id: `${buildMode}.${capability}`,
      status: "passed",
      capability,
    })),
    diagnostics: [adapterDiagnostic(buildMode)],
  };
}

export function createBenchmarkReport(
  buildMode: NnrpBuildMode,
  options: Omit<SdkCommandOptions, "mode"> = {},
): SdkBenchmarkReport {
  const buildManifest = createBuildManifest(buildMode, { mode: buildMode, ...options });

  return {
    sdk: "nnrp-js",
    generatedAt: new Date().toISOString(),
    buildMode,
    artifactVersion: options.artifactVersion ?? null,
    manifest: buildManifest.manifest,
    results: [
      {
        name: "capability_manifest_generation",
        status: "measured",
        unit: "operations",
        value: buildManifest.manifest.capabilities.length,
      },
    ],
    diagnostics: [benchmarkDiagnostic(buildMode)],
  };
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

function benchmarkDiagnostic(buildMode: NnrpBuildMode): NnrpDiagnostic {
  return {
    code: "NNRP_JS_BENCHMARK_SMOKE",
    message: `${buildMode} benchmark report is a command-shape smoke until runtime execution is wired.`,
    source: "runtime",
    retryable: false,
  };
}
