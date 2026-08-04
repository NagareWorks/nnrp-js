import {
  encodeResultPushPayload,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NnrpMessageType,
  NnrpResultClass,
  type NnrpTransportConnection,
  type NnrpTransportReceiveOptions,
} from "@nnrp/core";
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { NnrpWasmBindingUnavailableError } from "../src/errors.ts";
import {
  assertNegotiatedBrowserSessionId,
  type BrowserRoleEventPacket,
  type BrowserWasmModule,
  loadBrowserWasmModule,
  openBrowserWasmConnection,
} from "../src/wasm-role.ts";

Deno.test("browser WASM roles require a negotiated non-zero u32 session id", () => {
  assertEquals(assertNegotiatedBrowserSessionId(1), 1);
  assertEquals(assertNegotiatedBrowserSessionId(0xffff_ffff), 0xffff_ffff);
  for (const invalid of [0, -1, 1.5, 0x1_0000_0000, Number.NaN]) {
    assertThrows(
      () => assertNegotiatedBrowserSessionId(invalid),
      RangeError,
      "negotiated sessionId must be a non-zero u32",
    );
  }
});

Deno.test("browser WASM loading reports typed capability failures", async () => {
  const importFailure = await assertRejects(
    () => loadBrowserWasmModule("data:text/javascript,throw new Error('missing glue')", "missing.wasm"),
    NnrpWasmBindingUnavailableError,
  );
  assertEquals(importFailure.diagnostic.code, "NNRP_WASM_GLUE_IMPORT_FAILED");

  const exportFailure = await assertRejects(
    () => loadBrowserWasmModule("data:text/javascript,export default async function(){}", "missing.wasm"),
    NnrpWasmBindingUnavailableError,
  );
  assertEquals(exportFailure.diagnostic.code, "NNRP_WASM_ROLE_EXPORTS_MISSING");

  const initializationFailure = await assertRejects(
    () =>
      loadBrowserWasmModule(
        "data:text/javascript,export default async function(){throw new Error('missing wasm')};" +
          "export function openBrowserClientConnection(){};export function nnrp_wasm_protocol_major(){};" +
          "export function nnrp_wasm_wire_format(){}",
        "missing.wasm",
      ),
    NnrpWasmBindingUnavailableError,
  );
  assertEquals(initializationFailure.diagnostic.code, "NNRP_WASM_INITIALIZATION_FAILED");
});

Deno.test("browser WASM connection owns one carrier while roles own session state", async () => {
  const log: string[] = [];
  const sent: Uint8Array[] = [];
  const connection = testConnection({ log, sent });
  let capturedPatch = new Uint8Array();
  const wasm = testWasmModule({
    open: (send) => ({
      sessionId: 17,
      submitNoWait: async (frameId, _headerFlags, _viewId, _routeId, _traceId, payload) => {
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
      recoveryTicket: () => undefined,
      awaitEvent: () => Promise.resolve(resultPacket()),
      close: () => Promise.resolve(log.push("binding-close")).then(() => undefined),
      free: () => log.push("binding-free"),
    }),
  });
  const wasmConnection = await openBrowserWasmConnection(wasm, connection, connectionConfig());
  const role = await wasmConnection.openSession(roleConfig());

  assertEquals(role.sessionId, 17);
  assertEquals(await role.submitNoWait(7, NNRP_DEFAULT_SUBMIT_HEADER, new Uint8Array([1, 2])), 41n);
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

  const result = await role.awaitEvent();
  assertEquals(result.header, {
    versionMajor: 1,
    wireFormat: 0,
    messageType: NnrpMessageType.ResultPush,
    flags: 0,
    sessionId: 1,
    frameId: 22,
    viewId: 0,
    routeId: 0,
    traceId: 0n,
  });
  assertEquals(result.metadata.type, "result_push");
  assertEquals(result.tail, { type: "body", body: new Uint8Array([9, 8]) });
  await role.close();
  await role.close();
  assertEquals(log, ["binding-close", "binding-free"]);
  await wasmConnection.close();
  assertEquals(log, ["binding-close", "binding-free", "connection-close"]);
});

Deno.test("browser WASM connection deterministically closes every active role", async () => {
  const log: string[] = [];
  const roleCloseFailure = new Error("first role close failed");
  let openedRoles = 0;
  const connection = testConnection({ log });
  const wasm = testWasmModule({
    open: () => {
      const roleIndex = ++openedRoles;
      return {
        sessionId: roleIndex,
        submitNoWait: () => Promise.resolve(roleIndex),
        sendRuntimeFrame: () => Promise.resolve(),
        patchSession: () => Promise.resolve(patchAck()),
        awaitEvent: () => Promise.resolve(resultPacket()),
        close: () => {
          log.push(`role-${roleIndex}-close`);
          return roleIndex === 1 ? Promise.reject(roleCloseFailure) : Promise.resolve();
        },
        free: () => log.push(`role-${roleIndex}-free`),
      };
    },
  });
  const wasmConnection = await openBrowserWasmConnection(wasm, connection, connectionConfig());
  await wasmConnection.openSession(roleConfig());
  await wasmConnection.openSession(roleConfig());

  const closeError = await assertRejects(() => wasmConnection.close());
  assertEquals(closeError, roleCloseFailure);
  assertEquals(log, [
    "role-1-close",
    "role-1-free",
    "role-2-close",
    "role-2-free",
    "connection-close",
  ]);
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
      recoveryTicket: () => undefined,
      awaitEvent: () => pendingEvent,
      close: () => Promise.resolve(),
    }),
  });
  const wasmConnection = await openBrowserWasmConnection(wasm, testConnection({ sent }), connectionConfig());
  const role = await wasmConnection.openSession(roleConfig());

  const event = role.awaitEvent();
  await role.sendRuntimeFrame(NnrpMessageType.Cancel, 9, new Uint8Array([4]));
  assertEquals(sent, [new Uint8Array([NnrpMessageType.Cancel, 9, 4])]);

  resolveEvent(resultPacket());
  assertEquals((await event).header.messageType, NnrpMessageType.ResultPush);
  await role.close();
  await wasmConnection.close();
});

