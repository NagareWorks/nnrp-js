# 07 - WebSocket Carrier Provider

## Existing Package Adoption

- [x] Upgrade `@nnrp/transport-websocket`; do not create or publish `@nnrp/transport-ws`.
  - [x] Export `createWebSocketTransportProvider(options?)`.
  - [x] Export frozen provider option, probe, connection, listener, and diagnostic types.
  - [x] Keep Node/Deno and browser exports under the same package boundary.
- [x] Implement native-host ownership.
  - [x] Load only Rust Preview4 WebSocket artifacts on Node/Deno.
  - [x] Bind native connect/listen/read/write/close behavior.
  - [x] Validate artifact scope `websocket`, ABI, platform, library file, and checksum metadata.
  - [x] Fail explicitly on an unsupported native platform or missing artifact.

## Browser Ownership

- [ ] Bind the browser host WebSocket to `nnrp-wasm-browser` runtime primitives.
  - [x] Accept a host WebSocket constructor/factory through frozen provider options.
  - [x] Use binary messages only and reject text protocol frames.
  - [ ] Feed owned binary bytes into WASM frame/control/object decoding.
  - [x] Apply buffered-amount backpressure without a JavaScript protocol fallback.
  - [x] Implement browser client connect and close; expose no browser server listener.
- [x] Keep artifact placement correct.
  - [x] Keep `nnrp-wasm-browser` in `@nnrp/browser-client` only.
  - [x] Keep native WebSocket libraries in `@nnrp/transport-websocket` only.
  - [x] Keep TCP, QUIC, and IPC artifacts out of both browser paths.

## Endpoint, Selection, and Tests

- [x] Implement WebSocket endpoint handling.
  - [x] Accept `ws://` and `wss://` provider endpoints.
  - [x] Preserve path, query, authority, and TLS intent.
  - [x] Enforce `prefer-websocket` and `force-websocket` semantics.
- [ ] Add native and browser tests.
  - [x] Node/Deno native client/server loopback fixture.
  - [ ] Browser client fixture against a suite-owned WebSocket server.
  - [ ] Binary frame, batch, fragmentation, close, text rejection, and backpressure cases.
  - [ ] Control, object, cache, partial-result, and terminal frame exchange.

## Acceptance Evidence

- [x] Native tarball inspection finds the WebSocket library and no browser WASM.
- [x] Browser tarball inspection finds one browser WASM artifact and no native library.
- [x] Public API snapshot matches the frozen JavaScript transport page in `nnrp-doc`.
