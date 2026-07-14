import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  createWireConformanceTargetManifest,
  NNRP_WIRE_PROTOCOL_VERSION,
  NNRP_WIRE_TARGET_SCHEMA,
  validateWireConformanceTargetManifest,
  type WireConformanceTargetOptions,
} from "./wire-target-manifest.ts";

const TARGET_OPTIONS: WireConformanceTargetOptions = {
  targetName: "nnrp-js-native-server",
  suiteVersion: "0.1.0",
  modes: ["suite_as_client"],
  transports: [
    { name: "tcp", endpoint: "127.0.0.1:4433", tls: false },
    { name: "ipc", endpoint: "unix:///run/nnrp.sock", tls: false },
  ],
  capabilities: ["server.session", "control.cancel_abort", "object.lifecycle", "cache.reference"],
  maxFrameBytes: 16 * 1024 * 1024,
  maxInFlight: 64,
};

Deno.test("wire target generator emits the frozen Preview4 schema shape", () => {
  const manifest = createWireConformanceTargetManifest(TARGET_OPTIONS);

  assertEquals(manifest, {
    $schema: NNRP_WIRE_TARGET_SCHEMA,
    target_name: "nnrp-js-native-server",
    protocol_version: NNRP_WIRE_PROTOCOL_VERSION,
    suite_version: "0.1.0",
    wire_conformance: {
      modes: ["suite_as_client"],
      transports: [
        { name: "tcp", endpoint: "127.0.0.1:4433", tls: false },
        { name: "ipc", endpoint: "unix:///run/nnrp.sock", tls: false },
      ],
      capabilities: ["server.session", "control.cancel_abort", "object.lifecycle", "cache.reference"],
      limits: {
        max_frame_bytes: 16 * 1024 * 1024,
        max_in_flight: 64,
      },
    },
  });
  validateWireConformanceTargetManifest(structuredClone(manifest));
});

Deno.test("wire target generator emits only caller-started live endpoints", () => {
  const manifest = createWireConformanceTargetManifest({
    ...TARGET_OPTIONS,
    targetName: "nnrp-js-browser-client",
    modes: ["suite_as_server"],
    transports: [{ name: "websocket", endpoint: "wss://suite.example/nnrp", tls: true }],
    capabilities: ["client.session", "wasm.loader", "transport.websocket"],
  });

  assertEquals(manifest.wire_conformance.transports, [
    { name: "websocket", endpoint: "wss://suite.example/nnrp", tls: true },
  ]);
});

Deno.test("wire target validation rejects values outside the released schema", () => {
  const valid = createWireConformanceTargetManifest(TARGET_OPTIONS);
  const invalidValues: readonly unknown[] = [
    { ...valid, protocol_version: "nnrp-1-preview3" },
    { ...valid, suite_version: "" },
    { ...valid, unexpected: true },
    { ...valid, wire_conformance: { ...valid.wire_conformance, modes: [] } },
    { ...valid, wire_conformance: { ...valid.wire_conformance, modes: ["suite_as_client", "suite_as_client"] } },
    { ...valid, wire_conformance: { ...valid.wire_conformance, modes: ["adapter"] } },
    { ...valid, wire_conformance: { ...valid.wire_conformance, transports: [] } },
    {
      ...valid,
      wire_conformance: {
        ...valid.wire_conformance,
        transports: [{ name: "webtransport", endpoint: "https://suite.example", tls: true }],
      },
    },
    {
      ...valid,
      wire_conformance: {
        ...valid.wire_conformance,
        transports: [{ name: "tcp", endpoint: "", tls: false }],
      },
    },
    {
      ...valid,
      wire_conformance: {
        ...valid.wire_conformance,
        transports: [{ name: "tcp", endpoint: "127.0.0.1:4433", tls: "false" }],
      },
    },
    { ...valid, wire_conformance: { ...valid.wire_conformance, capabilities: [] } },
    { ...valid, wire_conformance: { ...valid.wire_conformance, capabilities: ["cache", "cache"] } },
    { ...valid, wire_conformance: { ...valid.wire_conformance, capabilities: ["unknown.capability"] } },
    {
      ...valid,
      wire_conformance: {
        ...valid.wire_conformance,
        limits: { max_frame_bytes: 0, max_in_flight: 1 },
      },
    },
    {
      ...valid,
      wire_conformance: {
        ...valid.wire_conformance,
        limits: { max_frame_bytes: 1, max_in_flight: 1.5 },
      },
    },
  ];

  for (const invalid of invalidValues) {
    assertThrows(() => validateWireConformanceTargetManifest(invalid));
  }
});
