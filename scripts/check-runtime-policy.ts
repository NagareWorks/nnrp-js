const bannedFileNames = new Set(["bun.lock", "bun.lockb", "bunfig.toml"]);
const bannedTextPattern = /\b(bun|bunx|bunfig|bun\.lockb?)\b/i;
const allowedTextFiles = new Set(["CONTRIBUTING.md", "README.md", "scripts/check-runtime-policy.ts"]);
const ignoredDirectories = new Set([".git", "node_modules", "dist"]);

const violations: string[] = [];

async function scanDirectory(directory: string): Promise<void> {
  for await (const entry of Deno.readDir(directory)) {
    const path = `${directory}/${entry.name}`;

    if (entry.isDirectory) {
      if (!ignoredDirectories.has(entry.name)) {
        await scanDirectory(path);
      }
      continue;
    }

    if (!entry.isFile) {
      continue;
    }

    if (bannedFileNames.has(entry.name)) {
      violations.push(`banned Bun file: ${path}`);
      continue;
    }

    const normalizedPath = path.replace(/^\.\//, "");
    if (!isTextFile(entry.name) || allowedTextFiles.has(normalizedPath) || normalizedPath.startsWith("doc/todo/")) {
      continue;
    }

    const text = await Deno.readTextFile(path);
    if (bannedTextPattern.test(text)) {
      violations.push(`banned Bun reference: ${path}`);
    }
  }
}

function isTextFile(fileName: string): boolean {
  return /\.(cjs|cts|json|js|jsx|md|mjs|mts|toml|ts|tsx|txt|yaml|yml)$/.test(fileName);
}

await scanDirectory(".");

if (violations.length > 0) {
  console.error("Runtime policy violation:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  Deno.exit(1);
}
