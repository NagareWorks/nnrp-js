const packages: readonly PackagePolicy[] = [
  {
    name: "@nnrp/core",
    directory: "packages/core",
    requiredFiles: ["README.md", "dist/index.js", "dist/index.d.ts", "dist/index.d.ts.map"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /\.js\.map$/, /^native\//, /^wasm\//],
  },
  {
    name: "@nnrp/native-client",
    directory: "packages/native-client",
    requiredFiles: ["README.md", "dist/index.js", "dist/index.d.ts", "dist/index.d.ts.map"],
    forbiddenPatterns: [
      /\.tsbuildinfo$/,
      /\.js\.map$/,
      /^native\//,
      /^wasm\//,
      /browser/i,
      /websocket/i,
      /webtransport/i,
    ],
  },
  {
    name: "@nnrp/native-server",
    directory: "packages/native-server",
    requiredFiles: ["README.md", "dist/index.js", "dist/index.d.ts", "dist/index.d.ts.map"],
    forbiddenPatterns: [
      /\.tsbuildinfo$/,
      /\.js\.map$/,
      /^native\//,
      /^wasm\//,
      /browser/i,
      /websocket/i,
      /webtransport/i,
    ],
  },
  {
    name: "@nnrp/browser-client",
    directory: "packages/browser-client",
    requiredFiles: ["README.md", "dist/index.js", "dist/index.d.ts", "dist/index.d.ts.map", "wasm/**"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /\.js\.map$/, /native/i, /nnrp_ffi/i, /\.(?:dll|so|dylib|a)$/],
  },
  {
    name: "@nnrp/transport-tcp",
    directory: "packages/transport-tcp",
    requiredFiles: ["README.md", "dist/index.js", "dist/index.d.ts", "dist/index.d.ts.map", "native/**"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /\.js\.map$/, /^wasm\//, /browser/i, /websocket/i, /webtransport/i],
  },
  {
    name: "@nnrp/transport-quic",
    directory: "packages/transport-quic",
    requiredFiles: ["README.md", "dist/index.js", "dist/index.d.ts", "dist/index.d.ts.map", "native/**"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /\.js\.map$/, /^wasm\//, /browser/i, /websocket/i, /webtransport/i],
  },
  {
    name: "@nnrp/transport-websocket",
    directory: "packages/transport-websocket",
    requiredFiles: ["README.md", "dist/index.js", "dist/index.d.ts", "dist/index.d.ts.map"],
    forbiddenPatterns: [/\.tsbuildinfo$/, /\.js\.map$/, /native/i, /nnrp_ffi/i, /\.(?:dll|so|dylib|a)$/],
  },
];

const failures: string[] = [];
const nativeArtifactManifestPattern = /^native\/[^/]+\/manifest\.json$/;
const wasmArtifactManifestPattern = /^wasm\/manifest\.json$/;

for (const policy of packages) {
  const packageJson = await readPackageJson(policy);
  const declaredFiles = readDeclaredFiles(policy, packageJson);
  checkPackageMetadata(policy, packageJson);
  checkNativeArtifactMetadata(policy, packageJson, declaredFiles);
  checkWasmArtifactMetadata(policy, packageJson, declaredFiles);

  for (const required of policy.requiredFiles) {
    if (!declaredFiles.includes(required)) {
      failures.push(`${policy.name}: package.json files does not include ${required}`);
    }
    if (!await existsRequiredPackagePath(policy.directory, required)) {
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

function checkNativeArtifactMetadata(
  policy: PackagePolicy,
  packageJson: Record<string, unknown>,
  declaredFiles: readonly string[],
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

  if (!declaredFiles.some((file) => file === "native/**" || nativeArtifactManifestPattern.test(file))) {
    failures.push(`${policy.name}: native artifact packaging requires native/**`);
  }
}

function checkWasmArtifactMetadata(
  policy: PackagePolicy,
  packageJson: Record<string, unknown>,
  declaredFiles: readonly string[],
): void {
  if (!isWasmArtifactPackagingEnabled(packageJson)) {
    return;
  }

  if (policy.name !== "@nnrp/browser-client") {
    failures.push(`${policy.name}: wasm artifact packaging can only be enabled on browser client packages`);
    return;
  }

  if (!declaredFiles.some((file) => file === "wasm/**" || wasmArtifactManifestPattern.test(file))) {
    failures.push(`${policy.name}: wasm artifact packaging requires wasm/**`);
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

  checkKeywords(policy, packageJson.keywords);
  if (isNativeArtifactPackage(policy)) {
    checkNativeArtifactExportMap(policy, packageJson.exports);
  } else {
    checkExportMap(policy, packageJson.exports);
  }
}

function isNativeArtifactPackage(policy: PackagePolicy): boolean {
  return policy.name.startsWith("@nnrp/native-") && policy.name !== "@nnrp/native-client" &&
    policy.name !== "@nnrp/native-server";
}

function checkNativeArtifactExportMap(policy: PackagePolicy, exports: unknown): void {
  if (!exports || typeof exports !== "object" || Array.isArray(exports)) {
    failures.push(`${policy.name}: package.json exports must be an object`);
    return;
  }

  const exportMap = exports as Record<string, unknown>;
  if (exportMap["./package.json"] !== "./package.json") {
    failures.push(`${policy.name}: package.json exports must expose ./package.json`);
  }

  if (exportMap["./native/manifest.json"] !== "./native/manifest.json") {
    failures.push(`${policy.name}: package.json exports must expose ./native/manifest.json`);
  }

  if (exportMap["./native/*"] !== "./native/*") {
    failures.push(`${policy.name}: package.json exports must expose ./native/*`);
  }
}

function checkKeywords(policy: PackagePolicy, keywords: unknown): void {
  if (!Array.isArray(keywords) || keywords.length === 0 || keywords.some((entry) => typeof entry !== "string")) {
    failures.push(`${policy.name}: package.json keywords must be a non-empty string array`);
  }
}

function checkExportMap(policy: PackagePolicy, exports: unknown): void {
  if (!exports || typeof exports !== "object" || Array.isArray(exports)) {
    failures.push(`${policy.name}: package.json exports must be an object`);
    return;
  }

  const exportMap = exports as Record<string, unknown>;
  const root = exportMap["."];
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    failures.push(`${policy.name}: package.json exports must include a root entry`);
    return;
  }

  const rootMap = root as Record<string, unknown>;
  if (rootMap.types !== "./dist/index.d.ts" || rootMap.default !== "./dist/index.js") {
    failures.push(`${policy.name}: package.json root export must point to dist index files`);
  }

  for (const reserved of ["./experimental/*", "./internal/*"]) {
    if (exportMap[reserved] !== null) {
      failures.push(`${policy.name}: package.json exports must reserve ${reserved} as null until frozen`);
    }
  }
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

async function existsRequiredPackagePath(directory: string, required: string): Promise<boolean> {
  if (required.endsWith("/**")) {
    const root = `${directory}/${required.slice(0, -3)}`;
    try {
      const stat = await Deno.stat(root);
      return stat.isDirectory;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      throw error;
    }
  }

  return await exists(`${directory}/${required}`);
}

interface PackagePolicy {
  readonly name: string;
  readonly directory: string;
  readonly requiredFiles: readonly string[];
  readonly forbiddenPatterns: readonly RegExp[];
}
