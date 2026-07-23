import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const releaseWorkflow = await Deno.readTextFile(".github/workflows/release.yml");
const artifactPreparation = await Deno.readTextFile("scripts/prepare-rust-artifact-packages.ts");
const sdkReporting = await Deno.readTextFile("scripts/sdk-reporting.ts");
const dryRunArtifacts = await Deno.readTextFile("scripts/create-release-dry-run-artifacts.ts");
const gitignore = await Deno.readTextFile(".gitignore");

Deno.test("release workflow and local preparation pin Rust preview4.16", () => {
  assertEquals((releaseWorkflow.match(/1\.0\.0-preview\.4\.16/g)?.length ?? 0) >= 3, true);
  assertStringIncludes(artifactPreparation, 'DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.16"');
  assertStringIncludes(sdkReporting, 'DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.16"');
  assertEquals(releaseWorkflow.includes("1.0.0-preview.4.15"), false);
  assertEquals(artifactPreparation.includes("1.0.0-preview.4.15"), false);
  assertEquals(sdkReporting.includes("1.0.0-preview.4.15"), false);
  assertStringIncludes(dryRunArtifacts, "await writeJson(`${outputDir}/rust-artifacts.json`, rustArtifacts)");
  assertStringIncludes(dryRunArtifacts, 'readRequiredString(manifest, "source_archive_sha256", manifestPath)');
});

Deno.test("generated Rust artifacts stay out of source control for every package owner", () => {
  for (
    const path of [
      "packages/browser-client/wasm/",
      "packages/transport-tcp/native/",
      "packages/transport-quic/native/",
      "packages/transport-ipc/native/",
      "packages/transport-websocket/native/",
    ]
  ) {
    assertStringIncludes(gitignore, path);
  }
});

Deno.test("release benchmark separates production providers from the explicit Rust benchmark-ffi build", () => {
  assertStringIncludes(
    releaseWorkflow,
    "deno task todo:release-check && deno task benchmark:smoke && deno task release-dry-run",
  );
  assertStringIncludes(releaseWorkflow, "deno task benchmark:conformance");
  assertStringIncludes(releaseWorkflow, "--features benchmark-ffi,transport-tcp");
  assertStringIncludes(releaseWorkflow, "NNRP_JS_BENCHMARK_NATIVE_LIBRARY");
  assertStringIncludes(releaseWorkflow, "deno task benchmark:privacy");
});
