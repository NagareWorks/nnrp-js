![NNRP](https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg)

# @nnrp/transport-tcp

TCP transport adapter descriptors for NNRP native clients and servers.

Install this package when a Node.js or Deno native runtime should consider TCP during transport probing.

```ts
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const tcp = createTcpTransportProvider();
```

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/transport-tcp
