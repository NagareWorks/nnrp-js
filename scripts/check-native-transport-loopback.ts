import { createIpcTransportProvider } from "@nnrp/transport-ipc";
import { type NnrpNativeTransportProvider as NnrpClientTransportProvider, openNativeClient } from "@nnrp/native-client";
import {
  type NnrpNativeTransportProvider as NnrpServerTransportProvider,
  openBackendRuntime,
} from "@nnrp/native-server";
import { createQuicTransportProvider } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import { dirname } from "node:path";
import {
  CacheReuseScope,
  createTokenSubmitRequest,
  MemoryLocationHint,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  type NnrpClientEvent,
  NnrpMessageType,
  type NnrpRuntimeEvent,
  NnrpTransportClientSecurity,
  NnrpTransportConnection,
  NnrpTransportPolicy,
  NnrpTransportProvider,
  NnrpTransportServerSecurity,
  OwnershipHint,
  RuntimeObjectKind,
  RuntimeRole,
} from "@nnrp/core";
import { createSocket } from "node:dgram";
import { QUIC_TEST_CERTIFICATE_DER, QUIC_TEST_PRIVATE_KEY_PKCS8_DER } from "./fixtures/quic-test-identity.ts";
import {
  type NativeTransportKind,
  type NativeTransportSmokeOptions,
  parseNativeTransportSmokeOptions,
} from "./native-transport-smoke-options.ts";
import { createSuccessResult } from "./runtime-event-fixtures.ts";

type NativeProvider = NnrpTransportProvider & NnrpClientTransportProvider & NnrpServerTransportProvider;

interface LoopbackSecurity {
  readonly client: NnrpTransportClientSecurity;
  readonly server: NnrpTransportServerSecurity;
}

interface RoleLoopbackOptions {
  readonly provider: NativeProvider;
  readonly providerEndpoint: string;
  readonly endpoint: string;
  readonly policy: NnrpTransportPolicy;
  readonly security?: LoopbackSecurity;
}

interface NativeTransportSmokeCell {
  readonly transport: NativeTransportKind;
  readonly status: "executed" | "failed";
  readonly diagnostic?: string;
}

