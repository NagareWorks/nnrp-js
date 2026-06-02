const packages: readonly PackagePolicy[] = [
  {
    name: "@nnrp/core",
    directory: "packages/core",
    requiredFiles: ["README.md", "dist/index.js", "dist/index.d.ts", "dist/index.d.ts.map"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /\.js\.map$/, /^native\//, /^wasm\//],
  },
  {
    name: "@nnrp/native",
    directory: "packages/native",
    requiredFiles: ["README.md", "dist/index.js", "dist/index.d.ts", "dist/index.d.ts.map"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /\.js\.map$/, /browser/i, /websocket/i, /webtransport/i],
  },
  {
    name: "@nnrp/wasm",
    directory: "packages/wasm",
    requiredFiles: ["README.md", "dist/index.js", "dist/index.d.ts", "dist/index.d.ts.map"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /\.js\.map$/, /native/i, /nnrp_ffi/i, /\.(?:dll|so|dylib|a)$/],
  },
];

const failures: string[] = [];

for (const policy of packages) {
  const packageJson = await readPackageJson(policy);
  const declaredFiles = readDeclaredFiles(policy, packageJson);
  checkPackageMetadata(policy, packageJson);

  for (const required of policy.requiredFiles) {
    if (!declaredFiles.includes(required)) {
      failures.push(`${policy.name}: package.json files does not include ${required}`);
    }
    if (!await exists(`${policy.directory}/${required}`)) {
      failures.push(`${policy.name}: missing built file ${required}`);
    }
  }

  for (const file of declaredFiles) {
    for (const pattern of policy.forbiddenPatterns) {
      if (pattern.test(file)) {
        failures.push(`${policy.name}: forbidden package file declaration ${file}`);
      }
    }
  }
}

function checkPackageMetadata(policy: PackagePolicy, packageJson: Record<string, unknown>): void {
  for (const field of ["name", "version", "description", "license", "exports", "type"]) {
    if (packageJson[field] === undefined) {
      failures.push(`${policy.name}: package.json missing ${field}`);
    }
  }

  if (packageJson.license !== "Apache-2.0") {
    failures.push(`${policy.name}: package.json license must be Apache-2.0`);
  }

  if (packageJson.type !== "module") {
    failures.push(`${policy.name}: package.json type must be module`);
  }

  if (packageJson.private !== true) {
    failures.push(`${policy.name}: package.json must stay private until release gates are enabled`);
  }
}

if (failures.length > 0) {
  console.error("Package content check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  Deno.exit(1);
}

async function readPackageJson(policy: PackagePolicy): Promise<Record<string, unknown>> {
  return JSON.parse(await Deno.readTextFile(`${policy.directory}/package.json`)) as Record<string, unknown>;
}

function readDeclaredFiles(policy: PackagePolicy, packageJson: Record<string, unknown>): readonly string[] {
  if (!Array.isArray(packageJson.files) || packageJson.files.some((entry) => typeof entry !== "string")) {
    failures.push(`${policy.name}: package.json files must be a string array`);
    return [];
  }

  return packageJson.files as readonly string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

interface PackagePolicy {
  readonly name: string;
  readonly directory: string;
  readonly requiredFiles: readonly string[];
  readonly forbiddenPatterns: readonly RegExp[];
}
