import {
  CacheMissReason,
  CacheReuseScope,
  createCapabilityManifest,
  decodeRuntimeControlMetadata,
  MemoryLocationHint,
  NnrpCapabilityError,
  NnrpMessageType,
  NnrpProtocolError,
  NnrpRecoveryError,
  NnrpResultDropError,
  type NnrpRuntimeEvent,
  NnrpTimeoutError,
  type NnrpTransportCandidate,
  NnrpTransportError,
  ObjectReleaseReason,
  OwnershipHint,
  RuntimeObjectKind,
  RuntimeRole,
} from "@nnrp/core";
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  createBrowserTransportProvider,
  createWasmRuntimeBinding,
  NnrpBrowserRuntime,
  type NnrpWasmArtifactManifest,
  NnrpWasmBindingUnavailableError,
  openBrowserRuntime,
  resolveWasmArtifact,
  validateWasmArtifactManifest,
} from "../src/index.ts";

Deno.test("@nnrp/browser-client creates a default wasm binding descriptor", () => {
  const binding = createWasmRuntimeBinding();

  assertEquals(binding.moduleUrl, "./nnrp_wasm.wasm");
  assertEquals(binding.manifest.capabilities, [
    "client.session",
    "wasm.loader",
    "cache",
    "schema",
    "flow.update",
    "result.hint",
  ]);
  assertEquals(binding.manifest.buildMode, "browser-wasm");
});

Deno.test("@nnrp/browser-client normalizes URL module locations", () => {
  const binding = createWasmRuntimeBinding({ moduleUrl: new URL("https://example.test/nnrp.wasm") });

  assertEquals(binding.moduleUrl, "https://example.test/nnrp.wasm");
});

Deno.test("@nnrp/browser-client preserves injected modules on the descriptor", () => {
  const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  const binding = createWasmRuntimeBinding({ module });

  assertEquals(binding.module, module);
});

Deno.test("@nnrp/browser-client resolves rs primitive artifact manifests", () => {
  const artifact = resolveWasmArtifact({
    manifest: wasmManifest(),
    baseUrl: "https://cdn.example.test/nnrp",
  });

  assertEquals(artifact.moduleUrl, "https://cdn.example.test/nnrp/nnrp_wasm.wasm");
  assertEquals(artifact.typesUrl, "https://cdn.example.test/nnrp/nnrp_wasm.d.ts");
  assertEquals(artifact.requiredExports, [
    "nnrp_wasm_protocol_major",
    "nnrp_wasm_wire_format",
    "selectTransportWithProbeJson",
    "scoreProviderProbeJson",
  ]);
});

Deno.test("@nnrp/browser-client validates primitive artifact manifests", () => {
  validateWasmArtifactManifest(wasmManifest());

  assertThrows(
    () => validateWasmArtifactManifest({ ...wasmManifest(), exports: [] }),
    NnrpCapabilityError,
    "missing exports",
  );
});

Deno.test("@nnrp/browser-client rejects missing artifact asset paths", () => {
  assertThrows(
    () => validateWasmArtifactManifest({ ...wasmManifest(), wasm: "" }),
    NnrpCapabilityError,
    "Invalid WASM artifact manifest",
  );
  assertThrows(
    () => validateWasmArtifactManifest({ ...wasmManifest(), types: " " }),
    NnrpCapabilityError,
    "Invalid WASM artifact manifest",
  );
  assertThrows(
    () => createWasmRuntimeBinding({ artifact: { manifest: { ...wasmManifest(), wasm: "" } } }),
    NnrpCapabilityError,
    "Invalid WASM artifact manifest",
  );
});

Deno.test("@nnrp/browser-client uses artifact URLs unless a caller injects a module URL", () => {
  const artifactBinding = createWasmRuntimeBinding({
    artifact: {
      manifest: wasmManifest(),
      baseUrl: "/assets/nnrp",
    },
  });
  const explicitBinding = createWasmRuntimeBinding({
    moduleUrl: "/custom/nnrp.wasm",
    artifact: {
      manifest: wasmManifest(),
      baseUrl: "/assets/nnrp",
    },
  });

  assertEquals(artifactBinding.moduleUrl, "/assets/nnrp/nnrp_wasm.wasm");
  assertEquals(artifactBinding.artifact?.manifest.package, "nnrp-wasm");
  assertEquals(explicitBinding.moduleUrl, "/custom/nnrp.wasm");
});

Deno.test("@nnrp/browser-client resolves absolute and default artifact URLs", () => {
  const absolute = resolveWasmArtifact({
    manifest: { ...wasmManifest(), wasm: "https://cdn.example.test/nnrp_wasm.wasm" },
    baseUrl: "/assets/ignored",
  });
  const defaultBase = resolveWasmArtifact({
    manifest: wasmManifest(),
  });

  assertEquals(absolute.moduleUrl, "https://cdn.example.test/nnrp_wasm.wasm");
  assertEquals(defaultBase.moduleUrl, "nnrp_wasm.wasm");
});

