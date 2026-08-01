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
const installedMode = process.argv.includes("--installed");
const smokeRoot = installedMode ? process.cwd() : join(tmpdir(), `nnrp-js-node-smoke-${process.pid}-${Date.now()}`);

try {
  if (!installedMode) {
    for (const entrypoint of entrypoints) {
      await copyWorkspacePackage(entrypoint);
    }
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
  if (!installedMode) {
    await rm(smokeRoot, { recursive: true, force: true });
  }
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
  if (!installedMode) {
    const koffiRoot = dirname(fileURLToPath(import.meta.resolve("koffi")));
    const koffiPlatformPackage = `koffi-${process.platform}-${process.arch}`;
    let koffiPlatformRoot;
    try {
      koffiPlatformRoot = dirname(
        fileURLToPath(import.meta.resolve(`@koromix/${koffiPlatformPackage}`)),
      );
    } catch {
      koffiPlatformRoot = join(dirname(koffiRoot), "@koromix", koffiPlatformPackage);
    }
    await cp(koffiRoot, join(smokeRoot, "node_modules", "koffi"), { recursive: true, dereference: true });
    await mkdir(join(smokeRoot, "node_modules", "@koromix"), { recursive: true });
    await cp(koffiPlatformRoot, join(smokeRoot, "node_modules", "@koromix", koffiPlatformPackage), {
      recursive: true,
      dereference: true,
    });
  }

  const moduleUrl = (name) =>
    pathToFileURL(join(smokeRoot, "node_modules", ...name.split("/"), "dist", "index.js")).href;
  const nativeNodeModuleUrls = ["transport-tcp", "transport-quic", "transport-ipc", "transport-websocket"]
    .map((transport) =>
      pathToFileURL(join(smokeRoot, "node_modules", "@nnrp", transport, "dist", "native-node.js")).href
    );
  const script = `
    await Promise.all(${JSON.stringify(nativeNodeModuleUrls)}.map((url) => import(url)));
    const [
      { createTcpTransportProvider },
      { createIpcTransportProvider },
      { createWebSocketTransportProvider },
      { openNativeClient },
      { openBackendRuntime },
      {
        createNnrpResultFromRuntimeEvent,
        createTokenSubmitRequest,
        decodeNnrpRuntimeEvent,
        encodeResultPushPayload,
        NNRP_DEFAULT_SUBMIT_HEADER,
        NNRP_DEFAULT_SUBMIT_POLICY,
        NnrpMessageType,
        NnrpResultClass,
      },
    ] =
      await Promise.all([
        import(${JSON.stringify(moduleUrl("@nnrp/transport-tcp"))}),
        import(${JSON.stringify(moduleUrl("@nnrp/transport-ipc"))}),
        import(${JSON.stringify(moduleUrl("@nnrp/transport-websocket"))}),
        import(${JSON.stringify(moduleUrl("@nnrp/native-client"))}),
        import(${JSON.stringify(moduleUrl("@nnrp/native-server"))}),
        import(${JSON.stringify(moduleUrl("@nnrp/core"))}),
      ]);
    const nonce = process.pid + "-" + Date.now();
    const providers = [
      [createTcpTransportProvider(), "tcp://127.0.0.1:0"],
      [createIpcTransportProvider(), process.platform === "win32"
        ? "npipe://nnrp-js-node-" + nonce
        : "unix:///tmp/nnrp-js-node-" + nonce + ".sock"],
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
        await client.close();
        await peer.close();
        await server.close();
      }
    }

    const tcp = createTcpTransportProvider();
    const ipc = createIpcTransportProvider();
    const ipcEndpoint = process.platform === "win32"
      ? "npipe://nnrp-js-node-role-" + nonce
      : "unix:///tmp/nnrp-js-node-role-" + nonce + ".sock";
    const runtime = await openBackendRuntime({ transports: [tcp, ipc], transportPolicy: "auto" });
    const server = runtime.listen({
      endpoint: "nnrp://node-role-smoke",
      providerRoutes: {
        tcp: { endpoint: "127.0.0.1:0" },
        ipc: { endpoint: ipcEndpoint },
      },
      transports: [tcp, ipc],
      transportPolicy: "auto",
    });
    const accepting = server.accept();
    const deadline = Date.now() + 5_000;
    while (server.boundProviderEndpoints.tcp === undefined && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const tcpEndpoint = server.boundProviderEndpoints.tcp;
    if (tcpEndpoint === undefined) throw new Error("Node role smoke did not publish its TCP endpoint");
    const client = await openNativeClient({
      endpoint: "nnrp://node-role-smoke",
      providerRoutes: { tcp: { endpoint: tcpEndpoint.replace("tcp://", "") } },
      transports: [createTcpTransportProvider()],
      transportPolicy: "force-tcp",
    });
    const clientSession = client.openSession({ sessionId: "node-role-smoke", inputProfile: "token" });
    const serverSession = await accepting;
    for (let exchange = 1; exchange <= 2; exchange += 1) {
      await clientSession.submitNoWait(createTokenSubmitRequest({
        identity: {
          operationId: BigInt(exchange),
          frameId: exchange,
          header: NNRP_DEFAULT_SUBMIT_HEADER,
        },
        policy: NNRP_DEFAULT_SUBMIT_POLICY,
        chunks: [{ payload: new Uint8Array([exchange]) }],
      }));
      const submitEvent = await serverSession.receive({ timeoutMillis: 5_000 });
      if (
        submitEvent.header.messageType !== NnrpMessageType.FrameSubmit ||
        submitEvent.header.frameId !== exchange ||
        submitEvent.metadata.type !== "frame_submit" ||
        submitEvent.tail.type !== "body"
      ) {
        throw new Error("Node role smoke did not observe submit " + exchange);
      }
      await serverSession.sendPartialResult({
        operationId: submitEvent.metadata.value.operationId,
        resultSequence: 1n,
        objectId: 0n,
        deltaSequence: 1n,
        bodyBytes: 1,
        flags: 0,
      }, new Uint8Array([exchange + 10]));
      const resultEvent = decodeNnrpRuntimeEvent({
        ...submitEvent.header,
        messageType: NnrpMessageType.ResultPush,
      }, encodeResultPushPayload({
        statusCode: 0,
        resultFlags: 0,
        sectionCount: 0,
        tileCount: 0,
        activeProfileId: 0,
        inferenceMs: 0,
        queueMs: 0,
        serverTotalMs: 0,
        tileBaseId: 0,
        tileIndexBytes: 0,
        resultClass: NnrpResultClass.Complete,
        appliedBudgetPolicy: 0,
        reusedFrameId: 0,
        coveredTileCount: 0,
        droppedTileCount: 0,
        payloadKindBitmap: 0,
        payloadFrameCount: 0,
      }, new Uint8Array([exchange + 20])));
      await serverSession.sendResult(
        createNnrpResultFromRuntimeEvent(submitEvent.metadata.value.operationId, resultEvent),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      const partialEvent = await clientSession.nextEvent({ timeoutMillis: 5_000 });
      if (
        partialEvent.header.messageType !== NnrpMessageType.PartialResult ||
        partialEvent.metadata.type !== "partial_result" || partialEvent.tail.type !== "body" ||
        partialEvent.tail.body.length !== 1 || partialEvent.tail.body[0] !== exchange + 10
      ) {
        throw new Error("Node role smoke did not observe partial result " + exchange);
      }
      const result = await clientSession.nextResult({ timeoutMillis: 5_000 });
      if (
        result.operationId !== BigInt(exchange) || result.terminalState !== "success" ||
        result.event.type !== "runtime" || result.event.event.tail.type !== "body" ||
        result.event.event.tail.body.length !== 1 || result.event.event.tail.body[0] !== exchange + 20
      ) {
        throw new Error("Node role smoke did not observe result " + exchange);
      }
    }
    const clientClosing = clientSession.close();
    const closeEvent = await serverSession.receive({ timeoutMillis: 5_000 });
    if (closeEvent.header.messageType !== NnrpMessageType.SessionClose) {
      throw new Error("Node role smoke did not observe the client close");
    }
    await serverSession.close();
    await clientClosing;
    await client.close();
    await server.close();
    await runtime.close();
  `;
  await runNodeChild(script);

  const forcedExitScript = `
    const { createTcpTransportProvider } = await import(${JSON.stringify(moduleUrl("@nnrp/transport-tcp"))});
    const provider = createTcpTransportProvider();
    await provider.listen({ endpoint: "tcp://127.0.0.1:0", timeoutMillis: 5_000 });
    process.exit(0);
  `;
  await runNodeChild(forcedExitScript);
}

function runNodeChild(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd: smokeRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Node transport smoke did not terminate within 15 seconds"));
    }, 15_000);
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => stderr += chunk);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on(
      "close",
      (code) => {
        clearTimeout(timeout);
        code === 0 ? resolve() : reject(new Error(stderr || `Node transport smoke exited ${code}`));
      },
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
