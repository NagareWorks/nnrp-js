import {
  type BudgetMetadata,
  type CacheInvalidateMetadata,
  type CacheMissMetadata,
  type CacheReferenceMetadata,
  type CapabilityMetadata,
  type ControlRequestMetadata,
  createCapabilityManifest,
  createTransportCandidates,
  createTransportSelectionSummary,
  decodeCacheInvalidateMetadata,
  decodeRuntimeControlMetadata,
  decodeRuntimeObjectMetadata,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  type NnrpAbortSignalLike,
  type NnrpCapability,
  NnrpCapabilityError,
  type NnrpCapabilityManifest,
  type NnrpDiagnostic,
  type NnrpEventPollOptions,
  type NnrpInputProfile,
  NnrpMessageType,
  type NnrpNormalizedSubmitRequest,
  NnrpProtocolError,
  NnrpRecoveryError,
  type NnrpResult,
  type NnrpRuntimeEvent,
  type NnrpRuntimeFrameEvent,
  type NnrpSessionFlowControlOptions,
  type NnrpSessionMigrationRequest,
  type NnrpSessionPatchRequest,
  type NnrpSessionPatchResult,
  type NnrpSubmitOptions,
  type NnrpSubmitRequest,
  NnrpTimeoutError,
  type NnrpTransportCandidate,
  type NnrpTransportClientSecurity,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  type NnrpTransportProbeMetrics,
  type NnrpTransportProbeOptions,
  type NnrpTransportProvider,
  type NnrpTransportSelectionSummary,
  normalizeSessionMigrationRequest,
  normalizeSessionPatchRequest,
  normalizeSubmitRequest,
  type ObjectDeltaMetadata,
  type ObjectDescriptorMetadata,
  type ObjectReferenceMetadata,
  type ObjectReleaseMetadata,
  type PressureMetadata,
  resolveProviderEndpoint,
  type RouteHintMetadata,
  type RuntimeControlMetadata,
  RuntimeRole,
  type SchedulingMetadata,
  selectTransport,
  type SupersedeMetadata,
  throwIfResultDrop,
  type TraceContextMetadata,
  validateEventPollOptions,
  validateSessionMetadata,
} from "@nnrp/core";
const EXPECTED_PROTOCOL_MAJOR = 1;
const EXPECTED_PROTOCOL_WIRE_FORMAT = 0;
const EXPECTED_ABI_MAJOR = 3;
const EXPECTED_ABI_MINOR = 0;
const EXPECTED_ABI_PATCH = 0;
const NATIVE_RUNTIME_CAPABILITIES = [
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
] as const;
const RUNTIME_FEATURE_PROTOCOL_CORE = 0x0000000000000001n;
const RUNTIME_FEATURE_CLIENT_API = 0x0000000000000002n;
const RUNTIME_FEATURE_EVENT_POLLING = 0x0000000000000008n;
const RUNTIME_FEATURE_CALLBACK_DISPATCH = 0x0000000000000010n;
const RUNTIME_FEATURE_CACHE_SCHEMA = 0x0000000000000020n;
const RUNTIME_FEATURE_RECOVERY = 0x0000000000000040n;
const RUNTIME_FEATURE_TYPED_PAYLOAD = 0x0000000000000080n;
const RUNTIME_FEATURE_TRANSPORT_SLOTS = 0x0000000000000100n;
const RUNTIME_FEATURE_BATCH_POLLING = 0x0000000000000200n;
const RUNTIME_FEATURE_CACHE_LEASE_OPS = 0x0000000000000400n;
const RUNTIME_FEATURE_SCHEMA_REGISTRY_HANDLES = 0x0000000000000800n;
const RUNTIME_FEATURE_BUFFER_HANDLES = 0x0000000000001000n;
const RUNTIME_FEATURE_EXECUTABLE_RESUME = 0x0000000000002000n;
const RUNTIME_FEATURE_PREVIEW4_RUNTIME_FRAME_SEND = 0x0000000000080000n;
const REQUIRED_RUNTIME_FEATURES = RUNTIME_FEATURE_PROTOCOL_CORE |
  RUNTIME_FEATURE_CLIENT_API |
  RUNTIME_FEATURE_EVENT_POLLING |
  RUNTIME_FEATURE_CALLBACK_DISPATCH |
  RUNTIME_FEATURE_CACHE_SCHEMA |
  RUNTIME_FEATURE_RECOVERY |
  RUNTIME_FEATURE_TYPED_PAYLOAD |
  RUNTIME_FEATURE_TRANSPORT_SLOTS |
  RUNTIME_FEATURE_BATCH_POLLING |
  RUNTIME_FEATURE_CACHE_LEASE_OPS |
  RUNTIME_FEATURE_SCHEMA_REGISTRY_HANDLES |
  RUNTIME_FEATURE_BUFFER_HANDLES |
  RUNTIME_FEATURE_EXECUTABLE_RESUME |
  RUNTIME_FEATURE_PREVIEW4_RUNTIME_FRAME_SEND;
const CLIENT_ROLE_ADOPT = Symbol.for("nnrp.internal.native.client-role-adopt.v1");
const NATIVE_ROLE_IDS = Symbol.for("nnrp.internal.native.role-handle-ids.v1");
const FRAME_SUBMIT_METADATA_SIZE = 72;
const RESULT_PUSH_METADATA_SIZE = 64;
const EVENT_KIND_RESULT_PUSHED = 6;
const EVENT_KIND_RESULT_DROPPED = 7;
const EVENT_KIND_RUNTIME_FRAME = 13;
const EVENT_KIND_SESSION_CLOSED = 4;

const clientRoleSessionClosers = new WeakMap<NnrpBackendRuntime, (sessionId: string) => Promise<void>>();

interface InternalNativeHandle {
  readonly kind: number;
  readonly id: bigint | number;
  readonly generation: number;
  readonly flags: number;
}

interface InternalRoleEvent {
  readonly kind: number;
  readonly messageType: number;
  readonly connection: InternalNativeHandle;
  readonly session: InternalNativeHandle;
  readonly operation: InternalNativeHandle;
  readonly frameId: number;
  readonly payload: Uint8Array;
}

interface InternalClientRoleSession {
  readonly handle: InternalNativeHandle;
  submit(operationId: bigint, frameId: number, payload: Uint8Array): Promise<InternalNativeHandle>;
  poll(maxEvents: number, timeoutMillis: number): Promise<readonly InternalRoleEvent[]>;
  sendRuntimeFrame(messageType: number, frameId: number, payload: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface InternalClientRoleConnection {
  openSession(
    requestedSessionId: number,
    generation: number,
    profileId: number,
    schemaId: number,
    schemaVersion: number,
  ): Promise<InternalClientRoleSession>;
  close(): Promise<void>;
}

interface InternalRoleCarrier {
  [CLIENT_ROLE_ADOPT](connectionId: bigint, generation: number): Promise<InternalClientRoleConnection>;
}

interface NativeRoleIdState {
  connection: bigint;
  session: bigint;
}

export interface NnrpNativeRuntimeCapabilities {
  readonly abiMajor: number;
  readonly abiMinor: number;
  readonly abiPatch: number;
  readonly protocolMajor: number;
  readonly protocolWireFormat: number;
  readonly sdkMajor: number;
  readonly sdkMinor: number;
  readonly sdkPatch: number;
  readonly sdkChannel: number;
  readonly sdkRevision: number;
  readonly transportSlots: number;
  readonly featureFlags: bigint;
}

export interface NnrpNativeSubmitResultCompactRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly submit: NnrpNormalizedSubmitRequest;
  readonly resultPayload?: Uint8Array;
  readonly maxEvents?: number;
}

export interface NnrpNativeSubmitNoWaitRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly submit: NnrpNormalizedSubmitRequest;
}

export interface NnrpNativeSubmitValidationRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly submit: NnrpNormalizedSubmitRequest;
}

export interface NnrpNativeRuntimeFrameSendRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly messageType: NnrpMessageType;
  readonly frameId: number;
  readonly payload: Uint8Array;
}

export interface NnrpNativeSessionPatchRequest {
  readonly sessionOptions: NnrpSessionOptions;
  readonly patch: NnrpSessionPatchRequest;
}

export interface NnrpNativeEventBatchRequest {
  readonly maxEvents: number;
  readonly timeoutMillis?: number;
}

