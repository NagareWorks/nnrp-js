import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BROWSER_WIRE_TARGET_NAME,
  type BrowserWireEnvelope,
  validateBrowserWireEnvelope,
} from "./browser-wire-contract.ts";
import {
  browserEvidenceJsonl,
  type BrowserWireOptions,
  parseBrowserWireOptions,
  reserveWebSocketEndpoint,
  resolveBrowserExecutable,
} from "./browser-wire-runtime.ts";
import { buildRunner, requireFile, runCargo } from "./run-wire-conformance.ts";
import { createWireConformanceTargetManifest } from "./wire-target-manifest.ts";
import { validatePlanCoverage } from "./wire-conformance-plan.ts";

const BROWSER_RESULT_TIMEOUT_MILLIS = 30_000;

if (import.meta.main) {
  await runBrowserWireConformance(
    parseBrowserWireOptions(Deno.args, {
      NNRP_CONFORMANCE_ROOT: Deno.env.get("NNRP_CONFORMANCE_ROOT"),
      NNRP_BROWSER_EXECUTABLE: Deno.env.get("NNRP_BROWSER_EXECUTABLE"),
    }),
  );
}

export async function runBrowserWireConformance(options: BrowserWireOptions): Promise<void> {
  const suitePath = resolve(options.conformanceRoot, "wire-conformance/nnrp-1-preview4/manifest.json");
  await requireFile(suitePath, "wire suite manifest");
  await requireFile(resolve(options.conformanceRoot, "Cargo.toml"), "conformance runner workspace");
  await requireFile("packages/browser-client/wasm/nnrp_wasm.js", "browser WASM glue");
  await requireFile("packages/browser-client/wasm/nnrp_wasm_bg.wasm", "browser WASM module");

  await removeDirectory(options.artifactDirectory);
  const siteDirectory = resolve(options.artifactDirectory, "site");
  const browserDirectory = resolve(siteDirectory, "browser");
  await Deno.mkdir(browserDirectory, { recursive: true });

  const targetPath = resolve(options.artifactDirectory, "target.json");
  const planPath = resolve(options.artifactDirectory, "plan.json");
  const resultsPath = resolve(options.artifactDirectory, "results.json");
  const browserResultsPath = resolve(options.artifactDirectory, "browser-results.json");
  const browserEvidencePath = resolve(options.artifactDirectory, "browser-evidence.jsonl");
  const evidenceDirectory = resolve(options.artifactDirectory, "evidence");
  const websocketEndpoint = reserveWebSocketEndpoint();
  const manifest = createWireConformanceTargetManifest({
    targetName: BROWSER_WIRE_TARGET_NAME,
    suiteVersion: "0.1.0",
    modes: ["suite_as_server"],
    transports: [{ name: "websocket", endpoint: websocketEndpoint, tls: false }],
    capabilities: ["control.progress_partial", "control.credit_backpressure", "object.lifecycle"],
    maxFrameBytes: 16_777_216,
    maxInFlight: 256,
  });
  await Deno.writeTextFile(targetPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await buildBrowserBundle(resolve(browserDirectory, "target.js"));
  await buildRunner(options.conformanceRoot);
  await runCargo(options.conformanceRoot, [
    "wire-plan",
    "--suite",
    suitePath,
    "--target",
    targetPath,
    "--output",
    planPath,
    "--results-path",
    resultsPath,
    "--evidence-dir",
    evidenceDirectory,
  ]);
  validatePlanCoverage(manifest, JSON.parse(await Deno.readTextFile(planPath)));

  const browserExecutable = await resolveBrowserExecutable(options.browserExecutable);
  let resolveEnvelope: (value: BrowserWireEnvelope) => void = () => undefined;
  let rejectEnvelope: (error: Error) => void = () => undefined;
  const envelopePromise = new Promise<BrowserWireEnvelope>((resolvePromise, rejectPromise) => {
    resolveEnvelope = resolvePromise;
    rejectEnvelope = rejectPromise;
  });
  let resolveReady: () => void = () => undefined;
  const readyPromise = new Promise<void>((resolvePromise) => {
    resolveReady = resolvePromise;
  });
  const abortController = new AbortController();
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, signal: abortController.signal, onListen: () => undefined },
    (request) => serveBrowserRequest(request, siteDirectory, resolveReady, resolveEnvelope, rejectEnvelope),
  );
  const serverAddress = server.addr as Deno.NetAddr;
  const origin = `http://127.0.0.1:${serverAddress.port}`;
  const targetUrl = new URL("/", origin);
  targetUrl.searchParams.set("providerEndpoint", websocketEndpoint);
  targetUrl.searchParams.set("readyEndpoint", `${origin}/ready`);
  targetUrl.searchParams.set("reportEndpoint", `${origin}/report`);
  const browser = launchBrowser(
    browserExecutable,
    targetUrl.href,
    resolve(options.artifactDirectory, "chrome-profile"),
  );
  const browserOutput = browser.output();

  try {
    await withTimeout(
      Promise.race([
        readyPromise,
        envelopePromise.then((envelope) => {
          validateBrowserWireEnvelope(envelope);
          throw new Error(`browser wire target failed before readiness: ${envelope.report.results[0].message}`);
        }),
      ]),
      BROWSER_RESULT_TIMEOUT_MILLIS,
      "browser wire target readiness",
    );
    const [_, envelope] = await Promise.all([
      runCargo(options.conformanceRoot, [
        "wire-run",
        "--plan",
        planPath,
        "--target",
        targetPath,
        "--output",
        resultsPath,
      ]),
      withTimeout(envelopePromise, BROWSER_RESULT_TIMEOUT_MILLIS, "browser wire target result"),
    ]);
    validateBrowserWireEnvelope(envelope);
    await Deno.writeTextFile(browserResultsPath, `${JSON.stringify(envelope.report, null, 2)}\n`);
    await Deno.writeTextFile(browserEvidencePath, browserEvidenceJsonl(envelope));
    await runCargo(options.conformanceRoot, [
      "validate-wire-results",
      "--plan",
      planPath,
      "--results",
      resultsPath,
    ]);
    await runCargo(options.conformanceRoot, [
      "validate-wire-results",
      "--plan",
      planPath,
      "--results",
      browserResultsPath,
    ]);
    if (envelope.report.results[0].outcome !== "passed") {
      throw new Error(envelope.report.results[0].message);
    }
  } finally {
    abortController.abort();
    await server.finished.catch(() => undefined);
    try {
      browser.kill("SIGTERM");
    } catch {
      // Chrome may exit after the page completes; preserve the wire result.
    }
    const output = await browserOutput.catch(() => undefined);
    if (output !== undefined) {
      await Deno.writeFile(resolve(options.artifactDirectory, "browser-stdout.log"), output.stdout);
      await Deno.writeFile(resolve(options.artifactDirectory, "browser-stderr.log"), output.stderr);
    }
  }
}

