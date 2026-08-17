import { type NnrpNativeTransportBinding, NnrpTransportError } from "@nnrp/core";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createWebSocketTransportProvider } from "../src/browser.ts";

Deno.test("@nnrp/transport-websocket browser entry owns browser provider construction", async () => {
  const provider = createWebSocketTransportProvider({
    WebSocket: BrowserEntryWebSocket as unknown as typeof WebSocket,
    cost: { modelId: 7, units: 8n },
    preferenceRank: 2,
    maxFrameBytes: 1024n,
  });

  assertEquals(provider.localAvailable, true);
  assertEquals(provider.descriptor.kind, "wasm");
  assertEquals(provider.descriptor.metadata === provider.metadata, true);
  assertEquals(provider.metadata, {
    id: "nnrp.transport.websocket.browser-wasm",
    cost: { modelId: 7, units: 8n },
    preferenceRank: 2,
    limits: { maxFrameBytes: 1024n },
    limitations: ["requires-tcp", "browser-host-only"],
  });
  const connection = await provider.connect({ endpoint: "ws://127.0.0.1/browser-entry" });
  assertEquals(connection.connected, true);
  connection.close();
  await assertRejects(
    () => provider.probe({ endpoint: "ws://127.0.0.1/browser-entry" }),
    NnrpTransportError,
    "package-owned native binding",
  );
  await assertRejects(
    () => provider.listen({ endpoint: "ws://127.0.0.1/browser-entry" }),
    NnrpTransportError,
    "package-owned native binding",
  );
});

Deno.test("@nnrp/transport-websocket browser entry preserves explicit native bindings", async () => {
  const connection = {
    kind: "websocket" as const,
    endpoint: "ws://127.0.0.1/native-entry",
    connected: true,
    send: () => Promise.resolve(),
    receive: () => Promise.resolve([]),
    close: () => {},
  };
  const binding: NnrpNativeTransportBinding = {
    mode: "test",
    probe: () =>
      Promise.resolve({
        sampleCount: 1,
        successCount: 1,
        medianThroughputBytesPerSecond: 2n,
        medianRttMicroseconds: 3n,
      }),
    connect: () => Promise.resolve(connection),
    listen: ({ endpoint }) =>
      Promise.resolve({
        kind: "websocket",
        endpoint: String(endpoint),
        listening: true,
        accept: () => Promise.resolve(connection),
        close: () => {},
      }),
  };
  const provider = createWebSocketTransportProvider({ binding });

  assertEquals(provider.descriptor.kind, "native-dynamic");
  assertEquals(provider.descriptor.metadata === provider.metadata, true);
  assertEquals(provider.metadata.id, "nnrp.transport.websocket.native");
  assertEquals(provider.metadata.limitations, ["requires-tcp", "native-host-only"]);
  assertEquals((await provider.probe({ endpoint: "ws://127.0.0.1/native-entry" })).successCount, 1);
  assertEquals((await provider.connect({ endpoint: "ws://127.0.0.1/native-entry" })).endpoint, connection.endpoint);
  assertEquals((await provider.listen({ endpoint: "ws://127.0.0.1/native-entry" })).listening, true);
});

Deno.test("@nnrp/transport-websocket browser entry reports an explicitly unavailable provider", async () => {
  const provider = createWebSocketTransportProvider({ available: false });
  assertEquals(provider.localAvailable, false);
  assertEquals(provider.diagnostic?.code, "NNRP_WEBSOCKET_RUNTIME_MISSING");
  await assertRejects(
    () => provider.connect({ endpoint: "ws://127.0.0.1/unavailable" }),
    NnrpTransportError,
    "WebSocket transport requires",
  );
});

class BrowserEntryWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = BrowserEntryWebSocket.CONNECTING;
  bufferedAmount = 0;
  binaryType = "blob";

  constructor(_url: string | URL) {
    super();
    queueMicrotask(() => {
      this.readyState = BrowserEntryWebSocket.OPEN;
      this.dispatchEvent(new Event("open"));
    });
  }

  send(_payload: unknown): void {}

  close(): void {
    this.readyState = BrowserEntryWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}
