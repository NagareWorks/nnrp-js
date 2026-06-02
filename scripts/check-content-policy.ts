const prohibitedTerms = [
  `Anth${"ropic"}`,
  `Clau${"de"}`,
] as const;

const scannedRoots = [
  ".github",
  "assets",
  "doc",
  "examples",
  "packages",
  "scripts",
  "README.md",
  "CONTRIBUTING.md",
  "deno.json",
  "package.json",
] as const;

const textFileExtensions = new Set([
  ".json",
  ".md",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".yml",
  ".yaml",
  ".svg",
]);

const failures: string[] = [];

for (const root of scannedRoots) {
  await scanPath(root);
}

if (failures.length > 0) {
  console.error("Content policy check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  Deno.exit(1);
}

async function scanPath(path: string): Promise<void> {
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return;
    }
    throw error;
  }

  if (stat.isDirectory) {
    for await (const entry of Deno.readDir(path)) {
      if (entry.name === "dist" || entry.name === "node_modules" || entry.name === "artifacts") {
        continue;
      }
      await scanPath(`${path}/${entry.name}`);
    }
    return;
  }

  if (stat.isFile && shouldScanTextFile(path)) {
    await scanTextFile(path);
  }
}

async function scanTextFile(path: string): Promise<void> {
  const text = await Deno.readTextFile(path);
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const term of prohibitedTerms) {
      if (line.toLowerCase().includes(term.toLowerCase())) {
        failures.push(`${path}:${index + 1}: prohibited vendor/model reference '${term}'`);
      }
    }
  }
}

function shouldScanTextFile(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized.includes(".")) {
    return true;
  }

  const extension = normalized.slice(normalized.lastIndexOf("."));
  return textFileExtensions.has(extension);
}
