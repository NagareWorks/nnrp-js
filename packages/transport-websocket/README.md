![NNRP](https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg)

# @nnrp/transport-websocket

WebSocket transport adapter descriptors for NNRP browser clients.

Install this package when a browser runtime should consider WebSocket during transport probing.

```ts
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";

const websocket = createWebSocketTransportProvider({ endpointScheme: "wss" });
```

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/transport-websocket