export interface NnrpNativeFfiBinding {
  readonly mode?: "native-addon" | "node-ffi" | "deno-ffi" | "nano-ffi" | "test";
  runtimeCapabilities?(): NnrpNativeRuntimeCapabilities | Promise<NnrpNativeRuntimeCapabilities>;
  validateSubmit?(
    request: NnrpNativeSubmitValidationRequest,
  ): NnrpNormalizedSubmitRequest | void | Promise<NnrpNormalizedSubmitRequest | void>;
  submitResultCompact?(request: NnrpNativeSubmitResultCompactRequest): NnrpResult | Promise<NnrpResult>;
  submitNoWait?(request: NnrpNativeSubmitNoWaitRequest): bigint | Promise<bigint>;
  sendRuntimeFrame?(request: NnrpNativeRuntimeFrameSendRequest): void | Promise<void>;
  patchSession?(
    request: NnrpNativeSessionPatchRequest,
  ): NnrpSessionPatchResult | void | Promise<NnrpSessionPatchResult | void>;
  awaitEvents?(
    request: NnrpNativeEventBatchRequest,
  ): readonly NnrpRuntimeEvent[] | Promise<readonly NnrpRuntimeEvent[]>;
  close?(): void | Promise<void>;
}

export interface NnrpSessionOptions extends NnrpSessionFlowControlOptions {
  readonly sessionId?: string;
  readonly inputProfile?: NnrpInputProfile;
  readonly targetCadence?: number;
  readonly qualityTier?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpNativeClientOptions {
  readonly endpoint: string | URL;
  readonly providerEndpoint?: string | URL;
  readonly security?: NnrpTransportClientSecurity;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
  readonly ffi?: NnrpNativeFfiBinding;
}

interface NnrpBackendRuntimeOptions {
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly ffi?: NnrpNativeFfiBinding;
}

export interface NnrpConnectOptions {
  readonly endpoint: string | URL;
  readonly providerEndpoint?: string | URL;
  readonly security?: NnrpTransportClientSecurity;
  readonly transports?: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy?: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
}

export interface NnrpNativeTransportProvider extends NnrpTransportProvider {
  readonly kind: NnrpTransportKind;
  probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
  connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
}

export interface NnrpTransportSelectionOptions {
  readonly peerManifest: NnrpCapabilityManifest;
  readonly providers?: readonly NnrpNativeTransportProvider[];
  readonly policy?: NnrpTransportPolicy;
  readonly requestedMaxFrameBytes?: bigint;
  readonly probeMetricsByProviderId?: Readonly<Record<string, NnrpTransportProbeMetrics>>;
}

export interface NnrpNativeRuntimeBinding {
  readonly manifest: NnrpCapabilityManifest;
  readonly ffi?: NnrpNativeFfiBinding;
  readonly runtimeCapabilities?: NnrpNativeRuntimeCapabilities;
}

export class NnrpNativeBindingUnavailableError extends NnrpCapabilityError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpNativeBindingUnavailableError";
  }
}

