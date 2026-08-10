import {
  decodeNnrpRuntimeEvent,
  type NnrpClientEvent,
  type NnrpDiagnostic,
  type NnrpInputProfile,
  NnrpMessageType,
  type NnrpOperationState,
  NnrpProtocolError,
  type NnrpRuntimeFrameHeader,
  type NnrpSessionPatchRequest,
  NnrpSessionRecoveryTicket,
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
  readonly allowResume: boolean;
  readonly resumeTokenBytes: number;
  readonly cacheHints: readonly number[];
}

export interface BrowserConnectionConfig {
  readonly maxPacketBytes: number;
}

export interface BrowserRoleEventPacket {
  readonly eventKind: number;
  readonly headerPresent: number;
  readonly relatedOperationId: bigint;
  readonly operationState?: number;
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
  recoveryTicket(): Uint8Array | undefined;
  awaitEvent(): Promise<BrowserRoleEventPacket>;
  ingestPackets(packets: Uint8Array | readonly Uint8Array[]): void;
  failReceive(detail: string): void;
  close(): Promise<void>;
  free?(): void;
}

interface BrowserClientConnectionBinding {
  openSession(configJson: string): Promise<BrowserClientRoleBinding>;
  resumeSession(recoveryTicket: Uint8Array, configJson: string): Promise<BrowserClientRoleBinding>;
  ingestPackets(packets: Uint8Array | readonly Uint8Array[]): void;
  failReceive(detail: string): void;
  close(): Promise<void>;
  free?(): void;
}

export interface BrowserWasmModule {
  readonly nnrp_wasm_protocol_major: () => number;
  readonly nnrp_wasm_wire_format: () => number;
  readonly openBrowserClientConnection: (
    send: (packet: Uint8Array) => void | Promise<void>,
    receive: () => Uint8Array | readonly Uint8Array[] | Promise<Uint8Array | readonly Uint8Array[]>,
    close: () => void | Promise<void>,
    configJson: string,
  ) => Promise<BrowserClientConnectionBinding>;
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
  awaitEvent(): Promise<NnrpClientEvent>;
  recoveryTicket(): NnrpSessionRecoveryTicket | undefined;
  close(): Promise<void>;
}

