import { NnrpEndpoint as FrozenNnrpEndpoint, NnrpProviderEndpoint as FrozenNnrpProviderEndpoint } from "@nnrp/core";
import { resolve } from "node:path";
import {
  createTokenSubmitRequest,
  MemoryLocationHint,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  NnrpMessageType,
  type NnrpTransportConnection,
  type NnrpTransportKind,
  OwnershipHint,
  RuntimeObjectKind,
  RuntimeRole,
} from "@nnrp/core";
import { openBrowserRuntime } from "@nnrp/browser-client";
import { type NnrpClientSession, openNativeClient } from "@nnrp/native-client";
import { type NnrpServerSession, openBackendRuntime } from "@nnrp/native-server";
import { createIpcTransportProvider } from "@nnrp/transport-ipc";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import { openNativeBenchmarkFfi } from "./benchmark-native-ffi.ts";
import { createBenchmarkReport, parseCommandOptions, selectBuildModes, writeJson } from "./sdk-reporting.ts";
import { createSuccessResultReply } from "./runtime-event-fixtures.ts";
import { awaitClientResultAndServerCompletion, receiveServerRuntimeEvent } from "./server-event-helpers.ts";

const RESULT_SCHEMA_URL =
  "https://raw.githubusercontent.com/NagareWorks/nnrp-conformance/main/schemas/benchmark-results.schema.json";
const RUST_ARTIFACT_VERSION = "1.0.0-preview.4.22";
const DEFAULT_DURATION_SECONDS = 3;
const DEFAULT_WARMUP_ITERATIONS = 100;
const DEFAULT_PAYLOAD_BYTES = 1024;
const DEFAULT_BATCH_ITERATIONS = 1024;

interface BenchmarkExecutionPlan {
  readonly protocol_version: string;
  readonly implementation_name: string;
  readonly scenarios: readonly BenchmarkScenario[];
}