export async function openNativeClient(options: NnrpNativeClientOptions): Promise<NnrpClient> {
  const runtime = await openBackendRuntime(options);

  try {
    return await runtime.connect({
      endpoint: options.endpoint,
      ...(options.providerEndpoint === undefined ? {} : { providerEndpoint: options.providerEndpoint }),
      ...(options.security === undefined ? {} : { security: options.security }),
      ...(options.transportPolicy === undefined ? {} : { transportPolicy: options.transportPolicy }),
      ...(options.sessionDefaults === undefined ? {} : { sessionDefaults: options.sessionDefaults }),
    });
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

async function openBackendRuntime(options: NnrpBackendRuntimeOptions = {}): Promise<NnrpBackendRuntime> {
  const transportProviders = options.transports ?? await discoverNativeTransportProviders();
  const binding = createNativeRuntimeBinding(options.ffi, transportKinds(transportProviders));
  const runtimeCapabilities = await resolveRuntimeCapabilities(binding);
  return new NnrpBackendRuntime(
    {
      ...binding,
      ...(runtimeCapabilities === undefined ? {} : {
        manifest: createNativeRuntimeManifest(transportKinds(transportProviders)),
        runtimeCapabilities,
      }),
    },
    options.transportPolicy ?? "auto",
    transportProviders,
  );
}

class NnrpBackendRuntime {
  readonly #binding: NnrpNativeRuntimeBinding;
  readonly #transportPolicy: NnrpTransportPolicy;
  readonly #transportProviders: readonly NnrpNativeTransportProvider[];
  #closed = false;
  #roleConnection: InternalClientRoleConnection | undefined;
  readonly #roleSessions = new Map<string, Promise<InternalClientRoleSession>>();

  public constructor(
    binding: NnrpNativeRuntimeBinding,
    transportPolicy: NnrpTransportPolicy = "auto",
    transportProviders: readonly NnrpNativeTransportProvider[] = [],
  ) {
    this.#binding = binding;
    this.#transportPolicy = transportPolicy;
    this.#transportProviders = [...transportProviders];
    clientRoleSessionClosers.set(this, (sessionId) => this.#closeRoleSession(sessionId));
  }

  public get manifest(): NnrpCapabilityManifest {
    return this.#binding.manifest;
  }

  public get runtimeCapabilities(): NnrpNativeRuntimeCapabilities | undefined {
    return this.#binding.runtimeCapabilities;
  }

  public get bindingMode(): string {
    return this.#binding.ffi?.mode ?? "unbound";
  }

  public async submitResultCompact(request: NnrpNativeSubmitResultCompactRequest): Promise<NnrpResult> {
    this.#ensureOpen();
    const submitResultCompact = this.#binding.ffi?.submitResultCompact;
    if (submitResultCompact !== undefined) {
      return await submitResultCompact(await this.#validateSubmit(request));
    }
    const validated = await this.#validateSubmit(request);
    const session = await this.#roleSession(validated.sessionOptions);
    await session.submit(
      validated.submit.operationId,
      validated.submit.frameId,
      encodeFrameSubmitPayload(validated.submit),
    );
    while (true) {
      const events = await session.poll(Math.max(validated.maxEvents ?? 1, 1), 1);
      const result = events.map((event) => decodeClientRoleEvent(event, validated.sessionOptions.sessionId)).find(
        (event): event is Extract<NnrpRuntimeEvent, { readonly type: "result" }> =>
          event.type === "result" &&
          event.result.frameId === validated.submit.frameId,
      );
      if (result !== undefined) return result.result;
    }
  }

  public async submitNoWait(request: NnrpNativeSubmitNoWaitRequest): Promise<bigint> {
    this.#ensureOpen();
    const submitNoWait = this.#binding.ffi?.submitNoWait;
    if (submitNoWait !== undefined) {
      return await submitNoWait(await this.#validateSubmit(request));
    }
    const validated = await this.#validateSubmit(request);
    const session = await this.#roleSession(validated.sessionOptions);
    await session.submit(
      validated.submit.operationId,
      validated.submit.frameId,
      encodeFrameSubmitPayload(validated.submit),
    );
    return validated.submit.operationId;
  }

  public sendRuntimeFrame(request: NnrpNativeRuntimeFrameSendRequest): Promise<void> {
    this.#ensureOpen();
    const sendRuntimeFrame = this.#binding.ffi?.sendRuntimeFrame;
    if (sendRuntimeFrame !== undefined) {
      return Promise.resolve(sendRuntimeFrame(request));
    }
    return this.#roleSession(request.sessionOptions).then((session) =>
      session.sendRuntimeFrame(request.messageType, request.frameId, request.payload)
    );
  }

  public async patchSession(request: NnrpNativeSessionPatchRequest): Promise<NnrpSessionPatchResult> {
    this.#ensureOpen();
    const patchSession = this.#binding.ffi?.patchSession;
    if (patchSession === undefined) {
      throw bindingNotConnectedError("patchSession");
    }

    return await patchSession(request) ?? {
      accepted: true,
      ...(request.sessionOptions.sessionId === undefined ? {} : { sessionId: request.sessionOptions.sessionId }),
    };
  }

  public async awaitEvents(request: NnrpNativeEventBatchRequest): Promise<readonly NnrpRuntimeEvent[]> {
    this.#ensureOpen();
    const awaitEvents = this.#binding.ffi?.awaitEvents;
    if (awaitEvents !== undefined) {
      return await awaitEvents(request);
    }
    const events: NnrpRuntimeEvent[] = [];
    for (const [sessionId, pendingSession] of this.#roleSessions) {
      if (events.length >= request.maxEvents) break;
      const session = await pendingSession;
      const polled = await session.poll(
        request.maxEvents - events.length,
        request.timeoutMillis ?? 0,
      );
      events.push(...polled.map((event) => decodeClientRoleEvent(event, sessionId)));
    }
    return events;
  }

  public async connect(options: NnrpConnectOptions): Promise<NnrpClient> {
    this.#ensureOpen();
    this.#ensureConnectReady("connect");
    validateEndpoint(options.endpoint);
    validateTransportProvidersForPolicy(
      options.transports ?? this.#transportProviders,
      options.transportPolicy ?? this.#transportPolicy,
    );

    if (this.#binding.ffi === undefined) {
      this.#roleConnection = await connectClientRole(
        options.endpoint,
        options.providerEndpoint,
        options.security,
        options.transports ?? this.#transportProviders,
        options.transportPolicy ?? this.#transportPolicy,
      );
    }

    return new NnrpClient({
      endpoint: normalizeEndpoint(options.endpoint),
      runtime: this,
      transports: options.transports ?? this.#transportProviders,
      transportPolicy: options.transportPolicy ?? this.#transportPolicy,
      ...(options.sessionDefaults === undefined ? {} : { sessionDefaults: options.sessionDefaults }),
    });
  }

  public selectTransport(options: NnrpTransportSelectionOptions): NnrpTransportSelectionSummary {
    this.#ensureOpen();

    return createTransportSelectionSummary(
      selectTransport(
        this.#createTransportCandidates(options),
        options.policy ?? this.#transportPolicy,
      ),
    );
  }

  public async close(): Promise<void> {
    this.#closed = true;
    await Promise.all((await Promise.all(this.#roleSessions.values())).map(async (session) => await session.close()));
    if (this.#roleConnection !== undefined) await this.#roleConnection.close();
    await this.#binding.ffi?.close?.();
  }

  public get closed(): boolean {
    return this.#closed;
  }

  #ensureOpen(): void {
    if (this.#closed) {
      throw closedError("runtime");
    }
  }

  #ensureConnectReady(operation: "connect"): void {
    if (this.#binding.manifest.buildMode !== "backend-native") {
      throw nativeRuntimeReadinessError(
        "NNRP_NATIVE_RUNTIME_MANIFEST_INVALID",
        `Native runtime ${operation} requires a backend-native capability manifest.`,
      );
    }
  }

  async #validateSubmit<TRequest extends NnrpNativeSubmitValidationRequest>(request: TRequest): Promise<TRequest> {
    const validateSubmit = this.#binding.ffi?.validateSubmit;
    if (validateSubmit === undefined) {
      return request;
    }

    const validated = await validateSubmit(request);
    if (validated === undefined) {
      return request;
    }

    return {
      ...request,
      submit: validated,
    };
  }

  #roleSession(options: NnrpSessionOptions): Promise<InternalClientRoleSession> {
    const connection = this.#roleConnection;
    if (connection === undefined) throw bindingNotConnectedError("clientRole");
    const sessionId = options.sessionId ?? "native-session";
    let session = this.#roleSessions.get(sessionId);
    if (session !== undefined) return session;
    const numericSessionId = Number(allocateNativeRoleId("session", 0xffff_ffffn));
    const schema = standardProfileSchema(options.inputProfile);
    session = connection.openSession(
      numericSessionId,
      1,
      standardProfileId(options.inputProfile),
      schema.id,
      schema.version,
    );
    this.#roleSessions.set(sessionId, session);
    return session;
  }

  async #closeRoleSession(sessionId: string): Promise<void> {
    const session = this.#roleSessions.get(sessionId);
    if (session === undefined) return;
    this.#roleSessions.delete(sessionId);
    await (await session).close();
  }

  #createTransportCandidates(options: NnrpTransportSelectionOptions): readonly NnrpTransportCandidate[] {
    const providers = options.providers ?? this.#transportProviders;
    return createTransportCandidates({
      local: { ...this.#binding.manifest, transports: providers.map((provider) => provider.kind) },
      peer: options.peerManifest,
      providers,
      ...(options.requestedMaxFrameBytes === undefined
        ? {}
        : { requestedMaxFrameBytes: options.requestedMaxFrameBytes }),
      ...(options.probeMetricsByProviderId === undefined
        ? {}
        : { probeMetricsByProviderId: options.probeMetricsByProviderId }),
    });
  }
}

async function discoverNativeTransportProviders(): Promise<readonly NnrpNativeTransportProvider[]> {
  const providers: NnrpNativeTransportProvider[] = [];
  const tcp = await importOptionalTransportModule("@nnrp/transport-tcp");
  const quic = await importOptionalTransportModule("@nnrp/transport-quic");
  const ipc = await importOptionalTransportModule("@nnrp/transport-ipc");
  const websocket = await importOptionalTransportModule("@nnrp/transport-websocket");

  if (isTransportFactory(tcp?.createTcpTransportProvider)) {
    providers.push(tcp.createTcpTransportProvider());
  }
  if (isTransportFactory(quic?.createQuicTransportProvider)) {
    providers.push(quic.createQuicTransportProvider());
  }
  if (isTransportFactory(ipc?.createIpcTransportProvider)) {
    providers.push(ipc.createIpcTransportProvider());
  }
  if (isTransportFactory(websocket?.createWebSocketTransportProvider)) {
    providers.push(websocket.createWebSocketTransportProvider());
  }

  return providers;
}

async function importOptionalTransportModule(specifier: string): Promise<Record<string, unknown> | undefined> {
  try {
    return await import(specifier) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function isTransportFactory(value: unknown): value is () => NnrpNativeTransportProvider {
  return typeof value === "function";
}

function validateTransportProvidersForPolicy(
  providers: readonly NnrpNativeTransportProvider[],
  policy: NnrpTransportPolicy,
): void {
  if (providers.length === 0) {
    throw new NnrpCapabilityError({
      code: "NNRP_NATIVE_TRANSPORT_PROVIDER_MISSING",
      message: "At least one native transport provider package or explicit provider is required.",
      source: "transport",
      retryable: false,
    });
  }

  const forcedKind = forcedTransportKind(policy);
  if (forcedKind !== undefined && !providers.some((provider) => provider.kind === forcedKind)) {
    throw new NnrpTransportError({
      code: "NNRP_NATIVE_TRANSPORT_POLICY_UNSATISFIED",
      message: `${policy} transport policy requires an installed or explicit ${forcedKind} provider.`,
      source: "transport",
      retryable: false,
      transport: forcedKind,
    });
  }
}

function forcedTransportKind(policy: NnrpTransportPolicy): NnrpTransportKind | undefined {
  return policy.startsWith("force-") ? policy.slice("force-".length) as NnrpTransportKind : undefined;
}

async function connectClientRole(
  endpoint: string | URL,
  providerEndpoint: string | URL | undefined,
  security: NnrpTransportClientSecurity | undefined,
  providers: readonly NnrpNativeTransportProvider[],
  policy: NnrpTransportPolicy,
): Promise<InternalClientRoleConnection> {
  const provider = await selectClientProvider(endpoint, providerEndpoint, security, providers, policy);
  const carrier = await provider.connect({
    endpoint: resolveProviderEndpoint(endpoint, provider.kind, providerEndpoint),
    ...(security === undefined ? {} : { security }),
  });
  const adoption = (carrier as NnrpTransportConnection & Partial<InternalRoleCarrier>)[CLIENT_ROLE_ADOPT];
  if (typeof adoption !== "function") {
    await carrier.close();
    throw new NnrpCapabilityError({
      code: "NNRP_NATIVE_ROLE_ADOPTION_UNAVAILABLE",
      message: `${provider.kind} provider does not expose its package-owned client role adoption path.`,
      source: "native",
      retryable: false,
      transport: provider.kind,
    });
  }
  try {
    return await adoption.call(carrier, allocateNativeRoleId("connection"), 1);
  } catch (error) {
    await carrier.close();
    throw error;
  }
}

function allocateNativeRoleId(kind: keyof NativeRoleIdState, maximum = 0xffff_ffff_ffff_ffffn): bigint {
  const root = globalThis as typeof globalThis & { [NATIVE_ROLE_IDS]?: NativeRoleIdState };
  const state = root[NATIVE_ROLE_IDS] ??= { connection: 1n, session: 1n };
  const id = state[kind];
  if (id > maximum) throw new RangeError(`Native ${kind} handle id space is exhausted.`);
  state[kind] = id + 1n;
  return id;
}

async function selectClientProvider(
  endpoint: string | URL,
  providerEndpoint: string | URL | undefined,
  security: NnrpTransportClientSecurity | undefined,
  providers: readonly NnrpNativeTransportProvider[],
  policy: NnrpTransportPolicy,
): Promise<NnrpNativeTransportProvider> {
  const available = providers.filter((provider) => provider.localAvailable);
  const forced = forcedTransportKind(policy);
  if (forced !== undefined) {
    const selected = available.find((provider) => provider.kind === forced);
    if (selected !== undefined) return selected;
  }
  if (available.length === 1) return available[0]!;
  const samples = await Promise.all(available.map(async (provider) => {
    try {
      const metrics = await provider.probe({
        endpoint: resolveProviderEndpoint(endpoint, provider.kind, providerEndpoint),
        ...(security === undefined ? {} : { security }),
        sampleCount: 3,
        payloadBytes: 64,
        timeoutMillis: 1_000,
      });
      return { provider, metrics };
    } catch {
      return { provider };
    }
  }));
  const transports = available.map((provider) => provider.kind);
  const manifest = createCapabilityManifest({ buildMode: "backend-native", transports });
  const probeMetricsByProviderId = Object.fromEntries(
    samples.flatMap(({ provider, metrics }) => metrics === undefined ? [] : [[provider.metadata.id, metrics]]),
  );
  const selection = selectTransport(
    createTransportCandidates({
      local: manifest,
      peer: manifest,
      providers: available,
      probeMetricsByProviderId,
    }),
    policy,
  );
  const selected = available.find((provider) => provider.metadata.id === selection.selected?.provider.id);
  if (selected === undefined) throw bindingNotConnectedError("transportSelection");
  return selected;
}

function standardProfileId(profile: NnrpInputProfile | undefined): number {
  if (profile === "tensor") return 1;
  if (profile === "token") return 2;
  return 0;
}

function standardProfileSchema(
  profile: NnrpInputProfile | undefined,
): { readonly id: number; readonly version: number } {
  return profile === "token" ? { id: 0x0000_1001, version: 3 } : { id: 0, version: 0 };
}

function encodeFrameSubmitPayload(submit: NnrpNormalizedSubmitRequest): Uint8Array {
  const bodyParts = submit.tensors?.map((tensor) => tensor.payload) ??
    (submit.payload === undefined ? [] : [submit.payload]);
  const bodyBytes = bodyParts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(FRAME_SUBMIT_METADATA_SIZE + bodyBytes);
  const view = new DataView(output.buffer);
  view.setUint16(10, submit.tensors?.length ?? 0, true);
  view.setBigUint64(40, submit.operationId, true);
  view.setUint8(52, submit.submitMode === "object-reference" ? 1 : 0);
  view.setUint8(54, 0xff);
  view.setUint32(64, payloadKind(submit), true);
  view.setUint16(68, Math.max(bodyParts.length, 1), true);
  let offset = FRAME_SUBMIT_METADATA_SIZE;
  for (const part of bodyParts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function payloadKind(submit: NnrpNormalizedSubmitRequest): number {
  const profile = submit.inputProfile ?? submit.descriptor?.profile;
  if (profile === "tensor" || submit.tensors !== undefined) return 0x01;
  if (profile === "token") return 0x02;
  if (profile === "structured_event") return 0x10;
  if (profile === "tool_delta") return 0x20;
  return 0x40;
}

function decodeClientRoleEvent(event: InternalRoleEvent, sessionId?: string): NnrpRuntimeEvent {
  if (event.kind === EVENT_KIND_SESSION_CLOSED) {
    return {
      type: "close",
      ...(sessionId === undefined ? {} : { sessionId }),
    };
  }
  if (event.kind === EVENT_KIND_RESULT_PUSHED) {
    return {
      type: "result",
      result: {
        frameId: event.frameId,
        payload: event.payload.slice(RESULT_PUSH_METADATA_SIZE),
        ...(sessionId === undefined ? {} : { sessionId }),
      },
      ...(sessionId === undefined ? {} : { sessionId }),
    };
  }
  if (event.kind === EVENT_KIND_RESULT_DROPPED) {
    return {
      type: "drop",
      frameId: event.frameId,
      ...(sessionId === undefined ? {} : { sessionId }),
      diagnostic: {
        code: "NNRP_RESULT_DROPPED",
        message: "The native runtime dropped the result.",
        source: "native",
        retryable: false,
      },
    };
  }
  if (event.kind === EVENT_KIND_RUNTIME_FRAME) {
    return decodeRuntimeFrameEvent(event.messageType as NnrpMessageType, event.payload, sessionId);
  }
  return {
    type: "diagnostic",
    ...(sessionId === undefined ? {} : { sessionId }),
    diagnostic: {
      code: "NNRP_NATIVE_ROLE_EVENT",
      message: `Native client role emitted event kind ${event.kind}.`,
      source: "native",
      retryable: false,
    },
  };
}

export interface NnrpClientState {
  readonly endpoint: string;
  readonly runtime: NnrpBackendRuntime;
  readonly transports: readonly NnrpNativeTransportProvider[];
  readonly transportPolicy: NnrpTransportPolicy;
  readonly sessionDefaults?: NnrpSessionOptions;
}

export class NnrpClient {
  readonly #state: NnrpClientState;
  readonly #eventQueues = new Map<string, NnrpRuntimeEvent[]>();
  #nextSessionId = 1;
  #closed = false;

  public constructor(state: NnrpClientState) {
    this.#state = state;
  }

  public get endpoint(): string {
    return this.#state.endpoint;
  }

  public get transportPolicy(): NnrpTransportPolicy {
    return this.#state.transportPolicy;
  }

  public get runtime(): NnrpBackendRuntime {
    return this.#state.runtime;
  }

  public openSession(options: NnrpSessionOptions = {}): NnrpClientSession {
    this.#ensureOpen();
    validateSessionMetadata(options);

    return new NnrpClientSession({
      client: this,
      options: this.#createSessionOptions(options),
    });
  }

  public async nextSessionEvent(sessionId: string, options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    this.#ensureOpen();
    validateEventPollOptions(options);

    while (true) {
      const queued = this.#eventQueues.get(sessionId);
      const event = queued?.shift();
      if (event !== undefined) {
        return event;
      }

      const events = await raceEventPoll(
        this.#state.runtime.awaitEvents({
          maxEvents: 16,
          ...(options.timeoutMillis === undefined ? {} : { timeoutMillis: options.timeoutMillis }),
        }),
        options,
      );
      if (events.length === 0) {
        if (options.timeoutMillis !== undefined) {
          throw eventPollTimeoutError("native");
        }
        throw bindingNotConnectedError("nextEvent");
      }

      for (const candidate of events) {
        const candidateSessionId = eventSessionId(candidate) ?? sessionId;
        const queue = this.#eventQueues.get(candidateSessionId) ?? [];
        queue.push(candidate);
        this.#eventQueues.set(candidateSessionId, queue);
      }
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    await this.#state.runtime.close();
  }

  public get closed(): boolean {
    return this.#closed || this.#state.runtime.closed;
  }

  #ensureOpen(): void {
    if (this.closed) {
      throw closedError("client");
    }
  }

  #createSessionOptions(options: NnrpSessionOptions): NnrpSessionOptions {
    const merged = mergeSessionOptions(this.#state.sessionDefaults, options);
    return {
      ...merged,
      sessionId: merged.sessionId ?? `native-session-${this.#nextSessionId++}`,
    };
  }
}

export interface NnrpClientSessionState {
  readonly client: NnrpClient;
  options: NnrpSessionOptions;
}

export class NnrpClientSession {
  readonly #state: NnrpClientSessionState;
  readonly #inFlightFrames = new Set<number>();
  readonly #terminalFrames = new Set<number>();
  readonly #cancelledOperations = new Set<bigint>();
  readonly #submitCancellationCleanups = new Map<number, () => void>();
  readonly #capacityWaiters: Array<() => void> = [];
  #availableCredits: number;
  #nextControlSequence = 1n;
  #nextRuntimeFrameId = 1;
  #closed = false;

  public constructor(state: NnrpClientSessionState) {
    this.#state = state;
    this.#availableCredits = state.options.initialCredits ?? Number.POSITIVE_INFINITY;
  }

  public get options(): NnrpSessionOptions {
    return this.#state.options;
  }

  public get sessionId(): string {
    return this.#state.options.sessionId ?? "";
  }

  public async submit(request: NnrpSubmitRequest, options: NnrpSubmitOptions = {}): Promise<NnrpResult> {
    let normalized: NnrpNormalizedSubmitRequest;
    const deadlineMillis = validateSubmitOptions(options, "native");
    try {
      this.#ensureOpen();
      const capacityWait = this.#reserveOrAwaitSubmitCapacity(options, deadlineMillis);
      if (capacityWait !== undefined) {
        await capacityWait;
      }
      normalized = normalizeSubmitRequest(request, { copyPayloads: false });
      this.#beginFrame(normalized.frameId);
    } catch (error) {
      return Promise.reject(error);
    }

    try {
      const preparation = this.#prepareSubmitDispatch(normalized.frameId, options, deadlineMillis);
      if (preparation !== undefined) {
        await preparation;
      }
      const cancellation = this.#armSubmitCancellation(normalized.frameId, options, deadlineMillis);
      return await Promise.race([
        this.#state.client.runtime.submitResultCompact({
          sessionOptions: this.#state.options,
          submit: normalized,
          maxEvents: 1,
        }),
        cancellation.promise,
      ]).finally(cancellation.cleanup);
    } finally {
      this.#finishFrame(normalized.frameId);
    }
  }

  public async submitNoWait(request: NnrpSubmitRequest, options: NnrpSubmitOptions = {}): Promise<bigint> {
    let normalized: NnrpNormalizedSubmitRequest;
    const deadlineMillis = validateSubmitOptions(options, "native");
    try {
      this.#ensureOpen();
      this.#reserveImmediateCapacity();
      normalized = normalizeSubmitRequest(request, { copyPayloads: false });
      this.#beginFrame(normalized.frameId);
    } catch (error) {
      return Promise.reject(error);
    }

    try {
      const preparation = this.#prepareSubmitDispatch(normalized.frameId, options, deadlineMillis);
      if (preparation !== undefined) {
        await preparation;
      }
      this.#armDetachedSubmitCancellation(normalized.frameId, options, deadlineMillis);
      return await this.#state.client.runtime.submitNoWait({
        sessionOptions: this.#state.options,
        submit: normalized,
      });
    } catch (error) {
      this.#finishFrame(normalized.frameId);
      throw error;
    }
  }

  public cancel(metadata: ControlRequestMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.Cancel, metadata, diagnostic).then(() => {
      this.#cancelledOperations.add(metadata.operationId);
    });
  }

  public abort(metadata: ControlRequestMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.Abort, metadata, diagnostic).then(() => {
      this.#cancelledOperations.add(metadata.operationId);
    });
  }

  public updatePriority(metadata: SchedulingMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.PriorityUpdate, metadata);
  }

  public updateDeadline(metadata: SchedulingMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.Deadline, metadata);
  }

  public expireAt(metadata: SchedulingMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.ExpireAt, metadata);
  }

  public supersede(metadata: SupersedeMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.Supersede, metadata, diagnostic);
  }

  public updateBudget(metadata: BudgetMetadata): Promise<void> {
    return this.sendControl(NnrpMessageType.BudgetUpdate, metadata);
  }

  public negotiateCapabilities(metadata: CapabilityMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.CapabilityNegotiation, metadata, body);
  }

  public degradeProfile(metadata: CapabilityMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.DegradeProfile, metadata, body);
  }

  public sendRouteHint(metadata: RouteHintMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.RouteHint, metadata, body);
  }

  public sendExecutionHint(metadata: RouteHintMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.ExecutionHint, metadata, body);
  }

  public sendTraceContext(metadata: TraceContextMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.sendControl(NnrpMessageType.TraceContext, metadata, body);
  }

  public sendControl(
    messageType: NnrpMessageType,
    metadata: RuntimeControlMetadata,
    tail: Uint8Array = EMPTY_PAYLOAD,
  ): Promise<void> {
    try {
      assertClientRuntimeControlMessage(messageType);
      const payload = encodeRuntimeControlMetadata(messageType, metadata, tail);
      this.#observeControlSequence(metadata);
      return this.#sendRuntimeFrame(messageType, payload);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  public declareObject(metadata: ObjectDescriptorMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectDeclare, metadata, body);
  }

  public referenceObject(metadata: ObjectReferenceMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectRef, metadata, body);
  }

  public releaseObject(metadata: ObjectReleaseMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectRelease, metadata, diagnostic);
  }

  public patchObject(metadata: ObjectDeltaMetadata, delta: Uint8Array): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectPatch, metadata, delta);
  }

  public sendObjectDelta(metadata: ObjectDeltaMetadata, delta: Uint8Array): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.ObjectDelta, metadata, delta);
  }

  public referenceCache(metadata: CacheReferenceMetadata, body: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.CacheReference, metadata, body);
  }

  public reportCacheMiss(metadata: CacheMissMetadata, diagnostic: Uint8Array = EMPTY_PAYLOAD): Promise<void> {
    return this.#sendRuntimeObject(NnrpMessageType.CacheMiss, metadata, diagnostic);
  }

  public invalidateCache(metadata: CacheInvalidateMetadata): Promise<void> {
    try {
      return this.#sendRuntimeFrame(NnrpMessageType.CacheInvalidate, encodeCacheInvalidateMetadata(metadata));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  public inFlightFrames(): readonly number[] {
    return [...this.#inFlightFrames].sort((left, right) => left - right);
  }

  public completeEvent(event: NnrpRuntimeEvent): void {
    if (event.type === "cancel" || event.type === "abort") {
      this.#cancelledOperations.add(event.metadata.operationId);
      return;
    }

    if (event.type === "result") {
      this.#finishTerminalFrame(event.result.frameId);
      return;
    }

    if (event.type === "drop") {
      this.#finishTerminalFrame(event.frameId);
      return;
    }

    if (event.type === "flow-update") {
      this.#availableCredits = event.update.credits;
      this.#drainCapacityWaiters();
      return;
    }

    if (event.type === "credit-update") {
      this.#availableCredits = normalizeCreditWindow(event.metadata.creditWindow);
      this.#drainCapacityWaiters();
      return;
    }

    if (event.type === "close") {
      this.#inFlightFrames.clear();
      this.#terminalFrames.clear();
      this.#cancelledOperations.clear();
      this.#drainCapacityWaiters();
    }
  }

  public async nextEvent(options: NnrpEventPollOptions = {}): Promise<NnrpRuntimeEvent> {
    try {
      this.#ensureOpen();
      validateEventPollOptions(options);
    } catch (error) {
      return Promise.reject(error);
    }

    const deadlineMillis = options.timeoutMillis === undefined ? undefined : Date.now() + options.timeoutMillis;
    while (true) {
      const pollOptions = deadlineMillis === undefined
        ? options
        : { ...options, timeoutMillis: Math.max(0, deadlineMillis - Date.now()) };
      const event = await this.#state.client.nextSessionEvent(this.sessionId, pollOptions);
      if (this.#shouldSuppressCancelledPayload(event)) {
        continue;
      }
      this.completeEvent(event);
      return event;
    }
  }

  public async nextResult(options: NnrpEventPollOptions = {}): Promise<NnrpResult> {
    while (true) {
      const event = await this.nextEvent(options);
      throwIfResultDrop(event);
      if (event.type === "result") {
        return event.result;
      }
    }
  }

  public migrate(request: NnrpSessionMigrationRequest): Promise<void> {
    try {
      this.#ensureOpen();
      normalizeSessionMigrationRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.reject(recoveryUnsupportedError("native"));
  }

  public async patch(request: NnrpSessionPatchRequest): Promise<NnrpSessionPatchResult> {
    let patch: NnrpSessionPatchRequest;
    try {
      this.#ensureOpen();
      patch = normalizeSessionPatchRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }

    const result = await this.#state.client.runtime.patchSession({
      sessionOptions: this.#state.options,
      patch,
    });

    this.#state.options = mergeSessionOptions(this.#state.options, patch);
    if (patch.initialCredits !== undefined) {
      this.#availableCredits = patch.initialCredits;
      this.#drainCapacityWaiters();
    }

    return result;
  }

  public async *events(options: NnrpEventPollOptions = {}): AsyncIterable<NnrpRuntimeEvent> {
    while (!this.closed) {
      yield await this.nextEvent(options);
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#inFlightFrames.clear();
    this.#terminalFrames.clear();
    this.#cancelledOperations.clear();
    for (const cleanup of this.#submitCancellationCleanups.values()) {
      cleanup();
    }
    this.#submitCancellationCleanups.clear();
    this.#drainCapacityWaiters();
    const closeRoleSession = clientRoleSessionClosers.get(this.#state.client.runtime);
    if (closeRoleSession !== undefined) {
      await closeRoleSession(this.sessionId);
    }
  }

  public get closed(): boolean {
    return this.#closed || this.#state.client.closed;
  }

  #ensureOpen(): void {
    if (this.closed) {
      throw closedError("client session");
    }
  }

  #beginFrame(frameId: number): void {
    if (this.#inFlightFrames.has(frameId)) {
      throw new NnrpProtocolError({
        code: "NNRP_FRAME_IN_FLIGHT",
        message: `Frame ${frameId} is already in flight for this session.`,
        source: "core",
        retryable: false,
      });
    }

    this.#inFlightFrames.add(frameId);
    this.#terminalFrames.delete(frameId);
  }

  #prepareSubmitDispatch(
    frameId: number,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): Promise<void> | undefined {
    throwIfSubmitCancelledBeforeDispatch(options, "native");
    if (deadlineMillis === undefined) {
      return undefined;
    }
    return this.updateDeadline({
      operationId: BigInt(frameId),
      controlSequence: this.#allocateControlSequence(),
      priorityClass: 0,
      priorityDelta: 0,
      deadlineUnixMs: BigInt(Math.ceil(deadlineMillis)),
      flags: 0,
    }).then(() => {
      throwIfSubmitCancelledBeforeDispatch(options, "native", deadlineMillis);
    });
  }

  #armSubmitCancellation(
    frameId: number,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): { readonly promise: Promise<never>; readonly cleanup: () => void } {
    let rejectCancellation: (error: unknown) => void = () => {};
    const promise = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const cleanup = this.#installSubmitCancellation(
      frameId,
      options,
      deadlineMillis,
      rejectCancellation,
    );
    return { promise, cleanup };
  }

  #armDetachedSubmitCancellation(
    frameId: number,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): void {
    this.#installSubmitCancellation(frameId, options, deadlineMillis);
  }

  #installSubmitCancellation(
    frameId: number,
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
    onCancelled?: (error: unknown) => void,
  ): () => void {
    if (options.signal === undefined && deadlineMillis === undefined) {
      return () => {};
    }

    let cleaned = false;
    let triggered = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      options.signal?.removeEventListener?.("abort", onAbort);
    };
    const trigger = (reasonCode: number, error: NnrpTimeoutError) => {
      if (triggered || cleaned) {
        return;
      }
      triggered = true;
      this.#cancelledOperations.add(BigInt(frameId));
      onCancelled?.(error);
      cleanup();
      void this.cancel({
        operationId: BigInt(frameId),
        controlSequence: this.#allocateControlSequence(),
        reasonCode,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      }).catch(() => {});
    };
    const onAbort = () => trigger(1, submitCancelledError("native", options.signal));

    options.signal?.addEventListener?.("abort", onAbort, { once: true });
    if (deadlineMillis !== undefined) {
      timeout = setTimeout(
        () => trigger(3, submitTimeoutError("native")),
        Math.max(0, deadlineMillis - Date.now()),
      );
    }
    this.#submitCancellationCleanups.set(frameId, cleanup);
    return cleanup;
  }

  #reserveOrAwaitSubmitCapacity(
    options: NnrpSubmitOptions,
    deadlineMillis: number | undefined,
  ): Promise<void> | undefined {
    if (this.#state.options.submitCapacityPolicy !== "await") {
      return undefined;
    }

    if (this.#availableCredits > 0) {
      this.#availableCredits -= 1;
      return undefined;
    }

    return this.#awaitSubmitCapacity(options, deadlineMillis);
  }

  async #awaitSubmitCapacity(options: NnrpSubmitOptions, deadlineMillis: number | undefined): Promise<void> {
    do {
      this.#ensureOpen();
      await this.#waitForSubmitCapacity(options, deadlineMillis);
    } while (this.#availableCredits <= 0);

    this.#availableCredits -= 1;
  }

  #waitForSubmitCapacity(options: NnrpSubmitOptions, deadlineMillis: number | undefined): Promise<void> {
    throwIfSubmitCancelledBeforeDispatch(options, "native", deadlineMillis);
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        const index = this.#capacityWaiters.indexOf(wake);
        if (index >= 0) {
          this.#capacityWaiters.splice(index, 1);
        }
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
        options.signal?.removeEventListener?.("abort", onAbort);
      };
      const finish = (error?: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      };
      const wake = () => finish();
      const onAbort = () => finish(submitCancelledError("native", options.signal));

      this.#capacityWaiters.push(wake);
      options.signal?.addEventListener?.("abort", onAbort, { once: true });
      if (deadlineMillis !== undefined) {
        timeout = setTimeout(
          () => finish(submitTimeoutError("native")),
          Math.max(0, deadlineMillis - Date.now()),
        );
      }
    });
  }

  #reserveImmediateCapacity(): void {
    if (this.#state.options.submitCapacityPolicy !== "await") {
      return;
    }

    if (this.#availableCredits <= 0) {
      throw backpressureCreditExhaustedError("native");
    }

    this.#availableCredits -= 1;
  }

  #drainCapacityWaiters(): void {
    for (const waiter of this.#capacityWaiters.splice(0)) {
      waiter();
    }
  }

  #finishFrame(frameId: number): void {
    this.#submitCancellationCleanups.get(frameId)?.();
    this.#submitCancellationCleanups.delete(frameId);
    this.#inFlightFrames.delete(frameId);
  }

  #finishTerminalFrame(frameId: number): void {
    if (this.#terminalFrames.has(frameId)) {
      throw new NnrpProtocolError({
        code: "NNRP_FRAME_TERMINAL_DUPLICATE",
        message: `Frame ${frameId} already reached a terminal state.`,
        source: "core",
        retryable: false,
      });
    }

    this.#terminalFrames.add(frameId);
    this.#finishFrame(frameId);
  }

  #allocateControlSequence(): bigint {
    const sequence = this.#nextControlSequence;
    this.#nextControlSequence = sequence === 0xffff_ffff_ffff_ffffn ? 1n : sequence + 1n;
    return sequence;
  }

  #observeControlSequence(metadata: RuntimeControlMetadata): void {
    if (!("controlSequence" in metadata) || metadata.controlSequence < this.#nextControlSequence) {
      return;
    }
    this.#nextControlSequence = metadata.controlSequence === 0xffff_ffff_ffff_ffffn
      ? 1n
      : metadata.controlSequence + 1n;
  }

  #shouldSuppressCancelledPayload(event: NnrpRuntimeEvent): boolean {
    if (event.type === "partial-result") {
      return this.#cancelledOperations.has(event.metadata.operationId);
    }

    if (event.type === "result" && this.#cancelledOperations.has(BigInt(event.result.frameId))) {
      this.#terminalFrames.add(event.result.frameId);
      this.#finishFrame(event.result.frameId);
      return true;
    }

    return false;
  }

  #sendRuntimeObject(
    messageType: NnrpMessageType,
    metadata:
      | ObjectDescriptorMetadata
      | ObjectReferenceMetadata
      | ObjectReleaseMetadata
      | ObjectDeltaMetadata
      | CacheReferenceMetadata
      | CacheMissMetadata,
    tail: Uint8Array,
  ): Promise<void> {
    try {
      return this.#sendRuntimeFrame(messageType, encodeRuntimeObjectMetadata(messageType, metadata, tail));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  #sendRuntimeFrame(messageType: NnrpMessageType, payload: Uint8Array): Promise<void> {
    try {
      this.#ensureOpen();
      const frameId = this.#nextRuntimeFrameId;
      this.#nextRuntimeFrameId = frameId === 0xffff_ffff ? 1 : frameId + 1;
      return this.#state.client.runtime.sendRuntimeFrame({
        sessionOptions: this.#state.options,
        messageType,
        frameId,
        payload,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

function createNativeRuntimeBinding(
  ffi: NnrpNativeFfiBinding | undefined,
  transports: readonly NnrpTransportKind[],
): NnrpNativeRuntimeBinding {
  return {
    manifest: createNativeRuntimeManifest(transports),
    ...(ffi === undefined ? {} : { ffi }),
  };
}

const EMPTY_PAYLOAD = new Uint8Array();
function decodeRuntimeFrameEvent(
  messageType: NnrpMessageType,
  payload: Uint8Array,
  sessionId: string | undefined,
): NnrpRuntimeFrameEvent {
  const scope = sessionId === undefined ? {} : { sessionId };
  switch (messageType) {
    case NnrpMessageType.Cancel:
    case NnrpMessageType.Abort: {
      const { metadata, tail } = decodeRuntimeControlMetadata(messageType, payload);
      return {
        type: messageType === NnrpMessageType.Cancel ? "cancel" : "abort",
        messageType,
        metadata: metadata as ControlRequestMetadata,
        diagnostic: tail,
        ...scope,
      } as NnrpRuntimeFrameEvent;
    }
    case NnrpMessageType.PriorityUpdate:
    case NnrpMessageType.Deadline:
    case NnrpMessageType.ExpireAt: {
      const { metadata } = decodeRuntimeControlMetadata(messageType, payload);
      const type = messageType === NnrpMessageType.PriorityUpdate
        ? "priority-update"
        : messageType === NnrpMessageType.Deadline
        ? "deadline"
        : "expire-at";
      return { type, messageType, metadata: metadata as SchedulingMetadata, ...scope } as NnrpRuntimeFrameEvent;
    }
    case NnrpMessageType.Supersede:
    case NnrpMessageType.CapabilityNegotiation:
    case NnrpMessageType.DegradeProfile:
    case NnrpMessageType.RouteHint:
    case NnrpMessageType.ExecutionHint:
    case NnrpMessageType.TraceContext:
    case NnrpMessageType.Progress:
    case NnrpMessageType.PartialResult:
    case NnrpMessageType.ResultDropReason:
    case NnrpMessageType.ErrorRecoverable:
    case NnrpMessageType.RetryAfter: {
      const { metadata, tail } = decodeRuntimeControlMetadata(messageType, payload);
      return runtimeControlEventWithTail(messageType, metadata, tail, scope);
    }
    case NnrpMessageType.BudgetUpdate:
    case NnrpMessageType.Backpressure:
    case NnrpMessageType.CreditUpdate: {
      const { metadata } = decodeRuntimeControlMetadata(messageType, payload);
      if (messageType === NnrpMessageType.BudgetUpdate) {
        return { type: "budget-update", messageType, metadata: metadata as BudgetMetadata, ...scope };
      }
      return {
        type: messageType === NnrpMessageType.Backpressure ? "backpressure" : "credit-update",
        messageType,
        metadata: metadata as PressureMetadata,
        ...scope,
      } as NnrpRuntimeFrameEvent;
    }
    case NnrpMessageType.ObjectDeclare:
    case NnrpMessageType.ObjectRef:
    case NnrpMessageType.ObjectRelease:
    case NnrpMessageType.ObjectPatch:
    case NnrpMessageType.ObjectDelta:
    case NnrpMessageType.CacheReference:
    case NnrpMessageType.CacheMiss: {
      const { metadata, tail } = decodeRuntimeObjectMetadata(messageType, payload);
      return runtimeObjectEvent(messageType, metadata, tail, scope);
    }
    case NnrpMessageType.CacheInvalidate:
      return {
        type: "cache-invalidate",
        messageType,
        metadata: decodeCacheInvalidateMetadata(payload),
        ...scope,
      };
    default:
      throw nativeArtifactError(
        "NNRP_DENO_FFI_RUNTIME_MESSAGE_UNSUPPORTED",
        `Native event returned unsupported runtime message type 0x${Number(messageType).toString(16)}.`,
      );
  }
}

function runtimeControlEventWithTail(
  messageType: NnrpMessageType,
  metadata: RuntimeControlMetadata,
  tail: Uint8Array,
  scope: { readonly sessionId?: string },
): NnrpRuntimeFrameEvent {
  const mapping = RUNTIME_CONTROL_EVENT_MAPPINGS[messageType];
  if (mapping === undefined) {
    throw new Error(`runtime control message ${messageType} has no event mapping`);
  }
  return {
    type: mapping.type,
    messageType,
    metadata,
    [mapping.tail]: tail,
    ...scope,
  } as NnrpRuntimeFrameEvent;
}

function runtimeObjectEvent(
  messageType: NnrpMessageType,
  metadata:
    | ObjectDescriptorMetadata
    | ObjectReferenceMetadata
    | ObjectReleaseMetadata
    | ObjectDeltaMetadata
    | CacheReferenceMetadata
    | CacheMissMetadata,
  tail: Uint8Array,
  scope: { readonly sessionId?: string },
): NnrpRuntimeFrameEvent {
  if (messageType === NnrpMessageType.ObjectPatch || messageType === NnrpMessageType.ObjectDelta) {
    const delta = metadata as ObjectDeltaMetadata;
    return {
      type: messageType === NnrpMessageType.ObjectPatch ? "object-patch" : "object-delta",
      messageType,
      metadata: delta,
      metadataBody: tail.slice(0, delta.metadataBytes),
      delta: tail.slice(delta.metadataBytes),
      ...scope,
    } as NnrpRuntimeFrameEvent;
  }
  const mapping = RUNTIME_OBJECT_EVENT_MAPPINGS[messageType];
  if (mapping === undefined) {
    throw new Error(`runtime object message ${messageType} has no event mapping`);
  }
  return {
    type: mapping.type,
    messageType,
    metadata,
    [mapping.tail]: tail,
    ...scope,
  } as NnrpRuntimeFrameEvent;
}

const RUNTIME_CONTROL_EVENT_MAPPINGS: Readonly<
  Partial<Record<NnrpMessageType, { readonly type: string; readonly tail: "body" | "diagnostic" }>>
> = {
  [NnrpMessageType.Supersede]: { type: "supersede", tail: "diagnostic" },
  [NnrpMessageType.CapabilityNegotiation]: { type: "capability-negotiation", tail: "body" },
  [NnrpMessageType.DegradeProfile]: { type: "degrade-profile", tail: "body" },
  [NnrpMessageType.RouteHint]: { type: "route-hint", tail: "body" },
  [NnrpMessageType.ExecutionHint]: { type: "execution-hint", tail: "body" },
  [NnrpMessageType.TraceContext]: { type: "trace-context", tail: "body" },
  [NnrpMessageType.Progress]: { type: "progress", tail: "body" },
  [NnrpMessageType.PartialResult]: { type: "partial-result", tail: "body" },
  [NnrpMessageType.ResultDropReason]: { type: "result-drop-reason", tail: "diagnostic" },
  [NnrpMessageType.ErrorRecoverable]: { type: "recoverable-error", tail: "diagnostic" },
  [NnrpMessageType.RetryAfter]: { type: "retry-after", tail: "diagnostic" },
};

const RUNTIME_OBJECT_EVENT_MAPPINGS: Readonly<
  Partial<Record<NnrpMessageType, { readonly type: string; readonly tail: "body" | "diagnostic" }>>
> = {
  [NnrpMessageType.ObjectDeclare]: { type: "object-declare", tail: "body" },
  [NnrpMessageType.ObjectRef]: { type: "object-ref", tail: "body" },
  [NnrpMessageType.ObjectRelease]: { type: "object-release", tail: "diagnostic" },
  [NnrpMessageType.CacheReference]: { type: "cache-reference", tail: "body" },
  [NnrpMessageType.CacheMiss]: { type: "cache-miss", tail: "diagnostic" },
};

function createNativeRuntimeManifest(transports: readonly NnrpTransportKind[]): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "backend-native",
    transports,
    capabilities: [
      "client.session",
      ...NATIVE_RUNTIME_CAPABILITIES,
    ] satisfies readonly NnrpCapability[],
  });
}

