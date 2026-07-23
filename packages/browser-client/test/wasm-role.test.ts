import { NnrpMessageType, type NnrpTransportConnection, type NnrpTransportReceiveOptions } from "@nnrp/core";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { type BrowserRoleEventPacket, type BrowserWasmModule, openBrowserWasmRole } from "../src/wasm-role.ts";

Deno.test("browser WASM role owns carrier callbacks, patch encoding, events, and close order", async () => {
  const log: string[] = [];
  const sent: Uint8Array[] = [];
  const connection = testConnection({ log, sent });
  let capturedPatch = new Uint8Array();
  let closeCarrier: (() => void | Promise<void>) | undefined;
  const wasm = testWasmModule({
    open: (send, _receive, close) => {
      closeCarrier = close;
      return {
        sessionId: 17,
        submitNoWait: async (frameId, payload) => {
          await send(new Uint8Array([frameId, ...payload]));
          return 41;
        },
        sendRuntimeFrame: async (messageType, frameId, payload) => {
          await send(new Uint8Array([messageType, frameId, ...payload]));
        },
        patchSession: (metadata) => {
          capturedPatch = metadata.slice();
          return Promise.resolve(patchAck());
        },
        awaitEvent: () => Promise.resolve(resultPacket()),
        close: async () => {
          log.push("binding-close");
          await closeCarrier?.();
        },
        free: () => log.push("binding-free"),
      };
    },
  });
  const role = await openBrowserWasmRole(wasm, connection, roleConfig());

  assertEquals(role.sessionId, 17);
  assertEquals(await role.submitNoWait(7, new Uint8Array([1, 2])), 41n);
  await role.sendRuntimeFrame(NnrpMessageType.Cancel, 8, new Uint8Array([3]));
  assertEquals(sent, [
    new Uint8Array([7, 1, 2]),
    new Uint8Array([NnrpMessageType.Cancel, 8, 3]),
  ]);

  const patch = await role.patchSession({
    inputProfile: "token",
    targetCadence: 59.94,
    qualityTier: 3,
    initialCredits: 9,
    metadata: { phase: "warm" },
  }, undefined);
  const patchView = new DataView(capturedPatch.buffer, capturedPatch.byteOffset, capturedPatch.byteLength);
  assertEquals(capturedPatch.byteLength, 36);
  assertEquals(patchView.getUint16(0, true), 2);
  assertEquals(patchView.getUint32(4, true), 3);
  assertEquals(patchView.getUint32(8, true), 5_994);
  assertEquals(patchView.getUint16(12, true), 3);
  assertEquals(patch.accepted, true);
  assertEquals(patch.appliedPatch, {
    inputProfile: "token",
    targetCadence: 59.94,
    qualityTier: 3,
    initialCredits: 9,
    metadata: { phase: "warm" },
  });

  assertEquals(await role.awaitEvent("browser-session"), {
    type: "result",
    result: { frameId: 22, payload: new Uint8Array([9, 8]), sessionId: "browser-session" },
    sessionId: "browser-session",
  });
  await role.close();
  await role.close();
  assertEquals(log, ["binding-close", "connection-close", "binding-free"]);
});

Deno.test("browser WASM role sends while an event receive is pending", async () => {
  const sent: Uint8Array[] = [];
  let resolveEvent!: (packet: BrowserRoleEventPacket) => void;
  const pendingEvent = new Promise<BrowserRoleEventPacket>((resolve) => resolveEvent = resolve);
  const wasm = testWasmModule({
    open: (send) => ({
      sessionId: 1,
      submitNoWait: () => Promise.resolve(1),
      sendRuntimeFrame: async (messageType, frameId, payload) => {
        await send(new Uint8Array([messageType, frameId, ...payload]));
      },
      patchSession: () => Promise.resolve(patchAck()),
      awaitEvent: () => pendingEvent,
      close: () => Promise.resolve(),
    }),
  });
  const role = await openBrowserWasmRole(wasm, testConnection({ sent }), roleConfig());

  const event = role.awaitEvent("browser-session");
  await role.sendRuntimeFrame(NnrpMessageType.Cancel, 9, new Uint8Array([4]));
  assertEquals(sent, [new Uint8Array([NnrpMessageType.Cancel, 9, 4])]);

  resolveEvent(resultPacket());
  assertEquals((await event).type, "result");
  await role.close();
});

