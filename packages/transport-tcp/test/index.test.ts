import { assertEquals } from "jsr:@std/assert@1";
import { createTcpTransportProvider } from "../src/index.ts";

Deno.test("@nnrp/transport-tcp creates a probeable TCP provider", async () => {
  const candidate = await createTcpTransportProvider({ score: 75 }).probe();
  assertEquals(candidate.kind, "tcp");
  assertEquals(candidate.localAvailable, true);
  assertEquals(candidate.score, 75);
});
