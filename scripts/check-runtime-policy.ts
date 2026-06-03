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

const packageBoundaryRules: readonly PackageBoundaryRule[] = [
  {
    packageName: "@nnrp/core",
    prefix: "packages/core/src/",
    bannedPatterns: [
      { label: "Node built-in import", pattern: /\bfrom\s+["']node:/ },
      { label: "dynamic Node built-in import", pattern: /\bimport\s*\(\s*["']node:/ },
      { label: "DOM global", pattern: /\b(?:window|document|navigator|HTMLElement|WebSocket|WebTransport)\b/ },
      { label: "WebAssembly API", pattern: /\bWebAssembly\b/ },
      { label: "native package import", pattern: /\bfrom\s+["']@nnrp\/native["']/ },
      { label: "native client package import", pattern: /\bfrom\s+["']@nnrp\/native-client["']/ },
      { label: "native server package import", pattern: /\bfrom\s+["']@nnrp\/native-server["']/ },
      { label: "browser client package import", pattern: /\bfrom\s+["']@nnrp\/browser-client["']/ },
      { label: "transport package import", pattern: /\bfrom\s+["']@nnrp\/transport-[^"']+["']/ },
      { label: "wasm package import", pattern: /\bfrom\s+["']@nnrp\/wasm["']/ },
    ],
  },
  {
    packageName: "@nnrp/native-client",
    prefix: "packages/native-client/src/",
    bannedPatterns: [
      { label: "DOM global", pattern: /\b(?:window|document|navigator|HTMLElement|WebSocket|WebTransport)\b/ },
      { label: "browser client package import", pattern: /\bfrom\s+["']@nnrp\/browser-client["']/ },
      { label: "browser transport package import", pattern: /\bfrom\s+["']@nnrp\/transport-websocket["']/ },
      {
        label: "implicit native finalizer",
        pattern: /\b(?:FinalizationRegistry|WeakRef|Symbol\.dispose|Symbol\.asyncDispose)\b/,
      },
    ],
  },
  {
    packageName: "@nnrp/native-server",
    prefix: "packages/native-server/src/",
    bannedPatterns: [
      { label: "DOM global", pattern: /\b(?:window|document|navigator|HTMLElement|WebSocket|WebTransport)\b/ },
      { label: "browser client package import", pattern: /\bfrom\s+["']@nnrp\/browser-client["']/ },
      { label: "browser transport package import", pattern: /\bfrom\s+["']@nnrp\/transport-websocket["']/ },
      {
        label: "implicit native finalizer",
        pattern: /\b(?:FinalizationRegistry|WeakRef|Symbol\.dispose|Symbol\.asyncDispose)\b/,
      },
    ],
  },
  {
    packageName: "@nnrp/browser-client",
    prefix: "packages/browser-client/src/",
    bannedPatterns: [
      { label: "Node built-in import", pattern: /\bfrom\s+["']node:/ },
      { label: "dynamic Node built-in import", pattern: /\bimport\s*\(\s*["']node:/ },
      { label: "native package import", pattern: /\bfrom\s+["']@nnrp\/(?:native|native-client|native-server)["']/ },
      { label: "native transport package import", pattern: /\bfrom\s+["']@nnrp\/transport-(?:tcp|quic)["']/ },
      { label: "native loader surface", pattern: /\b(?:dlopen|ffi|nativeLibrary|NNRP_NATIVE_LIBRARY|process\.env)\b/ },
    ],
  },
  {
    packageName: "@nnrp/transport-tcp",
    prefix: "packages/transport-tcp/src/",
    bannedPatterns: [
      { label: "DOM global", pattern: /\b(?:window|document|navigator|HTMLElement|WebSocket|WebTransport)\b/ },
      {
        label: "role package import",
        pattern: /\bfrom\s+["']@nnrp\/(?:native-client|native-server|browser-client)["']/,
      },
    ],
  },
  {
    packageName: "@nnrp/transport-quic",
    prefix: "packages/transport-quic/src/",
    bannedPatterns: [
      { label: "DOM global", pattern: /\b(?:window|document|navigator|HTMLElement|WebSocket|WebTransport)\b/ },
      {
        label: "role package import",
        pattern: /\bfrom\s+["']@nnrp\/(?:native-client|native-server|browser-client)["']/,
      },
    ],
  },
  {
    packageName: "@nnrp/transport-websocket",
    prefix: "packages/transport-websocket/src/",
    bannedPatterns: [
      { label: "Node built-in import", pattern: /\bfrom\s+["']node:/ },
      { label: "dynamic Node built-in import", pattern: /\bimport\s*\(\s*["']node:/ },
      { label: "native package import", pattern: /\bfrom\s+["']@nnrp\/(?:native|native-client|native-server)["']/ },
      { label: "native transport package import", pattern: /\bfrom\s+["']@nnrp\/transport-(?:tcp|quic)["']/ },
      {
        label: "role package import",
        pattern: /\bfrom\s+["']@nnrp\/(?:native-client|native-server|browser-client)["']/,
      },
      { label: "native loader surface", pattern: /\b(?:dlopen|ffi|nativeLibrary|NNRP_NATIVE_LIBRARY|process\.env)\b/ },
    ],
  },
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

  checkPackageBoundaryText(path, text);
}

function checkPackageBoundaryText(path: string, text: string): void {
  for (const rule of packageBoundaryRules) {
    if (!path.startsWith(rule.prefix)) {
      continue;
    }

    for (const { label, pattern } of rule.bannedPatterns) {
      if (pattern.test(text)) {
        violations.push(`${path}: ${rule.packageName} boundary violation: ${label}`);
      }
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

interface PackageBoundaryRule {
  readonly packageName: string;
  readonly prefix: string;
  readonly bannedPatterns: readonly { readonly label: string; readonly pattern: RegExp }[];
}

await scanDirectory(".");

if (violations.length > 0) {
  console.error("Runtime policy violation:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  Deno.exit(1);
}
