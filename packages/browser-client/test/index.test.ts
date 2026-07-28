import {
  createCapabilityManifest,
  NnrpCapabilityError,
  NnrpProtocolError,
  NnrpRecoveryError,
  NnrpTimeoutError,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportProbeOptions,
  NnrpTransportSelectionError,
} from "@nnrp/core";
import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  createWasmRuntimeBinding,
  type NnrpBrowserTransportProvider,
  type NnrpWasmArtifactManifest,
  openBrowserRuntime,
  resolveWasmArtifact,
  validateWasmArtifactManifest,
} from "../src/index.ts";

let compiledWasm: Promise<WebAssembly.Module> | undefined;

Deno.test("@nnrp/browser-client creates a package-owned WASM binding descriptor", () => {
  const binding = createWasmRuntimeBinding();

  assert(binding.moduleUrl.endsWith("/packages/browser-client/wasm/nnrp_wasm_bg.wasm"));
  assertEquals(binding.manifest.buildMode, "browser-wasm");
  assertEquals(binding.manifest.transports, ["websocket"]);
  assertEquals(binding.manifest.capabilities, [
    "client.session",
    "wasm.loader",
    "cache",
    "schema",
    "flow.update",
    "result.hint",
    "control.cancel_abort",
    "control.supersede",
    "control.priority_update",
    "control.deadline_expire",
    "control.progress_partial",
    "control.credit_backpressure",
    "control.capability_costs",
    "control.route_execution_hint",
    "control.trace_context",
    "control.result_drop_reason",
    "control.degrade_profile",
    "control.budget_update",
    "control.recoverable_error",
    "object.lifecycle",
    "object.delta",
    "object.cost",
    "object.ownership",
    "cache.reference",
  ]);
  assertEquals(binding.transportProviders, []);
});

Deno.test("@nnrp/browser-client resolves and validates browser artifact manifests", () => {
  const artifact = resolveWasmArtifact({
    manifest: wasmManifest(),
    baseUrl: "https://cdn.example.test/nnrp",
  });

  assertEquals(artifact.moduleUrl, "https://cdn.example.test/nnrp/nnrp_wasm_bg.wasm");
  assertEquals(artifact.glueUrl, "https://cdn.example.test/nnrp/nnrp_wasm.js");
  assertEquals(artifact.typesUrl, "https://cdn.example.test/nnrp/nnrp_wasm.d.ts");
  assertEquals(artifact.requiredExports, [
    "nnrp_wasm_protocol_major",
    "nnrp_wasm_wire_format",
    "openBrowserClientRole",
    "selectTransportWithProbeJson",
    "summarizeProviderProbeJson",
  ]);
  validateWasmArtifactManifest(wasmManifest());

  assertThrows(
    () => validateWasmArtifactManifest({ ...wasmManifest(), wasm: "" }),
    NnrpCapabilityError,
    "Invalid WASM artifact manifest",
  );
  assertThrows(
    () => validateWasmArtifactManifest({ ...wasmManifest(), exports: [] }),
    NnrpCapabilityError,
    "missing exports",
  );
});

Deno.test("@nnrp/browser-client preserves explicit module and provider ownership", async () => {
  const module = await browserModule();
  const provider = browserProvider();
  const binding = createWasmRuntimeBinding({
    module,
    moduleUrl: new URL("https://example.test/nnrp.wasm"),
    transportProviders: [provider],
  });

  assertEquals(binding.module, module);
  assertEquals(binding.moduleUrl, "https://example.test/nnrp.wasm");
  assertEquals(binding.transportProviders, [provider]);
});

