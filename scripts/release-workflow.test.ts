import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const releaseWorkflow = await Deno.readTextFile(".github/workflows/release.yml");
const artifactPreparation = await Deno.readTextFile("scripts/prepare-rust-artifact-packages.ts");
const sdkReporting = await Deno.readTextFile("scripts/sdk-reporting.ts");
const dryRunArtifacts = await Deno.readTextFile("scripts/create-release-dry-run-artifacts.ts");
const publishPackages = await Deno.readTextFile("scripts/publish-packages.ts");
const gitignore = await Deno.readTextFile(".gitignore");

Deno.test("release workflow and local preparation pin Rust preview4.17", () => {
  assertEquals((releaseWorkflow.match(/1\.0\.0-preview\.4\.17/g)?.length ?? 0) >= 3, true);
  assertStringIncludes(artifactPreparation, 'DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.17"');
  assertStringIncludes(sdkReporting, 'DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.17"');
  assertEquals(releaseWorkflow.includes("1.0.0-preview.4.16"), false);
  assertEquals(artifactPreparation.includes("1.0.0-preview.4.16"), false);
  assertEquals(sdkReporting.includes("1.0.0-preview.4.16"), false);
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

Deno.test("release publishes packages before creating the immutable git tag", () => {
  const publishIndex = releaseWorkflow.indexOf("- name: Publish packages");
  const tagIndex = releaseWorkflow.indexOf("- name: Create or verify git tag");
  const githubReleaseIndex = releaseWorkflow.indexOf("- name: Publish GitHub release");
  assertEquals(publishIndex >= 0, true);
  assertEquals(tagIndex > publishIndex, true);
  assertEquals(githubReleaseIndex > tagIndex, true);
  assertStringIncludes(releaseWorkflow, 'existing="$(git rev-list -n 1 "$tag" 2>/dev/null || true)"');
  assertStringIncludes(releaseWorkflow, 'if [ -n "$existing" ] && [ "$existing" != "$target" ]; then');
  assertStringIncludes(releaseWorkflow, "Manual tag creation requires publish_to_npm=true");
  assertStringIncludes(releaseWorkflow, "Dry-run releases cannot create immutable Git tags.");
});

Deno.test("publish automation stages dependency order and rejects mismatched existing versions", () => {
  const coreIndex = publishPackages.indexOf('{ name: "@nnrp/core"');
  const tcpIndex = publishPackages.indexOf('{ name: "@nnrp/transport-tcp"');
  const websocketIndex = publishPackages.indexOf('{ name: "@nnrp/transport-websocket"');
  const nativeClientIndex = publishPackages.indexOf('{ name: "@nnrp/native-client"');
  const browserClientIndex = publishPackages.indexOf('{ name: "@nnrp/browser-client"');
  assertEquals(coreIndex >= 0, true);
  assertEquals(tcpIndex > coreIndex, true);
  assertEquals(websocketIndex > tcpIndex, true);
  assertEquals(nativeClientIndex > websocketIndex, true);
  assertEquals(browserClientIndex > nativeClientIndex, true);
  assertStringIncludes(publishPackages, "registry integrity ${publishedIntegrity}");
  assertStringIncludes(publishPackages, "already exists with identical integrity");
  assertStringIncludes(publishPackages, 'stderr.includes("E404")');
  assertStringIncludes(publishPackages, "npm registry inspection failed");
});

Deno.test("trusted publishing applies one canonical tag and verifies it after every package exists", () => {
  const publishLoopIndex = publishPackages.indexOf("for (const entry of publicationPlan)");
  const verifyPackagesIndex = publishPackages.indexOf("await verifyPublishedPackages(stagedPackages)");
  const verifyTagsIndex = publishPackages.indexOf("await verifyDistTags(stagedPackages");
  assertEquals(publishLoopIndex >= 0, true);
  assertEquals(verifyPackagesIndex > publishLoopIndex, true);
  assertEquals(verifyTagsIndex > verifyPackagesIndex, true);
  assertStringIncludes(publishPackages, '"--tag",\n    options.tag');
  assertStringIncludes(publishPackages, "Additional npm dist-tags cannot be assigned during Trusted Publishing.");
  assertStringIncludes(releaseWorkflow, 'args=(--tag "$NPM_TAG")');
  assertEquals(releaseWorkflow.includes("NPM_TOKEN"), false);
});
