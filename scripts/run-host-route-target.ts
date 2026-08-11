import {
  createTokenSubmitRequest,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  type NnrpClientProviderRoutes,
  NnrpMessageType,
  type NnrpServerProviderRoutes,
  type NnrpTransportClientSecurity,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportKind,
  type NnrpTransportPolicy,
  NnrpTransportSelectionError,
  type NnrpTransportServer,
  type NnrpTransportServerSecurity,
} from "@nnrp/core";
import { type NnrpNativeTransportProvider as NnrpClientTransportProvider, openNativeClient } from "@nnrp/native-client";
import {
  type NnrpNativeTransportProvider as NnrpServerTransportProvider,
  openBackendRuntime,
} from "@nnrp/native-server";
import { createIpcTransportProvider } from "@nnrp/transport-ipc";
import { createQuicTransportProvider } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import { createHash, X509Certificate } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserExecutable } from "./browser-wire-runtime.ts";
import {
  createClientRouteEvidence,
  createRollbackEvidence,
  createServerRouteEvidence,
  createSuccessfulClientRouteEvidence,
  HOST_ROUTE_PROTOCOL_VERSION,
  HOST_ROUTE_READY_SCHEMA,
  HOST_ROUTE_RESULT_SCHEMA,
  type HostProviderRoute,
  type HostRouteCaseResult,
  type HostRouteFixture,
  type HostRouteScenario,
  hostRouteTimeoutMillis,
  injectedFailures,
  passedHostRouteResult,
  validateHostRouteScenario,
} from "./host-route-conformance.ts";
import { receiveServerRuntimeEvent } from "./server-event-helpers.ts";

type HostTransportProvider = NnrpClientTransportProvider & NnrpServerTransportProvider;

interface TargetOptions {
  readonly scenario: string;
  readonly resolvedScenario: string;
  readonly output: string;
  readonly readyOutput: string;
  readonly artifacts: string;
  readonly suiteVersion: string;
  readonly targetName: string;
}

const SERVER_ROLE_ADOPT = Symbol.for("nnrp.internal.native.server-role-adopt.v1");
const CLIENT_ACCEPT_OBSERVATION_MILLISECONDS = 250;
const SERVER_CLOSE_FALLBACK_MILLISECONDS = 2_000;
const BROWSER_RESULT_TIMEOUT_MILLISECONDS = 15_000;
const BROWSER_OUTPUT_DRAIN_TIMEOUT_MILLISECONDS = 1_000;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OFFICIAL_PROVIDER_IDS: Readonly<Record<NnrpTransportKind, string>> = {
  tcp: "nnrp.transport.tcp.native",
  quic: "nnrp.transport.quic.native",
  ipc: "nnrp.transport.ipc.native",
  websocket: "nnrp.transport.websocket.native",
};

if (import.meta.main) {
  await main(parseOptions(Deno.args));
  Deno.exit(0);
}

