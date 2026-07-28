import type { NnrpTransportCandidate, NnrpTransportKind, NnrpTransportRejectionReason } from "@nnrp/core";

export const HOST_ROUTE_RESULT_SCHEMA =
  "https://github.com/NagareWorks/nnrp-conformance/schemas/wire-conformance-case-results.schema.json";
export const HOST_ROUTE_READY_SCHEMA =
  "https://github.com/NagareWorks/nnrp-conformance/schemas/wire-host-route-ready.schema.json";
export const HOST_ROUTE_TARGET_SCHEMA =
  "https://github.com/NagareWorks/nnrp-conformance/schemas/wire-conformance-target.schema.json";
export const HOST_ROUTE_PROTOCOL_VERSION = "nnrp-1-preview4";

export interface HostRouteProviderDeclaration {
  readonly transport: NnrpTransportKind;
  readonly provider_id: string;
  readonly installed: boolean;
  readonly platforms: readonly ("native" | "browser")[];
  readonly security_modes: readonly ("plain" | "tls_server_auth" | "mutual_tls" | "wss" | "browser_host")[];
}

export interface HostRouteTargetManifest {
  readonly $schema: typeof HOST_ROUTE_TARGET_SCHEMA;
  readonly target_name: string;
  readonly protocol_version: typeof HOST_ROUTE_PROTOCOL_VERSION;
  readonly suite_version: string;
  readonly wire_conformance: {
    readonly modes: readonly ["suite_as_client", "suite_as_server"];
    readonly transports: readonly [];
    readonly host_route_providers: readonly HostRouteProviderDeclaration[];
    readonly capabilities: readonly ["host.routes"];
    readonly limits: {
      readonly max_frame_bytes: number;
      readonly max_in_flight: number;
    };
  };
}

export interface HostRouteSecurity {
  readonly mode: "plain" | "tls_server_auth" | "mutual_tls" | "wss" | "browser_host";
  readonly credential_owner: "none" | "suite" | "target" | "host";
}

export interface HostProviderRoute {
  readonly transport: NnrpTransportKind;
  readonly provider_id: string;
  readonly locator: string;
  readonly security: HostRouteSecurity;
  readonly injected_failures?:
    readonly ("route_unresolved" | "security_incompatible" | "bind_failure" | "terminal_listener_failure")[];
}

export interface HostRouteFixture {
  readonly role: "client" | "server";
  readonly platform: "native" | "browser";
  readonly application_endpoint: string;
  readonly routes: readonly HostProviderRoute[];
}

export interface HostRouteScenario {
  readonly id: string;
  readonly host_route: HostRouteFixture;
}

export interface HostRouteCandidateEvidence {
  readonly transport: NnrpTransportKind;
  readonly provider_id: string;
  readonly requested_locator: string;
  readonly locator_resolved: boolean;
  readonly security_satisfied: boolean;
  readonly selected: boolean;
  readonly rejection_reason?: NnrpTransportRejectionReason;
}

export interface HostRouteListenerEvidence {
  readonly transport: NnrpTransportKind;
  readonly provider_id: string;
  readonly requested_locator: string;
  readonly bound_endpoint?: string;
  readonly state: "opened" | "rolled_back" | "accepted" | "closed" | "failed";
}

export interface HostRouteAcceptedSessionEvidence {
  readonly transport: NnrpTransportKind;
  readonly provider_id: string;
  readonly active_transport: NnrpTransportKind;
}

export interface HostRouteEvidence {
  readonly application_endpoint: string;
  readonly candidates: readonly HostRouteCandidateEvidence[];
  readonly listeners: readonly HostRouteListenerEvidence[];
  readonly accepted_sessions: readonly HostRouteAcceptedSessionEvidence[];
  readonly atomic_rollback: boolean;
  readonly logical_set_closed: boolean;
  readonly terminal_failure?: string;
}

export interface HostRouteCaseResult {
  readonly id: string;
  readonly outcome: "passed" | "failed";
  readonly terminal: "success" | "error";
  readonly observed_frames?: readonly [];
  readonly route_evidence?: HostRouteEvidence;
  readonly message?: string;
  readonly evidence_paths?: readonly string[];
}

