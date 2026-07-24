import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assertBenchmarkSmokeThresholds,
  createBenchmarkReport,
  createCapabilityManifestReport,
  createConformanceReport,
  parseCommandOptions,
  selectBuildModes,
  writeJson,
} from "./sdk-reporting.ts";

Deno.test("sdk reporting creates build-mode-specific manifests", () => {
  const report = createCapabilityManifestReport({ mode: "all" });

  assertEquals(report.manifests.map((entry) => entry.buildMode), ["backend-native", "browser-wasm"]);
  assertEquals(report.manifests[0]?.artifactVersion, "1.0.0-preview.4.16");
  assertEquals(report.manifests[0]?.manifest.transports, ["tcp", "quic", "ipc", "websocket"]);
  assertEquals(report.manifests[0]?.manifest.capabilities.includes("server.session"), true);
  assertEquals(report.manifests[0]?.manifest.capabilities.includes("control.capability_costs"), true);
  assertEquals(report.manifests[0]?.manifest.capabilities.includes("object.ownership"), true);
  assertEquals(report.manifests[1]?.manifest.capabilities.includes("server.session"), false);
  assertEquals(report.manifests[1]?.manifest.capabilities.includes("control.capability_costs"), true);
  assertEquals(report.manifests[1]?.manifest.capabilities.includes("cache.reference"), true);
  assertEquals(
    report.manifests.every((entry) =>
      !(entry.manifest.capabilities as readonly string[]).includes("control.retry_after")
    ),
    true,
  );
});

Deno.test("sdk reporting keeps adapter smoke separate from wire evidence", () => {
  const report = createConformanceReport("backend-native");

  assertEquals(report.buildMode, "backend-native");
  assertEquals(report.artifactVersion, "1.0.0-preview.4.16");
  assertEquals(report.cases.length, report.manifest.capabilities.length);
  assertEquals(report.cases.every((entry) => entry.status === "skipped"), true);
  assertEquals(
    report.cases.every((entry) => entry.diagnostic?.code === "NNRP_JS_WIRE_CONFORMANCE_NOT_EXECUTED"),
    true,
  );
  assertEquals(report.diagnostics[0]?.code, "NNRP_JS_ADAPTER_CONTRACT_ONLY");
  assertEquals(report.transport.selected, "tcp");
  assertEquals(report.transport.rejected, []);
});

Deno.test("sdk reporting creates benchmark smoke results", () => {
  const report = createBenchmarkReport("browser-wasm");

  assertEquals(report.buildMode, "browser-wasm");
  assertEquals(report.results[0]?.name, "capability_manifest_generation");
  assertEquals(report.results[0]?.value, report.manifest.capabilities.length);
  assertEquals(report.results[1]?.category, "latency");
  assertEquals(report.results[1]?.status, "skipped");
  assertEquals(report.results[2]?.category, "throughput");
  assertEquals(report.results[2]?.status, "skipped");
  assertEquals(report.results[3]?.name, "transport_candidates");
  assertEquals(report.transport.selected, "websocket");
  assertEquals(report.diagnostics.some((entry) => entry.code === "NNRP_JS_TRANSPORT_SELECTION"), true);
  assertBenchmarkSmokeThresholds(report);
});

Deno.test("sdk reporting rejects benchmark smoke reports below structural thresholds", () => {
  assertThrows(() =>
    assertBenchmarkSmokeThresholds({
      ...createBenchmarkReport("backend-native"),
      transport: {
        selected: null,
        candidates: [],
        rejected: [],
        policy: "auto",
      },
      results: [],
    })
  );
});

Deno.test("sdk reporting parses command options", () => {
  assertEquals(parseCommandOptions(["--mode", "backend-native", "--artifact-version", "1.0.0"]), {
    mode: "backend-native",
    artifactVersion: "1.0.0",
  });
});

Deno.test("sdk reporting rejects unknown modes", () => {
  assertThrows(() => parseCommandOptions(["--mode", "preview3"]));
});

Deno.test("sdk reporting selects requested build modes", () => {
  assertEquals(selectBuildModes("all"), ["backend-native", "browser-wasm"]);
  assertEquals(selectBuildModes("backend-native"), ["backend-native"]);
  assertEquals(selectBuildModes("browser-wasm"), ["browser-wasm"]);
});

Deno.test("sdk reporting writes JSON with canonical decimal u64 values", () => {
  const original = console.log;
  const lines: string[] = [];
  try {
    console.log = (value: string) => {
      lines.push(value);
    };

    writeJson({ sdk: "nnrp-js", units: 18_446_744_073_709_551_615n });
  } finally {
    console.log = original;
  }

  assertEquals(lines, ['{\n  "sdk": "nnrp-js",\n  "units": "18446744073709551615"\n}']);
});
