import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  createCapabilityManifest,
  NnrpCapabilityError,
  NnrpProtocolError,
  NnrpRecoveryError,
  NnrpResultDropError,
  type NnrpRuntimeEvent,
  NnrpTimeoutError,
} from "@nnrp/core";
import {
  createNativeRuntimeBinding,
  NnrpBackendRuntime,
  type NnrpNativeArtifactManifest,
  NnrpNativeBindingUnavailableError,
  type NnrpNativeRuntimeCapabilities,
  NnrpServerSession,
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

  assertEquals(binding.manifest.capabilities, [
    "client.session",
    "server.session",
    "native.loader",
    "cache",
    "schema",
    "recovery",
    "flow.update",
    "result.hint",
  ]);
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
  let descriptorProfile: string | undefined;
  let cacheKey: string | number | bigint | undefined;
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      runtimeCapabilities: () => nativeCapabilities(),
      submitResultCompact: ({ submit, maxEvents }) => ({
        frameId: submit.frameId,
        payload: (() => {
          descriptorProfile = submit.descriptor?.profile;
          cacheKey = submit.descriptor?.cache?.key.key;
          return new Uint8Array([maxEvents ?? 0, submit.payload?.[0] ?? 0]);
        })(),
      }),
    },
  });
  const client = runtime.connect({ endpoint: "127.0.0.1:4433" });
  const session = client.openSession();

  assertEquals(runtime.bindingMode, "test");
  assertEquals(runtime.runtimeCapabilities?.abiMinor, 5);
  assertEquals(
    await session.submit({
      frameId: 7,
      payload: new Uint8Array([9]),
      descriptor: {
        profile: "tensor",
        cache: { key: { kind: "tensor", key: "kv-block" } },
      },
    }),
    {
      frameId: 7,
      payload: new Uint8Array([1, 9]),
    },
  );
  assertEquals(descriptorProfile, "tensor");
  assertEquals(cacheKey, "kv-block");
});

Deno.test("@nnrp/native routes no-wait submit and cancel through coarse bindings", async () => {
  const seen: string[] = [];
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      submitNoWait: ({ submit }) => {
        seen.push(`submit:${submit.frameId}`);
        return 99n;
      },
      cancel: ({ cancel }) => {
        seen.push(`cancel:${cancel.operation}:${cancel.options?.reason ?? ""}`);
      },
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();

  assertEquals(await session.submitNoWait({ frameId: 9 }), 99n);
  await session.cancel(99n, { reason: "done" });
  assertEquals(seen, ["submit:9", "cancel:99:done"]);
});

Deno.test("@nnrp/native rejects duplicate in-flight frames and releases on completion", async () => {
  let resolveSubmit: ((result: { readonly frameId: number }) => void) | undefined;
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      submitResultCompact: ({ submit }) =>
        new Promise((resolve) => {
          resolveSubmit = () => resolve({ frameId: submit.frameId });
        }),
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();
  const pending = session.submit({ frameId: 5 });

  assertEquals(session.inFlightFrames(), [5]);
  await assertRejects(
    () => session.submit({ frameId: 5 }),
    NnrpProtocolError,
    "already in flight",
  );

  resolveSubmit?.({ frameId: 5 });
  assertEquals(await pending, { frameId: 5 });
  assertEquals(session.inFlightFrames(), []);
});

Deno.test("@nnrp/native tracks no-wait frames until cancel or terminal events", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      submitNoWait: ({ submit }) => BigInt(submit.frameId),
      cancel: () => {},
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();

  assertEquals(await session.submitNoWait({ frameId: 6 }), 6n);
  assertEquals(session.inFlightFrames(), [6]);
  await assertRejects(
    () => session.submitNoWait({ frameId: 6 }),
    NnrpProtocolError,
    "already in flight",
  );

  await session.cancel(6);
  assertEquals(session.inFlightFrames(), []);

  assertEquals(await session.submitNoWait({ frameId: 7 }), 7n);
  session.completeEvent({ type: "drop", frameId: 7, diagnostic: diagnostic("NNRP_TEST_DROP") });
  assertEquals(session.inFlightFrames(), []);

  assertEquals(await session.submitNoWait({ frameId: 8 }), 8n);
  session.completeEvent({ type: "close" });
  assertEquals(session.inFlightFrames(), []);
});

