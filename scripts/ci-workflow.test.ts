import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const ciWorkflow = await Deno.readTextFile(".github/workflows/ci.yml");
const installedPackageSmoke = await Deno.readTextFile("scripts/check-installed-package-smoke.ts");
const nodeImportSmoke = await Deno.readTextFile("scripts/check-node-import-smoke.mjs");

Deno.test("commit policy preserves develop-to-main history without weakening feature PRs", () => {
  assertStringIncludes(ciWorkflow, 'base_ref="${{ github.base_ref }}"');
  assertStringIncludes(ciWorkflow, 'head_ref="${{ github.head_ref }}"');
  assertStringIncludes(ciWorkflow, 'if [[ "$base_ref" == "main" && "$head_ref" == "develop" ]]; then');
  assertStringIncludes(ciWorkflow, 'if [[ "$integration_pr" != "true" && "$count" -ne 1 ]]; then');
  assertStringIncludes(ciWorkflow, 'done < <(git log --format=%s "$range")');
  assertEquals(ciWorkflow.includes('if [[ "$count" -ne 1 ]]'), false);
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