Deno.test("@nnrp/browser-client exposes the frozen runtime, client, and session lifecycle", async () => {
  const runtime = await browserRuntime();
  const version = await runtime.protocolVersion();
  assertEquals(version, { protocolMajor: 1, wireFormat: 0, version: "1.0.0" });

  const client = runtime.connect({
    endpoint: "nnrps://example.test/render",
    providerRoutes: { websocket: { endpoint: "wss://example.test/nnrp" } },
    sessionDefaults: { inputProfile: "token", initialCredits: 3, metadata: { app: "browser" } },
  });
  const session = client.openSession({ sessionId: "session-a", metadata: { request: "one" } });

  assertEquals(client.endpoint, "nnrps://example.test/render");
  assertEquals(session.options.inputProfile, "token");
  assertEquals(session.options.initialCredits, 3);
  assertEquals(session.options.metadata, { app: "browser", request: "one" });
  assertThrows(() => client.openSession({ sessionId: "session-a" }), NnrpProtocolError, "already open");

  const patched = await session.patch({
    initialCredits: 5,
    submitCapacityPolicy: "await",
    metadata: { phase: "warm" },
  });
  assertEquals(patched.accepted, true);
  assertEquals(patched.metadata, { ackStatus: "local-only" });
  assertEquals(session.options.initialCredits, 5);
  assertEquals(session.options.submitCapacityPolicy, "await");
  assertEquals(session.options.metadata, { app: "browser", request: "one", phase: "warm" });

  const migration = await assertRejects(
    () =>
      session.migrate({
        recoveryToken: { token: "resume-token" },
        targetEndpoint: "nnrp://example.test/next",
      }),
    NnrpRecoveryError,
  );
  assertEquals(migration.diagnostic.code, "NNRP_RECOVERY_UNSUPPORTED");

  await session.close();
  assertEquals(session.closed, true);
  assertRejects(() => client.nextSessionEvent("session-a"), NnrpCapabilityError, "not open");
  await client.close();
  await runtime.close();
  assertEquals(runtime.closed, true);
  assertThrows(
    () =>
      runtime.connect({
        endpoint: "nnrps://example.test/render",
        providerRoutes: { websocket: { endpoint: "wss://example.test/nnrp" } },
      }),
    NnrpCapabilityError,
    "closed browser runtime",
  );
});

Deno.test("@nnrp/browser-client validates provider policy and endpoint boundaries", async () => {
  const unavailable = browserProvider({ localAvailable: false });
  const runtime = await browserRuntime([unavailable]);

  assertThrows(
    () =>
      runtime.connect({
        endpoint: "nnrps://example.test/render",
        providerRoutes: { websocket: { endpoint: "wss://example.test/nnrp" } },
      }),
    NnrpTransportError,
    "No viable transport provider",
  );
  assertThrows(
    () =>
      runtime.connect({
        endpoint: "nnrps://example.test/render",
        providerRoutes: { websocket: { endpoint: "wss://example.test/nnrp" } },
        transportProviders: [browserProvider()],
        transportPolicy: "force-quic",
      }),
    NnrpTransportError,
    "Forced transport is not available",
  );
  assertThrows(
    () =>
      runtime.connect({
        endpoint: "ws://example.test/not-an-application-endpoint",
        transportProviders: [browserProvider()],
      }),
    Error,
  );
  await runtime.close();
});

Deno.test("@nnrp/browser-client enforces the frozen browser route and security boundary", async () => {
  const runtime = await browserRuntime();

  const invalidKey = assertThrows(
    () =>
      runtime.connect({
        endpoint: "nnrp://example.test/render",
        providerRoutes: { tcp: { endpoint: "example.test:4433" } },
      }),
    NnrpTransportError,
  );
  assertEquals(invalidKey.diagnostic.code, "NNRP_BROWSER_PROVIDER_ROUTE_KEY_INVALID");

  const unresolved = assertThrows(
    () =>
      runtime.connect({
        endpoint: "nnrp://example.test/render",
        providerRoutes: { websocket: { endpoint: "https://example.test/nnrp" } },
      }),
    NnrpTransportSelectionError,
  );
  assertEquals(unresolved.selection?.candidates[0]?.rejectionReason, "route-unresolved");

  const insecure = assertThrows(
    () =>
      runtime.connect({
        endpoint: "nnrps://example.test/render",
        providerRoutes: { websocket: { endpoint: "ws://example.test/nnrp" } },
      }),
    NnrpTransportSelectionError,
  );
  assertEquals(insecure.selection?.candidates[0]?.rejectionReason, "security-unsatisfied");

  const nativeCredentials = assertThrows(
    () =>
      runtime.connect({
        endpoint: "nnrps://example.test/render",
        providerRoutes: {
          websocket: {
            endpoint: "wss://example.test/nnrp",
            security: {
              mode: "client",
              serverName: "example.test",
              trustedCertificateDer: new Uint8Array([1]),
            },
          },
        },
      }),
    NnrpTransportSelectionError,
  );
  assertEquals(nativeCredentials.selection?.candidates[0]?.rejectionReason, "security-unsatisfied");
  await runtime.close();

  const withoutProvider = await browserRuntime([]);
  const unavailable = assertThrows(
    () =>
      withoutProvider.connect({
        endpoint: "nnrp://example.test/render",
        providerRoutes: { websocket: { endpoint: "ws://example.test/nnrp" } },
      }),
    NnrpTransportSelectionError,
  );
  assertEquals(unavailable.selection?.candidates[0]?.rejectionReason, "local-unavailable");
  await withoutProvider.close();
});

