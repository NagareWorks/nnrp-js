import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  createBenchmarkReport,
  createCapabilityManifestReport,
  createConformanceReport,
  parseCommandOptions,
  selectBuildModes,
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
  assertEquals(report.cases.length, report.manifest.capabilities.length);
  assertEquals(report.cases.every((entry) => entry.status === "passed"), true);
  assertEquals(report.transport.selected, "tcp");
  assertEquals(report.transport.rejected[0]?.kind, "quic");
});

Deno.test("sdk reporting creates benchmark smoke results", () => {
  const report = createBenchmarkReport("browser-wasm");

  assertEquals(report.buildMode, "browser-wasm");
  assertEquals(report.results[0]?.name, "capability_manifest_generation");
  assertEquals(report.results[0]?.value, report.manifest.capabilities.length);
  assertEquals(report.results[1]?.name, "transport_candidate_count");
  assertEquals(report.transport.selected, "websocket");
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

Deno.test("sdk reporting selects all build modes", () => {
  assertEquals(selectBuildModes("all"), ["backend-native", "browser-wasm"]);
});
