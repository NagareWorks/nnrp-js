const packages: readonly PackagePolicy[] = [
  { name: "@nnrp/core", directory: "packages/core" },
  { name: "@nnrp/transport-tcp", directory: "packages/transport-tcp" },
  { name: "@nnrp/transport-quic", directory: "packages/transport-quic" },
  { name: "@nnrp/transport-ipc", directory: "packages/transport-ipc" },
  { name: "@nnrp/transport-websocket", directory: "packages/transport-websocket" },
  { name: "@nnrp/native-client", directory: "packages/native-client" },
  { name: "@nnrp/native-server", directory: "packages/native-server" },
  { name: "@nnrp/browser-client", directory: "packages/browser-client" },
];

const options = parsePublishOptions(Deno.args);
const version = await readWorkspaceVersion();
const rootNpmrc = await resolveRootNpmrc();

validatePublishOptions(options);
await resetOutputDir(options.outputDir);

const stagedPackages: StagedPackage[] = [];
for (const policy of packages) {
  const packageJson = await readPackageJson(policy.directory);
  const packageVersion = readString(packageJson, "version", policy.name);
  if (packageVersion !== version) {
    throw new Error(`${policy.name}: package version ${packageVersion} does not match workspace version ${version}`);
  }

  const stageDir = `${options.outputDir}/${packageStageName(policy.name)}`;
  await Deno.mkdir(stageDir, { recursive: true });
  await stagePackageFiles(policy, packageJson, stageDir);
  await Deno.writeTextFile(
    `${stageDir}/package.json`,
    `${JSON.stringify(publishablePackageJson(packageJson), null, 2)}\n`,
  );
  stagedPackages.push({ ...policy, version: packageVersion, stageDir });
}

if (!options.skipPublish) {
  if (options.dryRun) {
    for (const stagedPackage of stagedPackages) {
      await npmPublish(stagedPackage, options, rootNpmrc);
    }
  } else {
    const publicationPlan = await inspectPublicationPlan(stagedPackages);
    for (const entry of publicationPlan) {
      if (entry.alreadyPublished) {
        console.log(`${entry.package.name}@${entry.package.version} already exists with identical integrity.`);
        continue;
      }
      await npmPublish(entry.package, options, rootNpmrc);
    }

    await verifyPublishedPackages(stagedPackages);
    if (!options.provenance) {
      for (const stagedPackage of stagedPackages) {
        await npmDistTagAdd(stagedPackage, options.tag, rootNpmrc);
        await npmDistTagAddMany(stagedPackage, options.additionalTags, rootNpmrc);
      }
    }
    await verifyDistTags(stagedPackages, [options.tag, ...options.additionalTags]);
  }
}

function validatePublishOptions(options: PublishOptions): void {
  if (options.provenance && options.additionalTags.length > 0) {
    throw new Error(
      "Additional npm dist-tags cannot be assigned during Trusted Publishing. " +
        "Run release with the single canonical npm tag instead.",
    );
  }
}

