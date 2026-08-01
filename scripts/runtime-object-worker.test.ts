import { assertEquals } from "jsr:@std/assert@1";
import {
  CacheMissReason,
  CacheReuseScope,
  decodeNnrpRuntimeEvent,
  encodeCacheInvalidateMetadata,
  encodeRuntimeObjectMetadata,
  MemoryLocationHint,
  NnrpMessageType,
  type NnrpRuntimeEvent,
  ObjectReleaseReason,
  OwnershipHint,
  RuntimeObjectKind,
  RuntimeRole,
} from "@nnrp/core";

Deno.test("runtime object events are structured-clone-safe across native and browser worker boundaries", () => {
  const events = runtimeObjectEvents("worker-session");

  for (const event of events) {
    const nativeWorkerCopy = structuredClone(event);
    const browserWorkerCopy = structuredClone(event);
    assertEquals(nativeWorkerCopy, event);
    assertEquals(browserWorkerCopy, nativeWorkerCopy);
  }
});

function runtimeObjectEvents(_sessionId: string): NnrpRuntimeEvent[] {
  return [
    runtimeObjectEvent(NnrpMessageType.ObjectDeclare, {
      objectId: 1n,
      objectKind: RuntimeObjectKind.ImageTile,
      producerRole: RuntimeRole.Runtime,
      consumerRole: RuntimeRole.Client,
      sessionId: 7,
      byteSize: 2n,
      computeCostUnits: 3,
      memoryLocationHint: MemoryLocationHint.DeviceMemory,
      ownershipHint: OwnershipHint.ConsumerOwned,
      lifetimeHintMs: 1_000,
      metadataBytes: 1,
    }, new Uint8Array([0x01])),
    runtimeObjectEvent(NnrpMessageType.ObjectRef, {
      objectId: 1n,
      operationId: 2n,
      objectVersion: 3n,
      offset: 0n,
      length: 2n,
      flags: 0,
      metadataBytes: 1,
    }, new Uint8Array([0x02])),
    runtimeObjectEvent(NnrpMessageType.ObjectRelease, {
      objectId: 1n,
      operationId: 2n,
      releaseReason: ObjectReleaseReason.Completed,
      sourceRole: RuntimeRole.Client,
      flags: 0,
      diagnosticBytes: 1,
    }, new Uint8Array([0x03])),
    runtimeObjectEvent(NnrpMessageType.ObjectPatch, {
      objectId: 1n,
      deltaSequence: 4n,
      regionOffset: 0n,
      regionBytes: 2,
      deltaBytes: 2,
      flags: 0,
      metadataBytes: 1,
    }, new Uint8Array([0x04, 0x05, 0x06])),
    runtimeObjectEvent(NnrpMessageType.ObjectDelta, {
      objectId: 1n,
      deltaSequence: 5n,
      regionOffset: 2n,
      regionBytes: 2,
      deltaBytes: 2,
      flags: 0,
      metadataBytes: 1,
    }, new Uint8Array([0x07, 0x08, 0x09])),
    runtimeObjectEvent(NnrpMessageType.CacheReference, {
      cacheNamespace: 5,
      cacheKeyHi: 6n,
      cacheKeyLo: 7n,
      profileId: 8,
      reuseScope: CacheReuseScope.Session,
      leaseId: 9n,
      producerTraceId: 10n,
      expirationHintMs: 1_000,
      metadataBytes: 1,
      flags: 0,
    }, new Uint8Array([0x0a])),
    runtimeObjectEvent(NnrpMessageType.CacheMiss, {
      cacheNamespace: 5,
      cacheKeyHi: 6n,
      cacheKeyLo: 7n,
      missReason: CacheMissReason.NotFound,
      profileId: 8,
      diagnosticBytes: 1,
    }, new Uint8Array([0x0b])),
    runtimeEvent(
      NnrpMessageType.CacheInvalidate,
      encodeCacheInvalidateMetadata({
        invalidateScope: 1,
        cacheNamespace: 2,
        cacheKeyHi: 0n,
        cacheKeyLo: 0n,
        reasonCode: 5,
      }),
    ),
  ];
}

function runtimeObjectEvent(
  messageType: NnrpMessageType,
  metadata: Parameters<typeof encodeRuntimeObjectMetadata>[1],
  tail: Uint8Array,
): NnrpRuntimeEvent {
  return runtimeEvent(messageType, encodeRuntimeObjectMetadata(messageType, metadata, tail));
}

let nextFrameId = 1;

function runtimeEvent(messageType: NnrpMessageType, payload: Uint8Array): NnrpRuntimeEvent {
  return decodeNnrpRuntimeEvent({
    versionMajor: 1,
    wireFormat: 0,
    messageType,
    flags: 0,
    sessionId: 7,
    frameId: nextFrameId++,
    viewId: 0,
    routeId: 0,
    traceId: 0n,
  }, payload);
}