Deno.test("@nnrp/browser-client preserves injected browser transport providers", () => {
  const provider = createBrowserTransportProvider("websocket", { available: true, score: 42 });
  const binding = createWasmRuntimeBinding({ transportProviders: [provider] });

  assertEquals(binding.transportProviders, [provider]);
});

Deno.test("@nnrp/browser-client preserves discovered WebSocket provider behavior", async () => {
  const runtime = await openBrowserRuntime();
  const [provider] = runtime.transportProviders;

  assertEquals(provider?.kind, "websocket");
  assertEquals(provider?.endpointSchemes, ["ws", "wss"]);
  assertEquals(typeof provider?.connect, "function");
});

Deno.test("@nnrp/browser-client opens a browser runtime and client session", async () => {
  const runtime = await openBrowserRuntime({ moduleUrl: "/assets/nnrp.wasm", transportPolicy: "auto" });
  const client = runtime.connect({
    endpoint: "wss://example.test/nnrp",
    sessionDefaults: { inputProfile: "token", metadata: { app: "browser" } },
  });
  const session = client.openSession({ metadata: { request: "one" } });

  assertEquals(runtime.moduleUrl, "/assets/nnrp.wasm");
  assertEquals(runtime.manifest.buildMode, "browser-wasm");
  assertEquals(runtime.artifact, undefined);
  assertEquals(client.endpoint, "wss://example.test/nnrp");
  assertEquals(client.transportPolicy, "auto");
  assertEquals(client.runtime, runtime);
  assertEquals(session.sessionId, "browser-session-1");
  assertEquals(session.options.inputProfile, "token");
  assertEquals(session.options.metadata, { app: "browser", request: "one" });
});

Deno.test("@nnrp/browser-client validates runtime readiness before connect", () => {
  const wrongMode = new NnrpBrowserRuntime({
    ...createWasmRuntimeBinding(),
    manifest: createCapabilityManifest({
      buildMode: "backend-native",
      transports: ["tcp"],
      capabilities: ["client.session"],
    }),
  });

  const wrongModeError = assertThrows(
    () => wrongMode.connect({ endpoint: "wss://example.test/nnrp" }),
    NnrpCapabilityError,
  );
  assertEquals(wrongModeError.diagnostic.code, "NNRP_WASM_RUNTIME_MANIFEST_INVALID");

  const missingModule = new NnrpBrowserRuntime({
    ...createWasmRuntimeBinding(),
    moduleUrl: " ",
  });
  const missingModuleError = assertThrows(
    () => missingModule.connect({ endpoint: "wss://example.test/nnrp" }),
    NnrpCapabilityError,
  );
  assertEquals(missingModuleError.diagnostic.code, "NNRP_WASM_RUNTIME_MODULE_UNRESOLVED");

  const missingExport = new NnrpBrowserRuntime({
    ...createWasmRuntimeBinding(),
    artifact: {
      manifest: wasmManifest(),
      moduleUrl: "nnrp_wasm.wasm",
      typesUrl: "nnrp_wasm.d.ts",
      requiredExports: ["missing_export"],
    },
  });
  const missingExportError = assertThrows(
    () => missingExport.connect({ endpoint: "wss://example.test/nnrp" }),
    NnrpCapabilityError,
  );
  assertEquals(missingExportError.diagnostic.code, "NNRP_WASM_RUNTIME_EXPORTS_UNVALIDATED");
});

Deno.test("@nnrp/browser-client selects browser transport slots from local and peer manifests", async () => {
  const runtime = await openBrowserRuntime({ transportPolicy: "auto" });
  const summary = runtime.selectTransport({
    peerManifest: createCapabilityManifest({
      buildMode: "browser-wasm",
      transports: ["websocket"],
      capabilities: ["client.session"],
    }),
  });

  assertEquals(summary.selected, "websocket");
  assertEquals(summary.rejected, []);
});

Deno.test("@nnrp/browser-client applies browser transport provider availability", async () => {
  const runtime = await openBrowserRuntime({
    transportProviders: [
      createBrowserTransportProvider("websocket", {
        available: false,
        score: 100,
        diagnostic: {
          code: "NNRP_BROWSER_WEBSOCKET_DISABLED",
          message: "websocket disabled",
          source: "transport",
          retryable: false,
          transport: "websocket",
        },
      }),
    ],
  });
  const summary = runtime.selectTransport({
    peerManifest: createCapabilityManifest({
      buildMode: "browser-wasm",
      transports: ["websocket"],
      capabilities: ["client.session"],
    }),
  });

  assertEquals(summary.selected, null);
  assertEquals(summary.rejected[0]?.reason, "local-unavailable");
  assertEquals(summary.rejected[0]?.diagnostic?.code, "NNRP_BROWSER_WEBSOCKET_DISABLED");
});

