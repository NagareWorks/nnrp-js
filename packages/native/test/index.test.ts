import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { createCapabilityManifest, NnrpCapabilityError, NnrpProtocolError } from "@nnrp/core";
import {
  createNativeRuntimeBinding,
  type NnrpNativeArtifactManifest,
  NnrpNativeBindingUnavailableError,
  type NnrpNativeRuntimeCapabilities,
  openBackendRuntime,
  openNativeClient,
  resolveNativeArtifact,
  resolveNativeLibraryPath,
  validateNativeArtifactManifest,
  validateNativeRuntimeCapabilities,
} from "../src/index.ts";

Deno.test("@nnrp/native prefers an explicit native library path", () => {
  assertEquals(resolveNativeLibraryPath({ libraryPath: "C:/nnrp/nnrp_ffi.dll" }), "C:/nnrp/nnrp_ffi.dll");
});

Deno.test("@nnrp/native keeps explicit native library paths ahead of packaged artifacts", async () => {
  const root = await Deno.makeTempDir();
  const packageDir = `${root}/linux-x86_64`;
  await Deno.mkdir(packageDir);
  await Deno.writeTextFile(`${packageDir}/libnnrp_ffi.so`, "fake");
  await Deno.writeTextFile(`${packageDir}/manifest.json`, JSON.stringify(nativeManifest(), null, 2));

  assertEquals(
    resolveNativeLibraryPath({
      libraryPath: "/opt/nnrp/custom.so",
      platform: "linux",
      arch: "x64",
      nativeLibrary: { artifactDir: root },
    }),
    "/opt/nnrp/custom.so",
  );

  await Deno.remove(root, { recursive: true });
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
    "native/macos-aarch64/libnnrp_ffi.dylib",
  );
});

Deno.test("@nnrp/native uses artifactDir for packaged artifacts", () => {
  assertEquals(
    resolveNativeLibraryPath({ platform: "linux", arch: "x64", env: {}, nativeLibrary: { artifactDir: "./vendor" } }),
    "vendor/linux-x86_64/libnnrp_ffi.so",
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
  assertEquals(binding.libraryPath, "native/linux-x86_64/libnnrp_ffi.so");
  assertEquals(binding.requiredSymbols, [
    "nnrp_runtime_capabilities",
    "nnrp_client_submit_result_compact",
    "nnrp_client_await_events",
    "nnrp_ffi_version",
  ]);
});

Deno.test("@nnrp/native resolves and validates nnrp-rs artifact manifests", async () => {
  const root = await Deno.makeTempDir();
  const packageDir = `${root}/linux-x86_64`;
  await Deno.mkdir(packageDir);
  await Deno.writeTextFile(`${packageDir}/libnnrp_ffi.so`, "fake");
  await Deno.writeTextFile(`${packageDir}/manifest.json`, JSON.stringify(nativeManifest(), null, 2));

  const artifact = resolveNativeArtifact({
    platform: "linux",
    arch: "x64",
    nativeLibrary: { artifactDir: root, requiredSymbols: ["nnrp_client_submit_result_compact"] },
  });

  assertEquals(artifact?.packageName, "linux-x86_64");
  assertEquals(artifact?.manifest.library, "libnnrp_ffi.so");
  assertEquals(artifact?.libraryPath.endsWith("libnnrp_ffi.so"), true);

  await Deno.remove(root, { recursive: true });
});

Deno.test("@nnrp/native rejects explicit missing artifact manifests", () => {
  assertThrows(
    () =>
      resolveNativeArtifact({
        nativeLibrary: { manifestPath: "missing/manifest.json" },
      }),
    NnrpCapabilityError,
    "manifest not found",
  );
});

Deno.test("@nnrp/native rejects mismatched native artifact manifests", () => {
  assertThrows(
    () => validateNativeArtifactManifest({ ...nativeManifest(), arch: "aarch64" }, { platform: "linux", arch: "x64" }),
    NnrpCapabilityError,
    "does not match",
  );

  assertThrows(
    () =>
      validateNativeArtifactManifest(nativeManifest(), {
        platform: "linux",
        arch: "x64",
        nativeLibrary: { requiredSymbols: ["missing_export"] },
      }),
    NnrpCapabilityError,
    "missing exports",
  );
});

Deno.test("@nnrp/native validates runtime capability feature probes", () => {
  validateNativeRuntimeCapabilities(nativeCapabilities());

  assertThrows(
    () => validateNativeRuntimeCapabilities({ ...nativeCapabilities(), abiMinor: 4 }),
    NnrpCapabilityError,
    "not supported",
  );
  assertThrows(
    () => validateNativeRuntimeCapabilities({ ...nativeCapabilities(), featureFlags: 0n }),
    NnrpCapabilityError,
    "missing required runtime feature bits",
  );
});

Deno.test("@nnrp/native routes submit through coarse submit/result binding when available", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      runtimeCapabilities: () => nativeCapabilities(),
      submitResultCompact: ({ submit, maxEvents }) => ({
        frameId: submit.frameId,
        payload: new Uint8Array([maxEvents ?? 0, submit.payload?.[0] ?? 0]),
      }),
    },
  });
  const client = runtime.connect({ endpoint: "127.0.0.1:4433" });
  const session = client.openSession();

  assertEquals(runtime.bindingMode, "test");
  assertEquals(runtime.runtimeCapabilities?.abiMinor, 5);
  assertEquals(await session.submit({ frameId: 7, payload: new Uint8Array([9]) }), {
    frameId: 7,
    payload: new Uint8Array([1, 9]),
  });
});