export function createHostRouteTargetManifest(
  targetName: string,
  suiteVersion: string,
  providers: readonly HostRouteProviderDeclaration[],
): HostRouteTargetManifest {
  if (targetName.length === 0 || suiteVersion.length === 0 || providers.length === 0) {
    throw new Error("Host-route target identity and provider declarations must be non-empty.");
  }
  const identities = new Set<string>();
  const transports = new Set<NnrpTransportKind>();
  for (const provider of providers) {
    if (provider.provider_id.length === 0 || provider.platforms.length === 0 || provider.security_modes.length === 0) {
      throw new Error("Host-route provider declarations must be complete.");
    }
    if (identities.has(provider.provider_id) || transports.has(provider.transport)) {
      throw new Error("Host-route provider declarations must not repeat an id or transport.");
    }
    identities.add(provider.provider_id);
    transports.add(provider.transport);
  }
  return {
    $schema: HOST_ROUTE_TARGET_SCHEMA,
    target_name: targetName,
    protocol_version: HOST_ROUTE_PROTOCOL_VERSION,
    suite_version: suiteVersion,
    wire_conformance: {
      modes: ["suite_as_client", "suite_as_server"],
      transports: [],
      host_route_providers: providers.map((provider) => ({ ...provider })),
      capabilities: ["host.routes"],
      limits: { max_frame_bytes: 67_108_864, max_in_flight: 256 },
    },
  };
}

export function validateHostRouteScenario(value: unknown): HostRouteScenario {
  const scenario = record(value, "scenario");
  const id = requiredString(scenario, "id");
  const fixtureValue = record(scenario.host_route, "scenario.host_route");
  const role = requiredEnum(fixtureValue, "role", ["client", "server"] as const);
  const platform = requiredEnum(fixtureValue, "platform", ["native", "browser"] as const);
  const applicationEndpoint = requiredString(fixtureValue, "application_endpoint");
  if (!applicationEndpoint.startsWith("nnrp://") && !applicationEndpoint.startsWith("nnrps://")) {
    throw new Error("Host-route application endpoint must use nnrp:// or nnrps://.");
  }
  if (!Array.isArray(fixtureValue.routes) || fixtureValue.routes.length === 0) {
    throw new Error("Host-route fixture requires at least one route.");
  }
  const routes = fixtureValue.routes.map((route, index) => validateRoute(route, index));
  if (
    new Set(routes.map((route) => route.transport)).size !== routes.length ||
    new Set(routes.map((route) => route.provider_id)).size !== routes.length
  ) {
    throw new Error("Host-route fixture repeats a transport or provider id.");
  }
  return {
    id,
    host_route: { role, platform, application_endpoint: applicationEndpoint, routes },
  };
}

export function createClientRouteEvidence(
  fixture: HostRouteFixture,
  candidates: readonly NnrpTransportCandidate[],
  selectedProviderId?: string,
): HostRouteEvidence {
  const byIdentity = new Map(
    candidates.map((candidate) => [identity(candidate.kind, candidate.provider.id), candidate]),
  );
  const candidateEvidence = fixture.routes.map((route): HostRouteCandidateEvidence => {
    const candidate = byIdentity.get(identity(route.transport, route.provider_id));
    if (candidate === undefined) throw new Error(`Missing candidate evidence for ${route.provider_id}.`);
    return {
      transport: route.transport,
      provider_id: route.provider_id,
      requested_locator: route.locator,
      locator_resolved: candidate.rejectionReason !== "route-unresolved",
      security_satisfied: candidate.rejectionReason !== "security-unsatisfied",
      selected: selectedProviderId === route.provider_id,
      ...(candidate.rejectionReason === undefined ? {} : { rejection_reason: candidate.rejectionReason }),
    };
  });
  const selectedRoute = fixture.routes.find((route) => route.provider_id === selectedProviderId);
  return {
    application_endpoint: fixture.application_endpoint,
    candidates: candidateEvidence,
    listeners: [],
    accepted_sessions: selectedRoute === undefined ? [] : [{
      transport: selectedRoute.transport,
      provider_id: selectedRoute.provider_id,
      active_transport: selectedRoute.transport,
    }],
    atomic_rollback: false,
    logical_set_closed: false,
  };
}

export function createSuccessfulClientRouteEvidence(
  fixture: HostRouteFixture,
  selectedProviderId: string,
): HostRouteEvidence {
  const candidates = fixture.routes.map((route): NnrpTransportCandidate => ({
    kind: route.transport,
    provider: {
      id: route.provider_id,
      cost: { modelId: 0, units: 0n },
      preferenceRank: 0,
      limits: { maxFrameBytes: 67_108_864n },
      limitations: [],
    },
    localAvailable: true,
    peerSupported: true,
    withinLimits: true,
    probeState: "succeeded",
  }));
  return createClientRouteEvidence(fixture, candidates, selectedProviderId);
}

