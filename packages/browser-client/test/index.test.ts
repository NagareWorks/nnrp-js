import { NnrpEndpoint as FrozenNnrpEndpoint, NnrpProviderEndpoint as FrozenNnrpProviderEndpoint } from "@nnrp/core";
import {
  createCapabilityManifest,
  NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES,
  NnrpCacheObjectKind,
  NnrpCapabilityError,
  NnrpSessionPriorityClass,
  NnrpSessionRecoveryTicket,
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
    "openBrowserClientConnection",
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

Deno.test("@nnrp/browser-client exposes frozen session defaults and eager open failures", async () => {
  let connectCalls = 0;
  const runtime = await browserRuntime([browserProvider({ onConnect: () => connectCalls++ })]);
  const version = await runtime.protocolVersion();
  assertEquals(version, { protocolMajor: 1, wireFormat: 0, version: "1.0.0" });

  const client = runtime.connect({
    endpoint: FrozenNnrpEndpoint.parse("nnrps://example.test/render"),
    providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("wss://example.test/nnrp") } },
    sessionDefaults: {
      profileId: 2,
      schemaId: 0x1001,
      schemaVersion: 3,
      priorityClass: NnrpSessionPriorityClass.Balanced,
      maxInFlightOperations: 3,
      cacheHints: [NnrpCacheObjectKind.PromptSegment],
    },
  });

  assertEquals(client.endpoint, "nnrps://example.test/render");
  const openFailure = await assertRejects(
    () =>
      client.openSession({
        requestedSessionId: 7,
        defaultDeadlineMillis: 750,
        allowResume: true,
        resumeTokenBytes: 64,
      }),
    Error,
    "unit test provider must not open a carrier",
  );
  assertEquals(openFailure.message, "unit test provider must not open a carrier");
  assertEquals(connectCalls, 1);
  await client.close();
  await runtime.close();
  assertEquals(runtime.closed, true);
  assertThrows(
    () =>
      runtime.connect({
        endpoint: FrozenNnrpEndpoint.parse("nnrps://example.test/render"),
        providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("wss://example.test/nnrp") } },
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
        endpoint: FrozenNnrpEndpoint.parse("nnrps://example.test/render"),
        providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("wss://example.test/nnrp") } },
      }),
    NnrpTransportError,
    "No viable transport provider",
  );
  assertThrows(
    () =>
      runtime.connect({
        endpoint: FrozenNnrpEndpoint.parse("nnrps://example.test/render"),
        providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("wss://example.test/nnrp") } },
        transportProviders: [browserProvider()],
        transportPolicy: "force-quic",
      }),
    NnrpTransportError,
    "Forced transport is not available",
  );
  assertThrows(
    () =>
      runtime.connect({
        endpoint: FrozenNnrpEndpoint.parse("ws://example.test/not-an-application-endpoint"),
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
        endpoint: FrozenNnrpEndpoint.parse("nnrp://example.test/render"),
        providerRoutes: { tcp: { endpoint: FrozenNnrpProviderEndpoint.parse("tcp://example.test:4433") } },
      }),
    NnrpTransportError,
  );
  assertEquals(invalidKey.diagnostic.code, "NNRP_BROWSER_PROVIDER_ROUTE_KEY_INVALID");

  const unresolved = assertThrows(
    () =>
      runtime.connect({
        endpoint: FrozenNnrpEndpoint.parse("nnrp://example.test/render"),
        providerRoutes: {},
      }),
    NnrpTransportSelectionError,
  );
  assertEquals(unresolved.candidates[0]?.rejectionReason, "route-unresolved");

  const insecure = assertThrows(
    () =>
      runtime.connect({
        endpoint: FrozenNnrpEndpoint.parse("nnrps://example.test/render"),
        providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("ws://example.test/nnrp") } },
      }),
    NnrpTransportSelectionError,
  );
  assertEquals(insecure.candidates[0]?.rejectionReason, "security-unsatisfied");

  const nativeCredentials = assertThrows(
    () =>
      runtime.connect({
        endpoint: FrozenNnrpEndpoint.parse("nnrps://example.test/render"),
        providerRoutes: {
          websocket: {
            endpoint: FrozenNnrpProviderEndpoint.parse("wss://example.test/nnrp"),
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
  assertEquals(nativeCredentials.candidates[0]?.rejectionReason, "security-unsatisfied");
  await runtime.close();

  const withoutProvider = await browserRuntime([]);
  const unavailable = assertThrows(
    () =>
      withoutProvider.connect({
        endpoint: FrozenNnrpEndpoint.parse("nnrp://example.test/render"),
        providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("ws://example.test/nnrp") } },
      }),
    NnrpTransportSelectionError,
  );
  assertEquals(unavailable.candidates[0]?.rejectionReason, "local-unavailable");
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
    peerSupportedTransports: peer.transports,
    policy: "auto",
    candidateReadiness: [{
      transportId: "websocket",
      providerId: "browser.preferred",
      routeResolved: true,
      securitySatisfied: true,
    }],
    probeObservations: [],
  });
  assertEquals(selection.selected, "websocket");
  assertEquals(
    selection.candidates.find((candidate) => candidate.selectionRank === 0)?.provider.id,
    "browser.preferred",
  );
  await runtime.close();
});

