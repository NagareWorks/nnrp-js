import { assertEquals } from "jsr:@std/assert@1";
import {
  createTokenSubmitRequest,
  encodeRuntimeControlMetadata,
  encodeSubmitPayload,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  NnrpMessageType,
  type NnrpTransportConnection,
  RuntimeRole,
} from "@nnrp/core";
import { openBackendRuntime } from "@nnrp/native-server";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import { assertRuntimeMetadata } from "../../../scripts/runtime-event-fixtures.ts";
import { loadBrowserWasmModule, openBrowserWasmRole } from "../src/wasm-role.ts";

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
      endpoint: "nnrp://127.0.0.1/browser-wasm-duplex",
      providerRoutes: { websocket: { endpoint: providerEndpoint } },
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
    const role = await within(
      openBrowserWasmRole(wasm, connection, {
        requestedSessionId: 1,
        profileId: 2,
        schemaId: 0x0000_1001,
        schemaVersion: 3,
        priorityClass: 1,
        defaultDeadlineMs: 30_000,
        maxInFlightOperations: 4,
        leaseTtlHintMs: 0,
        maxPacketBytes: 67_108_864,
      }),
      "WASM role handshake did not complete",
    );
    const serverSession = await within(accepting, "native server did not accept the browser role");

    let failure: unknown;
    try {
      const pendingEvent = role.awaitEvent("browser-wasm-duplex").catch((error) => error);
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
        (await serverSession.receive({ timeoutMillis: 5_000 })).header.messageType,
        NnrpMessageType.TraceContext,
      );

      await serverSession.sendTraceContext(metadata);
      const trace = await pendingEvent;
      if (trace instanceof Error) throw trace;
      assertEquals(trace.header.messageType, NnrpMessageType.TraceContext);
      assertRuntimeMetadata(trace, "trace_context");

      await role.submitNoWait(9, NNRP_DEFAULT_SUBMIT_HEADER, frameSubmitPayload(42n, new Uint8Array([7])));
      assertEquals(
        (await serverSession.receive({ timeoutMillis: 5_000 })).header.messageType,
        NnrpMessageType.FrameSubmit,
      );
      const pendingAfterSubmit = role.awaitEvent("browser-wasm-duplex").catch((error) => error);
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
        (await serverSession.receive({ timeoutMillis: 5_000 })).header.messageType,
        NnrpMessageType.Cancel,
      );
      await serverSession.sendTraceContext({ ...metadata, traceId: 42n });
      const traceAfterSubmit = await pendingAfterSubmit;
      if (traceAfterSubmit instanceof Error) throw traceAfterSubmit;
      assertEquals(traceAfterSubmit.header.messageType, NnrpMessageType.TraceContext);
      assertRuntimeMetadata(traceAfterSubmit, "trace_context");
    } catch (error) {
      failure = error;
    } finally {
      if (failure === undefined) {
        const clientClosing = role.close();
        try {
          assertEquals(
            (await serverSession.receive({ timeoutMillis: 5_000 })).header.messageType,
            NnrpMessageType.SessionClose,
          );
          await serverSession.close();
          await within(clientClosing, "WASM role close did not complete");
        } catch (error) {
          failure = error;
        }
      } else {
        await connection.close();
        try {
          await within(role.close(), "WASM role close did not complete");
        } catch {
          // Preserve the failure that forced transport cleanup.
        }
      }
      if (failure !== undefined) await serverSession.close();
      await server.close();
      await serverRuntime.close();
    }
    if (failure !== undefined) throw failure;
  },
});

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
