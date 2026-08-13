<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/core

Runtime-neutral TypeScript contracts for NNRP.

This package owns protocol constants, Preview4 control/object/cache codecs and types, application endpoint validation,
capability manifests, provider selection, diagnostics, and shared errors. It contains no native library or browser WASM.

```bash
npm install @nnrp/core
```

Use `@nnrp/core` when building tools that need NNRP types without importing a native loader, browser WASM loader, or
transport implementation.

```ts
import { NnrpEndpoint, NnrpProviderEndpoint } from "@nnrp/core";

const endpoint = NnrpEndpoint.parse("nnrp://runtime.example/session/default");
const websocket = NnrpProviderEndpoint.parse("wss://runtime.example/nnrp");
```

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/core
