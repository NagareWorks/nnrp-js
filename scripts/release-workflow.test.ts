import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const releaseWorkflow = await Deno.readTextFile(".github/workflows/release.yml");
const artifactPreparation = await Deno.readTextFile("scripts/prepare-rust-artifact-packages.ts");

Deno.test("release workflow and local preparation pin Rust preview4.3", () => {
  assertEquals(releaseWorkflow.match(/1\.0\.0-preview\.4\.3/g)?.length, 3);
  assertStringIncludes(artifactPreparation, 'DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.3"');
  assertEquals(releaseWorkflow.includes("1.0.0-preview.4.2"), false);
  assertEquals(artifactPreparation.includes("1.0.0-preview.4.2"), false);
});

Deno.test("native benchmark downloads the scoped TCP runtime", () => {
  assertStringIncludes(
    releaseWorkflow,
    'asset="nnrp-ffi-transport-tcp-native-linux-x86_64-${RUST_ARTIFACT_VERSION}.zip"',
  );
  assertEquals(releaseWorkflow.includes('asset="nnrp-ffi-native-linux-x86_64-'), false);
});
