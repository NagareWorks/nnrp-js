import {
  assertBenchmarkSmokeThresholds,
  createBenchmarkReport,
  parseCommandOptions,
  selectBuildModes,
} from "./sdk-reporting.ts";

const options = parseCommandOptions(Deno.args);

for (const buildMode of selectBuildModes(options.mode)) {
  assertBenchmarkSmokeThresholds(createBenchmarkReport(buildMode, { artifactVersion: options.artifactVersion }));
}