Deno.test("@nnrp/native routes event polling through coarse batch binding when available", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      awaitEvents: ({ maxEvents }) => [{
        type: "diagnostic",
        diagnostic: {
          code: `NNRP_TEST_BATCH_${maxEvents}`,
          message: "batch event",
          source: "native",
          retryable: false,
        },
      }],
    },
  });
  const event = await runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession().nextEvent();

  assertEquals(event.type, "diagnostic");
  if (event.type === "diagnostic") {
    assertEquals(event.diagnostic.code, "NNRP_TEST_BATCH_1");
  }
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

  assertEquals(runtime.libraryPath, "native/linux-x86_64/libnnrp_ffi.so");
  assertEquals(client.transportPolicy, "tcp-only");
  assertEquals(server.transportPolicy, "quic-only");

  await runtime.close();
  assertEquals(client.closed, true);
  assertEquals(server.closed, true);
});

Deno.test("@nnrp/native selects transports from local and peer manifests", async () => {
  const runtime = await openBackendRuntime({ env: {}, platform: "linux", arch: "x64", transportPolicy: "quic-only" });
  const summary = runtime.selectTransport({
    peerManifest: createCapabilityManifest({
      buildMode: "backend-native",
      transports: ["tcp"],
      capabilities: ["client.session"],
    }),
  });

  assertEquals(summary.selected, null);
  assertEquals(summary.rejected.map((candidate) => candidate.reason), ["peer-unsupported", "policy-rejected"]);
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

function nativeManifest(): NnrpNativeArtifactManifest {
  return {
    package: "nnrp-ffi",
    profile: "release",
    os: "linux",
    arch: "x86_64",
    target: "x86_64-unknown-linux-gnu",
    library_kind: "dynamic",
    library: "libnnrp_ffi.so",
    libraries: ["libnnrp_ffi.so"],
    header: "include/nnrp/nnrp.h",
    headers: ["include/nnrp/nnrp.h", "include/nnrp/nnrp_ffi.h"],
    legacy_header: "nnrp_ffi.h",
    exports: ["nnrp_runtime_capabilities", "nnrp_client_submit_result_compact", "nnrp_client_await_events"],
  };
}

function nativeCapabilities(): NnrpNativeRuntimeCapabilities {
  return {
    abiMajor: 1,
    abiMinor: 5,
    abiPatch: 0,
    protocolMajor: 1,
    protocolWireFormat: 0,
    sdkMajor: 1,
    sdkMinor: 0,
    sdkPatch: 0,
    sdkChannel: 3,
    sdkRevision: 6,
    transportSlots: 0x00000002,
    featureFlags: 0x000000000001ffffn,
  };
}