const quicSecurity: LoopbackSecurity = {
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

if (import.meta.main) {
  await runNativeTransportSmoke(parseNativeTransportSmokeOptions(Deno.args));
}

export async function runNativeTransportSmoke(options: NativeTransportSmokeOptions): Promise<void> {
  const cells: NativeTransportSmokeCell[] = [];
  for (const transport of options.transports) {
    try {
      await runNativeTransportCell(transport);
      cells.push({ transport, status: "executed" });
    } catch (error) {
      cells.push({ transport, status: "failed", diagnostic: errorMessage(error) });
      await writeNativeTransportSmokeResult(options.resultPath, cells);
      throw error;
    }
  }
  await writeNativeTransportSmokeResult(options.resultPath, cells);
}

async function runNativeTransportCell(transport: NativeTransportKind): Promise<void> {
  if (transport === "tcp") {
    const provider = createTcpTransportProvider();
    const packetEndpoint = await verifyPacketLoopback(provider, "127.0.0.1:0");
    const providerEndpoint = formatHostAndPort(parseHostAndPort(packetEndpoint, "tcp"));
    await verifyRoleLoopback({
      provider,
      providerEndpoint,
      endpoint: `nnrp://${providerEndpoint}/session/default`,
      policy: "force-tcp",
    });
    return;
  }
  if (transport === "ipc") {
    const provider = createIpcTransportProvider();
    const nonce = `${Deno.pid}-${Date.now()}`;
    const providerEndpoint = Deno.build.os === "windows"
      ? `npipe://nnrp-js-${nonce}`
      : `unix://${Deno.makeTempDirSync()}/nnrp.sock`;
    await verifyPacketLoopback(provider, providerEndpoint);
    await verifyRoleLoopback({
      provider,
      providerEndpoint,
      endpoint: "nnrp://localhost/session/default",
      policy: "force-ipc",
    });
    return;
  }
  if (transport === "websocket") {
    const provider = createWebSocketTransportProvider();
    const providerEndpoint = await verifyPacketLoopback(provider, "ws://127.0.0.1:0/nnrp");
    const url = new URL(providerEndpoint);
    await verifyRoleLoopback({
      provider,
      providerEndpoint,
      endpoint: `nnrp://${url.hostname}:${url.port}/session/default`,
      policy: "force-websocket",
    });
    return;
  }
  const provider = createQuicTransportProvider();
  await verifyPacketLoopback(provider, "127.0.0.1:0", quicSecurity);
  const address = await reserveUdpEndpoint();
  const providerEndpoint = formatHostAndPort(address);
  await verifyRoleLoopback({
    provider,
    providerEndpoint,
    endpoint: `nnrps://localhost:${address.port}/session/default`,
    policy: "force-quic",
    security: quicSecurity,
  });
}

async function writeNativeTransportSmokeResult(
  resultPath: string | undefined,
  cells: readonly NativeTransportSmokeCell[],
): Promise<void> {
  if (resultPath === undefined) return;
  await Deno.mkdir(dirname(resultPath), { recursive: true });
  const temporaryPath = `${resultPath}.tmp`;
  await Deno.writeTextFile(
    temporaryPath,
    `${
      JSON.stringify(
        {
          schemaVersion: 1,
          sdk: "nnrp-js",
          host: { os: Deno.build.os, arch: Deno.build.arch },
          cells,
        },
        null,
        2,
      )
    }\n`,
  );
  await Deno.rename(temporaryPath, resultPath);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function verifyPacketLoopback(
  provider: NativeProvider,
  endpoint: string,
  security?: LoopbackSecurity,
): Promise<string> {
  if (!provider.localAvailable) {
    throw new Error(
      `${provider.kind}: packaged native provider is unavailable: ${provider.diagnostic?.message ?? "unknown"}`,
    );
  }
  const server = await provider.listen({
    endpoint,
    timeoutMillis: 5_000,
    ...(security === undefined ? {} : { security: security.server }),
  });
  const boundEndpoint = server.endpoint;
  if (provider.kind === "ipc") {
    await assertAcceptTimesOut(server);
  }
  const accepting = server.accept({ timeoutMillis: 5_000 });
  const client = await provider.connect({
    endpoint: server.endpoint,
    timeoutMillis: 5_000,
    ...(security === undefined ? {} : { security: security.client }),
  });
  const peer = await accepting;
  const outbound = [pingPacket(1), pingPacket(2)];
  try {
    await client.send(outbound);
    const received = await receivePackets(peer, outbound.length, 5_000);
    assertPackets(received, outbound, `${provider.kind} client-to-server`);
    await peer.send(received);
    const echoed = await receivePackets(client, outbound.length, 5_000);
    assertPackets(echoed, outbound, `${provider.kind} server-to-client`);
    console.log(`verified native ${provider.kind} loopback at ${boundEndpoint}`);
  } finally {
    await client.close();
    await peer.close();
    await server.close();
  }
  await assertAcceptRejectedAfterClose(provider.kind, server);
  return boundEndpoint;
}

async function assertAcceptRejectedAfterClose(
  kind: string,
  server: { accept(options?: { readonly timeoutMillis?: number }): Promise<NnrpTransportConnection> },
): Promise<void> {
  try {
    await server.accept({ timeoutMillis: 50 });
  } catch {
    return;
  }
  throw new Error(`${kind}: closed listener accepted another connection`);
}

async function assertAcceptTimesOut(
  server: { accept(options?: { readonly timeoutMillis?: number }): Promise<NnrpTransportConnection> },
): Promise<void> {
  try {
    await server.accept({ timeoutMillis: 25 });
  } catch {
    return;
  }
  throw new Error("ipc: listener accept ignored its timeout");
}

async function verifyRoleLoopback(options: RoleLoopbackOptions): Promise<void> {
  const timeoutMillis = 5_000;
  const serverRuntime = await openBackendRuntime({
    transports: [options.provider],
    transportPolicy: options.policy,
  });
  const server = serverRuntime.listen({
    endpoint: options.endpoint,
    providerRoutes: {
      [options.provider.kind]: {
        endpoint: options.providerEndpoint,
        ...(options.security === undefined ? {} : { security: options.security.server }),
      },
    },
    transportPolicy: options.policy,
  });
  const accepting = server.accept();
  let client: Awaited<ReturnType<typeof openNativeClient>> | undefined;
  let clientSession: Awaited<ReturnType<Awaited<ReturnType<typeof openNativeClient>>["openSession"]>> | undefined;
  let serverSession: Awaited<ReturnType<typeof server.accept>> | undefined;

  try {
    await delay(50);
    client = await withTimeout(
      openNativeClient({
        endpoint: options.endpoint,
        providerRoutes: {
          [options.provider.kind]: {
            endpoint: options.providerEndpoint,
            ...(options.security === undefined ? {} : { security: options.security.client }),
          },
        },
        transports: [options.provider],
        transportPolicy: options.policy,
      }),
      timeoutMillis,
      `${options.provider.kind} client connect`,
    );
    clientSession = await client.openSession();
    await clientSession.submitNoWait(tokenSubmit(1n, 1, new TextEncoder().encode("ping")));
    serverSession = await withTimeout(accepting, timeoutMillis, `${options.provider.kind} server accept`);
    if (clientSession.sessionId === 0 || clientSession.sessionId !== serverSession.sessionId) {
      throw new Error(
        `${options.provider.kind}: negotiated session identity mismatch ` +
          `(client=${clientSession.sessionId}, server=${serverSession.sessionId})`,
      );
    }
    const submit = await withTimeout(
      serverSession.receive({ timeoutMillis }),
      timeoutMillis,
      `${options.provider.kind} server receive`,
    );
    if (submit.metadata.type !== "frame_submit") {
      throw new Error(`${options.provider.kind}: expected submit, got ${submit.metadata.type}`);
    }
    const operationId = submit.metadata.value.operationId;

    await clientSession.updatePriority({
      operationId,
      controlSequence: 1n,
      priorityClass: 2,
      priorityDelta: 1,
      deadlineUnixMs: BigInt(Date.now() + timeoutMillis),
      flags: 0,
    });
    const priority = await withTimeout(
      serverSession.receive({ timeoutMillis }),
      timeoutMillis,
      `${options.provider.kind} server priority update`,
    );
    assertEventType(priority, NnrpMessageType.PriorityUpdate, options.provider.kind);
    if (priority.metadata.type !== "scheduling" || priority.metadata.value.operationId !== operationId) {
      throw new Error(`${options.provider.kind}: priority metadata did not round-trip`);
    }

    await clientSession.declareObject({
      objectId: 11n,
      objectKind: RuntimeObjectKind.Tensor,
      producerRole: RuntimeRole.Client,
      consumerRole: RuntimeRole.Server,
      sessionId: clientSession.sessionId,
      byteSize: 4n,
      computeCostUnits: 1,
      memoryLocationHint: MemoryLocationHint.HostMemory,
      ownershipHint: OwnershipHint.SessionOwned,
      lifetimeHintMs: timeoutMillis,
      metadataBytes: 1,
    }, new Uint8Array([0xa1]));
    const object = await withTimeout(
      serverSession.receive({ timeoutMillis }),
      timeoutMillis,
      `${options.provider.kind} server object declaration`,
    );
    assertEventType(object, NnrpMessageType.ObjectDeclare, options.provider.kind);
    if (
      object.metadata.type !== "object_descriptor" || object.metadata.value.objectId !== 11n ||
      object.tail.type !== "body" || object.tail.body[0] !== 0xa1
    ) {
      throw new Error(`${options.provider.kind}: object declaration did not round-trip`);
    }

    await clientSession.referenceCache({
      cacheNamespace: 1,
      cacheKeyHi: 2n,
      cacheKeyLo: 3n,
      profileId: 4,
      reuseScope: CacheReuseScope.Session,
      leaseId: 5n,
      producerTraceId: 6n,
      expirationHintMs: timeoutMillis,
      metadataBytes: 1,
      flags: 0,
    }, new Uint8Array([0xc1]));
    const cache = await withTimeout(
      serverSession.receive({ timeoutMillis }),
      timeoutMillis,
      `${options.provider.kind} server cache reference`,
    );
    assertEventType(cache, NnrpMessageType.CacheReference, options.provider.kind);
    if (
      cache.metadata.type !== "cache_reference" || cache.metadata.value.leaseId !== 5n ||
      cache.tail.type !== "body" || cache.tail.body[0] !== 0xc1
    ) {
      throw new Error(`${options.provider.kind}: cache reference did not round-trip`);
    }

    await serverSession.sendPartialResult({
      operationId,
      resultSequence: 1n,
      objectId: 11n,
      deltaSequence: 1n,
      bodyBytes: 2,
      flags: 0,
    }, new Uint8Array([0xd1, 0xd2]));
    const partial = expectRuntimeClientEvent(
      await withTimeout(
        clientSession.nextEvent({ timeoutMillis }),
        timeoutMillis,
        `${options.provider.kind} client partial result`,
      ),
      options.provider.kind,
    );
    assertEventType(partial, NnrpMessageType.PartialResult, options.provider.kind);
    if (
      partial.metadata.type !== "partial_result" || partial.metadata.value.objectId !== 11n ||
      partial.tail.type !== "body" || partial.tail.body.length !== 2 ||
      partial.tail.body[0] !== 0xd1 || partial.tail.body[1] !== 0xd2
    ) {
      throw new Error(`${options.provider.kind}: partial result did not round-trip`);
    }

    await serverSession.sendResult(
      createSuccessResult(operationId, submit.header.frameId, new TextEncoder().encode("pong")),
    );
    const result = await withTimeout(
      clientSession.nextResult({ timeoutMillis }),
      timeoutMillis,
      `${options.provider.kind} client result`,
    );
    const resultBody = result.event.type === "runtime" && result.event.event.tail.type === "body"
      ? result.event.event.tail.body
      : new Uint8Array();
    if (new TextDecoder().decode(resultBody) !== "pong") {
      throw new Error(`${options.provider.kind}: unexpected result payload`);
    }

    const clientSessionClose = clientSession.close();
    const closeEvent = await withTimeout(
      serverSession.receive({ timeoutMillis }),
      timeoutMillis,
      `${options.provider.kind} server close event`,
    );
    if (closeEvent.header.messageType !== NnrpMessageType.SessionClose) {
      throw new Error(`${options.provider.kind}: expected close, got ${closeEvent.header.messageType}`);
    }
    await serverSession.close();
    serverSession = undefined;
    await withTimeout(clientSessionClose, timeoutMillis, `${options.provider.kind} client session close`);
    clientSession = undefined;
    console.log(`verified native ${options.provider.kind} SDK role loopback at ${options.providerEndpoint}`);
  } finally {
    await serverSession?.close().catch(() => undefined);
    await clientSession?.close().catch(() => undefined);
    await client?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    await client?.runtime.close().catch(() => undefined);
    await serverRuntime.close().catch(() => undefined);
  }
}

function tokenSubmit(operationId: bigint, frameId: number, payload: Uint8Array) {
  return createTokenSubmitRequest({
    identity: { operationId, frameId, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload }],
  });
}

function assertEventType(
  event: NnrpRuntimeEvent,
  expected: NnrpMessageType,
  providerKind: string,
): void {
  if (event.header.messageType !== expected) {
    throw new Error(`${providerKind}: expected ${expected}, got ${event.header.messageType}`);
  }
}

function expectRuntimeClientEvent(event: NnrpClientEvent, providerKind: string): NnrpRuntimeEvent {
  if (event.type !== "runtime") {
    throw new Error(`${providerKind}: expected runtime event, got lifecycle ${event.event.state}`);
  }
  return event.event;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMillis: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMillis} ms`)), timeoutMillis);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function parseHostAndPort(endpoint: string, scheme: "tcp" | "quic"): { readonly host: string; readonly port: string } {
  const url = new URL(endpoint.includes("://") ? endpoint : `${scheme}://${endpoint}`);
  if (url.port.length === 0) throw new Error(`${scheme} endpoint does not include a port: ${endpoint}`);
  return { host: url.hostname, port: url.port };
}