Deno.test("@nnrp/native rejects duplicate cancel and cancel after terminal events", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      submitNoWait: ({ submit }) => BigInt(submit.frameId),
      cancel: () => {},
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();

  await session.submitNoWait({ frameId: 12 });
  await session.cancel(12);
  const duplicateCancel = await assertRejects(
    () => session.cancel(12),
    NnrpProtocolError,
  );

  assertEquals(duplicateCancel.diagnostic.code, "NNRP_OPERATION_CANCEL_DUPLICATE");

  await session.submitNoWait({ frameId: 13 });
  session.completeEvent({ type: "result", result: { frameId: 13 } });
  const terminalCancel = await assertRejects(
    () => session.cancel(13),
    NnrpProtocolError,
  );

  assertEquals(terminalCancel.diagnostic.code, "NNRP_OPERATION_TERMINAL");
});

Deno.test("@nnrp/native rejects duplicate terminal events and clears frames on close", async () => {
  let resolveSubmit: ((result: { readonly frameId: number }) => void) | undefined;
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      submitNoWait: ({ submit }) => BigInt(submit.frameId),
      submitResultCompact: ({ submit }) =>
        new Promise((resolve) => {
          resolveSubmit = (result) => resolve(result);
          if (submit.frameId !== 30) {
            resolve({ frameId: submit.frameId });
          }
        }),
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();

  await session.submitNoWait({ frameId: 4 });
  await session.submitNoWait({ frameId: 2 });
  await session.submitNoWait({ frameId: 3 });
  assertEquals(session.inFlightFrames(), [2, 3, 4]);

  session.completeEvent({ type: "drop", frameId: 3, diagnostic: diagnostic("NNRP_TEST_DROP") });
  const duplicateTerminal = assertThrows(
    () => session.completeEvent({ type: "drop", frameId: 3, diagnostic: diagnostic("NNRP_TEST_DROP_AGAIN") }),
    NnrpProtocolError,
  );

  assertEquals(duplicateTerminal.diagnostic.code, "NNRP_FRAME_TERMINAL_DUPLICATE");
  assertEquals(session.inFlightFrames(), [2, 4]);

  const pending = session.submit({ frameId: 30 });
  assertEquals(session.inFlightFrames(), [2, 4, 30]);
  await session.close();
  assertEquals(session.inFlightFrames(), []);
  resolveSubmit?.({ frameId: 30 });
  assertEquals(await pending, { frameId: 30 });
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
    assertEquals(event.diagnostic.code, "NNRP_TEST_BATCH_16");
  }
});

Deno.test("@nnrp/native maps empty timed event polling to timeout diagnostics", async () => {
  let seenTimeout: number | undefined;
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      awaitEvents: ({ timeoutMillis }) => {
        seenTimeout = timeoutMillis;
        return [];
      },
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();

  const error = await assertRejects(
    () => session.nextEvent({ timeoutMillis: 5 }),
    NnrpTimeoutError,
  );

  assertEquals(seenTimeout, 5);
  assertEquals(error.diagnostic.code, "NNRP_EVENT_POLL_TIMEOUT");
  assertEquals(error.diagnostic.source, "native");
  assertEquals(error.diagnostic.retryable, true);
});

Deno.test("@nnrp/native times out pending event polling without backend completion", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      awaitEvents: () => new Promise<readonly NnrpRuntimeEvent[]>(() => {}),
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();

  const error = await assertRejects(
    () => session.nextEvent({ timeoutMillis: 0 }),
    NnrpTimeoutError,
  );

  assertEquals(error.diagnostic.code, "NNRP_EVENT_POLL_TIMEOUT");
  assertEquals(error.diagnostic.source, "native");
});

