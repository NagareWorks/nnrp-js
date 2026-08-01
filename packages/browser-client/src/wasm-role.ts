import {
  decodeNnrpRuntimeEvent,
  type NnrpDiagnostic,
  type NnrpInputProfile,
  NnrpMessageType,
  type NnrpRuntimeEvent,
  type NnrpRuntimeFrameHeader,
  type NnrpSessionPatchRequest,
  type NnrpSubmitHeaderContext,
  type NnrpTransportConnection,
} from "@nnrp/core";
import { NnrpWasmBindingUnavailableError } from "./errors.js";

const SESSION_PATCH_METADATA_BYTES = 36;
const SESSION_PATCH_ACK_METADATA_BYTES = 48;
const SESSION_PATCH_TARGET_CADENCE = 0x0000_0001;
const SESSION_PATCH_QUALITY_TIER = 0x0000_0002;

export interface BrowserRoleConfig {
  readonly requestedSessionId: number;
  readonly profileId: number;
  readonly schemaId: number;
  readonly schemaVersion: number;
  readonly priorityClass: 0 | 1 | 2;
  readonly defaultDeadlineMs: number;
  readonly maxInFlightOperations: number;
  readonly leaseTtlHintMs: number;
  readonly maxPacketBytes: number;
}

export interface BrowserRoleEventPacket {
  readonly versionMajor: number;
  readonly wireFormat: number;
  readonly messageType: number;
  readonly flags: number;
  readonly sessionId: number;
  readonly frameId: number;
  readonly viewId: number;
  readonly routeId: number;
  readonly traceId: bigint;
  readonly metadata: Uint8Array;
  readonly body: Uint8Array;
  free?(): void;
}

interface BrowserClientRoleBinding {
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
  awaitEvent(): Promise<BrowserRoleEventPacket>;
  ingestPackets(packets: Uint8Array | readonly Uint8Array[]): void;
  failReceive(detail: string): void;
  close(): Promise<void>;
  free?(): void;
}

export interface BrowserWasmModule {
  readonly nnrp_wasm_protocol_major: () => number;
  readonly nnrp_wasm_wire_format: () => number;
  readonly openBrowserClientRole: (
    send: (packet: Uint8Array) => void | Promise<void>,
    receive: () => Uint8Array | readonly Uint8Array[] | Promise<Uint8Array | readonly Uint8Array[]>,
    close: () => void | Promise<void>,
    configJson: string,
  ) => Promise<BrowserClientRoleBinding>;
  readonly default: (
    moduleOrPath?:
      | {
        readonly module_or_path: WebAssembly.Module | string | URL;
      }
      | WebAssembly.Module
      | string
      | URL,
  ) => Promise<unknown>;
}

export interface BrowserWasmRole {
  readonly sessionId: number;
  submitNoWait(frameId: number, header: NnrpSubmitHeaderContext, payload: Uint8Array): Promise<bigint>;
  sendRuntimeFrame(messageType: NnrpMessageType, frameId: number, payload: Uint8Array): Promise<void>;
  patchSession(request: NnrpSessionPatchRequest, activeProfile: NnrpInputProfile | undefined): Promise<BrowserPatchAck>;
  awaitEvent(sessionId: string): Promise<NnrpRuntimeEvent>;
  close(): Promise<void>;
}

export interface BrowserPatchAck {
  readonly accepted: boolean;
  readonly appliedPatch: NnrpSessionPatchRequest;
  readonly diagnostic?: NnrpDiagnostic;
  readonly metadata: Readonly<Record<string, string>>;
}

export async function loadBrowserWasmModule(
  glueUrl: string,
  moduleUrl: string,
  module?: WebAssembly.Module,
): Promise<BrowserWasmModule> {
  let imported: unknown;
  try {
    imported = await import(glueUrl);
  } catch (cause) {
    throw new NnrpWasmBindingUnavailableError({
      code: "NNRP_WASM_GLUE_IMPORT_FAILED",
      message: `Unable to import the package-owned NNRP browser WASM glue from ${glueUrl}.`,
      source: "wasm",
      retryable: false,
      cause,
    });
  }
  const binding = imported as Partial<BrowserWasmModule>;
  if (
    typeof binding.default !== "function" || typeof binding.openBrowserClientRole !== "function" ||
    typeof binding.nnrp_wasm_protocol_major !== "function" || typeof binding.nnrp_wasm_wire_format !== "function"
  ) {
    throw new NnrpWasmBindingUnavailableError({
      code: "NNRP_WASM_ROLE_EXPORTS_MISSING",
      message: "The package-owned NNRP browser WASM glue is missing required role exports.",
      source: "wasm",
      retryable: false,
    });
  }
  try {
    await binding.default({ module_or_path: module ?? moduleUrl });
  } catch (cause) {
    throw new NnrpWasmBindingUnavailableError({
      code: "NNRP_WASM_INITIALIZATION_FAILED",
      message: `Unable to initialize the package-owned NNRP browser WASM module from ${moduleUrl}.`,
      source: "wasm",
      retryable: false,
      cause,
    });
  }
  return binding as BrowserWasmModule;
}

