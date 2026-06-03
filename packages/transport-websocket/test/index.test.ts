import { NnrpTransportError } from "@nnrp/core";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createWebSocketTransportProvider } from "../src/index.ts";

Deno.test("@nnrp/transport-websocket creates a probeable WebSocket provider", async () => {
  const provider = createWebSocketTransportProvider({ WebSocket: fakeWebSocketConstructor });
  const candidate = await provider.probe();

  assertEquals(provider.endpointSchemes, ["ws", "wss"]);
  assertEquals(candidate.kind, "websocket");
  assertEquals(candidate.localAvailable, true);
  assertEquals(candidate.score, 70);
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
});

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: unknown[] = [];

  constructor(url: string | URL) {
    super();
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
  }
}

const fakeWebSocketConstructor = FakeWebSocket as unknown as typeof WebSocket;
