import { createConformanceReport, parseCommandOptions, selectBuildModes, writeJson } from "./sdk-reporting.ts";
import { writePreview4AdapterResults } from "./preview4-adapter.ts";

if (import.meta.main) {
  await main(Deno.args);
}

export async function main(args: readonly string[]): Promise<void> {
  const planPath = option(args, "--plan") ?? Deno.env.get("NNRP_CONFORMANCE_ADAPTER_PLAN");
  const outputPath = option(args, "--output") ?? Deno.env.get("NNRP_CONFORMANCE_ADAPTER_RESULTS");
  if (planPath !== undefined || outputPath !== undefined) {
    if (planPath === undefined || outputPath === undefined) {
      throw new Error("Preview4 adapter execution requires both plan and output paths.");
    }
    await writePreview4AdapterResults(planPath, outputPath);
    return;
  }

  const options = parseCommandOptions(args);
  const reports = selectBuildModes(options.mode).map((buildMode) =>
    createConformanceReport(buildMode, { artifactVersion: options.artifactVersion })
  );

  writeJson(options.mode === "all" ? { sdk: "nnrp-js", reports } : reports[0]);
}

export function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.trim().length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
