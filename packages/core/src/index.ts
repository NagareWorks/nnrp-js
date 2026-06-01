export const NNRP_PROTOCOL_NAME = "NNRP";
export const NNRP_PROTOCOL_VERSION = "1.0.0";

export type NnrpBuildMode = "backend-native" | "browser-wasm";

export type NnrpTransportKind = "tcp" | "quic" | "webtransport" | "websocket";

export type NnrpTransportPolicy = "score" | "tcp-only" | "quic-only";

export type NnrpCapability =
  | "client.session"
  | "server.session"
  | "native.loader"
  | "wasm.loader"
  | "transport.tcp"
  | "transport.quic"
  | "transport.websocket"
  | "transport.webtransport"
  | "flow.update"
  | "result.hint"
  | "cache"
  | "schema"
  | "recovery";

export type NnrpDiagnosticSource = "core" | "native" | "wasm" | "transport" | "protocol" | "runtime";

export interface NnrpDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly source: NnrpDiagnosticSource;
  readonly retryable?: boolean;
  readonly transport?: NnrpTransportKind;
  readonly cause?: unknown;
}

export interface NnrpCapabilityManifest {
  readonly protocol: typeof NNRP_PROTOCOL_NAME;
  readonly version: string;
  readonly buildMode: NnrpBuildMode;
  readonly transports: readonly NnrpTransportKind[];
  readonly capabilities: readonly NnrpCapability[];
}

export type NnrpTransportRejectionReason =
  | "peer-unsupported"
  | "local-unavailable"
  | "policy-rejected"
  | "probe-failed";

export interface NnrpTransportCandidate {
  readonly kind: NnrpTransportKind;
  readonly peerSupported: boolean;
  readonly localAvailable: boolean;
  readonly score: number;
  readonly rejectionReason?: NnrpTransportRejectionReason;
  readonly diagnostic?: NnrpDiagnostic;
}

export interface NnrpTransportSelection {
  readonly selected: NnrpTransportCandidate | null;
  readonly candidates: readonly NnrpTransportCandidate[];
  readonly policy: NnrpTransportPolicy;
}

export type NnrpInputProfile = "tensor" | "token" | "structured_event" | "tool_delta";

export type NnrpSubmitMode = "inline" | "object-reference";

export type NnrpBinaryPayload = Uint8Array | ArrayBufferView;

export interface NnrpTensorSection {
  readonly payload: NnrpBinaryPayload;
  readonly codecId?: number;
}

export interface NnrpCacheKey {
  readonly kind: string;
  readonly key: bigint | number | string;
  readonly namespaceId?: number;
}

export interface NnrpSubmitRequest {
  readonly frameId: number;
  readonly payload?: NnrpBinaryPayload;
  readonly tensors?: readonly NnrpTensorSection[];
  readonly inputProfile?: NnrpInputProfile;
  readonly submitMode?: NnrpSubmitMode;
  readonly cacheKey?: NnrpCacheKey;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpResult {
  readonly frameId: number;
  readonly payload?: Uint8Array;
  readonly diagnostic?: NnrpDiagnostic;
  readonly metadata?: Readonly<Record<string, string>>;
}

export type NnrpRuntimeEvent =
  | { readonly type: "result"; readonly result: NnrpResult }
  | { readonly type: "flow-update"; readonly credits: number; readonly diagnostic?: NnrpDiagnostic }
  | { readonly type: "result-hint"; readonly frameId: number; readonly diagnostic?: NnrpDiagnostic }
  | { readonly type: "drop"; readonly frameId: number; readonly diagnostic: NnrpDiagnostic }
  | { readonly type: "close"; readonly diagnostic?: NnrpDiagnostic }
  | { readonly type: "diagnostic"; readonly diagnostic: NnrpDiagnostic };

export class NnrpError extends Error {
  public readonly diagnostic: NnrpDiagnostic;

  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic.message);
    this.name = "NnrpError";
    this.diagnostic = diagnostic;
  }
}

export class NnrpCapabilityError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpCapabilityError";
  }
}

export class NnrpTransportError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpTransportError";
  }
}

export class NnrpTimeoutError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpTimeoutError";
  }
}

export class NnrpProtocolError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpProtocolError";
  }
}

export interface NnrpCapabilityManifestOptions {
  readonly buildMode: NnrpBuildMode;
  readonly transports?: readonly NnrpTransportKind[];
  readonly capabilities?: readonly NnrpCapability[];
}

export function createCapabilityManifest(options: NnrpCapabilityManifestOptions): NnrpCapabilityManifest {
  validateCapabilityManifestOptions(options);

  return {
    protocol: NNRP_PROTOCOL_NAME,
    version: NNRP_PROTOCOL_VERSION,
    buildMode: options.buildMode,
    transports: [...(options.transports ?? [])],
    capabilities: [...(options.capabilities ?? [])],
  };
}

export function createBackendNativeManifest(
  capabilities: readonly NnrpCapability[] = [],
): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp", "quic"],
    capabilities: ["client.session", "server.session", "native.loader", ...capabilities],
  });
}

export function createBrowserWasmManifest(
  capabilities: readonly NnrpCapability[] = [],
): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "browser-wasm",
    transports: ["websocket", "webtransport"],
    capabilities: ["client.session", "wasm.loader", ...capabilities],
  });
}

export function selectTransport(
  candidates: readonly NnrpTransportCandidate[],
  policy: NnrpTransportPolicy = "score",
): NnrpTransportSelection {
  const eligible = candidates
    .filter((candidate) => isTransportEligible(candidate, policy))
    .sort((left, right) => right.score - left.score);

  return {
    selected: eligible[0] ?? null,
    candidates: [...candidates],
    policy,
  };
}

function isTransportEligible(candidate: NnrpTransportCandidate, policy: NnrpTransportPolicy): boolean {
  if (!candidate.peerSupported || !candidate.localAvailable) {
    return false;
  }

  if (policy === "tcp-only") {
    return candidate.kind === "tcp";
  }

  if (policy === "quic-only") {
    return candidate.kind === "quic";
  }

  return true;
}

function validateCapabilityManifestOptions(options: NnrpCapabilityManifestOptions): void {
  const transports = options.transports ?? [];
  const capabilities = options.capabilities ?? [];

  if (options.buildMode === "browser-wasm") {
    if (capabilities.includes("server.session") || capabilities.includes("native.loader")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_BROWSER_FORBIDDEN",
        message: "Browser WASM manifests cannot claim server or native loader capabilities.",
        source: "core",
        retryable: false,
      });
    }

    if (transports.includes("tcp") || transports.includes("quic")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_BROWSER_TRANSPORT_FORBIDDEN",
        message: "Browser WASM manifests cannot claim native TCP or QUIC transports.",
        source: "core",
        retryable: false,
      });
    }
  }

  if (options.buildMode === "backend-native") {
    if (transports.includes("websocket") || transports.includes("webtransport")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_NATIVE_TRANSPORT_FORBIDDEN",
        message: "Backend native manifests cannot claim browser transport slots without an explicit adapter.",
        source: "core",
        retryable: false,
      });
    }
  }
}