export async function main(options: TargetOptions): Promise<void> {
  const scenario = validateHostRouteScenario(JSON.parse(await Deno.readTextFile(options.scenario)));
  let result: HostRouteCaseResult;
  try {
    const resolvedScenario = validateHostRouteScenario(JSON.parse(await Deno.readTextFile(options.resolvedScenario)));
    result = await runCase(scenario, resolvedScenario, options);
  } catch (error) {
    result = {
      id: scenario.id,
      outcome: "failed",
      terminal: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  await writeJson(options.output, {
    $schema: HOST_ROUTE_RESULT_SCHEMA,
    protocol_version: HOST_ROUTE_PROTOCOL_VERSION,
    suite_version: options.suiteVersion,
    target_name: options.targetName,
    results: [result],
  });
}

async function runCase(
  scenario: HostRouteScenario,
  resolvedScenario: HostRouteScenario,
  options: TargetOptions,
): Promise<HostRouteCaseResult> {
  if (scenario.id !== resolvedScenario.id) throw new Error("Resolved host-route scenario changes the scenario id.");
  const fixture = scenario.host_route;
  const resolvedFixture = resolvedScenario.host_route;
  const identities = fixture.routes.map((route) => [route.transport, route.provider_id].join("\0"));
  const resolvedIdentities = resolvedFixture.routes.map((route) => [route.transport, route.provider_id].join("\0"));
  if (identities.join("\n") !== resolvedIdentities.join("\n")) {
    throw new Error("Resolved host-route scenario changes provider identities.");
  }
  if (fixture.platform === "browser") return await runBrowserClientCase(scenario, resolvedScenario, options);
  if (fixture.role === "client") return await runClientCase(scenario, fixture, resolvedFixture, options.artifacts);
  return await runServerCase(scenario, fixture, resolvedFixture, options);
}

async function runBrowserClientCase(
  scenario: HostRouteScenario,
  resolvedScenario: HostRouteScenario,
  options: TargetOptions,
): Promise<HostRouteCaseResult> {
  if (scenario.host_route.role !== "client") throw new Error("Browser host-route target cannot host a server role.");
  const browserDirectory = resolve(options.artifacts, "browser-host-route");
  await Deno.mkdir(browserDirectory, { recursive: true });
  const bundlePath = resolve(browserDirectory, "target.js");
  await buildBrowserHostRouteBundle(bundlePath);

  let resolveResult: (result: HostRouteCaseResult) => void = () => undefined;
  let rejectResult: (error: Error) => void = () => undefined;
  const resultPromise = new Promise<HostRouteCaseResult>((resolvePromise, rejectPromise) => {
    resolveResult = resolvePromise;
    rejectResult = rejectPromise;
  });
  const abortController = new AbortController();
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, signal: abortController.signal, onListen: () => undefined },
    async (request) => {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/report") {
        try {
          resolveResult(validateBrowserResult(await request.json(), scenario.id));
          return new Response(null, { status: 204 });
        } catch (error) {
          rejectResult(error instanceof Error ? error : new Error(String(error)));
          return new Response("invalid browser host-route report", { status: 400 });
        }
      }
      if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
      if (url.pathname === "/") {
        return new Response(
          '<!doctype html><html><head><meta charset="utf-8"><title>NNRP browser host route</title></head>' +
            '<body><main>NNRP browser host route</main><script type="module" src="/target.js"></script></body></html>',
          { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
        );
      }
      if (url.pathname === "/scenario") return jsonResponse(scenario);
      if (url.pathname === "/resolved-scenario") return jsonResponse(resolvedScenario);
      const files: Readonly<Record<string, { readonly path: string; readonly contentType: string }>> = {
        "/target.js": { path: bundlePath, contentType: "text/javascript" },
        "/wasm/nnrp_wasm.js": {
          path: resolve(REPOSITORY_ROOT, "packages/browser-client/wasm/nnrp_wasm.js"),
          contentType: "text/javascript",
        },
        "/wasm/nnrp_wasm_bg.wasm": {
          path: resolve(REPOSITORY_ROOT, "packages/browser-client/wasm/nnrp_wasm_bg.wasm"),
          contentType: "application/wasm",
        },
      };
      const file = files[url.pathname];
      if (file === undefined) return new Response("not found", { status: 404 });
      return new Response(await Deno.readFile(file.path), {
        headers: { "content-type": file.contentType, "cache-control": "no-store" },
      });
    },
  );
  const address = server.addr as Deno.NetAddr;
  const origin = `http://127.0.0.1:${address.port}`;
  const targetUrl = new URL("/", origin);
  targetUrl.searchParams.set("scenarioId", scenario.id);
  targetUrl.searchParams.set("scenario", `${origin}/scenario`);
  targetUrl.searchParams.set("resolvedScenario", `${origin}/resolved-scenario`);
  targetUrl.searchParams.set("report", `${origin}/report`);
  const browserExecutable = await resolveBrowserExecutable(Deno.env.get("NNRP_BROWSER_EXECUTABLE"));
  const spkiPin = certificateSpkiPin(await Deno.readFile(resolve(options.artifacts, "server.der")));
  const browser = launchBrowser(
    browserExecutable,
    targetUrl.href,
    resolve(browserDirectory, "chrome-profile"),
    spkiPin,
  );
  const browserOutput = browser.output();
  try {
    return await withTimeout(resultPromise, BROWSER_RESULT_TIMEOUT_MILLISECONDS, "browser host-route result");
  } finally {
    abortController.abort();
    await server.finished.catch(() => undefined);
    await terminateBrowserTree(browser);
    const output = await withTimeout(
      browserOutput,
      BROWSER_OUTPUT_DRAIN_TIMEOUT_MILLISECONDS,
      "browser host-route output drain",
    ).catch(() => undefined);
    if (output !== undefined) {
      await Deno.writeFile(resolve(browserDirectory, "stdout.log"), output.stdout);
      await Deno.writeFile(resolve(browserDirectory, "stderr.log"), output.stderr);
    }
  }
}

