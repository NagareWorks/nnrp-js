import { NnrpEndpoint as FrozenNnrpEndpoint, NnrpProviderEndpoint as FrozenNnrpProviderEndpoint } from "@nnrp/core";
import { assertEquals } from "jsr:@std/assert@1";
import {
  createTokenSubmitRequest,
  encodeRuntimeControlMetadata,
  encodeSubmitPayload,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  NnrpMessageType,
  type NnrpOperationLifecycleEvent,
  type NnrpRuntimeEvent,
  type NnrpTransportConnection,
  RuntimeRole,
} from "@nnrp/core";
import { type NnrpServerSession, openBackendRuntime } from "@nnrp/native-server";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import { assertRuntimeMetadata } from "../../../scripts/runtime-event-fixtures.ts";
import { type BrowserWasmRole, loadBrowserWasmModule, openBrowserWasmConnection } from "../src/wasm-role.ts";

Deno.test({
  name: "package-owned browser WASM role remains full duplex while awaiting an event",
  sanitizeResources: false,
  fn: async () => {
    const nativeProvider = createWebSocketTransportProvider();
    const reservation = await nativeProvider.listen({ endpoint: "ws://127.0.0.1:0" });
    const providerEndpoint = reservation.endpoint;
    await reservation.close();

    const serverRuntime = await openBackendRuntime({
      transports: [nativeProvider],
      transportPolicy: "force-websocket",
    });
    const server = serverRuntime.listen({
      endpoint: FrozenNnrpEndpoint.parse("nnrp://127.0.0.1/browser-wasm-duplex"),
      providerRoutes: { websocket: { endpoint: FrozenNnrpProviderEndpoint.parse(providerEndpoint) } },
      transportPolicy: "force-websocket",
    });
    const accepting = server.accept();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const browserProvider = createWebSocketTransportProvider({ WebSocket: globalThis.WebSocket });
    const carrier = await browserProvider.connect({ endpoint: providerEndpoint });
    const sentMessageTypes: number[] = [];
    const connection: NnrpTransportConnection = {
      kind: carrier.kind,
      endpoint: carrier.endpoint,
      get connected() {
        return carrier.connected;
      },
      send: (packets) => {
        const values = packets instanceof Uint8Array ? [packets] : packets;
        sentMessageTypes.push(...values.map((packet) => packet[6] ?? -1));
        return carrier.send(packets);
      },
      receive: (options) => carrier.receive(options),
      close: () => carrier.close(),
    };
    const module = await WebAssembly.compile(
      await Deno.readFile(new URL("../wasm/nnrp_wasm_bg.wasm", import.meta.url)),
    );
    const wasm = await loadBrowserWasmModule(
      new URL("../wasm/nnrp_wasm.js", import.meta.url).href,
      "",
      module,
    );
    const wasmConnection = await openBrowserWasmConnection(wasm, connection, { maxPacketBytes: 67_108_864 });
    const role = await within(
      wasmConnection.openSession({
        requestedSessionId: 1,
        profileId: 2,
        schemaId: 0x0000_1001,
        schemaVersion: 3,
        priorityClass: 1,
        defaultDeadlineMs: 500,
        maxInFlightOperations: 4,
        leaseTtlHintMs: 30_000,
        allowResume: false,
        resumeTokenBytes: 0,
        cacheHints: [],
      }),
      "WASM role handshake did not complete",
    );
    const serverSession = await within(accepting, "native server did not accept the browser role");

    let failure: unknown;
    try {
      const lifecycleEvents: NnrpOperationLifecycleEvent[] = [];
      const pendingEvent = awaitRuntimeEvent(role, lifecycleEvents).catch((error) => error);
      const metadata = {
        traceId: 1n,
        spanId: 2n,
        parentSpanId: 0n,
        stageCode: 3,
        flags: 0,
        bodyBytes: 0,
      } as const;
      const sendStartedAt = performance.now();
      await within(
        role.sendRuntimeFrame(
          NnrpMessageType.TraceContext,
          1,
          encodeRuntimeControlMetadata(NnrpMessageType.TraceContext, metadata),
        ),
        "WASM role send did not complete while event receive was pending",
      );
      const sendElapsedMillis = performance.now() - sendStartedAt;
      if (sendElapsedMillis >= 500) {
        throw new Error(`WASM role send waited ${sendElapsedMillis.toFixed(0)}ms for the pending event receive`);
      }
      assertEquals(sentMessageTypes.at(-1), NnrpMessageType.TraceContext);
      assertEquals(
        (await receiveServerRuntimeEvent(serverSession)).header.messageType,
        NnrpMessageType.TraceContext,
      );

      await serverSession.sendTraceContext(metadata);
      const trace = await pendingEvent;
      if (trace instanceof Error) throw trace;
      assertEquals(trace.header.messageType, NnrpMessageType.TraceContext);
      assertRuntimeMetadata(trace, "trace_context");

      await role.submitNoWait(9, NNRP_DEFAULT_SUBMIT_HEADER, frameSubmitPayload(42n, new Uint8Array([7])));
      assertEquals(
        (await serverSession.receiveSubmit({ timeoutMillis: 5_000 })).submit.header.messageType,
        NnrpMessageType.FrameSubmit,
      );
      const pendingAfterSubmit = awaitRuntimeEvent(role, lifecycleEvents).catch((error) => error);
      await within(
        role.sendRuntimeFrame(
          NnrpMessageType.Cancel,
          2,
          encodeRuntimeControlMetadata(NnrpMessageType.Cancel, {
            operationId: 42n,
            controlSequence: 1n,
            reasonCode: 2,
            sourceRole: RuntimeRole.Client,
            flags: 0,
            diagnosticBytes: 0,
          }),
        ),
        "WASM role CANCEL did not complete while event receive was pending",
      );
      assertEquals(
        (await receiveServerRuntimeEvent(serverSession)).header.messageType,
        NnrpMessageType.Cancel,
      );
      await expectServerLifecycle(serverSession, "cancelled");
      await serverSession.sendTraceContext({ ...metadata, traceId: 42n });
      const traceAfterSubmit = await pendingAfterSubmit;
      if (traceAfterSubmit instanceof Error) throw traceAfterSubmit;
      assertEquals(traceAfterSubmit.header.messageType, NnrpMessageType.TraceContext);
      assertRuntimeMetadata(traceAfterSubmit, "trace_context");
      assertEquals(lifecycleEvents, [{ operationId: 42n, state: "cancelled" }]);
    } catch (error) {
      failure = error;
    } finally {
      if (failure === undefined) {
        const clientClosing = role.close();
        try {
          assertEquals(
            (await receiveServerRuntimeEvent(serverSession)).header.messageType,
            NnrpMessageType.SessionClose,
          );
          await serverSession.close();
          await within(clientClosing, "WASM role close did not complete");
          await wasmConnection.close();
        } catch (error) {
          failure = error;
        }
      } else {
        try {
          await within(role.close(), "WASM role close did not complete");
        } catch {
          // Preserve the failure that forced transport cleanup.
        }
        await wasmConnection.close().catch(() => undefined);
      }
      if (failure !== undefined) await serverSession.close();
      await server.close();
      await serverRuntime.close();
    }
    if (failure !== undefined) throw failure;
  },
});

