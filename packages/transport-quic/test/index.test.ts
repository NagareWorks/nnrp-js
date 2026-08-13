import { NnrpTransportError } from "@nnrp/core";
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { createQuicTransportProvider, type NnrpQuicNativeBinding } from "../src/index.ts";
import { selectNativeAbiLayout } from "../src/native-node.ts";

Deno.test("@nnrp/transport-quic validates every supported native ABI layout", () => {
  assertNativeAbiLayouts(selectNativeAbiLayout);
});

function assertNativeAbiLayouts(select: typeof selectNativeAbiLayout): void {
  assertEquals(select(8, 8).event.size, 200);
  assertEquals(select(4, 8).request.openSize, 56);
  assertEquals(select(4, 4).event.size, 160);
  assertThrows(() => select(8, 4), Error, "does not support pointer=8, u64-align=4");
}

Deno.test("@nnrp/transport-quic reports unavailable without a native QUIC binding", async () => {
  const provider = createQuicTransportProvider({ available: false });

  assertEquals(provider.endpointSchemes, ["quic"]);
  assertEquals(provider.kind, "quic");
  assertEquals(provider.localAvailable, false);
  assertEquals(provider.metadata.id, "nnrp.transport.quic.native");

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
    mode: "test",
    probe: () =>
      Promise.resolve({
        sampleCount: 1,
        successCount: 1,
        medianRttMicroseconds: 1n,
        medianThroughputBytesPerSecond: 1n,
      }),
    connect: ({ endpoint }) =>
      Promise.resolve({
        kind: "quic",
        endpoint: String(endpoint),
        connected: true,
        send: () => Promise.resolve(),
        receive: () => Promise.resolve([]),
        close: () => {},
      }),
    listen: ({ endpoint }) =>
      Promise.resolve({
        kind: "quic",
        endpoint: String(endpoint),
        listening: true,
        accept: async () => await binding.connect({ endpoint }),
        close: () => {},
      }),
  };
  const provider = createQuicTransportProvider({ binding, preferenceRank: 4 });
  const connection = await provider.connect({ endpoint: "quic://127.0.0.1:4433" });
  const server = await provider.listen({ endpoint: "quic://127.0.0.1:4433" });

  assertEquals(provider.localAvailable, true);
  assertEquals(provider.descriptor.metadata === provider.metadata, true);
  assertEquals(provider.metadata.preferenceRank, 4);
  assertEquals(connection.connected, true);
  assertEquals(server.listening, true);
});
