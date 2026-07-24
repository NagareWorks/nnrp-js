import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { resolve } from "node:path";
import { parseWireConformanceOptions, validatePlanCoverage } from "./wire-conformance-plan.ts";

Deno.test("wire conformance options select explicit and environment roots", () => {
  assertEquals(
    parseWireConformanceOptions(["--artifacts", "artifacts/custom"], { NNRP_CONFORMANCE_ROOT: "../suite" }),
    {
      artifactDirectory: resolve("artifacts/custom"),
      conformanceRoot: resolve("../suite"),
    },
  );
  assertEquals(
    parseWireConformanceOptions(["--conformance-root", "../explicit"], { NNRP_CONFORMANCE_ROOT: "../ignored" }),
    {
      artifactDirectory: resolve("artifacts/wire-conformance/native"),
      conformanceRoot: resolve("../explicit"),
    },
  );
});

Deno.test("wire plans cover every declared mode, transport, and capability", () => {
  const target = {
    wire_conformance: {
      modes: ["suite_as_client"],
      transports: [{ name: "tcp" }],
      capabilities: ["control.cancel_abort"],
    },
  };
  const plan = {
    scenarios: [{
      mode: "suite_as_client",
      transport: "tcp",
      required_capabilities: ["control.cancel_abort"],
    }],
  };
  validatePlanCoverage(target, plan);
  assertThrows(
    () =>
      validatePlanCoverage(
        { ...target, wire_conformance: { ...target.wire_conformance, modes: ["suite_as_proxy"] } },
        plan,
      ),
    Error,
    "no selected scenario",
  );
});
