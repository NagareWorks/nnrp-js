<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/native-server

Native server entrypoint for NNRP Node.js and Deno adapter processes.

This package exposes server/listen/session receive APIs only. Client callers should use `@nnrp/native-client`.

```bash
npm install @nnrp/native-server @nnrp/transport-tcp
```

```ts
import { openBackendRuntime } from "@nnrp/native-server";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const runtime = await openBackendRuntime({
  transports: [createTcpTransportProvider()],
  transportPolicy: "force-tcp",
});

const server = runtime.listen({ endpoint: "nnrp://0.0.0.0:4433/session/default" });
const session = await server.accept();
const event = await session.receive();

if (event.type === "submit") {
  await session.sendResult({ frameId: event.submit.frameId, payload: new Uint8Array() });
}

await server.close();
await runtime.close();
```

The server-only surface owns listener/accept lifecycle, final results, progress, partial results, backpressure, credit
updates, diagnostics, runtime objects, and cache-reference responses. Transport packages own carrier listeners and their
native artifacts.

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/native-server
