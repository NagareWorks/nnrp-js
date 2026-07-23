import {
  type BudgetMetadata,
  type CacheMissMetadata,
  type CacheReferenceMetadata,
  type ControlRequestMetadata,
  decodeCacheInvalidateMetadata,
  decodeRuntimeControlMetadata,
  decodeRuntimeObjectMetadata,
  type NnrpDiagnostic,
  type NnrpInputProfile,
  NnrpMessageType,
  type NnrpResult,
  type NnrpRuntimeEvent,
  type NnrpRuntimeFrameEvent,
  type NnrpSessionPatchRequest,
  type NnrpTransportConnection,
  type ObjectDeltaMetadata,
  type ObjectDescriptorMetadata,
  type ObjectReferenceMetadata,
  type ObjectReleaseMetadata,
  type PressureMetadata,
  type RuntimeControlMetadata,
  type SchedulingMetadata,
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
  readonly messageType: number;
  readonly sessionId: number;
  readonly frameId: number;
  readonly metadata: Uint8Array;
  readonly body: Uint8Array;
  free?(): void;
}

interface BrowserClientRoleBinding {
  readonly sessionId: number;
  submitNoWait(frameId: number, payload: Uint8Array): Promise<number>;
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
  submitNoWait(frameId: number, payload: Uint8Array): Promise<bigint>;
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
    submitNoWait: async (frameId, payload) =>
      BigInt(
        await withCallbackError(
          () => binding.submitNoWait(frameId, payload),
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

function decodeBrowserRoleEvent(packet: BrowserRoleEventPacket, sessionId: string): NnrpRuntimeEvent {
  const messageType = packet.messageType as NnrpMessageType;
  if (messageType === NnrpMessageType.ResultPush) {
    const result: NnrpResult = { frameId: packet.frameId, payload: packet.body, sessionId };
    return { type: "result", result, sessionId };
  }
  if (messageType === NnrpMessageType.ResultDrop) {
    return {
      type: "drop",
      frameId: packet.frameId,
      sessionId,
      diagnostic: {
        code: "NNRP_RESULT_DROPPED",
        message: "The browser runtime dropped the result.",
        source: "wasm",
        retryable: false,
      },
    };
  }
  if (messageType === NnrpMessageType.SessionClose) return { type: "close", sessionId };
  return decodeRuntimeFrameEvent(messageType, concatBytes(packet.metadata, packet.body), sessionId);
}

function decodeRuntimeFrameEvent(
  messageType: NnrpMessageType,
  payload: Uint8Array,
  sessionId: string,
): NnrpRuntimeFrameEvent {
  const scope = { sessionId };
  switch (messageType) {
    case NnrpMessageType.Cancel:
    case NnrpMessageType.Abort: {
      const { metadata, tail } = decodeRuntimeControlMetadata(messageType, payload);
      return {
        type: messageType === NnrpMessageType.Cancel ? "cancel" : "abort",
        messageType,
        metadata: metadata as ControlRequestMetadata,
        diagnostic: tail,
        ...scope,
      } as NnrpRuntimeFrameEvent;
    }
    case NnrpMessageType.PriorityUpdate:
    case NnrpMessageType.Deadline:
    case NnrpMessageType.ExpireAt: {
      const { metadata } = decodeRuntimeControlMetadata(messageType, payload);
      const type = messageType === NnrpMessageType.PriorityUpdate
        ? "priority-update"
        : messageType === NnrpMessageType.Deadline
        ? "deadline"
        : "expire-at";
      return { type, messageType, metadata: metadata as SchedulingMetadata, ...scope } as NnrpRuntimeFrameEvent;
    }
    case NnrpMessageType.Supersede:
    case NnrpMessageType.CapabilityNegotiation:
    case NnrpMessageType.DegradeProfile:
    case NnrpMessageType.RouteHint:
    case NnrpMessageType.ExecutionHint:
    case NnrpMessageType.TraceContext:
    case NnrpMessageType.Progress:
    case NnrpMessageType.PartialResult:
    case NnrpMessageType.ResultDropReason:
    case NnrpMessageType.ErrorRecoverable:
    case NnrpMessageType.RetryAfter: {
      const { metadata, tail } = decodeRuntimeControlMetadata(messageType, payload);
      return runtimeControlEventWithTail(messageType, metadata, tail, scope);
    }
    case NnrpMessageType.BudgetUpdate:
    case NnrpMessageType.Backpressure:
    case NnrpMessageType.CreditUpdate: {
      const { metadata } = decodeRuntimeControlMetadata(messageType, payload);
      if (messageType === NnrpMessageType.BudgetUpdate) {
        return { type: "budget-update", messageType, metadata: metadata as BudgetMetadata, ...scope };
      }
      return {
        type: messageType === NnrpMessageType.Backpressure ? "backpressure" : "credit-update",
        messageType,
        metadata: metadata as PressureMetadata,
        ...scope,
      } as NnrpRuntimeFrameEvent;
    }
    case NnrpMessageType.ObjectDeclare:
    case NnrpMessageType.ObjectRef:
    case NnrpMessageType.ObjectRelease:
    case NnrpMessageType.ObjectPatch:
    case NnrpMessageType.ObjectDelta:
    case NnrpMessageType.CacheReference:
    case NnrpMessageType.CacheMiss: {
      const { metadata, tail } = decodeRuntimeObjectMetadata(messageType, payload);
      return runtimeObjectEvent(messageType, metadata, tail, scope);
    }
    case NnrpMessageType.CacheInvalidate:
      return { type: "cache-invalidate", messageType, metadata: decodeCacheInvalidateMetadata(payload), ...scope };
    default:
      throw new Error(`Browser WASM role returned unsupported runtime message type 0x${packetTypeHex(messageType)}.`);
  }
}

function runtimeControlEventWithTail(
  messageType: NnrpMessageType,
  metadata: RuntimeControlMetadata,
  tail: Uint8Array,
  scope: { readonly sessionId: string },
): NnrpRuntimeFrameEvent {
  const mapping = RUNTIME_CONTROL_EVENT_MAPPINGS[messageType];
  if (mapping === undefined) throw new Error(`runtime control message ${messageType} has no event mapping`);
  return { type: mapping.type, messageType, metadata, [mapping.tail]: tail, ...scope } as NnrpRuntimeFrameEvent;
}

function runtimeObjectEvent(
  messageType: NnrpMessageType,
  metadata:
    | ObjectDescriptorMetadata
    | ObjectReferenceMetadata
    | ObjectReleaseMetadata
    | ObjectDeltaMetadata
    | CacheReferenceMetadata
    | CacheMissMetadata,
  tail: Uint8Array,
  scope: { readonly sessionId: string },
): NnrpRuntimeFrameEvent {
  if (messageType === NnrpMessageType.ObjectPatch || messageType === NnrpMessageType.ObjectDelta) {
    const delta = metadata as ObjectDeltaMetadata;
    return {
      type: messageType === NnrpMessageType.ObjectPatch ? "object-patch" : "object-delta",
      messageType,
      metadata: delta,
      metadataBody: tail.slice(0, delta.metadataBytes),
      delta: tail.slice(delta.metadataBytes),
      ...scope,
    } as NnrpRuntimeFrameEvent;
  }
  const mapping = RUNTIME_OBJECT_EVENT_MAPPINGS[messageType];
  if (mapping === undefined) throw new Error(`runtime object message ${messageType} has no event mapping`);
  return { type: mapping.type, messageType, metadata, [mapping.tail]: tail, ...scope } as NnrpRuntimeFrameEvent;
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const output = new Uint8Array(first.byteLength + second.byteLength);
  output.set(first);
  output.set(second, first.byteLength);
  return output;
}

function packetTypeHex(messageType: NnrpMessageType): string {
  return Number(messageType).toString(16).padStart(2, "0");
}

const RUNTIME_CONTROL_EVENT_MAPPINGS: Partial<Record<NnrpMessageType, { type: string; tail: string }>> = {
  [NnrpMessageType.Supersede]: { type: "supersede", tail: "diagnostic" },
  [NnrpMessageType.CapabilityNegotiation]: { type: "capability-negotiation", tail: "body" },
  [NnrpMessageType.DegradeProfile]: { type: "degrade-profile", tail: "body" },
  [NnrpMessageType.RouteHint]: { type: "route-hint", tail: "body" },
  [NnrpMessageType.ExecutionHint]: { type: "execution-hint", tail: "body" },
  [NnrpMessageType.TraceContext]: { type: "trace-context", tail: "body" },
  [NnrpMessageType.Progress]: { type: "progress", tail: "body" },
  [NnrpMessageType.PartialResult]: { type: "partial-result", tail: "body" },
  [NnrpMessageType.ResultDropReason]: { type: "result-drop-reason", tail: "diagnostic" },
  [NnrpMessageType.ErrorRecoverable]: { type: "recoverable-error", tail: "diagnostic" },
  [NnrpMessageType.RetryAfter]: { type: "retry-after", tail: "diagnostic" },
};

const RUNTIME_OBJECT_EVENT_MAPPINGS: Partial<Record<NnrpMessageType, { type: string; tail: string }>> = {
  [NnrpMessageType.ObjectDeclare]: { type: "object-declare", tail: "body" },
  [NnrpMessageType.ObjectRef]: { type: "object-ref", tail: "body" },
  [NnrpMessageType.ObjectRelease]: { type: "object-release", tail: "diagnostic" },
  [NnrpMessageType.CacheReference]: { type: "cache-reference", tail: "body" },
  [NnrpMessageType.CacheMiss]: { type: "cache-miss", tail: "diagnostic" },
};
