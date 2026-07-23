<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/transport-websocket

WebSocket carrier provider for native NNRP roles and browser clients.

```bash
npm install @nnrp/transport-websocket
```

Node.js and Deno load the package-owned Rust WebSocket libraries for probe, connect, listen, packet batching, timeout,
backpressure, and close behavior. Browsers use the host `WebSocket` for connect/send/receive/close and the WASM runtime
owned by `@nnrp/browser-client`; this package does not duplicate the WASM artifact.

```ts
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";

const websocket = createWebSocketTransportProvider();
const connection = await websocket.connect({ endpoint: "wss://example.test/nnrp" });

await connection.send(new Uint8Array([1, 2, 3]));
await connection.close();
```

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/transport-websocket
