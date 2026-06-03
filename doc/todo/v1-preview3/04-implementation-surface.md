# 04. Implementation Surface

Preview3 implementation is organized by public role packages and real transport packages.

- [x] `@nnrp/core` owns shared protocol contracts.
- [x] `@nnrp/native-client` owns native client role behavior without bundling transport artifacts.
- [x] `@nnrp/native-server` owns native server role behavior without bundling transport artifacts.
- [x] `@nnrp/browser-client` owns browser client behavior and its embedded WASM artifact.
- [x] TCP and QUIC transport packages own transport-provider behavior plus native/WASM artifacts.
- [x] WebSocket transport owns only browser-native WebSocket behavior.
- [x] Package checks reject artifact-only npm packages.
- [x] Public API checks cover only user-facing packages.
