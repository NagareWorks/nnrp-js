import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  decodeCacheAckMetadata,
  decodeCacheInvalidateMetadata,
  decodeCachePutMetadata,
  decodeClientHelloMetadata,
  decodeFlowUpdateMetadata,
  decodeFrameSubmitMetadata,
  decodeObjectReferenceBlock,
  decodeResultHintMetadata,
  decodeResultPushMetadata,
  decodeSessionPatchAckMetadata,
  decodeTransportProbeAckMetadata,
  decodeTransportProbeMetadata,
  encodeCacheAckMetadata,
  encodeCacheInvalidateMetadata,
  encodeCachePutMetadata,
  encodeClientHelloMetadata,
  encodeFlowUpdateMetadata,
  encodeFrameSubmitMetadata,
  encodeObjectReferenceBlock,
  encodeResultHintMetadata,
  encodeResultPushMetadata,
  encodeSessionPatchAckMetadata,
  encodeTransportProbeAckMetadata,
  encodeTransportProbeMetadata,
  NnrpProtocolError,
} from "../src/index.ts";

interface GoldenCodecCase {
  readonly name: string;
  readonly hex: string;
  readonly decode: (encoded: Uint8Array) => unknown;
  readonly encode: (metadata: never) => Uint8Array;
}

const GOLDEN_CODECS: readonly GoldenCodecCase[] = [
  {
    name: "CLIENT_HELLO",
    hex:
      "01010100010000000100000003000000030000002100000003000000010007000100020040000000000001007017640002000000000000006000000000000000",
    decode: decodeClientHelloMetadata,
    encode: encodeClientHelloMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "SESSION_PATCH_ACK",
    hex: "010003001100000044000000000000000200000028230000680105000300000000000000010000000300000010000000",
    decode: decodeSessionPatchAckMetadata,
    encode: encodeSessionPatchAckMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "FLOW_UPDATE",
    hex: "0104020000000100000000000000000000000000280000000500000003000000",
    decode: decodeFlowUpdateMetadata,
    encode: encodeFlowUpdateMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "RESULT_HINT",
    hex: "0300000003000000030000003c000000",
    decode: decodeResultHintMetadata,
    encode: encodeResultHintMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "FRAME_SUBMIT",
    hex:
      "80026801200020005400020001020000640070170700000000000000c000000000000000000000000807060504030201000000000205ff0003000000290000001100000002000000",
    decode: decodeFrameSubmitMetadata,
    encode: encodeFrameSubmitMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "RESULT_PUSH",
    hex:
      "0000050001005400020000004b0302004e030000000000001000000000000000000000000000000000000000010100002900000035001f000300000003000000",
    decode: decodeResultPushMetadata,
    encode: encodeResultPushMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "CACHE_PUT",
    hex: "010000000100000004030201000000000807060500000000983a0000000800000300000003000000",
    decode: decodeCachePutMetadata,
    encode: encodeCachePutMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "CACHE_ACK",
    hex: "010000000000000004030201000000000807060500000000983a0000002000000000000000000000",
    decode: decodeCacheAckMetadata,
    encode: encodeCacheAckMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "CACHE_INVALIDATE",
    hex: "0300000001000000040302010000000008070605000000000200000000000000",
    decode: decodeCacheInvalidateMetadata,
    encode: encodeCacheInvalidateMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "TRANSPORT_PROBE",
    hex: "07000000b0040000a086010000000000",
    decode: decodeTransportProbeMetadata,
    encode: encodeTransportProbeMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "TRANSPORT_PROBE_ACK",
    hex: "0700000000000000c089010000000000",
    decode: decodeTransportProbeAckMetadata,
    encode: encodeTransportProbeAckMetadata as (metadata: never) => Uint8Array,
  },
  {
    name: "OBJECT_REFERENCE",
    hex: "020000000700000044332211000000008877665500000000",
    decode: decodeObjectReferenceBlock,
    encode: encodeObjectReferenceBlock as (metadata: never) => Uint8Array,
  },
];

Deno.test("@nnrp/core baseline metadata codecs match the Rust golden vectors", () => {
  for (const codec of GOLDEN_CODECS) {
    const golden = fromHex(codec.hex);
    const metadata = codec.decode(golden);
    assertEquals(codec.encode(metadata as never), golden, codec.name);
  }
});

Deno.test("@nnrp/core baseline metadata decoders require their exact frozen widths", () => {
  for (const codec of GOLDEN_CODECS) {
    const golden = fromHex(codec.hex);
    assertThrows(
      () => codec.decode(golden.subarray(0, golden.byteLength - 1)),
      NnrpProtocolError,
      undefined,
      codec.name,
    );
    const oversized = new Uint8Array(golden.byteLength + 1);
    oversized.set(golden);
    assertThrows(() => codec.decode(oversized), NnrpProtocolError, undefined, codec.name);
  }
});

Deno.test("@nnrp/core baseline metadata codecs reject invalid semantic and reserved values", () => {
  assertRejected(decodeClientHelloMetadata, GOLDEN_CODECS[0]!, 2, 0);
  assertRejected(decodeSessionPatchAckMetadata, GOLDEN_CODECS[1]!, 18, 1);
  assertRejected(decodeFlowUpdateMetadata, GOLDEN_CODECS[2]!, 3, 1);
  assertRejected(decodeResultHintMetadata, GOLDEN_CODECS[3]!, 8, 99);
  assertRejected(decodeFrameSubmitMetadata, GOLDEN_CODECS[4]!, 40, 0, 8);
  assertRejected(decodeResultPushMetadata, GOLDEN_CODECS[5]!, 10, 1);
  assertRejected(decodeCachePutMetadata, GOLDEN_CODECS[6]!, 36, 4);
  assertRejected(decodeCacheAckMetadata, GOLDEN_CODECS[7]!, 36, 1);
  assertRejected(decodeCacheInvalidateMetadata, GOLDEN_CODECS[8]!, 0, 4);
  assertRejected(decodeTransportProbeAckMetadata, GOLDEN_CODECS[10]!, 4, 1);
  assertRejected(decodeObjectReferenceBlock, GOLDEN_CODECS[11]!, 2, 1);
});

function assertRejected(
  decode: (encoded: Uint8Array) => unknown,
  codec: GoldenCodecCase,
  offset: number,
  value: number,
  width = 1,
): void {
  const invalid = fromHex(codec.hex);
  invalid.fill(value, offset, offset + width);
  assertThrows(() => decode(invalid), NnrpProtocolError, undefined, codec.name);
}

function fromHex(value: string): Uint8Array {
  if (value.length % 2 !== 0) throw new Error("hex fixture must contain complete bytes");
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}