Deno.test("browser WASM role preserves the actual carrier failure", async () => {
  const carrierFailure = new Error("carrier write failed");
  const connection = testConnection({ sendError: carrierFailure });
  const wasm = testWasmModule({
    open: (send) => ({
      sessionId: 1,
      submitNoWait: async (_frameId, payload) => {
        await send(payload);
        return 1;
      },
      sendRuntimeFrame: () => Promise.resolve(),
      patchSession: () => Promise.resolve(patchAck()),
      awaitEvent: () => Promise.resolve(resultPacket()),
      close: () => Promise.resolve(),
    }),
  });
  const role = await openBrowserWasmRole(wasm, connection, roleConfig());

  const error = await assertRejects(() => role.submitNoWait(1, new Uint8Array([1])));
  assertEquals(error, carrierFailure);
  await role.close();
});

Deno.test("browser WASM role preserves open failure when carrier cleanup also fails", async () => {
  const openFailure = new Error("role handshake failed");
  const cleanupFailure = new Error("carrier cleanup failed");
  const connection = testConnection({ closeError: cleanupFailure });
  const wasm: BrowserWasmModule = {
    nnrp_wasm_protocol_major: () => 1,
    nnrp_wasm_wire_format: () => 0,
    default: () => Promise.resolve(),
    openBrowserClientRole: () => Promise.reject(openFailure),
  };

  const error = await assertRejects(() => openBrowserWasmRole(wasm, connection, roleConfig()));
  assertEquals(error, openFailure);
});

function testWasmModule(options: {
  readonly open: (
    send: (packet: Uint8Array) => void | Promise<void>,
    receive: () => Uint8Array | readonly Uint8Array[] | Promise<Uint8Array | readonly Uint8Array[]>,
    close: () => void | Promise<void>,
  ) => TestRoleBinding;
}): BrowserWasmModule {
  return {
    nnrp_wasm_protocol_major: () => 1,
    nnrp_wasm_wire_format: () => 0,
    default: () => Promise.resolve(),
    openBrowserClientRole: (send, receive, close) => {
      const binding = options.open(send, receive, close);
      return Promise.resolve({
        ...binding,
        ingestPackets: binding.ingestPackets ?? (() => {}),
        failReceive: binding.failReceive ?? (() => {}),
      });
    },
  };
}

interface TestRoleBinding {
  readonly sessionId: number;
  submitNoWait(frameId: number, payload: Uint8Array): Promise<number>;
  sendRuntimeFrame(messageType: number, frameId: number, payload: Uint8Array): Promise<void>;
  patchSession(metadata: Uint8Array): Promise<Uint8Array>;
  awaitEvent(): Promise<BrowserRoleEventPacket>;
  ingestPackets?(packets: Uint8Array | readonly Uint8Array[]): void;
  failReceive?(detail: string): void;
  close(): Promise<void>;
  free?(): void;
}

function testConnection(options: {
  readonly log?: string[];
  readonly sent?: Uint8Array[];
  readonly sendError?: Error;
  readonly closeError?: Error;
}): NnrpTransportConnection {
  let connected = true;
  let rejectReceive: ((error: Error) => void) | undefined;
  return {
    kind: "websocket",
    endpoint: "ws://example.test/nnrp",
    get connected() {
      return connected;
    },
    send: (packets) => {
      if (options.sendError !== undefined) return Promise.reject(options.sendError);
      const values = packets instanceof Uint8Array ? [packets] : packets;
      options.sent?.push(...values.map((packet) => packet.slice()));
      return Promise.resolve();
    },
    receive: (_options?: NnrpTransportReceiveOptions) =>
      new Promise<readonly Uint8Array[]>((_resolve, reject) => rejectReceive = reject),
    close: () => {
      if (!connected) return;
      connected = false;
      rejectReceive?.(new Error("connection closed"));
      options.log?.push("connection-close");
      if (options.closeError !== undefined) throw options.closeError;
    },
  };
}

function roleConfig() {
  return {
    requestedSessionId: 1,
    profileId: 2,
    schemaId: 0x1001,
    schemaVersion: 3,
    priorityClass: 1 as const,
    defaultDeadlineMs: 30_000,
    maxInFlightOperations: 4,
    leaseTtlHintMs: 0,
    maxPacketBytes: 67_108_864,
  };
}

function patchAck(): Uint8Array {
  const bytes = new Uint8Array(48);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint32(4, 3, true);
  return bytes;
}

function resultPacket(): BrowserRoleEventPacket {
  return {
    messageType: NnrpMessageType.ResultPush,
    sessionId: 1,
    frameId: 22,
    metadata: new Uint8Array(),
    body: new Uint8Array([9, 8]),
  };
}
