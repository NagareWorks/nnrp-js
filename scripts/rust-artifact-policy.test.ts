import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  BROWSER_WASM_REQUIRED_EXPORTS,
  NATIVE_ARTIFACTS,
  normalizeBrowserArtifactManifest,
  normalizeNativeArtifactManifest,
  parseReleaseChecksums,
} from "./rust-artifact-policy.ts";

Deno.test("native artifact policy covers every Rust Preview4 target", () => {
  assertEquals(NATIVE_ARTIFACTS.length, 16);
  assertEquals(new Set(NATIVE_ARTIFACTS.map(({ artifactTag }) => artifactTag)).size, 16);
  assertEquals(NATIVE_ARTIFACTS.filter(({ os }) => os === "android").length, 4);
  assertEquals(NATIVE_ARTIFACTS.filter(({ os }) => os === "ios").length, 3);
});

Deno.test("release checksums accept binary and text sha256sum formats", () => {
  const checksums = parseReleaseChecksums(
    `${"a".repeat(64)}  archive-one.zip\n${"B".repeat(64)} *archive-two.zip\n`,
  );
  assertEquals(checksums.get("archive-one.zip"), "a".repeat(64));
  assertEquals(checksums.get("archive-two.zip"), "b".repeat(64));
});

Deno.test("release checksums reject malformed evidence", () => {
  assertThrows(() => parseReleaseChecksums("not-a-checksum archive.zip"), Error, "invalid SHA256SUMS line 1");
});

Deno.test("native artifact manifests are scoped and normalized for npm", () => {
  const policy = NATIVE_ARTIFACTS.find(({ artifactTag }) => artifactTag === "windows-x86_64")!;
  const manifest = normalizeNativeArtifactManifest(
    {
      package: "nnrp-ffi-transport-websocket",
      transport_name: "websocket",
      transport_scope: "websocket",
      transport_slots: ["websocket"],
      protocol_version: "NNRP/1",
      abi_version: "3.0.0",
      enabled_features: ["transport-websocket"],
      os: "windows",
      arch: "x86_64",
      target: "x86_64-pc-windows-msvc",
      library: "nnrp_ffi.dll",
      header: "include/nnrp/nnrp.h",
      headers: ["include/nnrp/nnrp.h"],
      legacy_header: "nnrp_ffi.h",
    },
    policy,
    "websocket",
    {
      release: "v1.0.0-preview.4.10",
      archive: "websocket.zip",
      archiveSha256: "c".repeat(64),
    },
  );

  assertEquals(manifest.source_archive_sha256, "c".repeat(64));
  assertEquals(manifest.transport_slots, ["websocket"]);
  assertEquals("header" in manifest, false);
  assertEquals("headers" in manifest, false);
  assertEquals("legacy_header" in manifest, false);
});

Deno.test("browser artifact manifests enforce the frozen browser-only SDK boundary", () => {
  const manifest = normalizeBrowserArtifactManifest(
    {
      package: "nnrp-wasm",
      artifact: "nnrp-wasm-browser",
      transport_name: "browser",
      transport_scope: "browser",
      transport_slots: ["websocket"],
      protocol_version: "NNRP/1",
      abi_version: "1.0.0",
      enabled_features: ["transport-websocket", "wasm-provider"],
      provider: {
        id: "nnrp.transport.websocket.browser-wasm",
        cost: { model_id: 0, units: "0" },
        preference_rank: 3,
        limits: { max_frame_bytes: "67108864" },
        limitations: ["requires-tcp", "browser-host-only"],
      },
      wasm: "nnrp_wasm_bg.wasm",
      glue: "nnrp_wasm.js",
      types: "nnrp_wasm.d.ts",
      owner: "nnrp-rs",
      downstream_wrapper: "nnrp-js",
      exports: [...BROWSER_WASM_REQUIRED_EXPORTS],
    },
    {
      release: "v1.0.0-preview.4.10",
      archive: "nnrp-wasm-browser-1.0.0-preview.4.10.zip",
      archiveSha256: "e".repeat(64),
    },
  );

  assertEquals(manifest.source_release, "v1.0.0-preview.4.10");
  assertEquals(manifest.source_archive_sha256, "e".repeat(64));
  assertEquals(manifest.transport_slots, ["websocket"]);
});

Deno.test("browser artifact manifests reject stale scoring exports", () => {
  assertThrows(
    () =>
      normalizeBrowserArtifactManifest(
        {
          package: "nnrp-wasm",
          artifact: "nnrp-wasm-browser",
          transport_name: "browser",
          transport_scope: "browser",
          transport_slots: ["websocket"],
          protocol_version: "NNRP/1",
          abi_version: "1.0.0",
          enabled_features: ["transport-websocket", "wasm-provider"],
          provider: {
            id: "nnrp.transport.websocket.browser-wasm",
            cost: { model_id: 0, units: "0" },
            preference_rank: 3,
            limits: { max_frame_bytes: "67108864" },
            limitations: ["requires-tcp", "browser-host-only"],
          },
          wasm: "nnrp_wasm_bg.wasm",
          glue: "nnrp_wasm.js",
          types: "nnrp_wasm.d.ts",
          owner: "nnrp-rs",
          downstream_wrapper: "nnrp-js",
          exports: ["scoreProviderProbeJson"],
        },
        { release: "v1", archive: "stale-browser.zip", archiveSha256: "f".repeat(64) },
      ),
    Error,
    "missing browser WASM exports",
  );
});

Deno.test("native artifact manifests reject a mismatched transport scope", () => {
  const policy = NATIVE_ARTIFACTS[0]!;
  assertThrows(
    () =>
      normalizeNativeArtifactManifest(
        {
          package: "nnrp-ffi-transport-tcp",
          transport_name: "tcp",
          transport_scope: "quic",
          transport_slots: ["tcp"],
          abi_version: "3.0.0",
          os: policy.os,
          arch: policy.arch,
          library: policy.library,
        },
        policy,
        "tcp",
        { release: "v1", archive: "tcp.zip", archiveSha256: "d".repeat(64) },
      ),
    Error,
    "transport_scope must be tcp",
  );
});

Deno.test("native artifact manifests reject the superseded Preview4 ABI", () => {
  const policy = NATIVE_ARTIFACTS[0]!;
  assertThrows(
    () =>
      normalizeNativeArtifactManifest(
        {
          package: "nnrp-ffi-transport-tcp",
          transport_name: "tcp",
          transport_scope: "tcp",
          transport_slots: ["tcp"],
          abi_version: "1.12.1",
          os: policy.os,
          arch: policy.arch,
          library: policy.library,
        },
        policy,
        "tcp",
        { release: "v1", archive: "tcp-old-abi.zip", archiveSha256: "a".repeat(64) },
      ),
    Error,
    "expected Rust ABI 3.0.0",
  );
});