interface BenchmarkScenario {
  readonly id: string;
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
  readonly nnrp_rs_artifact: string;
  readonly host_runtime: string;
  readonly os: string;
  readonly arch: string;
  readonly notes: string;
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

interface NativeRolePair {
  readonly clientSession: NnrpClientSession;
  readonly serverSession: NnrpServerSession;
  close(): Promise<void>;
}

async function buildConformanceBenchmarkResults(planPath: string): Promise<BenchmarkResultReport> {
  const plan = JSON.parse(await Deno.readTextFile(planPath)) as BenchmarkExecutionPlan;
  const results: BenchmarkScenarioResult[] = [];
  for (const scenario of plan.scenarios) {
    console.error(`benchmark scenario started: ${scenario.id}`);
    const result = await runScenario(scenario);
    console.error(`benchmark scenario completed: ${scenario.id} (${result.outcome})`);
    results.push(result);
  }
  return {
    $schema: RESULT_SCHEMA_URL,
    protocol_version: plan.protocol_version,
    implementation_name: plan.implementation_name,
    environment: buildEnvironment(),
    results,
  };
}

async function runScenario(scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
  try {
    switch (scenario.workload.operation) {
      case "coarse_ffi_submit_result_batch":
        return runCoarseFfiSubmitResult(scenario);
      case "runtime_control_loop":
        return await runRuntimeControlLoop(scenario);
      case "runtime_object_reference_loop":
        return await runRuntimeObjectReferenceLoop(scenario);
      case "runtime_object_delta_loop":
        return await runRuntimeObjectDeltaLoop(scenario);
      case "transport_loopback":
        return await runTransportLoopback(scenario);
      case "browser_wasm_websocket_loop":
        return await runBrowserWasmWebSocketLoop(scenario);
      default:
        return skipResult(scenario.id, `JS benchmark runner does not implement ${scenario.workload.operation}.`);
    }
  } catch (error) {
    return { id: scenario.id, outcome: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

function runCoarseFfiSubmitResult(scenario: BenchmarkScenario): BenchmarkScenarioResult {
  const libraryPath = Deno.env.get("NNRP_JS_BENCHMARK_NATIVE_LIBRARY");
  if (libraryPath === undefined) {
    return skipResult(scenario.id, "NNRP_JS_BENCHMARK_NATIVE_LIBRARY is required for the benchmark-ffi scenario.");
  }
  const durationSeconds = positiveInt(scenario.workload.duration_seconds, DEFAULT_DURATION_SECONDS);
  const batchIterations = positiveInt(scenario.workload.iterations, DEFAULT_BATCH_ITERATIONS);
  const warmupIterations = nonNegativeInt(scenario.workload.warmup_iterations, DEFAULT_WARMUP_ITERATIONS);
  const payload = new Uint8Array(payloadBytes(scenario.workload.payload));
  const ffi = openNativeBenchmarkFfi(libraryPath);
  let frameId = 1;
  const operation = () => {
    const completed = ffi.submitResultBatch(frameId, batchIterations, payload);
    if (completed !== batchIterations) throw new Error(`benchmark FFI completed ${completed}/${batchIterations}`);
    frameId = frameId > 0xffff_ffff - batchIterations ? 1 : frameId + batchIterations;
    return completed;
  };
  try {
    for (let index = 0; index < warmupIterations; index += 1) operation();
    return measuredResult(
      scenario,
      measureCountedSyncThroughput(operation, durationSeconds),
      payload.byteLength,
      `benchmark-ffi ABI ${ffi.abiVersion}, protocol ${ffi.protocolVersion}, batch=${batchIterations}`,
    );
  } finally {
    ffi.close();
  }
}

async function runRuntimeControlLoop(scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
  const pair = await openNativeRolePair("tcp");
  await startBenchmarkOperation(pair, 2n, 2);
  let sequence = 0n;
  const operation = async () => {
    sequence += 1n;
    await pair.clientSession.updatePriority({
      operationId: 2n,
      controlSequence: sequence,
      priorityClass: 1,
      priorityDelta: 0,
      deadlineUnixMs: 0n,
      flags: 0,
    });
    const event = await receiveServerRuntimeEvent(pair.serverSession, 5_000);
    if (event.header.messageType !== NnrpMessageType.PriorityUpdate) {
      throw new Error(`expected priority-update, got ${event.header.messageType}`);
    }
  };
  try {
    return await measureAsyncScenario(scenario, operation, 0, "TCP runtime-control encode/send/poll");
  } finally {
    await pair.close();
  }
}

async function runRuntimeObjectReferenceLoop(scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
  const pair = await openNativeRolePair("tcp");
  const size = payloadBytes(scenario.workload.payload);
  await startBenchmarkOperation(pair, 2n, 2);
  await declareBenchmarkObject(pair, size);
  const operation = async () => {
    await pair.clientSession.referenceObject({
      objectId: 1n,
      operationId: 2n,
      objectVersion: 1n,
      offset: 0n,
      length: BigInt(size),
      flags: 0,
      metadataBytes: 0,
    });
    const event = await receiveServerRuntimeEvent(pair.serverSession, 5_000);
    if (event.header.messageType !== NnrpMessageType.ObjectRef) {
      throw new Error(`expected object-ref, got ${event.header.messageType}`);
    }
  };
  try {
    return await measureAsyncScenario(scenario, operation, size, "TCP runtime-object reference send/poll");
  } finally {
    await pair.close();
  }
}

async function runRuntimeObjectDeltaLoop(scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
  const pair = await openNativeRolePair("tcp");
  const size = payloadBytes(scenario.workload.payload);
  const delta = new Uint8Array(size);
  await declareBenchmarkObject(pair, size);
  let deltaSequence = 0n;
  const operation = async () => {
    deltaSequence += 1n;
    await pair.clientSession.sendObjectDelta({
      objectId: 1n,
      deltaSequence,
      regionOffset: 0n,
      regionBytes: size,
      deltaBytes: size,
      flags: 0,
      metadataBytes: 0,
    }, delta);
    const event = await receiveServerRuntimeEvent(pair.serverSession, 5_000);
    if (event.header.messageType !== NnrpMessageType.ObjectDelta) {
      throw new Error(`expected object-delta, got ${event.header.messageType}`);
    }
  };
  try {
    return await measureAsyncScenario(scenario, operation, size, "TCP runtime-object delta send/poll");
  } finally {
    await pair.close();
  }
}

async function runTransportLoopback(scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
  const transport = scenario.workload.transport as NnrpTransportKind | undefined;
  if (transport !== "tcp" && transport !== "ipc" && transport !== "websocket") {
    return skipResult(scenario.id, `Transport loopback supports tcp, ipc, or websocket; got ${transport ?? "none"}.`);
  }
  const provider = nativeProvider(transport);
  if (!provider.localAvailable) {
    return skipResult(scenario.id, `${transport} provider unavailable: ${provider.diagnostic?.message ?? "unknown"}`);
  }
  const endpoint = transportEndpoint(transport);
  const server = await provider.listen({ endpoint });
  const accepted = server.accept();
  const client = await provider.connect({ endpoint: server.endpoint });
  const peer = await accepted;
  const payload = new Uint8Array(40);
  payload.set([0x4e, 0x4e, 0x52, 0x50, 1, 0, 0x20, 40]);
  let echoing = true;
  const echoLoop = echoPackets(peer, () => echoing);
  let frameId = 0;
  const operation = async () => {
    frameId += 1;
    new DataView(payload.buffer).setUint32(24, frameId, true);
    await client.send(payload);
    const echoed = await client.receive({ maxPackets: 1, timeoutMillis: 5_000 });
    if (echoed.length !== 1 || new DataView(echoed[0]!.buffer, echoed[0]!.byteOffset).getUint32(24, true) !== frameId) {
      throw new Error(`${transport} loopback returned an unexpected packet`);
    }
  };
  try {
    return await measureAsyncScenario(
      scenario,
      operation,
      payload.byteLength,
      `${transport} package-owned Rust provider`,
    );
  } finally {
    echoing = false;
    await closeQuietly(() => client.close());
    await closeQuietly(() => peer.close());
    await closeQuietly(() => server.close());
    await echoLoop.catch(() => undefined);
  }
}

async function runBrowserWasmWebSocketLoop(scenario: BenchmarkScenario): Promise<BenchmarkScenarioResult> {
  const nativeProvider = createWebSocketTransportProvider();
  const providerEndpoint = await reserveEndpoint(nativeProvider, "websocket");
  const serverRuntime = await openBackendRuntime({
    transports: [nativeProvider],
    transportPolicy: "force-websocket",
  });
  const server = serverRuntime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://localhost/benchmark-browser"),
    providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse(providerEndpoint) } },
    transportPolicy: "force-websocket",
  });
  const accepting = server.accept();
  await delay(25);
  const wasmBytes = await Deno.readFile(new URL("../packages/browser-client/wasm/nnrp_wasm_bg.wasm", import.meta.url));
  const browserRuntime = await openBrowserRuntime({
    module: await WebAssembly.compile(wasmBytes),
    transportProviders: [createWebSocketTransportProvider({ WebSocket: globalThis.WebSocket })],
    transportPolicy: "force-websocket",
  });
  const client = browserRuntime.connect({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://localhost/benchmark-browser"),
    providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse(providerEndpoint) } },
  });
  const session = await client.openSession();
  const payload = new Uint8Array(payloadBytes(scenario.workload.payload));
  const serverSessionPromise = accepting;
  const bootstrap = session.submit(tokenSubmit(1n, 1, payload));
  const serverSession = await serverSessionPromise;
  const bootstrapOperation = await serverSession.receiveSubmit({ timeoutMillis: 5_000 });
  const bootstrapEvent = bootstrapOperation.submit;
  if (bootstrapEvent.header.messageType !== NnrpMessageType.FrameSubmit) {
    throw new Error(`expected bootstrap submit, got ${bootstrapEvent.header.messageType}`);
  }
  const bootstrapReply = createSuccessResultReply(payload);
  await bootstrapOperation.sendResult(bootstrapReply.metadata, bootstrapReply.body);
  await awaitClientResultAndServerCompletion(serverSession, bootstrap, 5_000, 1n);
  let frameId = 1;
  const operation = async () => {
    frameId += 1;
    const pending = session.submit(tokenSubmit(BigInt(frameId), frameId, payload));
    const serverOperation = await serverSession.receiveSubmit({ timeoutMillis: 5_000 });
    const event = serverOperation.submit;
    if (event.header.messageType !== NnrpMessageType.FrameSubmit) {
      throw new Error(`expected submit, got ${event.header.messageType}`);
    }
    const reply = createSuccessResultReply(payload);
    await serverOperation.sendResult(reply.metadata, reply.body);
    await awaitClientResultAndServerCompletion(serverSession, pending, 5_000, BigInt(frameId));
  };
  try {
    return await measureAsyncScenario(scenario, operation, payload.byteLength, "browser WASM role over real WebSocket");
  } finally {
    await closeQuietly(() => serverSession.close());
    await closeQuietly(() => session.close());
    await closeQuietly(() => client.close());
    await closeQuietly(() => browserRuntime.close());
    await closeQuietly(() => server.close());
    await closeQuietly(() => serverRuntime.close());
  }
}

