import {
  CacheMissReason,
  createTokenSubmitRequest,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  type NnrpClientEvent,
  NnrpMessageType,
  type NnrpOperationState,
  type NnrpRuntimeEvent,
  type NnrpTransportClientSecurity,
  type NnrpTransportServerSecurity,
  RuntimeRole,
} from "@nnrp/core";
import { type NnrpNativeTransportProvider as NnrpClientTransportProvider, openNativeClient } from "@nnrp/native-client";
import {
  type NnrpBackendRuntime,
  type NnrpNativeTransportProvider as NnrpServerTransportProvider,
  type NnrpServer,
  type NnrpServerSession,
  openBackendRuntime,
} from "@nnrp/native-server";
import { createIpcTransportProvider } from "@nnrp/transport-ipc";
import { createQuicTransportProvider } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import { createSocket } from "node:dgram";
import { createServer as createTcpServer } from "node:net";
import { dirname, resolve } from "node:path";
import { QUIC_TEST_CERTIFICATE_DER, QUIC_TEST_PRIVATE_KEY_PKCS8_DER } from "./fixtures/quic-test-identity.ts";
import { createWireConformanceTargetManifest } from "./wire-target-manifest.ts";
import { assertRuntimeMetadata, assertRuntimeTail, createSuccessResultReply } from "./runtime-event-fixtures.ts";
import { receiveServerLifecycleEvent, receiveServerRuntimeEvent } from "./server-event-helpers.ts";

const SUITE_VERSION = "0.1.0";
const TIMEOUT_MILLIS = 5_000;
const REQUEST_BODY = bytes("wire-external-request");
const RESPONSE_BODY = bytes("wire-external-result");
const TRACE_BODY = bytes("trace");
const CACHE_KEY_HI = 1_234_605_616_436_508_552n;
const CACHE_KEY_LO = 11_072_869_122_414_935_808n;

type NativeProvider = NnrpClientTransportProvider & NnrpServerTransportProvider;

interface HarnessSecurity {
  readonly client: NnrpTransportClientSecurity;
  readonly server: NnrpTransportServerSecurity;
}

interface WireTargetOptions {
  readonly manifestPath: string;
}

type PendingAccept = Promise<
  | { readonly session: NnrpServerSession; readonly error?: never }
  | { readonly session?: never; readonly error: unknown }
>;

if (import.meta.main) {
  await runWireTarget(parseOptions(Deno.args));
}

export function parseOptions(args: readonly string[]): WireTargetOptions {
  const manifestIndex = args.indexOf("--manifest");
  const manifestPath = manifestIndex < 0 ? undefined : args[manifestIndex + 1];
  if (manifestPath === undefined || manifestPath.trim().length === 0) {
    throw new Error("wire target requires --manifest <path>");
  }
  return { manifestPath: resolve(manifestPath) };
}