export interface BrowserWasmConnection {
  openSession(config: BrowserRoleConfig): Promise<BrowserWasmRole>;
  resumeSession(ticket: NnrpSessionRecoveryTicket, config: BrowserRoleConfig): Promise<BrowserWasmRole>;
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
    typeof binding.default !== "function" || typeof binding.openBrowserClientConnection !== "function" ||
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

export async function openBrowserWasmConnection(
  wasm: BrowserWasmModule,
  connection: NnrpTransportConnection,
  config: BrowserConnectionConfig,
): Promise<BrowserWasmConnection> {
  let binding: BrowserClientConnectionBinding;
  let carrierError: unknown;
  let closed = false;
  let receivePump: Promise<void> | undefined;
  const roles = new Set<BrowserWasmRole>();
  try {
    binding = await wasm.openBrowserClientConnection(
      async (packet) => {
        try {
          await connection.send(packet);
        } catch (error) {
          carrierError ??= error;
          throw error;
        }
      },
      async () => {
        try {
          return await connection.receive({ maxPackets: 16 });
        } catch (error) {
          carrierError ??= error;
          throw error;
        }
      },
      async () => {
        try {
          await connection.close();
        } catch (error) {
          carrierError ??= error;
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
    throw carrierError ?? error;
  }

  const ensureReceivePump = () => {
    receivePump ??= pumpBrowserCarrierReceives(binding, connection, () => closed, (error) => {
      carrierError ??= error;
    });
  };
  const openRole = async (operation: () => Promise<BrowserClientRoleBinding>): Promise<BrowserWasmRole> => {
    if (closed) throw new Error("browser WASM connection is closed");
    let roleBinding: BrowserClientRoleBinding;
    try {
      roleBinding = await operation();
    } catch (error) {
      throw carrierError ?? error;
    }
    ensureReceivePump();
    const role = wrapBrowserWasmRole(roleBinding, () => carrierError, () => roles.delete(role));
    roles.add(role);
    return role;
  };

  return {
    openSession: async (roleConfig) => await openRole(() => binding.openSession(JSON.stringify(roleConfig))),
    resumeSession: async (ticket, roleConfig) =>
      await openRole(() => binding.resumeSession(ticket.toBytes(), JSON.stringify(roleConfig))),
    close: async () => {
      if (closed) return;
      closed = true;
      let closeError: unknown;
      for (const role of [...roles]) {
        try {
          await role.close();
        } catch (error) {
          closeError ??= carrierError ?? error;
        }
      }
      roles.clear();
      try {
        await binding.close();
      } catch (error) {
        closeError ??= carrierError ?? error;
      } finally {
        try {
          await connection.close();
        } catch (error) {
          closeError ??= error;
        }
        if (receivePump !== undefined) await receivePump;
        binding.free?.();
      }
      if (closeError !== undefined) throw closeError;
    },
  };
}

function wrapBrowserWasmRole(
  binding: BrowserClientRoleBinding,
  carrierError: () => unknown,
  release: () => void,
): BrowserWasmRole {
  let closed = false;
  const sessionId = assertNegotiatedBrowserSessionId(binding.sessionId);
  return {
    sessionId,
    submitNoWait: async (frameId, header, payload) =>
      BigInt(
        await withCarrierError(
          () =>
            binding.submitNoWait(
              frameId,
              header.flags,
              header.viewId,
              header.routeId,
              header.traceId,
              payload,
            ),
          carrierError,
        ),
      ),
    sendRuntimeFrame: async (messageType, frameId, payload) => {
      await withCarrierError(
        () => binding.sendRuntimeFrame(messageType, frameId, payload),
        carrierError,
      );
    },
    patchSession: async (request, activeProfile) => {
      const metadata = encodeSessionPatch(request, activeProfile);
      return decodeSessionPatchAck(
        await withCarrierError(
          () => binding.patchSession(metadata),
          carrierError,
        ),
        request,
      );
    },
    awaitEvent: async () => {
      const packet = await withCarrierError(
        () => binding.awaitEvent(),
        carrierError,
      );
      try {
        return decodeBrowserRoleEvent(packet);
      } finally {
        packet.free?.();
      }
    },
    recoveryTicket: () => {
      const encoded = binding.recoveryTicket();
      return encoded === undefined ? undefined : NnrpSessionRecoveryTicket.fromBytes(encoded);
    },
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        await withCarrierError(() => binding.close(), carrierError);
      } finally {
        release();
        binding.free?.();
      }
    },
  };
}

export function assertNegotiatedBrowserSessionId(sessionId: number): number {
  if (!Number.isInteger(sessionId) || sessionId <= 0 || sessionId > 0xffff_ffff) {
    throw new RangeError("negotiated sessionId must be a non-zero u32");
  }
  return sessionId;
}

async function pumpBrowserCarrierReceives(
  binding: BrowserClientConnectionBinding,
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

async function withCarrierError<T>(
  operation: () => Promise<T>,
  carrierError: () => unknown,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw carrierError() ?? error;
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

function decodeBrowserRoleEvent(packet: BrowserRoleEventPacket): NnrpClientEvent {
  if (packet.headerPresent === 0) {
    if (
      packet.eventKind !== 14 || packet.relatedOperationId === 0n || packet.operationState === undefined ||
      packet.metadata.byteLength !== 0 || packet.body.byteLength !== 0
    ) {
      throw new NnrpProtocolError({
        code: "NNRP_WASM_LIFECYCLE_EVENT_INVALID",
        message: `Browser role emitted invalid headerless event kind ${packet.eventKind}.`,
        source: "wasm",
        retryable: false,
      });
    }
    return {
      type: "lifecycle",
      event: {
        operationId: packet.relatedOperationId,
        state: decodeBrowserOperationState(packet.operationState),
      },
    };
  }
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
  return { type: "runtime", event: decodeNnrpRuntimeEvent(header, concatBytes(packet.metadata, packet.body)) };
}

function decodeBrowserOperationState(value: number): NnrpOperationState {
  const states = [
    "accepted",
    "running",
    "partial",
    "waiting-tool",
    "superseded",
    "cancelled",
    "failed",
    "completed",
  ] as const satisfies readonly NnrpOperationState[];
  const state = states[value];
  if (state === undefined) {
    throw new NnrpProtocolError({
      code: "NNRP_WASM_OPERATION_STATE_INVALID",
      message: `Browser role emitted unknown operation lifecycle state ${value}.`,
      source: "wasm",
      retryable: false,
    });
  }
  return state;
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const output = new Uint8Array(first.byteLength + second.byteLength);
  output.set(first);
  output.set(second, first.byteLength);
  return output;
}