export function createServerRouteEvidence(
  fixture: HostRouteFixture,
  boundEndpoints: Readonly<Partial<Record<NnrpTransportKind, string>>>,
  accepted: readonly NnrpTransportKind[],
  state: HostRouteListenerEvidence["state"],
  options: {
    readonly atomicRollback?: boolean;
    readonly logicalSetClosed?: boolean;
    readonly terminalFailure?: string;
  } = {},
): HostRouteEvidence {
  return {
    application_endpoint: fixture.application_endpoint,
    candidates: fixture.routes.map(serverCandidate),
    listeners: fixture.routes.map((route) => ({
      transport: route.transport,
      provider_id: route.provider_id,
      requested_locator: route.locator,
      ...(boundEndpoints[route.transport] === undefined ? {} : { bound_endpoint: boundEndpoints[route.transport] }),
      state,
    })),
    accepted_sessions: accepted.map((transport) => ({
      transport,
      provider_id: providerIdForTransport(fixture.routes, transport),
      active_transport: transport,
    })),
    atomic_rollback: options.atomicRollback ?? false,
    logical_set_closed: options.logicalSetClosed ?? false,
    ...(options.terminalFailure === undefined ? {} : { terminal_failure: options.terminalFailure }),
  };
}

export function createRollbackEvidence(fixture: HostRouteFixture): HostRouteEvidence {
  return {
    application_endpoint: fixture.application_endpoint,
    candidates: fixture.routes.map(serverCandidate),
    listeners: fixture.routes.map((route) => ({
      transport: route.transport,
      provider_id: route.provider_id,
      requested_locator: route.locator,
      state: injectedFailures(route).has("bind_failure") ? "failed" : "rolled_back",
    })),
    accepted_sessions: [],
    atomic_rollback: true,
    logical_set_closed: true,
  };
}

export function passedHostRouteResult(
  scenario: HostRouteScenario,
  terminal: "success" | "error",
  evidence: HostRouteEvidence,
  message = "Independent host-route target executed the public JavaScript SDK host API.",
): HostRouteCaseResult {
  return {
    id: scenario.id,
    outcome: "passed",
    terminal,
    observed_frames: [],
    route_evidence: evidence,
    message,
    evidence_paths: [],
  };
}

export function injectedFailures(route: HostProviderRoute): ReadonlySet<string> {
  return new Set(route.injected_failures ?? []);
}

function validateRoute(value: unknown, index: number): HostProviderRoute {
  const route = record(value, `scenario.host_route.routes[${index}]`);
  const security = record(route.security, `scenario.host_route.routes[${index}].security`);
  const failures = route.injected_failures;
  if (failures !== undefined && (!Array.isArray(failures) || failures.some((failure) => typeof failure !== "string"))) {
    throw new Error(`scenario.host_route.routes[${index}].injected_failures must be a string array.`);
  }
  return {
    transport: requiredEnum(route, "transport", ["tcp", "quic", "ipc", "websocket"] as const),
    provider_id: requiredString(route, "provider_id"),
    locator: requiredString(route, "locator"),
    security: {
      mode: requiredEnum(security, "mode", ["plain", "tls_server_auth", "mutual_tls", "wss", "browser_host"] as const),
      credential_owner: requiredEnum(security, "credential_owner", ["none", "suite", "target", "host"] as const),
    },
    ...(failures === undefined ? {} : {
      injected_failures: failures as HostProviderRoute["injected_failures"],
    }),
  };
}

function serverCandidate(route: HostProviderRoute): HostRouteCandidateEvidence {
  return {
    transport: route.transport,
    provider_id: route.provider_id,
    requested_locator: route.locator,
    locator_resolved: true,
    security_satisfied: true,
    selected: false,
  };
}

function providerIdForTransport(routes: readonly HostProviderRoute[], transport: NnrpTransportKind): string {
  const route = routes.find((candidate) => candidate.transport === transport);
  if (route === undefined) throw new Error(`Missing route for accepted ${transport} session.`);
  return route.provider_id;
}

function identity(transport: NnrpTransportKind, providerId: string): string {
  return `${transport}\0${providerId}`;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.length === 0) throw new Error(`${key} must be a non-empty string.`);
  return candidate;
}

function requiredEnum<const T extends readonly string[]>(
  value: Record<string, unknown>,
  key: string,
  choices: T,
): T[number] {
  const candidate = requiredString(value, key);
  if (!(choices as readonly string[]).includes(candidate)) {
    throw new Error(`${key} contains unsupported value ${candidate}.`);
  }
  return candidate as T[number];
}
