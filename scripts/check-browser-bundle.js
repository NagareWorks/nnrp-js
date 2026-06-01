const wasmEntrypoint = "packages/wasm/dist/index.js";
const source = await Deno.readTextFile(wasmEntrypoint);

const forbiddenPatterns = [
  { label: "Node built-in import", pattern: /\bfrom\s+["']node:/ },
  { label: "dynamic Node built-in import", pattern: /\bimport\s*\(\s*["']node:/ },
  { label: "process usage", pattern: /\bprocess\b/ },
  { label: "native FFI marker", pattern: /\b(?:NNRP_NATIVE_LIBRARY|nnrp_ffi|dlopen)\b/ },
  { label: "server API export", pattern: /\bNnrpServer(?:Session)?\b/ },
];

const failures = forbiddenPatterns
  .filter(({ pattern }) => pattern.test(source))
  .map(({ label }) => `${wasmEntrypoint}: ${label}`);

const moduleExports = await import(new URL("../packages/wasm/dist/index.js", import.meta.url).href);

for (const exportName of ["openBrowserRuntime", "NnrpBrowserRuntime", "NnrpBrowserClient"]) {
  if (!(exportName in moduleExports)) {
    failures.push(`${wasmEntrypoint}: missing browser export ${exportName}`);
  }
}

for (const exportName of ["NnrpServer", "NnrpServerSession", "openBackendRuntime"]) {
  if (exportName in moduleExports) {
    failures.push(`${wasmEntrypoint}: forbidden server/native export ${exportName}`);
  }
}

if (failures.length > 0) {
  console.error("Browser bundle smoke failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  Deno.exit(1);
}
