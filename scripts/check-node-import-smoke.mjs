import process from "node:process";
import { spawn } from "node:child_process";
import { cp, mkdir, rm, stat } from "node:fs/promises";
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
    name: "@nnrp/native-client",
    workspacePath: "../packages/native-client",
    exports: [
      "openNativeClient",
      "NnrpClient",
      "NnrpClientSession",
    ],
    forbiddenExports: ["openBackendRuntime", "NnrpServer", "NnrpServerSession", "openBrowserRuntime"],
  },
  {
    name: "@nnrp/native-server",
    workspacePath: "../packages/native-server",
    exports: [
      "openBackendRuntime",
      "NnrpServer",
      "NnrpServerSession",
    ],
    forbiddenExports: ["openNativeClient", "NnrpClient", "NnrpClientSession", "openBrowserRuntime"],
  },
  {
    name: "@nnrp/browser-client",
    workspacePath: "../packages/browser-client",
    exports: [
      "openBrowserRuntime",
      "NnrpBrowserRuntime",
      "NnrpBrowserClient",
      "NnrpBrowserClientSession",
    ],
    forbiddenExports: ["openNativeClient", "NnrpServer", "NnrpServerSession"],
  },
  {
    name: "@nnrp/transport-tcp",
    workspacePath: "../packages/transport-tcp",
    exports: ["createTcpTransportProvider"],
    forbiddenExports: ["openNativeClient", "openBackendRuntime", "openBrowserRuntime"],
  },
  {
    name: "@nnrp/transport-quic",
    workspacePath: "../packages/transport-quic",
    exports: ["createQuicTransportProvider"],
    forbiddenExports: ["openNativeClient", "openBackendRuntime", "openBrowserRuntime"],
  },
  {
    name: "@nnrp/transport-ipc",
    workspacePath: "../packages/transport-ipc",
    exports: ["createIpcTransportProvider"],
    forbiddenExports: ["openNativeClient", "openBackendRuntime", "openBrowserRuntime"],
  },
  {
    name: "@nnrp/transport-websocket",
    workspacePath: "../packages/transport-websocket",
    exports: ["createWebSocketTransportProvider"],
    forbiddenExports: ["openNativeClient", "openBackendRuntime", "openBrowserRuntime"],
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

  await verifyNativeTransportLoopbacks();
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
  const nativeSource = join(source, "native", currentNativePlatform());
  if (await exists(nativeSource)) {
    await cp(nativeSource, join(destination, "native", currentNativePlatform()), { recursive: true });
  }
}

async function verifyNativeTransportLoopbacks() {
  const koffiRoot = dirname(fileURLToPath(import.meta.resolve("koffi")));
  await cp(koffiRoot, join(smokeRoot, "node_modules", "koffi"), { recursive: true, dereference: true });
  await cp(join(dirname(koffiRoot), "@koromix"), join(smokeRoot, "node_modules", "@koromix"), {
    recursive: true,
    dereference: true,
  });

  const moduleUrl = (name) =>
    pathToFileURL(join(smokeRoot, "node_modules", ...name.split("/"), "dist", "index.js")).href;
  const script = `
    const [{ createTcpTransportProvider }, { createIpcTransportProvider }, { createWebSocketTransportProvider }] =
      await Promise.all([
        import(${JSON.stringify(moduleUrl("@nnrp/transport-tcp"))}),
        import(${JSON.stringify(moduleUrl("@nnrp/transport-ipc"))}),
        import(${JSON.stringify(moduleUrl("@nnrp/transport-websocket"))}),
      ]);
    const nonce = process.pid + "-" + Date.now();
    const providers = [
      [createTcpTransportProvider(), "tcp://127.0.0.1:0"],
      [createIpcTransportProvider(), process.platform === "win32"
        ? "npipe://nnrp-js-node-" + nonce
        : "unix://" + ${JSON.stringify(smokeRoot)} + "/nnrp-js-node-" + nonce + ".sock"],
      [createWebSocketTransportProvider(), "ws://127.0.0.1:0/nnrp"],
    ];
    const packet = new Uint8Array(40);
    packet.set([0x4e, 0x4e, 0x52, 0x50, 1, 0, 0x20, 40]);
    for (const [provider, endpoint] of providers) {
      const server = await provider.listen({ endpoint, timeoutMillis: 5_000 });
      const accepting = server.accept({ timeoutMillis: 5_000 });
      const client = await provider.connect({ endpoint: server.endpoint, timeoutMillis: 5_000 });
      const peer = await accepting;
      try {
        await client.send(packet);
        const received = await peer.receive({ maxPackets: 1, timeoutMillis: 5_000 });
        if (received.length !== 1 || received[0].length !== packet.length) {
          throw new Error(provider.kind + ": Node managed FFI loopback returned an invalid packet batch");
        }
      } finally {
        client.close();
        peer.close();
        server.close();
      }
    }
  `;
  await runNodeChild(script);
}

function runNodeChild(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: smokeRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => stderr += chunk);
    child.on("error", reject);
    child.on(
      "close",
      (code) => code === 0 ? resolve() : reject(new Error(stderr || `Node transport smoke exited ${code}`)),
    );
  });
}

function currentNativePlatform() {
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
  const arch = process.arch === "x64"
    ? "x86_64"
    : process.arch === "ia32"
    ? "x86"
    : process.arch === "arm64"
    ? "aarch64"
    : process.arch;
  return `${os}-${arch}`;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
