import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  CacheMissReason,
  CacheReuseScope,
  decodeCacheInvalidateMetadata,
  decodeRuntimeControlMetadata,
  decodeRuntimeObjectMetadata,
  encodeCacheInvalidateMetadata,
  encodeRuntimeControlMetadata,
  encodeRuntimeObjectMetadata,
  ErrorScope,
  MemoryLocationHint,
  NnrpMessageType,
  ObjectReleaseReason,
  OwnershipHint,
  type RuntimeControlMetadata,
  RuntimeObjectKind,
  type RuntimeObjectMetadata,
  RuntimeRole,
} from "@nnrp/core";
import {
  decodeRuntimeControlMetadataJson,
  decodeRuntimeObjectMetadataJson,
  encodeRuntimeControlMetadataJson,
  encodeRuntimeObjectMetadataJson,
  initSync,
} from "../wasm/nnrp_wasm.js";

interface CodecCase<T> {
  readonly messageTypes: readonly NnrpMessageType[];
  readonly metadata: T;
  readonly tail: Uint8Array;
}

const CONTROL_CASES: readonly CodecCase<RuntimeControlMetadata>[] = [
  {
    messageTypes: [NnrpMessageType.Cancel, NnrpMessageType.Abort],
    metadata: {
      operationId: 1n,
      controlSequence: 2n,
      reasonCode: 3,
      sourceRole: RuntimeRole.Client,
      flags: 0x03,
      diagnosticBytes: 2,
    },
    tail: new Uint8Array([0xaa, 0xbb]),
  },
  {
    messageTypes: [NnrpMessageType.PriorityUpdate, NnrpMessageType.Deadline, NnrpMessageType.ExpireAt],
    metadata: {
      operationId: 3n,
      controlSequence: 4n,
      priorityClass: 5,
      priorityDelta: -6,
      deadlineUnixMs: 1_800_000_000_000n,
      flags: 0x01,
    },
    tail: new Uint8Array(),
  },
  {
    messageTypes: [NnrpMessageType.Supersede],
    metadata: {
      oldOperationId: 7n,
      newOperationId: 8n,
      controlSequence: 9n,
      dropReasonCode: 10,
      flags: 0x01,
      diagnosticBytes: 1,
    },
    tail: new Uint8Array([0x11]),
  },
  {
    messageTypes: [NnrpMessageType.BudgetUpdate],
    metadata: {
      operationId: 11n,
      computeBudgetUnits: 12n,
      memoryBudgetBytes: 13n,
      bandwidthBudgetBytes: 14n,
      tokenBudget: 15,
      flags: 0x02,
    },
    tail: new Uint8Array(),
  },
  {
    messageTypes: [NnrpMessageType.Progress],
    metadata: {
      operationId: 16n,
      progressSequence: 17n,
      stageCode: 18,
      percentX100: 9_999,
      objectId: 19n,
      bodyBytes: 2,
    },
    tail: new Uint8Array([0x22, 0x23]),
  },
  {
    messageTypes: [NnrpMessageType.PartialResult],
    metadata: {
      operationId: 20n,
      resultSequence: 21n,
      objectId: 22n,
      deltaSequence: 23n,
      bodyBytes: 1,
      flags: 0x03,
    },
    tail: new Uint8Array([0x24]),
  },
  {
    messageTypes: [NnrpMessageType.Backpressure, NnrpMessageType.CreditUpdate],
    metadata: {
      scopeId: 25n,
      creditWindow: 26n,
      pressureLevel: 27,
      pressureReason: 28,
      retryAfterMs: 29,
      flags: 0x01,
    },
    tail: new Uint8Array(),
  },
  {
    messageTypes: [NnrpMessageType.CapabilityNegotiation, NnrpMessageType.DegradeProfile],
    metadata: {
      profileId: 30,
      capabilityCount: 31,
      costModelId: 32,
      preferenceRank: 33,
      limitBytes: 34n,
      limitUnits: 35n,
      bodyBytes: 2,
      flags: 0x02,
    },
    tail: new Uint8Array([0x25, 0x26]),
  },
  {
    messageTypes: [NnrpMessageType.RouteHint, NnrpMessageType.ExecutionHint],
    metadata: {
      operationId: 36n,
      routeId: 37,
      executorClass: 38,
      affinityClass: 39,
      deadlineUnixMs: 1_900_000_000_000n,
      bodyBytes: 1,
      flags: 0x01,
    },
    tail: new Uint8Array([0x27]),
  },
  {
    messageTypes: [NnrpMessageType.TraceContext],
    metadata: {
      traceId: 40n,
      spanId: 41n,
      parentSpanId: 42n,
      stageCode: 43,
      flags: 0x03,
      bodyBytes: 1,
    },
    tail: new Uint8Array([0x28]),
  },
  {
    messageTypes: [NnrpMessageType.ResultDropReason],
    metadata: {
      operationId: 44n,
      resultSequence: 45n,
      dropReasonCode: 46,
      sourceRole: RuntimeRole.Runtime,
      flags: 0x02,
      diagnosticBytes: 1,
    },
    tail: new Uint8Array([0x29]),
  },
  {
    messageTypes: [NnrpMessageType.ErrorRecoverable],
    metadata: {
      errorCode: 47,
      errorScope: ErrorScope.Session,
      recoveryAction: 49,
      sourceRole: RuntimeRole.Server,
      flags: 0x03,
      retryAfterMs: 50,
      relatedSessionId: 51,
      relatedFrameId: 52,
      relatedViewId: 53,
      diagnosticBytes: 2,
    },
    tail: new Uint8Array([0x2a, 0x2b]),
  },
  {
    messageTypes: [NnrpMessageType.RetryAfter],
    metadata: {
      scopeId: 54n,
      controlSequence: 55n,
      retryAfterMs: 56,
      jitterMs: 57,
      reasonCode: 58,
      sourceRole: RuntimeRole.Scheduler,
      flags: 0x01,
      diagnosticBytes: 1,
    },
    tail: new Uint8Array([0x2c]),
  },
];