export async function openBrowserWasmRole(
  wasm: BrowserWasmModule,
  connection: NnrpTransportConnection,
  config: BrowserRoleConfig,
): Promise<BrowserWasmRole> {
  let binding: BrowserClientRoleBinding;
  let callbackError: unknown;
  let closed = false;
  const resetCallbackError = () => callbackError = undefined;
  resetCallbackError();
  try {
    binding = await wasm.openBrowserClientRole(
      async (packet) => {
        try {
          await connection.send(packet);
        } catch (error) {
          callbackError = error;
          throw error;
        }
      },
      async () => {
        try {
          return await connection.receive({ maxPackets: 16 });
        } catch (error) {
          callbackError = error;
          throw error;
        }
      },
      async () => {
        try {
          await connection.close();
        } catch (error) {
          callbackError = error;
          throw error;
        }
      },
      JSON.stringify(config),
    );
  } catch (error) {
    try {
      await connection.close();
    } catch {
      // Preserve the role-open or carrier callback failure that caused cleanup.
    }
    throw callbackError ?? error;
  }
  const receivePump = pumpBrowserCarrierReceives(binding, connection, () => closed, (error) => {
    callbackError = error;
  });
  return {
    sessionId: binding.sessionId,
    submitNoWait: async (frameId, header, payload) =>
      BigInt(
        await withCallbackError(
          () =>
            binding.submitNoWait(
              frameId,
              header.flags,
              header.viewId,
              header.routeId,
              header.traceId,
              payload,
            ),
          () => callbackError,
          resetCallbackError,
        ),
      ),
    sendRuntimeFrame: async (messageType, frameId, payload) => {
      await withCallbackError(
        () => binding.sendRuntimeFrame(messageType, frameId, payload),
        () => callbackError,
        resetCallbackError,
      );
    },
    patchSession: async (request, activeProfile) => {
      const metadata = encodeSessionPatch(request, activeProfile);
      return decodeSessionPatchAck(
        await withCallbackError(
          () => binding.patchSession(metadata),
          () => callbackError,
          resetCallbackError,
        ),
        request,
      );
    },
    awaitEvent: async (sessionId) => {
      const packet = await withCallbackError(
        () => binding.awaitEvent(),
        () => callbackError,
        resetCallbackError,
      );
      try {
        return decodeBrowserRoleEvent(packet, sessionId);
      } finally {
        packet.free?.();
      }
    },
    close: async () => {
      if (closed) return;
      closed = true;
      let closeError: unknown;
      try {
        await withCallbackError(() => binding.close(), () => callbackError, resetCallbackError);
      } catch (error) {
        closeError = error;
      } finally {
        try {
          await connection.close();
        } catch (error) {
          closeError ??= error;
        }
        await receivePump;
        binding.free?.();
      }
      if (closeError !== undefined) throw closeError;
    },
  };
}

