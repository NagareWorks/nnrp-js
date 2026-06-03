import { assertEquals } from "jsr:@std/assert@1";
import { createQuicTransportProvider } from "../src/index.ts";

Deno.test("@nnrp/transport-quic creates a probeable QUIC provider", async () => {
  const candidate = await createQuicTransportProvider({ available: false }).probe();
  assertEquals(candidate.kind, "quic");
  assertEquals(candidate.localAvailable, false);
  assertEquals(candidate.score, 80);
});
