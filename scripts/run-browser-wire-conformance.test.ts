import { assertEquals, assertMatch, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { resolve } from "node:path";
import {
  BROWSER_WIRE_SCENARIO_ID,
  createBrowserWireResults,
  validateBrowserWireEnvelope,
} from "./browser-wire-contract.ts";
import {
  browserEvidenceJsonl,
  parseBrowserWireOptions,
  reserveWebSocketEndpoint,
  resolveBrowserExecutable,
} from "./browser-wire-runtime.ts";

Deno.test("browser wire options keep the browser evidence path independent", () => {
  assertEquals(
    parseBrowserWireOptions(["--artifacts", "artifacts/custom-browser", "--browser", "custom-chrome"], {
      NNRP_CONFORMANCE_ROOT: "../suite",
    }),
    {
      artifactDirectory: resolve("artifacts/custom-browser"),
      conformanceRoot: resolve("../suite"),
      browserExecutable: "custom-chrome",
    },
  );
});

Deno.test("browser wire reports match the standard Preview4 case-results identity", () => {
  const report = createBrowserWireResults(
    "passed",
    [{ direction: "received", frame: "REQUEST", timestamp_us: 1 }],
    "passed",
    "browser-evidence.jsonl",
  );
  const envelope = {
    report,
    evidence: {
      console: [],
      frames: report.results[0].observed_frames,
      timing: { started_at_unix_ms: 1, elapsed_us: 2 },
    },
  };
  validateBrowserWireEnvelope(envelope);
  assertEquals(report.results[0].id, BROWSER_WIRE_SCENARIO_ID);
  assertThrows(
    () => validateBrowserWireEnvelope({ ...envelope, report: { ...report, protocol_version: "nnrp-1-preview3" } }),
    Error,
    "frozen Preview4 identity",
  );
});

Deno.test("browser wire report validation rejects malformed results and evidence", () => {
  const report = createBrowserWireResults("failed", [], "failed", "browser-evidence.jsonl");
  const envelope = {
    report,
    evidence: {
      console: [],
      frames: [],
      timing: { started_at_unix_ms: 1, elapsed_us: 2 },
    },
  };
  validateBrowserWireEnvelope(envelope);
  assertEquals(report.results[0].terminal, "error");
  assertThrows(() => validateBrowserWireEnvelope(null), Error, "must be an object");
  assertThrows(
    () => validateBrowserWireEnvelope({ ...envelope, report: { ...report, results: [] } }),
    Error,
    "exactly one selected case",
  );
  assertThrows(
    () =>
      validateBrowserWireEnvelope({
        ...envelope,
        report: { ...report, results: [{ ...report.results[0], outcome: "unknown" }] },
      }),
    Error,
    "case result is invalid",
  );
  assertThrows(
    () => validateBrowserWireEnvelope({ ...envelope, evidence: { ...envelope.evidence, frames: null } }),
    Error,
    "console and frame arrays",
  );
  assertThrows(
    () =>
      validateBrowserWireEnvelope({
        ...envelope,
        evidence: { ...envelope.evidence, timing: { started_at_unix_ms: -1, elapsed_us: Number.NaN } },
      }),
    Error,
    "non-negative numbers",
  );
});

Deno.test("browser executable resolution rejects missing explicit paths", async () => {
  await assertRejects(
    () => resolveBrowserExecutable(resolve("artifacts/missing-browser")),
    Error,
    "Chrome-family executable",
  );
});

Deno.test("browser wire runtime resolves explicit executables and reserves WebSocket endpoints", async () => {
  const executable = await Deno.makeTempFile();
  try {
    assertEquals(await resolveBrowserExecutable(executable), executable);
  } finally {
    await Deno.remove(executable);
  }
  assertMatch(reserveWebSocketEndpoint(), /^ws:\/\/127\.0\.0\.1:\d+\/nnrp$/);
  assertThrows(
    () => parseBrowserWireOptions(["--browser", ""], {}),
    Error,
    "--browser must not be empty",
  );
});

Deno.test("browser wire evidence is emitted as typed JSON lines", () => {
  const report = createBrowserWireResults(
    "passed",
    [{ direction: "received", frame: "REQUEST", timestamp_us: 2 }],
    "passed",
    "browser-evidence.jsonl",
  );
  const lines = browserEvidenceJsonl({
    report,
    evidence: {
      console: [{ level: "info", message: "ready", timestamp_us: 1 }],
      frames: report.results[0].observed_frames,
      timing: { started_at_unix_ms: 3, elapsed_us: 4 },
    },
  }).trimEnd().split("\n").map((line) => JSON.parse(line));
  assertEquals(lines.map((entry) => entry.kind), ["console", "frame", "timing"]);
});

Deno.test("browser host-route WSS trusts only the suite certificate pin", async () => {
  const targetSource = await Deno.readTextFile("scripts/run-host-route-target.ts");
  const runnerSource = await Deno.readTextFile("scripts/run-browser-wire-conformance.ts");
  assertMatch(targetSource, /--ignore-certificate-errors-spki-list=/);
  assertEquals(targetSource.includes('"--ignore-certificate-errors"'), false);
  assertMatch(runnerSource, /runBrowserHostRouteConformance/);
});