export async function runWireTarget(options: WireTargetOptions): Promise<void> {
  const manifestDirectory = dirname(options.manifestPath);
  await Deno.mkdir(resolve(manifestDirectory, "certs"), { recursive: true });
  await Deno.writeFile(resolve(manifestDirectory, "certs/server.der"), QUIC_TEST_CERTIFICATE_DER);
  await Deno.writeFile(
    resolve(manifestDirectory, "certs/server-key.der"),
    QUIC_TEST_PRIVATE_KEY_PKCS8_DER,
  );

  const security: HarnessSecurity = {
    client: {
      mode: "client",
      serverName: "localhost",
      trustedCertificateDer: QUIC_TEST_CERTIFICATE_DER,
    },
    server: {
      mode: "server",
      certificateDer: QUIC_TEST_CERTIFICATE_DER,
      privateKeyPkcs8Der: QUIC_TEST_PRIVATE_KEY_PKCS8_DER,
    },
  };
  const tcpEndpoint = await reserveTcpEndpoint();
  const quicEndpoint = await reserveUdpEndpoint();
  const websocketEndpoint = `wss://localhost:${(await reserveTcpEndpoint()).split(":").at(-1)}/nnrp`;
  const ipcEndpoint = wireIpcEndpoint(manifestDirectory);

  const tcpProvider = createTcpTransportProvider();
  const quicProvider = createQuicTransportProvider();
  const ipcProvider = createIpcTransportProvider();
  const websocketProvider = createWebSocketTransportProvider();
  for (const provider of [tcpProvider, quicProvider, ipcProvider, websocketProvider]) {
    if (!provider.localAvailable) {
      throw new Error(`${provider.kind} wire target provider is unavailable: ${provider.diagnostic?.message}`);
    }
  }

  let tcp: Awaited<ReturnType<typeof startServer>> | undefined;
  let quic: Awaited<ReturnType<typeof startServer>> | undefined;
  let ipc: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    tcp = await startServer(tcpProvider, "force-tcp", tcpEndpoint, `nnrp://${tcpEndpoint}/session/default`);
    quic = await startServer(
      quicProvider,
      "force-quic",
      quicEndpoint,
      `nnrps://localhost:${quicEndpoint.split(":").at(-1)}/session/default`,
      security.server,
    );
    ipc = await startServer(
      ipcProvider,
      "force-ipc",
      ipcEndpoint,
      "nnrp://localhost/session/default",
    );
    const tcpAccepting = startAccept(tcp.server);
    const quicAccepting = startAccept(quic.server);
    const ipcAccepting = startAccept(ipc.server);

    await writeManifest(options.manifestPath, {
      tcpEndpoint,
      quicEndpoint,
      ipcEndpoint,
      websocketEndpoint,
    });

    await handleCancel(await acceptedSession(tcpAccepting, "TCP"));
    await tcp.server.close();
    await tcp.runtime.close();

    await handlePriority(await acceptedSession(quicAccepting, "QUIC"));
    await handleProgressClient({
      endpoint: `nnrp://${tcpEndpoint}/session/default`,
      providerEndpoint: tcpEndpoint,
      provider: tcpProvider,
      transportPolicy: "force-tcp",
    });
    await handleCache(await quic.server.accept());
    await quic.server.close();
    await quic.runtime.close();

    await handleCancel(await acceptedSession(ipcAccepting, "IPC"));
    await ipc.server.close();
    await ipc.runtime.close();

    await handleProgressClient({
      endpoint: `nnrps://localhost:${new URL(websocketEndpoint).port}/session/default`,
      providerEndpoint: websocketEndpoint,
      provider: websocketProvider,
      transportPolicy: "force-websocket",
      security: security.client,
    });
  } finally {
    await Promise.allSettled(
      [tcp, quic, ipc].flatMap((resource) =>
        resource === undefined ? [] : [resource.server.close(), resource.runtime.close()]
      ),
    );
    await cleanupIpcEndpoint(ipcEndpoint);
  }
}

function startAccept(server: NnrpServer): PendingAccept {
  return server.accept().then(
    (session) => ({ session }),
    (error: unknown) => ({ error }),
  );
}

async function acceptedSession(accepting: PendingAccept, transport: string): Promise<NnrpServerSession> {
  const accepted = await accepting;
  if (accepted.session !== undefined) return accepted.session;
  throw new Error(`${transport} wire target failed to accept its first session`, { cause: accepted.error });
}

async function startServer(
  provider: NativeProvider,
  transportPolicy: "force-tcp" | "force-quic" | "force-ipc",
  providerEndpoint: string,
  endpoint: string,
  security?: NnrpTransportServerSecurity,
): Promise<{
  readonly runtime: NnrpBackendRuntime;
  readonly server: NnrpServer;
}> {
  const runtime = await openBackendRuntime({ transports: [provider], transportPolicy });
  const server = runtime.listen({
    endpoint,
    providerRoutes: {
      [provider.kind]: {
        endpoint: providerEndpoint,
        ...(security === undefined ? {} : { security }),
      },
    },
    transportPolicy,
  });
  return { runtime, server };
}

