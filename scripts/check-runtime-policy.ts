const bannedFileNames = new Set([
  ".bun-version",
  "bun.lock",
  "bun.lockb",
  "bunfig.toml",
]);

const bannedFileNamePatterns: readonly RegExp[] = [
  /^bunfig\./i,
  /^\.?bunrc$/i,
];

const bannedTextPatterns: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "generic Bun runtime reference", pattern: /\bbun\b/i },
  { label: "bunx command", pattern: /\bbunx\b/i },
  { label: "Bun global API", pattern: /\bBun\./ },
  { label: "Bun global detection", pattern: /\bglobalThis\s*\.\s*Bun\b/ },
  { label: "Bun version detection", pattern: /\bprocess\s*\.\s*versions\s*\.\s*bun\b/i },
  { label: "Bun type reference", pattern: /<reference\s+types=["'](?:bun-types|@types\/bun)["']/i },
  { label: "Bun import protocol", pattern: /\bfrom\s+["']bun:/i },
  { label: "Bun test module", pattern: /["']bun:test["']/i },
  { label: "Bun type package", pattern: /(?:^|["'@\s])(?:bun-types|@types\/bun)(?:["'\s]|$)/i },
  { label: "Bun setup action", pattern: /\boven-sh\/setup-bun\b/i },
  { label: "Oven/Bun vendor namespace", pattern: /\b(?:@oven|oven-sh|oven\/bun)\b/i },
  { label: "Bun plugin surface", pattern: /\bBun(?:File|Plugin)\b/ },
  { label: "Bun ambient declaration", pattern: /\bdeclare\s+const\s+Bun\b/ },
  { label: "Bun typeof probe", pattern: /\btypeof\s+Bun\b/ },
];

const packageDependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

const allowedTextFiles = new Set([
  "CONTRIBUTING.md",
  "README.md",
  "scripts/check-runtime-policy.ts",
]);

const allowedTextPrefixes = [
  "doc/todo/",
];

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
]);

const violations: string[] = [];

async function scanDirectory(directory: string): Promise<void> {
  for await (const entry of Deno.readDir(directory)) {
    const path = `${directory}/${entry.name}`;
    const normalizedPath = normalizePath(path);

    if (entry.isDirectory) {
      if (!ignoredDirectories.has(entry.name)) {
        await scanDirectory(path);
      }
      continue;
    }

    if (!entry.isFile) {
      continue;
    }

    checkFileName(entry.name, normalizedPath);

    if (entry.name === "package.json") {
      await checkPackageJson(normalizedPath);
    }

    if (!isTextFile(entry.name) || isAllowedTextPath(normalizedPath)) {
      continue;
    }

    const text = await Deno.readTextFile(normalizedPath);
    checkText(normalizedPath, text);
  }
}

function checkFileName(fileName: string, path: string): void {
  if (bannedFileNames.has(fileName.toLowerCase())) {
    violations.push(`${path}: banned runtime file name`);
  }

  for (const pattern of bannedFileNamePatterns) {
    if (pattern.test(fileName)) {
      violations.push(`${path}: banned runtime file name pattern`);
    }
  }
}

async function checkPackageJson(path: string): Promise<void> {
  const json = JSON.parse(await Deno.readTextFile(path)) as Record<string, unknown>;

  const scripts = asStringMap(json.scripts);
  for (const [name, command] of Object.entries(scripts)) {
    for (const { label, pattern } of bannedTextPatterns) {
      if (pattern.test(command)) {
        violations.push(`${path}: script "${name}" contains ${label}`);
      }
    }
  }

  for (const section of packageDependencySections) {
    const dependencies = asStringMap(json[section]);
    for (const name of Object.keys(dependencies)) {
      for (const { label, pattern } of bannedTextPatterns) {
        if (pattern.test(name)) {
          violations.push(`${path}: ${section} dependency "${name}" contains ${label}`);
        }
      }
    }
  }
}

function checkText(path: string, text: string): void {
  for (const { label, pattern } of bannedTextPatterns) {
    if (pattern.test(text)) {
      violations.push(`${path}: ${label}`);
    }
  }
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") {
      result[key] = raw;
    }
  }
  return result;
}

function isAllowedTextPath(path: string): boolean {
  return allowedTextFiles.has(path) || allowedTextPrefixes.some((prefix) => path.startsWith(prefix));
}

function isTextFile(fileName: string): boolean {
  return /\.(cjs|cts|json|js|jsx|md|mjs|mts|toml|ts|tsx|txt|yaml|yml)$/.test(fileName);
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replaceAll("\\", "/");
}

await scanDirectory(".");

if (violations.length > 0) {
  console.error("Runtime policy violation:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  Deno.exit(1);
}