Deno.test("browser WASM role preserves the actual carrier failure", async () => {
  const carrierFailure = new Error("carrier write failed");
  const connection = testConnection({ sendError: carrierFailure });
  const wasm = testWasmModule({
    open: (send) => ({
      sessionId: 1,
      submitNoWait: async (_frameId, _headerFlags, _viewId, _routeId, _traceId, payload) => {
        await send(payload);
        return 1;
      },
      sendRuntimeFrame: () => Promise.resolve(),
      patchSession: () => Promise.resolve(patchAck()),
      recoveryTicket: () => undefined,
      awaitEvent: () => Promise.resolve(resultPacket()),
      close: () => Promise.resolve(),
    }),
  });
  const wasmConnection = await openBrowserWasmConnection(wasm, connection, connectionConfig());
  const role = await wasmConnection.openSession(roleConfig());

  const error = await assertRejects(() => role.submitNoWait(1, NNRP_DEFAULT_SUBMIT_HEADER, new Uint8Array([1])));
  assertEquals(error, carrierFailure);
  await role.close();
  await wasmConnection.close();
});

Deno.test("browser WASM connection preserves session-open and carrier-close failures independently", async () => {
  const openFailure = new Error("role handshake failed");
  const cleanupFailure = new Error("carrier cleanup failed");
  const connection = testConnection({ closeError: cleanupFailure });
  const wasm: BrowserWasmModule = {
    nnrp_wasm_protocol_major: () => 1,
    nnrp_wasm_wire_format: () => 0,
    default: () => Promise.resolve(),
    openBrowserClientConnection: (_send, _receive, close) =>
      Promise.resolve({
        openSession: () => Promise.reject(openFailure),
        resumeSession: () => Promise.reject(openFailure),
        ingestPackets: () => {},
        failReceive: () => {},
        close: async () => await close(),
      }),
  };

  const wasmConnection = await openBrowserWasmConnection(wasm, connection, connectionConfig());
  const error = await assertRejects(() => wasmConnection.openSession(roleConfig()));
  assertEquals(error, openFailure);
  const closeError = await assertRejects(() => wasmConnection.close());
  assertEquals(closeError, cleanupFailure);
});

function testWasmModule(options: {
  readonly open: (
    send: (packet: Uint8Array) => void | Promise<void>,
    receive: () => Uint8Array | readonly Uint8Array[] | Promise<Uint8Array | readonly Uint8Array[]>,
  ) => TestRoleBinding;
}): BrowserWasmModule {
  return {
    nnrp_wasm_protocol_major: () => 1,
    nnrp_wasm_wire_format: () => 0,
    default: () => Promise.resolve(),
    openBrowserClientConnection: (send, receive, close) =>
      Promise.resolve({
        openSession: () => Promise.resolve(withRoleDefaults(options.open(send, receive))),
        resumeSession: () => Promise.resolve(withRoleDefaults(options.open(send, receive))),
        ingestPackets: () => {},
        failReceive: () => {},
        close: async () => await close(),
      }),
  };
}

function withRoleDefaults(binding: TestRoleBinding) {
  return {
    ...binding,
    recoveryTicket: binding.recoveryTicket ?? (() => undefined),
    ingestPackets: binding.ingestPackets ?? (() => {}),
    failReceive: binding.failReceive ?? (() => {}),
  };
}

interface TestRoleBinding {
  readonly sessionId: number;
  submitNoWait(
    frameId: number,
    headerFlags: number,
    viewId: number,
    routeId: number,
    traceId: bigint,
    payload: Uint8Array,
  ): Promise<number>;
  sendRuntimeFrame(messageType: number, frameId: number, payload: Uint8Array): Promise<void>;
  patchSession(metadata: Uint8Array): Promise<Uint8Array>;
  recoveryTicket?(): Uint8Array | undefined;
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
    defaultDeadlineMs: 500,
    maxInFlightOperations: 4,
    leaseTtlHintMs: 30_000,
    allowResume: false,
    resumeTokenBytes: 0,
    cacheHints: [],
  };
}

function connectionConfig() {
  return { maxPacketBytes: 67_108_864 };
}

function patchAck(): Uint8Array {
  const bytes = new Uint8Array(48);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint32(4, 3, true);
  return bytes;
}

function resultPacket(): BrowserRoleEventPacket {
  const payload = encodeResultPushPayload({
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
  });
  return {
    versionMajor: 1,
    wireFormat: 0,
    messageType: NnrpMessageType.ResultPush,
    flags: 0,
    sessionId: 1,
    frameId: 22,
    viewId: 0,
    routeId: 0,
    traceId: 0n,
    metadata: payload,
    body: new Uint8Array([9, 8]),
  };
}
