import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  createBenchmarkReport,
  createCapabilityManifestReport,
  createConformanceReport,
  parseCommandOptions,
  selectBuildModes,
  writeJson,
} from "./sdk-reporting.ts";

Deno.test("sdk reporting creates build-mode-specific manifests", () => {
  const report = createCapabilityManifestReport({ mode: "all", artifactVersion: "1.0.0" });

  assertEquals(report.manifests.map((entry) => entry.buildMode), ["backend-native", "browser-wasm"]);
  assertEquals(report.manifests[0]?.artifactVersion, "1.0.0");
  assertEquals(report.manifests[0]?.manifest.capabilities.includes("server.session"), true);
  assertEquals(report.manifests[1]?.manifest.capabilities.includes("server.session"), false);
});

Deno.test("sdk reporting creates conformance smoke cases from capabilities", () => {
  const report = createConformanceReport("backend-native");

  assertEquals(report.buildMode, "backend-native");
  assertEquals(report.cases.length, report.manifest.capabilities.length + 1);
  assertEquals(report.cases.filter((entry) => entry.status === "passed").length, report.manifest.capabilities.length);
  assertEquals(report.cases.at(-1)?.status, "skipped");
  assertEquals(report.cases.at(-1)?.diagnostic?.code, "NNRP_JS_NATIVE_ARTIFACT_UNAVAILABLE");
  assertEquals(report.transport.selected, "tcp");
  assertEquals(report.transport.rejected[0]?.kind, "quic");
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

Deno.test("sdk reporting writes JSON to stdout", () => {
  const original = console.log;
  const lines: string[] = [];
  try {
    console.log = (value: string) => {
      lines.push(value);
    };

    writeJson({ sdk: "nnrp-js" });
  } finally {
    console.log = original;
  }

  assertEquals(lines, ['{\n  "sdk": "nnrp-js"\n}']);
});