function transportKinds(providers: readonly NnrpNativeTransportProvider[]): readonly NnrpTransportKind[] {
  return [...new Set(providers.map((provider) => provider.kind))];
}

async function resolveRuntimeCapabilities(
  binding: NnrpNativeRuntimeBinding,
): Promise<NnrpNativeRuntimeCapabilities | undefined> {
  const capabilities = await binding.ffi?.runtimeCapabilities?.();
  if (capabilities === undefined) {
    return undefined;
  }

  validateNativeRuntimeCapabilities(capabilities);
  return capabilities;
}

export function validateNativeRuntimeCapabilities(capabilities: NnrpNativeRuntimeCapabilities): void {
  if (
    capabilities.abiMajor !== EXPECTED_ABI_MAJOR || capabilities.abiMinor !== EXPECTED_ABI_MINOR ||
    capabilities.abiPatch !== EXPECTED_ABI_PATCH
  ) {
    throw nativeArtifactError(
      "NNRP_NATIVE_ABI_MISMATCH",
      `Native artifact ABI ${capabilities.abiMajor}.${capabilities.abiMinor}.${capabilities.abiPatch} is not supported.`,
    );
  }

  if (
    capabilities.protocolMajor !== EXPECTED_PROTOCOL_MAJOR ||
    capabilities.protocolWireFormat !== EXPECTED_PROTOCOL_WIRE_FORMAT
  ) {
    throw nativeArtifactError(
      "NNRP_NATIVE_PROTOCOL_MISMATCH",
      `Native artifact protocol ${capabilities.protocolMajor}/${capabilities.protocolWireFormat} is not supported.`,
    );
  }

  const missing = REQUIRED_RUNTIME_FEATURES & ~capabilities.featureFlags;
  if (missing !== 0n) {
    throw nativeArtifactError(
      "NNRP_NATIVE_FEATURES_MISSING",
      `Native artifact is missing required runtime feature bits: 0x${missing.toString(16)}.`,
    );
  }
}

