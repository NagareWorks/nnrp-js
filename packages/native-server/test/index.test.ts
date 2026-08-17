import { NnrpEndpoint as FrozenNnrpEndpoint, NnrpProviderEndpoint as FrozenNnrpProviderEndpoint } from "@nnrp/core";
import {
  CacheMissReason,
  CacheReuseScope,
  createTokenSubmitRequest,
  decodeNnrpRuntimeEvent,
  decodeRuntimeObjectMetadata,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  encodeSubmitPayload,
  ErrorScope,
  MemoryLocationHint,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  NNRP_TOKEN_DELTA_SCHEMA_ID,
  NNRP_TOKEN_DELTA_SCHEMA_VERSION,
  NnrpCapabilityError,
  NnrpMessageType,
  type NnrpNativeTransportBinding,
  NnrpProtocolError,
  type NnrpRuntimeEvent,
  type NnrpSessionOpenMetadata,
  NnrpStandardProfile,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportKind,
  NnrpTransportSelectionError,
  type NnrpTransportServer,
  ObjectReleaseReason,
  OwnershipHint,
  RuntimeObjectKind,
  RuntimeRole,
} from "@nnrp/core";
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  type NnrpNativeRuntimeCapabilities,
  type NnrpNativeTransportProvider,
  type NnrpServerSession,
  openBackendRuntime,
  validateNativeRuntimeCapabilities,
} from "../src/index.ts";
import { createQuicTransportProvider } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";
import { createSuccessResultReply } from "../../../scripts/runtime-event-fixtures.ts";

const SERVER_ROLE_ADOPT = Symbol.for("nnrp.internal.native.server-role-adopt.v1");

async function receiveRuntimeEvent(session: NnrpServerSession): Promise<NnrpRuntimeEvent> {
  const event = await session.nextEvent();
  if (event.type === "runtime") return event.event;
  if (event.type === "submit") return event.operation.submit;
  throw new Error(`expected runtime event, received lifecycle state ${event.event.state}`);
}

interface ObservedServerRoleOptions {
  readonly supportedProfiles: readonly number[];
  readonly supportedCacheObjects: readonly number[];
  readonly maxCacheObjects: bigint;
  readonly maxCacheObjectBytes: number;
  readonly schemaDescriptors: readonly { readonly schemaId: number; readonly schemaVersion: number }[];
  readonly resumeTokenBytes: number;
  readonly maxInFlightOperations: number;
  readonly grantedOperationCredit: number;
  readonly leaseTtlMs: number;
  readonly resumeWindowMs: number;
  readonly evaluateSession?: (open: NnrpSessionOpenMetadata) => Promise<{
    readonly accepted: boolean;
    readonly sessionErrorCode: number;
    readonly diagnostic?: string;
  }>;
}

Deno.test("@nnrp/native-server requires the exact Preview4 native ABI", () => {
  const capabilities = preview4RuntimeCapabilities();
  validateNativeRuntimeCapabilities(capabilities);
  validateNativeRuntimeCapabilities({ ...capabilities, transportSlots: 0 });

  const error = assertThrows(
    () => validateNativeRuntimeCapabilities({ ...capabilities, abiMajor: 1, abiMinor: 12, abiPatch: 1 }),
    NnrpCapabilityError,
  );
  assertEquals(error.diagnostic.code, "NNRP_NATIVE_ABI_MISMATCH");
});

