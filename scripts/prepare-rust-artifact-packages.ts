import {
  BROWSER_WASM_REQUIRED_EXPORTS,
  NATIVE_ARTIFACTS,
  type NativeArtifactPolicy,
  type NativeTransportScope,
  normalizeBrowserArtifactManifest,
  normalizeNativeArtifactManifest,
  parseReleaseChecksums,
} from "./rust-artifact-policy.ts";

const DEFAULT_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.20";
const browserWasmPackageDir = "packages/browser-client";
const transportPackages: readonly TransportPackagePolicy[] = [
  { transport: "tcp", packageDir: "packages/transport-tcp" },
  { transport: "quic", packageDir: "packages/transport-quic" },
  { transport: "ipc", packageDir: "packages/transport-ipc" },
  { transport: "websocket", packageDir: "packages/transport-websocket" },
] as const;

const version = Deno.env.get("NNRP_JS_RUST_ARTIFACT_VERSION") ?? DEFAULT_RUST_ARTIFACT_VERSION;
const cacheDir = Deno.env.get("NNRP_JS_RUST_ARTIFACT_CACHE") ?? "artifacts/rust-artifacts";
const workflowRunId = Deno.env.get("NNRP_JS_RUST_ARTIFACT_RUN_ID");
const workflowCommit = Deno.env.get("NNRP_JS_RUST_ARTIFACT_COMMIT");

if ((workflowRunId === undefined) !== (workflowCommit === undefined)) {
  throw new Error(
    "NNRP_JS_RUST_ARTIFACT_RUN_ID and NNRP_JS_RUST_ARTIFACT_COMMIT must be set together",
  );
}

await Deno.mkdir(cacheDir, { recursive: true });
if (workflowRunId !== undefined && workflowCommit !== undefined) {
  await prepareWorkflowArtifactSource(workflowRunId, workflowCommit, version);
}
const releaseChecksums = await loadReleaseChecksums(version);

for (const transportPackage of transportPackages) {
  await prepareTransportReleaseAssets(transportPackage, version, releaseChecksums);
  for (const artifact of NATIVE_ARTIFACTS) {
    await prepareNativeTransportArtifactPackage(transportPackage, artifact, version, releaseChecksums);
  }
}

await prepareBrowserWasmArtifact(version, releaseChecksums);

