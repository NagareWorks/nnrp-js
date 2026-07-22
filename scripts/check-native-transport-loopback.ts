import { createIpcTransportProvider } from "@nnrp/transport-ipc";
import { type NnrpNativeTransportProvider as NnrpClientTransportProvider, openNativeClient } from "@nnrp/native-client";
import {
  type NnrpNativeTransportProvider as NnrpServerTransportProvider,
  openBackendRuntime,
} from "@nnrp/native-server";
import { createQuicTransportProvider } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import type {
  NnrpTransportClientSecurity,
  NnrpTransportConnection,
  NnrpTransportPolicy,
  NnrpTransportProvider,
  NnrpTransportServerSecurity,
} from "@nnrp/core";
import { createSocket } from "node:dgram";
import { QUIC_TEST_CERTIFICATE_DER, QUIC_TEST_PRIVATE_KEY_PKCS8_DER } from "./fixtures/quic-test-identity.ts";

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

const nonce = `${Deno.pid}-${Date.now()}`;
const ipcProviderEndpoint = Deno.build.os === "windows"
  ? `npipe://nnrp-js-${nonce}`
  : `unix://${Deno.makeTempDirSync()}/nnrp.sock`;

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

const tcp = createTcpTransportProvider();
const tcpPacketEndpoint = await verifyPacketLoopback(tcp, "127.0.0.1:0");
const tcpProviderEndpoint = formatHostAndPort(parseHostAndPort(tcpPacketEndpoint, "tcp"));
await verifyRoleLoopback({
  provider: tcp,
  providerEndpoint: tcpProviderEndpoint,
  endpoint: `nnrp://${tcpProviderEndpoint}/session/default`,
  policy: "force-tcp",
});

const ipc = createIpcTransportProvider();
await verifyPacketLoopback(ipc, ipcProviderEndpoint);
await verifyRoleLoopback({
  provider: ipc,
  providerEndpoint: ipcProviderEndpoint,
  endpoint: "nnrp://localhost/session/default",
  policy: "force-ipc",
});

const websocket = createWebSocketTransportProvider();
const websocketProviderEndpoint = await verifyPacketLoopback(websocket, "ws://127.0.0.1:0/nnrp");
const websocketUrl = new URL(websocketProviderEndpoint);
await verifyRoleLoopback({
  provider: websocket,
  providerEndpoint: websocketProviderEndpoint,
  endpoint: `nnrp://${websocketUrl.hostname}:${websocketUrl.port}/session/default`,
  policy: "force-websocket",
});

const quic = createQuicTransportProvider();
await verifyPacketLoopback(quic, "127.0.0.1:0", quicSecurity);
const quicAddress = await reserveUdpEndpoint();
const quicProviderEndpoint = formatHostAndPort(quicAddress);
await verifyRoleLoopback({
  provider: quic,
  providerEndpoint: quicProviderEndpoint,
  endpoint: `nnrps://localhost:${quicAddress.port}/session/default`,
  policy: "force-quic",
  security: quicSecurity,
});

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

async function verifyRoleLoopback(options: RoleLoopbackOptions): Promise<void> {
  const timeoutMillis = 5_000;
  const serverRuntime = await openBackendRuntime({
    transports: [options.provider],
    transportPolicy: options.policy,
  });
  const server = serverRuntime.listen({
    endpoint: options.endpoint,
    providerEndpoint: options.providerEndpoint,
    transportPolicy: options.policy,
    ...(options.security === undefined ? {} : { security: options.security.server }),
  });
  const accepting = server.accept();
  let client: Awaited<ReturnType<typeof openNativeClient>> | undefined;
  let clientSession: ReturnType<Awaited<ReturnType<typeof openNativeClient>>["openSession"]> | undefined;
  let serverSession: Awaited<ReturnType<typeof server.accept>> | undefined;

  try {
    await delay(50);
    client = await withTimeout(
      openNativeClient({
        endpoint: options.endpoint,
        providerEndpoint: options.providerEndpoint,
        transports: [options.provider],
        transportPolicy: options.policy,
        ...(options.security === undefined ? {} : { security: options.security.client }),
      }),
      timeoutMillis,
      `${options.provider.kind} client connect`,
    );
    clientSession = client.openSession({ inputProfile: "token" });
    const resultPending = clientSession.submit({
      operationId: 1n,
      frameId: 1,
      payload: new TextEncoder().encode("ping"),
      inputProfile: "token",
    });
    serverSession = await withTimeout(accepting, timeoutMillis, `${options.provider.kind} server accept`);
    const submit = await withTimeout(
      serverSession.receive({ timeoutMillis }),
      timeoutMillis,
      `${options.provider.kind} server receive`,
    );
    if (submit.type !== "submit") {
      throw new Error(`${options.provider.kind}: expected submit, got ${submit.type}`);
    }
    await serverSession.sendResult({
      frameId: submit.submit.frameId,
      payload: new TextEncoder().encode("pong"),
    });
    const result = await withTimeout(resultPending, timeoutMillis, `${options.provider.kind} client result`);
    if (new TextDecoder().decode(result.payload) !== "pong") {
      throw new Error(`${options.provider.kind}: unexpected result payload`);
    }

    const clientSessionClose = clientSession.close();
    const closeEvent = await withTimeout(
      serverSession.receive({ timeoutMillis }),
      timeoutMillis,
      `${options.provider.kind} server close event`,
    );
    if (closeEvent.type !== "close") {
      throw new Error(`${options.provider.kind}: expected close, got ${closeEvent.type}`);
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
