<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/browser-client

Browser and edge client entrypoint for NNRP.

The package exposes browser client/session APIs and browser transport provider slots. WASM primitives are an
implementation detail supplied by URL, `WebAssembly.Module`, or a future asset policy.

```ts
import { openBrowserRuntime } from "@nnrp/browser-client";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";

const runtime = await openBrowserRuntime({
  moduleUrl: "/assets/nnrp_wasm.wasm",
  transportProviders: [createWebSocketTransportProvider()],
});

const client = await runtime.connect({ endpoint: "wss://example.test/nnrp" });
const session = client.openSession({ inputProfile: "structured_event" });

await session.submitNoWait({
  frameId: 1,
  payload: new TextEncoder().encode("hello"),
  inputProfile: "structured_event",
});
```

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/browser-client