async function prepareNativeTransportArtifactPackage(
  transportPackage: TransportPackagePolicy,
  policy: NativeArtifactPolicy,
  artifactVersion: string,
  releaseChecksums: ReadonlyMap<string, string>,
): Promise<void> {
  const assetName =
    `nnrp-ffi-transport-${transportPackage.transport}-native-${policy.artifactTag}-${artifactVersion}.zip`;
  const extractDir = `${cacheDir}/${transportPackage.transport}-${policy.artifactTag}`;
  const expectedSha256 = releaseChecksums.get(assetName);
  if (expectedSha256 === undefined) {
    throw new Error(`SHA256SUMS does not contain ${assetName}`);
  }
  await verifySha256(`${cacheDir}/${assetName}`, expectedSha256);
  await resetDir(extractDir);
  await extractZip(`${cacheDir}/${assetName}`, extractDir);

  const outputDir = `${transportPackage.packageDir}/native/${policy.artifactTag}`;
  await resetDir(outputDir);
  const sourceManifest = JSON.parse(await Deno.readTextFile(`${extractDir}/manifest.json`)) as unknown;
  const manifest = normalizeNativeArtifactManifest(sourceManifest, policy, transportPackage.transport, {
    release: `v${artifactVersion}`,
    archive: assetName,
    archiveSha256: expectedSha256,
  });
  await Deno.writeTextFile(`${outputDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  await copyFile(`${extractDir}/${policy.library}`, `${outputDir}/${policy.library}`);
  console.log(`staged ${transportPackage.transport}/${policy.artifactTag}`);
}

async function prepareTransportReleaseAssets(
  transportPackage: TransportPackagePolicy,
  artifactVersion: string,
  releaseChecksums: ReadonlyMap<string, string>,
): Promise<void> {
  const missingAssets: string[] = [];
  for (const policy of NATIVE_ARTIFACTS) {
    const assetName =
      `nnrp-ffi-transport-${transportPackage.transport}-native-${policy.artifactTag}-${artifactVersion}.zip`;
    const expectedSha256 = releaseChecksums.get(assetName);
    if (expectedSha256 === undefined) {
      throw new Error(`SHA256SUMS does not contain ${assetName}`);
    }
    const path = `${cacheDir}/${assetName}`;
    if (!await hasExpectedSha256(path, expectedSha256)) {
      await Deno.remove(path).catch((error) => {
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      });
      missingAssets.push(assetName);
    }
  }
  if (missingAssets.length === 0) {
    return;
  }

  await runConcurrent(missingAssets, 4, async (assetName) => {
    console.log(`downloading ${assetName}`);
    await downloadReleaseAsset(assetName, artifactVersion, true);
  });
}

async function runConcurrent<T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const value = values[nextIndex++]!;
      await operation(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
}

async function loadReleaseChecksums(artifactVersion: string): Promise<ReadonlyMap<string, string>> {
  await downloadReleaseAsset("SHA256SUMS", artifactVersion, true);
  return parseReleaseChecksums(await Deno.readTextFile(`${cacheDir}/SHA256SUMS`));
}

async function prepareBrowserWasmArtifact(
  artifactVersion: string,
  releaseChecksums: ReadonlyMap<string, string>,
): Promise<void> {
  const assetName = `nnrp-wasm-browser-${artifactVersion}.zip`;
  const extractDir = `${cacheDir}/browser-wasm`;
  const expectedSha256 = releaseChecksums.get(assetName);
  if (expectedSha256 === undefined) {
    throw new Error(`SHA256SUMS does not contain ${assetName}`);
  }
  await downloadReleaseAsset(assetName, artifactVersion, true);
  await verifySha256(`${cacheDir}/${assetName}`, expectedSha256);
  await resetDir(extractDir);
  await extractZip(`${cacheDir}/${assetName}`, extractDir);

  const sourceManifest = JSON.parse(await Deno.readTextFile(`${extractDir}/manifest.json`)) as unknown;
  const manifest = normalizeBrowserArtifactManifest(sourceManifest, {
    release: `v${artifactVersion}`,
    archive: assetName,
    archiveSha256: expectedSha256,
  });
  await validateBrowserWasmBinary(`${extractDir}/${manifest.wasm}`, assetName);
  const declarations = await Deno.readTextFile(`${extractDir}/${manifest.types}`);
  const glue = await Deno.readTextFile(`${extractDir}/${manifest.glue}`);
  for (const requiredExport of BROWSER_WASM_REQUIRED_EXPORTS) {
    if (!declarations.includes(requiredExport)) {
      throw new Error(`${assetName}: declarations are missing ${requiredExport}`);
    }
    if (!glue.includes(requiredExport)) {
      throw new Error(`${assetName}: JavaScript glue is missing ${requiredExport}`);
    }
  }

  await resetDir(`${browserWasmPackageDir}/wasm`);
  await Deno.writeTextFile(
    `${browserWasmPackageDir}/wasm/manifest.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await copyFile(`${extractDir}/${manifest.wasm}`, `${browserWasmPackageDir}/wasm/${manifest.wasm}`);
  await copyFile(`${extractDir}/${manifest.glue}`, `${browserWasmPackageDir}/wasm/${manifest.glue}`);
  await copyFile(`${extractDir}/${manifest.types}`, `${browserWasmPackageDir}/wasm/${manifest.types}`);
}

async function validateBrowserWasmBinary(path: string, assetName: string): Promise<void> {
  const binary = await Deno.readFile(path);
  if (
    binary.length < 8 || binary[0] !== 0x00 || binary[1] !== 0x61 || binary[2] !== 0x73 || binary[3] !== 0x6d ||
    binary[4] !== 0x01 || binary[5] !== 0x00 || binary[6] !== 0x00 || binary[7] !== 0x00
  ) {
    throw new Error(`${assetName}: browser WASM payload is not a WebAssembly binary`);
  }
}

async function downloadReleaseAsset(
  assetName: string,
  artifactVersion = version,
  replacePartial = false,
): Promise<void> {
  const outputPath = `${cacheDir}/${assetName}`;
  if (workflowRunId !== undefined) {
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
    throw new Error(`Rust workflow artifact ${workflowRunId} does not contain ${assetName}`);
  }

  if (!replacePartial) {
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
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (replacePartial) {
      await Deno.remove(outputPath).catch((error) => {
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      });
    }

    const output = await new Deno.Command("gh", {
      args: [
        "release",
        "download",
        `v${artifactVersion}`,
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

    if (output.success) {
      return;
    }
    if (attempt < 3) {
      console.warn(`retrying ${assetName} after failed download attempt ${attempt}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }

  throw new Error(`failed to download nnrp-rs release asset ${assetName} after 3 attempts`);
}

async function prepareWorkflowArtifactSource(
  runId: string,
  expectedCommit: string,
  artifactVersion: string,
): Promise<void> {
  if (!/^\d+$/.test(runId)) {
    throw new Error(`invalid NNRP_JS_RUST_ARTIFACT_RUN_ID: ${runId}`);
  }
  if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
    throw new Error(`invalid NNRP_JS_RUST_ARTIFACT_COMMIT: ${expectedCommit}`);
  }

  const run = await commandJson<WorkflowRun>([
    "run",
    "view",
    runId,
    "--repo",
    "NagareWorks/nnrp-rs",
    "--json",
    "headSha,status,conclusion",
  ]);
  if (run.headSha !== expectedCommit) {
    throw new Error(`Rust workflow run ${runId} points to ${run.headSha}, expected ${expectedCommit}`);
  }
  if (run.status !== "completed" || run.conclusion !== "success") {
    throw new Error(
      `Rust workflow run ${runId} is not a successful completed run: ${run.status}/${run.conclusion}`,
    );
  }

  const markerPath = `${cacheDir}/workflow-source.json`;
  const marker = { runId, commit: expectedCommit, version: artifactVersion };
  try {
    const cached = JSON.parse(await Deno.readTextFile(markerPath)) as unknown;
    if (
      isRecord(cached) && cached.runId === runId && cached.commit === expectedCommit &&
      cached.version === artifactVersion
    ) {
      const stat = await Deno.stat(`${cacheDir}/SHA256SUMS`);
      if (stat.isFile) {
        return;
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound) && !(error instanceof SyntaxError)) {
      throw error;
    }
  }

  await resetDir(cacheDir);
  const downloadDir = `${cacheDir}/workflow-download`;
  await Deno.mkdir(downloadDir, { recursive: true });
  const artifactName = `nnrp-rs-release-${artifactVersion}`;
  const output = await new Deno.Command("gh", {
    args: [
      "run",
      "download",
      runId,
      "--repo",
      "NagareWorks/nnrp-rs",
      "--name",
      artifactName,
      "--dir",
      downloadDir,
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!output.success) {
    throw new Error(`failed to download Rust workflow artifact ${artifactName} from run ${runId}`);
  }

  const checksumsPath = await findFile(downloadDir, "SHA256SUMS");
  if (checksumsPath === undefined) {
    throw new Error(`Rust workflow artifact ${artifactName} does not contain SHA256SUMS`);
  }
  const releaseAssetsDir = checksumsPath.slice(0, checksumsPath.lastIndexOf("/"));
  for await (const entry of Deno.readDir(releaseAssetsDir)) {
    if (entry.isFile) {
      await copyFile(`${releaseAssetsDir}/${entry.name}`, `${cacheDir}/${entry.name}`);
    }
  }
  await Deno.remove(downloadDir, { recursive: true });
  await Deno.writeTextFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
}

async function commandJson<T>(args: readonly string[]): Promise<T> {
  const output = await new Deno.Command("gh", {
    args: [...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr).trim() || `gh ${args.join(" ")} failed`);
  }
  return JSON.parse(new TextDecoder().decode(output.stdout)) as T;
}

async function findFile(root: string, name: string): Promise<string | undefined> {
  for await (const entry of Deno.readDir(root)) {
    const path = `${root}/${entry.name}`;
    if (entry.isFile && entry.name === name) {
      return path;
    }
    if (entry.isDirectory) {
      const nested = await findFile(path, name);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function verifySha256(path: string, expected: string): Promise<void> {
  const actual = await fileSha256(path);
  if (actual !== expected) {
    throw new Error(`${path}: SHA-256 mismatch; expected ${expected}, got ${actual}`);
  }
}

async function hasExpectedSha256(path: string, expected: string): Promise<boolean> {
  try {
    return await fileSha256(path) === expected;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

async function fileSha256(path: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await Deno.readFile(path));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

interface TransportPackagePolicy {
  readonly transport: NativeTransportScope;
  readonly packageDir: string;
}

interface WorkflowRun {
  readonly headSha: string;
  readonly status: string;
  readonly conclusion: string;
}
