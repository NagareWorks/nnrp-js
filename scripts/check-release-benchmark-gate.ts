const DEFAULT_RESULTS_PATH = "artifacts/release-benchmark-results.json";
const COARSE_FFI_SCENARIO_ID = "preview4.coarse_ffi.submit_result_batch";
const PREVIEW3_BASELINE_OPS_PER_SEC = 7_799_233.8;
const MAX_COARSE_FFI_REGRESSION_RATIO = 0.10;
const MIN_COARSE_FFI_THROUGHPUT_OPS_PER_SEC = PREVIEW3_BASELINE_OPS_PER_SEC *
  (1 - MAX_COARSE_FFI_REGRESSION_RATIO);

const resultsPath = valueAfter(Deno.args, "--results") ?? DEFAULT_RESULTS_PATH;
const report = JSON.parse(await Deno.readTextFile(resultsPath)) as BenchmarkResultsReport;

for (const scenario of report.results) {
  if (scenario.outcome !== "measured") {
    fail(
      `Release benchmark ${scenario.id} must be measured, got ${scenario.outcome}: ${scenario.message ?? "no message"}`,
    );
  }
}

const coarseFfi = report.results.find((result) => result.id === COARSE_FFI_SCENARIO_ID);
if (coarseFfi === undefined) fail(`Missing release benchmark scenario: ${COARSE_FFI_SCENARIO_ID}`);
const throughput = coarseFfi.metrics?.throughput_ops_per_sec;
if (typeof throughput !== "number") {
  fail(`${COARSE_FFI_SCENARIO_ID} did not report throughput_ops_per_sec.`);
}
if (throughput < MIN_COARSE_FFI_THROUGHPUT_OPS_PER_SEC) {
  fail(
    `Coarse FFI throughput ${throughput.toFixed(1)} ops/s regressed more than ` +
      `${(MAX_COARSE_FFI_REGRESSION_RATIO * 100).toFixed(0)}% from the checked-in Preview3 baseline ` +
      `${PREVIEW3_BASELINE_OPS_PER_SEC.toFixed(1)} ops/s; minimum is ${
        MIN_COARSE_FFI_THROUGHPUT_OPS_PER_SEC.toFixed(1)
      }.`,
  );
}

console.log(
  `Release benchmark gate passed: ${throughput.toFixed(1)} ops/s >= ` +
    `${MIN_COARSE_FFI_THROUGHPUT_OPS_PER_SEC.toFixed(1)} ops/s and all ${report.results.length} scenarios measured.`,
);

function valueAfter(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function fail(message: string): never {
  console.error(message);
  Deno.exit(1);
}

interface BenchmarkResultsReport {
  readonly results: readonly BenchmarkScenarioResult[];
}

interface BenchmarkScenarioResult {
  readonly id: string;
  readonly outcome: "measured" | "skip" | "error";
  readonly metrics?: { readonly throughput_ops_per_sec?: number };
  readonly message?: string;
}
