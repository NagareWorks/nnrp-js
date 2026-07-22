import { assertEquals } from "jsr:@std/assert@1";
import {
  CacheMissReason,
  CacheReuseScope,
  MemoryLocationHint,
  NnrpMessageType,
  type NnrpRuntimeEvent,
  ObjectReleaseReason,
  OwnershipHint,
  RuntimeObjectKind,
  RuntimeRole,
} from "@nnrp/core";
import { openBrowserRuntime } from "@nnrp/browser-client";
import { openNativeClient } from "@nnrp/native-client";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

Deno.test("native and browser sessions expose equivalent structured-clone-safe runtime object events", async () => {
  const nativeEvents = runtimeObjectEvents("worker-session");
  const browserEvents = runtimeObjectEvents("worker-session");
  const nativeClient = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    transports: [createTcpTransportProvider()],
    ffi: {
      mode: "test",
      awaitEvents: () => nextQueuedEvent(nativeEvents),
    },
  });
  const browserRuntime = await openBrowserRuntime({
    primitives: {
      awaitEvents: () => nextQueuedEvent(browserEvents),
    },
  });
  const nativeSession = nativeClient.openSession({ sessionId: "worker-session" });
  const browserSession = browserRuntime.connect({ endpoint: "wss://example.test/nnrp" }).openSession({
    sessionId: "worker-session",
  });

  for (let index = 0; index < runtimeObjectEvents("worker-session").length; index += 1) {
    const nativeEvent = await nativeSession.nextEvent();
    const browserEvent = await browserSession.nextEvent();

    assertEquals(nativeEvent, browserEvent);
    assertEquals(structuredClone(nativeEvent), nativeEvent);
  }
});

function nextQueuedEvent(events: NnrpRuntimeEvent[]): readonly NnrpRuntimeEvent[] {
  const event = events.shift();
  return event === undefined ? [] : [event];
}

function runtimeObjectEvents(sessionId: string): NnrpRuntimeEvent[] {
  return [{
    type: "object-declare",
    messageType: NnrpMessageType.ObjectDeclare,
    metadata: {
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
    },
    body: new Uint8Array([0x01]),
    sessionId,
  }, {
    type: "object-ref",
    messageType: NnrpMessageType.ObjectRef,
    metadata: {
      objectId: 1n,
      operationId: 2n,
      objectVersion: 3n,
      offset: 0n,
      length: 2n,
      flags: 0,
      metadataBytes: 1,
    },
    body: new Uint8Array([0x02]),
    sessionId,
  }, {
    type: "object-release",
    messageType: NnrpMessageType.ObjectRelease,
    metadata: {
      objectId: 1n,
      operationId: 2n,
      releaseReason: ObjectReleaseReason.Completed,
      sourceRole: RuntimeRole.Client,
      flags: 0,
      diagnosticBytes: 1,
    },
    diagnostic: new Uint8Array([0x03]),
    sessionId,
  }, {
    type: "object-patch",
    messageType: NnrpMessageType.ObjectPatch,
    metadata: {
      objectId: 1n,
      deltaSequence: 4n,
      regionOffset: 0n,
      regionBytes: 2,
      deltaBytes: 2,
      flags: 0,
      metadataBytes: 1,
    },
    metadataBody: new Uint8Array([0x04]),
    delta: new Uint8Array([0x05, 0x06]),
    sessionId,
  }, {
    type: "object-delta",
    messageType: NnrpMessageType.ObjectDelta,
    metadata: {
      objectId: 1n,
      deltaSequence: 5n,
      regionOffset: 2n,
      regionBytes: 2,
      deltaBytes: 2,
      flags: 0,
      metadataBytes: 1,
    },
    metadataBody: new Uint8Array([0x07]),
    delta: new Uint8Array([0x08, 0x09]),
    sessionId,
  }, {
    type: "cache-reference",
    messageType: NnrpMessageType.CacheReference,
    metadata: {
      cacheKeyHi: 6n,
      cacheKeyLo: 7n,
      profileId: 8,
      reuseScope: CacheReuseScope.Session,
      leaseId: 9n,
      producerTraceId: 10n,
      expirationHintMs: 1_000,
      metadataBytes: 1,
      flags: 0,
    },
    body: new Uint8Array([0x0a]),
    sessionId,
  }, {
    type: "cache-miss",
    messageType: NnrpMessageType.CacheMiss,
    metadata: {
      cacheKeyHi: 6n,
      cacheKeyLo: 7n,
      missReason: CacheMissReason.NotFound,
      profileId: 8,
      diagnosticBytes: 1,
    },
    diagnostic: new Uint8Array([0x0b]),
    sessionId,
  }, {
    type: "cache-invalidate",
    messageType: NnrpMessageType.CacheInvalidate,
    metadata: {
      invalidateScope: 1,
      cacheNamespace: 2,
      cacheKeyHi: 3,
      cacheKeyLo: 4,
      reasonCode: 5,
    },
    sessionId,
  }];
}
