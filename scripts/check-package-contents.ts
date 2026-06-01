const packages: readonly PackagePolicy[] = [
  {
    name: "@nnrp/core",
    directory: "packages/core",
    requiredFiles: ["dist/index.js", "dist/index.d.ts"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /^native\//, /^wasm\//],
  },
  {
    name: "@nnrp/native",
    directory: "packages/native",
    requiredFiles: ["dist/index.js", "dist/index.d.ts"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /browser/i, /websocket/i, /webtransport/i],
  },
  {
    name: "@nnrp/wasm",
    directory: "packages/wasm",
    requiredFiles: ["dist/index.js", "dist/index.d.ts"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /native/i, /nnrp_ffi/i, /\.(?:dll|so|dylib|a)$/],
  },
];

const failures: string[] = [];

for (const policy of packages) {
  const packageJson = await readPackageJson(policy);
  const declaredFiles = readDeclaredFiles(policy, packageJson);

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