Deno.test("@nnrp/browser-client treats missing transport packages as unavailable", async () => {
  const runtime = await openBrowserRuntime({ transportProviders: [] });
  const summary = runtime.selectTransport({
    peerManifest: createCapabilityManifest({
      buildMode: "browser-wasm",
      transports: ["websocket"],
      capabilities: ["client.session"],
    }),
  });

  assertEquals(summary.selected, null);
  assertEquals(summary.rejected[0]?.kind, "websocket");
  assertEquals(summary.rejected[0]?.reason, "local-unavailable");
});

Deno.test("@nnrp/browser-client rejects connect without installed or explicit transports", async () => {
  const runtime = await openBrowserRuntime({ transportProviders: [] });
  const error = assertThrows(
    () => runtime.connect({ endpoint: "wss://example.test/nnrp" }),
    NnrpCapabilityError,
  );

  assertEquals(error.diagnostic.code, "NNRP_BROWSER_TRANSPORT_PROVIDER_MISSING");
});

Deno.test("@nnrp/browser-client exposes protocol version primitives with manifest fallback", async () => {
  const fallbackRuntime = await openBrowserRuntime();
  const primitiveRuntime = await openBrowserRuntime({
    primitives: {
      protocolVersion: () => ({
        protocolMajor: 1,
        wireFormat: 0,
        version: "1.0.0-test",
      }),
    },
  });

  assertEquals(await fallbackRuntime.protocolVersion(), {
    protocolMajor: 1,
    wireFormat: 0,
    version: "1.0.0",
  });
  assertEquals(await primitiveRuntime.protocolVersion(), {
    protocolMajor: 1,
    wireFormat: 0,
    version: "1.0.0-test",
  });
});

Deno.test("@nnrp/browser-client routes transport scoring through primitive candidates when available", async () => {
  let seenPolicy: string | undefined;
  let seenCandidateKinds: string[] = [];
  const runtime = await openBrowserRuntime({
    primitives: {
      scoreTransportCandidates: ({ candidates, policy }) => {
        seenPolicy = policy;
        seenCandidateKinds = candidates.map((candidate) => candidate.kind);
        return candidates.map((candidate): NnrpTransportCandidate => ({
          ...candidate,
          score: candidate.kind === "websocket" ? 120 : candidate.score,
        }));
      },
    },
  });
  const summary = await runtime.selectTransportWithPrimitives({
    peerManifest: createCapabilityManifest({
      buildMode: "browser-wasm",
      transports: ["websocket"],
      capabilities: ["client.session"],
    }),
  });

  assertEquals(seenPolicy, "auto");
  assertEquals(seenCandidateKinds, ["websocket"]);
  assertEquals(summary.selected, "websocket");
});

Deno.test("@nnrp/browser-client transport primitive path falls back to local browser scoring", async () => {
  const runtime = await openBrowserRuntime();
  const summary = await runtime.selectTransportWithPrimitives({
    peerManifest: createCapabilityManifest({
      buildMode: "browser-wasm",
      transports: ["websocket"],
      capabilities: ["client.session"],
    }),
  });

  assertEquals(summary.selected, "websocket");
});

Deno.test("@nnrp/browser-client rejects empty endpoints", async () => {
  const runtime = await openBrowserRuntime();

  assertThrows(
    () => runtime.connect({ endpoint: "" }),
    NnrpCapabilityError,
  );
});

Deno.test("@nnrp/browser-client rejects use after close", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  await runtime.close();

  assertThrows(
    () => client.openSession(),
    NnrpCapabilityError,
  );
});

Deno.test("@nnrp/browser-client rejects client and session operations after close", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  await client.close();

  assertThrows(() => client.openSession(), NnrpCapabilityError);

  const runtime2 = await openBrowserRuntime();
  const session = runtime2.connect({ endpoint: "wss://example.test/nnrp" }).openSession();
  await session.close();

  assertEquals(session.closed, true);
  await assertRejects(
    () => session.submit({ frameId: 1 }),
    NnrpCapabilityError,
  );
});

Deno.test("@nnrp/browser-client session methods preserve not-instantiated diagnostics", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  const session = client.openSession();

  const error = await assertRejects(
    () => session.submit({ frameId: 1, payload: new Uint8Array([1]) }),
    NnrpWasmBindingUnavailableError,
  );

  assertEquals(error.diagnostic.code, "NNRP_WASM_BINDING_NOT_INSTANTIATED");

  const noWaitError = await assertRejects(
    () => session.submitNoWait({ frameId: 2, payload: new Uint8Array([2]) }),
    NnrpWasmBindingUnavailableError,
  );

  assertEquals(noWaitError.diagnostic.code, "NNRP_WASM_BINDING_NOT_INSTANTIATED");
});

