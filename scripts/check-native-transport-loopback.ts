import { createIpcTransportProvider } from "@nnrp/transport-ipc";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import type { NnrpTransportConnection, NnrpTransportProvider } from "@nnrp/core";

const nonce = `${Deno.pid}-${Date.now()}`;
const ipcEndpoint = Deno.build.os === "windows"
  ? `npipe://nnrp-js-${nonce}`
  : `unix://${Deno.makeTempDirSync()}/nnrp.sock`;

await verifyLoopback(createTcpTransportProvider(), "tcp://127.0.0.1:0");
await verifyLoopback(createIpcTransportProvider(), ipcEndpoint);
await verifyLoopback(createWebSocketTransportProvider(), "ws://127.0.0.1:0/nnrp");

async function verifyLoopback(provider: NnrpTransportProvider, endpoint: string): Promise<void> {
  if (!provider.localAvailable || provider.connect === undefined || provider.listen === undefined) {
    throw new Error(
      `${provider.kind}: packaged native provider is unavailable: ${provider.diagnostic?.message ?? "unknown"}`,
    );
  }
  const server = await provider.listen({ endpoint, timeoutMillis: 5_000 });
  const accepting = server.accept({ timeoutMillis: 5_000 });
  const client = await provider.connect({ endpoint: server.endpoint, timeoutMillis: 5_000 });
  const peer = await accepting;
  const outbound = [pingPacket(1), pingPacket(2)];
  try {
    await client.send(outbound);
    const received = await receivePackets(peer, outbound.length, 5_000);
    assertPackets(received, outbound, `${provider.kind} client-to-server`);
    await peer.send(received);
    const echoed = await receivePackets(client, outbound.length, 5_000);
    assertPackets(echoed, outbound, `${provider.kind} server-to-client`);
    console.log(`verified native ${provider.kind} loopback at ${server.endpoint}`);
  } finally {
    await client.close();
    await peer.close();
    await server.close();
  }
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
