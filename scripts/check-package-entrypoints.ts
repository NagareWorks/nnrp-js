const entrypoints: readonly PackageEntrypoint[] = [
  {
    name: "@nnrp/core",
    path: "../packages/core/dist/index.js",
    exports: [
      "NNRP_PROTOCOL_NAME",
      "NNRP_PROTOCOL_VERSION",
      "NNRP_STANDARD_INPUT_PROFILES",
      "createCacheKey",
      "createBackendNativeManifest",
      "createBrowserWasmManifest",
      "createCapabilityManifest",
      "createSchemaDescriptor",
      "isStandardInputProfile",
      "normalizeSubmitRequest",
      "selectTransport",
      "NnrpError",
    ],
    forbiddenExports: [],
  },
  {
    name: "@nnrp/native",
    path: "../packages/native/dist/index.js",
    exports: [
      "openNativeClient",
      "openBackendRuntime",
      "NnrpBackendRuntime",
      "NnrpClient",
      "NnrpNativeBindingUnavailableError",
    ],
    forbiddenExports: ["NnrpBrowserRuntime", "NnrpBrowserClient"],
  },
  {
    name: "@nnrp/wasm",
    path: "../packages/wasm/dist/index.js",
    exports: [
      "openBrowserRuntime",
      "NnrpBrowserRuntime",
      "NnrpBrowserClient",
      "NnrpWasmBindingUnavailableError",
    ],
    forbiddenExports: ["NnrpServer", "NnrpServerSession", "NnrpNativeBindingUnavailableError"],
  },
];

const forbiddenBuiltImportPatterns: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "source TypeScript import", pattern: /\bfrom\s+["'][^"']*\/src\/[^"']*\.ts["']/ },
  { label: "relative source import", pattern: /\bfrom\s+["'][.]{1,2}\/[^"']*src\// },
];

const failures: string[] = [];

for (const entrypoint of entrypoints) {
  const moduleUrl = new URL(entrypoint.path, import.meta.url);
  const source = await Deno.readTextFile(moduleUrl);
  checkBuiltEntrypointSource(entrypoint.name, source);

  const moduleExports = await import(moduleUrl.href) as Record<string, unknown>;

  for (const exportName of entrypoint.exports) {
    if (!(exportName in moduleExports)) {
      failures.push(`${entrypoint.name}: missing export ${exportName}`);
    }
  }

  for (const exportName of entrypoint.forbiddenExports) {
    if (exportName in moduleExports) {
      failures.push(`${entrypoint.name}: forbidden export ${exportName}`);
    }
  }
}

function checkBuiltEntrypointSource(packageName: string, source: string): void {
  for (const { label, pattern } of forbiddenBuiltImportPatterns) {
    if (pattern.test(source)) {
      failures.push(`${packageName}: built entrypoint contains ${label}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Package entrypoint smoke failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  Deno.exit(1);
}

interface PackageEntrypoint {
  readonly name: string;
  readonly path: string;
  readonly exports: readonly string[];
  readonly forbiddenExports: readonly string[];
}
