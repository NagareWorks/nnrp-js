# 04c. Browser Runtime Adoption

- [x] Embed browser WASM payload inside `@nnrp/browser-client`.
- [x] Embed transport WASM payloads inside `@nnrp/transport-tcp`.
- [x] Embed transport WASM payloads inside `@nnrp/transport-quic`.
- [x] Keep `@nnrp/browser-client` as the user-facing browser package.
- [x] Resolve browser runtime artifacts through browser client options and packaged WASM paths.
- [x] Keep browser package free of native libraries.
- [x] Keep WebSocket transport browser-native because rs does not expose a WebSocket transport implementation.
