<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" />
</p>

# @nnrp/transport-ipc

Native IPC carrier provider for NNRP. This package owns the Rust IPC transport library for each supported platform and
opens Unix-domain socket or Windows named-pipe connections through the coarse packet-batch FFI.

```bash
npm install @nnrp/transport-ipc
```

```ts
import { createIpcTransportProvider } from "@nnrp/transport-ipc";

const ipc = createIpcTransportProvider();
const listener = await ipc.listen({ endpoint: "unix:///run/nnrp/runtime.sock" });
```

The package contains no TCP, QUIC, WebSocket, browser WASM, client-role, or server-role implementation.
