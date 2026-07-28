import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseWireConformanceOptions,
  validatePlanCoverage,
  type WireConformanceOptions,
} from "./wire-conformance-plan.ts";
import { createHostRouteTargetManifest, type HostRouteProviderDeclaration } from "./host-route-conformance.ts";

const MANIFEST_WAIT_MILLIS = 15_000;
const TARGET_EXIT_WAIT_MILLIS = 10_000;
const HOST_ROUTE_PROFILES: readonly {
  readonly name: string;
  readonly expected: number;
  readonly providers: readonly HostRouteProviderDeclaration[];
}[] = [
  {
    name: "installed-native",
    expected: 9,
    providers: [
      {
        transport: "tcp",
        provider_id: "nnrp.transport.tcp.native",
        installed: true,
        platforms: ["native"],
        security_modes: ["plain", "tls_server_auth"],
      },
      {
        transport: "quic",
        provider_id: "nnrp.transport.quic.native",
        installed: true,
        platforms: ["native"],
        security_modes: ["tls_server_auth"],
      },
      {
        transport: "ipc",
        provider_id: "nnrp.transport.ipc.native",
        installed: true,
        platforms: ["native"],
        security_modes: ["plain"],
      },
      {
        transport: "websocket",
        provider_id: "nnrp.transport.websocket.native",
        installed: true,
        platforms: ["native"],
        security_modes: ["plain", "wss"],
      },
    ],
  },
  {
    name: "known-uninstalled",
    expected: 1,
    providers: [{
      transport: "quic",
      provider_id: "example.transport.quic.uninstalled",
      installed: false,
      platforms: ["native"],
      security_modes: ["tls_server_auth"],
    }],
  },
];

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
    await runHostRouteConformance(options, suitePath);
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

export async function runHostRouteConformance(options: WireConformanceOptions, suitePath: string): Promise<void> {
  const suite = JSON.parse(await Deno.readTextFile(suitePath)) as { readonly suite_version?: unknown };
  if (typeof suite.suite_version !== "string" || suite.suite_version.length === 0) {
    throw new Error("wire suite manifest does not declare suite_version");
  }
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const targetExecutable = resolve(
    scriptDirectory,
    Deno.build.os === "windows" ? "run-host-route-target.cmd" : "run-host-route-target.sh",
  );
  await requireFile(targetExecutable, "host-route target executable");

  let totalPassed = 0;
  for (const profile of HOST_ROUTE_PROFILES) {
    const profileDirectory = resolve(options.artifactDirectory, `host-route-${profile.name}`);
    await Deno.mkdir(profileDirectory, { recursive: true });
    const targetPath = resolve(profileDirectory, "target.json");
    const planPath = resolve(profileDirectory, "plan.json");
    const resultsPath = resolve(profileDirectory, "results.json");
    const evidenceDirectory = resolve(profileDirectory, "evidence");
    const targetName = `nnrp-js-host-route-${profile.name}`;
    await Deno.writeTextFile(
      targetPath,
      `${JSON.stringify(createHostRouteTargetManifest(targetName, suite.suite_version, profile.providers), null, 2)}\n`,
    );
    await runCargo(options.conformanceRoot, [
      "wire-plan",
      "--suite",
      suitePath,
      "--target",
      targetPath,
      "--output",
      planPath,
      "--results-path",
      resultsPath,
      "--evidence-dir",
      evidenceDirectory,
    ]);
    await runCargo(options.conformanceRoot, [
      "wire-run",
      "--plan",
      planPath,
      "--target",
      targetPath,
      "--host-route-target",
      targetExecutable,
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
    const report = JSON.parse(await Deno.readTextFile(resultsPath)) as {
      readonly results?: readonly { readonly outcome?: unknown }[];
    };
    const results = report.results;
    const failures = results?.filter((result) => result.outcome !== "passed") ?? [];
    if (results === undefined || results.length !== profile.expected || failures.length !== 0) {
      throw new Error(
        `${profile.name} expected ${profile.expected} passing host-route scenarios; got ${
          results?.length ?? 0
        } total and ${failures.length} non-passing.`,
      );
    }
    totalPassed += results.length;
  }
  if (totalPassed !== 10) throw new Error(`Expected ten Preview4 host-route scenarios, got ${totalPassed}.`);
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
