<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/native-server

Native server entrypoint for NNRP Node.js and Deno adapter processes.

This package exposes server/listen/session receive APIs only. Client callers should use `@nnrp/native-client`.

```ts
import { openBackendRuntime } from "@nnrp/native-server";
import { createQuicTransportProvider } from "@nnrp/transport-quic";

const runtime = await openBackendRuntime({
  nativeLibrary: { artifactDir: "./native" },
  transports: [createQuicTransportProvider()],
  transportPolicy: "score",
});

const server = runtime.listen({ endpoint: "0.0.0.0:4433" });
const session = await server.accept();
const event = await session.receive();

if (event.type === "result-hint") {
  await session.sendResult({ frameId: event.hint.frameId, payload: new Uint8Array() });
}

await server.close();
await runtime.close();
```

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/native-server