async function openNativeRolePair(transport: "tcp" | "ipc" | "websocket"): Promise<NativeRolePair> {
  const provider = nativeProvider(transport);
  if (!provider.localAvailable) throw new Error(`${transport} provider is unavailable`);
  const providerEndpoint = transport === "ipc" ? transportEndpoint("ipc") : await reserveEndpoint(provider, transport);
  const providerRouteEndpoint = FrozenNnrpProviderEndpoint.parse(
    transport === "tcp" ? `tcp://${providerEndpoint}` : providerEndpoint,
  );
  const policy = `force-${transport}` as const;
  const endpoint = `nnrp://localhost/benchmark-${transport}`;
  const serverRuntime = await openBackendRuntime({ transports: [provider], transportPolicy: policy });
  const server = serverRuntime.listen({
    endpoint: FrozenNnrpEndpoint.parse(endpoint),
    providerRoutes: { [transport]: { endpoint: providerRouteEndpoint } },
    transportPolicy: policy,
  });
  const accepting = server.accept();
  await delay(25);
  const client = await openNativeClient({
    endpoint: FrozenNnrpEndpoint.parse(endpoint),
    providerRoutes: { [transport]: { endpoint: providerRouteEndpoint } },
    transports: [provider],
    transportPolicy: policy,
  });
  const clientSession = await client.openSession();
  const payload = new Uint8Array(1);
  const bootstrap = clientSession.submit(tokenSubmit(1n, 1, payload));
  const serverSession = await accepting;
  const bootstrapOperation = await serverSession.receiveSubmit({ timeoutMillis: 5_000 });
  const event = bootstrapOperation.submit;
  if (event.header.messageType !== NnrpMessageType.FrameSubmit) {
    throw new Error(`expected bootstrap submit, got ${event.header.messageType}`);
  }
  const reply = createSuccessResultReply(payload);
  await bootstrapOperation.sendResult(reply.metadata, reply.body);
  await awaitClientResultAndServerCompletion(serverSession, bootstrap, 5_000, 1n);
  return {
    clientSession,
    serverSession,
    close: async () => {
      await closeQuietly(() => serverSession.close());
      await closeQuietly(() => clientSession.close());
      await closeQuietly(() => client.close());
      await closeQuietly(() => server.close());
      await closeQuietly(() => client.runtime.close());
      await closeQuietly(() => serverRuntime.close());
    },
  };
}

