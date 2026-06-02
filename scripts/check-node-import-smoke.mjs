import process from "node:process";
import { cp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entrypoints = [
  {
    name: "@nnrp/core",
    workspacePath: "../packages/core",
    exports: [
      "createCapabilityManifest",
      "normalizeSubmitRequest",
      "NnrpError",
    ],
    forbiddenExports: ["openNativeClient", "openBrowserRuntime"],
  },
  {
    name: "@nnrp/native",
    workspacePath: "../packages/native",
    exports: [
      "openNativeClient",
      "openBackendRuntime",
      "NnrpClient",
      "NnrpClientSession",
      "NnrpServer",
      "NnrpServerSession",
    ],
    forbiddenExports: ["openBrowserRuntime", "NnrpBrowserRuntime"],
  },
  {
    name: "@nnrp/wasm",
    workspacePath: "../packages/wasm",
    exports: [
      "openBrowserRuntime",
      "NnrpBrowserRuntime",
      "NnrpBrowserClient",
      "NnrpBrowserClientSession",
    ],
    forbiddenExports: ["openNativeClient", "NnrpServer", "NnrpServerSession"],
  },
];

const failures = [];
const scriptDir = dirname(fileURLToPath(import.meta.url));
const smokeRoot = join(tmpdir(), `nnrp-js-node-smoke-${process.pid}-${Date.now()}`);

try {
  for (const entrypoint of entrypoints) {
    await copyWorkspacePackage(entrypoint);
  }

  for (const entrypoint of entrypoints) {
    const modulePath = join(smokeRoot, "node_modules", ...entrypoint.name.split("/"), "dist", "index.js");
    const moduleExports = await import(pathToFileURL(modulePath).href);

    for (const exportName of entrypoint.exports) {
      if (!(exportName in moduleExports)) {
        failures.push(`${entrypoint.name}: missing Node import export ${exportName}`);
      }
    }

    for (const exportName of entrypoint.forbiddenExports) {
      if (exportName in moduleExports) {
        failures.push(`${entrypoint.name}: forbidden Node import export ${exportName}`);
      }
    }
  }
} finally {
  await rm(smokeRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Node import smoke failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}

async function copyWorkspacePackage(entrypoint) {
  const source = join(scriptDir, entrypoint.workspacePath);
  const destination = join(smokeRoot, "node_modules", ...entrypoint.name.split("/"));

  await mkdir(destination, { recursive: true });
  await cp(join(source, "package.json"), join(destination, "package.json"));
  await cp(join(source, "dist"), join(destination, "dist"), { recursive: true });
}
