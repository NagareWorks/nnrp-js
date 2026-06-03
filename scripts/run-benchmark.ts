import { createCapabilityManifest, type NnrpResult, type NnrpTransportKind } from "@nnrp/core";
import { openBrowserRuntime } from "@nnrp/browser-client";
import { type NnrpNativeFfiBinding, openNativeClient } from "@nnrp/native-client";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import { createBenchmarkReport, parseCommandOptions, selectBuildModes, writeJson } from "./sdk-reporting.ts";

const RESULT_SCHEMA_URL =
  "https://raw.githubusercontent.com/NagareWorks/nnrp-conformance/main/schemas/benchmark-results.schema.json";
const DEFAULT_DURATION_SECONDS = 10;
const DEFAULT_ITERATIONS = 100_000;
const DEFAULT_WARMUP_ITERATIONS = 1_000;
const INLINE_PAYLOAD_BYTES = 1024;

interface BenchmarkExecutionPlan {
  readonly protocol_version: string;
  readonly implementation_name: string;
  readonly artifacts: {
    readonly results_path: string;
    readonly evidence_dir: string;
  };
  readonly scenarios: readonly BenchmarkScenario[];
}

interface BenchmarkScenario {
  readonly id: string;
  readonly category: "latency" | "throughput";
  readonly workload: BenchmarkWorkload;
}

interface BenchmarkWorkload {
  readonly operation: string;
  readonly payload: string;
  readonly transport?: string;
  readonly iterations?: number;
  readonly warmup_iterations?: number;
  readonly duration_seconds?: number;
}

interface BenchmarkResultReport {
  readonly $schema: string;
  readonly protocol_version: string;
  readonly implementation_name: string;
  readonly environment: BenchmarkEnvironment;
  readonly results: readonly BenchmarkScenarioResult[];
}

interface BenchmarkEnvironment {
  readonly sdk_commit?: string;
  readonly host_runtime: string;
  readonly os: string;
  readonly arch: string;
  readonly cpu?: string;
  readonly notes?: string;
}

interface BenchmarkScenarioResult {
  readonly id: string;
  readonly outcome: "measured" | "skip" | "error";
  readonly samples?: readonly BenchmarkSample[];
  readonly metrics?: BenchmarkMetrics;
  readonly message?: string;
}

interface BenchmarkSample {
  readonly value: number;
  readonly unit: string;
}

interface BenchmarkMetrics {
  readonly p50_us?: number;
  readonly p95_us?: number;
  readonly p99_us?: number;
  readonly throughput_ops_per_sec?: number;
  readonly peak_memory_bytes?: number;
}

interface Measurement {
  readonly iterations: number;
  readonly seconds: number;
  readonly samplesUs: readonly number[];
}

async function buildConformanceBenchmarkResults(planPath: string): Promise<BenchmarkResultReport> {
  const plan = JSON.parse(await Deno.readTextFile(planPath)) as BenchmarkExecutionPlan;
  return {
    $schema: RESULT_SCHEMA_URL,
    protocol_version: plan.protocol_version,
    implementation_name: plan.implementation_name,
    environment: buildEnvironment(),
    results: await Promise.all(plan.scenarios.map((scenario) => runScenario(scenario))),
  };
}

