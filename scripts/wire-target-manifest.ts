import { createCapabilityManifest, type NnrpCapability, type NnrpTransportKind } from "@nnrp/core";

export const NNRP_WIRE_PROTOCOL_VERSION = "nnrp-1-preview4" as const;
export const NNRP_WIRE_TARGET_SCHEMA =
  "https://github.com/NagareWorks/nnrp-conformance/schemas/wire-conformance-target.schema.json" as const;

export type WireConformanceMode = "suite_as_client" | "suite_as_server" | "suite_as_proxy";

export interface WireConformanceTransportEndpoint {
  readonly name: NnrpTransportKind;
  readonly endpoint: string;
  readonly tls: boolean;
}

export interface WireConformanceTargetManifest {
  readonly $schema: typeof NNRP_WIRE_TARGET_SCHEMA;
  readonly target_name: string;
  readonly protocol_version: typeof NNRP_WIRE_PROTOCOL_VERSION;
  readonly suite_version: string;
  readonly wire_conformance: {
    readonly modes: readonly WireConformanceMode[];
    readonly transports: readonly WireConformanceTransportEndpoint[];
    readonly capabilities: readonly NnrpCapability[];
    readonly limits: {
      readonly max_frame_bytes: number;
      readonly max_in_flight: number;
    };
  };
}

export interface WireConformanceTargetOptions {
  readonly targetName: string;
  readonly suiteVersion: string;
  readonly modes: readonly WireConformanceMode[];
  readonly transports: readonly WireConformanceTransportEndpoint[];
  readonly capabilities: readonly NnrpCapability[];
  readonly maxFrameBytes: number;
  readonly maxInFlight: number;
}

const WIRE_MODES = new Set<WireConformanceMode>(["suite_as_client", "suite_as_server", "suite_as_proxy"]);
const TRANSPORT_KINDS = new Set<NnrpTransportKind>(["tcp", "quic", "ipc", "websocket"]);

export function createWireConformanceTargetManifest(
  options: WireConformanceTargetOptions,
): WireConformanceTargetManifest {
  const manifest: WireConformanceTargetManifest = {
    $schema: NNRP_WIRE_TARGET_SCHEMA,
    target_name: options.targetName,
    protocol_version: NNRP_WIRE_PROTOCOL_VERSION,
    suite_version: options.suiteVersion,
    wire_conformance: {
      modes: [...options.modes],
      transports: options.transports.map((transport) => ({ ...transport })),
      capabilities: [...options.capabilities],
      limits: {
        max_frame_bytes: options.maxFrameBytes,
        max_in_flight: options.maxInFlight,
      },
    },
  };

  validateWireConformanceTargetManifest(manifest);
  return manifest;
}

export function validateWireConformanceTargetManifest(value: unknown): asserts value is WireConformanceTargetManifest {
  const manifest = exactRecord(value, [
    "$schema",
    "target_name",
    "protocol_version",
    "suite_version",
    "wire_conformance",
  ], "wire target manifest");
  requireEqual(manifest.$schema, NNRP_WIRE_TARGET_SCHEMA, "$schema");
  requireNonEmptyString(manifest.target_name, "target_name");
  requireEqual(manifest.protocol_version, NNRP_WIRE_PROTOCOL_VERSION, "protocol_version");
  requireNonEmptyString(manifest.suite_version, "suite_version");

  const wire = exactRecord(
    manifest.wire_conformance,
    ["modes", "transports", "capabilities", "limits"],
    "wire_conformance",
  );
  const modes = nonEmptyArray(wire.modes, "wire_conformance.modes");
  for (const mode of modes) {
    if (typeof mode !== "string" || !WIRE_MODES.has(mode as WireConformanceMode)) {
      throw new Error(`wire_conformance.modes contains unsupported mode: ${String(mode)}`);
    }
  }
  requireUniqueStrings(modes, "wire_conformance.modes");

  const transports = nonEmptyArray(wire.transports, "wire_conformance.transports");
  for (const [index, transportValue] of transports.entries()) {
    const path = `wire_conformance.transports[${index}]`;
    const transport = exactRecord(transportValue, ["name", "endpoint", "tls"], path);
    if (typeof transport.name !== "string" || !TRANSPORT_KINDS.has(transport.name as NnrpTransportKind)) {
      throw new Error(`${path}.name contains unsupported transport: ${String(transport.name)}`);
    }
    requireNonEmptyString(transport.endpoint, `${path}.endpoint`);
    if (typeof transport.tls !== "boolean") {
      throw new Error(`${path}.tls must be a boolean.`);
    }
  }

  const capabilities = nonEmptyArray(wire.capabilities, "wire_conformance.capabilities");
  requireUniqueStrings(capabilities, "wire_conformance.capabilities");
  createCapabilityManifest({
    buildMode: "backend-native",
    transports: transports.map((transport) => (transport as { readonly name: NnrpTransportKind }).name),
    capabilities: capabilities as NnrpCapability[],
  });

  const limits = exactRecord(
    wire.limits,
    ["max_frame_bytes", "max_in_flight"],
    "wire_conformance.limits",
  );
  requirePositiveInteger(limits.max_frame_bytes, "wire_conformance.limits.max_frame_bytes");
  requirePositiveInteger(limits.max_in_flight, "wire_conformance.limits.max_in_flight");
}

function exactRecord(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...keys].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`${path} must contain exactly: ${expectedKeys.join(", ")}.`);
  }
  return record;
}

function nonEmptyArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty array.`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
}

function requireEqual(value: unknown, expected: string, path: string): void {
  if (value !== expected) {
    throw new Error(`${path} must equal ${expected}.`);
  }
}

function requirePositiveInteger(value: unknown, path: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${path} must be a positive integer.`);
  }
}

function requireUniqueStrings(values: readonly unknown[], path: string): void {
  if (values.some((value) => typeof value !== "string") || new Set(values).size !== values.length) {
    throw new Error(`${path} must contain unique strings.`);
  }
}