Deno.test("@nnrp/native keeps timed event polling result and error paths stable", async () => {
  let pollCount = 0;
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      awaitEvents: () => {
        pollCount += 1;
        if (pollCount === 1) {
          return [{ type: "diagnostic", diagnostic: diagnostic("NNRP_TEST_TIMED_EVENT") }];
        }

        throw new Error("backend poll failed");
      },
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();

  assertEquals(await session.nextEvent({ timeoutMillis: 50 }), {
    type: "diagnostic",
    diagnostic: diagnostic("NNRP_TEST_TIMED_EVENT"),
  });
  await assertRejects(
    () => session.nextEvent({ timeoutMillis: 50 }),
    Error,
    "backend poll failed",
  );
});

Deno.test("@nnrp/native cancels timed event polling with abort signals", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      awaitEvents: () => new Promise<readonly NnrpRuntimeEvent[]>(() => {}),
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();
  const controller = new AbortController();
  const pending = session.nextEvent({ timeoutMillis: 1000, signal: controller.signal });
  controller.abort("timed");

  const error = await assertRejects(
    () => pending,
    NnrpTimeoutError,
  );

  assertEquals(error.diagnostic.code, "NNRP_EVENT_POLL_CANCELLED");
  assertEquals(error.diagnostic.cause, "timed");
});

Deno.test("@nnrp/native maps result polling drops to typed errors", async () => {
  let pollCount = 0;
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      awaitEvents: () => {
        pollCount += 1;
        return pollCount === 1
          ? [{ type: "diagnostic", diagnostic: diagnostic("NNRP_TEST_SKIP") }]
          : [{ type: "drop", sessionId: "session-a", frameId: 44, diagnostic: diagnostic("NNRP_TEST_DROP") }];
      },
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession({ sessionId: "session-a" });

  const error = await assertRejects(
    () => session.nextResult(),
    NnrpResultDropError,
  );

  assertEquals(error.frameId, 44);
  assertEquals(error.sessionId, "session-a");
  assertEquals(error.diagnostic.code, "NNRP_TEST_DROP");
});

Deno.test("@nnrp/native returns next result after non-result events", async () => {
  let pollCount = 0;
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      awaitEvents: () => {
        pollCount += 1;
        return pollCount === 1
          ? [{ type: "diagnostic", diagnostic: diagnostic("NNRP_TEST_SKIP") }]
          : [{ type: "result", sessionId: "session-a", result: { frameId: 45 } }];
      },
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession({ sessionId: "session-a" });

  assertEquals(await session.nextResult(), { frameId: 45 });
});

Deno.test("@nnrp/native routes events by session id across shared runtimes", async () => {
  let pollCount = 0;
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      awaitEvents: () => {
        pollCount += 1;
        if (pollCount === 1) {
          return [
            { type: "result", sessionId: "session-b", result: { frameId: 2 } },
            { type: "result", sessionId: "session-a", result: { frameId: 1 } },
          ];
        }

        return [{ type: "diagnostic", diagnostic: diagnostic("NNRP_TEST_EMPTY") }];
      },
    },
  });
  const client = runtime.connect({ endpoint: "127.0.0.1:4433" });
  const sessionA = client.openSession({ sessionId: "session-a" });
  const sessionB = client.openSession({ sessionId: "session-b" });

  assertEquals(sessionA.sessionId, "session-a");
  assertEquals(sessionB.sessionId, "session-b");
  assertEquals(await sessionA.nextEvent(), { type: "result", sessionId: "session-a", result: { frameId: 1 } });
  assertEquals(await sessionB.nextEvent(), { type: "result", sessionId: "session-b", result: { frameId: 2 } });
  assertEquals(pollCount, 1);
});

Deno.test("@nnrp/native reports unsupported session migration with stable diagnostics", async () => {
  const runtime = await openBackendRuntime({ env: {}, platform: "linux", arch: "x64" });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();

  const error = await assertRejects(
    () => session.migrate({ recoveryToken: { token: "resume-token" }, targetEndpoint: "127.0.0.1:4434" }),
    NnrpRecoveryError,
  );

  assertEquals(error.diagnostic.code, "NNRP_RECOVERY_UNSUPPORTED");
  assertEquals(error.diagnostic.source, "native");
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
  assertEquals(session.sessionId, "native-session-1");
  assertEquals(session.options.inputProfile, "tensor");
  assertEquals(session.options.metadata, { app: "agent", request: "one" });
});

