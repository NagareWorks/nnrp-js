import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { NnrpCapabilityError, NnrpProtocolError } from "@nnrp/core";
import {
  createNativeRuntimeBinding,
  NnrpNativeBindingUnavailableError,
  openBackendRuntime,
  openNativeClient,
  resolveNativeLibraryPath,
} from "../src/index.ts";

Deno.test("@nnrp/native prefers an explicit native library path", () => {
  assertEquals(resolveNativeLibraryPath({ libraryPath: "C:/nnrp/nnrp_ffi.dll" }), "C:/nnrp/nnrp_ffi.dll");
});

Deno.test("@nnrp/native accepts documented native library options", () => {
  assertEquals(
    resolveNativeLibraryPath({ nativeLibrary: { path: "/opt/nnrp/libnnrp_ffi.so" }, env: {} }),
    "/opt/nnrp/libnnrp_ffi.so",
  );
});

Deno.test("@nnrp/native falls back to the environment override before platform defaults", () => {
  assertEquals(
    resolveNativeLibraryPath({ env: { NNRP_NATIVE_LIBRARY: "/opt/nnrp/libnnrp_ffi.so" } }),
    "/opt/nnrp/libnnrp_ffi.so",
  );
});

Deno.test("@nnrp/native builds a platform-specific default path", () => {
  assertEquals(
    resolveNativeLibraryPath({ platform: "darwin", arch: "arm64", env: {} }),
    "native/darwin-arm64/nnrp_ffi.dylib",
  );
});

Deno.test("@nnrp/native uses artifactDir for packaged artifacts", () => {
  assertEquals(
    resolveNativeLibraryPath({ platform: "linux", arch: "x64", env: {}, nativeLibrary: { artifactDir: "./vendor" } }),
    "./vendor/linux-x64/nnrp_ffi.so",
  );
});

Deno.test("@nnrp/native creates a native binding descriptor", () => {
  const binding = createNativeRuntimeBinding({
    platform: "linux",
    arch: "x64",
    env: {},
    nativeLibrary: { requiredSymbols: ["nnrp_ffi_version"] },
  });

  assertEquals(binding.manifest.capabilities, ["client.session", "server.session", "native.loader"]);
  assertEquals(binding.manifest.buildMode, "backend-native");
  assertEquals(binding.libraryPath, "native/linux-x64/nnrp_ffi.so");
  assertEquals(binding.requiredSymbols, ["nnrp_ffi_version"]);
});

Deno.test("@nnrp/native opens a client-first native client", async () => {
  const client = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    env: {},
    platform: "linux",
    arch: "x64",
    sessionDefaults: { inputProfile: "tensor", metadata: { app: "agent" } },
  });

  const session = client.openSession({ metadata: { request: "one" } });

  assertEquals(client.endpoint, "127.0.0.1:4433");
  assertEquals(client.transportPolicy, "score");
  assertEquals(session.options.inputProfile, "tensor");
  assertEquals(session.options.metadata, { app: "agent", request: "one" });
});

Deno.test("@nnrp/native exposes backend runtime connect and listen lifecycles", async () => {
  const runtime = await openBackendRuntime({ env: {}, platform: "linux", arch: "x64", transportPolicy: "tcp-only" });
  const client = runtime.connect({ endpoint: new URL("nnrp://localhost:4433") });
  const server = runtime.listen({ endpoint: "0.0.0.0:4433", transportPolicy: "quic-only" });

  assertEquals(runtime.libraryPath, "native/linux-x64/nnrp_ffi.so");
  assertEquals(client.transportPolicy, "tcp-only");
  assertEquals(server.transportPolicy, "quic-only");

  await runtime.close();
  assertEquals(client.closed, true);
  assertEquals(server.closed, true);
});

Deno.test("@nnrp/native rejects empty endpoints", async () => {
  const runtime = await openBackendRuntime({ env: {} });

  assertThrows(
    () => runtime.connect({ endpoint: " " }),
    NnrpCapabilityError,
  );
});

Deno.test("@nnrp/native rejects use after close", async () => {
  const client = await openNativeClient({ endpoint: "127.0.0.1:4433", env: {} });
  await client.close();

  assertThrows(
    () => client.openSession(),
    NnrpCapabilityError,
  );
});

Deno.test("@nnrp/native session methods preserve not-connected diagnostics", async () => {
  const client = await openNativeClient({ endpoint: "127.0.0.1:4433", env: {} });
  const session = client.openSession();

  const error = await assertRejects(
    () => session.submit({ frameId: 1, payload: new Uint8Array([1]) }),
    NnrpNativeBindingUnavailableError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_BINDING_NOT_CONNECTED");
});

Deno.test("@nnrp/native validates submit requests before native dispatch", async () => {
  const client = await openNativeClient({ endpoint: "127.0.0.1:4433", env: {} });
  const session = client.openSession();

  const error = await assertRejects(
    () => session.submit({ frameId: -1 }),
    NnrpProtocolError,
  );

  assertEquals(error.diagnostic.code, "NNRP_SUBMIT_FRAME_ID_INVALID");
});

Deno.test("@nnrp/native validates cancel and event polling before native dispatch", async () => {
  const client = await openNativeClient({ endpoint: "127.0.0.1:4433", env: {} });
  const session = client.openSession();

  const cancelError = await assertRejects(
    () => session.cancel(-1),
    NnrpProtocolError,
  );
  const eventError = await assertRejects(
    () => session.nextEvent({ timeoutMillis: -1 }),
    NnrpProtocolError,
  );

  assertEquals(cancelError.diagnostic.code, "NNRP_OPERATION_ID_INVALID");
  assertEquals(eventError.diagnostic.code, "NNRP_EVENT_TIMEOUT_INVALID");
});

Deno.test("@nnrp/native exposes async event iterator convenience", async () => {
  const client = await openNativeClient({ endpoint: "127.0.0.1:4433", env: {} });
  const session = client.openSession();
  const iterator = session.events()[Symbol.asyncIterator]();

  const error = await assertRejects(
    () => iterator.next(),
    NnrpNativeBindingUnavailableError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_BINDING_NOT_CONNECTED");
});
