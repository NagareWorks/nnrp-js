export const NNRP_PROTOCOL_NAME = "NNRP";
export const NNRP_PREVIEW_VERSION = "1.0.0-preview.3";

export type TransportKind = "tcp" | "quic" | "webtransport" | "websocket";

export interface CapabilityManifest {
  readonly protocol: typeof NNRP_PROTOCOL_NAME;
  readonly version: string;
  readonly transports: readonly TransportKind[];
  readonly features: readonly string[];
}

export interface TransportCandidate {
  readonly kind: TransportKind;
  readonly peerSupported: boolean;
  readonly localAvailable: boolean;
  readonly score: number;
}

export interface TransportSelection {
  readonly selected: TransportCandidate | null;
  readonly candidates: readonly TransportCandidate[];
}

export function createPreviewManifest(features: readonly string[] = []): CapabilityManifest {
  return {
    protocol: NNRP_PROTOCOL_NAME,
    version: NNRP_PREVIEW_VERSION,
    transports: ["tcp", "quic"],
    features,
  };
}

export function selectTransport(candidates: readonly TransportCandidate[]): TransportSelection {
  const eligible = candidates
    .filter((candidate) => candidate.peerSupported && candidate.localAvailable)
    .sort((left, right) => right.score - left.score);

  return {
    selected: eligible[0] ?? null,
    candidates: [...candidates],
  };
}
