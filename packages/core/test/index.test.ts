import { assertEquals } from "jsr:@std/assert@1";
import { createPreviewManifest, selectTransport } from "../src/index.ts";

Deno.test("@nnrp/core creates a preview manifest with default native transports", () => {
  const manifest = createPreviewManifest(["session.lifecycle"]);

  assertEquals(manifest.protocol, "NNRP");
  assertEquals(manifest.version, "1.0.0-preview.3");
  assertEquals(manifest.transports, ["tcp", "quic"]);
  assertEquals(manifest.features, ["session.lifecycle"]);
});

Deno.test("@nnrp/core selects the highest scored mutually supported transport", () => {
  const selection = selectTransport([
    { kind: "quic", peerSupported: true, localAvailable: true, score: 50 },
    { kind: "tcp", peerSupported: true, localAvailable: true, score: 80 },
    { kind: "webtransport", peerSupported: false, localAvailable: true, score: 100 },
  ]);

  assertEquals(selection.selected?.kind, "tcp");
});