function parsePublishOptions(args: readonly string[]): PublishOptions {
  let tag = "preview";
  let outputDir = "artifacts/npm-publish";
  let dryRun = false;
  let provenance = false;
  let skipPublish = false;
  let otp: string | undefined;
  const additionalTags: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--tag" && next) {
      tag = next;
      index += 1;
      continue;
    }

    if (arg === "--also-tag" && next) {
      additionalTags.push(next);
      index += 1;
      continue;
    }

    if (arg === "--output" && next) {
      outputDir = next;
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--provenance") {
      provenance = true;
      continue;
    }

    if (arg === "--skip-publish") {
      skipPublish = true;
      continue;
    }

    if (arg === "--otp" && next) {
      otp = next;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported publish option: ${arg}`);
  }

  for (const distTag of [tag, ...additionalTags]) {
    if (!/^[a-z0-9._-]+$/i.test(distTag)) {
      throw new Error(`Invalid npm dist-tag: ${distTag}`);
    }
  }

  return {
    tag,
    additionalTags: [...new Set(additionalTags.filter((distTag) => distTag !== tag))],
    outputDir,
    dryRun,
    provenance,
    skipPublish,
    ...(otp === undefined ? {} : { otp }),
  };
}

async function readWorkspaceVersion(): Promise<string> {
  return readString(
    JSON.parse(await Deno.readTextFile("package.json")) as Record<string, unknown>,
    "version",
    "workspace",
  );
}

async function readPackageJson(directory: string): Promise<Record<string, unknown>> {
  return JSON.parse(await Deno.readTextFile(`${directory}/package.json`)) as Record<string, unknown>;
}

function publishablePackageJson(packageJson: Record<string, unknown>): Record<string, unknown> {
  const output = { ...packageJson };
  delete output.private;
  output.publishConfig = { access: "public" };

  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"] as const) {
    const dependencies = output[field];
    if (dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)) {
      output[field] = replaceWorkspaceDependencies(dependencies as Record<string, unknown>);
    }
  }

  return output;
}

function replaceWorkspaceDependencies(dependencies: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [name, value] of Object.entries(dependencies)) {
    if (typeof value !== "string") {
      throw new Error(`${name}: dependency version must be a string`);
    }
    output[name] = value.startsWith("workspace:") ? version : value;
  }
  return output;
}

async function stagePackageFiles(
  policy: PackagePolicy,
  packageJson: Record<string, unknown>,
  stageDir: string,
): Promise<void> {
  await copyFile(`${policy.directory}/README.md`, `${stageDir}/README.md`);
  for (const file of readFiles(packageJson, policy.name)) {
    if (file === "README.md") {
      continue;
    }
    if (file.endsWith("/**")) {
      const root = file.slice(0, -3);
      await copyPath(`${policy.directory}/${root}`, `${stageDir}/${root}`);
      continue;
    }
    await copyPath(`${policy.directory}/${file}`, `${stageDir}/${file}`);
  }
}

async function npmPublish(
  stagedPackage: StagedPackage,
  options: PublishOptions,
  rootNpmrc: string | undefined,
): Promise<void> {
  const args = [
    "publish",
    "--access",
    "public",
    "--tag",
    options.tag,
    ...(rootNpmrc === undefined ? [] : ["--userconfig", rootNpmrc]),
    ...(options.provenance ? ["--provenance"] : []),
    ...(options.otp === undefined ? [] : [`--otp=${options.otp}`]),
    ...(options.dryRun ? ["--dry-run"] : []),
  ];
  const output = await new Deno.Command(npmCommand(), {
    args: npmArgs(args),
    cwd: stagedPackage.stageDir,
    stdout: "inherit",
    stderr: "inherit",
  }).output();

  if (!output.success) {
    throw new Error(`${stagedPackage.name}: npm publish failed with code ${output.code}`);
  }
}

async function npmDistTagAddMany(
  stagedPackage: StagedPackage,
  distTags: readonly string[],
  rootNpmrc: string | undefined,
): Promise<void> {
  for (const distTag of distTags) {
    await npmDistTagAdd(stagedPackage, distTag, rootNpmrc);
  }
}

async function inspectPublicationPlan(stagedPackages: readonly StagedPackage[]): Promise<PublicationPlanEntry[]> {
  const plan: PublicationPlanEntry[] = [];
  for (const stagedPackage of stagedPackages) {
    const stagedIntegrity = await npmPackIntegrity(stagedPackage);
    const publishedIntegrity = await npmPublishedIntegrity(stagedPackage);
    if (publishedIntegrity !== undefined && publishedIntegrity !== stagedIntegrity) {
      throw new Error(
        `${stagedPackage.name}@${stagedPackage.version}: registry integrity ${publishedIntegrity} ` +
          `does not match staged integrity ${stagedIntegrity}`,
      );
    }
    plan.push({ package: stagedPackage, stagedIntegrity, alreadyPublished: publishedIntegrity !== undefined });
  }
  return plan;
}

async function npmPackIntegrity(stagedPackage: StagedPackage): Promise<string> {
  const output = await runNpm(
    ["pack", "--dry-run", "--json"],
    stagedPackage.stageDir,
    `${stagedPackage.name}: npm pack integrity inspection`,
  );
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1 || typeof parsed[0] !== "object" || parsed[0] === null) {
    throw new Error(`${stagedPackage.name}: unexpected npm pack --json output`);
  }
  const integrity = (parsed[0] as Record<string, unknown>).integrity;
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
    throw new Error(`${stagedPackage.name}: npm pack did not return a SHA-512 integrity`);
  }
  return integrity;
}

async function npmPublishedIntegrity(stagedPackage: StagedPackage): Promise<string | undefined> {
  const output = await new Deno.Command(npmCommand(), {
    args: npmArgs(["view", `${stagedPackage.name}@${stagedPackage.version}`, "dist.integrity", "--json"]),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    if (stderr.includes("E404") || stderr.includes("404 Not Found")) {
      return undefined;
    }
    throw new Error(
      `${stagedPackage.name}: npm registry inspection failed with code ${output.code}\n${stderr.trim()}`,
    );
  }
  const parsed = JSON.parse(new TextDecoder().decode(output.stdout)) as unknown;
  if (typeof parsed !== "string" || !parsed.startsWith("sha512-")) {
    throw new Error(`${stagedPackage.name}: registry returned an invalid dist.integrity`);
  }
  return parsed;
}

async function npmDistTagAdd(
  stagedPackage: StagedPackage,
  distTag: string,
  rootNpmrc: string | undefined,
): Promise<void> {
  const args = [
    "dist-tag",
    "add",
    `${stagedPackage.name}@${stagedPackage.version}`,
    distTag,
    ...(rootNpmrc === undefined ? [] : ["--userconfig", rootNpmrc]),
  ];
  const output = await new Deno.Command(npmCommand(), {
    args: npmArgs(args),
    cwd: stagedPackage.stageDir,
    stdout: "inherit",
    stderr: "inherit",
  }).output();

  if (!output.success) {
    throw new Error(`${stagedPackage.name}: npm dist-tag add ${distTag} failed with code ${output.code}`);
  }
}

async function verifyPublishedPackages(stagedPackages: readonly StagedPackage[]): Promise<void> {
  for (const stagedPackage of stagedPackages) {
    const expected = await npmPackIntegrity(stagedPackage);
    const actual = await retryRegistryValue(() => npmPublishedIntegrity(stagedPackage));
    if (actual !== expected) {
      throw new Error(
        `${stagedPackage.name}@${stagedPackage.version}: published integrity ${actual ?? "missing"} ` +
          `does not match staged integrity ${expected}`,
      );
    }
  }
}

async function verifyDistTags(stagedPackages: readonly StagedPackage[], distTags: readonly string[]): Promise<void> {
  for (const stagedPackage of stagedPackages) {
    for (const distTag of distTags) {
      const actual = await retryRegistryValue(() => npmDistTagVersion(stagedPackage.name, distTag));
      if (actual !== stagedPackage.version) {
        throw new Error(
          `${stagedPackage.name}: npm dist-tag ${distTag} resolves to ${actual ?? "missing"}, ` +
            `expected ${stagedPackage.version}`,
        );
      }
    }
  }
}

async function npmDistTagVersion(packageName: string, distTag: string): Promise<string | undefined> {
  const output = await new Deno.Command(npmCommand(), {
    args: npmArgs(["view", `${packageName}@${distTag}`, "version", "--json"]),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    if (stderr.includes("E404") || stderr.includes("404 Not Found")) return undefined;
    throw new Error(
      `${packageName}: npm dist-tag ${distTag} inspection failed with code ${output.code}\n${stderr.trim()}`,
    );
  }
  const parsed = JSON.parse(new TextDecoder().decode(output.stdout)) as unknown;
  return typeof parsed === "string" ? parsed : undefined;
}

async function retryRegistryValue<T>(read: () => Promise<T | undefined>): Promise<T | undefined> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const value = await read();
    if (value !== undefined) return value;
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
  }
  return undefined;
}

async function runNpm(args: readonly string[], cwd: string, description: string): Promise<string> {
  const output = await new Deno.Command(npmCommand(), {
    args: npmArgs(args),
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stdout = new TextDecoder().decode(output.stdout);
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr);
    throw new Error(`${description} failed with code ${output.code}\n${stderr.trim()}\n${stdout.trim()}`);
  }
  return stdout;
}

async function resetOutputDir(path: string): Promise<void> {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  });
  await Deno.mkdir(path, { recursive: true });
}

async function copyPath(source: string, destination: string): Promise<void> {
  const stat = await Deno.stat(source);
  if (stat.isDirectory) {
    await Deno.mkdir(destination, { recursive: true });
    for await (const entry of Deno.readDir(source)) {
      await copyPath(`${source}/${entry.name}`, `${destination}/${entry.name}`);
    }
    return;
  }

  if (stat.isFile) {
    await copyFile(source, destination);
  }
}

async function copyFile(source: string, destination: string): Promise<void> {
  const parent = destination.slice(0, destination.lastIndexOf("/"));
  if (parent.length > 0) {
    await Deno.mkdir(parent, { recursive: true });
  }
  await Deno.copyFile(source, destination);
}

function readFiles(packageJson: Record<string, unknown>, packageName: string): readonly string[] {
  const value = packageJson.files;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${packageName}: package.json files must be a string array`);
  }
  return value as readonly string[];
}

