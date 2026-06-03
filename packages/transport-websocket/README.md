![NNRP](https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg)

# @nnrp/transport-websocket

WebSocket transport provider for NNRP browser clients.

Install this package when a browser runtime should own WebSocket connect, send, close, and probe behavior through a
transport package.

```ts
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";

const websocket = createWebSocketTransportProvider();
const connection = await websocket.connect({ endpoint: "wss://example.test/nnrp" });

connection.send(new Uint8Array([1, 2, 3]));
connection.close();
```

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/transport-websocket
