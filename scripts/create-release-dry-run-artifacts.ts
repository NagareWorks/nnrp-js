const outputDir = Deno.args[0] ?? "artifacts/release-dry-run";

const reports: readonly ReportCommand[] = [
  { file: "capability-manifest.json", args: ["task", "manifest"] },
  { file: "conformance-backend-native.json", args: ["task", "conformance:backend"] },
  { file: "conformance-browser-wasm.json", args: ["task", "conformance:browser"] },
  { file: "benchmark-backend-native.json", args: ["task", "benchmark:backend"] },
  { file: "benchmark-browser-wasm.json", args: ["task", "benchmark:browser"] },
];

const packages: readonly PackagePolicy[] = [
  { name: "@nnrp/core", directory: "packages/core" },
  { name: "@nnrp/native", directory: "packages/native" },
  { name: "@nnrp/wasm", directory: "packages/wasm" },
];

await resetOutputDir(outputDir);

for (const report of reports) {
  await writeCommandOutput(`${outputDir}/${report.file}`, "deno", report.args);
}

const packResults = await Promise.all(packages.map((policy) => npmPackDryRun(policy)));
await writeJson(`${outputDir}/package-pack.json`, packResults);
await writeJson(`${outputDir}/summary.json`, createSummary(packResults));

async function resetOutputDir(path: string): Promise<void> {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  });
  await Deno.mkdir(path, { recursive: true });
}

async function writeCommandOutput(path: string, command: string, args: readonly string[]): Promise<void> {
  const output = await new Deno.Command(command, {
    args: [...args],
    stdout: "piped",
    stderr: "piped",
  }).output();

  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);
  if (!output.success) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${output.code}\n${stderr}\n${stdout}`);
  }

  JSON.parse(stdout);
  await Deno.writeTextFile(path, stdout.endsWith("\n") ? stdout : `${stdout}\n`);
}

async function npmPackDryRun(policy: PackagePolicy): Promise<PackagePackSummary> {
  const packageJson = await readPackageJson(policy);
  const name = readRequiredString(packageJson, "name", policy.name);
  const version = readRequiredString(packageJson, "version", policy.name);

  if (name !== policy.name) {
    throw new Error(`${policy.name}: package.json name must be ${policy.name}, got ${name}`);
  }

  const result = Deno.build.os === "windows" && Deno.env.get("NNRP_JS_FORCE_NPM_PACK") !== "1"
    ? emulatePackDryRun(packageJson)
    : await runNpmPack(policy);

  if (result.name !== name || result.version !== version) {
    throw new Error(`${policy.name}: npm pack returned ${result.name}@${result.version}, expected ${name}@${version}`);
  }

  const files = result.files.map((file) => normalizePackPath(file.path)).sort();
  return { name, version, files };
}

function emulatePackDryRun(packageJson: Record<string, unknown>): NpmPackResult {
  const name = readRequiredString(packageJson, "name", "package");
  const version = readRequiredString(packageJson, "version", name);
  const files = readFiles(packageJson, name);
  return {
    name,
    version,
    files: [{ path: "package.json" }, ...files.map((path) => ({ path }))],
  };
}

async function runNpmPack(policy: PackagePolicy): Promise<NpmPackResult> {
  const output = await new Deno.Command(packCommand(), {
    args: packArgs(),
    cwd: policy.directory,
    stdout: "piped",
    stderr: "piped",
  }).output();

  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);
  if (!output.success) {
    throw new Error(`${policy.name}: npm pack failed with code ${output.code}\n${stderr}\n${stdout}`);
  }

  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isNpmPackResult(parsed[0])) {
    throw new Error(`${policy.name}: unexpected npm pack --json output\n${stdout}`);
  }

  return parsed[0];
}

function createSummary(packResults: readonly PackagePackSummary[]): ReleaseDryRunSummary {
  const packageVersions = [...new Set(packResults.map((result) => result.version))];
  if (packageVersions.length !== 1) {
    throw new Error(
      `package versions must stay synchronized: ${
        packResults.map((result) => `${result.name}@${result.version}`).join(", ")
      }`,
    );
  }

  return {
    sdk: "nnrp-js",
    packageVersion: packageVersions[0],
    reports: reports.map((report) => report.file),
    packages: packResults.map((result) => ({
      name: result.name,
      version: result.version,
      fileCount: result.files.length,
    })),
  };
}

async function readPackageJson(policy: PackagePolicy): Promise<Record<string, unknown>> {
  return JSON.parse(await Deno.readTextFile(`${policy.directory}/package.json`)) as Record<string, unknown>;
}

function readRequiredString(packageJson: Record<string, unknown>, field: string, packageName: string): string {
  const value = packageJson[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${packageName}: package.json ${field} must be a non-empty string`);
  }
  return value;
}

function readFiles(packageJson: Record<string, unknown>, packageName: string): readonly string[] {
  const value = packageJson.files;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${packageName}: package.json files must be a string array`);
  }
  return value as readonly string[];
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizePackPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function packCommand(): string {
  return Deno.build.os === "windows" ? windowsCommandShell() : "npm";
}

function packArgs(): string[] {
  const npmArgs = ["pack", "--dry-run", "--json"];
  return Deno.build.os === "windows" ? ["/d", "/s", "/c", `npm ${npmArgs.join(" ")}`] : npmArgs;
}

function windowsCommandShell(): string {
  return Deno.env.get("ComSpec") ?? "cmd";
}

function isNpmPackResult(value: unknown): value is NpmPackResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as Record<string, unknown>;
  return typeof result.name === "string" &&
    typeof result.version === "string" &&
    Array.isArray(result.files) &&
    result.files.every((file) =>
      typeof file === "object" && file !== null && typeof (file as Record<string, unknown>).path === "string"
    );
}

interface ReportCommand {
  readonly file: string;
  readonly args: readonly string[];
}

interface PackagePolicy {
  readonly name: string;
  readonly directory: string;
}

interface NpmPackResult {
  readonly name: string;
  readonly version: string;
  readonly files: readonly NpmPackFile[];
}

interface NpmPackFile {
  readonly path: string;
}

interface PackagePackSummary {
  readonly name: string;
  readonly version: string;
  readonly files: readonly string[];
}

interface ReleaseDryRunSummary {
  readonly sdk: "nnrp-js";
  readonly packageVersion: string;
  readonly reports: readonly string[];
  readonly packages: readonly {
    readonly name: string;
    readonly version: string;
    readonly fileCount: number;
  }[];
}
