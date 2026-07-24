import { resolve } from "node:path";

const DEFAULT_ARTIFACT_DIRECTORY = "artifacts/wire-conformance/native";
const DEFAULT_CONFORMANCE_ROOT = "../nnrp-conformance";

export interface WireConformanceOptions {
  readonly artifactDirectory: string;
  readonly conformanceRoot: string;
}

export function parseWireConformanceOptions(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): WireConformanceOptions {
  return {
    artifactDirectory: resolve(option(args, "--artifacts") ?? DEFAULT_ARTIFACT_DIRECTORY),
    conformanceRoot: resolve(
      option(args, "--conformance-root") ?? environment.NNRP_CONFORMANCE_ROOT ?? DEFAULT_CONFORMANCE_ROOT,
    ),
  };
}

export function validatePlanCoverage(targetValue: unknown, planValue: unknown): void {
  const target = asRecord(targetValue, "wire target");
  const wire = asRecord(target.wire_conformance, "wire target wire_conformance");
  const plan = asRecord(planValue, "wire plan");
  if (!Array.isArray(plan.scenarios) || plan.scenarios.length === 0) {
    throw new Error("wire plan selected no scenarios");
  }
  const scenarios = plan.scenarios.map((scenario, index) => asRecord(scenario, `wire plan scenario ${index}`));
  assertEveryClaimSelected(
    "mode",
    stringArray(wire.modes, "wire target modes"),
    scenarios,
    (scenario) => [scenario.mode],
  );
  assertEveryClaimSelected(
    "transport",
    recordArray(wire.transports, "wire target transports").map((transport) => transport.name),
    scenarios,
    (scenario) => [scenario.transport],
  );
  assertEveryClaimSelected(
    "capability",
    stringArray(wire.capabilities, "wire target capabilities"),
    scenarios,
    (scenario) => scenario.required_capabilities,
  );
}

function assertEveryClaimSelected(
  kind: string,
  claims: readonly unknown[],
  scenarios: readonly Record<string, unknown>[],
  selected: (scenario: Record<string, unknown>) => unknown,
): void {
  const selectedClaims = new Set(scenarios.flatMap((scenario) => {
    const value = selected(scenario);
    return Array.isArray(value) ? value : [value];
  }));
  const missing = claims.filter((claim) => typeof claim !== "string" || !selectedClaims.has(claim));
  if (missing.length > 0) {
    throw new Error(`wire target declared ${kind} claims with no selected scenario: ${missing.join(", ")}`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function recordArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => asRecord(entry, `${label}[${index}]`));
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return value as string[];
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value !== undefined && value.trim().length === 0) throw new Error(`${name} must not be empty`);
  return value;
}