const OBJECT_CASES: readonly CodecCase<RuntimeObjectMetadata>[] = [
  {
    messageTypes: [NnrpMessageType.ObjectDeclare],
    metadata: {
      objectId: 1n,
      objectKind: RuntimeObjectKind.Tensor,
      producerRole: RuntimeRole.Runtime,
      consumerRole: RuntimeRole.Client,
      sessionId: 2,
      byteSize: 3n,
      computeCostUnits: 4,
      memoryLocationHint: MemoryLocationHint.DeviceMemory,
      ownershipHint: OwnershipHint.TransferOnRef,
      lifetimeHintMs: 5,
      metadataBytes: 2,
    },
    tail: new Uint8Array([0x51, 0x52]),
  },
  {
    messageTypes: [NnrpMessageType.ObjectRef],
    metadata: {
      objectId: 6n,
      operationId: 7n,
      objectVersion: 8n,
      offset: 9n,
      length: 10n,
      flags: 0x07,
      metadataBytes: 1,
    },
    tail: new Uint8Array([0x53]),
  },
  {
    messageTypes: [NnrpMessageType.ObjectRelease],
    metadata: {
      objectId: 11n,
      operationId: 12n,
      releaseReason: ObjectReleaseReason.Completed,
      sourceRole: RuntimeRole.Server,
      flags: 0x03,
      diagnosticBytes: 2,
    },
    tail: new Uint8Array([0x54, 0x55]),
  },
  {
    messageTypes: [NnrpMessageType.ObjectPatch, NnrpMessageType.ObjectDelta],
    metadata: {
      objectId: 13n,
      deltaSequence: 14n,
      regionOffset: 15n,
      regionBytes: 16,
      deltaBytes: 3,
      flags: 0x07,
      metadataBytes: 2,
    },
    tail: new Uint8Array([0x56, 0x57, 0x58, 0x59, 0x5a]),
  },
  {
    messageTypes: [NnrpMessageType.CacheReference],
    metadata: {
      cacheNamespace: 16,
      cacheKeyHi: 17n,
      cacheKeyLo: 18n,
      profileId: 19,
      reuseScope: CacheReuseScope.Session,
      leaseId: 20n,
      producerTraceId: 21n,
      expirationHintMs: 22,
      metadataBytes: 1,
      flags: 0x03,
    },
    tail: new Uint8Array([0x5b]),
  },
  {
    messageTypes: [NnrpMessageType.CacheMiss],
    metadata: {
      cacheNamespace: 22,
      cacheKeyHi: 23n,
      cacheKeyLo: 24n,
      missReason: CacheMissReason.NotFound,
      profileId: 25,
      diagnosticBytes: 2,
    },
    tail: new Uint8Array([0x5c, 0x5d]),
  },
];

