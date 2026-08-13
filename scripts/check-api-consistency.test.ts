import { EXPECTED_JAVASCRIPT_PROJECTIONS, projectionMapsEqual } from "./frozen-javascript-projections.ts";
import { assert, assertFalse } from "jsr:@std/assert@1";

Deno.test("frozen JavaScript projection gate compares the complete map", () => {
  assert(projectionMapsEqual(EXPECTED_JAVASCRIPT_PROJECTIONS, EXPECTED_JAVASCRIPT_PROJECTIONS));

  const drifted = structuredClone(EXPECTED_JAVASCRIPT_PROJECTIONS) as Record<string, unknown>;
  drifted.transportSelectionOptions = "@nnrp/core.LegacyTransportSelectionOptions";
  assertFalse(projectionMapsEqual(drifted, EXPECTED_JAVASCRIPT_PROJECTIONS));
});

Deno.test("frozen JavaScript projection gate rejects missing and extra keys", () => {
  const missing = structuredClone(EXPECTED_JAVASCRIPT_PROJECTIONS) as Record<string, unknown>;
  delete missing.typedPayloadFrame;
  assertFalse(projectionMapsEqual(missing, EXPECTED_JAVASCRIPT_PROJECTIONS));

  const extra = { ...EXPECTED_JAVASCRIPT_PROJECTIONS, legacyCompatibilityAlias: "LegacyAlias" };
  assertFalse(projectionMapsEqual(extra, EXPECTED_JAVASCRIPT_PROJECTIONS));
});

Deno.test("frozen JavaScript projection gate covers every baseline metadata codec", () => {
  const codecs = EXPECTED_JAVASCRIPT_PROJECTIONS.baselineMetadataCodecs;
  assert(Object.keys(codecs).length === 12);
  for (const pair of Object.values(codecs)) {
    assert(pair.length === 2);
    assert(pair[0].startsWith("encode"));
    assert(pair[1].startsWith("decode"));
  }
});
