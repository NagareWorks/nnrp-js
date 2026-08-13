import { NnrpEndpoint as FrozenNnrpEndpoint, NnrpProviderEndpoint as FrozenNnrpProviderEndpoint } from "@nnrp/core";
import { NnrpWasmBindingUnavailableError, openBrowserRuntime } from "@nnrp/browser-client";
import { createTokenSubmitRequest, NNRP_DEFAULT_SUBMIT_HEADER, NNRP_DEFAULT_SUBMIT_POLICY } from "@nnrp/core";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";

const runtime = await openBrowserRuntime({
  moduleUrl: "/assets/nnrp_wasm_bg.wasm",
  transportProviders: [createWebSocketTransportProvider()],
  transportPolicy: "auto",
});

const client = runtime.connect({
  endpoint: FrozenNnrpEndpoint.parse("nnrps://nnrp.example.test/session"),
  providerRoutes: {
    websocket: { endpoint: FrozenNnrpProviderEndpoint.parse("wss://nnrp.example.test/nnrp") },
  },
});

const session = await client.openSession();

try {
  const result = await session.submit(createTokenSubmitRequest({
    identity: { operationId: 1n, frameId: 1, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload: new TextEncoder().encode("hello") }],
  }));

  console.log("NNRP browser result", result.operationId, result.terminalState);
} catch (error) {
  if (error instanceof NnrpWasmBindingUnavailableError) {
    console.log("WASM runtime is not instantiated yet:", error.diagnostic.code);
  } else {
    throw error;
  }
} finally {
  await session.close();
  await client.close();
  await runtime.close();
}
