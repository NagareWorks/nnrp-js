import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createTcpTransportProvider } from "../src/index.ts";

Deno.test("@nnrp/transport-tcp creates a probeable TCP provider", async () => {
  const provider = createTcpTransportProvider({ score: 75 });
  const candidate = await provider.probe();

  assertEquals(provider.endpointSchemes, ["tcp"]);
  assertEquals(candidate.kind, "tcp");
  assertEquals(candidate.localAvailable, true);
  assertEquals(candidate.score, 75);
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
  const candidate = await createTcpTransportProvider({ score: 75 }).probe();

  assertEquals(candidate.localAvailable, true);
  await assertRejects(() => createTcpTransportProvider().connect({ endpoint: "127.0.0.1:0" }), Error);
});
