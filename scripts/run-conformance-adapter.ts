import { createConformanceReport, parseCommandOptions, selectBuildModes, writeJson } from "./sdk-reporting.ts";
import { writePreview4AdapterResults } from "./preview4-adapter.ts";

const planPath = option(Deno.args, "--plan") ?? Deno.env.get("NNRP_CONFORMANCE_ADAPTER_PLAN");
const outputPath = option(Deno.args, "--output") ?? Deno.env.get("NNRP_CONFORMANCE_ADAPTER_RESULTS");
if (planPath !== undefined || outputPath !== undefined) {
  if (planPath === undefined || outputPath === undefined) {
    throw new Error("Preview4 adapter execution requires both plan and output paths.");
  }
  await writePreview4AdapterResults(planPath, outputPath);
} else {
  const options = parseCommandOptions(Deno.args);
  const reports = selectBuildModes(options.mode).map((buildMode) =>
    createConformanceReport(buildMode, { artifactVersion: options.artifactVersion })
  );

  writeJson(options.mode === "all" ? { sdk: "nnrp-js", reports } : reports[0]);
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value !== undefined && value.trim().length === 0) throw new Error(`${name} must not be empty`);
  return value;
}