Deno.test("@nnrp/native closes runtime when client connect fails", async () => {
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

Deno.test("@nnrp/native exposes runtime artifact getters from packaged manifests", async () => {
  const root = await Deno.makeTempDir();
  const packageDir = `${root}/linux-x86_64`;
  await Deno.mkdir(packageDir);
  await Deno.writeTextFile(`${packageDir}/libnnrp_ffi.so`, "fake");
  await Deno.writeTextFile(`${packageDir}/manifest.json`, JSON.stringify(nativeManifest(), null, 2));

  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    nativeLibrary: { artifactDir: root },
  });

  assertEquals(runtime.manifest.buildMode, "backend-native");
  assertEquals(runtime.artifact?.packageName, "linux-x86_64");
  assertEquals(runtime.libraryPath.endsWith("libnnrp_ffi.so"), true);

  await runtime.close();
  await Deno.remove(root, { recursive: true });
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

Deno.test("@nnrp/native delegates transport scoring to native bindings when available", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      runtimeCapabilities: () => ({
        ...nativeCapabilities(),
        transportSlots: 0x00000003,
      }),
      scoreTransportCandidates: ({ candidates, policy }) => {
        assertEquals(policy, "score");
        return candidates.map((candidate) => ({
          ...candidate,
          score: candidate.kind === "tcp" ? 100 : candidate.score,
          diagnostic: candidate.kind === "tcp" ? diagnostic("NNRP_NATIVE_SCORE") : candidate.diagnostic,
        }));
      },
    },
  });
  const summary = await runtime.selectTransportWithNative({
    peerManifest: createCapabilityManifest({
      buildMode: "backend-native",
      transports: ["tcp", "quic"],
      capabilities: ["client.session"],
    }),
  });

  assertEquals(summary.selected, "tcp");
  assertEquals(summary.candidates.find((candidate) => candidate.kind === "tcp")?.diagnostic?.code, "NNRP_NATIVE_SCORE");
});

Deno.test("@nnrp/native falls back to deterministic transport scoring without native hooks", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      runtimeCapabilities: () => ({
        ...nativeCapabilities(),
        transportSlots: 0x00000003,
      }),
    },
  });
  const summary = await runtime.selectTransportWithNative({
    peerManifest: createCapabilityManifest({
      buildMode: "backend-native",
      transports: ["tcp", "quic"],
      capabilities: ["client.session"],
    }),
  });

  assertEquals(summary.selected, "quic");
});

Deno.test("@nnrp/native narrows transport manifest from runtime capability slots", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transportPolicy: "quic-only",
    ffi: {
      mode: "test",
      runtimeCapabilities: () => nativeCapabilities(),
    },
  });
  const summary = runtime.selectTransport({
    peerManifest: createCapabilityManifest({
      buildMode: "backend-native",
      transports: ["quic"],
      capabilities: ["client.session"],
    }),
  });

  assertEquals(runtime.manifest.transports, ["tcp"]);
  assertEquals(summary.selected, null);
  assertEquals(summary.rejected.map((candidate) => [candidate.kind, candidate.reason]), [
    ["quic", "local-unavailable"],
    ["tcp", "peer-unsupported"],
  ]);
});

Deno.test("@nnrp/native keeps QUIC available when the native runtime exposes the QUIC slot", async () => {
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    transportPolicy: "quic-only",
    ffi: {
      mode: "test",
      runtimeCapabilities: () => ({
        ...nativeCapabilities(),
        transportSlots: 0x00000003,
      }),
    },
  });
  const summary = runtime.selectTransport({
    peerManifest: createCapabilityManifest({
      buildMode: "backend-native",
      transports: ["quic"],
      capabilities: ["client.session"],
    }),
  });

  assertEquals(runtime.manifest.transports, ["tcp", "quic"]);
  assertEquals(summary.selected, "quic");
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