function normalizeEndpoint(endpoint: string | URL): string {
  return endpoint instanceof URL ? endpoint.toString() : endpoint;
}

function validateEndpoint(endpoint: string | URL): void {
  if (normalizeEndpoint(endpoint).trim().length === 0) {
    throw new NnrpCapabilityError({
      code: "NNRP_NATIVE_ENDPOINT_EMPTY",
      message: "NNRP native endpoint must not be empty.",
      source: "native",
      retryable: false,
    });
  }
}

function mergeSessionOptions(
  defaults: NnrpSessionOptions | undefined,
  options: NnrpSessionOptions,
): NnrpSessionOptions {
  const merged = {
    ...defaults,
    ...options,
    metadata: {
      ...(defaults?.metadata ?? {}),
      ...(options.metadata ?? {}),
    },
  };
  validateSessionMetadata(merged);
  return merged;
}

function eventSessionId(event: NnrpRuntimeEvent): string | undefined {
  if (event.type === "result") {
    return event.sessionId ?? event.result.sessionId;
  }

  return event.sessionId;
}

function closedError(target: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code: "NNRP_NATIVE_CLOSED",
    message: `Cannot use a closed ${target}.`,
    source: "native",
    retryable: false,
  });
}

function bindingNotConnectedError(operation: string): NnrpNativeBindingUnavailableError {
  return new NnrpNativeBindingUnavailableError({
    code: "NNRP_NATIVE_BINDING_NOT_CONNECTED",
    message: `Native binding operation '${operation}' is not connected to an FFI implementation yet.`,
    source: "native",
    retryable: false,
  });
}

