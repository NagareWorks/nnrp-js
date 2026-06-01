import { createConformanceReport, parseCommandOptions, selectBuildModes, writeJson } from "./sdk-reporting.ts";

const options = parseCommandOptions(Deno.args);
const reports = selectBuildModes(options.mode).map((buildMode) =>
  createConformanceReport(buildMode, { artifactVersion: options.artifactVersion })
);

writeJson(options.mode === "all" ? { sdk: "nnrp-js", reports } : reports[0]);