Deno.test("@nnrp/native rejects direct runtime operations after close", async () => {
  const runtime = await openBackendRuntime({ env: {}, ffi: { mode: "test" } });
  await runtime.close();

  assertThrows(
    () =>
      runtime.connect({
        endpoint: "127.0.0.1:4433",
      }),
    NnrpCapabilityError,
  );
  assertThrows(
    () =>
      runtime.submitNoWait({
        sessionOptions: {},
        submit: { frameId: 1 },
      }),
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

Deno.test("@nnrp/native preserves not-connected diagnostics for direct missing operations", async () => {
  const runtime = await openBackendRuntime({ env: {} });

  await assertRejects(
    () => runtime.submitNoWait({ sessionOptions: {}, submit: { frameId: 1 } }),
    NnrpNativeBindingUnavailableError,
  );
  await assertRejects(
    () => runtime.cancel({ sessionOptions: {}, cancel: { operation: 1n } }),
    NnrpNativeBindingUnavailableError,
  );
  await assertRejects(
    () => runtime.awaitEvents({ maxEvents: 1 }),
    NnrpNativeBindingUnavailableError,
  );
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

Deno.test("@nnrp/native validates session metadata before opening sessions", async () => {
  const client = await openNativeClient({ endpoint: "127.0.0.1:4433", env: {} });

  assertThrows(
    () => client.openSession({ metadata: { "": "bad" } }),
    NnrpProtocolError,
    "Metadata keys must be non-empty",
  );
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

Deno.test("@nnrp/native cancels event polling with abort signals", async () => {
  let resolvePoll: ((events: readonly NnrpRuntimeEvent[]) => void) | undefined;
  const runtime = await openBackendRuntime({
    env: {},
    platform: "linux",
    arch: "x64",
    ffi: {
      mode: "test",
      awaitEvents: () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        }),
    },
  });
  const session = runtime.connect({ endpoint: "127.0.0.1:4433" }).openSession();
  const preAborted = new AbortController();
  preAborted.abort("before");

  const preAbortError = await assertRejects(
    () => session.nextEvent({ signal: preAborted.signal }),
    NnrpTimeoutError,
  );

  assertEquals(preAbortError.diagnostic.code, "NNRP_EVENT_POLL_CANCELLED");
  assertEquals(preAbortError.diagnostic.cause, "before");

  const controller = new AbortController();
  const pending = session.nextEvent({ signal: controller.signal });
  controller.abort("during");

  const duringAbortError = await assertRejects(
    () => pending,
    NnrpTimeoutError,
  );

  assertEquals(duringAbortError.diagnostic.code, "NNRP_EVENT_POLL_CANCELLED");
  assertEquals(duringAbortError.diagnostic.cause, "during");
  resolvePoll?.([]);
});

Deno.test("@nnrp/native covers server and server-session placeholders", async () => {
  const runtime = new NnrpBackendRuntime(createNativeRuntimeBinding({ env: {} }));
  const server = runtime.listen({ endpoint: "0.0.0.0:4433", transportPolicy: "tcp-only" });
  const serverSession = new NnrpServerSession();

  assertEquals(server.endpoint, "0.0.0.0:4433");
  assertEquals(server.transportPolicy, "tcp-only");
  await assertRejects(() => server.accept(), NnrpNativeBindingUnavailableError);
  await assertRejects(() => serverSession.receive(), NnrpNativeBindingUnavailableError);
  await assertRejects(() => serverSession.sendResult({ frameId: 1 }), NnrpNativeBindingUnavailableError);

  await server.close();
  await serverSession.close();
  assertEquals(server.closed, true);
  assertEquals(serverSession.closed, true);
  assertThrows(() => server.accept(), NnrpCapabilityError);
  assertThrows(() => serverSession.sendResult({ frameId: 1 }), NnrpCapabilityError);
});

Deno.test("@nnrp/native rejects server-session invalid receive options before dispatch", async () => {
  const serverSession = new NnrpServerSession();

  await assertRejects(
    () => serverSession.receive({ timeoutMillis: -1 }),
    NnrpProtocolError,
  );
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

function diagnostic(code: string) {
  return {
    code,
    message: code,
    source: "native" as const,
    retryable: false,
  };
}