async function pumpBrowserCarrierReceives(
  binding: BrowserClientRoleBinding,
  connection: NnrpTransportConnection,
  closed: () => boolean,
  recordError: (error: unknown) => void,
): Promise<void> {
  while (!closed() && connection.connected) {
    try {
      binding.ingestPackets(await connection.receive({ maxPackets: 16 }));
    } catch (error) {
      if (!closed()) {
        recordError(error);
        binding.failReceive(errorMessage(error));
      }
      return;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withCallbackError<T>(
  operation: () => Promise<T>,
  callbackError: () => unknown,
  resetCallbackError: () => void,
): Promise<T> {
  resetCallbackError();
  try {
    return await operation();
  } catch (error) {
    throw callbackError() ?? error;
  }
}

export function standardProfileId(profile: NnrpInputProfile | undefined): number {
  if (profile === "tensor") return 1;
  if (profile === "token") return 2;
  return 0;
}

export function standardProfileSchema(
  profile: NnrpInputProfile | undefined,
): { readonly id: number; readonly version: number } {
  return profile === "token" ? { id: 0x0000_1001, version: 3 } : { id: 0, version: 0 };
}

function encodeSessionPatch(request: NnrpSessionPatchRequest, activeProfile: NnrpInputProfile | undefined): Uint8Array {
  const bytes = new Uint8Array(SESSION_PATCH_METADATA_BYTES);
  const view = new DataView(bytes.buffer);
  const profile = request.inputProfile ?? activeProfile;
  let patchMask = 0;
  view.setUint16(0, standardProfileId(profile), true);
  if (request.targetCadence !== undefined) {
    const scaled = Math.round(request.targetCadence * 100);
    if (!Number.isSafeInteger(scaled) || scaled < 0 || scaled > 0xffff_ffff) {
      throw new RangeError("Session targetCadence cannot be represented by the frozen u32 x100 wire field.");
    }
    patchMask |= SESSION_PATCH_TARGET_CADENCE;
    view.setUint32(8, scaled, true);
  }
  if (request.qualityTier !== undefined) {
    if (request.qualityTier > 0xffff) {
      throw new RangeError("Session qualityTier cannot be represented by the frozen u16 wire field.");
    }
    patchMask |= SESSION_PATCH_QUALITY_TIER;
    view.setUint16(12, request.qualityTier, true);
  }
  view.setUint32(4, patchMask, true);
  return bytes;
}

function decodeSessionPatchAck(bytes: Uint8Array, request: NnrpSessionPatchRequest): BrowserPatchAck {
  if (bytes.byteLength !== SESSION_PATCH_ACK_METADATA_BYTES) {
    throw new Error(
      `SESSION_PATCH_ACK metadata must be exactly ${SESSION_PATCH_ACK_METADATA_BYTES} bytes, received ${bytes.byteLength}.`,
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const status = view.getUint16(0, true);
  const rejectReason = view.getUint16(2, true);
  const appliedMask = view.getUint32(4, true);
  const rejectedMask = view.getUint32(8, true);
  if (status > 2 || rejectReason > 5) {
    throw new Error("SESSION_PATCH_ACK contains an unknown status or reject reason.");
  }
  const accepted = status !== 2;
  const appliedPatch: NnrpSessionPatchRequest = accepted
    ? {
      ...(request.inputProfile === undefined ? {} : { inputProfile: request.inputProfile }),
      ...(request.targetCadence !== undefined && (appliedMask & SESSION_PATCH_TARGET_CADENCE) !== 0
        ? { targetCadence: request.targetCadence }
        : {}),
      ...(request.qualityTier !== undefined && (appliedMask & SESSION_PATCH_QUALITY_TIER) !== 0
        ? { qualityTier: request.qualityTier }
        : {}),
      ...(request.submitCapacityPolicy === undefined ? {} : { submitCapacityPolicy: request.submitCapacityPolicy }),
      ...(request.initialCredits === undefined ? {} : { initialCredits: request.initialCredits }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
    }
    : {};
  const metadata = {
    ackStatus: ["accepted", "partially-applied", "rejected"][status]!,
    rejectReason: [
      "none",
      "unsupported-field",
      "invalid-range",
      "unsupported-strategy",
      "invalid-lane-mask",
      "rate-limited",
    ][rejectReason]!,
    appliedPatchMask: `0x${appliedMask.toString(16).padStart(8, "0")}`,
    rejectedPatchMask: `0x${rejectedMask.toString(16).padStart(8, "0")}`,
  };
  return {
    accepted,
    appliedPatch,
    metadata,
    ...(status === 0 ? {} : {
      diagnostic: {
        code: status === 1 ? "NNRP_SESSION_PATCH_PARTIALLY_APPLIED" : "NNRP_SESSION_PATCH_REJECTED",
        message: status === 1
          ? "The peer applied only part of the requested session patch."
          : "The peer rejected the requested session patch.",
        source: "runtime" as const,
        retryable: rejectReason === 5,
      },
    }),
  };
}

function decodeBrowserRoleEvent(packet: BrowserRoleEventPacket, _sessionId: string): NnrpRuntimeEvent {
  const header: NnrpRuntimeFrameHeader = {
    versionMajor: packet.versionMajor as 1,
    wireFormat: packet.wireFormat as 0,
    messageType: packet.messageType as NnrpMessageType,
    flags: packet.flags,
    sessionId: packet.sessionId,
    frameId: packet.frameId,
    viewId: packet.viewId,
    routeId: packet.routeId,
    traceId: packet.traceId,
  };
  return decodeNnrpRuntimeEvent(header, concatBytes(packet.metadata, packet.body));
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const output = new Uint8Array(first.byteLength + second.byteLength);
  output.set(first);
  output.set(second, first.byteLength);
  return output;
}
