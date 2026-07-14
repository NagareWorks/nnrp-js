# 07 - WebSocket Carrier Provider

## Existing Package Adoption

- [ ] Upgrade `@nnrp/transport-websocket`; do not create or publish `@nnrp/transport-ws`.
  - [ ] Export `createWebSocketTransportProvider(options?)`.
  - [ ] Export frozen provider option, probe, connection, listener, and diagnostic types.
  - [ ] Keep Node/Deno and browser exports under the same package boundary.
- [ ] Implement native-host ownership.
  - [x] Load only Rust Preview4 WebSocket artifacts on Node/Deno.
  - [ ] Bind native connect/listen/read/write/close behavior.
  - [x] Validate artifact scope `websocket`, ABI, platform, library file, and checksum metadata.
  - [ ] Fail explicitly on an unsupported native platform or missing artifact.

## Browser Ownership

- [ ] Bind the browser host WebSocket to `nnrp-wasm-browser` runtime primitives.
  - [ ] Accept a host WebSocket constructor/factory through frozen provider options.
  - [ ] Use binary messages only and reject text protocol frames.
  - [ ] Feed owned binary bytes into WASM frame/control/object decoding.
  - [ ] Apply buffered-amount backpressure without a JavaScript protocol fallback.
  - [ ] Implement browser client connect and close; expose no browser server listener.
- [x] Keep artifact placement correct.
  - [x] Keep `nnrp-wasm-browser` in `@nnrp/browser-client` only.
  - [x] Keep native WebSocket libraries in `@nnrp/transport-websocket` only.
  - [x] Keep TCP, QUIC, and IPC artifacts out of both browser paths.

## Endpoint, Selection, and Tests

- [ ] Implement WebSocket endpoint handling.
  - [ ] Accept `ws://` and `wss://` provider endpoints.
  - [ ] Preserve path, query, authority, and TLS intent.
  - [ ] Enforce `prefer-websocket` and `force-websocket` semantics.
- [ ] Add native and browser tests.
  - [ ] Node/Deno native client/server loopback fixture.
  - [ ] Browser client fixture against a suite-owned WebSocket server.
  - [ ] Binary frame, batch, fragmentation, close, text rejection, and backpressure cases.
  - [ ] Control, object, cache, partial-result, and terminal frame exchange.

## Acceptance Evidence

- [x] Native tarball inspection finds the WebSocket library and no browser WASM.
- [x] Browser tarball inspection finds one browser WASM artifact and no native library.
- [ ] Public API snapshot matches the frozen JavaScript transport page in `nnrp-doc`.