Deno.test("@nnrp/browser-client routes submit, runtime controls, and event polling through injected primitives", async () => {
  const seen: string[] = [];
  const runtime = await openBrowserRuntime({
    primitives: {
      validateSubmit: ({ submit }) => {
        seen.push(`validate:${submit.frameId}:${submit.descriptor?.profile ?? ""}`);
        return {
          ...submit,
          metadata: {
            ...(submit.metadata ?? {}),
            validated: "true",
          },
        };
      },
      submit: ({ submit }) => {
        seen.push(
          `submit:${submit.frameId}:${submit.descriptor?.cache?.key.key ?? ""}:${submit.metadata?.validated ?? ""}`,
        );
        return { frameId: submit.frameId, metadata: { profile: submit.descriptor?.profile ?? "" } };
      },
      submitNoWait: ({ submit }) => {
        seen.push(`submitNoWait:${submit.frameId}:${submit.metadata?.validated ?? ""}`);
        return BigInt(submit.frameId);
      },
      sendRuntimeFrame: ({ messageType, frameId, payload }) => {
        const decoded = decodeRuntimeControlMetadata(messageType, payload);
        const metadata = decoded.metadata as { readonly operationId: bigint };
        seen.push(`control:${messageType}:${frameId}:${metadata.operationId}:${decoded.tail.length}`);
      },
      awaitEvents: ({ maxEvents }) => [{
        type: "diagnostic",
        diagnostic: {
          code: `NNRP_WASM_TEST_EVENTS_${maxEvents}`,
          message: "event batch",
          source: "wasm",
          retryable: false,
        },
      }],
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();

  assertEquals(
    await session.submit({
      frameId: 11,
      descriptor: {
        profile: "tensor",
        cache: { key: { kind: "tensor", key: "kv-block" } },
      },
    }),
    {
      frameId: 11,
      metadata: { profile: "tensor" },
    },
  );
  await session.cancel({
    operationId: 11n,
    controlSequence: 1n,
    reasonCode: 0,
    sourceRole: RuntimeRole.Client,
    flags: 0,
    diagnosticBytes: 4,
  }, new Uint8Array([100, 111, 110, 101]));
  assertEquals(await session.submitNoWait({ frameId: 12 }), 12n);
  const event = await session.nextEvent();

  assertEquals(seen, [
    "validate:11:tensor",
    "submit:11:kv-block:true",
    `control:${NnrpMessageType.Cancel}:1:11:4`,
    "validate:12:",
    "submitNoWait:12:true",
  ]);
  assertEquals(event.type, "diagnostic");
  if (event.type === "diagnostic") {
    assertEquals(event.diagnostic.code, "NNRP_WASM_TEST_EVENTS_16");
  }
});

Deno.test("@nnrp/browser-client maps empty timed event polling to timeout diagnostics", async () => {
  let seenTimeout: number | undefined;
  const runtime = await openBrowserRuntime({
    primitives: {
      awaitEvents: ({ timeoutMillis }) => {
        seenTimeout = timeoutMillis;
        return [];
      },
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();

  const error = await assertRejects(
    () => session.nextEvent({ timeoutMillis: 5 }),
    NnrpTimeoutError,
  );

  assertEquals(seenTimeout, 5);
  assertEquals(error.diagnostic.code, "NNRP_EVENT_POLL_TIMEOUT");
  assertEquals(error.diagnostic.source, "wasm");
  assertEquals(error.diagnostic.retryable, true);
});

Deno.test("@nnrp/browser-client times out pending event polling without backend completion", async () => {
  const runtime = await openBrowserRuntime({
    primitives: {
      awaitEvents: () => new Promise<readonly NnrpRuntimeEvent[]>(() => {}),
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();

  const error = await assertRejects(
    () => session.nextEvent({ timeoutMillis: 0 }),
    NnrpTimeoutError,
  );

  assertEquals(error.diagnostic.code, "NNRP_EVENT_POLL_TIMEOUT");
  assertEquals(error.diagnostic.source, "wasm");
});

Deno.test("@nnrp/browser-client routes events by session id across shared runtimes", async () => {
  let pollCount = 0;
  const runtime = await openBrowserRuntime({
    primitives: {
      awaitEvents: () => {
        pollCount += 1;
        if (pollCount === 1) {
          return [
            { type: "result", sessionId: "session-b", result: { frameId: 2 } },
            { type: "result", sessionId: "session-a", result: { frameId: 1 } },
          ];
        }

        return [{ type: "diagnostic", diagnostic: diagnostic("NNRP_WASM_EMPTY") }];
      },
    },
  });
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  const sessionA = client.openSession({ sessionId: "session-a" });
  const sessionB = client.openSession({ sessionId: "session-b" });

  assertEquals(sessionA.sessionId, "session-a");
  assertEquals(sessionB.sessionId, "session-b");
  assertEquals(await sessionA.nextEvent(), { type: "result", sessionId: "session-a", result: { frameId: 1 } });
  assertEquals(await sessionB.nextEvent(), { type: "result", sessionId: "session-b", result: { frameId: 2 } });
  assertEquals(pollCount, 1);
});

Deno.test("@nnrp/browser-client maps result polling drops to typed errors", async () => {
  let pollCount = 0;
  const runtime = await openBrowserRuntime({
    primitives: {
      awaitEvents: () => {
        pollCount += 1;
        return pollCount === 1
          ? [{ type: "diagnostic", diagnostic: diagnostic("NNRP_WASM_SKIP") }]
          : [{ type: "drop", sessionId: "session-a", frameId: 55, diagnostic: diagnostic("NNRP_WASM_DROP") }];
      },
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession({ sessionId: "session-a" });

  const error = await assertRejects(
    () => session.nextResult(),
    NnrpResultDropError,
  );

  assertEquals(error.frameId, 55);
  assertEquals(error.sessionId, "session-a");
  assertEquals(error.diagnostic.code, "NNRP_WASM_DROP");
});

Deno.test("@nnrp/browser-client returns next result after non-result events", async () => {
  let pollCount = 0;
  const runtime = await openBrowserRuntime({
    primitives: {
      awaitEvents: () => {
        pollCount += 1;
        return pollCount === 1
          ? [{ type: "diagnostic", diagnostic: diagnostic("NNRP_WASM_SKIP") }]
          : [{ type: "result", sessionId: "session-a", result: { frameId: 56 } }];
      },
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession({ sessionId: "session-a" });

  assertEquals(await session.nextResult(), { frameId: 56 });
});

Deno.test("@nnrp/browser-client reports unsupported session migration with stable diagnostics", async () => {
  const runtime = await openBrowserRuntime();
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();

  const error = await assertRejects(
    () => session.migrate({ recoveryToken: { token: "resume-token" }, targetEndpoint: "wss://standby.test/nnrp" }),
    NnrpRecoveryError,
  );

  assertEquals(error.diagnostic.code, "NNRP_RECOVERY_UNSUPPORTED");
  assertEquals(error.diagnostic.source, "wasm");
});

Deno.test("@nnrp/browser-client routes session patch through WASM primitives", async () => {
  const seen: string[] = [];
  const runtime = await openBrowserRuntime({
    primitives: {
      patchSession: ({ sessionOptions, patch }) => {
        seen.push(`${sessionOptions.sessionId ?? ""}:${patch.inputProfile ?? ""}:${patch.metadata?.route ?? ""}`);
        return { accepted: true, sessionId: sessionOptions.sessionId, metadata: { patched: "wasm" } };
      },
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession({
    sessionId: "browser-session-patch",
    inputProfile: "tensor",
    initialCredits: 0,
  });

  const result = await session.patch({
    inputProfile: "token",
    initialCredits: 2,
    metadata: { route: "patch" },
  });

  assertEquals(result, {
    accepted: true,
    sessionId: "browser-session-patch",
    metadata: { patched: "wasm" },
  });
  assertEquals(seen, ["browser-session-patch:token:patch"]);
  assertEquals(session.options.inputProfile, "token");
  assertEquals(session.options.initialCredits, 2);
  assertEquals(session.options.metadata, { route: "patch" });
});

Deno.test("@nnrp/browser-client preserves not-instantiated diagnostics for session patch", async () => {
  const runtime = await openBrowserRuntime();
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();

  const error = await assertRejects(
    () => session.patch({ inputProfile: "token" }),
    NnrpWasmBindingUnavailableError,
  );

  assertEquals(error.diagnostic.code, "NNRP_WASM_BINDING_NOT_INSTANTIATED");
});

Deno.test("@nnrp/browser-client rejects duplicate in-flight frames and releases on completion", async () => {
  let resolveSubmit: ((result: { readonly frameId: number }) => void) | undefined;
  let holdNextSubmit = true;
  const runtime = await openBrowserRuntime({
    primitives: {
      submit: ({ submit }) =>
        new Promise((resolve) => {
          resolveSubmit = (result) => resolve(result);
          if (!holdNextSubmit) {
            resolve({ frameId: submit.frameId });
            return;
          }

          holdNextSubmit = false;
          if (submit.frameId !== 5) {
            resolve({ frameId: submit.frameId });
          }
        }),
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();

  const pending = session.submit({ frameId: 5 });

  assertEquals(session.inFlightFrames(), [5]);
  const duplicate = await assertRejects(
    () => session.submit({ frameId: 5 }),
    NnrpProtocolError,
  );

  assertEquals(duplicate.diagnostic.code, "NNRP_FRAME_IN_FLIGHT");
  resolveSubmit?.({ frameId: 5 });
  assertEquals(await pending, { frameId: 5 });
  assertEquals(session.inFlightFrames(), []);
  assertEquals(await session.submit({ frameId: 5 }), { frameId: 5 });
});

Deno.test("@nnrp/browser-client tracks no-wait frames until terminal events", async () => {
  const runtime = await openBrowserRuntime({
    primitives: {
      submitNoWait: ({ submit }) => BigInt(submit.frameId),
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();

  assertEquals(await session.submitNoWait({ frameId: 21 }), 21n);
  assertEquals(session.inFlightFrames(), [21]);

  const duplicate = await assertRejects(
    () => session.submitNoWait({ frameId: 21 }),
    NnrpProtocolError,
  );
  assertEquals(duplicate.diagnostic.code, "NNRP_FRAME_IN_FLIGHT");

  session.completeEvent({ type: "result", result: { frameId: 21, metadata: {} } });
  assertEquals(session.inFlightFrames(), []);

  await session.submitNoWait({ frameId: 22 });
  session.completeEvent({ type: "result", result: { frameId: 22, metadata: {} } });
  assertEquals(session.inFlightFrames(), []);

  await session.submitNoWait({ frameId: 23 });
  session.completeEvent({ type: "drop", frameId: 23, diagnostic: diagnostic("NNRP_WASM_DROP") });
  assertEquals(session.inFlightFrames(), []);

  await session.submitNoWait({ frameId: 24 });
  session.completeEvent({ type: "close", diagnostic: diagnostic("NNRP_WASM_CLOSE") });
  assertEquals(session.inFlightFrames(), []);
});

Deno.test("@nnrp/browser-client awaits submit capacity and rejects no-wait when credits are exhausted", async () => {
  const submitted: number[] = [];
  const runtime = await openBrowserRuntime({
    primitives: {
      submit: ({ submit }) => {
        submitted.push(submit.frameId);
        return { frameId: submit.frameId };
      },
      submitNoWait: ({ submit }) => BigInt(submit.frameId),
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession({
    submitCapacityPolicy: "await-credit",
    initialCredits: 0,
  });

  const pending = session.submit({ frameId: 41 });
  await Promise.resolve();
  assertEquals(submitted, []);

  const noWaitError = await assertRejects(
    () => session.submitNoWait({ frameId: 42 }),
    NnrpTransportError,
  );
  assertEquals(noWaitError.diagnostic.code, "NNRP_BACKPRESSURE_CREDIT_EXHAUSTED");
  assertEquals(noWaitError.diagnostic.source, "wasm");
  assertEquals(noWaitError.diagnostic.retryable, true);

  session.completeEvent({
    type: "flow-update",
    update: { credits: 1, recommendedPacingMicros: 100, transport: "websocket" },
  });

  assertEquals(await pending, { frameId: 41 });
  assertEquals(submitted, [41]);
});

Deno.test("@nnrp/browser-client keeps the coarse runtime frame primitive internal", async () => {
  const runtime = await openBrowserRuntime({
    primitives: {
      sendRuntimeFrame: () => {},
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();

  assertEquals("sendRuntimeFrame" in session, false);
});

Deno.test("@nnrp/browser-client rejects duplicate terminal events and clears frames on close", async () => {
  let resolveSubmit: ((result: { readonly frameId: number }) => void) | undefined;
  const runtime = await openBrowserRuntime({
    primitives: {
      submitNoWait: ({ submit }) => BigInt(submit.frameId),
      submit: ({ submit }) =>
        new Promise((resolve) => {
          resolveSubmit = (result) => resolve(result);
          if (submit.frameId !== 30) {
            resolve({ frameId: submit.frameId });
          }
        }),
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();

  await session.submitNoWait({ frameId: 4 });
  await session.submitNoWait({ frameId: 2 });
  await session.submitNoWait({ frameId: 3 });
  assertEquals(session.inFlightFrames(), [2, 3, 4]);

  session.completeEvent({ type: "drop", frameId: 3, diagnostic: diagnostic("NNRP_WASM_DROP") });
  const duplicateTerminal = assertThrows(
    () => session.completeEvent({ type: "drop", frameId: 3, diagnostic: diagnostic("NNRP_WASM_DROP_AGAIN") }),
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

Deno.test("@nnrp/browser-client closes injected primitives", async () => {
  let closed = false;
  const runtime = await openBrowserRuntime({
    primitives: {
      close: () => {
        closed = true;
      },
    },
  });

  await runtime.close();

  assertEquals(closed, true);
  assertEquals(runtime.closed, true);
});

Deno.test("@nnrp/browser-client preserves not-instantiated diagnostics for direct missing operations", async () => {
  const runtime = await openBrowserRuntime();

  await assertRejects(
    () => runtime.submit({ sessionOptions: {}, submit: { frameId: 1 } }),
    NnrpWasmBindingUnavailableError,
  );
  await assertRejects(
    () => runtime.submitNoWait({ sessionOptions: {}, submit: { frameId: 1 } }),
    NnrpWasmBindingUnavailableError,
  );
  await assertRejects(
    () =>
      runtime.sendRuntimeFrame({
        sessionOptions: {},
        messageType: NnrpMessageType.Cancel,
        frameId: 1,
        payload: new Uint8Array(),
      }),
    NnrpWasmBindingUnavailableError,
  );
  await assertRejects(
    () => runtime.awaitEvents({ maxEvents: 1 }),
    NnrpWasmBindingUnavailableError,
  );
});

Deno.test("@nnrp/browser-client treats empty event batches as unavailable next events", async () => {
  const runtime = await openBrowserRuntime({
    primitives: {
      awaitEvents: () => [],
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();

  await assertRejects(
    () => session.nextEvent(),
    NnrpWasmBindingUnavailableError,
    "nextEvent",
  );
});

Deno.test("@nnrp/browser-client validates submit requests before WASM dispatch", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  const session = client.openSession();

  const error = await assertRejects(
    () => session.submit({ frameId: -1 }),
    NnrpProtocolError,
  );

  assertEquals(error.diagnostic.code, "NNRP_SUBMIT_FRAME_ID_INVALID");
});

Deno.test("@nnrp/browser-client validates session metadata before opening sessions", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });

  assertThrows(
    () => client.openSession({ metadata: { "": "bad" } }),
    NnrpProtocolError,
    "Metadata keys must be non-empty",
  );
});

Deno.test("@nnrp/browser-client validates runtime control and event polling before WASM dispatch", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  const session = client.openSession();

  const controlError = await assertRejects(
    () =>
      session.cancel({
        operationId: -1n,
        controlSequence: 1n,
        reasonCode: 0,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      }),
    NnrpProtocolError,
  );
  const eventError = await assertRejects(
    () => session.nextEvent({ timeoutMillis: -1 }),
    NnrpProtocolError,
  );

  assertEquals(controlError.diagnostic.code, "NNRP_CONTROL_INTEGER_INVALID");
  assertEquals(eventError.diagnostic.code, "NNRP_EVENT_TIMEOUT_INVALID");
});

Deno.test("@nnrp/browser-client exposes the frozen high-level Preview4 runtime API", async () => {
  const seen: Array<{ readonly messageType: NnrpMessageType; readonly frameId: number; readonly payload: Uint8Array }> =
    [];
  const runtime = await openBrowserRuntime({
    primitives: {
      sendRuntimeFrame: ({ messageType, frameId, payload }) => {
        seen.push({ messageType, frameId, payload });
      },
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession({
    sessionId: "runtime-api",
  });
  const one = new Uint8Array([1]);
  const control = {
    operationId: 1n,
    controlSequence: 2n,
    reasonCode: 3,
    sourceRole: RuntimeRole.Client,
    flags: 0,
    diagnosticBytes: 1,
  } as const;
  const scheduling = {
    operationId: 1n,
    controlSequence: 2n,
    priorityClass: 3,
    priorityDelta: -1,
    deadlineUnixMs: 4n,
    flags: 0,
  } as const;

  await session.cancel(control, one);
  await session.abort(control, one);
  await session.updatePriority(scheduling);
  await session.updateDeadline(scheduling);
  await session.expireAt(scheduling);
  await session.supersede({
    oldOperationId: 1n,
    newOperationId: 2n,
    controlSequence: 3n,
    dropReasonCode: 4,
    flags: 0,
    diagnosticBytes: 1,
  }, one);
  await session.updateBudget({
    operationId: 1n,
    computeBudgetUnits: 2n,
    memoryBudgetBytes: 3n,
    bandwidthBudgetBytes: 4n,
    tokenBudget: 5,
    flags: 0,
  });
  const capability = {
    profileId: 1,
    capabilityCount: 1,
    costModelId: 2,
    preferenceRank: 3,
    limitBytes: 4n,
    limitUnits: 5n,
    bodyBytes: 1,
    flags: 0,
  } as const;
  await session.negotiateCapabilities(capability, one);
  await session.degradeProfile(capability, one);
  const route = {
    operationId: 1n,
    routeId: 2,
    executorClass: 3,
    affinityClass: 4,
    deadlineUnixMs: 5n,
    bodyBytes: 1,
    flags: 0,
  } as const;
  await session.sendRouteHint(route, one);
  await session.sendExecutionHint(route, one);
  await session.sendTraceContext({
    traceId: 1n,
    spanId: 2n,
    parentSpanId: 3n,
    stageCode: 4,
    flags: 0,
    bodyBytes: 1,
  }, one);
  await session.sendControl(NnrpMessageType.RetryAfter, {
    scopeId: 1n,
    controlSequence: 2n,
    retryAfterMs: 3,
    jitterMs: 4,
    reasonCode: 5,
    sourceRole: RuntimeRole.Client,
    flags: 0,
    diagnosticBytes: 1,
  }, one);
  await session.declareObject({
    objectId: 1n,
    objectKind: RuntimeObjectKind.Tensor,
    producerRole: RuntimeRole.Client,
    consumerRole: RuntimeRole.Server,
    sessionId: 1,
    byteSize: 1n,
    computeCostUnits: 1,
    memoryLocationHint: MemoryLocationHint.HostMemory,
    ownershipHint: OwnershipHint.SessionOwned,
    lifetimeHintMs: 1,
    metadataBytes: 1,
  }, one);
  await session.referenceObject({
    objectId: 1n,
    operationId: 2n,
    objectVersion: 3n,
    offset: 0n,
    length: 1n,
    flags: 0,
    metadataBytes: 1,
  }, one);
  await session.releaseObject({
    objectId: 1n,
    operationId: 2n,
    releaseReason: ObjectReleaseReason.Completed,
    sourceRole: RuntimeRole.Client,
    flags: 0,
    diagnosticBytes: 1,
  }, one);
  const delta = {
    objectId: 1n,
    deltaSequence: 2n,
    regionOffset: 0n,
    regionBytes: 1,
    deltaBytes: 1,
    flags: 0,
    metadataBytes: 0,
  } as const;
  await session.patchObject(delta, one);
  await session.sendObjectDelta(delta, one);
  await session.referenceCache({
    cacheKeyHi: 1n,
    cacheKeyLo: 2n,
    profileId: 3,
    reuseScope: CacheReuseScope.Session,
    leaseId: 4n,
    producerTraceId: 5n,
    expirationHintMs: 6,
    metadataBytes: 1,
    flags: 0,
  }, one);
  await session.reportCacheMiss({
    cacheKeyHi: 1n,
    cacheKeyLo: 2n,
    missReason: CacheMissReason.NotFound,
    profileId: 3,
    diagnosticBytes: 1,
  }, one);
  await session.invalidateCache({
    invalidateScope: 1,
    cacheNamespace: 2,
    cacheKeyHi: 3,
    cacheKeyLo: 4,
    reasonCode: 5,
  });

  assertEquals(seen.map(({ messageType }) => messageType), [
    NnrpMessageType.Cancel,
    NnrpMessageType.Abort,
    NnrpMessageType.PriorityUpdate,
    NnrpMessageType.Deadline,
    NnrpMessageType.ExpireAt,
    NnrpMessageType.Supersede,
    NnrpMessageType.BudgetUpdate,
    NnrpMessageType.CapabilityNegotiation,
    NnrpMessageType.DegradeProfile,
    NnrpMessageType.RouteHint,
    NnrpMessageType.ExecutionHint,
    NnrpMessageType.TraceContext,
    NnrpMessageType.RetryAfter,
    NnrpMessageType.ObjectDeclare,
    NnrpMessageType.ObjectRef,
    NnrpMessageType.ObjectRelease,
    NnrpMessageType.ObjectPatch,
    NnrpMessageType.ObjectDelta,
    NnrpMessageType.CacheReference,
    NnrpMessageType.CacheMiss,
    NnrpMessageType.CacheInvalidate,
  ]);
  assertEquals(seen.map(({ frameId }) => frameId), Array.from({ length: 21 }, (_, index) => index + 1));
  assertEquals(seen.every(({ payload }) => payload.byteLength > 0), true);
});

Deno.test("@nnrp/browser-client cancels event polling with abort signals", async () => {
  let resolvePoll: ((events: readonly NnrpRuntimeEvent[]) => void) | undefined;
  const runtime = await openBrowserRuntime({
    primitives: {
      awaitEvents: () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        }),
    },
  });
  const session = runtime.connect({ endpoint: "wss://example.test/nnrp" }).openSession();
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

Deno.test("@nnrp/browser-client exposes async event iterator convenience", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  const session = client.openSession();
  const iterator = session.events()[Symbol.asyncIterator]();

  const error = await assertRejects(
    () => iterator.next(),
    NnrpWasmBindingUnavailableError,
  );

  assertEquals(error.diagnostic.code, "NNRP_WASM_BINDING_NOT_INSTANTIATED");
});

function wasmManifest(): NnrpWasmArtifactManifest {
  return {
    package: "nnrp-wasm",
    wasm: "nnrp_wasm.wasm",
    types: "nnrp_wasm.d.ts",
    owner: "nnrp-rs",
    downstream_wrapper: "nnrp-js",
    exports: [
      "nnrp_wasm_protocol_major",
      "nnrp_wasm_wire_format",
      "selectTransportWithProbeJson",
      "scoreProviderProbeJson",
    ],
  };
}

function diagnostic(code: string) {
  return {
    code,
    message: code,
    source: "wasm" as const,
    retryable: false,
  };
}
