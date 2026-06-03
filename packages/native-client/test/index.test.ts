import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createBackendNativeManifest, NnrpCapabilityError, NnrpTransportError } from "@nnrp/core";
import { NnrpNativeBindingUnavailableError, openNativeClient } from "../src/index.ts";
import { createQuicTransportProvider, type NnrpQuicNativeBinding } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

Deno.test("@nnrp/native-client opens a client with explicit transport providers", async () => {
  const client = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [createTcpTransportProvider()],
    sessionDefaults: { inputProfile: "tensor", metadata: { app: "agent" } },
  });

  const session = client.openSession({ metadata: { request: "one" } });

  assertEquals(client.endpoint, "127.0.0.1:4433");
  assertEquals(session.sessionId, "native-session-1");
  assertEquals(session.options.metadata, { app: "agent", request: "one" });
});

Deno.test("@nnrp/native-client closes runtime when client connect fails", async () => {
  let closed = false;

  await assertRejects(
    () =>
      openNativeClient({
        endpoint: "",
        env: {},
        ffi: {
          mode: "test",
          close: () => {
            closed = true;
          },
        },
      }),
    NnrpCapabilityError,
  );

  assertEquals(closed, true);
});

Deno.test("@nnrp/native-client preserves not-connected diagnostics", async () => {
  const client = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    env: {},
    platform: "linux",
    arch: "x64",
  });
  const session = client.openSession();

  const error = await assertRejects(
    () => session.submit({ frameId: 1, payload: new Uint8Array([1]) }),
    NnrpNativeBindingUnavailableError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_BINDING_NOT_CONNECTED");
});

Deno.test("@nnrp/native-client selects the best installed transport provider", async () => {
  const client = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    env: {},
    platform: "linux",
    arch: "x64",
    transports: [
      createTcpTransportProvider({ score: 60 }),
      createQuicTransportProvider({ score: 90, native: fakeQuicNativeBinding() }),
    ],
  });

  const summary = await client.runtime.selectTransportWithNative({
    peerManifest: createBackendNativeManifest(["transport.tcp", "transport.quic"]),
  });

  assertEquals(summary.selected, "quic");
  assertEquals(summary.rejected, []);
});

Deno.test("@nnrp/native-client rejects missing transport providers at connect time", async () => {
  const error = await assertRejects(
    () =>
      openNativeClient({
        endpoint: "127.0.0.1:4433",
        env: {},
        platform: "linux",
        arch: "x64",
        transports: [],
      }),
    NnrpCapabilityError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_TRANSPORT_PROVIDER_MISSING");
});

Deno.test("@nnrp/native-client rejects policy mismatches at connect time", async () => {
  const error = await assertRejects(
    () =>
      openNativeClient({
        endpoint: "127.0.0.1:4433",
        env: {},
        platform: "linux",
        arch: "x64",
        transports: [createTcpTransportProvider()],
        transportPolicy: "quic-only",
      }),
    NnrpTransportError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED");
  assertEquals(error.diagnostic.transport, "quic");
});

function fakeQuicNativeBinding(): NnrpQuicNativeBinding {
  return {
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
}
