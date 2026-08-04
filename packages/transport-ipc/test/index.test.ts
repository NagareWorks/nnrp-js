import {
  type NnrpNativeTransportBinding,
  type NnrpTransportConnection,
  NnrpTransportError,
  type NnrpTransportReceiveOptions,
} from "@nnrp/core";
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { createIpcTransportProvider } from "../src/index.ts";
import { selectNativeAbiLayout } from "../src/native-node.ts";

Deno.test("@nnrp/transport-ipc validates every supported native ABI layout", () => {
  assertNativeAbiLayouts(selectNativeAbiLayout);
});

function assertNativeAbiLayouts(select: typeof selectNativeAbiLayout): void {
  assertEquals(select(8, 8).event.size, 200);
  assertEquals(select(4, 8).request.openSize, 56);
  assertEquals(select(4, 4).event.size, 160);
  assertThrows(() => select(8, 4), Error, "does not support pointer=8, u64-align=4");
}

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

Deno.test("@nnrp/transport-ipc reports a missing packaged artifact for every native operation", async () => {
  const provider = createIpcTransportProvider({ available: false, platform: "unix" });
  const endpoint = { endpoint: "unix:///run/nnrp/runtime.sock" };

  assertEquals(provider.localAvailable, false);
  assertEquals(provider.diagnostic?.code, "NNRP_IPC_NATIVE_BINDING_MISSING");
  for (
    const operation of [
      () => provider.probe(endpoint),
      () => provider.connect(endpoint),
      () => provider.listen(endpoint),
    ]
  ) {
    const error = await assertRejects(operation, NnrpTransportError);
    assertEquals(error.diagnostic.code, "NNRP_IPC_NATIVE_BINDING_MISSING");
    assertEquals(error.diagnostic.transport, "ipc");
  }
});

Deno.test("@nnrp/transport-ipc preserves close, timeout, and backpressure binding contracts", async () => {
  let receiveOptions: NnrpTransportReceiveOptions | undefined;
  let closed = false;
  const backpressure = new NnrpTransportError({
    code: "NNRP_IPC_BACKPRESSURE",
    message: "IPC send queue is full.",
    source: "transport",
    retryable: true,
    transport: "ipc",
  });
  const connection: NnrpTransportConnection = {
    kind: "ipc",
    endpoint: "unix:///run/nnrp/runtime.sock",
    get connected() {
      return !closed;
    },
    send: () => Promise.reject(backpressure),
    receive: (options) => {
      receiveOptions = options;
      return Promise.resolve([]);
    },
    close: () => {
      closed = true;
    },
  };
  const binding: NnrpNativeTransportBinding = {
    mode: "test",
    probe: () =>
      Promise.resolve({
        sampleCount: 1,
        successCount: 1,
        medianThroughputBytesPerSecond: 1n,
        medianRttMicroseconds: 1n,
      }),
    connect: () => Promise.resolve(connection),
    listen: () => Promise.reject(new Error("unused")),
  };
  const provider = createIpcTransportProvider({ binding, platform: "unix" });
  const client = await provider.connect({ endpoint: connection.endpoint, timeoutMillis: 25 });

  const error = await assertRejects(() => client.send(new Uint8Array([1])), NnrpTransportError);
  assertEquals(error.diagnostic.code, "NNRP_IPC_BACKPRESSURE");
  await client.receive({ maxPackets: 2, maxBytes: 32n, timeoutMillis: 17 });
  assertEquals(receiveOptions, { maxPackets: 2, maxBytes: 32n, timeoutMillis: 17 });
  await client.close();
  assertEquals(client.connected, false);
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
