import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const releaseWorkflow = await Deno.readTextFile(".github/workflows/release.yml");
const artifactPreparation = await Deno.readTextFile("scripts/prepare-rust-artifact-packages.ts");
const gitignore = await Deno.readTextFile(".gitignore");

Deno.test("release workflow and local preparation pin Rust preview4.9", () => {
  assertEquals(releaseWorkflow.match(/1\.0\.0-preview\.4\.9/g)?.length, 2);
  assertStringIncludes(artifactPreparation, 'DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.9"');
  assertEquals(releaseWorkflow.includes("1.0.0-preview.4.4"), false);
  assertEquals(artifactPreparation.includes("1.0.0-preview.4.4"), false);
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

Deno.test("native benchmark reuses package-owned prepared transport artifacts", () => {
  assertStringIncludes(
    releaseWorkflow,
    "deno task todo:release-check && deno task benchmark:smoke && deno task release-dry-run",
  );
  assertStringIncludes(releaseWorkflow, "deno task benchmark:conformance");
  assertEquals(releaseWorkflow.includes("NNRP_NATIVE_LIBRARY"), false);
  assertEquals(releaseWorkflow.includes("artifacts/native-benchmark"), false);
});