async function declareBenchmarkObject(pair: NativeRolePair, size: number): Promise<void> {
  await pair.clientSession.declareObject({
    objectId: 1n,
    objectKind: RuntimeObjectKind.Tensor,
    producerRole: RuntimeRole.Client,
    consumerRole: RuntimeRole.Server,
    sessionId: 1,
    byteSize: BigInt(size),
    computeCostUnits: 1,
    memoryLocationHint: MemoryLocationHint.HostMemory,
    ownershipHint: OwnershipHint.SessionOwned,
    lifetimeHintMs: 60_000,
    metadataBytes: 0,
  });
  const event = await receiveServerRuntimeEvent(pair.serverSession, 5_000);
  if (event.header.messageType !== NnrpMessageType.ObjectDeclare) {
    throw new Error(`expected object-declare, got ${event.header.messageType}`);
  }
}

async function startBenchmarkOperation(pair: NativeRolePair, operationId: bigint, frameId: number): Promise<void> {
  await pair.clientSession.submitNoWait(tokenSubmit(operationId, frameId, new Uint8Array(1)));
  const event = (await pair.serverSession.receiveSubmit({ timeoutMillis: 5_000 })).submit;
  if (event.header.messageType !== NnrpMessageType.FrameSubmit) {
    throw new Error(`expected active submit, got ${event.header.messageType}`);
  }
}