const wasmBytes = await Deno.readFile(new URL("../wasm/nnrp_wasm_bg.wasm", import.meta.url));
initSync({ module: new WebAssembly.Module(wasmBytes) });

Deno.test("@nnrp/browser-client matches every Rust Preview4 control codec fixture", () => {
  for (const testCase of CONTROL_CASES) {
    for (const messageType of testCase.messageTypes) {
      const rustEncoded = encodeRuntimeControlMetadataJson(
        messageType,
        JSON.stringify(toRustJson(testCase.metadata)),
        testCase.tail,
      );
      const jsEncoded = encodeRuntimeControlMetadata(messageType, testCase.metadata, testCase.tail);

      assertEquals(jsEncoded, rustEncoded);
      assertEquals(decodeRuntimeControlMetadata(messageType, rustEncoded), {
        metadata: testCase.metadata,
        tail: testCase.tail,
      });
      assertRustDecode(
        decodeRuntimeControlMetadataJson(messageType, jsEncoded),
        testCase.metadata,
        testCase.tail,
        jsEncoded.byteLength,
      );
    }
  }
});

Deno.test("@nnrp/browser-client matches every Rust Preview4 object codec fixture", () => {
  for (const testCase of OBJECT_CASES) {
    for (const messageType of testCase.messageTypes) {
      const metadataTail = objectMetadataTail(messageType, testCase.metadata, testCase.tail);
      const rustEncoded = encodeRuntimeObjectMetadataJson(
        messageType,
        JSON.stringify(toRustJson(testCase.metadata)),
        metadataTail,
      );
      const jsEncoded = encodeRuntimeObjectMetadata(messageType, testCase.metadata, testCase.tail);

      assertEquals(jsEncoded.slice(0, rustEncoded.byteLength), rustEncoded);
      assertEquals(jsEncoded.slice(rustEncoded.byteLength), testCase.tail.slice(metadataTail.byteLength));
      assertEquals(decodeRuntimeObjectMetadata(messageType, jsEncoded), {
        metadata: testCase.metadata,
        tail: testCase.tail,
      });
      assertRustDecode(
        decodeRuntimeObjectMetadataJson(messageType, rustEncoded),
        testCase.metadata,
        metadataTail,
        rustEncoded.byteLength,
      );
    }
  }
});

