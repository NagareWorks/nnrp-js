const packages: readonly PackagePackPolicy[] = [
  {
    name: "@nnrp/core",
    directory: "packages/core",
    expectedFiles: ["README.md", "dist/index.d.ts", "dist/index.d.ts.map", "dist/index.js", "package.json"],
    forbiddenFiles: [/\.tsbuildinfo$/, /\.js\.map$/, /^native\//, /^wasm\//],
  },
  {
    name: "@nnrp/native-client",
    directory: "packages/native-client",
    expectedFiles: [
      "README.md",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/index.js",
      "package.json",
    ],
    forbiddenFiles: [/\.tsbuildinfo$/, /\.js\.map$/, /^native\//, /^wasm\//, /browser/i, /websocket/i, /webtransport/i],
  },
  {
    name: "@nnrp/native-server",
    directory: "packages/native-server",
    expectedFiles: [
      "README.md",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/index.js",
      "package.json",
    ],
    forbiddenFiles: [/\.tsbuildinfo$/, /\.js\.map$/, /^native\//, /^wasm\//, /browser/i, /websocket/i, /webtransport/i],
  },
  {
    name: "@nnrp/browser-client",
    directory: "packages/browser-client",
    expectedFiles: [
      "README.md",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/index.js",
      "package.json",
      "wasm/manifest.json",
      "wasm/nnrp_wasm.d.ts",
      "wasm/nnrp_wasm.wasm",
    ],
    forbiddenFiles: [/\.tsbuildinfo$/, /\.js\.map$/, /native/i, /nnrp_ffi/i, /\.(?:dll|so|dylib|a)$/],
  },
  {
    name: "@nnrp/transport-tcp",
    directory: "packages/transport-tcp",
    expectedFiles: [
      "README.md",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/index.js",
      "native/windows-x86_64/manifest.json",
      "package.json",
      "wasm/manifest.json",
      "wasm/nnrp_wasm.d.ts",
      "wasm/nnrp_wasm.wasm",
    ],
    forbiddenFiles: [/\.tsbuildinfo$/, /\.js\.map$/, /browser/i, /websocket/i, /webtransport/i],
  },
  {
    name: "@nnrp/transport-quic",
    directory: "packages/transport-quic",
    expectedFiles: [
      "README.md",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/index.js",
      "native/windows-x86_64/manifest.json",
      "package.json",
      "wasm/manifest.json",
      "wasm/nnrp_wasm.d.ts",
      "wasm/nnrp_wasm.wasm",
    ],
    forbiddenFiles: [/\.tsbuildinfo$/, /\.js\.map$/, /browser/i, /websocket/i, /webtransport/i],
  },
  {
    name: "@nnrp/transport-websocket",
    directory: "packages/transport-websocket",
    expectedFiles: ["README.md", "dist/index.d.ts", "dist/index.d.ts.map", "dist/index.js", "package.json"],
    forbiddenFiles: [/\.tsbuildinfo$/, /\.js\.map$/, /native/i, /nnrp_ffi/i, /\.(?:dll|so|dylib|a)$/],
  },
];

const failures: string[] = [];
const packageVersions = new Map<string, string>();
const nativeArtifactManifestPattern = /^native\/[^/]+\/manifest\.json$/;
const wasmArtifactManifestPattern = /^wasm\/manifest\.json$/;

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
  checkNativeArtifactMetadata(policy, packageJson, packedFiles);
  checkWasmArtifactMetadata(policy, packageJson, packedFiles);
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

function checkNativeArtifactMetadata(
  policy: PackagePackPolicy,
  packageJson: Record<string, unknown>,
  packedFiles: readonly string[],
): void {
  if (!isNativeArtifactPackagingEnabled(packageJson)) {
    return;
  }

  if (policy.name !== "@nnrp/transport-tcp" && policy.name !== "@nnrp/transport-quic") {
    failures.push(
      `${policy.name}: native artifact packaging can only be enabled on native TCP/QUIC transport packages`,
    );
    return;
  }

  if (!packedFiles.some((file) => nativeArtifactManifestPattern.test(file))) {
    failures.push(`${policy.name}: native artifact packaging requires native/<tag>/manifest.json in npm pack output`);
  }
}

function checkWasmArtifactMetadata(
  policy: PackagePackPolicy,
  packageJson: Record<string, unknown>,
  packedFiles: readonly string[],
): void {
  if (!isWasmArtifactPackagingEnabled(packageJson)) {
    return;
  }

  if (
    policy.name !== "@nnrp/browser-client" && policy.name !== "@nnrp/transport-tcp" &&
    policy.name !== "@nnrp/transport-quic"
  ) {
    failures.push(
      `${policy.name}: wasm artifact packaging can only be enabled on browser client or TCP/QUIC transport packages`,
    );
    return;
  }

  if (!packedFiles.some((file) => wasmArtifactManifestPattern.test(file))) {
    failures.push(`${policy.name}: wasm artifact packaging requires wasm/manifest.json in npm pack output`);
  }
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

function isNativeArtifactPackagingEnabled(packageJson: Record<string, unknown>): boolean {
  const nnrp = packageJson.nnrp;
  if (!nnrp || typeof nnrp !== "object" || Array.isArray(nnrp)) {
    return false;
  }

  const nativeArtifacts = (nnrp as Record<string, unknown>).nativeArtifacts;
  if (!nativeArtifacts || typeof nativeArtifacts !== "object" || Array.isArray(nativeArtifacts)) {
    return false;
  }

  return (nativeArtifacts as Record<string, unknown>).enabled === true;
}

function isWasmArtifactPackagingEnabled(packageJson: Record<string, unknown>): boolean {
  const nnrp = packageJson.nnrp;
  if (!nnrp || typeof nnrp !== "object" || Array.isArray(nnrp)) {
    return false;
  }

  const wasmArtifacts = (nnrp as Record<string, unknown>).wasmArtifacts;
  if (!wasmArtifacts || typeof wasmArtifacts !== "object" || Array.isArray(wasmArtifacts)) {
    return false;
  }

  return (wasmArtifacts as Record<string, unknown>).enabled === true;
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
      ...await expandDeclaredFiles(policy.directory, files),
    ],
  };
}

async function expandDeclaredFiles(directory: string, files: readonly string[]): Promise<readonly NpmPackFile[]> {
  const output: NpmPackFile[] = [];
  for (const file of files) {
    if (file.endsWith("/**")) {
      const root = file.slice(0, -3);
      for await (const path of walkFiles(`${directory}/${root}`)) {
        output.push({ path: normalizePackPath(path.slice(directory.length + 1)) });
      }
      continue;
    }

    output.push({ path: file });
  }
  return output;
}

async function* walkFiles(directory: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(directory)) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory) {
      yield* walkFiles(path);
    } else if (entry.isFile) {
      yield path;
    }
  }
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
