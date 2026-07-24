import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseWireConformanceOptions,
  validatePlanCoverage,
  type WireConformanceOptions,
} from "./wire-conformance-plan.ts";

const MANIFEST_WAIT_MILLIS = 15_000;
const TARGET_EXIT_WAIT_MILLIS = 10_000;

if (import.meta.main) {
  await runWireConformance(
    parseWireConformanceOptions(Deno.args, { NNRP_CONFORMANCE_ROOT: Deno.env.get("NNRP_CONFORMANCE_ROOT") }),
  );
}

export async function runWireConformance(options: WireConformanceOptions): Promise<void> {
  const suitePath = resolve(options.conformanceRoot, "wire-conformance/nnrp-1-preview4/manifest.json");
  const runnerManifestPath = resolve(options.conformanceRoot, "Cargo.toml");
  await requireFile(suitePath, "wire suite manifest");
  await requireFile(runnerManifestPath, "conformance runner workspace");

  await Deno.remove(options.artifactDirectory, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  await Deno.mkdir(options.artifactDirectory, { recursive: true });

  const targetManifestPath = resolve(options.artifactDirectory, "target.json");
  const planPath = resolve(options.artifactDirectory, "plan.json");
  const resultsPath = resolve(options.artifactDirectory, "results.json");
  const evidenceDirectory = resolve(options.artifactDirectory, "evidence");
  const targetScript = resolve(dirname(fileURLToPath(import.meta.url)), "run-wire-target.ts");
  await buildRunner(options.conformanceRoot);
  const target = new Deno.Command("deno", {
    args: [
      "run",
      "--unstable-sloppy-imports",
      "--allow-env",
      "--allow-ffi",
      "--allow-net=127.0.0.1,localhost",
      "--allow-read",
      `--allow-write=${options.artifactDirectory}`,
      targetScript,
      "--manifest",
      targetManifestPath,
    ],
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  const targetStatus = target.status;

  try {
    await waitForManifest(targetManifestPath, targetStatus);
    await runCargo(options.conformanceRoot, [
      "wire-plan",
      "--suite",
      suitePath,
      "--target",
      targetManifestPath,
      "--output",
      planPath,
      "--results-path",
      resultsPath,
      "--evidence-dir",
      evidenceDirectory,
    ]);
    validatePlanCoverage(
      JSON.parse(await Deno.readTextFile(targetManifestPath)),
      JSON.parse(await Deno.readTextFile(planPath)),
    );
    await runCargo(options.conformanceRoot, [
      "wire-run",
      "--plan",
      planPath,
      "--target",
      targetManifestPath,
      "--output",
      resultsPath,
    ]);
    await runCargo(options.conformanceRoot, [
      "validate-wire-results",
      "--plan",
      planPath,
      "--results",
      resultsPath,
    ]);
    const status = await withTimeout(targetStatus, TARGET_EXIT_WAIT_MILLIS, "wire target shutdown");
    if (!status.success) throw new Error(`wire target exited with code ${status.code}`);
  } catch (error) {
    try {
      target.kill("SIGTERM");
    } catch {
      // The target may already have exited; cleanup must not replace the execution failure.
    }
    await targetStatus.catch(() => undefined);
    throw error;
  }
}

export async function runCargo(conformanceRoot: string, runnerArgs: readonly string[]): Promise<void> {
  const status = await new Deno.Command("cargo", {
    cwd: conformanceRoot,
    args: [
      "run",
      "--locked",
      "-p",
      "nnrp-conformance-runner",
      "--bin",
      "nnrp-conformance-runner",
      "--",
      ...runnerArgs,
    ],
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;
  if (!status.success) {
    throw new Error(`nnrp-conformance-runner ${runnerArgs[0]} failed with code ${status.code}`);
  }
}

export async function buildRunner(conformanceRoot: string): Promise<void> {
  const status = await new Deno.Command("cargo", {
    cwd: conformanceRoot,
    args: [
      "build",
      "--locked",
      "-p",
      "nnrp-conformance-runner",
      "--bin",
      "nnrp-conformance-runner",
    ],
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;
  if (!status.success) {
    throw new Error(`nnrp-conformance-runner build failed with code ${status.code}`);
  }
}

async function waitForManifest(path: string, targetStatus: Promise<Deno.CommandStatus>): Promise<void> {
  const deadline = Date.now() + MANIFEST_WAIT_MILLIS;
  while (Date.now() < deadline) {
    try {
      const stat = await Deno.stat(path);
      if (stat.isFile && stat.size > 0) return;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    const state = await Promise.race([
      targetStatus.then((status) => ({ exited: true as const, status })),
      delay(50).then(() => ({ exited: false as const })),
    ]);
    if (state.exited) throw new Error(`wire target exited before publishing its manifest (${state.status.code})`);
  }
  throw new Error(`wire target did not publish ${path} within ${MANIFEST_WAIT_MILLIS} ms`);
}

export async function requireFile(path: string, description: string): Promise<void> {
  try {
    if ((await Deno.stat(path)).isFile) return;
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  throw new Error(`${description} was not found at ${path}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMillis: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMillis} ms`)), timeoutMillis);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
