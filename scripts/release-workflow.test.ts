import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const releaseWorkflow = await Deno.readTextFile(".github/workflows/release.yml");
const ciWorkflow = await Deno.readTextFile(".github/workflows/ci.yml");
const denoConfig = await Deno.readTextFile("deno.json");
const artifactPreparation = await Deno.readTextFile("scripts/prepare-rust-artifact-packages.ts");
const sdkReporting = await Deno.readTextFile("scripts/sdk-reporting.ts");
const dryRunArtifacts = await Deno.readTextFile("scripts/create-release-dry-run-artifacts.ts");
const publishPackages = await Deno.readTextFile("scripts/publish-packages.ts");
const gitignore = await Deno.readTextFile(".gitignore");
const CONFORMANCE_REVISION = "b1836bcf372ac4fbd2a5f106cd09f6a628a4c647";

Deno.test("release workflow and local preparation pin Rust preview4.21", () => {
  assertEquals((releaseWorkflow.match(/1\.0\.0-preview\.4\.21/g)?.length ?? 0) >= 3, true);
  assertStringIncludes(artifactPreparation, 'DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.21"');
  assertStringIncludes(sdkReporting, 'DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.21"');
  assertEquals(releaseWorkflow.includes("1.0.0-preview.4.17"), false);
  assertEquals(releaseWorkflow.includes("1.0.0-preview.4.18"), false);
  assertEquals(artifactPreparation.includes("1.0.0-preview.4.17"), false);
  assertEquals(sdkReporting.includes("1.0.0-preview.4.17"), false);
  assertStringIncludes(dryRunArtifacts, "await writeJson(`${outputDir}/rust-artifacts.json`, rustArtifacts)");
  assertStringIncludes(dryRunArtifacts, 'readRequiredString(manifest, "source_archive_sha256", manifestPath)');
});

Deno.test("CI consumes an immutable successful Rust workflow artifact without weakening release inputs", () => {
  assertStringIncludes(ciWorkflow, 'NNRP_JS_RUST_ARTIFACT_RUN_ID: "30580835592"');
  assertStringIncludes(
    ciWorkflow,
    "NNRP_JS_RUST_ARTIFACT_COMMIT: bcebd1b309326a787f68c5b196dd733527fc1d81",
  );
  assertStringIncludes(artifactPreparation, "run.headSha !== expectedCommit");
  assertStringIncludes(artifactPreparation, 'run.status !== "completed" || run.conclusion !== "success"');
  assertStringIncludes(artifactPreparation, "nnrp-rs-release-${artifactVersion}");
  assertStringIncludes(denoConfig, "NNRP_JS_RUST_ARTIFACT_RUN_ID,NNRP_JS_RUST_ARTIFACT_COMMIT");
  assertEquals(releaseWorkflow.includes("NNRP_JS_RUST_ARTIFACT_RUN_ID"), false);
  assertEquals(releaseWorkflow.includes("NNRP_JS_RUST_ARTIFACT_COMMIT"), false);
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

Deno.test("release validates the complete Preview4 adapter suite before publishing", () => {
  assertStringIncludes(releaseWorkflow, CONFORMANCE_REVISION);
  assertStringIncludes(releaseWorkflow, "uses: ./.conformance/.github/actions/run-conformance");
  assertStringIncludes(releaseWorkflow, "protocol-version: nnrp-1-preview4");
  assertStringIncludes(releaseWorkflow, "capabilities-path: conformance/nnrp-1-preview4.capabilities.json");
  assertStringIncludes(releaseWorkflow, "deno task conformance:suite");
  const conformanceIndex = releaseWorkflow.indexOf("- name: Run suite-owned Preview4 adapter conformance");
  const publishIndex = releaseWorkflow.indexOf("- name: Publish packages");
  assertEquals(conformanceIndex >= 0, true);
  assertEquals(publishIndex > conformanceIndex, true);
});

Deno.test("release sanitizes Python linker state before preparing Rust artifacts", () => {
  const artifactPreparationLines = releaseWorkflow
    .split("\n")
    .filter((line) => line.includes("deno task artifacts:prepare"));
  assertEquals(artifactPreparationLines.length > 0, true);
  for (const line of artifactPreparationLines) {
    const sanitizeIndex = line.indexOf("env -u LD_LIBRARY_PATH");
    const preparationIndex = line.indexOf("deno task artifacts:prepare");
    assertEquals(sanitizeIndex >= 0, true);
    assertEquals(preparationIndex > sanitizeIndex, true);
  }
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