export function browserTreeTerminationCommand(pid: number): readonly [string, ...string[]] {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Browser process id must be a positive safe integer.");
  return ["taskkill", "/PID", String(pid), "/T", "/F"];
}

async function terminateBrowserTree(browser: Deno.ChildProcess): Promise<void> {
  if (Deno.build.os === "windows") {
    const [command, ...args] = browserTreeTerminationCommand(browser.pid);
    const status = await new Deno.Command(command, {
      args,
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).spawn().status.catch(() => undefined);
    if (status?.success) return;
  }
  try {
    browser.kill("SIGKILL");
  } catch {
    // The page may close after publishing its result.
  }
}

async function buildBrowserHostRouteBundle(outputPath: string): Promise<void> {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const status = await new Deno.Command("deno", {
    args: [
      "bundle",
      "--no-config",
      "--import-map",
      resolve(scriptDirectory, "browser-wire-import-map.json"),
      "--platform=browser",
      "--output",
      outputPath,
      resolve(scriptDirectory, "run-browser-host-route-target.ts"),
    ],
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;
  if (!status.success) throw new Error(`browser host-route target bundle failed with code ${status.code}`);
}

export function validateBrowserResult(value: unknown, scenarioId: string): HostRouteCaseResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Browser host-route result must be an object.");
  }
  const result = value as Record<string, unknown>;
  if (result.id !== scenarioId) throw new Error("Browser host-route result changes the scenario id.");
  if (result.outcome !== "passed" && result.outcome !== "failed") {
    throw new Error("Browser host-route result has an invalid outcome.");
  }
  if (result.terminal !== "success" && result.terminal !== "error") {
    throw new Error("Browser host-route result has an invalid terminal state.");
  }
  if (typeof result.message !== "string" || result.message.length === 0) {
    throw new Error("Browser host-route result must include a message.");
  }
  return value as HostRouteCaseResult;
}

function jsonResponse(value: unknown): Response {
  return new Response(`${JSON.stringify(value)}\n`, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function certificateSpkiPin(certificateDer: Uint8Array): string {
  const certificate = new X509Certificate(certificateDer);
  const subjectPublicKeyInfo = certificate.publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(subjectPublicKeyInfo).digest("base64");
}

function launchBrowser(
  executable: string,
  url: string,
  profileDirectory: string,
  certificatePin: string,
): Deno.ChildProcess {
  return new Deno.Command(executable, {
    args: [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--enable-logging=stderr",
      `--ignore-certificate-errors-spki-list=${certificatePin}`,
      `--user-data-dir=${profileDirectory}`,
      url,
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
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

async function runClientCase(
  scenario: HostRouteScenario,
  fixture: HostRouteFixture,
  resolvedFixture: HostRouteFixture,
  artifacts: string,
): Promise<HostRouteCaseResult> {
  const providerRoutes: Partial<Record<NnrpTransportKind, NnrpClientProviderRoutes[NnrpTransportKind]>> = {};
  const selectedProviderIds: string[] = [];
  const providers = await Promise.all(fixture.routes.map(async (route, index) => {
    const security = await clientSecurity(route, artifacts);
    providerRoutes[route.transport] = {
      endpoint: clientLocator(route, resolvedFixture.routes[index]!),
      ...(security === undefined ? {} : { security }),
    };
    return observeClientSelection(providerForRoute(route), selectedProviderIds);
  }));
  const policy = clientPolicy(fixture.routes);
  try {
    const client = await openNativeClient({
      endpoint: fixture.application_endpoint,
      providerRoutes: providerRoutes as NnrpClientProviderRoutes,
      transports: providers,
      transportPolicy: policy,
    });
    try {
      const session = await client.openSession();
      await session.submitNoWait(createTokenSubmitRequest({
        identity: { operationId: 1n, frameId: 1, header: NNRP_DEFAULT_SUBMIT_HEADER },
        policy: NNRP_DEFAULT_SUBMIT_POLICY,
        chunks: [{ payload: new Uint8Array() }],
      })).catch(() => undefined);
      // The conformance peer accepts concurrently and records the real carrier.
      // Keep the selected connection alive long enough for that independent
      // observation before closing the SDK host.
      await delay(CLIENT_ACCEPT_OBSERVATION_MILLISECONDS);
    } finally {
      await client.close().catch(() => undefined);
    }
    if (selectedProviderIds.length !== 1) {
      throw new Error(`Expected exactly one selected provider, observed ${selectedProviderIds.length}.`);
    }
    return passedHostRouteResult(
      scenario,
      "success",
      createSuccessfulClientRouteEvidence(fixture, selectedProviderIds[0]!),
    );
  } catch (error) {
    if (!(error instanceof NnrpTransportSelectionError) || error.selection === undefined) throw error;
    return passedHostRouteResult(
      scenario,
      "error",
      createClientRouteEvidence(fixture, error.selection.candidates),
      error.message,
    );
  }
}

async function runServerCase(
  scenario: HostRouteScenario,
  fixture: HostRouteFixture,
  resolvedFixture: HostRouteFixture,
  options: TargetOptions,
): Promise<HostRouteCaseResult> {
  const providerRoutes: Partial<Record<NnrpTransportKind, NnrpServerProviderRoutes[NnrpTransportKind]>> = {};
  let bindFailure = false;
  let terminalProvider: string | undefined;
  const providers = await Promise.all(fixture.routes.map(async (route, index) => {
    const security = await serverSecurity(route, options.artifacts);
    providerRoutes[route.transport] = {
      endpoint: providerRouteLocator(route, resolvedFixture.routes[index]!),
      ...(security === undefined ? {} : { security }),
    };
    let provider = providerForRoute(route);
    if (injectedFailures(route).has("bind_failure")) {
      provider = injectBindFailure(provider);
      bindFailure = true;
    } else if (injectedFailures(route).has("terminal_listener_failure")) {
      provider = injectTerminalListenerFailure(provider, route.provider_id);
      terminalProvider = route.provider_id;
    }
    return provider;
  }));
  const runtime = await openBackendRuntime({ transports: providers, transportPolicy: serverPolicy(fixture.routes) });
  const server = runtime.listen({
    endpoint: fixture.application_endpoint,
    providerRoutes: providerRoutes as NnrpServerProviderRoutes,
    transports: providers,
    transportPolicy: serverPolicy(fixture.routes),
  });
  const firstAccept = server.accept().then(
    (session) => ({ session } as const),
    (error: unknown) => ({ error } as const),
  );
  try {
    if (bindFailure) {
      const outcome = await firstAccept;
      if ("session" in outcome) {
        await outcome.session.close();
        throw new Error("Injected listener bind failure unexpectedly accepted a session.");
      }
      return passedHostRouteResult(
        scenario,
        "error",
        createRollbackEvidence(fixture),
        `Listener bind failed and prior listeners rolled back: ${
          outcome.error instanceof Error ? outcome.error.message : String(outcome.error)
        }`,
      );
    }
    if (terminalProvider !== undefined) {
      const outcome = await firstAccept;
      if ("session" in outcome) {
        await outcome.session.close();
        throw new Error("Injected terminal listener failure unexpectedly accepted a session.");
      }
      return passedHostRouteResult(
        scenario,
        "error",
        createServerRouteEvidence(fixture, server.boundProviderEndpoints, [], "closed", {
          logicalSetClosed: true,
          terminalFailure: terminalProvider,
        }),
        outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
      );
    }
    const bound = await Promise.race([
      waitForBoundEndpoints(() => server.boundProviderEndpoints, fixture.routes.length),
      firstAccept.then((outcome): never => {
        if ("error" in outcome) throw outcome.error;
        throw new Error("Server accepted a session before publishing its bound provider endpoints.");
      }),
    ]);
    await writeReadyReport(scenario, fixture, bound, options.readyOutput);
    const accepted: NnrpTransportKind[] = [];
    const sessions = [];
    for (let index = 0; index < fixture.routes.length; index += 1) {
      const outcome = index === 0 ? await firstAccept : await server.accept().then(
        (session) => ({ session } as const),
        (error: unknown) => ({ error } as const),
      );
      if ("error" in outcome) throw outcome.error;
      const session = outcome.session;
      accepted.push(session.activeTransport);
      sessions.push(session);
    }
    await Promise.all(sessions.map(async (session) => {
      const event = await receiveServerRuntimeEvent(
        session,
        hostRouteTimeoutMillis(scenario, SERVER_CLOSE_FALLBACK_MILLISECONDS),
      );
      if (event.header.messageType !== NnrpMessageType.SessionClose) {
        throw new Error(`Expected peer close, received message ${event.header.messageType}.`);
      }
      await session.close();
    }));
    return passedHostRouteResult(
      scenario,
      "success",
      createServerRouteEvidence(fixture, bound, accepted, "accepted"),
    );
  } finally {
    await server.close().catch(() => undefined);
    await runtime.close().catch(() => undefined);
  }
}

function providerForRoute(route: HostProviderRoute): HostTransportProvider {
  if (route.provider_id === "example.transport.quic.uninstalled") {
    const provider = createQuicTransportProvider({ available: false });
    return {
      ...provider,
      metadata: { ...provider.metadata, id: route.provider_id },
    } as HostTransportProvider;
  }
  if (OFFICIAL_PROVIDER_IDS[route.transport] !== route.provider_id) {
    throw new Error(`Unsupported JavaScript host-route provider: ${route.provider_id}.`);
  }
  switch (route.transport) {
    case "tcp":
      return createTcpTransportProvider() as HostTransportProvider;
    case "quic":
      return createQuicTransportProvider() as HostTransportProvider;
    case "ipc":
      return createIpcTransportProvider() as HostTransportProvider;
    case "websocket":
      return createWebSocketTransportProvider() as HostTransportProvider;
  }
}

function observeClientSelection(
  provider: HostTransportProvider,
  selectedProviderIds: string[],
): HostTransportProvider {
  return {
    ...provider,
    connect: async (options: NnrpTransportEndpoint): Promise<NnrpTransportConnection> => {
      const connection = await provider.connect(options);
      selectedProviderIds.push(provider.metadata.id);
      return connection;
    },
  };
}

function injectBindFailure(provider: HostTransportProvider): HostTransportProvider {
  return {
    ...provider,
    listen: () =>
      Promise.reject(
        new NnrpTransportError({
          code: "NNRP_HOST_ROUTE_INJECTED_BIND_FAILURE",
          message: `Injected bind failure for ${provider.metadata.id}.`,
          source: "transport",
          retryable: false,
          transport: provider.kind,
        }),
      ),
  };
}

function injectTerminalListenerFailure(
  provider: HostTransportProvider,
  providerId: string,
): HostTransportProvider {
  return {
    ...provider,
    listen: async (options: NnrpTransportEndpoint): Promise<NnrpTransportServer> => {
      const listener = await provider.listen(options);
      const adoption = (listener as NnrpTransportServer & Record<symbol, unknown>)[SERVER_ROLE_ADOPT];
      if (typeof adoption !== "function") throw new Error(`${providerId} omitted server role adoption.`);
      return {
        kind: listener.kind,
        endpoint: listener.endpoint,
        listening: listener.listening,
        accept: (acceptOptions) => listener.accept(acceptOptions),
        close: () => listener.close(),
        [SERVER_ROLE_ADOPT]: async (...args: unknown[]) => {
          const role = await adoption.call(listener, ...args) as { close(): Promise<void> };
          return {
            accept: () => Promise.reject(new Error(`Injected terminal listener failure for ${providerId}.`)),
            close: () => role.close(),
          };
        },
      } as NnrpTransportServer;
    },
  };
}

export function clientLocator(route: HostProviderRoute, resolved: HostProviderRoute): string {
  if (injectedFailures(route).has("route_unresolved")) {
    return route.transport === "ipc" ? "tcp://127.0.0.1:9" : "unix:///nnrp-route-unresolved";
  }
  if (injectedFailures(route).has("security_incompatible")) {
    switch (route.transport) {
      case "tcp":
      case "quic":
        return "127.0.0.1:9";
      case "ipc":
        return Deno.build.os === "windows"
          ? "npipe://nnrp-security-incompatible"
          : "unix:///tmp/nnrp-security-incompatible";
      case "websocket":
        return "ws://127.0.0.1:9/nnrp";
    }
  }
  return providerRouteLocator(route, resolved);
}

export function providerRouteLocator(route: HostProviderRoute, resolved: HostProviderRoute): string {
  if (route.transport === "tcp" || route.transport === "quic") {
    return resolved.locator.replace(new RegExp(`^${route.transport}://`), "");
  }
  return resolved.locator;
}

async function clientSecurity(
  route: HostProviderRoute,
  artifacts: string,
): Promise<NnrpTransportClientSecurity | undefined> {
  if (injectedFailures(route).has("security_incompatible")) return undefined;
  if (["tls_server_auth", "mutual_tls", "wss"].includes(route.security.mode)) {
    return {
      mode: "client",
      serverName: "localhost",
      trustedCertificateDer: await Deno.readFile(resolve(artifacts, "server.der")),
    };
  }
  return undefined;
}

async function serverSecurity(
  route: HostProviderRoute,
  artifacts: string,
): Promise<NnrpTransportServerSecurity | undefined> {
  if (["tls_server_auth", "mutual_tls", "wss"].includes(route.security.mode)) {
    return {
      mode: "server",
      certificateDer: await Deno.readFile(resolve(artifacts, "server.der")),
      privateKeyPkcs8Der: await Deno.readFile(resolve(artifacts, "server-key.der")),
    };
  }
  return undefined;
}

function clientPolicy(routes: readonly HostProviderRoute[]): NnrpTransportPolicy {
  return routes.length === 1 ? `force-${routes[0]!.transport}` : "auto";
}

export function serverPolicy(routes: readonly HostProviderRoute[]): NnrpTransportPolicy {
  const terminal = routes.find((route) => injectedFailures(route).has("terminal_listener_failure"));
  if (terminal !== undefined) return `prefer-${terminal.transport}`;
  const opened = routes.find((route) => !injectedFailures(route).has("bind_failure"));
  return routes.some((route) => injectedFailures(route).has("bind_failure")) && opened !== undefined
    ? `prefer-${opened.transport}`
    : "auto";
}

async function waitForBoundEndpoints(
  readEndpoints: () => Readonly<Partial<Record<NnrpTransportKind, string>>>,
  expected: number,
): Promise<Readonly<Partial<Record<NnrpTransportKind, string>>>> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const endpoints = readEndpoints();
    if (Object.keys(endpoints).length === expected) return endpoints;
    await delay(10);
  }
  throw new Error(`Server exposed ${Object.keys(readEndpoints()).length}/${expected} bound provider endpoints.`);
}

async function writeReadyReport(
  scenario: HostRouteScenario,
  fixture: HostRouteFixture,
  endpoints: Readonly<Partial<Record<NnrpTransportKind, string>>>,
  path: string,
): Promise<void> {
  await writeJsonAtomic(path, {
    $schema: HOST_ROUTE_READY_SCHEMA,
    protocol_version: HOST_ROUTE_PROTOCOL_VERSION,
    scenario_id: scenario.id,
    listeners: fixture.routes.map((route) => ({
      transport: route.transport,
      provider_id: route.provider_id,
      bound_endpoint: endpoints[route.transport],
    })),
  });
}

function parseOptions(args: readonly string[]): TargetOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("Invalid host-route target arguments.");
    }
    values.set(key.slice(2), value);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (value === undefined || value.length === 0) throw new Error(`Missing --${key}.`);
    return value;
  };
  return {
    scenario: required("scenario"),
    resolvedScenario: required("resolved-scenario"),
    output: required("output"),
    readyOutput: required("ready-output"),
    artifacts: required("artifacts"),
    suiteVersion: required("suite-version"),
    targetName: required("target-name"),
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await Deno.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${Deno.pid}.tmp`;
  await Deno.writeTextFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await Deno.rename(temporary, path);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
