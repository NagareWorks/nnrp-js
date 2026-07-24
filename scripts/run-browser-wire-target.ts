import { type NnrpRuntimeEvent, type NnrpTransportConnection } from "@nnrp/core";
import { openBrowserRuntime } from "@nnrp/browser-client";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import {
  type BrowserWireEnvelope,
  type BrowserWireEvidence,
  type BrowserWireObservedFrame,
  createBrowserWireResults,
} from "./browser-wire-contract.ts";

const CONNECT_ATTEMPTS = 100;
const CONNECT_RETRY_MILLIS = 50;
const EVENT_TIMEOUT_MILLIS = 5_000;
const REQUEST_BODY = new TextEncoder().encode("wire-external-request");
const RESPONSE_BODY = new TextEncoder().encode("wire-external-result");
const EVIDENCE_PATH = "browser-evidence.jsonl";

const startedAtUnixMillis = Date.now();
const startedAt = performance.now();
const consoleEntries: BrowserWireEvidence["console"][number][] = [];
const observedFrames: BrowserWireObservedFrame[] = [];
installObservationHooks();

void run().catch(async (error) => {
  const message = errorMessage(error);
  console.error(message);
  await publish({
    report: createBrowserWireResults("failed", observedFrames, message, EVIDENCE_PATH),
    evidence: evidence(),
  });
});

async function run(): Promise<void> {
  const parameters = new URLSearchParams(location.search);
  const providerEndpoint = requiredParameter(parameters, "providerEndpoint");
  const readyEndpoint = requiredParameter(parameters, "readyEndpoint");
  const reportEndpoint = requiredParameter(parameters, "reportEndpoint");
  const provider = createObservedProvider();
  const runtime = await openBrowserRuntime({
    transportProviders: [provider],
    transportPolicy: "force-websocket",
  });
  await postReady(readyEndpoint);
  let client: ReturnType<typeof runtime.connect> | undefined;
  let session: ReturnType<ReturnType<typeof runtime.connect>["openSession"]> | undefined;
  try {
    ({ client, session } = await connectAndSubmit(runtime, providerEndpoint));
    observe("received", "REQUEST", { operation_id: "301", frame_id: 301 });
    const progress = expectEvent(await session.nextEvent({ timeoutMillis: EVENT_TIMEOUT_MILLIS }), "progress");
    observe("sent", "PROGRESS", { operation_id: progress.metadata.operationId.toString() });
    const credit = expectEvent(await session.nextEvent({ timeoutMillis: EVENT_TIMEOUT_MILLIS }), "credit-update");
    observe("sent", "CREDIT_UPDATE", { max_in_flight: credit.metadata.creditWindow.toString() });
    const partial = expectEvent(await session.nextEvent({ timeoutMillis: EVENT_TIMEOUT_MILLIS }), "partial-result");
    observe("sent", "PARTIAL_RESULT", { operation_id: partial.metadata.operationId.toString() });
    const result = expectEvent(await session.nextEvent({ timeoutMillis: EVENT_TIMEOUT_MILLIS }), "result");
    if (!equalBytes(result.result.payload, RESPONSE_BODY)) {
      throw new Error("browser wire target received an unexpected terminal result payload");
    }
    await session.close();
    await client.close();
    await runtime.close();
    const envelope: BrowserWireEnvelope = {
      report: createBrowserWireResults(
        "passed",
        observedFrames,
        "browser WebSocket/WASM target completed the Preview4 progress/backpressure case",
        EVIDENCE_PATH,
      ),
      evidence: evidence(),
    };
    await postJson(reportEndpoint, envelope);
  } finally {
    await session?.close().catch(() => undefined);
    await client?.close().catch(() => undefined);
    await runtime.close().catch(() => undefined);
  }
}

function createObservedProvider() {
  const provider = createWebSocketTransportProvider({ WebSocket: globalThis.WebSocket });
  return {
    ...provider,
    connect: async (options: Parameters<typeof provider.connect>[0]) => {
      const connection = await provider.connect(options);
      return observedConnection(connection);
    },
  };
}

function observedConnection(connection: NnrpTransportConnection): NnrpTransportConnection {
  return {
    kind: connection.kind,
    endpoint: connection.endpoint,
    get connected() {
      return connection.connected;
    },
    send: (packets) => connection.send(packets),
    receive: (options) => connection.receive(options),
    close: () => connection.close(),
  };
}

async function connectAndSubmit(
  runtime: Awaited<ReturnType<typeof openBrowserRuntime>>,
  providerEndpoint: string,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt++) {
    const client = runtime.connect({
      endpoint: "nnrp://localhost/session/default",
      providerEndpoint,
      transportPolicy: "force-websocket",
    });
    const session = client.openSession({ sessionId: `wire-browser-${attempt}`, inputProfile: "token" });
    try {
      await session.submitNoWait({
        operationId: 301n,
        frameId: 301,
        payload: REQUEST_BODY,
        inputProfile: "token",
      });
      return { client, session };
    } catch (error) {
      lastError = error;
      await session.close().catch(() => undefined);
      await client.close().catch(() => undefined);
      await delay(CONNECT_RETRY_MILLIS);
    }
  }
  throw new Error("browser wire target could not connect to the suite WebSocket listener", { cause: lastError });
}

function expectEvent<T extends NnrpRuntimeEvent["type"]>(
  event: NnrpRuntimeEvent,
  type: T,
): Extract<NnrpRuntimeEvent, { readonly type: T }> {
  if (event.type !== type) throw new Error(`browser wire target expected ${type}, got ${event.type}`);
  return event as Extract<NnrpRuntimeEvent, { readonly type: T }>;
}

function observe(
  direction: BrowserWireObservedFrame["direction"],
  frame: string,
  payload: Readonly<Record<string, unknown>>,
): void {
  observedFrames.push({ direction, frame, payload, timestamp_us: elapsedMicros() });
}

function evidence(): BrowserWireEvidence {
  return {
    console: consoleEntries,
    frames: observedFrames,
    timing: {
      started_at_unix_ms: startedAtUnixMillis,
      elapsed_us: elapsedMicros(),
    },
  };
}

function installObservationHooks(): void {
  for (const level of ["debug", "info", "log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...values: unknown[]) => {
      consoleEntries.push({ level, message: values.map(displayValue).join(" "), timestamp_us: elapsedMicros() });
      original(...values);
    };
  }
  addEventListener("error", (event) => console.error(event.message));
  addEventListener("unhandledrejection", (event) => console.error(errorMessage(event.reason)));
}

async function publish(envelope: BrowserWireEnvelope): Promise<void> {
  const reportEndpoint = new URLSearchParams(location.search).get("reportEndpoint");
  if (reportEndpoint !== null) await postJson(reportEndpoint, envelope);
}

async function postJson(endpoint: string, value: unknown): Promise<void> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(`browser wire evidence upload failed with HTTP ${response.status}`);
}

async function postReady(endpoint: string): Promise<void> {
  const response = await fetch(endpoint, { method: "POST" });
  if (!response.ok) throw new Error(`browser wire readiness upload failed with HTTP ${response.status}`);
}

function requiredParameter(parameters: URLSearchParams, name: string): string {
  const value = parameters.get(name);
  if (value === null || value.length === 0) throw new Error(`browser wire target requires ${name}`);
  return value;
}

function elapsedMicros(): number {
  return Math.max(0, Math.round((performance.now() - startedAt) * 1_000));
}

function equalBytes(left: Uint8Array | undefined, right: Uint8Array): boolean {
  return left !== undefined && left.length === right.length && left.every((value, index) => value === right[index]);
}

function displayValue(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