function raceEventPoll<T>(promise: Promise<T>, options: NnrpEventPollOptions): Promise<T> {
  if (options.signal?.aborted) {
    return Promise.reject(eventPollCancelledError(options.signal));
  }

  if (options.timeoutMillis !== undefined) {
    return raceEventTimeout(promise, options.timeoutMillis, "native", options.signal);
  }

  const signal = options.signal;
  if (signal === undefined || signal.addEventListener === undefined || signal.removeEventListener === undefined) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.reject(eventPollCancelledError(signal));
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(eventPollCancelledError(signal));
    signal.addEventListener?.("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener?.("abort", onAbort));
  });
}

function raceEventTimeout<T>(
  promise: Promise<T>,
  timeoutMillis: number,
  source: "native",
  signal: NnrpAbortSignalLike | undefined,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(eventPollTimeoutError(source));
    }, timeoutMillis);
    const onAbort = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(eventPollCancelledError(signal));
      }
    };

    signal?.addEventListener?.("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      },
    ).finally(() => signal?.removeEventListener?.("abort", onAbort));
  });
}

function eventPollTimeoutError(source: "native"): NnrpTimeoutError {
  return new NnrpTimeoutError({
    code: "NNRP_EVENT_POLL_TIMEOUT",
    message: "Event polling timed out without receiving an event.",
    source,
    retryable: true,
  });
}

