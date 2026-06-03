![NNRP](https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg)

# @nnrp/transport-tcp

TCP transport adapter for NNRP native clients and servers.

Install this package when a Node.js or Deno native runtime should consider TCP during transport probing. The package
carries the supported native and WASM transport artifacts; role packages do not bundle TCP artifacts on its behalf.

```ts
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const tcp = createTcpTransportProvider();
```

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/transport-tcp