async function serveBrowserRequest(
  request: Request,
  siteDirectory: string,
  resolveReady: () => void,
  resolveEnvelope: (value: BrowserWireEnvelope) => void,
  rejectEnvelope: (error: Error) => void,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/ready") {
    resolveReady();
    return new Response(null, { status: 204 });
  }
  if (request.method === "POST" && url.pathname === "/report") {
    try {
      const value: unknown = await request.json();
      validateBrowserWireEnvelope(value);
      resolveEnvelope(value);
      return new Response(null, { status: 204 });
    } catch (error) {
      rejectEnvelope(error instanceof Error ? error : new Error(String(error)));
      return new Response("invalid browser wire report", { status: 400 });
    }
  }
  if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
  if (url.pathname === "/") {
    return new Response(
      '<!doctype html><html><head><meta charset="utf-8"><title>NNRP browser wire target</title></head>' +
        '<body><main>NNRP browser wire target</main><script type="module" src="/browser/target.js"></script></body></html>',
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }
  const files: Readonly<Record<string, { readonly path: string; readonly contentType: string }>> = {
    "/browser/target.js": { path: resolve(siteDirectory, "browser/target.js"), contentType: "text/javascript" },
    "/wasm/nnrp_wasm.js": {
      path: resolve("packages/browser-client/wasm/nnrp_wasm.js"),
      contentType: "text/javascript",
    },
    "/wasm/nnrp_wasm_bg.wasm": {
      path: resolve("packages/browser-client/wasm/nnrp_wasm_bg.wasm"),
      contentType: "application/wasm",
    },
  };
  const file = files[url.pathname];
  if (file === undefined) return new Response("not found", { status: 404 });
  return new Response(await Deno.readFile(file.path), {
    headers: { "content-type": file.contentType, "cache-control": "no-store" },
  });
}

async function buildBrowserBundle(outputPath: string): Promise<void> {
  const entryPath = resolve(dirname(fileURLToPath(import.meta.url)), "run-browser-wire-target.ts");
  const status = await new Deno.Command("deno", {
    args: [
      "bundle",
      "--no-config",
      "--import-map",
      resolve(dirname(fileURLToPath(import.meta.url)), "browser-wire-import-map.json"),
      "--platform=browser",
      "--output",
      outputPath,
      entryPath,
    ],
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;
  if (!status.success) throw new Error(`browser wire target bundle failed with code ${status.code}`);
}

function launchBrowser(executable: string, url: string, profileDirectory: string): Deno.ChildProcess {
  return new Deno.Command(executable, {
    args: [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--enable-logging=stderr",
      `--user-data-dir=${profileDirectory}`,
      url,
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
}

async function removeDirectory(path: string): Promise<void> {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  await Deno.mkdir(path, { recursive: true });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMillis: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMillis} ms`)), timeoutMillis);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
