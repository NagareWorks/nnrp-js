export type NativeTransportScope = "tcp" | "quic" | "ipc" | "websocket";

export interface NativeArtifactPolicy {
  readonly artifactTag: string;
  readonly os: string;
  readonly arch: string;
  readonly library: string;
}

export interface NormalizedNativeArtifactManifest extends Record<string, unknown> {
  readonly package: string;
  readonly transport_name: NativeTransportScope;
  readonly transport_scope: NativeTransportScope;
  readonly transport_slots: readonly NativeTransportScope[];
  readonly abi_version: string;
  readonly os: string;
  readonly arch: string;
  readonly library: string;
  readonly source_release: string;
  readonly source_archive: string;
  readonly source_archive_sha256: string;
}

export interface NormalizedBrowserArtifactManifest extends Record<string, unknown> {
  readonly package: "nnrp-wasm";
  readonly artifact: "nnrp-wasm-browser";
  readonly transport_name: "browser";
  readonly transport_scope: "browser";
  readonly transport_slots: readonly ["websocket"];
  readonly protocol_version: "NNRP/1";
  readonly abi_version: string;
  readonly wasm: "nnrp_wasm.wasm";
  readonly types: "nnrp_wasm.d.ts";
  readonly exports: readonly string[];
  readonly source_release: string;
  readonly source_archive: string;
  readonly source_archive_sha256: string;
}

export const BROWSER_WASM_REQUIRED_EXPORTS = [
  "nnrp_wasm_protocol_major",
  "nnrp_wasm_wire_format",
  "selectTransportWithProbeJson",
  "summarizeProviderProbeJson",
  "encodeWebSocketBinaryFrameJson",
  "decodeWebSocketBinaryFrameJson",
  "decodeWebSocketBinaryFrameBatchJson",
  "encodeRuntimeControlMetadataJson",
  "decodeRuntimeControlMetadataJson",
  "encodeRuntimeObjectMetadataJson",
  "decodeRuntimeObjectMetadataJson",
] as const;

export const NATIVE_ARTIFACTS: readonly NativeArtifactPolicy[] = [
  { artifactTag: "windows-x86_64", os: "windows", arch: "x86_64", library: "nnrp_ffi.dll" },
  { artifactTag: "windows-x86", os: "windows", arch: "x86", library: "nnrp_ffi.dll" },
  { artifactTag: "windows-aarch64", os: "windows", arch: "aarch64", library: "nnrp_ffi.dll" },
  { artifactTag: "macos-x86_64", os: "macos", arch: "x86_64", library: "libnnrp_ffi.dylib" },
  { artifactTag: "macos-aarch64", os: "macos", arch: "aarch64", library: "libnnrp_ffi.dylib" },
  { artifactTag: "linux-x86_64", os: "linux", arch: "x86_64", library: "libnnrp_ffi.so" },
  { artifactTag: "linux-x86", os: "linux", arch: "x86", library: "libnnrp_ffi.so" },
  { artifactTag: "linux-aarch64", os: "linux", arch: "aarch64", library: "libnnrp_ffi.so" },
  { artifactTag: "linux-armv7", os: "linux", arch: "armv7", library: "libnnrp_ffi.so" },
  { artifactTag: "android-x86_64", os: "android", arch: "x86_64", library: "libnnrp_ffi.so" },
  { artifactTag: "android-x86", os: "android", arch: "x86", library: "libnnrp_ffi.so" },
  { artifactTag: "android-aarch64", os: "android", arch: "aarch64", library: "libnnrp_ffi.so" },
  { artifactTag: "android-armv7", os: "android", arch: "armv7", library: "libnnrp_ffi.so" },
  { artifactTag: "ios-aarch64", os: "ios", arch: "aarch64", library: "libnnrp_ffi.a" },
  { artifactTag: "ios-aarch64-sim", os: "ios", arch: "aarch64-sim", library: "libnnrp_ffi.a" },
  { artifactTag: "ios-x86_64-sim", os: "ios", arch: "x86_64-sim", library: "libnnrp_ffi.a" },
] as const;

export function parseReleaseChecksums(contents: string): ReadonlyMap<string, string> {
  const checksums = new Map<string, string>();
  for (const [index, rawLine] of contents.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/u.exec(line);
    if (match === null) {
      throw new Error(`invalid SHA256SUMS line ${index + 1}`);
    }
    checksums.set(match[2]!, match[1]!.toLowerCase());
  }
  return checksums;
}

