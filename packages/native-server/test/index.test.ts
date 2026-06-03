import { createBackendNativeManifest, NnrpTransportError } from "@nnrp/core";
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { openBackendRuntime } from "../src/index.ts";
import { createQuicTransportProvider } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

Deno.test("@nnrp/native-server opens backend runtime and listens with explicit providers", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transportPolicy: "tcp-only",
    transports: [createTcpTransportProvider(), createQuicTransportProvider()],
  });
  const server = runtime.listen({ endpoint: "0.0.0.0:4433", transportPolicy: "quic-only" });

  assertEquals(runtime.libraryPath, "native/linux-x86_64/libnnrp_ffi.so");
  assertEquals(server.endpoint, "0.0.0.0:4433");
  assertEquals(server.transportPolicy, "quic-only");

  await runtime.close();
  assertEquals(server.closed, true);
});

Deno.test("@nnrp/native-server selects only installed transport providers", async () => {
  const tcpRuntime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [createTcpTransportProvider({ score: 70 })],
  });
  const tcpSummary = await tcpRuntime.selectTransportWithNative({
    peerManifest: createBackendNativeManifest(["transport.tcp", "transport.quic"]),
  });

  assertEquals(tcpSummary.selected, "tcp");
  assertEquals(tcpSummary.rejected.map((item) => item.kind), ["quic"]);
  assertEquals(tcpSummary.rejected[0]?.reason, "local-unavailable");

  const noProviderRuntime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [],
  });
  const noProviderSummary = await noProviderRuntime.selectTransportWithNative({
    peerManifest: createBackendNativeManifest(["transport.tcp", "transport.quic"]),
  });

  assertEquals(noProviderSummary.selected, null);
  assertEquals(noProviderSummary.rejected.map((item) => item.kind).sort(), ["quic", "tcp"]);
});

Deno.test("@nnrp/native-server rejects listen policies unsatisfied by installed providers", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [createTcpTransportProvider()],
  });

  const error = assertThrows(
    () => runtime.listen({ endpoint: "0.0.0.0:4433", transportPolicy: "quic-only" }),
    NnrpTransportError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED");
  assertEquals(error.diagnostic.transport, "quic");
});
