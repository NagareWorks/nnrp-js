import { assertEquals } from "jsr:@std/assert@1";
import { createWebSocketTransportProvider } from "../src/index.ts";

Deno.test("@nnrp/transport-websocket creates a probeable WebSocket provider", async () => {
  const candidate = await createWebSocketTransportProvider({ endpointScheme: "ws" }).probe();
  assertEquals(candidate.kind, "websocket");
  assertEquals(candidate.localAvailable, true);
  assertEquals(candidate.score, 70);
});
