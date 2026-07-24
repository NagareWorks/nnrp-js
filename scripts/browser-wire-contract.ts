export const BROWSER_WIRE_SCENARIO_ID = "wire.control.progress-backpressure.websocket-server";
export const BROWSER_WIRE_TARGET_NAME = "nnrp-js-preview4-browser";
export const WIRE_RESULTS_SCHEMA =
  "https://github.com/NagareWorks/nnrp-conformance/schemas/wire-conformance-case-results.schema.json";

export interface BrowserWireObservedFrame {
  readonly direction: "sent" | "received";
  readonly frame: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly timestamp_us: number;
}

export interface BrowserWireCaseResult {
  readonly id: typeof BROWSER_WIRE_SCENARIO_ID;
  readonly outcome: "passed" | "failed";
  readonly terminal: "success" | "error";
  readonly observed_frames: readonly BrowserWireObservedFrame[];
  readonly message: string;
  readonly evidence_paths: readonly string[];
}

export interface BrowserWireResults {
  readonly $schema: typeof WIRE_RESULTS_SCHEMA;
  readonly protocol_version: "nnrp-1-preview4";
  readonly suite_version: "0.1.0";
  readonly target_name: typeof BROWSER_WIRE_TARGET_NAME;
  readonly results: readonly [BrowserWireCaseResult];
}

export interface BrowserWireEvidence {
  readonly console: readonly {
    readonly level: "debug" | "info" | "log" | "warn" | "error";
    readonly message: string;
    readonly timestamp_us: number;
  }[];
  readonly frames: readonly BrowserWireObservedFrame[];
  readonly timing: {
    readonly started_at_unix_ms: number;
    readonly elapsed_us: number;
  };
}

export interface BrowserWireEnvelope {
  readonly report: BrowserWireResults;
  readonly evidence: BrowserWireEvidence;
}

export function createBrowserWireResults(
  outcome: "passed" | "failed",
  observedFrames: readonly BrowserWireObservedFrame[],
  message: string,
  evidencePath: string,
): BrowserWireResults {
  return {
    $schema: WIRE_RESULTS_SCHEMA,
    protocol_version: "nnrp-1-preview4",
    suite_version: "0.1.0",
    target_name: BROWSER_WIRE_TARGET_NAME,
    results: [{
      id: BROWSER_WIRE_SCENARIO_ID,
      outcome,
      terminal: outcome === "passed" ? "success" : "error",
      observed_frames: observedFrames,
      message,
      evidence_paths: [evidencePath],
    }],
  };
}

export function validateBrowserWireEnvelope(value: unknown): asserts value is BrowserWireEnvelope {
  const envelope = record(value, "browser wire envelope");
  const report = record(envelope.report, "browser wire report");
  if (
    report.protocol_version !== "nnrp-1-preview4" || report.suite_version !== "0.1.0" ||
    report.target_name !== BROWSER_WIRE_TARGET_NAME
  ) {
    throw new Error("browser wire report does not match the frozen Preview4 identity");
  }
  if (!Array.isArray(report.results) || report.results.length !== 1) {
    throw new Error("browser wire report must contain exactly one selected case");
  }
  const result = record(report.results[0], "browser wire case result");
  if (
    result.id !== BROWSER_WIRE_SCENARIO_ID || !["passed", "failed"].includes(String(result.outcome)) ||
    !["success", "error"].includes(String(result.terminal)) || !Array.isArray(result.observed_frames)
  ) {
    throw new Error("browser wire case result is invalid");
  }
  const evidence = record(envelope.evidence, "browser wire evidence");
  if (!Array.isArray(evidence.console) || !Array.isArray(evidence.frames)) {
    throw new Error("browser wire evidence must contain console and frame arrays");
  }
  const timing = record(evidence.timing, "browser wire timing");
  if (!nonNegativeNumber(timing.started_at_unix_ms) || !nonNegativeNumber(timing.elapsed_us)) {
    throw new Error("browser wire timing values must be non-negative numbers");
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