Deno.test("@nnrp/browser-client selects its installed compatible browser provider", async () => {
  const preferred = browserProvider({ id: "browser.preferred", preferenceRank: 0 });
  const runtime = await browserRuntime([preferred]);
  const peer = createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["websocket"],
    capabilities: [],
  });

  const selection = runtime.selectTransport({
    peerManifest: peer,
    providers: [preferred],
    candidateReadiness: [{
      kind: "websocket",
      providerId: "browser.preferred",
      routeResolved: true,
      securitySatisfied: true,
    }],
  });
  assertEquals(selection.selected, "websocket");
  assertEquals(
    selection.candidates.find((candidate) => candidate.selectionRank === 0)?.provider.id,
    "browser.preferred",
  );
  await runtime.close();
});

Deno.test("@nnrp/browser-client rejects pre-aborted event polling before opening a carrier", async () => {
  let connectCalls = 0;
  const runtime = await browserRuntime([browserProvider({ onConnect: () => connectCalls++ })]);
  const session = runtime.connect({
    endpoint: "nnrps://example.test/render",
    providerRoutes: { websocket: { endpoint: "wss://example.test/nnrp" } },
  }).openSession();
  const controller = new AbortController();
  controller.abort("caller-stop");

  const error = await assertRejects(
    () => session.nextEvent({ signal: controller.signal }),
    NnrpTimeoutError,
  );
  assertEquals(error.diagnostic.code, "NNRP_EVENT_POLL_CANCELLED");
  assertEquals(error.diagnostic.cause, "caller-stop");
  assertEquals(connectCalls, 0);
  await session.close();
  await runtime.close();
});

Deno.test("@nnrp/browser-client releases a session when role open and close fail", async () => {
  const runtime = await browserRuntime();
  const client = runtime.connect({
    endpoint: "nnrps://example.test/render",
    providerRoutes: { websocket: { endpoint: "wss://example.test/nnrp" } },
  });
  const session = client.openSession({ sessionId: "reusable-session" });

  await assertRejects(() => session.nextEvent(), Error, "unit test provider must not open a carrier");
  await assertRejects(() => session.close(), Error, "unit test provider must not open a carrier");

  const replacement = client.openSession({ sessionId: "reusable-session" });
  await replacement.close();
  await client.close();
  await runtime.close();
});

async function browserRuntime(providers: readonly NnrpBrowserTransportProvider[] = [browserProvider()]) {
  return await openBrowserRuntime({
    module: await browserModule(),
    transportProviders: providers,
    transportPolicy: "auto",
  });
}

function browserModule(): Promise<WebAssembly.Module> {
  return compiledWasm ??= Deno.readFile(new URL("../wasm/nnrp_wasm_bg.wasm", import.meta.url))
    .then((bytes) => WebAssembly.compile(bytes));
}

function browserProvider(options: {
  readonly id?: string;
  readonly localAvailable?: boolean;
  readonly preferenceRank?: number;
  readonly onConnect?: () => void;
} = {}): NnrpBrowserTransportProvider {
  return {
    kind: "websocket",
    endpointSchemes: ["ws", "wss"],
    localAvailable: options.localAvailable ?? true,
    metadata: {
      id: options.id ?? "browser.websocket",
      cost: { modelId: 0, units: 0n },
      preferenceRank: options.preferenceRank ?? 3,
      limits: { maxFrameBytes: 67_108_864n },
      limitations: ["browser-host-only"],
    },
    probe: (_options: NnrpTransportProbeOptions) =>
      Promise.resolve({
        sampleCount: 1,
        successCount: 1,
        medianThroughputBytesPerSecond: 1_000_000_000n,
        medianRttMicroseconds: 1_000n,
      }),
    connect: (_options: NnrpTransportEndpoint): Promise<NnrpTransportConnection> => {
      options.onConnect?.();
      return Promise.reject(new Error("unit test provider must not open a carrier"));
    },
  };
}

function wasmManifest(): NnrpWasmArtifactManifest {
  return {
    package: "nnrp-wasm",
    wasm: "nnrp_wasm_bg.wasm",
    glue: "nnrp_wasm.js",
    types: "nnrp_wasm.d.ts",
    exports: [
      "nnrp_wasm_protocol_major",
      "nnrp_wasm_wire_format",
      "openBrowserClientRole",
      "selectTransportWithProbeJson",
      "summarizeProviderProbeJson",
    ],
  };
}