async function handleCancel(session: NnrpServerSession): Promise<void> {
  const operation = await session.receiveSubmit({ timeoutMillis: TIMEOUT_MILLIS });
  const submit = expectMessage(operation.submit, NnrpMessageType.FrameSubmit, "FRAME_SUBMIT");
  assertRuntimeMetadata(submit, "frame_submit");
  const cancel = await receiveOperationRuntimeAndLifecycle(
    session,
    NnrpMessageType.Cancel,
    "CANCEL",
    submit.metadata.value.operationId,
    "cancelled",
  );
  assertRuntimeMetadata(cancel, "control_request");
  if (cancel.metadata.value.operationId !== submit.metadata.value.operationId) {
    throw new Error("cancel wire case targeted another operation");
  }
  await session.sendTraceContext({
    traceId: 0x1234n,
    spanId: 0x5678n,
    parentSpanId: 0n,
    stageCode: 1,
    flags: 0,
    bodyBytes: TRACE_BODY.byteLength,
  }, TRACE_BODY);
  await operation.sendResultDrop({
    operationId: submit.metadata.value.operationId,
    resultSequence: 1n,
    dropReasonCode: 1,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    diagnosticBytes: 0,
  });
  expectMessage(
    await receiveServerRuntimeEvent(session, TIMEOUT_MILLIS),
    NnrpMessageType.SessionClose,
    "SESSION_CLOSE",
  );
  await session.close();
}

async function handlePriority(session: NnrpServerSession): Promise<void> {
  const operation = await session.receiveSubmit({ timeoutMillis: TIMEOUT_MILLIS });
  const submit = expectMessage(operation.submit, NnrpMessageType.FrameSubmit, "FRAME_SUBMIT");
  assertRuntimeMetadata(submit, "frame_submit");
  const priority = expectMessage(
    await receiveServerRuntimeEvent(session, TIMEOUT_MILLIS),
    NnrpMessageType.PriorityUpdate,
    "PRIORITY_UPDATE",
  );
  assertRuntimeMetadata(priority, "scheduling");
  const expiry = expectMessage(
    await receiveServerRuntimeEvent(session, TIMEOUT_MILLIS),
    NnrpMessageType.ExpireAt,
    "EXPIRE_AT",
  );
  assertRuntimeMetadata(expiry, "scheduling");
  if (
    priority.metadata.value.operationId !== submit.metadata.value.operationId ||
    expiry.metadata.value.operationId !== submit.metadata.value.operationId ||
    expiry.metadata.value.deadlineUnixMs !== 1n
  ) {
    throw new Error("priority/deadline wire case metadata did not match its submitted operation");
  }
  await operation.sendResultDrop({
    operationId: submit.metadata.value.operationId,
    resultSequence: 1n,
    dropReasonCode: 1,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    diagnosticBytes: 0,
  });
  await receiveServerLifecycleEvent(
    session,
    TIMEOUT_MILLIS,
    submit.metadata.value.operationId,
    "superseded",
  );
  expectMessage(
    await receiveServerRuntimeEvent(session, TIMEOUT_MILLIS),
    NnrpMessageType.SessionClose,
    "SESSION_CLOSE",
  );
  await session.close();
}

async function handleCache(session: NnrpServerSession): Promise<void> {
  const operation = await session.receiveSubmit({ timeoutMillis: TIMEOUT_MILLIS });
  const submit = expectMessage(operation.submit, NnrpMessageType.FrameSubmit, "FRAME_SUBMIT");
  assertRuntimeMetadata(submit, "frame_submit");
  const capability = expectMessage(
    await receiveServerRuntimeEvent(session, TIMEOUT_MILLIS),
    NnrpMessageType.CapabilityNegotiation,
    "CAPABILITY_NEGOTIATION",
  );
  assertRuntimeMetadata(capability, "capability");
  const route = expectMessage(
    await receiveServerRuntimeEvent(session, TIMEOUT_MILLIS),
    NnrpMessageType.RouteHint,
    "ROUTE_HINT",
  );
  assertRuntimeMetadata(route, "route_hint");
  const cache = expectMessage(
    await receiveServerRuntimeEvent(session, TIMEOUT_MILLIS),
    NnrpMessageType.CacheReference,
    "CACHE_REFERENCE",
  );
  assertRuntimeMetadata(cache, "cache_reference");
  if (cache.metadata.value.cacheKeyHi !== CACHE_KEY_HI || cache.metadata.value.cacheKeyLo !== CACHE_KEY_LO) {
    throw new Error("cache wire case used unexpected cache identity");
  }
  await session.reportCacheMiss({
    cacheNamespace: 1,
    cacheKeyHi: CACHE_KEY_HI,
    cacheKeyLo: CACHE_KEY_LO,
    missReason: CacheMissReason.NotFound,
    profileId: 0x0002,
    diagnosticBytes: 0,
  });
  const result = createSuccessResultReply(RESPONSE_BODY);
  await operation.sendResult(result.metadata, result.body);
  await receiveServerLifecycleEvent(
    session,
    TIMEOUT_MILLIS,
    submit.metadata.value.operationId,
    "completed",
  );
  expectMessage(
    await receiveServerRuntimeEvent(session, TIMEOUT_MILLIS),
    NnrpMessageType.SessionClose,
    "SESSION_CLOSE",
  );
  await session.close();
}

