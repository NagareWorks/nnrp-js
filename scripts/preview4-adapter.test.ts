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
import { option } from "./run-conformance-adapter.ts";

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
  assertThrows(
    () =>
      parsePreview4AdapterPlan({
        ...missing,
        cases: missing.cases.map((entry) =>
          entry.id === "l0.header.fixed_shape.golden" ? { ...entry, parameters: {} } : entry
        ),
      }),
    Error,
    "parameters must equal [header_hex]",
  );
  assertThrows(
    () =>
      parsePreview4AdapterPlan({
        ...missing,
        cases: missing.cases.map((entry) =>
          entry.id === "l1.control.cancel-abort" ? { ...entry, parameters: { legacy: true } } : entry
        ),
      }),
    Error,
    "parameters must equal []",
  );
});

Deno.test("Preview4 adapter consumes suite-owned frozen vectors", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const invalid = plan(directory);
    const report = await executePreview4AdapterPlan({
      ...invalid,
      cases: invalid.cases.map((entry) =>
        entry.id === "l0.body_region.prelude.golden"
          ? {
            ...entry,
            parameters: { metadata_hex: "1900000018000000180000000e00000010000000050000000000000000000000" },
          }
          : entry
      ),
    }, { verifyHeader: () => undefined });
    assertEquals(report.results[1].outcome, "fail");
    assertEquals(report.results[1].message, "NNRP/1 baseline body-region prelude changed during roundtrip");

    const malformedHex = plan(directory);
    const malformedReport = await executePreview4AdapterPlan({
      ...malformedHex,
      cases: malformedHex.cases.map((entry) =>
        entry.id === "l0.header.fixed_shape.golden" ? { ...entry, parameters: { header_hex: "not-hex" } } : entry
      ),
    }, { verifyHeader: () => undefined });
    assertEquals(malformedReport.results[0].outcome, "fail");
    assertEquals(malformedReport.results[0].message?.includes("header_hex"), true);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
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

Deno.test("Preview4 adapter CLI rejects missing option values", () => {
  assertThrows(() => option(["--plan"], "--plan"), Error, "--plan requires a value");
  assertThrows(
    () => option(["--plan", "--output", "results.json"], "--plan"),
    Error,
    "--plan requires a value",
  );
  assertEquals(option(["--plan", "plan.json"], "--plan"), "plan.json");
});

function plan(directory: string) {
  return {
    protocol_version: PREVIEW4_CONFORMANCE_PROTOCOL,
    implementation_name: "nnrp-js",
    artifacts: {
      results_path: `${directory}/results.json`,
      evidence_dir: `${directory}/evidence`,
    },
    cases: PREVIEW4_ADAPTER_CASE_IDS.map((id) => ({ id, parameters: FROZEN_PARAMETERS[id] ?? {} })),
  };
}

const FROZEN_PARAMETERS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "l0.header.fixed_shape.golden": {
    header_hex: "4e4e525001001028210000003000000000100000070000000b0000000200000015cd5b0700000000",
  },
  "l0.body_region.prelude.golden": {
    metadata_hex: "1800000018000000180000000e00000010000000050000000000000000000000",
  },
  "l0.typed_payload.descriptor.golden": {
    descriptor_hex: "10000300040000000700000000000000",
  },
  "l0.typed_payload.frame_regions.golden": {
    descriptor_region_hex:
      "020001000000000003000000000000000400020003000000020000000000000008000300050000000500000000000000100004000a0000000300000000000000",
    payload_hex: "746f6b6175766964656f657674",
  },
  "l0.typed_payload.descriptor.current.golden": {
    descriptor_hex: "020002020110000003000000020000000800000018000000",
  },
};
