const DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.3.8";
const browserWasmPackageDir = "packages/browser-client";
const transportPackages: readonly TransportPackagePolicy[] = [
  { transport: "tcp", packageDir: "packages/transport-tcp" },
  { transport: "quic", packageDir: "packages/transport-quic" },
] as const;

const nativeArtifacts: readonly NativeArtifactPolicy[] = [
  { artifactTag: "windows-x86_64", library: "nnrp_ffi.dll" },
  { artifactTag: "windows-x86", library: "nnrp_ffi.dll" },
  { artifactTag: "windows-aarch64", library: "nnrp_ffi.dll" },
  { artifactTag: "macos-x86_64", library: "libnnrp_ffi.dylib" },
  { artifactTag: "macos-aarch64", library: "libnnrp_ffi.dylib" },
  { artifactTag: "linux-x86_64", library: "libnnrp_ffi.so" },
  { artifactTag: "linux-x86", library: "libnnrp_ffi.so" },
  { artifactTag: "linux-aarch64", library: "libnnrp_ffi.so" },
  { artifactTag: "linux-armv7", library: "libnnrp_ffi.so" },
];

const version = Deno.env.get("NNRP_JS_RUST_ARTIFACT_VERSION") ?? DEFAULT_RUST_ARTIFACT_VERSION;
const cacheDir = Deno.env.get("NNRP_JS_RUST_ARTIFACT_CACHE") ?? "artifacts/rust-artifacts";

await Deno.mkdir(cacheDir, { recursive: true });

for (const transportPackage of transportPackages) {
  for (const artifact of nativeArtifacts) {
    await prepareNativeTransportArtifactPackage(transportPackage, artifact, version);
  }
}

await prepareBrowserWasmPrimitives(version);
for (const transportPackage of transportPackages) {
  await prepareWasmTransportArtifactPackage(transportPackage, version);
}

async function prepareNativeTransportArtifactPackage(
  transportPackage: TransportPackagePolicy,
  policy: NativeArtifactPolicy,
  artifactVersion: string,
): Promise<void> {
  const assetName =
    `nnrp-ffi-transport-${transportPackage.transport}-native-${policy.artifactTag}-${artifactVersion}.zip`;
  const extractDir = `${cacheDir}/${transportPackage.transport}-${policy.artifactTag}`;
  await downloadReleaseAsset(assetName);
  await resetDir(extractDir);
  await extractZip(`${cacheDir}/${assetName}`, extractDir);

  const outputDir = `${transportPackage.packageDir}/native/${policy.artifactTag}`;
  await resetDir(outputDir);
  await copyFile(`${extractDir}/manifest.json`, `${outputDir}/manifest.json`);
  await copyFile(`${extractDir}/${policy.library}`, `${outputDir}/${policy.library}`);
}

async function prepareBrowserWasmPrimitives(artifactVersion: string): Promise<void> {
  const assetName = `nnrp-wasm-primitives-${artifactVersion}.zip`;
  const extractDir = `${cacheDir}/browser-wasm-primitives`;
  await downloadReleaseAsset(assetName);
  await resetDir(extractDir);
  await extractZip(`${cacheDir}/${assetName}`, extractDir);

  await resetDir(`${browserWasmPackageDir}/wasm`);
  await copyFile(`${extractDir}/manifest.json`, `${browserWasmPackageDir}/wasm/manifest.json`);
  await copyFile(`${extractDir}/nnrp_wasm.wasm`, `${browserWasmPackageDir}/wasm/nnrp_wasm.wasm`);
  await copyFile(`${extractDir}/nnrp_wasm.d.ts`, `${browserWasmPackageDir}/wasm/nnrp_wasm.d.ts`);
}

async function prepareWasmTransportArtifactPackage(
  transportPackage: TransportPackagePolicy,
  artifactVersion: string,
): Promise<void> {
  const assetName = `nnrp-wasm-transport-${transportPackage.transport}-${artifactVersion}.zip`;
  const extractDir = `${cacheDir}/${transportPackage.transport}-wasm`;
  await downloadReleaseAsset(assetName);
  await resetDir(extractDir);
  await extractZip(`${cacheDir}/${assetName}`, extractDir);

  await resetDir(`${transportPackage.packageDir}/wasm`);
  await copyFile(`${extractDir}/manifest.json`, `${transportPackage.packageDir}/wasm/manifest.json`);
  await copyFile(`${extractDir}/nnrp_wasm.wasm`, `${transportPackage.packageDir}/wasm/nnrp_wasm.wasm`);
  await copyFile(`${extractDir}/nnrp_wasm.d.ts`, `${transportPackage.packageDir}/wasm/nnrp_wasm.d.ts`);
}

async function downloadReleaseAsset(assetName: string): Promise<void> {
  const outputPath = `${cacheDir}/${assetName}`;
  try {
    const stat = await Deno.stat(outputPath);
    if (stat.isFile) {
      return;
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }

  const output = await new Deno.Command("gh", {
    args: [
      "release",
      "download",
      `v${version}`,
      "--repo",
      "NagareWorks/nnrp-rs",
      "--pattern",
      assetName,
      "--dir",
      cacheDir,
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();

  if (!output.success) {
    throw new Error(`failed to download nnrp-rs release asset ${assetName}`);
  }
}

async function extractZip(zipPath: string, outputDir: string): Promise<void> {
  if (Deno.build.os === "windows") {
    const output = await new Deno.Command("powershell", {
      args: [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${escapePowerShell(zipPath)}' -DestinationPath '${
          escapePowerShell(outputDir)
        }' -Force`,
      ],
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (!output.success) {
      throw new Error(`failed to extract ${zipPath}`);
    }
    return;
  }

  const output = await new Deno.Command("unzip", {
    args: ["-q", "-o", zipPath, "-d", outputDir],
    stdout: "inherit",
    stderr: "inherit",
  }).output();

  if (!output.success) {
    throw new Error(`failed to extract ${zipPath}`);
  }
}

async function resetDir(path: string): Promise<void> {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  });
  await Deno.mkdir(path, { recursive: true });
}

async function copyFile(source: string, destination: string): Promise<void> {
  const parent = destination.slice(0, destination.lastIndexOf("/"));
  if (parent.length > 0) {
    await Deno.mkdir(parent, { recursive: true });
  }
  await Deno.copyFile(source, destination);
}

function escapePowerShell(path: string): string {
  return path.replaceAll("'", "''");
}

interface NativeArtifactPolicy {
  readonly artifactTag: string;
  readonly library: string;
}

interface TransportPackagePolicy {
  readonly transport: "tcp" | "quic";
  readonly packageDir: string;
}