function tokenSubmit(operationId: bigint, frameId: number, payload: Uint8Array) {
  return createTokenSubmitRequest({
    identity: { operationId, frameId, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload }],
  });
}

async function measureAsyncScenario(
  scenario: BenchmarkScenario,
  operation: () => Promise<void>,
  payloadSize: number,
  path: string,
): Promise<BenchmarkScenarioResult> {
  const warmup = nonNegativeInt(scenario.workload.warmup_iterations, DEFAULT_WARMUP_ITERATIONS);
  for (let index = 0; index < warmup; index += 1) await operation();
  return measuredResult(
    scenario,
    await measureAsyncThroughput(operation, positiveInt(scenario.workload.duration_seconds, DEFAULT_DURATION_SECONDS)),
    payloadSize,
    path,
  );
}

function measuredResult(
  scenario: BenchmarkScenario,
  measurement: Measurement,
  payloadSize: number,
  path: string,
): BenchmarkScenarioResult {
  return {
    id: scenario.id,
    outcome: "measured",
    samples: [
      { value: measurement.iterations, unit: "operations" },
      { value: measurement.seconds, unit: "seconds" },
      { value: measurement.samplesUs.length, unit: "latency_samples" },
      { value: payloadSize, unit: "payload_bytes" },
      { value: 1, unit: "concurrency" },
    ],
    metrics: {
      ...percentileMetrics(measurement.samplesUs),
      throughput_ops_per_sec: measurement.iterations / measurement.seconds,
      peak_memory_bytes: Deno.memoryUsage().heapUsed,
    },
    message: path,
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
  return { iterations, seconds: (performance.now() - started) / 1000, samplesUs };
}

function measureCountedSyncThroughput(operation: () => number, durationSeconds: number): Measurement {
  const samplesUs: number[] = [];
  let iterations = 0;
  const started = performance.now();
  const deadline = started + durationSeconds * 1000;
  while (performance.now() < deadline) {
    const before = performance.now();
    const completed = operation();
    const elapsedUs = (performance.now() - before) * 1000;
    samplesUs.push(elapsedUs / completed);
    iterations += completed;
  }
  return { iterations, seconds: (performance.now() - started) / 1000, samplesUs };
}

function percentileMetrics(samplesUs: readonly number[]): BenchmarkMetrics {
  const sorted = [...samplesUs].sort((left, right) => left - right);
  return { p50_us: percentile(sorted, 0.5), p95_us: percentile(sorted, 0.95), p99_us: percentile(sorted, 0.99) };
}

function percentile(sorted: readonly number[], ratio: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

type NativeProvider =
  | ReturnType<typeof createTcpTransportProvider>
  | ReturnType<typeof createIpcTransportProvider>
  | ReturnType<typeof createWebSocketTransportProvider>;

function nativeProvider(transport: "tcp" | "ipc" | "websocket"): NativeProvider {
  if (transport === "tcp") return createTcpTransportProvider();
  if (transport === "ipc") return createIpcTransportProvider();
  return createWebSocketTransportProvider();
}

async function reserveEndpoint(provider: NativeProvider, transport: "tcp" | "websocket"): Promise<string> {
  const reservation = await provider.listen({ endpoint: transport === "tcp" ? "127.0.0.1:0" : "ws://127.0.0.1:0" });
  const endpoint = transport === "tcp" ? stripTcpScheme(reservation.endpoint) : reservation.endpoint;
  await Promise.resolve(reservation.close());
  return endpoint;
}

function transportEndpoint(transport: "tcp" | "ipc" | "websocket"): string {
  if (transport === "tcp") return "127.0.0.1:0";
  if (transport === "websocket") return "ws://127.0.0.1:0";
  if (Deno.build.os === "windows") return `npipe://nnrp-js-benchmark-${Deno.pid}-${Date.now()}`;
  const path = resolve(`artifacts/nnrp-js-benchmark-${Deno.pid}.sock`).replaceAll("\\", "/");
  return `unix://${path.startsWith("/") ? "" : "/"}${path}`;
}

async function echoPackets(connection: NnrpTransportConnection, running: () => boolean): Promise<void> {
  while (running()) {
    try {
      const packets = await connection.receive({ maxPackets: 16, timeoutMillis: 1_000 });
      if (packets.length > 0) await connection.send(packets);
    } catch (error) {
      if (!running()) return;
      throw error;
    }
  }
}

function payloadBytes(name: string): number {
  const match = name.match(/(?:^|_)(\d+)(?:b|_bytes)?$/i);
  if (match === null) return DEFAULT_PAYLOAD_BYTES;
  return positiveInt(Number(match[1]), DEFAULT_PAYLOAD_BYTES);
}

function stripTcpScheme(endpoint: string): string {
  const url = new URL(endpoint.includes("://") ? endpoint : `tcp://${endpoint}`);
  if (url.port.length === 0) throw new Error(`TCP endpoint does not include a port: ${endpoint}`);
  return `${url.hostname}:${url.port}`;
}

function buildEnvironment(): BenchmarkEnvironment {
  return {
    ...(Deno.env.get("GITHUB_SHA") === undefined ? {} : { sdk_commit: Deno.env.get("GITHUB_SHA") }),
    nnrp_rs_artifact: RUST_ARTIFACT_VERSION,
    host_runtime: `deno ${Deno.version.deno}`,
    os: Deno.build.os,
    arch: Deno.build.arch,
    notes:
      "Production scenarios use package-owned Rust providers and real role sessions; coarse FFI uses an explicit benchmark-ffi build.",
  };
}

function skipResult(id: string, message: string): BenchmarkScenarioResult {
  return { id, outcome: "skip", message };
}

function positiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) throw new Error(`Expected positive integer, got ${value}`);
  return value;
}

function nonNegativeInt(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) throw new Error(`Expected non-negative integer, got ${value}`);
  return value;
}

async function closeQuietly(close: () => void | Promise<void>): Promise<void> {
  await Promise.resolve().then(close).catch(() => undefined);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(): Promise<void> {
  const planPath = valueAfter(Deno.args, "--plan") ?? Deno.env.get("NNRP_CONFORMANCE_BENCHMARK_PLAN");
  if (planPath !== undefined) {
    const outputPath = valueAfter(Deno.args, "--output") ?? Deno.env.get("NNRP_CONFORMANCE_BENCHMARK_RESULTS");
    const report = await buildConformanceBenchmarkResults(planPath);
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (outputPath === undefined) console.log(serialized);
    else {
      await Deno.mkdir(resolve(outputPath, "..").replaceAll("\\", "/"), { recursive: true });
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
