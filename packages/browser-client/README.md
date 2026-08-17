<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/browser-client

Browser and edge client entrypoint for NNRP.

The package exposes browser client/session APIs and browser transport provider slots. It owns the single bundled
`nnrp-wasm-browser` runtime artifact; `moduleUrl` and injected `WebAssembly.Module` values explicitly override that
default for controlled deployments.

```bash
npm install @nnrp/browser-client @nnrp/transport-websocket
```

```ts
import {
  createTypedPayloadSubmitRequest,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  NnrpEndpoint,
  NnrpPayloadKind,
  NnrpProviderEndpoint,
} from "@nnrp/core";
import { openBrowserRuntime } from "@nnrp/browser-client";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";

const runtime = await openBrowserRuntime({
  transportProviders: [createWebSocketTransportProvider()],
});

const client = runtime.connect({
  endpoint: NnrpEndpoint.parse("nnrps://example.test/session/default"),
  providerRoutes: { websocket: { endpoint: NnrpProviderEndpoint.parse("wss://example.test/nnrp") } },
});
const session = await client.openSession();

await session.submit(createTypedPayloadSubmitRequest({
  identity: { operationId: 1n, frameId: 1, header: NNRP_DEFAULT_SUBMIT_HEADER },
  policy: NNRP_DEFAULT_SUBMIT_POLICY,
  frames: [{
    profileId: 4,
    payloadKind: NnrpPayloadKind.StructuredEvent,
    payload: new TextEncoder().encode("hello"),
  }],
}));

await session.close();
await client.close();
await runtime.close();
```

The browser client mirrors the native client control, object, cache, and event concepts. It exports no server API and
loads no `.dll`, `.so`, or `.dylib`. One browser carrier connection can own multiple protocol sessions; session open and
resume remain Rust WASM operations, and recovery tickets stay opaque to application code.

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/browser-client