Deno.test("@nnrp/native-server opens backend runtime and listens with explicit providers", async () => {
  const runtime = await openBackendRuntime({
    transportPolicy: "force-tcp",
    transports: [
      fakeRoleProvider("tcp"),
      fakeRoleProvider("quic"),
    ],
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://0.0.0.0:4433/session/default"),
    providerRoutes: { quic: { security: testServerSecurity() } },
    transportPolicy: "force-quic",
  });

  assertEquals(runtime.manifest.transports, ["tcp", "quic"]);
  assertEquals(runtime.manifest.capabilities, [
    "server.session",
    "cache",
    "schema",
    "recovery",
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
  assertEquals("connect" in runtime, false);
  assertEquals(server.endpoint, "nnrp://0.0.0.0:4433/session/default");
  assertEquals(server.transportPolicy, "force-quic");

  await runtime.close();
  assertEquals(server.closed, true);
});

Deno.test("@nnrp/native-server passes frozen session defaults and async admission policy to the provider", async () => {
  let adopted: ObservedServerRoleOptions | undefined;
  let evaluated: NnrpSessionOpenMetadata | undefined;
  const runtime = await openBackendRuntime({
    transports: [fakeRoleProvider("tcp", { onAdopt: (options) => adopted = options })],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default"),
    sessionDefaults: {
      supportedProfiles: [NnrpStandardProfile.Token, NnrpStandardProfile.Tensor],
      supportedCacheObjects: [1, 3],
      maxCacheObjects: 64n,
      maxCacheObjectBytes: 1_048_576,
      resumeTokenBytes: 32,
      maxInFlightOperations: 8,
      grantedOperationCredit: 4,
      leaseTtlMs: 45_000,
      resumeWindowMs: 180_000,
      applicationPolicy: {
        evaluate: (open) => {
          evaluated = open;
          return Promise.resolve({ accepted: true, sessionErrorCode: 0 });
        },
      },
    },
  });

  const session = await server.accept({ timeoutMs: 250 });
  if (adopted === undefined) throw new Error("server role options were not observed");
  assertEquals(adopted.supportedProfiles, [NnrpStandardProfile.Token, NnrpStandardProfile.Tensor]);
  assertEquals(adopted.supportedCacheObjects, [1, 3]);
  assertEquals(adopted.maxCacheObjects, 64n);
  assertEquals(adopted.maxCacheObjectBytes, 1_048_576);
  assertEquals(adopted.schemaDescriptors.map(({ schemaId, schemaVersion }) => ({ schemaId, schemaVersion })), [{
    schemaId: NNRP_TOKEN_DELTA_SCHEMA_ID,
    schemaVersion: NNRP_TOKEN_DELTA_SCHEMA_VERSION,
  }]);
  assertEquals(adopted.resumeTokenBytes, 32);
  assertEquals(adopted.maxInFlightOperations, 8);
  assertEquals(adopted.grantedOperationCredit, 4);
  assertEquals(adopted.leaseTtlMs, 45_000);
  assertEquals(adopted.resumeWindowMs, 180_000);

  const open: NnrpSessionOpenMetadata = {
    requestedSessionId: 0,
    profileId: NnrpStandardProfile.Token,
    priorityClass: 1,
    sessionFlags: 0,
    schemaId: NNRP_TOKEN_DELTA_SCHEMA_ID,
    schemaVersion: NNRP_TOKEN_DELTA_SCHEMA_VERSION,
    defaultDeadlineMillis: 500,
    maxInFlightOperations: 4,
    leaseTtlHintMillis: 30_000,
    resumeTokenBytes: 24,
    authBytes: 0,
    sessionExtensionBytes: 0,
    clientSessionTag: 7n,
  };
  assertEquals(await adopted.evaluateSession?.(open), { accepted: true, sessionErrorCode: 0 });
  assertEquals(evaluated, open);

  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server forwards accept timeout and keeps the default policy on the Rust fast path", async () => {
  let adopted: ObservedServerRoleOptions | undefined;
  let acceptedTimeout: number | undefined;
  const runtime = await openBackendRuntime({
    transports: [fakeRoleProvider("tcp", {
      onAdopt: (options) => adopted = options,
      onAccept: (timeoutMs) => acceptedTimeout = timeoutMs,
    })],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({ endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default") });
  const session = await server.accept({ timeoutMs: 1_250 });

  if (adopted === undefined) throw new Error("server role options were not observed");
  assertEquals(adopted.supportedProfiles, [NnrpStandardProfile.Token]);
  assertEquals(adopted.supportedCacheObjects, []);
  assertEquals(adopted.maxCacheObjects, 0n);
  assertEquals(adopted.maxCacheObjectBytes, 0);
  assertEquals(adopted.resumeTokenBytes, 24);
  assertEquals(adopted.maxInFlightOperations, 4);
  assertEquals(adopted.grantedOperationCredit, 2);
  assertEquals(adopted.leaseTtlMs, 30_000);
  assertEquals(adopted.resumeWindowMs, 120_000);
  assertEquals(adopted.evaluateSession, undefined);
  assertEquals(acceptedTimeout, 1_250);

  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server discovers every installed native transport package", async () => {
  const policies = ["force-tcp", "force-quic", "force-ipc", "force-websocket"] as const;

  for (const transportPolicy of policies) {
    const runtime = await openBackendRuntime({
      transportPolicy,
    });
    assertEquals(
      runtime.manifest.transports.includes(transportPolicy.slice("force-".length) as NnrpTransportKind),
      true,
    );
    await runtime.close();
  }
});

Deno.test("@nnrp/native-server selects only installed transport providers", async () => {
  const tcpRuntime = await openBackendRuntime({
    transports: [createTcpTransportProvider({ binding: fakeTransportBinding("tcp") })],
  });
  const tcpSummary = tcpRuntime.selectTransport({
    peerSupportedTransports: ["tcp", "quic"],
    policy: "auto",
    candidateReadiness: [{
      transportId: "tcp",
      providerId: "nnrp.transport.tcp.native",
      routeResolved: true,
      securitySatisfied: true,
    }],
    probeObservations: [],
  });

  assertEquals(tcpSummary.selected, "tcp");
  assertEquals(tcpSummary.rejected, []);

  const noProviderRuntime = await openBackendRuntime({
    transports: [],
  });
  const noProviderError = assertThrows(
    () =>
      noProviderRuntime.selectTransport({
        peerSupportedTransports: ["tcp", "quic"],
        policy: "auto",
        candidateReadiness: [],
        probeObservations: [],
      }),
    NnrpTransportSelectionError,
  );
  assertEquals(noProviderError.code, "NO_VIABLE_TRANSPORT");
  assertEquals(
    noProviderError.diagnostic,
    "No viable transport provider remains after applying policy and evidence.",
  );
});

Deno.test("@nnrp/native-server rejects listen policies unsatisfied by installed providers", async () => {
  const runtime = await openBackendRuntime({
    transports: [createTcpTransportProvider({ binding: fakeTransportBinding("tcp") })],
  });

  const error = assertThrows(
    () =>
      runtime.listen({
        endpoint: FrozenNnrpEndpoint.parse("nnrp://0.0.0.0:4433/session/default"),
        transportPolicy: "force-quic",
      }),
    NnrpTransportError,
  );

  assertEquals(error.diagnostic.code, "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED");
  assertEquals(error.diagnostic.transport, "quic");

  const endpointError = assertThrows(
    () =>
      runtime.listen({
        endpoint: FrozenNnrpEndpoint.parse("nnrp://0.0.0.0:4433/session/default"),
        providerRoutes: { udp: { endpoint: "127.0.0.1:4433" } } as never,
      }),
    NnrpTransportError,
  );
  assertEquals(endpointError.diagnostic.code, "NNRP_NATIVE_PROVIDER_ROUTE_KEY_INVALID");

  const duplicateRuntime = await openBackendRuntime({
    transports: [fakeRoleProvider("tcp"), fakeRoleProvider("tcp")],
  });
  const duplicateError = assertThrows(
    () => duplicateRuntime.listen({ endpoint: FrozenNnrpEndpoint.parse("nnrp://0.0.0.0:4433/session/default") }),
    NnrpTransportError,
  );
  assertEquals(duplicateError.diagnostic.code, "NNRP_NATIVE_TRANSPORT_PROVIDER_DUPLICATE");
  await duplicateRuntime.close();
});

Deno.test("@nnrp/native-server passes route-local security to its provider role listener", async () => {
  const security = {
    mode: "server",
    certificateDer: new Uint8Array([1, 2, 3]),
    privateKeyPkcs8Der: new Uint8Array([4, 5, 6]),
  } as const;
  let listened: NnrpTransportEndpoint | undefined;
  const binding: NnrpNativeTransportBinding = {
    ...fakeTransportBinding("quic"),
    listen: (options) => {
      listened = options;
      return Promise.resolve({
        kind: "quic",
        endpoint: String(options.endpoint),
        listening: true,
        accept: () => Promise.reject(new Error("carrier accept must be transferred to the server role")),
        close: () => {},
        [SERVER_ROLE_ADOPT]: () =>
          Promise.resolve({
            accept: () =>
              Promise.resolve({
                handle: { kind: 3, id: 1n, generation: 1, flags: 0 },
                sessionId: 31,
                poll: () => Promise.resolve([]),
                sendResult: () => Promise.resolve(),
                sendRuntimeFrame: () => Promise.resolve(),
                close: () => Promise.resolve(),
              }),
            close: () => Promise.resolve(),
          }),
      } as NnrpTransportServer);
    },
  };
  const runtime = await openBackendRuntime({
    transports: [createQuicTransportProvider({ binding })],
    transportPolicy: "force-quic",
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrps://runtime.example/session/default"),
    providerRoutes: { quic: { endpoint: FrozenNnrpProviderEndpoint.parse("quic://127.0.0.1:45443"), security } },
  });
  const session = await server.accept();

  assertEquals(listened, { endpoint: "127.0.0.1:45443", security });
  assertEquals(session.sessionId, 31);
  assertEquals(session.activeTransport, "quic");
  assertEquals(server.boundProviderEndpoints, { quic: "127.0.0.1:45443" });
  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server isolates TCP TLS and QUIC credentials across one listener set", async () => {
  const listened: Partial<Record<NnrpTransportKind, NnrpTransportEndpoint>> = {};
  const tcpSecurity = testServerSecurity(1);
  const quicSecurity = testServerSecurity(11);
  const runtime = await openBackendRuntime({
    transports: [
      fakeRoleProvider("tcp", { onListen: (options) => listened.tcp = options }),
      fakeRoleProvider("quic", { onListen: (options) => listened.quic = options }),
    ],
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://runtime.example/session/default"),
    providerRoutes: {
      tcp: { endpoint: FrozenNnrpProviderEndpoint.parse("tcp://127.0.0.1:45444"), security: tcpSecurity },
      quic: { endpoint: FrozenNnrpProviderEndpoint.parse("quic://127.0.0.1:45443"), security: quicSecurity },
    },
  });
  await server.accept();

  assertEquals(listened.tcp, { endpoint: "127.0.0.1:45444", security: tcpSecurity });
  assertEquals(listened.quic, { endpoint: "127.0.0.1:45443", security: quicSecurity });

  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server allows an ephemeral TCP bind route", async () => {
  let listened: NnrpTransportEndpoint | undefined;
  const runtime = await openBackendRuntime({
    transports: [fakeRoleProvider("tcp", { onListen: (options) => listened = options })],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://runtime.example/session/default"),
    providerRoutes: { tcp: { endpoint: FrozenNnrpProviderEndpoint.parse("tcp://127.0.0.1:0") } },
  });
  const session = await server.accept();

  assertEquals(listened, { endpoint: "127.0.0.1:0" });
  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server opens IPC and plain WebSocket together under nnrp", async () => {
  const listened: NnrpTransportKind[] = [];
  const runtime = await openBackendRuntime({
    transports: [
      fakeRoleProvider("ipc", { listened }),
      fakeRoleProvider("websocket", { listened }),
    ],
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://runtime.example/session/default"),
    providerRoutes: {
      ipc: { endpoint: FrozenNnrpProviderEndpoint.parse("unix:///run/nnrp.sock") },
      websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("ws://127.0.0.1:45445/nnrp") },
    },
  });
  await server.accept();

  assertEquals(listened, ["ipc", "websocket"]);
  assertEquals(server.boundProviderEndpoints, {
    ipc: "unix:///run/nnrp.sock",
    websocket: "ws://127.0.0.1:45445/nnrp",
  });

  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server rejects insecure listener routes under nnrps", async () => {
  const cases = [
    {
      kind: "tcp",
      route: { endpoint: FrozenNnrpProviderEndpoint.parse("tcp://127.0.0.1:45444") },
      code: "NNRP_NATIVE_PROVIDER_ROUTE_SECURITY_UNSATISFIED",
    },
    {
      kind: "ipc",
      route: { endpoint: FrozenNnrpProviderEndpoint.parse("unix:///run/nnrp.sock") },
      code: "NNRP_NATIVE_PROVIDER_ROUTE_SECURITY_UNSATISFIED",
    },
    {
      kind: "websocket",
      route: { endpoint: FrozenNnrpProviderEndpoint.parse("ws://127.0.0.1:45445/nnrp") },
      code: "NNRP_NATIVE_PROVIDER_ROUTE_SECURITY_UNSATISFIED",
    },
  ] as const;

  for (const { kind, route, code } of cases) {
    const runtime = await openBackendRuntime({ transports: [fakeRoleProvider(kind)] });
    const server = runtime.listen({
      endpoint: FrozenNnrpEndpoint.parse("nnrps://runtime.example/session/default"),
      providerRoutes: { [kind]: route },
      transportPolicy: `force-${kind}`,
    });
    const error = await assertRejects(() => server.accept(), NnrpTransportError);
    assertEquals(error.diagnostic.code, code, `${kind} rejection code`);
    assertEquals(error.diagnostic.transport, kind);
    await runtime.close();
  }
});

Deno.test("@nnrp/native-server rejects configured routes whose providers are not installed", async () => {
  const runtime = await openBackendRuntime({ transports: [fakeRoleProvider("tcp")] });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://runtime.example/session/default"),
    providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("ws://runtime.example/nnrp") } },
  });

  const error = await assertRejects(() => server.accept(), NnrpTransportError);
  assertEquals(error.diagnostic.code, "NNRP_NATIVE_PROVIDER_ROUTE_LOCAL_UNAVAILABLE");
  assertEquals(error.diagnostic.transport, "websocket");
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server opens every eligible listener and preserves preference order", async () => {
  const listened: NnrpTransportKind[] = [];
  const accepted: NnrpTransportKind[] = [];
  const closed: NnrpTransportKind[] = [];
  const runtime = await openBackendRuntime({
    transports: [
      fakeRoleProvider("tcp", { listened, accepted, closed, preferenceRank: 1 }),
      fakeRoleProvider("quic", { listened, accepted, closed, preferenceRank: 100 }),
    ],
    transportPolicy: "prefer-quic",
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default"),
    providerRoutes: {
      quic: { endpoint: FrozenNnrpProviderEndpoint.parse("quic://127.0.0.1:45443"), security: testServerSecurity() },
      tcp: { endpoint: FrozenNnrpProviderEndpoint.parse("tcp://127.0.0.1:45444") },
    },
  });

  const first = await server.accept();
  const second = await server.accept();

  assertEquals(listened, ["quic", "tcp"]);
  assertEquals(accepted, ["quic", "tcp"]);
  assertEquals(first.activeTransport, "quic");
  assertEquals(second.activeTransport, "tcp");
  assertEquals(server.boundProviderEndpoints, { quic: "127.0.0.1:45443", tcp: "127.0.0.1:45444" });

  await server.close();
  assertEquals(first.closed, true);
  assertEquals(second.closed, true);
  assertEquals(closed, ["quic", "tcp"]);
  await runtime.close();
  assertEquals(closed, ["quic", "tcp"]);
});

Deno.test("@nnrp/native-server isolates equal wire session ids across provider runtimes", async () => {
  const tcpEvents = [{ ...roleRuntimeEvent(NnrpMessageType.SessionClose, new Uint8Array(24)), traceId: 11n }];
  const ipcEvents = [{ ...roleRuntimeEvent(NnrpMessageType.SessionClose, new Uint8Array(24)), traceId: 22n }];
  const runtime = await openBackendRuntime({
    transports: [
      fakeRoleProvider("tcp", { sessionId: 7, events: tcpEvents }),
      fakeRoleProvider("ipc", { sessionId: 7, events: ipcEvents }),
    ],
    transportPolicy: "prefer-tcp",
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://runtime.example/session/default"),
    providerRoutes: {
      tcp: { endpoint: FrozenNnrpProviderEndpoint.parse("tcp://127.0.0.1:45444") },
      ipc: { endpoint: FrozenNnrpProviderEndpoint.parse("npipe://nnrp-native-server-routing") },
    },
  });

  const first = await server.accept();
  const second = await server.accept();
  assertEquals(first.sessionId, 7);
  assertEquals(second.sessionId, 7);
  assertEquals((await receiveRuntimeEvent(first)).header.traceId, 11n);
  assertEquals((await receiveRuntimeEvent(second)).header.traceId, 22n);

  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server rolls back an atomic listener set when one provider fails", async () => {
  const closed: NnrpTransportKind[] = [];
  const runtime = await openBackendRuntime({
    transports: [
      fakeRoleProvider("tcp", { closed, preferenceRank: 1 }),
      fakeRoleProvider("quic", { closeError: new Error("quic listen failed"), preferenceRank: 2 }),
    ],
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default"),
    providerRoutes: { quic: { security: testServerSecurity() } },
  });

  await assertRejects(() => server.accept(), Error, "quic listen failed");
  assertEquals(closed, ["tcp"]);

  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server closes the atomic listener set after a terminal listener failure", async () => {
  const closed: NnrpTransportKind[] = [];
  const runtime = await openBackendRuntime({
    transports: [
      fakeRoleProvider("tcp", { closed, acceptError: new Error("tcp listener terminated") }),
      fakeRoleProvider("quic", { closed, acceptError: new Error("quic listener terminated") }),
    ],
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default"),
    providerRoutes: { quic: { security: testServerSecurity() } },
  });

  await assertRejects(() => server.accept(), Error, "listener terminated");
  assertEquals(server.closed, true);
  assertEquals([...closed].sort(), ["quic", "tcp"]);

  await runtime.close();
  assertEquals([...closed].sort(), ["quic", "tcp"]);
});

Deno.test("@nnrp/native-server force policy opens only the named eligible listener", async () => {
  const listened: NnrpTransportKind[] = [];
  const closed: NnrpTransportKind[] = [];
  const runtime = await openBackendRuntime({
    transports: [
      fakeRoleProvider("tcp", { listened, closed }),
      fakeRoleProvider("quic", { listened, closed }),
    ],
  });
  const server = runtime.listen({
    endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default"),
    transportPolicy: "force-tcp",
  });

  await server.accept();
  assertEquals(listened, ["tcp"]);
  await server.close();
  assertEquals(closed, ["tcp"]);
  await runtime.close();
});

Deno.test("@nnrp/native-server rejects carriers without server role adoption", async () => {
  const binding: NnrpNativeTransportBinding = {
    ...fakeTransportBinding("tcp"),
    listen: (options) =>
      Promise.resolve({
        kind: "tcp",
        endpoint: String(options.endpoint),
        listening: true,
        accept: () => Promise.reject(new Error("carrier-only listener")),
        close: () => {},
      }),
  };
  const runtime = await openBackendRuntime({
    transports: [createTcpTransportProvider({ binding })],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({ endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default") });

  const error = await assertRejects(() => server.accept(), NnrpCapabilityError);
  assertEquals(error.diagnostic.code, "NNRP_NATIVE_ROLE_ADOPTION_UNAVAILABLE");

  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server decodes ordered control, object, and cache role events", async () => {
  const events = [
    roleRuntimeEvent(
      NnrpMessageType.Cancel,
      encodeRuntimeControlMetadata(
        NnrpMessageType.Cancel,
        {
          operationId: 1n,
          controlSequence: 2n,
          reasonCode: 3,
          sourceRole: RuntimeRole.Client,
          flags: 0,
          diagnosticBytes: 2,
        },
        new Uint8Array([4, 5]),
      ),
    ),
    roleRuntimeEvent(
      NnrpMessageType.PriorityUpdate,
      encodeRuntimeControlMetadata(NnrpMessageType.PriorityUpdate, {
        operationId: 1n,
        controlSequence: 3n,
        priorityClass: 4,
        priorityDelta: -1,
        deadlineUnixMs: 5n,
        flags: 0,
      }),
    ),
    roleRuntimeEvent(
      NnrpMessageType.CapabilityNegotiation,
      encodeRuntimeControlMetadata(
        NnrpMessageType.CapabilityNegotiation,
        {
          profileId: 1,
          capabilityCount: 2,
          costModelId: 3,
          preferenceRank: 4,
          limitBytes: 5n,
          limitUnits: 6n,
          bodyBytes: 1,
          flags: 0,
        },
        new Uint8Array([7]),
      ),
    ),
    roleRuntimeEvent(
      NnrpMessageType.ObjectDeclare,
      encodeRuntimeObjectMetadata(
        NnrpMessageType.ObjectDeclare,
        {
          objectId: 1n,
          objectKind: RuntimeObjectKind.Tensor,
          producerRole: RuntimeRole.Client,
          consumerRole: RuntimeRole.Server,
          sessionId: 2,
          byteSize: 3n,
          computeCostUnits: 4,
          memoryLocationHint: MemoryLocationHint.HostMemory,
          ownershipHint: OwnershipHint.SessionOwned,
          lifetimeHintMs: 5,
          metadataBytes: 1,
        },
        new Uint8Array([8]),
      ),
    ),
    roleRuntimeEvent(
      NnrpMessageType.ObjectDelta,
      encodeRuntimeObjectMetadata(
        NnrpMessageType.ObjectDelta,
        {
          objectId: 1n,
          deltaSequence: 2n,
          regionOffset: 0n,
          regionBytes: 2,
          deltaBytes: 2,
          flags: 0,
          metadataBytes: 1,
        },
        new Uint8Array([9, 10, 11]),
      ),
    ),
    roleRuntimeEvent(
      NnrpMessageType.CacheInvalidate,
      encodeCacheInvalidateMetadata({
        invalidateScope: 1,
        cacheNamespace: 2,
        cacheKeyHi: 0n,
        cacheKeyLo: 0n,
        reasonCode: 5,
      }),
    ),
  ];
  const runtime = await openBackendRuntime({
    transports: [createTcpTransportProvider({ binding: roleServerBinding(events) })],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({ endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default") });
  const session = await server.accept();

  const cancel = await receiveRuntimeEvent(session);
  const priority = await receiveRuntimeEvent(session);
  const capability = await receiveRuntimeEvent(session);
  const declaration = await receiveRuntimeEvent(session);
  const delta = await receiveRuntimeEvent(session);
  const invalidation = await receiveRuntimeEvent(session);

  assertEquals(cancel.metadata.type, "control_request");
  assertEquals(cancel.tail, { type: "diagnostic", diagnostic: new Uint8Array([4, 5]) });
  assertEquals(priority.metadata.type, "scheduling");
  assertEquals(capability.metadata.type, "capability");
  assertEquals(capability.tail, { type: "body", body: new Uint8Array([7]) });
  assertEquals(declaration.metadata.type, "object_descriptor");
  assertEquals(declaration.tail, { type: "body", body: new Uint8Array([8]) });
  assertEquals(delta.metadata.type, "object_delta");
  if (delta.tail.type === "metadata_body_and_delta") {
    assertEquals(delta.tail.metadataBody, new Uint8Array([9]));
    assertEquals(delta.tail.delta, new Uint8Array([10, 11]));
  }
  assertEquals(invalidation.metadata.type, "cache_invalidate");

  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server enforces terminal result ordering without blocking terminal evidence", async () => {
  const runtimeFrames: NnrpMessageType[] = [];
  const observedHandles: Array<{ readonly id: bigint; readonly generation: number; readonly flags: number }> = [];
  let resultCount = 0;
  const operationHandle = { kind: 4, id: 900n, generation: 3, flags: 0xa5 };
  const runtime = await openBackendRuntime({
    transports: [
      createTcpTransportProvider({
        binding: roleServerBinding(
          [
            roleSubmitEvent(9n, 7, operationHandle),
            roleSubmitEvent(10n, 8, { kind: 4, id: 901n, generation: 4, flags: 0x5a }),
          ],
          {
            onResult: (handle) => {
              resultCount++;
              observedHandles.push(handle);
            },
            onRuntimeFrame: (handle, messageType) => {
              runtimeFrames.push(messageType as NnrpMessageType);
              observedHandles.push(handle);
            },
          },
        ),
      }),
    ],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({ endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default") });
  const session = await server.accept();
  const operation = await session.receiveSubmit();
  assertEquals(operation.submit.metadata.type, "frame_submit");

  await operation.sendProgress({
    operationId: 9n,
    progressSequence: 1n,
    stageCode: 1,
    percentX100: 50,
    objectId: 0n,
    bodyBytes: 0,
  });
  await operation.sendPartialResult({
    operationId: 9n,
    resultSequence: 1n,
    objectId: 0n,
    deltaSequence: 0n,
    bodyBytes: 1,
    flags: 0,
  }, new Uint8Array([0x2a]));
  const result = createSuccessResultReply(new Uint8Array([1]));
  await operation.sendResult(result.metadata, result.body);
  assertEquals(resultCount, 1);

  const progressError = await assertRejects(
    () =>
      operation.sendPartialResult({
        operationId: 9n,
        resultSequence: 2n,
        objectId: 0n,
        deltaSequence: 0n,
        bodyBytes: 0,
        flags: 0,
      }),
    NnrpProtocolError,
  );
  assertEquals(progressError.diagnostic.code, "NNRP_SERVER_INCREMENTAL_AFTER_TERMINAL");

  const duplicateError = await assertRejects(
    () => operation.sendResult(createSuccessResultReply(new Uint8Array([2])).metadata, new Uint8Array([2])),
    NnrpProtocolError,
  );
  assertEquals(duplicateError.diagnostic.code, "NNRP_SERVER_RESULT_TERMINAL_DUPLICATE");

  await session.sendTraceContext({
    traceId: 1n,
    spanId: 2n,
    parentSpanId: 3n,
    stageCode: 4,
    flags: 0,
    bodyBytes: 0,
  });
  const dropError = await assertRejects(
    () =>
      operation.sendResultDrop({
        operationId: 9n,
        resultSequence: 3n,
        dropReasonCode: 4,
        sourceRole: RuntimeRole.Server,
        flags: 0,
        diagnosticBytes: 0,
      }),
    NnrpProtocolError,
  );
  assertEquals(dropError.diagnostic.code, "NNRP_SERVER_RESULT_TERMINAL_DUPLICATE");

  const droppedOperation = await session.receiveSubmit();
  await droppedOperation.sendResultDrop({
    operationId: 10n,
    resultSequence: 1n,
    dropReasonCode: 4,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    diagnosticBytes: 1,
  }, new Uint8Array([0x2b]));

  assertEquals(runtimeFrames, [
    NnrpMessageType.Progress,
    NnrpMessageType.PartialResult,
    NnrpMessageType.TraceContext,
    NnrpMessageType.ResultDropReason,
  ]);
  assertEquals(observedHandles, [
    operationHandle,
    operationHandle,
    operationHandle,
    { kind: 3, id: 1n, generation: 1, flags: 0 },
    { kind: 4, id: 901n, generation: 4, flags: 0x5a },
  ]);

  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server receiveSubmit retains skipped runtime and lifecycle events", async () => {
  const runtime = await openBackendRuntime({
    transports: [
      fakeRoleProvider("tcp", {
        events: [
          roleRuntimeEvent(
            NnrpMessageType.Cancel,
            encodeRuntimeControlMetadata(NnrpMessageType.Cancel, {
              operationId: 71n,
              controlSequence: 1n,
              reasonCode: 2,
              sourceRole: RuntimeRole.Client,
              flags: 0,
              diagnosticBytes: 0,
            }),
          ),
          roleLifecycleEvent(71n, 5),
          roleSubmitEvent(72n, 8, { kind: 4, id: 720n, generation: 2, flags: 0x40 }),
        ],
      }),
    ],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({ endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default") });
  const session = await server.accept();

  const operation = await session.receiveSubmit();
  assertEquals(operation.operationId, 72n);
  assertEquals(operation.frameId, 8);
  assertEquals((await session.nextEvent()).type, "runtime");
  assertEquals(await session.nextEvent(), {
    type: "lifecycle",
    event: { operationId: 71n, state: "cancelled" },
  });

  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server reports missing submit ownership from legacy FFI receive", async () => {
  const submit = createTokenSubmitRequest({
    identity: { operationId: 72n, frameId: 8, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload: new Uint8Array() }],
  });
  const runtime = await openBackendRuntime({
    transports: [fakeRoleProvider("tcp")],
    transportPolicy: "force-tcp",
    ffi: {
      mode: "test",
      accept: () => ({ sessionId: 41, activeTransport: "tcp" }),
      receive: () =>
        decodeNnrpRuntimeEvent({
          versionMajor: 1,
          wireFormat: 0,
          messageType: NnrpMessageType.FrameSubmit,
          flags: 0,
          sessionId: 41,
          frameId: 8,
          viewId: 0,
          routeId: 0,
          traceId: 0n,
        }, encodeSubmitPayload(submit)),
    },
  });
  const server = runtime.listen({ endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default") });
  const session = await server.accept();

  const error = await assertRejects(() => session.nextEvent(), NnrpProtocolError);
  assertEquals(error.diagnostic.code, "NNRP_NATIVE_SUBMIT_OPERATION_MISSING");

  await session.close();
  await server.close();
  await runtime.close();
});

Deno.test("@nnrp/native-server exposes frozen high-level response controls", async () => {
  const seen: Array<{
    readonly messageType: NnrpMessageType;
    readonly frameId: number;
    readonly payload: Uint8Array;
  }> = [];
  const runtime = await openBackendRuntime({
    transports: [createTcpTransportProvider({ binding: fakeTransportBinding("tcp") })],
    ffi: {
      mode: "test",
      accept: () => ({ sessionId: 41, activeTransport: "tcp" }),
      sendRuntimeFrame: ({ messageType, frameId, payload }) => {
        seen.push({ messageType, frameId, payload: payload.slice() });
      },
    },
  });
  const session = await runtime.listen({ endpoint: FrozenNnrpEndpoint.parse("nnrp://0.0.0.0:4433/session/default") })
    .accept();
  assertEquals(session.sessionId, 41);
  const one = new Uint8Array([1]);
  const pressure = {
    scopeId: 1n,
    creditWindow: 2n,
    pressureLevel: 3,
    pressureReason: 4,
    retryAfterMs: 5,
    flags: 0,
  } as const;
  await session.sendBackpressure(pressure);
  await session.sendCreditUpdate(pressure);
  await session.sendTraceContext({
    traceId: 1n,
    spanId: 2n,
    parentSpanId: 3n,
    stageCode: 4,
    flags: 0,
    bodyBytes: 1,
  }, one);
  await session.sendRecoverableError({
    errorCode: 1,
    errorScope: ErrorScope.Session,
    recoveryAction: 2,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    retryAfterMs: 3,
    relatedSessionId: 4,
    relatedFrameId: 5,
    relatedViewId: 6,
    diagnosticBytes: 1,
  }, one);
  await session.sendRetryAfter({
    scopeId: 1n,
    controlSequence: 2n,
    retryAfterMs: 3,
    jitterMs: 4,
    reasonCode: 5,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    diagnosticBytes: 1,
  }, one);
  await assertRejects(
    () =>
      session.sendControl(NnrpMessageType.Progress, {
        operationId: 1n,
        progressSequence: 3n,
        stageCode: 4,
        percentX100: 5,
        objectId: 6n,
        bodyBytes: 1,
      }, one),
    NnrpProtocolError,
  );
  await session.declareObject({
    objectId: 1n,
    objectKind: RuntimeObjectKind.Tensor,
    producerRole: RuntimeRole.Server,
    consumerRole: RuntimeRole.Client,
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
    sourceRole: RuntimeRole.Server,
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
    metadataBytes: 1,
  } as const;
  await session.patchObject(delta, one, new Uint8Array([2]));
  await session.sendObjectDelta({ ...delta, deltaSequence: 3n }, one, new Uint8Array([3]));
  await assertRejects(
    () => session.patchObject({ ...delta, deltaSequence: 4n }, new Uint8Array(), new Uint8Array([4, 5])),
    NnrpProtocolError,
    "metadataBody declares 1 bytes but received 2",
  );
  await assertRejects(
    () => session.patchObject({ ...delta, deltaSequence: 4n, deltaBytes: 2 }, one, new Uint8Array([4])),
    NnrpProtocolError,
    "delta declares 2 bytes but received 1",
  );
  await session.referenceCache({
    cacheNamespace: 0,
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
    cacheNamespace: 0,
    cacheKeyHi: 1n,
    cacheKeyLo: 2n,
    missReason: CacheMissReason.NotFound,
    profileId: 3,
    diagnosticBytes: 1,
  }, one);
  await session.invalidateCache({
    invalidateScope: 1,
    cacheNamespace: 2,
    cacheKeyHi: 0n,
    cacheKeyLo: 0n,
    reasonCode: 5,
  });

  assertEquals(seen.map(({ messageType }) => messageType), [
    NnrpMessageType.Backpressure,
    NnrpMessageType.CreditUpdate,
    NnrpMessageType.TraceContext,
    NnrpMessageType.ErrorRecoverable,
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
  assertEquals(seen.map(({ frameId }) => frameId), Array.from({ length: 13 }, (_, index) => index + 1));
  assertEquals(
    decodeRuntimeObjectMetadata(
      NnrpMessageType.ObjectPatch,
      seen.find(({ messageType }) => messageType === NnrpMessageType.ObjectPatch)!.payload,
    ).tail,
    new Uint8Array([2, 1]),
  );
  assertEquals(
    decodeRuntimeObjectMetadata(
      NnrpMessageType.ObjectDelta,
      seen.find(({ messageType }) => messageType === NnrpMessageType.ObjectDelta)!.payload,
    ).tail,
    new Uint8Array([3, 1]),
  );
});

Deno.test("@nnrp/native-server releases operation-owned objects on peer cancellation", async () => {
  const runtimeFrames: Array<{ readonly messageType: NnrpMessageType; readonly payload: Uint8Array }> = [];
  const events = [
    roleRuntimeEvent(
      NnrpMessageType.Cancel,
      encodeRuntimeControlMetadata(NnrpMessageType.Cancel, {
        operationId: 7n,
        controlSequence: 1n,
        reasonCode: 2,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      }),
    ),
  ];
  const runtime = await openBackendRuntime({
    transports: [
      createTcpTransportProvider({
        binding: roleServerBinding(events, {
          onRuntimeFrame: (_handle, messageType, payload) =>
            runtimeFrames.push({
              messageType: messageType as NnrpMessageType,
              payload,
            }),
        }),
      }),
    ],
    transportPolicy: "force-tcp",
  });
  const server = runtime.listen({ endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1:4433/session/default") });
  const session = await server.accept();
  const reference = {
    objectId: 51n,
    operationId: 7n,
    objectVersion: 2n,
    offset: 0n,
    length: 4n,
    flags: 0,
    metadataBytes: 0,
  } as const;

  await assertRejects(() => session.referenceObject(reference), NnrpProtocolError, "has not been declared");
  await session.declareObject({
    objectId: 51n,
    objectKind: RuntimeObjectKind.Tensor,
    producerRole: RuntimeRole.Server,
    consumerRole: RuntimeRole.Client,
    sessionId: 1,
    byteSize: 4n,
    computeCostUnits: 1,
    memoryLocationHint: MemoryLocationHint.HostMemory,
    ownershipHint: OwnershipHint.ReleaseOnDrop,
    lifetimeHintMs: 1_000,
    metadataBytes: 0,
  });
  await session.referenceObject(reference);
  await assertRejects(
    () => session.referenceObject({ ...reference, objectVersion: 1n }),
    NnrpProtocolError,
    "version 1 is older than 2",
  );
  const delta = {
    objectId: 51n,
    deltaSequence: 1n,
    regionOffset: 0n,
    regionBytes: 4,
    deltaBytes: 4,
    flags: 0,
    metadataBytes: 0,
  } as const;
  await session.patchObject(delta, new Uint8Array(4));
  await assertRejects(
    () => session.sendObjectDelta(delta, new Uint8Array(4)),
    NnrpProtocolError,
    "does not advance 1",
  );

  assertEquals((await receiveRuntimeEvent(session)).metadata.type, "control_request");
  assertEquals(runtimeFrames.map(({ messageType }) => messageType), [
    NnrpMessageType.ObjectDeclare,
    NnrpMessageType.ObjectRef,
    NnrpMessageType.ObjectPatch,
    NnrpMessageType.ObjectRelease,
  ]);
  const release = decodeRuntimeObjectMetadata(NnrpMessageType.ObjectRelease, runtimeFrames.at(-1)!.payload).metadata;
  assertEquals(release, {
    objectId: 51n,
    operationId: 7n,
    releaseReason: ObjectReleaseReason.Cancelled,
    sourceRole: RuntimeRole.Server,
    flags: 0,
    diagnosticBytes: 0,
  });
  assertEquals(runtimeFrames.some(({ messageType }) => messageType === NnrpMessageType.CacheInvalidate), false);
  await assertRejects(() => session.referenceObject(reference), NnrpProtocolError, "was already released");

  await session.close();
  await server.close();
  await runtime.close();
});

function roleRuntimeEvent(messageType: NnrpMessageType, payload: Uint8Array) {
  return {
    kind: 13,
    headerPresent: true,
    messageType,
    versionMajor: 1,
    wireFormat: 0,
    headerFlags: 0,
    wireSessionId: 1,
    connection: { kind: 1, id: 1n, generation: 1, flags: 0 },
    session: { kind: 3, id: 1n, generation: 1, flags: 0 },
    operation: { kind: 4, id: 1n, generation: 1, flags: 0 },
    relatedOperationId: 1n,
    relatedFrameId: 1,
    frameId: 1,
    viewId: 0,
    routeId: 0,
    traceId: 0n,
    payload,
  };
}

function roleSubmitEvent(
  operationId: bigint,
  frameId: number,
  operation = { kind: 4, id: operationId, generation: 1, flags: 0 },
) {
  const payload = encodeSubmitPayload(createTokenSubmitRequest({
    identity: { operationId, frameId, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload: new Uint8Array() }],
  }));
  return {
    ...roleRuntimeEvent(NnrpMessageType.FrameSubmit, payload),
    kind: 5,
    frameId,
    operation,
  };
}

function roleLifecycleEvent(operationId: bigint, state: number) {
  return {
    ...roleRuntimeEvent(NnrpMessageType.FrameSubmit, new Uint8Array([state])),
    kind: 14,
    headerPresent: false,
    relatedOperationId: operationId,
    payload: new Uint8Array([state]),
  };
}

function fakeRoleProvider(
  kind: NnrpTransportKind,
  options: {
    readonly listened?: NnrpTransportKind[];
    readonly accepted?: NnrpTransportKind[];
    readonly closed?: NnrpTransportKind[];
    readonly closeError?: Error;
    readonly acceptError?: Error;
    readonly preferenceRank?: number;
    readonly onListen?: (options: NnrpTransportEndpoint) => void;
    readonly onAdopt?: (options: ObservedServerRoleOptions) => void;
    readonly onAccept?: (timeoutMs: number) => void;
    readonly sessionId?: number;
    readonly events?: ReturnType<typeof roleRuntimeEvent>[];
  } = {},
): NnrpNativeTransportProvider {
  const metadata = {
    id: `test-${kind}`,
    cost: { modelId: 0, units: 0n },
    preferenceRank: options.preferenceRank ?? 0,
    limits: { maxFrameBytes: 64n * 1024n * 1024n },
    limitations: [] as const,
  };
  return {
    kind,
    descriptor: {
      name: `@nnrp/transport-${kind}`,
      version: "test",
      transportId: kind,
      kind: "native-dynamic",
      available: true,
      metadata,
    },
    endpointSchemes: ["nnrp", "nnrps"],
    localAvailable: true,
    metadata,
    probe: () =>
      Promise.resolve({
        sampleCount: 1,
        successCount: 1,
        medianRttMicroseconds: 1n,
        medianThroughputBytesPerSecond: 1n,
      }),
    listen: (listenOptions) => {
      const { endpoint } = listenOptions;
      options.onListen?.(listenOptions);
      options.listened?.push(kind);
      if (options.closeError !== undefined) return Promise.reject(options.closeError);
      return Promise.resolve({
        kind,
        endpoint: String(endpoint),
        listening: true,
        accept: () => Promise.reject(new Error("carrier accept must be transferred to the server role")),
        close: () => {},
        [SERVER_ROLE_ADOPT]: (_serverId: bigint, _generation: number, roleOptions: ObservedServerRoleOptions) => {
          options.onAdopt?.(roleOptions);
          return Promise.resolve({
            accept: (_sessionId: bigint, _sessionGeneration: number, timeoutMs: number) => {
              options.onAccept?.(timeoutMs);
              options.accepted?.push(kind);
              if (options.acceptError !== undefined) return Promise.reject(options.acceptError);
              return Promise.resolve({
                handle: { kind: 3, id: kind === "quic" ? 1n : 2n, generation: 1, flags: 0 },
                sessionId: options.sessionId ?? (kind === "quic" ? 41 : 42),
                poll: () => Promise.resolve(options.events?.splice(0, 1) ?? []),
                sendResult: () => Promise.resolve(),
                sendRuntimeFrame: () => Promise.resolve(),
                close: () => Promise.resolve(),
              });
            },
            close: () => {
              options.closed?.push(kind);
              return Promise.resolve();
            },
          });
        },
      } as NnrpTransportServer);
    },
  };
}

function testServerSecurity(seed = 1) {
  return {
    mode: "server",
    certificateDer: new Uint8Array([seed, seed + 1, seed + 2]),
    privateKeyPkcs8Der: new Uint8Array([seed + 3, seed + 4, seed + 5]),
  } as const;
}

function roleServerBinding(
  events: ReturnType<typeof roleRuntimeEvent>[],
  callbacks: {
    readonly onResult?: (handle: { kind: number; id: bigint; generation: number; flags: number }) => void;
    readonly onRuntimeFrame?: (
      handle: { kind: number; id: bigint; generation: number; flags: number },
      messageType: number,
      payload: Uint8Array,
    ) => void;
  } = {},
): NnrpNativeTransportBinding {
  return {
    ...fakeTransportBinding("tcp"),
    listen: ({ endpoint }) =>
      Promise.resolve({
        kind: "tcp",
        endpoint: String(endpoint),
        listening: true,
        accept: () => Promise.reject(new Error("carrier accept must be transferred to the server role")),
        close: () => {},
        [SERVER_ROLE_ADOPT]: () =>
          Promise.resolve({
            accept: () =>
              Promise.resolve({
                handle: { kind: 3, id: 1n, generation: 1, flags: 0 },
                sessionId: 51,
                poll: () => Promise.resolve(events.splice(0, 1)),
                sendResult: (handle: { kind: number; id: bigint; generation: number; flags: number }) => {
                  callbacks.onResult?.(handle);
                  return Promise.resolve();
                },
                sendRuntimeFrame: (
                  _handle: { kind: number; id: bigint; generation: number; flags: number },
                  messageType: number,
                  _frameId: number,
                  payload: Uint8Array,
                ) => {
                  callbacks.onRuntimeFrame?.(_handle, messageType, payload);
                  return Promise.resolve();
                },
                close: () => Promise.resolve(),
              }),
            close: () => Promise.resolve(),
          }),
      } as NnrpTransportServer),
  };
}

function fakeTransportBinding(kind: "tcp" | "quic"): NnrpNativeTransportBinding {
  return {
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
        kind,
        endpoint: String(endpoint),
        connected: true,
        send: () => Promise.resolve(),
        receive: () => Promise.resolve([]),
        close: () => {},
      }),
    listen: ({ endpoint }) =>
      Promise.resolve({
        kind,
        endpoint: String(endpoint),
        listening: true,
        accept: async () => await fakeTransportBinding(kind).connect({ endpoint }),
        close: () => {},
      }),
  };
}

function preview4RuntimeCapabilities(): NnrpNativeRuntimeCapabilities {
  return {
    abiMajor: 4,
    abiMinor: 4,
    abiPatch: 0,
    protocolMajor: 1,
    protocolWireFormat: 0,
    sdkMajor: 1,
    sdkMinor: 0,
    sdkPatch: 0,
    sdkChannel: 4,
    sdkRevision: 8,
    transportSlots: 0x00000002,
    featureFlags: 0xffffffffffffffffn,
  };
}
