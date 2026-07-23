<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/native-client

Native client entrypoint for NNRP Node.js and Deno services, CLIs, coding agents, and scheduler-side callers.

This package exposes client/session APIs only. It does not export server construction APIs; server hosts should use
`@nnrp/native-server`.

```bash
npm install @nnrp/native-client @nnrp/transport-tcp
```

```ts
import { openNativeClient } from "@nnrp/native-client";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const client = await openNativeClient({
  endpoint: "nnrp://127.0.0.1:4433/session/default",
  transports: [createTcpTransportProvider()],
  transportPolicy: "auto",
});

const session = client.openSession({ inputProfile: "tool_delta" });
await session.submitNoWait({
  operationId: 1n,
  frameId: 1,
  payload: new TextEncoder().encode("summarize repository status"),
  inputProfile: "tool_delta",
  submitMode: "inline",
});

await session.close();
await client.close();
```

Install TCP, QUIC, IPC, or WebSocket provider packages independently. With several providers installed, the client
probes eligible candidates before selection. The package also exposes Preview4 cancellation, deadline, priority,
progress, partial-result, runtime-object, cache-reference, and event APIs without exposing native handles.

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/native-client