Deno.test("@nnrp/browser-client matches the Rust baseline cache invalidation fixture", () => {
  const metadata = {
    invalidateScope: 3,
    cacheNamespace: 0x0102_0304,
    cacheKeyHi: 0x1112_1314_1516_1718n,
    cacheKeyLo: 0x2122_2324_2526_2728n,
    reasonCode: 0x3132_3334,
  };
  const rustFixture = new Uint8Array([
    0x03,
    0x00,
    0x00,
    0x00,
    0x04,
    0x03,
    0x02,
    0x01,
    0x18,
    0x17,
    0x16,
    0x15,
    0x14,
    0x13,
    0x12,
    0x11,
    0x28,
    0x27,
    0x26,
    0x25,
    0x24,
    0x23,
    0x22,
    0x21,
    0x34,
    0x33,
    0x32,
    0x31,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);

  assertEquals(encodeCacheInvalidateMetadata(metadata), rustFixture);
  assertEquals(decodeCacheInvalidateMetadata(rustFixture), metadata);
});

Deno.test("@nnrp/browser-client and Rust reject the same malformed codec inputs", () => {
  const control = CONTROL_CASES[0];
  const scheduling = CONTROL_CASES[1];
  const object = OBJECT_CASES[0];
  const reference = OBJECT_CASES[1];

  assertThrows(() => encodeRuntimeControlMetadata(NnrpMessageType.Cancel, scheduling.metadata));
  assertThrows(() =>
    encodeRuntimeControlMetadataJson(
      NnrpMessageType.Cancel,
      JSON.stringify(toRustJson(scheduling.metadata)),
      scheduling.tail,
    )
  );
  assertThrows(() => encodeRuntimeControlMetadata(NnrpMessageType.Cancel, control.metadata, new Uint8Array([1])));
  assertThrows(() =>
    encodeRuntimeControlMetadataJson(
      NnrpMessageType.Cancel,
      JSON.stringify(toRustJson(control.metadata)),
      new Uint8Array([1]),
    )
  );
  assertThrows(() =>
    encodeRuntimeControlMetadata(NnrpMessageType.Progress, {
      ...(CONTROL_CASES[4].metadata as unknown as Record<string, unknown>),
      percentX100: 10_001,
    } as unknown as RuntimeControlMetadata)
  );
  assertThrows(() =>
    encodeRuntimeControlMetadataJson(
      NnrpMessageType.Progress,
      JSON.stringify({
        ...(toRustJson(CONTROL_CASES[4].metadata) as Record<string, unknown>),
        percent_x100: 10_001,
      }),
      CONTROL_CASES[4].tail,
    )
  );
  assertThrows(() => decodeRuntimeControlMetadata(NnrpMessageType.Cancel, new Uint8Array(31)));
  assertThrows(() => decodeRuntimeControlMetadataJson(NnrpMessageType.Cancel, new Uint8Array(31)));
  assertThrows(() => encodeRuntimeControlMetadata(NnrpMessageType.ClientHello, control.metadata, control.tail));
  assertThrows(() =>
    encodeRuntimeControlMetadataJson(
      NnrpMessageType.ClientHello,
      JSON.stringify(toRustJson(control.metadata)),
      control.tail,
    )
  );

  assertThrows(() => encodeRuntimeObjectMetadata(NnrpMessageType.ObjectDeclare, reference.metadata));
  assertThrows(() =>
    encodeRuntimeObjectMetadataJson(
      NnrpMessageType.ObjectDeclare,
      JSON.stringify(toRustJson(reference.metadata)),
      reference.tail,
    )
  );
  const invalidReference = { ...(reference.metadata as unknown as Record<string, unknown>), flags: 0x08 };
  assertThrows(() =>
    encodeRuntimeObjectMetadata(
      NnrpMessageType.ObjectRef,
      invalidReference as unknown as RuntimeObjectMetadata,
      reference.tail,
    )
  );
  assertThrows(() =>
    encodeRuntimeObjectMetadataJson(
      NnrpMessageType.ObjectRef,
      JSON.stringify(toRustJson(invalidReference)),
      reference.tail,
    )
  );
  assertThrows(() => decodeRuntimeObjectMetadata(NnrpMessageType.ObjectDeclare, new Uint8Array(47)));
  assertThrows(() => decodeRuntimeObjectMetadataJson(NnrpMessageType.ObjectDeclare, new Uint8Array(47)));
  assertThrows(() => encodeRuntimeObjectMetadata(NnrpMessageType.ClientHello, object.metadata, object.tail));
  assertThrows(() =>
    encodeRuntimeObjectMetadataJson(
      NnrpMessageType.ClientHello,
      JSON.stringify(toRustJson(object.metadata)),
      object.tail,
    )
  );
});

function assertRustDecode(
  json: string,
  metadata: RuntimeControlMetadata | RuntimeObjectMetadata,
  tail: Uint8Array,
  encodedLength: number,
): void {
  const decoded = JSON.parse(json) as {
    readonly metadata: unknown;
    readonly tail_offset: number;
    readonly tail_len: number;
  };
  assertEquals(decoded.metadata, toRustJson(metadata));
  assertEquals(decoded.tail_len, tail.byteLength);
  assertEquals(decoded.tail_offset, tail.byteLength === 0 ? 0 : encodedLength - tail.byteLength);
}

function objectMetadataTail(
  messageType: NnrpMessageType,
  metadata: RuntimeObjectMetadata,
  tail: Uint8Array,
): Uint8Array {
  if (messageType !== NnrpMessageType.ObjectPatch && messageType !== NnrpMessageType.ObjectDelta) {
    return tail;
  }
  return tail.slice(0, (metadata as { readonly metadataBytes: number }).metadataBytes);
}

function toRustJson(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(toRustJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        toRustJson(entry),
      ]),
    );
  }
  return value;
}
