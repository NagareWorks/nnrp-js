# Preview3 Implementation Todo Index

- [x] Foundation and contract are frozen around role packages and transport packages.
- [x] Connection/session/flow-control tasks are complete for preview3.
- [x] Cache/schema/profile registry tasks are complete for preview3.
- [x] Native runtime adoption embeds artifacts into TCP and QUIC transport packages.
- [x] Browser runtime adoption embeds WASM primitives into the browser client package only; TCP and QUIC transport
      packages carry native artifacts only.
- [x] Packaging and validation gates enforce the corrected package boundary.

## Preview3 SDK Surface Traceability

- [x] `@nnrp/core` owns shared enums, metadata descriptors, validation helpers, cache/schema/profile model types, and
      transport-provider contracts without bundling runtime artifacts.
- [x] `@nnrp/native-client` and `@nnrp/native-server` own role-specific host APIs and provider wiring; they do not
      package native or WASM artifacts.
- [x] `@nnrp/transport-tcp` and `@nnrp/transport-quic` own their transport provider implementations plus split Rust
      native artifacts under `native/**`.
- [x] `@nnrp/transport-websocket` owns the JavaScript WebSocket transport provider and carries no Rust native artifact.
- [x] `@nnrp/browser-client` owns the browser client API and packages browser WASM primitives under `wasm/**`.
- [x] Package-content checks reject native artifacts in role/browser/core packages, reject WASM artifacts outside the
      browser client, and require native artifacts in TCP/QUIC transport packages.
