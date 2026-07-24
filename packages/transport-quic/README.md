<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/transport-quic

QUIC transport adapter for NNRP native clients and servers.

Install this package when a Node.js or Deno native runtime should consider QUIC during transport probing. The package
carries the supported native transport artifacts; role packages do not bundle QUIC artifacts on its behalf. Browser WASM
output belongs to `@nnrp/browser-client`.

```bash
npm install @nnrp/transport-quic
```

```ts
import { createQuicTransportProvider } from "@nnrp/transport-quic";

const quic = createQuicTransportProvider({ preferenceRank: 0 });
```

The provider owns probe, connect, listen, packet batching, timeout, backpressure, and close behavior through its
package-owned Rust QUIC libraries. It contains no role implementation or browser WASM.

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/transport-quic
