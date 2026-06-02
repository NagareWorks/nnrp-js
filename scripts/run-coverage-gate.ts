const coverageDir = "artifacts/coverage";
const lcovPath = `${coverageDir}/lcov.info`;
const lineThreshold = parseLineThreshold(Deno.args);

await Deno.remove(coverageDir, { recursive: true }).catch((error) => {
  if (!(error instanceof Deno.errors.NotFound)) {
    throw error;
  }
});

await run(Deno.execPath(), [
  "test",
  "--allow-env",
  "--allow-read",
  "--allow-write",
  `--coverage=${coverageDir}`,
  "packages/*/test/*.test.ts",
  "scripts/*.test.ts",
]);

await run(Deno.execPath(), [
  "coverage",
  "--lcov",
  `--output=${lcovPath}`,
  coverageDir,
]);

const coverage = parseLcovCoverage(await Deno.readTextFile(lcovPath));
const linePercent = percentage(coverage.lines.hit, coverage.lines.found);

console.log(
  `Coverage line rate ${linePercent.toFixed(1)}% (${coverage.lines.hit}/${coverage.lines.found}), threshold ${
    lineThreshold.toFixed(1)
  }%.`,
);

if (linePercent < lineThreshold) {
  console.error(`Coverage line rate ${linePercent.toFixed(1)}% is below ${lineThreshold.toFixed(1)}%.`);
  Deno.exit(1);
}

interface CoverageCounters {
  readonly lines: {
    readonly found: number;
    readonly hit: number;
  };
}

function parseLineThreshold(args: readonly string[]): number {
  const lineIndex = args.indexOf("--line");
  const raw = lineIndex === -1 ? "90" : args[lineIndex + 1];
  const threshold = Number(raw);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error(`Invalid --line coverage threshold: ${raw}`);
  }

  return threshold;
}

function parseLcovCoverage(lcov: string): CoverageCounters {
  let found = 0;
  let hit = 0;

  for (const line of lcov.split(/\r?\n/)) {
    if (!line.startsWith("DA:")) {
      continue;
    }

    const [, count] = line.slice(3).split(",");
    found += 1;
    if (Number(count) > 0) {
      hit += 1;
    }
  }

  if (found === 0) {
    throw new Error("Coverage report did not contain line counters.");
  }

  return { lines: { found, hit } };
}

function percentage(hit: number, found: number): number {
  return found === 0 ? 100 : (hit / found) * 100;
}

async function run(command: string, args: readonly string[]): Promise<void> {
  const child = new Deno.Command(command, {
    args: [...args],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await child.output();
  if (!status.success) {
    Deno.exit(status.code);
  }
}
