import { resolve } from "node:path";
import type { BrowserWireEnvelope } from "./browser-wire-contract.ts";

const DEFAULT_ARTIFACT_DIRECTORY = "artifacts/wire-conformance/browser";
const DEFAULT_CONFORMANCE_ROOT = "../nnrp-conformance";

export interface BrowserWireOptions {
  readonly artifactDirectory: string;
  readonly conformanceRoot: string;
  readonly browserExecutable?: string;
}

export function parseBrowserWireOptions(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): BrowserWireOptions {
  const browserExecutable = option(args, "--browser") ?? environment.NNRP_BROWSER_EXECUTABLE;
  return {
    artifactDirectory: resolve(option(args, "--artifacts") ?? DEFAULT_ARTIFACT_DIRECTORY),
    conformanceRoot: resolve(
      option(args, "--conformance-root") ?? environment.NNRP_CONFORMANCE_ROOT ?? DEFAULT_CONFORMANCE_ROOT,
    ),
    ...(browserExecutable === undefined ? {} : { browserExecutable }),
  };
}

export async function resolveBrowserExecutable(explicit?: string): Promise<string> {
  const candidates = explicit === undefined
    ? Deno.build.os === "windows"
      ? [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      ]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    : [explicit];
  for (const candidate of candidates) {
    try {
      if ((await Deno.stat(candidate)).isFile) return candidate;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  throw new Error(`browser wire conformance requires a Chrome-family executable; checked ${candidates.join(", ")}`);
}

export function reserveWebSocketEndpoint(): string {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  try {
    const address = listener.addr as Deno.NetAddr;
    return `ws://127.0.0.1:${address.port}/nnrp`;
  } finally {
    listener.close();
  }
}

export function browserEvidenceJsonl(envelope: BrowserWireEnvelope): string {
  return [
    ...envelope.evidence.console.map((entry) => JSON.stringify({ kind: "console", ...entry })),
    ...envelope.evidence.frames.map((entry) => JSON.stringify({ kind: "frame", ...entry })),
    JSON.stringify({ kind: "timing", ...envelope.evidence.timing }),
  ].join("\n") + "\n";
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value !== undefined && value.trim().length === 0) throw new Error(`${name} must not be empty`);
  return value;
}
