import { type NnrpNativeTransportBinding } from "@nnrp/core";
import { assertEquals } from "jsr:@std/assert@1";
import { createTcpTransportProvider } from "../src/index.ts";

Deno.test("@nnrp/transport-tcp reports an unavailable package binding", () => {
  const provider = createTcpTransportProvider({
    available: false,
    diagnostic: {
      code: "NNRP_TCP_NATIVE_BINDING_MISSING",
      message: "test artifact unavailable",
      source: "transport",
      retryable: false,
      transport: "tcp",
    },
  });

  assertEquals(provider.endpointSchemes, ["tcp"]);
  assertEquals(provider.kind, "tcp");
  assertEquals(provider.localAvailable, false);
  assertEquals(provider.metadata.id, "nnrp.transport.tcp.native");
});

Deno.test("@nnrp/transport-tcp delegates probe, connect, and listen to the package binding", async () => {
  const operations: string[] = [];
  const binding = fakeTcpBinding(operations);
  const provider = createTcpTransportProvider({ binding, preferenceRank: 5, maxFrameBytes: 1024n });

  const probe = await provider.probe({ endpoint: "127.0.0.1:4433" });
  const server = await provider.listen({ endpoint: "127.0.0.1:0" });
  const client = await provider.connect({ endpoint: server.endpoint });
  const peer = await server.accept();

  assertEquals(provider.localAvailable, true);
  assertEquals(provider.metadata.preferenceRank, 5);
  assertEquals(provider.metadata.limits.maxFrameBytes, 1024n);
  assertEquals(probe.successCount, 1);
  assertEquals(client.connected, true);
  assertEquals(peer.connected, true);
  assertEquals(operations, ["probe", "listen", "connect", "accept"]);
});

function fakeTcpBinding(operations: string[]): NnrpNativeTransportBinding {
  const connection = (endpoint: string) => ({
    kind: "tcp" as const,
    endpoint,
    connected: true,
    send: () => Promise.resolve(),
    receive: () => Promise.resolve([]),
    close: () => {},
  });
  return {
    mode: "test",
    probe: () => {
      operations.push("probe");
      return Promise.resolve({
        sampleCount: 1,
        successCount: 1,
        medianThroughputBytesPerSecond: 1n,
        medianRttMicroseconds: 1n,
      });
    },
    connect: ({ endpoint }) => {
      operations.push("connect");
      return Promise.resolve(connection(String(endpoint)));
    },
    listen: ({ endpoint }) => {
      operations.push("listen");
      return Promise.resolve({
        kind: "tcp",
        endpoint: String(endpoint),
        listening: true,
        accept: () => {
          operations.push("accept");
          return Promise.resolve(connection(String(endpoint)));
        },
        close: () => {},
      });
    },
  };
}
