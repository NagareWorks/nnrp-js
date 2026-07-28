import { parseLcovCoverage } from "./lcov-coverage.ts";

const coverageDir = "artifacts/coverage";
const lcovPath = `${coverageDir}/lcov.info`;
const lineThreshold = parseLineThreshold(Deno.args);
const excludedSources = new Set([
  "packages/browser-client/src/index.ts",
  "packages/browser-client/src/wasm-role.ts",
  "packages/browser-client/wasm/nnrp_wasm.js",
  "packages/native-client/src/index.ts",
  "packages/native-server/src/index.ts",
  "packages/transport-ipc/src/native.ts",
  "packages/transport-quic/src/native.ts",
  "packages/transport-tcp/src/native.ts",
  "packages/transport-websocket/src/native.ts",
  "scripts/run-host-route-target.ts",
]);

await Deno.remove(coverageDir, { recursive: true }).catch((error) => {
  if (!(error instanceof Deno.errors.NotFound)) {
    throw error;
  }
});

await run(Deno.execPath(), [
  "test",
  "--unstable-sloppy-imports",
  "--allow-env",
  "--allow-ffi",
  "--allow-net=127.0.0.1",
  "--allow-read",
  "--allow-write",
  `--coverage=${coverageDir}`,
  "packages/*/test/*.test.ts",
  "scripts/*.test.ts",
]);

await run(Deno.execPath(), [
  "run",
  "--unstable-sloppy-imports",
  "--allow-ffi",
  "--allow-net=127.0.0.1",
  "--allow-read",
  "--allow-write",
  "scripts/check-native-transport-loopback.ts",
]);

await run(Deno.execPath(), [
  "coverage",
  "--lcov",
  `--output=${lcovPath}`,
  coverageDir,
]);

const coverage = parseLcovCoverage(await Deno.readTextFile(lcovPath), excludedSources);
const linePercent = percentage(coverage.lines.hit, coverage.lines.found);

console.log(
  `Coverage gate excludes role facades, generated WASM glue, platform FFI adapters, and the process target covered by real loopback or suite-owned E2E: ${
    [...excludedSources].join(", ")
  }.`,
);
console.log(
  `Coverage line rate ${linePercent.toFixed(1)}% (${coverage.lines.hit}/${coverage.lines.found}), threshold ${
    lineThreshold.toFixed(1)
  }%.`,
);

if (linePercent < lineThreshold) {
  console.error(`Coverage line rate ${linePercent.toFixed(1)}% is below ${lineThreshold.toFixed(1)}%.`);
  Deno.exit(1);
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

function percentage(hit: number, found: number): number {
  return found === 0 ? 100 : (hit / found) * 100;
}

async function run(command: string, args: readonly string[]): Promise<void> {
  const child = new Deno.Command(command, {
    args: [...args],
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await child.spawn().status;
  if (!status.success) {
    throw new Error(`${command} exited with code ${status.code}`);
  }
}
