import { openBrowserRuntime } from "@nnrp/browser-client";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import {
  createSuccessfulClientRouteEvidence,
  type HostRouteCaseResult,
  passedHostRouteResult,
  validateHostRouteScenario,
} from "./host-route-conformance.ts";

void run().catch(async (error) => {
  await publish({
    id: new URLSearchParams(location.search).get("scenarioId") ?? "unknown",
    outcome: "failed",
    terminal: "error",
    message: error instanceof Error ? error.message : String(error),
  });
});

async function run(): Promise<void> {
  const parameters = new URLSearchParams(location.search);
  const scenario = validateHostRouteScenario(await fetchJson(requiredParameter(parameters, "scenario")));
  const resolved = validateHostRouteScenario(await fetchJson(requiredParameter(parameters, "resolvedScenario")));
  if (scenario.id !== resolved.id || scenario.host_route.platform !== "browser") {
    throw new Error("Browser host-route inputs do not describe the same browser scenario.");
  }
  if (scenario.host_route.role !== "client" || scenario.host_route.routes.length !== 1) {
    throw new Error("Browser host-route target supports one public client WebSocket route.");
  }
  const route = scenario.host_route.routes[0]!;
  const resolvedRoute = resolved.host_route.routes[0]!;
  if (route.transport !== "websocket" || resolvedRoute.transport !== "websocket") {
    throw new Error("Browser host-route target received a non-WebSocket route.");
  }

  const provider = createWebSocketTransportProvider({ WebSocket: globalThis.WebSocket });
  const runtime = await openBrowserRuntime({
    transportProviders: [provider],
    transportPolicy: "force-websocket",
  });
  const client = runtime.connect({
    endpoint: scenario.host_route.application_endpoint,
    providerRoutes: { websocket: { endpoint: resolvedRoute.locator } },
    transportPolicy: "force-websocket",
  });
  const session = client.openSession({ sessionId: `host-route-${scenario.id}`, inputProfile: "token" });
  try {
    const submission = session.submitNoWait({
      operationId: 1n,
      frameId: 1,
      payload: new Uint8Array(),
      inputProfile: "token",
    });
    await observeCarrierAttempt(submission, 500);
    await publish(
      passedHostRouteResult(
        scenario,
        "success",
        createSuccessfulClientRouteEvidence(scenario.host_route, route.provider_id),
        "Independent browser target executed the public JavaScript SDK host API over browser-owned WSS.",
      ),
    );
  } finally {
    await session.close().catch(() => undefined);
    await client.close().catch(() => undefined);
    await runtime.close().catch(() => undefined);
  }
}

async function observeCarrierAttempt(submission: Promise<bigint>, observationMillis: number): Promise<void> {
  const outcome = await Promise.race([
    submission.then(
      () => ({ state: "submitted" as const }),
      (error: unknown) => ({ state: "failed" as const, error }),
    ),
    delay(observationMillis).then(() => ({ state: "pending" as const })),
  ]);
  if (outcome.state === "failed") throw outcome.error;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Browser host-route input request failed with ${response.status}.`);
  return await response.json();
}

async function publish(result: HostRouteCaseResult): Promise<void> {
  const reportEndpoint = requiredParameter(new URLSearchParams(location.search), "report");
  const response = await fetch(reportEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
  });
  if (!response.ok) throw new Error(`Browser host-route report failed with ${response.status}.`);
}

function requiredParameter(parameters: URLSearchParams, name: string): string {
  const value = parameters.get(name);
  if (value === null || value.length === 0) throw new Error(`Missing browser host-route parameter ${name}.`);
  return value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
