# 01. Foundation and Contract

Preview3 freezes the public JavaScript/TypeScript SDK boundary around user-facing role packages and transport packages.
Runtime artifacts are embedded inside the transport packages that own them.

- [x] Keep `@nnrp/core` as the shared protocol, type, error, capability, and transport-provider contract package.
- [x] Keep `@nnrp/native-client` as the Node/Deno client role package.
- [x] Keep `@nnrp/native-server` as the Node/Deno server role package.
- [x] Keep `@nnrp/browser-client` as the browser and edge client role package.
- [x] Keep transport implementations in dedicated transport packages.
- [x] Keep TCP and QUIC native/WASM runtime artifacts inside their transport packages.
- [x] Keep WebSocket browser-native until rs exposes a WebSocket transport.
- [x] Do not expose platform artifact packages as npm install targets.
- [x] Do not expose WASM as the primary browser package name.
- [x] Keep preview3 versioning on `1.0.0-preview.3.x` patch releases until the next preview line starts.