Deno.test("@nnrp/browser-client validates frozen session options before opening a carrier", async () => {
  let connectCalls = 0;
  const runtime = await browserRuntime([browserProvider({ onConnect: () => connectCalls++ })]);
  const client = runtime.connect({
    endpoint: FrozenNnrpEndpoint.parse("nnrps://example.test/render"),
    providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("wss://example.test/nnrp") } },
  });

  await assertRejects(
    () => client.openSession({ requestedSessionId: 0x1_0000_0000 }),
    RangeError,
    "requestedSessionId",
  );
  await assertRejects(
    () =>
      client.openSession({
        cacheHints: [NnrpCacheObjectKind.PromptSegment, NnrpCacheObjectKind.PromptSegment],
      }),
    RangeError,
    "duplicate",
  );
  assertEquals(connectCalls, 0);
  await client.close();
  await runtime.close();
});

Deno.test("@nnrp/browser-client retries connection bootstrap after an eager open failure", async () => {
  let connectCalls = 0;
  const runtime = await browserRuntime([browserProvider({ onConnect: () => connectCalls++ })]);
  const client = runtime.connect({
    endpoint: FrozenNnrpEndpoint.parse("nnrps://example.test/render"),
    providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("wss://example.test/nnrp") } },
  });
  await assertRejects(() => client.openSession({ requestedSessionId: 9 }), Error, "unit test provider");
  await assertRejects(() => client.openSession({ requestedSessionId: 9 }), Error, "unit test provider");
  assertEquals(connectCalls, 2);
  await client.close();
  await runtime.close();
});

Deno.test("@nnrp/browser-client binds resumed session identity to the recovery ticket", async () => {
  let connectCalls = 0;
  const runtime = await browserRuntime([browserProvider({ onConnect: () => connectCalls++ })]);
  const client = runtime.connect({
    endpoint: FrozenNnrpEndpoint.parse("nnrps://example.test/render"),
    providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("wss://example.test/nnrp") } },
  });
  const ticket = recoveryTicket(23);

  await assertRejects(
    () =>
      client.resumeSession(ticket, {
        requestedSessionId: 0x1_0000_0000,
        allowResume: false,
      }),
    Error,
    "unit test provider must not open a carrier",
  );
  assertEquals(connectCalls, 1);
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
  const metadata = {
    id: options.id ?? "browser.websocket",
    cost: { modelId: 0, units: 0n },
    preferenceRank: options.preferenceRank ?? 3,
    limits: { maxFrameBytes: 67_108_864n },
    limitations: ["browser-host-only"] as const,
  };
  const available = options.localAvailable ?? true;
  return {
    kind: "websocket",
    descriptor: {
      name: "@nnrp/transport-websocket",
      version: "test",
      transportId: "websocket",
      kind: "wasm",
      available,
      metadata,
    },
    endpointSchemes: ["ws", "wss"],
    localAvailable: available,
    metadata,
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
      "openBrowserClientConnection",
      "selectTransportWithProbeJson",
      "summarizeProviderProbeJson",
    ],
  };
}

function recoveryTicket(sessionId: number): NnrpSessionRecoveryTicket {
  const encoded = new Uint8Array(NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES + 4);
  encoded.set([0x4e, 0x52, 0x54, 0x4b]);
  const view = new DataView(encoded.buffer);
  view.setUint16(4, 1, true);
  view.setUint16(6, 1, true);
  view.setUint32(8, sessionId, true);
  view.setUint32(12, 4, true);
  view.setUint32(16, 120_000, true);
  view.setBigUint64(20, 1n, true);
  encoded.set([1, 2, 3, 4], NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES);
  return NnrpSessionRecoveryTicket.fromBytes(encoded);
}
