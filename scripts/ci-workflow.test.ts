import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

const ciWorkflow = await Deno.readTextFile(".github/workflows/ci.yml");
const denoConfig = JSON.parse(await Deno.readTextFile("deno.json"));
const installedPackageSmoke = await Deno.readTextFile("scripts/check-installed-package-smoke.ts");
const nodeImportSmoke = await Deno.readTextFile("scripts/check-node-import-smoke.mjs");
const preview4Adapter = await Deno.readTextFile("scripts/preview4-adapter.ts");
const preview4Contract = await Deno.readTextFile("scripts/preview4-conformance-contract.ts");
const preview4Capabilities = await Deno.readTextFile("conformance/nnrp-1-preview4.capabilities.json");
const coverageGate = await Deno.readTextFile("scripts/run-coverage-gate.ts");
const browserRoleIntegration = await Deno.readTextFile(
  "packages/browser-client/test/browser-role.integration.test.ts",
);

const DOC_REVISION = "4319692b4c0a697fe5d360e55bafa2b83f5bbb3d";
const CONFORMANCE_REVISION = "d1c2bc6aee489e271a75567c45f56bd966fb90cb";

Deno.test("commit policy preserves develop-to-main history without weakening feature PRs", () => {
  assertStringIncludes(ciWorkflow, 'base_ref="${{ github.base_ref }}"');
  assertStringIncludes(ciWorkflow, 'head_ref="${{ github.head_ref }}"');
  assertStringIncludes(ciWorkflow, 'range="origin/$base_ref..HEAD"');
  assertEquals(ciWorkflow.includes('range="origin/$base_ref...HEAD"'), false);
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
  assertStringIncludes(nodeImportSmoke, "await serverSession.receiveSubmit");
  assertStringIncludes(nodeImportSmoke, "await operation.sendPartialResult");
  assertStringIncludes(nodeImportSmoke, "await operation.sendResult");
  assertStringIncludes(nodeImportSmoke, "for (let exchange = 1; exchange <= 2; exchange += 1)");
});

Deno.test("CI gates Preview4 with suite-owned adapter and wire conformance", () => {
  assertStringIncludes(ciWorkflow, `NNRP_CONFORMANCE_SOURCE_COMMIT: ${CONFORMANCE_REVISION}`);
  assertEquals(
    ciWorkflow.match(/ref: \$\{\{ env\.NNRP_CONFORMANCE_SOURCE_COMMIT \}\}/g)?.length ?? 0,
    3,
  );
  assertStringIncludes(ciWorkflow, "suite-conformance:");
  assertStringIncludes(ciWorkflow, "uses: ./.conformance/.github/actions/run-conformance");
  assertStringIncludes(ciWorkflow, "protocol-version: nnrp-1-preview4");
  assertStringIncludes(ciWorkflow, "capabilities-path: conformance/nnrp-1-preview4.capabilities.json");
  assertStringIncludes(ciWorkflow, 'require-complete-capability-coverage: "true"');
  assertStringIncludes(ciWorkflow, "deno task conformance:suite");
  assertStringIncludes(ciWorkflow, "- suite-conformance");
  assertStringIncludes(ciWorkflow, "suite-conformance did not pass");
  assertStringIncludes(preview4Adapter, "const CASE_EXECUTORS");
  assertStringIncludes(preview4Contract, '"l1.control.recoverable-error"');
  const capabilities = JSON.parse(preview4Capabilities).supports;
  assertEquals(capabilities.length, 28);
  assertEquals(capabilities.slice(0, 9), [
    "handshake.basic",
    "session.open_close",
    "session.resume",
    "flow_update",
    "frame_submit.tensor.inline",
    "result_push.basic",
    "cache.lifecycle",
    "transport.tcp",
    "transport.quic",
  ]);
});

Deno.test("CI compares the public API against the frozen nnrp-doc contract", () => {
  assertStringIncludes(ciWorkflow, "Checkout frozen SDK contract");
  assertStringIncludes(ciWorkflow, "repository: NagareWorks/nnrp-doc");
  assertStringIncludes(ciWorkflow, `NNRP_DOC_SOURCE_COMMIT: ${DOC_REVISION}`);
  assertStringIncludes(ciWorkflow, "ref: ${{ env.NNRP_DOC_SOURCE_COMMIT }}");
  assertStringIncludes(ciWorkflow, "path: .docs");
  assertStringIncludes(ciWorkflow, "NNRP_DOC_ROOT: ${{ github.workspace }}/.docs");
  assertStringIncludes(ciWorkflow, "deno task api-consistency");
  assertEquals(denoConfig.fmt.exclude.includes(".docs"), true);
  assertEquals(denoConfig.lint.exclude.includes(".docs"), true);
});

Deno.test("CI isolates real browser integration lifecycles and bounds the build gate", () => {
  assertStringIncludes(ciWorkflow, "build-test:");
  assertStringIncludes(ciWorkflow, "timeout-minutes: 10");
  assertStringIncludes(ciWorkflow, 'TOKIO_WORKER_THREADS: "1"');
  assertStringIncludes(
    denoConfig.tasks.test,
    "packages/browser-client/test/wasm-role.test.ts packages/core/test/*.test.ts",
  );
  assertStringIncludes(
    denoConfig.tasks.test,
    "packages/browser-client/test/browser-role.integration.test.ts && deno test",
  );
  assertStringIncludes(
    denoConfig.tasks.test,
    "packages/browser-client/test/browser-wasm-duplex.integration.test.ts",
  );
  assertStringIncludes(coverageGate, "--coverage=${coverageDir}/raw/${coverageRun.name}");
  assertStringIncludes(coverageGate, 'lcovReports.join("\\n")');
  assertStringIncludes(browserRoleIntegration, "const client = await setupForTest(");
  assertEquals(
    browserRoleIntegration.indexOf("const accepting = server.accept({ timeoutMs: 20_000 });") >
      browserRoleIntegration.indexOf("const client = await setupForTest("),
    true,
  );
  assertStringIncludes(browserRoleIntegration, "server.accept({ timeoutMs: 20_000 })");
  assertEquals(browserRoleIntegration.match(/browserProvider\.connect\s*\(/g)?.length, 1);
  assertStringIncludes(browserRoleIntegration, 'within(accepting, "server session accept", 25_000)');
  assertStringIncludes(browserRoleIntegration, "await closeAllForTest(cleanups)");
  assertEquals(coverageGate.includes("browser-role.integration.test.ts"), false);
  assertStringIncludes(coverageGate, "browser-wasm-duplex.integration.test.ts");
});
