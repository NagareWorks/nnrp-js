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
      "createTransportCandidates",
      "createTransportSelectionSummary",
      "isStandardInputProfile",
      "normalizeCancelRequest",
      "normalizeOperationRef",
      "normalizeSubmitRequest",
      "selectTransport",
      "validateEventPollOptions",
      "NnrpError",
    ],
    forbiddenExports: [],
  },
  {
    name: "@nnrp/native-client",
    path: "../packages/native-client/dist/index.js",
    exports: [
      "openNativeClient",
      "createNativeRuntimeBinding",
      "resolveNativeArtifact",
      "resolveNativeLibraryPath",
      "readNativeArtifactManifest",
      "validateNativeArtifactManifest",
      "validateNativeRuntimeCapabilities",
      "NnrpClient",
      "NnrpClientSession",
      "NnrpNativeBindingUnavailableError",
    ],
    forbiddenExports: ["openBackendRuntime", "NnrpBackendRuntime", "NnrpServer", "NnrpServerSession"],
  },
  {
    name: "@nnrp/native-server",
    path: "../packages/native-server/dist/index.js",
    exports: [
      "openBackendRuntime",
      "createNativeRuntimeBinding",
      "resolveNativeArtifact",
      "resolveNativeLibraryPath",
      "readNativeArtifactManifest",
      "validateNativeArtifactManifest",
      "validateNativeRuntimeCapabilities",
      "NnrpBackendRuntime",
      "NnrpServer",
      "NnrpServerSession",
      "NnrpNativeBindingUnavailableError",
    ],
    forbiddenExports: ["openNativeClient", "NnrpClient", "NnrpClientSession"],
  },
  {
    name: "@nnrp/browser-client",
    path: "../packages/browser-client/dist/index.js",
    exports: [
      "openBrowserRuntime",
      "createBrowserTransportProvider",
      "createWasmRuntimeBinding",
      "resolveWasmArtifact",
      "validateWasmArtifactManifest",
      "NnrpBrowserRuntime",
      "NnrpBrowserClient",
      "NnrpBrowserClientSession",
      "NnrpWasmBindingUnavailableError",
    ],
    forbiddenExports: ["NnrpServer", "NnrpServerSession", "NnrpNativeBindingUnavailableError"],
  },
  {
    name: "@nnrp/transport-tcp",
    path: "../packages/transport-tcp/dist/index.js",
    exports: ["createTcpTransportProvider"],
    forbiddenExports: ["openNativeClient", "openBackendRuntime", "openBrowserRuntime", "NnrpServer"],
  },
  {
    name: "@nnrp/transport-quic",
    path: "../packages/transport-quic/dist/index.js",
    exports: ["createQuicTransportProvider"],
    forbiddenExports: ["openNativeClient", "openBackendRuntime", "openBrowserRuntime", "NnrpServer"],
  },
  {
    name: "@nnrp/transport-websocket",
    path: "../packages/transport-websocket/dist/index.js",
    exports: ["createWebSocketTransportProvider"],
    forbiddenExports: ["openNativeClient", "openBackendRuntime", "openBrowserRuntime", "NnrpServer"],
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
