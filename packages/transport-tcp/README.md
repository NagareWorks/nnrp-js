<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/transport-tcp

TCP transport adapter for NNRP native clients and servers.

Install this package when a Node.js or Deno native runtime should consider TCP during transport probing. The package
carries the supported native transport artifacts; role packages do not bundle TCP artifacts on its behalf. Browser WASM
output belongs to `@nnrp/browser-client`.

```bash
npm install @nnrp/transport-tcp
```

```ts
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const tcp = createTcpTransportProvider();
```

The provider owns probe, connect, listen, packet batching, timeout, backpressure, and close behavior through its
package-owned Rust TCP libraries. It contains no role implementation or browser WASM.

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/transport-tcp
