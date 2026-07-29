import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  executePreview4AdapterPlan,
  executePreview4ImplementedCase,
  writePreview4AdapterResults,
} from "./preview4-adapter.ts";
import {
  parsePreview4AdapterPlan,
  PREVIEW4_ADAPTER_CAPABILITIES,
  PREVIEW4_ADAPTER_CASE_IDS,
  PREVIEW4_CONFORMANCE_PROTOCOL,
  PREVIEW4_IMPLEMENTED_CASE_IDS,
  validatePreview4CapabilityCatalog,
} from "./preview4-conformance-contract.ts";

Deno.test("Preview4 adapter executes every suite-owned public case", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const report = await executePreview4AdapterPlan(plan(directory), {
      verifyHeader: () => undefined,
    });
    assertEquals(report.protocol_version, PREVIEW4_CONFORMANCE_PROTOCOL);
    assertEquals(report.implementation_name, "nnrp-js");
    assertEquals(report.results.map(({ id }) => id), [...PREVIEW4_ADAPTER_CASE_IDS]);
    assertEquals(report.results.map(({ outcome }) => outcome), PREVIEW4_ADAPTER_CASE_IDS.map(() => "pass"));
    for (const result of report.results) {
      assertEquals(result.evidence_paths?.length, 1);
      assertEquals((await Deno.stat(result.evidence_paths![0])).isFile, true);
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("Preview4 informational controls remain executable and tested", async () => {
  const directory = await Deno.makeTempDir();
  try {
    for (const caseId of PREVIEW4_IMPLEMENTED_CASE_IDS.slice(PREVIEW4_ADAPTER_CASE_IDS.length)) {
      const result = await executePreview4ImplementedCase(caseId, directory, () => undefined);
      assertEquals(result.outcome, "pass");
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("Preview4 adapter plan must exactly equal the executable case catalog", () => {
  const directory = "artifacts/test";
  const missing = plan(directory);
  assertThrows(
    () => parsePreview4AdapterPlan({ ...missing, cases: missing.cases.slice(0, -1) }),
    Error,
    "do not equal the JS executable catalog",
  );
  assertThrows(
    () =>
      parsePreview4AdapterPlan({
        ...missing,
        protocol_version: "nnrp-1-preview3",
      }),
    Error,
    "protocol_version",
  );
});

Deno.test("Preview4 adapter writes failures instead of masking execution errors", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const report = await executePreview4AdapterPlan(plan(directory), {
      verifyHeader: () => {
        throw new Error("header mismatch");
      },
    });
    assertEquals(report.results[0], {
      id: "l0.header.fixed_shape.golden",
      outcome: "fail",
      failure_kind: "assertion_failed",
      message: "header mismatch",
    });
    assertEquals(report.results.slice(1).every(({ outcome }) => outcome === "pass"), true);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("Preview4 adapter CLI writer honors plan and result paths", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const planPath = `${directory}/plan.json`;
    const resultsPath = `${directory}/nested/results.json`;
    await Deno.writeTextFile(planPath, JSON.stringify(plan(directory)));
    await writePreview4AdapterResults(planPath, resultsPath, { verifyHeader: () => undefined });
    const results = JSON.parse(await Deno.readTextFile(resultsPath));
    assertEquals(results.results.length, PREVIEW4_ADAPTER_CASE_IDS.length);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("Preview4 capability manifest equals the executable JS capability catalog", async () => {
  validatePreview4CapabilityCatalog();
  const manifest = JSON.parse(await Deno.readTextFile("conformance/nnrp-1-preview4.capabilities.json"));
  assertEquals(manifest.protocol_version, PREVIEW4_CONFORMANCE_PROTOCOL);
  assertEquals(manifest.implementation_name, "nnrp-js");
  assertEquals(manifest.supports, PREVIEW4_ADAPTER_CAPABILITIES);
});

Deno.test("Preview4 adapter rejects unreadable plan paths", async () => {
  await assertRejects(
    () => writePreview4AdapterResults("missing-preview4-plan.json", "unused-results.json"),
    Deno.errors.NotFound,
  );
});

function plan(directory: string) {
  return {
    protocol_version: PREVIEW4_CONFORMANCE_PROTOCOL,
    implementation_name: "nnrp-js",
    artifacts: {
      results_path: `${directory}/results.json`,
      evidence_dir: `${directory}/evidence`,
    },
    cases: PREVIEW4_ADAPTER_CASE_IDS.map((id) => ({ id })),
  };
}
