<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/native-client

Native client entrypoint for NNRP Node.js and Deno services, CLIs, coding agents, and scheduler-side callers.

This package exposes client/session APIs only. It does not export server construction APIs; server hosts should use
`@nnrp/native-server`.

```ts
import { openNativeClient } from "@nnrp/native-client";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const client = await openNativeClient({
  endpoint: "127.0.0.1:4433",
  nativeLibrary: { artifactDir: "./native" },
  transports: [createTcpTransportProvider()],
  transportPolicy: "score",
});

const session = client.openSession({ inputProfile: "tool_delta" });
await session.submitNoWait({
  frameId: 1,
  payload: new TextEncoder().encode("summarize repository status"),
  inputProfile: "tool_delta",
});

await session.close();
await client.close();
```

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/native-client
