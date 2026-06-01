import { createBenchmarkReport, parseCommandOptions, selectBuildModes, writeJson } from "./sdk-reporting.ts";

const options = parseCommandOptions(Deno.args);
const reports = selectBuildModes(options.mode).map((buildMode) =>
  createBenchmarkReport(buildMode, { artifactVersion: options.artifactVersion })
);

writeJson(options.mode === "all" ? { sdk: "nnrp-js", reports } : reports[0]);