async function awaitRuntimeEvent(
  role: BrowserWasmRole,
  lifecycleEvents: NnrpOperationLifecycleEvent[],
): Promise<NnrpRuntimeEvent> {
  while (true) {
    const event = await role.awaitEvent();
    if (event.type === "runtime") return event.event;
    lifecycleEvents.push(event.event);
  }
}

async function receiveServerRuntimeEvent(session: NnrpServerSession): Promise<NnrpRuntimeEvent> {
  const event = await session.nextEvent({ timeoutMillis: 5_000 });
  if (event.type === "runtime") return event.event;
  if (event.type === "submit") return event.operation.submit;
  throw new Error(`expected server runtime event, received lifecycle state ${event.event.state}`);
}

async function expectServerLifecycle(session: NnrpServerSession, state: string): Promise<void> {
  const event = await session.nextEvent({ timeoutMillis: 5_000 });
  if (event.type !== "lifecycle") {
    const actual = event.type === "submit" ? "submit" : `runtime-${event.event.header.messageType}`;
    throw new Error(`expected server lifecycle-${state}, received ${actual}`);
  }
  assertEquals(event.event.state, state);
}

function frameSubmitPayload(operationId: bigint, body: Uint8Array): Uint8Array {
  return encodeSubmitPayload(createTokenSubmitRequest({
    identity: { operationId, frameId: 9, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload: body }],
  }));
}

async function within<T>(operation: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => timer = setTimeout(() => reject(new Error(message)), 2_000)),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