async function handleProgressClient(options: {
  readonly endpoint: string;
  readonly providerEndpoint: string;
  readonly provider: NativeProvider;
  readonly transportPolicy: "force-tcp" | "force-websocket";
  readonly security?: NnrpTransportClientSecurity;
}): Promise<void> {
  const client = await connectWithRetry(options);
  const session = await client.openSession();
  try {
    await session.submitNoWait(tokenSubmit(301n, 301, REQUEST_BODY));
    const progress = expectMessage(
      await session.nextEvent({ timeoutMillis: TIMEOUT_MILLIS }),
      NnrpMessageType.Progress,
      "PROGRESS",
    );
    assertRuntimeMetadata(progress, "progress");
    const credit = expectMessage(
      await session.nextEvent({ timeoutMillis: TIMEOUT_MILLIS }),
      NnrpMessageType.CreditUpdate,
      "CREDIT_UPDATE",
    );
    assertRuntimeMetadata(credit, "pressure");
    const partial = expectMessage(
      await session.nextEvent({ timeoutMillis: TIMEOUT_MILLIS }),
      NnrpMessageType.PartialResult,
      "PARTIAL_RESULT",
    );
    assertRuntimeMetadata(partial, "partial_result");
    const result = expectMessage(
      await session.nextEvent({ timeoutMillis: TIMEOUT_MILLIS }),
      NnrpMessageType.ResultPush,
      "RESULT_PUSH",
    );
    assertRuntimeTail(result, "body");
    if (
      progress.metadata.value.operationId !== 301n || credit.metadata.value.creditWindow !== 1n ||
      partial.metadata.value.operationId !== 301n || !equalBytes(result.tail.body, RESPONSE_BODY)
    ) {
      throw new Error("progress/backpressure wire case returned unexpected target-client observations");
    }
    await session.close();
  } finally {
    await session.close().catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}

function tokenSubmit(operationId: bigint, frameId: number, payload: Uint8Array) {
  return createTokenSubmitRequest({
    identity: { operationId, frameId, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload }],
  });
}

async function connectWithRetry(options: Parameters<typeof handleProgressClient>[0]) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      return await openNativeClient({
        endpoint: options.endpoint,
        providerRoutes: {
          [options.provider.kind]: {
            endpoint: options.providerEndpoint,
            ...(options.security === undefined ? {} : { security: options.security }),
          },
        },
        transports: [options.provider],
        transportPolicy: options.transportPolicy,
      });
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }
  throw new Error("wire target could not connect to suite listener", { cause: lastError });
}

function expectMessage(
  candidate: NnrpClientEvent | NnrpRuntimeEvent,
  messageType: NnrpMessageType,
  label: string,
): NnrpRuntimeEvent {
  if (!("header" in candidate) && candidate.type !== "runtime") {
    throw new Error(`wire target expected ${label}, got lifecycle ${candidate.event.state}`);
  }
  const event = "header" in candidate ? candidate : candidate.event;
  if (event.header.messageType !== messageType) {
    throw new Error(`wire target expected ${label}, got message ${event.header.messageType}`);
  }
  return event;
}

