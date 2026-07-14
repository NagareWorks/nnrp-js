import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createTcpTransportProvider } from "../src/index.ts";

Deno.test("@nnrp/transport-tcp exposes frozen TCP provider metadata", () => {
  const provider = createTcpTransportProvider({ preferenceRank: 5, maxFrameBytes: 1024n });

  assertEquals(provider.endpointSchemes, ["tcp"]);
  assertEquals(provider.kind, "tcp");
  assertEquals(provider.localAvailable, true);
  assertEquals(provider.metadata.id, "nnrp.transport.tcp.native");
  assertEquals(provider.metadata.preferenceRank, 5);
  assertEquals(provider.metadata.limits.maxFrameBytes, 1024n);
});

Deno.test("@nnrp/transport-tcp owns Node TCP listen and connect behavior", async () => {
  const provider = createTcpTransportProvider();
  const server = await provider.listen({ endpoint: "127.0.0.1:0" });
  const client = await provider.connect({ endpoint: server.endpoint });

  assertEquals(server.kind, "tcp");
  assertEquals(server.listening, true);
  assertEquals(client.kind, "tcp");
  assertEquals(client.connected, true);

  client.close();
  await server.close();
});

Deno.test("@nnrp/transport-tcp rejects invalid connect endpoints", async () => {
  await assertRejects(() => createTcpTransportProvider().connect({ endpoint: "127.0.0.1:0" }), Error);
});