function eventPollCancelledError(signal: NnrpAbortSignalLike | undefined): NnrpTimeoutError {
  return new NnrpTimeoutError({
    code: "NNRP_EVENT_POLL_CANCELLED",
    message: "Event polling was cancelled.",
    source: "runtime",
    retryable: false,
    cause: signal?.reason,
  });
}

function validateSubmitOptions(options: NnrpSubmitOptions, source: "native"): number | undefined {
  if (
    options.timeoutMillis !== undefined &&
    (!Number.isFinite(options.timeoutMillis) || options.timeoutMillis < 0)
  ) {
    throw new NnrpProtocolError({
      code: "NNRP_SUBMIT_TIMEOUT_INVALID",
      message: "Submit timeoutMillis must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }
  throwIfSubmitCancelledBeforeDispatch(options, source);
  return options.timeoutMillis === undefined ? undefined : Date.now() + options.timeoutMillis;
}

function throwIfSubmitCancelledBeforeDispatch(
  options: NnrpSubmitOptions,
  source: "native",
  deadlineMillis?: number,
): void {
  if (options.signal?.aborted) {
    throw submitCancelledError(source, options.signal);
  }
  if (deadlineMillis !== undefined && Date.now() >= deadlineMillis) {
    throw submitTimeoutError(source);
  }
}

function submitCancelledError(source: "native", signal: NnrpAbortSignalLike | undefined): NnrpTimeoutError {
  return new NnrpTimeoutError({
    code: "NNRP_SUBMIT_CANCELLED",
    message: "Submit was cancelled.",
    source,
    retryable: false,
    cause: signal?.reason,
  });
}

function submitTimeoutError(source: "native"): NnrpTimeoutError {
  return new NnrpTimeoutError({
    code: "NNRP_SUBMIT_TIMEOUT",
    message: "Submit timed out.",
    source,
    retryable: true,
  });
}

function recoveryUnsupportedError(source: "native" | "wasm"): NnrpRecoveryError {
  return new NnrpRecoveryError({
    code: "NNRP_RECOVERY_UNSUPPORTED",
    message: "Session migration is not supported by this runtime binding yet.",
    source,
    retryable: false,
  });
}

function normalizeCreditWindow(creditWindow: bigint): number {
  return creditWindow > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(creditWindow);
}

function backpressureCreditExhaustedError(source: "native" | "wasm"): NnrpTransportError {
  return new NnrpTransportError({
    code: "NNRP_BACKPRESSURE_CREDIT_EXHAUSTED",
    message: "Submit cannot dispatch because the session has no available flow-control credits.",
    source,
    retryable: true,
  });
}

function nativeArtifactError(code: string, message: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code,
    message,
    source: "native",
    retryable: false,
  });
}

function nativeRuntimeReadinessError(code: string, message: string): NnrpCapabilityError {
  return new NnrpCapabilityError({
    code,
    message,
    source: "native",
    retryable: false,
  });
}

function assertClientRuntimeControlMessage(messageType: NnrpMessageType): void {
  if (
    messageType === NnrpMessageType.Cancel ||
    messageType === NnrpMessageType.Abort ||
    messageType === NnrpMessageType.PriorityUpdate ||
    messageType === NnrpMessageType.Deadline ||
    messageType === NnrpMessageType.ExpireAt ||
    messageType === NnrpMessageType.Supersede ||
    messageType === NnrpMessageType.BudgetUpdate ||
    messageType === NnrpMessageType.CapabilityNegotiation ||
    messageType === NnrpMessageType.DegradeProfile ||
    messageType === NnrpMessageType.RouteHint ||
    messageType === NnrpMessageType.ExecutionHint ||
    messageType === NnrpMessageType.TraceContext ||
    messageType === NnrpMessageType.ErrorRecoverable ||
    messageType === NnrpMessageType.RetryAfter
  ) {
    return;
  }

  throw new NnrpProtocolError({
    code: "NNRP_CLIENT_RUNTIME_MESSAGE_DIRECTION_INVALID",
    message: `Message type ${messageType} cannot be sent by a client session.`,
    source: "protocol",
    retryable: false,
  });
}

type NodePlatform = NodeJS.Platform;

type NodeArchitecture = NodeJS.Architecture;