async function runScenario(scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
  try {
    switch (scenario.workload.operation) {
      case "runtime_probe":
        return runRuntimeProbe(scenario);
      case "session_lifecycle":
        return await runSessionLifecycle(scenario);
      case "submit_result_loop":
        return await runSubmitResultLoop(scenario);
      case "transport_loopback":
        return await runTransportLoopback(scenario);
      default:
        return skipResult(scenario.id, `JS benchmark runner does not implement ${scenario.workload.operation}.`);
    }
  } catch (error) {
    return {
      id: scenario.id,
      outcome: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function runRuntimeProbe(scenario: BenchmarkScenario): BenchmarkScenarioResult {
  const iterations = positiveInt(scenario.workload.iterations, DEFAULT_ITERATIONS);
  const warmupIterations = nonNegativeInt(scenario.workload.warmup_iterations, Math.min(10_000, iterations));
  const local = createCapabilityManifest({
    buildMode: "browser-wasm",
    transports: ["websocket"],
    capabilities: ["client.session", "cache", "schema"],
  });

  const operation = () => {
    if (local.buildMode !== "browser-wasm" || !local.transports.includes("websocket")) {
      throw new Error("runtime probe manifest mismatch");
    }
  };

  for (let index = 0; index < warmupIterations; index += 1) {
    operation();
  }

  return measuredLatencyResult(scenario.id, measureSyncSamples(operation, iterations));
}

async function runSessionLifecycle(scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
  const iterations = positiveInt(scenario.workload.iterations, DEFAULT_ITERATIONS);
  const warmupIterations = nonNegativeInt(scenario.workload.warmup_iterations, Math.min(10_000, iterations));
  const runtime = await openBrowserRuntime({
    transportProviders: [createWebSocketTransportProvider({ WebSocket: FakeWebSocket as unknown as typeof WebSocket })],
  });
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  let sessionCounter = 0;

  const operation = () => {
    sessionCounter += 1;
    const session = client.openSession({ sessionId: `session-${sessionCounter}` });
    void session.close();
  };

  for (let index = 0; index < warmupIterations; index += 1) {
    operation();
  }

  try {
    return measuredLatencyResult(scenario.id, measureSyncSamples(operation, iterations));
  } finally {
    await runtime.close();
  }
}

async function runSubmitResultLoop(scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
  const durationSeconds = positiveInt(scenario.workload.duration_seconds, DEFAULT_DURATION_SECONDS);
  const warmupIterations = nonNegativeInt(scenario.workload.warmup_iterations, DEFAULT_WARMUP_ITERATIONS);
  const payload = new Uint8Array(INLINE_PAYLOAD_BYTES);
  const ffi: NnrpNativeFfiBinding = {
    mode: "test",
    submitResultCompact: ({ submit }): NnrpResult => ({
      frameId: submit.frameId,
      payload,
    }),
    awaitEvents: () => [],
  };
  const client = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    env: {},
    ffi,
    transports: [createTcpTransportProvider()],
  });
  const session = client.openSession({ sessionId: "benchmark-submit-result" });
  let frameId = 0;

  const operation = async () => {
    frameId += 1;
    await session.submit({ frameId, payload });
  };

  for (let index = 0; index < warmupIterations; index += 1) {
    await operation();
  }

  try {
    return measuredThroughputResult(scenario.id, await measureAsyncThroughput(operation, durationSeconds));
  } finally {
    await client.runtime.close();
  }
}

async function runTransportLoopback(scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
  const transport = scenario.workload.transport as NnrpTransportKind | undefined;
  if (transport === "quic") {
    return skipResult(scenario.id, "QUIC loopback benchmark requires an injected native QUIC binding.");
  }
  if (transport !== "tcp") {
    return skipResult(
      scenario.id,
      `JS benchmark runner does not implement ${transport ?? "unknown"} transport loopback.`,
    );
  }

  const durationSeconds = positiveInt(scenario.workload.duration_seconds, DEFAULT_DURATION_SECONDS);
  const warmupIterations = nonNegativeInt(scenario.workload.warmup_iterations, DEFAULT_WARMUP_ITERATIONS);
  const payload = new Uint8Array(INLINE_PAYLOAD_BYTES);
  const provider = createTcpTransportProvider();
  const server = await provider.listen({ endpoint: "127.0.0.1:0" });
  server.server.on("connection", (socket) => {
    socket.setNoDelay(true);
    socket.on("data", (chunk) => socket.write(chunk));
  });
  const client = await provider.connect({ endpoint: server.endpoint });
  const nextEcho = createTcpEchoReader(client.socket);

  const operation = async () => {
    await client.send(payload);
    await nextEcho();
  };

  for (let index = 0; index < warmupIterations; index += 1) {
    await operation();
  }

  try {
    return measuredThroughputResult(scenario.id, await measureAsyncThroughput(operation, durationSeconds));
  } finally {
    client.close();
    await server.close();
  }
}

function createTcpEchoReader(
  socket: { on(event: "data", listener: (chunk: Uint8Array) => void): void },
): () => Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const waiters: Array<(chunk: Uint8Array) => void> = [];
  socket.on("data", (chunk) => {
    const waiter = waiters.shift();
    if (waiter === undefined) {
      chunks.push(chunk);
      return;
    }
    waiter(chunk);
  });

  return () => {
    const chunk = chunks.shift();
    if (chunk !== undefined) {
      return Promise.resolve(chunk);
    }

    return new Promise<Uint8Array>((resolve) => waiters.push(resolve));
  };
}

