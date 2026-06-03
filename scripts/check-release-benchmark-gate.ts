const DEFAULT_RESULTS_PATH = "artifacts/release-benchmark-results.json";
const SUBMIT_RESULT_SCENARIO_ID = "l4.submit_result.inline_tensor.throughput";
const MIN_SUBMIT_RESULT_THROUGHPUT_OPS_PER_SEC = 1_000_000;

const resultsPath = valueAfter(Deno.args, "--results") ?? DEFAULT_RESULTS_PATH;
const report = JSON.parse(await Deno.readTextFile(resultsPath)) as BenchmarkResultsReport;
const scenario = report.results.find((result) => result.id === SUBMIT_RESULT_SCENARIO_ID);

if (scenario === undefined) {
  fail(`Missing release benchmark scenario: ${SUBMIT_RESULT_SCENARIO_ID}`);
}

if (scenario.outcome !== "measured") {
  fail(
    `Release benchmark scenario ${SUBMIT_RESULT_SCENARIO_ID} must be measured with a real Rust-backed FFI binding; got ${scenario.outcome}: ${
      scenario.message ?? "no message"
    }`,
  );
}

const throughput = scenario.metrics?.throughput_ops_per_sec;
if (typeof throughput !== "number") {
  fail(`Release benchmark scenario ${SUBMIT_RESULT_SCENARIO_ID} did not report throughput_ops_per_sec.`);
}

if (throughput < MIN_SUBMIT_RESULT_THROUGHPUT_OPS_PER_SEC) {
  fail(
    `Release benchmark throughput ${throughput.toFixed(1)} ops/s is below the JS release gate ${
      MIN_SUBMIT_RESULT_THROUGHPUT_OPS_PER_SEC.toFixed(1)
    } ops/s.`,
  );
}

console.log(
  `Release benchmark gate passed: ${SUBMIT_RESULT_SCENARIO_ID} ${throughput.toFixed(1)} ops/s >= ${
    MIN_SUBMIT_RESULT_THROUGHPUT_OPS_PER_SEC.toFixed(1)
  } ops/s.`,
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
  readonly metrics?: {
    readonly throughput_ops_per_sec?: number;
  };
  readonly message?: string;
}
