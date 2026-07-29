import { createCapabilityManifest, type NnrpCapability } from "@nnrp/core";

export const PREVIEW4_CONFORMANCE_PROTOCOL = "nnrp-1-preview4" as const;
export const PREVIEW4_ADAPTER_RESULTS_SCHEMA =
  "https://raw.githubusercontent.com/NagareWorks/nnrp-conformance/main/schemas/adapter-case-results.schema.json" as const;

export const PREVIEW4_ADAPTER_CAPABILITIES = [
  "control.cancel_abort",
  "control.supersede",
  "control.priority_update",
  "control.deadline_expire",
  "control.progress_partial",
  "control.credit_backpressure",
  "control.capability_costs",
  "control.route_execution_hint",
  "control.trace_context",
  "control.result_drop_reason",
  "control.degrade_profile",
  "control.budget_update",
  "control.recoverable_error",
  "object.lifecycle",
  "object.delta",
  "object.cost",
  "object.ownership",
  "cache.reference",
] as const satisfies readonly NnrpCapability[];

export const PREVIEW4_ADAPTER_CASE_IDS = [
  "l0.header.fixed_shape.golden",
  "l1.control.cancel-abort",
  "l1.control.priority-deadline",
  "l1.control.progress-backpressure",
  "l1.control.capability-costs",
  "l1.object.lifecycle",
  "l1.object.delta",
  "l1.control.route-execution-hint",
  "l1.control.cache-reference",
  "l1.control.degrade-budget",
] as const;

export const PREVIEW4_IMPLEMENTED_CASE_IDS = [
  ...PREVIEW4_ADAPTER_CASE_IDS,
  "l1.control.supersede",
  "l1.control.recoverable-error",
] as const;

export type Preview4AdapterCaseId = typeof PREVIEW4_ADAPTER_CASE_IDS[number];
export type Preview4ImplementedCaseId = typeof PREVIEW4_IMPLEMENTED_CASE_IDS[number];

export interface Preview4AdapterPlanCase {
  readonly id: string;
}

export interface Preview4AdapterPlan {
  readonly protocol_version: typeof PREVIEW4_CONFORMANCE_PROTOCOL;
  readonly implementation_name: string;
  readonly artifacts: {
    readonly results_path: string;
    readonly evidence_dir: string;
  };
  readonly cases: readonly Preview4AdapterPlanCase[];
}

export function validatePreview4CapabilityCatalog(): void {
  createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp", "quic", "ipc", "websocket"],
    capabilities: PREVIEW4_ADAPTER_CAPABILITIES,
  });
}

export function parsePreview4AdapterPlan(value: unknown): Preview4AdapterPlan {
  const plan = record(value, "adapter execution plan");
  if (plan.protocol_version !== PREVIEW4_CONFORMANCE_PROTOCOL) {
    throw new Error(`adapter execution plan protocol_version must equal ${PREVIEW4_CONFORMANCE_PROTOCOL}`);
  }
  const implementationName = nonEmptyString(plan.implementation_name, "adapter execution plan implementation_name");
  const artifacts = record(plan.artifacts, "adapter execution plan artifacts");
  const resultsPath = nonEmptyString(artifacts.results_path, "adapter execution plan artifacts.results_path");
  const evidenceDir = nonEmptyString(artifacts.evidence_dir, "adapter execution plan artifacts.evidence_dir");
  if (!Array.isArray(plan.cases)) throw new Error("adapter execution plan cases must be an array");
  const cases = plan.cases.map((entry, index) => {
    const candidate = record(entry, `adapter execution plan cases[${index}]`);
    return { id: nonEmptyString(candidate.id, `adapter execution plan cases[${index}].id`) };
  });

  const actual = cases.map(({ id }) => id);
  if (!sameStrings(actual, PREVIEW4_ADAPTER_CASE_IDS)) {
    throw new Error(
      `suite-selected Preview4 adapter cases do not equal the JS executable catalog: ` +
        `selected=[${actual.join(", ")}], executable=[${PREVIEW4_ADAPTER_CASE_IDS.join(", ")}]`,
    );
  }

  return {
    protocol_version: PREVIEW4_CONFORMANCE_PROTOCOL,
    implementation_name: implementationName,
    artifacts: { results_path: resultsPath, evidence_dir: evidenceDir },
    cases,
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