function formatHostAndPort(endpoint: { readonly host: string; readonly port: string }): string {
  const host = endpoint.host.includes(":") ? `[${endpoint.host}]` : endpoint.host;
  return `${host}:${endpoint.port}`;
}

async function reserveUdpEndpoint(): Promise<{ readonly host: string; readonly port: string }> {
  const socket = createSocket("udp4");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(0, "127.0.0.1", resolve);
    });
    const address = socket.address();
    if (typeof address === "string") throw new Error(`unexpected UDP socket address: ${address}`);
    return { host: address.address, port: address.port.toString() };
  } finally {
    await new Promise<void>((resolve) => socket.close(resolve));
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function receivePackets(
  connection: NnrpTransportConnection,
  expectedCount: number,
  timeoutMillis: number,
): Promise<readonly Uint8Array[]> {
  const packets: Uint8Array[] = [];
  const deadline = Date.now() + timeoutMillis;
  while (packets.length < expectedCount) {
    const remainingMillis = deadline - Date.now();
    if (remainingMillis <= 0) {
      throw new Error(`timed out after receiving ${packets.length}/${expectedCount} packets`);
    }
    packets.push(
      ...await connection.receive({
        maxPackets: expectedCount - packets.length,
        timeoutMillis: remainingMillis,
      }),
    );
  }
  return packets;
}

function pingPacket(frameId: number): Uint8Array {
  const packet = new Uint8Array(40);
  packet.set([0x4e, 0x4e, 0x52, 0x50, 1, 0, 0x20, 40]);
  new DataView(packet.buffer).setUint32(24, frameId, true);
  return packet;
}

function assertPackets(
  actual: readonly Uint8Array[],
  expected: readonly Uint8Array[],
  label: string,
): void {
  if (actual.length !== expected.length) {
    throw new Error(`${label}: expected ${expected.length} packets, got ${actual.length}`);
  }
  for (const [index, packet] of actual.entries()) {
    if (packet.length !== expected[index]!.length || packet.some((byte, offset) => byte !== expected[index]![offset])) {
      throw new Error(`${label}: packet ${index} differs`);
    }
  }
}
