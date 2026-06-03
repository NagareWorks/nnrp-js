![NNRP](https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg)

# @nnrp/transport-quic

QUIC transport adapter for NNRP native clients and servers.

Install this package when a Node.js or Deno native runtime should consider QUIC during transport probing. The package
carries the supported native and WASM transport artifacts; role packages do not bundle QUIC artifacts on its behalf.

```ts
import { createQuicTransportProvider } from "@nnrp/transport-quic";

const quic = createQuicTransportProvider({ score: 90 });
```

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/transport-quic
