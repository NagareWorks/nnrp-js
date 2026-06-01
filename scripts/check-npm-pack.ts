const packages: readonly PackagePackPolicy[] = [
  {
    name: "@nnrp/core",
    directory: "packages/core",
    expectedFiles: [
      "README.md",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/index.js",
      "package.json",
    ],
    forbiddenFiles: [/\.tsbuildinfo$/, /\.js\.map$/, /^native\//, /^wasm\//],
  },
  {
    name: "@nnrp/native",
    directory: "packages/native",
    expectedFiles: [
      "README.md",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/index.js",
      "package.json",
    ],
    forbiddenFiles: [/\.tsbuildinfo$/, /\.js\.map$/, /browser/i, /websocket/i, /webtransport/i],
  },
  {
    name: "@nnrp/wasm",
    directory: "packages/wasm",
    expectedFiles: [
      "README.md",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/index.js",
      "package.json",
    ],
    forbiddenFiles: [/\.tsbuildinfo$/, /\.js\.map$/, /native/i, /nnrp_ffi/i, /\.(?:dll|so|dylib|a)$/],
  },
];

const failures: string[] = [];
const packageVersions = new Map<string, string>();

for (const policy of packages) {
  const packageJson = await readPackageJson(policy);
  const version = readStringField(policy.name, packageJson, "version");
  packageVersions.set(policy.name, version);

  const pack = await npmPackDryRun(policy);

  if (pack.name !== policy.name) {
    failures.push(`${policy.name}: npm pack returned package name ${pack.name}`);
  }

  if (pack.version !== version) {
    failures.push(`${policy.name}: npm pack returned version ${pack.version}, expected ${version}`);
  }

  const packedFiles = pack.files.map((file) => normalizePackPath(file.path)).sort();
  for (const expected of policy.expectedFiles) {
    if (!packedFiles.includes(expected)) {
      failures.push(`${policy.name}: npm pack output missing ${expected}`);
    }
  }

  for (const file of packedFiles) {
    for (const pattern of policy.forbiddenFiles) {
      if (pattern.test(file)) {
        failures.push(`${policy.name}: npm pack output contains forbidden file ${file}`);
      }
    }
  }
}

const versions = new Set(packageVersions.values());
if (versions.size !== 1) {
  failures.push(
    `package versions must stay synchronized: ${
      [...packageVersions.entries()].map(([name, version]) => `${name}@${version}`).join(", ")
    }`,
  );
}

if (failures.length > 0) {
  console.error("npm pack dry-run check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  Deno.exit(1);
}

async function npmPackDryRun(policy: PackagePackPolicy): Promise<NpmPackResult> {
  if (Deno.build.os === "windows" && Deno.env.get("NNRP_JS_FORCE_NPM_PACK") !== "1") {
    return emulatePackDryRun(policy);
  }

  const command = new Deno.Command(packCommand(), {
    args: packArgs(),
    cwd: policy.directory,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);

  if (!output.success) {
    throw new Error(`${policy.name}: npm pack failed with code ${output.code}\n${stderr}\n${stdout}`);
  }

  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isPackResult(parsed[0])) {
    throw new Error(`${policy.name}: unexpected npm pack --json output\n${stdout}`);
  }

  return parsed[0];
}

async function emulatePackDryRun(policy: PackagePackPolicy): Promise<NpmPackResult> {
  const packageJson = await readPackageJson(policy);
  const name = readStringField(policy.name, packageJson, "name");
  const version = readStringField(policy.name, packageJson, "version");
  const files = readFilesField(policy.name, packageJson);
  return {
    name,
    version,
    files: [
      { path: "package.json" },
      ...files.map((path) => ({ path })),
    ],
  };
}

async function readPackageJson(policy: PackagePackPolicy): Promise<Record<string, unknown>> {
  return JSON.parse(await Deno.readTextFile(`${policy.directory}/package.json`)) as Record<string, unknown>;
}

function readStringField(packageName: string, packageJson: Record<string, unknown>, field: string): string {
  const value = packageJson[field];
  if (typeof value !== "string") {
    failures.push(`${packageName}: package.json ${field} must be a string`);
    return "";
  }

  return value;
}

function readFilesField(packageName: string, packageJson: Record<string, unknown>): readonly string[] {
  const value = packageJson.files;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    failures.push(`${packageName}: package.json files must be a string array`);
    return [];
  }

  return value as readonly string[];
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

function isPackResult(value: unknown): value is NpmPackResult {
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

interface PackagePackPolicy {
  readonly name: string;
  readonly directory: string;
  readonly expectedFiles: readonly string[];
  readonly forbiddenFiles: readonly RegExp[];
}

interface NpmPackResult {
  readonly name: string;
  readonly version: string;
  readonly files: readonly NpmPackFile[];
}

interface NpmPackFile {
  readonly path: string;
}