async function measureAsyncThroughput(operation: () => Promise<void>, durationSeconds: number): Promise<Measurement> {
  const samplesUs: number[] = [];
  let iterations = 0;
  const started = performance.now();
  const deadline = started + durationSeconds * 1000;
  while (performance.now() < deadline) {
    const before = performance.now();
    await operation();
    samplesUs.push((performance.now() - before) * 1000);
    iterations += 1;
  }

  return {
    iterations,
    seconds: (performance.now() - started) / 1000,
    samplesUs,
  };
}

function measureSyncSamples(operation: () => void, iterations: number): Measurement {
  const samplesUs: number[] = [];
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const before = performance.now();
    operation();
    samplesUs.push((performance.now() - before) * 1000);
  }

  return {
    iterations,
    seconds: (performance.now() - started) / 1000,
    samplesUs,
  };
}

function measuredLatencyResult(id: string, measurement: Measurement): BenchmarkScenarioResult {
  return {
    id,
    outcome: "measured",
    metrics: percentileMetrics(measurement.samplesUs),
  };
}

function measuredThroughputResult(id: string, measurement: Measurement): BenchmarkScenarioResult {
  return {
    id,
    outcome: "measured",
    metrics: {
      ...percentileMetrics(measurement.samplesUs),
      throughput_ops_per_sec: measurement.iterations / measurement.seconds,
    },
  };
}

function percentileMetrics(samplesUs: readonly number[]): BenchmarkMetrics {
  const sorted = [...samplesUs].sort((left, right) => left - right);
  return {
    p50_us: percentile(sorted, 0.5),
    p95_us: percentile(sorted, 0.95),
    p99_us: percentile(sorted, 0.99),
    peak_memory_bytes: Deno.memoryUsage().heapUsed,
  };
}

function skipResult(id: string, message: string): BenchmarkScenarioResult {
  return {
    id,
    outcome: "skip",
    message,
  };
}

function buildEnvironment(): BenchmarkEnvironment {
  return {
    ...(Deno.env.get("GITHUB_SHA") === undefined ? {} : { sdk_commit: Deno.env.get("GITHUB_SHA") }),
    host_runtime: `deno ${Deno.version.deno}`,
    os: Deno.build.os,
    arch: Deno.build.arch,
    notes:
      "JS benchmark results use the conformance benchmark-results schema; unavailable protocol codec scenarios are skipped until the JS SDK exposes those primitives.",
  };
}

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function positiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Expected positive integer, got ${value}`);
  }
  return value;
}

function nonNegativeInt(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Expected non-negative integer, got ${value}`);
  }
  return value;
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

function parentPath(path: string): string | undefined {
  const normalized = path.replaceAll("\\", "/");
  const separator = normalized.lastIndexOf("/");
  if (separator === -1) {
    return undefined;
  }

  return path.slice(0, separator);
}

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;

  constructor() {
    super();
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatchEvent(new Event("open"));
    });
  }

  send(_payload: Uint8Array): void {}

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

async function main(): Promise<void> {
  const conformancePlanPath = valueAfter(Deno.args, "--plan") ?? Deno.env.get("NNRP_CONFORMANCE_BENCHMARK_PLAN");
  if (conformancePlanPath !== undefined) {
    const outputPath = valueAfter(Deno.args, "--output") ?? Deno.env.get("NNRP_CONFORMANCE_BENCHMARK_RESULTS");
    const report = await buildConformanceBenchmarkResults(conformancePlanPath);
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (outputPath === undefined) {
      console.log(serialized);
    } else {
      const outputParentPath = parentPath(outputPath);
      if (outputParentPath !== undefined) {
        await Deno.mkdir(outputParentPath, { recursive: true });
      }
      await Deno.writeTextFile(outputPath, serialized);
    }
    return;
  }

  const options = parseCommandOptions(Deno.args);
  const reports = selectBuildModes(options.mode).map((buildMode) =>
    createBenchmarkReport(buildMode, { artifactVersion: options.artifactVersion })
  );

  writeJson(options.mode === "all" ? { sdk: "nnrp-js", reports } : reports[0]);
}

await main();