async function receiveOperationRuntimeAndLifecycle(
  session: NnrpServerSession,
  messageType: NnrpMessageType,
  label: string,
  operationId: bigint,
  state: NnrpOperationState,
): Promise<NnrpRuntimeEvent> {
  let runtime: NnrpRuntimeEvent | undefined;
  let lifecycleObserved = false;
  for (let index = 0; index < 2; index += 1) {
    const event = await session.nextEvent({ timeoutMillis: TIMEOUT_MILLIS });
    if (event.type === "runtime") {
      runtime = expectMessage(event.event, messageType, label);
      continue;
    }
    if (event.type === "submit") {
      throw new Error(`wire target expected ${label} and ${state} lifecycle, got another submit`);
    }
    if (event.event.operationId !== operationId || event.event.state !== state) {
      throw new Error(
        `wire target expected ${state} lifecycle for ${operationId}, got ${event.event.state} for ${event.event.operationId}`,
      );
    }
    lifecycleObserved = true;
  }
  if (runtime === undefined || !lifecycleObserved) {
    throw new Error(`wire target did not observe both ${label} and ${state} lifecycle`);
  }
  return runtime;
}

async function writeManifest(
  manifestPath: string,
  endpoints: {
    readonly tcpEndpoint: string;
    readonly quicEndpoint: string;
    readonly ipcEndpoint: string;
    readonly websocketEndpoint: string;
  },
): Promise<void> {
  const tls = {
    server_name: "localhost",
    trusted_certificate_der_path: "certs/server.der",
    certificate_der_path: "certs/server.der",
    private_key_pkcs8_der_path: "certs/server-key.der",
  };
  const manifest = createWireConformanceTargetManifest({
    targetName: "nnrp-js-preview4-native",
    suiteVersion: SUITE_VERSION,
    modes: ["suite_as_client", "suite_as_server", "suite_as_proxy"],
    transports: [
      { name: "tcp", endpoint: endpoints.tcpEndpoint, tls: false },
      { name: "quic", endpoint: endpoints.quicEndpoint, tls: true, security: tls },
      { name: "ipc", endpoint: endpoints.ipcEndpoint, tls: false },
      { name: "websocket", endpoint: endpoints.websocketEndpoint, tls: true, security: tls },
    ],
    capabilities: [
      "control.cancel_abort",
      "control.priority_update",
      "control.deadline_expire",
      "control.progress_partial",
      "control.credit_backpressure",
      "control.capability_costs",
      "control.route_execution_hint",
      "cache.reference",
      "control.trace_context",
      "control.result_drop_reason",
      "control.degrade_profile",
      "control.budget_update",
      "object.lifecycle",
    ],
    maxFrameBytes: 16_777_216,
    maxInFlight: 256,
  });
  const temporaryPath = `${manifestPath}.tmp`;
  await Deno.writeTextFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await Deno.rename(temporaryPath, manifestPath);
}

async function reserveTcpEndpoint(): Promise<string> {
  const socket = createTcpServer();
  await new Promise<void>((resolvePromise, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = socket.address();
  if (address === null || typeof address === "string") throw new Error("failed to reserve TCP endpoint");
  await new Promise<void>((resolvePromise, reject) =>
    socket.close((error) => error === undefined ? resolvePromise() : reject(error))
  );
  return `${address.address}:${address.port}`;
}

async function reserveUdpEndpoint(): Promise<string> {
  const socket = createSocket("udp4");
  try {
    await new Promise<void>((resolvePromise, reject) => {
      socket.once("error", reject);
      socket.bind(0, "127.0.0.1", resolvePromise);
    });
    const address = socket.address();
    if (typeof address === "string") throw new Error("failed to reserve UDP endpoint");
    return `${address.address}:${address.port}`;
  } finally {
    await new Promise<void>((resolvePromise) => socket.close(resolvePromise));
  }
}

function wireIpcEndpoint(manifestDirectory: string): string {
  if (Deno.build.os === "windows") return `npipe://nnrp-js-wire-${Deno.pid}-${Date.now()}`;
  return `unix://${resolve(manifestDirectory, `nnrp-js-wire-${Deno.pid}.sock`).replaceAll("\\", "/")}`;
}

async function cleanupIpcEndpoint(endpoint: string): Promise<void> {
  if (!endpoint.startsWith("unix://")) return;
  await Deno.remove(endpoint.slice("unix://".length)).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
}

function equalBytes(left: Uint8Array | undefined, right: Uint8Array): boolean {
  return left !== undefined && left.length === right.length && left.every((value, index) => value === right[index]);
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
