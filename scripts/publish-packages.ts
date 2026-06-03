const packages: readonly PackagePolicy[] = [
  { name: "@nnrp/core", directory: "packages/core" },
  { name: "@nnrp/native", directory: "packages/native" },
  { name: "@nnrp/wasm", directory: "packages/wasm" },
];

const options = parsePublishOptions(Deno.args);
const version = await readWorkspaceVersion();
const rootNpmrc = await resolveRootNpmrc();

await resetOutputDir(options.outputDir);

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
  await npmPublish(policy.name, stageDir, options, rootNpmrc);
}

function parsePublishOptions(args: readonly string[]): PublishOptions {
  let tag = "preview";
  let outputDir = "artifacts/npm-publish";
  let dryRun = false;
  let provenance = false;
  let otp: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--tag" && next) {
      tag = next;
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

    if (arg === "--otp" && next) {
      otp = next;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported publish option: ${arg}`);
  }

  if (!/^[a-z0-9._-]+$/i.test(tag)) {
    throw new Error(`Invalid npm dist-tag: ${tag}`);
  }

  return {
    tag,
    outputDir,
    dryRun,
    provenance,
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
    await copyPath(`${policy.directory}/${file}`, `${stageDir}/${file}`);
  }
}

async function npmPublish(
  packageName: string,
  stageDir: string,
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
    cwd: stageDir,
    stdout: "inherit",
    stderr: "inherit",
  }).output();

  if (!output.success) {
    throw new Error(`${packageName}: npm publish failed with code ${output.code}`);
  }
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

interface PublishOptions {
  readonly tag: string;
  readonly outputDir: string;
  readonly dryRun: boolean;
  readonly provenance: boolean;
  readonly otp?: string;
}
