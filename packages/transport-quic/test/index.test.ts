import { NnrpTransportError } from "@nnrp/core";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createQuicTransportProvider, type NnrpQuicNativeBinding } from "../src/index.ts";

Deno.test("@nnrp/transport-quic reports unavailable without a native QUIC binding", async () => {
  const provider = createQuicTransportProvider();
  const candidate = await provider.probe();

  assertEquals(provider.endpointSchemes, ["quic"]);
  assertEquals(candidate.kind, "quic");
  assertEquals(candidate.localAvailable, false);
  assertEquals(candidate.score, 80);

  await assertRejects(
    async () => await provider.connect({ endpoint: "quic://127.0.0.1:4433" }),
    NnrpTransportError,
  );
  await assertRejects(
    async () => await provider.listen({ endpoint: "quic://127.0.0.1:4433" }),
    NnrpTransportError,
  );
});

Deno.test("@nnrp/transport-quic delegates connect and listen to its native binding", async () => {
  const binding: NnrpQuicNativeBinding = {
    connect: ({ endpoint }) => ({
      kind: "quic",
      endpoint: String(endpoint),
      connected: true,
      send: () => {},
      close: () => {},
    }),
    listen: ({ endpoint }) => ({
      kind: "quic",
      endpoint: String(endpoint),
      listening: true,
      close: () => {},
    }),
  };
  const provider = createQuicTransportProvider({ native: binding, score: 95 });
  const candidate = await provider.probe();
  const connection = await provider.connect({ endpoint: "quic://127.0.0.1:4433" });
  const server = await provider.listen({ endpoint: "quic://127.0.0.1:4433" });

  assertEquals(candidate.localAvailable, true);
  assertEquals(candidate.score, 95);
  assertEquals(connection.connected, true);
  assertEquals(server.listening, true);
});