export function normalizeNativeArtifactManifest(
  value: unknown,
  policy: NativeArtifactPolicy,
  transport: NativeTransportScope,
  source: {
    readonly release: string;
    readonly archive: string;
    readonly archiveSha256: string;
  },
): NormalizedNativeArtifactManifest {
  if (!isRecord(value)) {
    throw new Error(`${source.archive}: manifest must be a JSON object`);
  }
  assertEqual(value.transport_name, transport, source.archive, "transport_name");
  assertEqual(value.transport_scope, transport, source.archive, "transport_scope");
  assertEqual(value.os, policy.os, source.archive, "os");
  assertEqual(value.arch, policy.arch, source.archive, "arch");
  assertEqual(value.library, policy.library, source.archive, "library");
  if (
    !Array.isArray(value.transport_slots) || value.transport_slots.length !== 1 ||
    value.transport_slots[0] !== transport
  ) {
    throw new Error(`${source.archive}: transport_slots must contain only ${transport}`);
  }
  if (typeof value.abi_version !== "string" || !/^1\.12\.\d+$/u.test(value.abi_version)) {
    throw new Error(`${source.archive}: expected Rust ABI 1.12.x`);
  }
  if (typeof value.package !== "string" || value.package !== `nnrp-ffi-transport-${transport}`) {
    throw new Error(`${source.archive}: package does not match ${transport} transport scope`);
  }
  if (!/^[0-9a-f]{64}$/u.test(source.archiveSha256)) {
    throw new Error(`${source.archive}: source archive SHA-256 is invalid`);
  }

  const { header: _header, headers: _headers, legacy_header: _legacyHeader, ...runtimeManifest } = value;
  return {
    ...runtimeManifest,
    package: value.package,
    transport_name: transport,
    transport_scope: transport,
    transport_slots: [transport],
    abi_version: value.abi_version,
    os: policy.os,
    arch: policy.arch,
    library: policy.library,
    source_release: source.release,
    source_archive: source.archive,
    source_archive_sha256: source.archiveSha256,
  } as NormalizedNativeArtifactManifest;
}

export function normalizeBrowserArtifactManifest(
  value: unknown,
  source: {
    readonly release: string;
    readonly archive: string;
    readonly archiveSha256: string;
  },
): NormalizedBrowserArtifactManifest {
  if (!isRecord(value)) {
    throw new Error(`${source.archive}: manifest must be a JSON object`);
  }
  assertEqual(value.package, "nnrp-wasm", source.archive, "package");
  assertEqual(value.artifact, "nnrp-wasm-browser", source.archive, "artifact");
  assertEqual(value.transport_name, "browser", source.archive, "transport_name");
  assertEqual(value.transport_scope, "browser", source.archive, "transport_scope");
  assertStringArray(value.transport_slots, ["websocket"], source.archive, "transport_slots");
  assertEqual(value.protocol_version, "NNRP/1", source.archive, "protocol_version");
  assertStringArray(
    value.enabled_features,
    ["transport-websocket", "wasm-provider"],
    source.archive,
    "enabled_features",
  );
  assertEqual(value.wasm, "nnrp_wasm.wasm", source.archive, "wasm");
  assertEqual(value.types, "nnrp_wasm.d.ts", source.archive, "types");
  assertEqual(value.owner, "nnrp-rs", source.archive, "owner");
  assertEqual(value.downstream_wrapper, "nnrp-js", source.archive, "downstream_wrapper");
  if (typeof value.abi_version !== "string" || !/^1\.\d+\.\d+$/u.test(value.abi_version)) {
    throw new Error(`${source.archive}: expected browser WASM ABI 1.x`);
  }
  if (!Array.isArray(value.exports) || value.exports.some((entry) => typeof entry !== "string")) {
    throw new Error(`${source.archive}: exports must be a string array`);
  }
  const exports = value.exports as string[];
  const missingExports = BROWSER_WASM_REQUIRED_EXPORTS.filter((entry) => !exports.includes(entry));
  if (missingExports.length > 0) {
    throw new Error(`${source.archive}: missing browser WASM exports: ${missingExports.join(", ")}`);
  }
  assertBrowserProviderMetadata(value.provider, source.archive);
  if (!/^[0-9a-f]{64}$/u.test(source.archiveSha256)) {
    throw new Error(`${source.archive}: source archive SHA-256 is invalid`);
  }

  return {
    ...value,
    package: "nnrp-wasm",
    artifact: "nnrp-wasm-browser",
    transport_name: "browser",
    transport_scope: "browser",
    transport_slots: ["websocket"],
    protocol_version: "NNRP/1",
    abi_version: value.abi_version,
    wasm: "nnrp_wasm.wasm",
    types: "nnrp_wasm.d.ts",
    exports,
    source_release: source.release,
    source_archive: source.archive,
    source_archive_sha256: source.archiveSha256,
  } as NormalizedBrowserArtifactManifest;
}

function assertBrowserProviderMetadata(value: unknown, archive: string): void {
  if (!isRecord(value)) {
    throw new Error(`${archive}: provider must be a JSON object`);
  }
  assertEqual(value.id, "nnrp.transport.websocket.browser-wasm", archive, "provider.id");
  if (!isRecord(value.cost) || value.cost.model_id !== 0 || value.cost.units !== "0") {
    throw new Error(`${archive}: provider.cost must be the frozen unspecified cost`);
  }
  if (value.preference_rank !== 3) {
    throw new Error(`${archive}: provider.preference_rank must be 3`);
  }
  if (!isRecord(value.limits) || value.limits.max_frame_bytes !== "67108864") {
    throw new Error(`${archive}: provider.limits.max_frame_bytes must be 67108864`);
  }
  assertStringArray(
    value.limitations,
    ["requires-tcp", "browser-host-only"],
    archive,
    "provider.limitations",
  );
}

function assertStringArray(actual: unknown, expected: readonly string[], archive: string, field: string): void {
  if (
    !Array.isArray(actual) || actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    throw new Error(`${archive}: ${field} must be ${expected.join(",")}`);
  }
}

function assertEqual(actual: unknown, expected: string, archive: string, field: string): void {
  if (actual !== expected) {
    throw new Error(`${archive}: ${field} must be ${expected}, got ${String(actual)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
