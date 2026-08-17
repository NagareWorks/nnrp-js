import {
  createNnrpResultFromRuntimeEvent,
  decodeNnrpRuntimeEvent,
  encodeResultPushPayload,
  NnrpMessageType,
  type NnrpResult,
  NnrpResultClass,
  type NnrpResultPushMetadata,
  type NnrpRuntimeEvent,
  type NnrpRuntimeEventMetadata,
  type NnrpRuntimeEventTail,
  type NnrpRuntimeFrameHeader,
} from "@nnrp/core";

export type RuntimeMetadataOf<T extends NnrpRuntimeEventMetadata["type"]> = Extract<
  NnrpRuntimeEventMetadata,
  { readonly type: T }
>;

export type RuntimeTailOf<T extends NnrpRuntimeEventTail["type"]> = Extract<
  NnrpRuntimeEventTail,
  { readonly type: T }
>;

export function assertRuntimeMetadata<T extends NnrpRuntimeEventMetadata["type"]>(
  event: NnrpRuntimeEvent,
  type: T,
): asserts event is NnrpRuntimeEvent & { readonly metadata: RuntimeMetadataOf<T> } {
  if (event.metadata.type !== type) {
    throw new Error(`Expected runtime metadata '${type}', received '${event.metadata.type}'.`);
  }
}

export function assertRuntimeTail<T extends NnrpRuntimeEventTail["type"]>(
  event: NnrpRuntimeEvent,
  type: T,
): asserts event is NnrpRuntimeEvent & { readonly tail: RuntimeTailOf<T> } {
  if (event.tail.type !== type) {
    throw new Error(`Expected runtime tail '${type}', received '${event.tail.type}'.`);
  }
}

export function createSuccessResult(
  operationId: bigint,
  frameId: number,
  body: Uint8Array,
  header: Partial<Omit<NnrpRuntimeFrameHeader, "messageType" | "frameId">> = {},
  metadata: Partial<NnrpResultPushMetadata> = {},
): NnrpResult {
  const event = decodeNnrpRuntimeEvent(
    {
      versionMajor: 1,
      wireFormat: 0,
      messageType: NnrpMessageType.ResultPush,
      flags: 0,
      sessionId: 1,
      frameId,
      viewId: 0,
      routeId: 0,
      traceId: 0n,
      ...header,
    },
    encodeResultPushPayload({ ...DEFAULT_RESULT_PUSH_METADATA, ...metadata }, body),
  );
  return createNnrpResultFromRuntimeEvent(operationId, event);
}

export function createSuccessResultReply(
  body: Uint8Array,
  metadata: Partial<NnrpResultPushMetadata> = {},
): { readonly metadata: NnrpResultPushMetadata; readonly body: Uint8Array } {
  return {
    metadata: { ...DEFAULT_RESULT_PUSH_METADATA, ...metadata },
    body,
  };
}

const DEFAULT_RESULT_PUSH_METADATA: NnrpResultPushMetadata = Object.freeze({
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
