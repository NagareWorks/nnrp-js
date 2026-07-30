import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const ciWorkflow = await Deno.readTextFile(".github/workflows/ci.yml");
const installedPackageSmoke = await Deno.readTextFile("scripts/check-installed-package-smoke.ts");
const nodeImportSmoke = await Deno.readTextFile("scripts/check-node-import-smoke.mjs");
const preview4Adapter = await Deno.readTextFile("scripts/preview4-adapter.ts");
const preview4Contract = await Deno.readTextFile("scripts/preview4-conformance-contract.ts");
const preview4Capabilities = await Deno.readTextFile("conformance/nnrp-1-preview4.capabilities.json");

const CONFORMANCE_REVISION = "ef031b8a77c59f33068cd20e584a7f802347a4ff";

Deno.test("commit policy preserves develop-to-main history without weakening feature PRs", () => {
  assertStringIncludes(ciWorkflow, 'base_ref="${{ github.base_ref }}"');
  assertStringIncludes(ciWorkflow, 'head_ref="${{ github.head_ref }}"');
  assertStringIncludes(ciWorkflow, 'if [[ "$base_ref" == "main" && "$head_ref" == "develop" ]]; then');
  assertStringIncludes(
    ciWorkflow,
    "Develop-to-main integration PR detected; preserving reviewed integration history is allowed.",
  );
  assertStringIncludes(ciWorkflow, 'if [[ "$count" -ne 1 ]]; then');
  assertStringIncludes(ciWorkflow, 'done < <(git log --format=%s "$range")');
  assertEquals(ciWorkflow.includes("integration_pr"), false);
});

Deno.test("docs-only classification does not depend on a shallow merge base", () => {
  assertStringIncludes(ciWorkflow, 'base="${{ github.event.pull_request.base.sha }}"');
  assertStringIncludes(ciWorkflow, 'head="${{ github.event.pull_request.head.sha }}"');
  assertStringIncludes(ciWorkflow, 'git diff --name-only "$base" "$head"');
  assertEquals(ciWorkflow.includes('git fetch --no-tags --depth=1 origin "${{ github.base_ref }}"'), false);
});

Deno.test("CI requires Windows x86 Node foreign ABI E2E", () => {
  assertStringIncludes(ciWorkflow, "native-node-windows-x86:");
  assertStringIncludes(ciWorkflow, "architecture: x86");
  assertStringIncludes(ciWorkflow, "@koromix/koffi-win32-ia32@3.1.1");
  assertStringIncludes(ciWorkflow, "Run x86 Node native role E2E");
  assertStringIncludes(ciWorkflow, "deno task node-import-smoke");
  assertStringIncludes(ciWorkflow, "- native-node-windows-x86");
  assertStringIncludes(ciWorkflow, "native-node-windows-x86 did not pass");
});

Deno.test("installed tarballs run the real Node role E2E", () => {
  assertStringIncludes(installedPackageSmoke, 'await run("node", ["native-role-smoke.mjs", "--installed"]');
  assertStringIncludes(installedPackageSmoke, 'nodeNativeRole: "passed"');
  assertStringIncludes(nodeImportSmoke, 'const installedMode = process.argv.includes("--installed")');
  assertStringIncludes(nodeImportSmoke, "await serverSession.sendPartialResult");
  assertStringIncludes(nodeImportSmoke, "await serverSession.sendResult");
  assertStringIncludes(nodeImportSmoke, "for (let exchange = 1; exchange <= 2; exchange += 1)");
});

Deno.test("CI gates Preview4 with suite-owned adapter and wire conformance", () => {
  assertEquals(ciWorkflow.match(new RegExp(CONFORMANCE_REVISION, "g"))?.length ?? 0, 3);
  assertStringIncludes(ciWorkflow, "suite-conformance:");
  assertStringIncludes(ciWorkflow, "uses: ./.conformance/.github/actions/run-conformance");
  assertStringIncludes(ciWorkflow, "protocol-version: nnrp-1-preview4");
  assertStringIncludes(ciWorkflow, "capabilities-path: conformance/nnrp-1-preview4.capabilities.json");
  assertStringIncludes(ciWorkflow, "deno task conformance:suite");
  assertStringIncludes(ciWorkflow, "- suite-conformance");
  assertStringIncludes(ciWorkflow, "suite-conformance did not pass");
  assertStringIncludes(preview4Adapter, "const CASE_EXECUTORS");
  assertStringIncludes(preview4Contract, '"l1.control.recoverable-error"');
  assertEquals(JSON.parse(preview4Capabilities).supports.length, 19);
});
