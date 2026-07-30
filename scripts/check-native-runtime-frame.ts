import {
  createTokenSubmitRequest,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  RuntimeRole,
} from "@nnrp/core";
import { openNativeClient } from "@nnrp/native-client";
import { openBackendRuntime } from "@nnrp/native-server";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";
import { createServer as createTcpServer } from "node:net";

if (import.meta.main) {
  await verifyNativeRuntimeFrame();
}

export async function verifyNativeRuntimeFrame(): Promise<void> {
  const provider = createTcpTransportProvider();
  if (!provider.localAvailable) {
    throw new Error(`packaged TCP provider is unavailable: ${provider.diagnostic?.message ?? "unknown"}`);
  }

  const providerEndpoint = await reserveTcpEndpoint();
  const endpoint = `nnrp://${providerEndpoint}/session/default`;
  const serverRuntime = await openBackendRuntime({
    transports: [provider],
    transportPolicy: "force-tcp",
  });
  const server = serverRuntime.listen({
    endpoint,
    providerRoutes: { tcp: { endpoint: providerEndpoint } },
    transportPolicy: "force-tcp",
  });
  const accepting = server.accept();
  let client: Awaited<ReturnType<typeof openNativeClient>> | undefined;
  let clientSession: ReturnType<Awaited<ReturnType<typeof openNativeClient>>["openSession"]> | undefined;
  let serverSession: Awaited<ReturnType<typeof server.accept>> | undefined;

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    client = await openNativeClient({
      endpoint,
      providerRoutes: { tcp: { endpoint: providerEndpoint } },
      transports: [provider],
      transportPolicy: "force-tcp",
    });
    clientSession = client.openSession({ sessionId: "native-runtime-frame-smoke", inputProfile: "token" });
    const bootstrapResult = clientSession.submit(tokenSubmit(1n, 1, new Uint8Array([0x62, 0x6f, 0x6f, 0x74])));
    serverSession = await accepting;
    const bootstrapEvent = await serverSession.receive({ timeoutMillis: 5_000 });
    if (bootstrapEvent.type !== "submit") {
      throw new Error(`expected bootstrap submit event, got ${bootstrapEvent.type}`);
    }
    await serverSession.sendResult({ frameId: bootstrapEvent.submit.frameId, payload: new Uint8Array() });
    await bootstrapResult;

    await clientSession.submitNoWait(tokenSubmit(2n, 2, new Uint8Array([0x77, 0x6f, 0x72, 0x6b])));
    const pendingSubmit = await serverSession.receive({ timeoutMillis: 5_000 });
    if (pendingSubmit.type !== "submit") {
      throw new Error(`expected pending submit event, got ${pendingSubmit.type}`);
    }

    const diagnostic = new Uint8Array([0x6f, 0x6b]);
    const cancelPending = clientSession.cancel({
      operationId: 2n,
      controlSequence: 1n,
      reasonCode: 0,
      sourceRole: RuntimeRole.Client,
      flags: 0,
      diagnosticBytes: diagnostic.byteLength,
    }, diagnostic);
    await cancelPending;
    diagnostic.fill(0);

    const event = await serverSession.receive({ timeoutMillis: 5_000 });
    if (
      event.type !== "cancel" || event.sessionId === undefined || event.sessionId.length === 0 ||
      event.metadata.operationId !== 2n ||
      event.diagnostic?.[0] !== 0x6f || event.diagnostic?.[1] !== 0x6b
    ) {
      throw new Error(`unexpected native runtime frame event: ${JSON.stringify(event, bigintJsonReplacer)}`);
    }
  } finally {
    await serverSession?.close().catch(() => undefined);
    await clientSession?.close().catch(() => undefined);
    await client?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    await client?.runtime.close().catch(() => undefined);
    await serverRuntime.close().catch(() => undefined);
  }
}

function tokenSubmit(operationId: bigint, frameId: number, payload: Uint8Array) {
  return createTokenSubmitRequest({
    identity: { operationId, frameId, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload }],
  });
}

async function reserveTcpEndpoint(): Promise<string> {
  const socket = createTcpServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const address = socket.address();
  if (address === null || typeof address === "string") throw new Error("failed to reserve a TCP loopback port");
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => error === undefined ? resolve() : reject(error))
  );
  return `${address.address}:${address.port}`;
}

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
