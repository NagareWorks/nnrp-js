import { NnrpEndpoint as FrozenNnrpEndpoint, NnrpProviderEndpoint as FrozenNnrpProviderEndpoint } from "@nnrp/core";
import {
  createTokenSubmitRequest,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  NnrpMessageType,
  RuntimeRole,
} from "@nnrp/core";
import { openNativeClient } from "@nnrp/native-client";
import { openBackendRuntime } from "@nnrp/native-server";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";
import { createServer as createTcpServer } from "node:net";
import { createSuccessResultReply } from "./runtime-event-fixtures.ts";
import { receiveServerLifecycleEvent, receiveServerRuntimeEvent } from "./server-event-helpers.ts";

if (import.meta.main) {
  await verifyNativeRuntimeFrame();
}

export async function verifyNativeRuntimeFrame(): Promise<void> {
  const provider = createTcpTransportProvider();
  if (!provider.localAvailable) {
    throw new Error(`packaged TCP provider is unavailable: ${provider.diagnostic?.message ?? "unknown"}`);
  }

  const providerEndpoint = await reserveTcpEndpoint();
  const providerRouteEndpoint = FrozenNnrpProviderEndpoint.parse(`tcp://${providerEndpoint}`);
  const endpoint = `nnrp://${providerEndpoint}/session/default`;
  const serverRuntime = await openBackendRuntime({
    transports: [provider],
    transportPolicy: "force-tcp",
  });
  const server = serverRuntime.listen({
    endpoint: FrozenNnrpEndpoint.parse(endpoint),
    providerRoutes: { tcp: { endpoint: providerRouteEndpoint } },
    transportPolicy: "force-tcp",
  });
  const accepting = server.accept();
  let client: Awaited<ReturnType<typeof openNativeClient>> | undefined;
  let clientSession: Awaited<ReturnType<Awaited<ReturnType<typeof openNativeClient>>["openSession"]>> | undefined;
  let serverSession: Awaited<ReturnType<typeof server.accept>> | undefined;

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    client = await openNativeClient({
      endpoint: FrozenNnrpEndpoint.parse(endpoint),
      providerRoutes: { tcp: { endpoint: providerRouteEndpoint } },
      transports: [provider],
      transportPolicy: "force-tcp",
    });
    clientSession = await client.openSession();
    const bootstrapResult = clientSession.submit(tokenSubmit(1n, 1, new Uint8Array([0x62, 0x6f, 0x6f, 0x74])));
    serverSession = await withPhase("accept bootstrap session", accepting);
    const bootstrapOperation = await withPhase(
      "receive bootstrap submit",
      serverSession.receiveSubmit({ timeoutMillis: 5_000 }),
    );
    const bootstrapEvent = bootstrapOperation.submit;
    if (bootstrapEvent.metadata.type !== "frame_submit") {
      throw new Error(`expected bootstrap submit event, got ${bootstrapEvent.metadata.type}`);
    }
    const bootstrapReply = createSuccessResultReply(new Uint8Array());
    await bootstrapOperation.sendResult(bootstrapReply.metadata, bootstrapReply.body);
    await withPhase("receive bootstrap result", bootstrapResult);
    await withPhase(
      "receive bootstrap completion",
      receiveServerLifecycleEvent(serverSession, 5_000, 1n, "completed"),
    );

    await clientSession.submitNoWait(tokenSubmit(2n, 2, new Uint8Array([0x77, 0x6f, 0x72, 0x6b])));
    const pendingSubmit = (await withPhase(
      "receive cancellable submit",
      serverSession.receiveSubmit({ timeoutMillis: 5_000 }),
    )).submit;
    if (pendingSubmit.metadata.type !== "frame_submit") {
      throw new Error(`expected pending submit event, got ${pendingSubmit.metadata.type}`);
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

    const event = await withPhase(
      "receive cancel control frame",
      receiveServerRuntimeEvent(serverSession, 5_000),
    );
    if (
      event.header.messageType !== NnrpMessageType.Cancel || event.header.sessionId === 0 ||
      event.metadata.type !== "control_request" || event.metadata.value.operationId !== 2n ||
      event.tail.type !== "diagnostic" || event.tail.diagnostic[0] !== 0x6f || event.tail.diagnostic[1] !== 0x6b
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

async function withPhase<T>(phase: string, pending: Promise<T>): Promise<T> {
  try {
    return await pending;
  } catch (error) {
    throw new Error(`native runtime frame smoke failed during ${phase}`, { cause: error });
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