function readString(packageJson: Record<string, unknown>, field: string, packageName: string): string {
  const value = packageJson[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${packageName}: package.json ${field} must be a non-empty string`);
  }
  return value;
}

async function resolveRootNpmrc(): Promise<string | undefined> {
  const npmrcPath = `${Deno.cwd()}/.npmrc`;
  try {
    const stat = await Deno.stat(npmrcPath);
    return stat.isFile ? npmrcPath : undefined;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return undefined;
    }
    throw error;
  }
}

function packageStageName(name: string): string {
  return name.replace("@", "").replace("/", "-");
}

function npmCommand(): string {
  return Deno.build.os === "windows" ? windowsCommandShell() : "npm";
}

function npmArgs(args: readonly string[]): string[] {
  return Deno.build.os === "windows" ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : [...args];
}

function windowsCommandShell(): string {
  return Deno.env.get("ComSpec") ?? "cmd";
}

interface PackagePolicy {
  readonly name: string;
  readonly directory: string;
}

interface StagedPackage extends PackagePolicy {
  readonly version: string;
  readonly stageDir: string;
}

interface PublicationPlanEntry {
  readonly package: StagedPackage;
  readonly stagedIntegrity: string;
  readonly alreadyPublished: boolean;
}

interface PublishOptions {
  readonly tag: string;
  readonly additionalTags: readonly string[];
  readonly outputDir: string;
  readonly dryRun: boolean;
  readonly provenance: boolean;
  readonly skipPublish: boolean;
  readonly otp?: string;
}
