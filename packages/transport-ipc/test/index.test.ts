import { type NnrpNativeTransportBinding, NnrpTransportError } from "@nnrp/core";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createIpcTransportProvider } from "../src/index.ts";

Deno.test("@nnrp/transport-ipc delegates complete packet lifecycle to its native binding", async () => {
  const operations: string[] = [];
  const binding = fakeIpcBinding(operations);
  const provider = createIpcTransportProvider({ binding, platform: "unix", preferenceRank: 1 });
  const endpoint = "unix:///run/nnrp/runtime.sock";

  const probe = await provider.probe({ endpoint });
  const server = await provider.listen({ endpoint });
  const client = await provider.connect({ endpoint });
  const peer = await server.accept();
  await client.send([new Uint8Array([1]), new Uint8Array([2])]);
  const packets = await peer.receive();

  assertEquals(provider.kind, "ipc");
  assertEquals(provider.localAvailable, true);
  assertEquals(provider.metadata.preferenceRank, 1);
  assertEquals(probe.successCount, 1);
  assertEquals(packets, [new Uint8Array([1]), new Uint8Array([2])]);
  assertEquals(operations, ["probe", "listen", "connect", "accept", "send", "receive"]);
});

Deno.test("@nnrp/transport-ipc enforces host-specific endpoint schemes", async () => {
  const binding = fakeIpcBinding([]);
  const unix = createIpcTransportProvider({ binding, platform: "unix" });
  const windows = createIpcTransportProvider({ binding, platform: "windows" });

  await assertRejects(() => unix.connect({ endpoint: "npipe://./pipe/nnrp" }), NnrpTransportError);
  await assertRejects(() => windows.connect({ endpoint: "unix:///run/nnrp.sock" }), NnrpTransportError);
  await assertRejects(
    () =>
      unix.connect({
        endpoint: "unix:///run/nnrp.sock",
        security: { mode: "client", serverName: "localhost", trustedCertificateDer: new Uint8Array([1]) },
      }),
    NnrpTransportError,
  );
});

function fakeIpcBinding(operations: string[]): NnrpNativeTransportBinding {
  const queue: Uint8Array[] = [];
  const connection = (endpoint: string) => ({
    kind: "ipc" as const,
    endpoint,
    connected: true,
    send: (packets: Uint8Array | readonly Uint8Array[]) => {
      operations.push("send");
      queue.push(...(packets instanceof Uint8Array ? [packets] : packets).map((packet) => packet.slice()));
      return Promise.resolve();
    },
    receive: () => {
      operations.push("receive");
      return Promise.resolve(queue.splice(0));
    },
    close: () => {},
  });
  return {
    mode: "test",
    probe: () => {
      operations.push("probe");
      return Promise.resolve({
        sampleCount: 1,
        successCount: 1,
        medianThroughputBytesPerSecond: 1n,
        medianRttMicroseconds: 1n,
      });
    },
    connect: ({ endpoint }) => {
      operations.push("connect");
      return Promise.resolve(connection(String(endpoint)));
    },
    listen: ({ endpoint }) => {
      operations.push("listen");
      return Promise.resolve({
        kind: "ipc",
        endpoint: String(endpoint),
        listening: true,
        accept: () => {
          operations.push("accept");
          return Promise.resolve(connection(String(endpoint)));
        },
        close: () => {},
      });
    },
  };
}
