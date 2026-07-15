import { type NnrpNativeTransportBinding, NnrpTransportError } from "@nnrp/core";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createWebSocketTransportProvider } from "../src/index.ts";

Deno.test("@nnrp/transport-websocket exposes browser WebSocket provider metadata", () => {
  const provider = createWebSocketTransportProvider({ WebSocket: fakeWebSocketConstructor });

  assertEquals(provider.endpointSchemes, ["ws", "wss"]);
  assertEquals(provider.kind, "websocket");
  assertEquals(provider.localAvailable, true);
  assertEquals(provider.metadata.id, "nnrp.transport.websocket.browser-wasm");
});

Deno.test("@nnrp/transport-websocket owns WebSocket connect behavior", async () => {
  const provider = createWebSocketTransportProvider({ WebSocket: fakeWebSocketConstructor });
  const connection = await provider.connect({ endpoint: "ws://127.0.0.1/nnrp" });

  assertEquals(connection.kind, "websocket");
  assertEquals(connection.endpoint, "ws://127.0.0.1/nnrp");
  assertEquals(connection.connected, true);

  connection.send(new Uint8Array([1, 2, 3]));
  connection.close();
  assertEquals(connection.connected, false);
});

Deno.test("@nnrp/transport-websocket rejects missing runtimes and non-WebSocket endpoints", async () => {
  const missing = createWebSocketTransportProvider({ available: false, WebSocket: undefined });
  const provider = createWebSocketTransportProvider({ WebSocket: fakeWebSocketConstructor });

  await assertRejects(() => missing.connect({ endpoint: "ws://127.0.0.1/nnrp" }), NnrpTransportError);
  await assertRejects(() => provider.connect({ endpoint: "http://127.0.0.1/nnrp" }), NnrpTransportError);
  await assertRejects(
    () =>
      provider.connect({
        endpoint: "wss://127.0.0.1/nnrp",
        security: { mode: "client", serverName: "localhost", trustedCertificateDer: new Uint8Array([1]) },
      }),
    NnrpTransportError,
  );
  await assertRejects(() => provider.probe({ endpoint: "ws://127.0.0.1/nnrp" }), NnrpTransportError);
  await assertRejects(() => provider.listen({ endpoint: "ws://127.0.0.1/nnrp" }), NnrpTransportError);
});

Deno.test("@nnrp/transport-websocket delegates native probe and listen", async () => {
  const operations: string[] = [];
  const connection = fakeNativeConnection();
  const binding: NnrpNativeTransportBinding = {
    mode: "test",
    probe: () => {
      operations.push("probe");
      return Promise.resolve({
        sampleCount: 1,
        successCount: 1,
        medianThroughputBytesPerSecond: 2n,
        medianRttMicroseconds: 3n,
      });
    },
    connect: () => Promise.resolve(connection),
    listen: ({ endpoint }) => {
      operations.push("listen");
      return Promise.resolve({
        kind: "websocket",
        endpoint: String(endpoint),
        listening: true,
        accept: () => Promise.resolve(connection),
        close: () => {},
      });
    },
  };
  const provider = createWebSocketTransportProvider({ binding });

  assertEquals((await provider.probe({ endpoint: "ws://127.0.0.1/nnrp" })).successCount, 1);
  assertEquals((await provider.listen({ endpoint: "ws://127.0.0.1/nnrp" })).listening, true);
  assertEquals(provider.metadata.id, "nnrp.transport.websocket.native");
  assertEquals(operations, ["probe", "listen"]);
});

Deno.test("@nnrp/transport-websocket receives all browser binary message forms", async () => {
  const provider = createWebSocketTransportProvider({ WebSocket: fakeWebSocketConstructor });
  const connection = await provider.connect({ endpoint: new URL("ws://127.0.0.1/nnrp?mode=test") });
  const socket = FakeWebSocket.last!;

  socket.message(new Uint8Array([1, 2]).buffer);
  socket.message(new Uint16Array([0x0403]));
  socket.message(new Blob([new Uint8Array([5, 6])]));
  await Promise.resolve();

  assertEquals(await connection.receive({ maxPackets: 2 }), [new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
  assertEquals(await connection.receive(), [new Uint8Array([5, 6])]);
  await assertRejects(() => connection.receive({ maxPackets: 0 }), RangeError);
});

Deno.test("@nnrp/transport-websocket surfaces browser protocol and lifecycle failures", async () => {
  const provider = createWebSocketTransportProvider({ WebSocket: fakeWebSocketConstructor });
  const textConnection = await provider.connect({ endpoint: "ws://127.0.0.1/text" });
  FakeWebSocket.last!.message("not-binary");
  await assertRejects(() => textConnection.receive(), NnrpTransportError);

  const errorConnection = await provider.connect({ endpoint: "ws://127.0.0.1/error" });
  FakeWebSocket.last!.fail();
  await assertRejects(() => errorConnection.receive(), NnrpTransportError);

  const closedConnection = await provider.connect({ endpoint: "ws://127.0.0.1/closed" });
  FakeWebSocket.last!.close();
  await assertRejects(() => closedConnection.receive(), NnrpTransportError);
  await assertRejects(() => closedConnection.send(new Uint8Array([1])), NnrpTransportError);

  const timeoutConnection = await provider.connect({ endpoint: "ws://127.0.0.1/timeout" });
  await assertRejects(() => timeoutConnection.receive({ timeoutMillis: 1 }), NnrpTransportError);
});

Deno.test("@nnrp/transport-websocket validates packet batches and applies browser backpressure", async () => {
  const provider = createWebSocketTransportProvider({ WebSocket: fakeWebSocketConstructor });
  const connection = await provider.connect({ endpoint: "ws://127.0.0.1/backpressure" });
  const socket = FakeWebSocket.last!;

  await assertRejects(() => connection.send([]), TypeError);
  await assertRejects(() => connection.send(new Uint8Array()), TypeError);
  socket.bufferedAmount = 1_048_577;
  setTimeout(() => socket.bufferedAmount = 0, 2);
  await connection.send([new Uint8Array([1]), new Uint8Array([2])]);
  assertEquals(socket.sent, [new Uint8Array([1]), new Uint8Array([2])]);
});

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static last: FakeWebSocket | undefined;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  bufferedAmount = 0;
  binaryType = "blob";
  sent: unknown[] = [];

  constructor(url: string | URL) {
    super();
    FakeWebSocket.last = this;
    this.url = String(url);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatchEvent(new Event("open"));
    });
  }

  send(payload: unknown): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  message(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  fail(): void {
    this.dispatchEvent(new Event("error"));
  }
}

const fakeWebSocketConstructor = FakeWebSocket as unknown as typeof WebSocket;

function fakeNativeConnection() {
  return {
    kind: "websocket" as const,
    endpoint: "ws://127.0.0.1/nnrp",
    connected: true,
    send: () => Promise.resolve(),
    receive: () => Promise.resolve([]),
    close: () => {},
  };
}
