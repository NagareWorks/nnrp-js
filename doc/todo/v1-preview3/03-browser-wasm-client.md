# JS/TS Preview3 Browser WASM Client

## Scope

1. Implement browser/edge client APIs on top of `nnrp-rs` WASM primitives.
2. Keep browser package client-only.
3. Avoid native FFI, server APIs, and Node built-ins in browser artifacts.

## WASM Dependency

- [ ] Consume `nnrp-rs` WASM primitive package (`.wasm`, JS glue if needed, `.d.ts`, manifest).
- [ ] Validate WASM manifest before instantiation.
- [ ] Support explicit WASM URL/module injection.
- [ ] Support package-default WASM asset resolution for bundlers.
- [ ] Surface missing or mismatched WASM primitive diagnostics.

## Browser Client API

- [ ] Add `NnrpBrowserRuntime.open(options)`.
- [ ] Add `NnrpBrowserClient.connect(options)`.
- [ ] Add `NnrpBrowserClientSession`.
- [ ] Add submit/cancel/result/event APIs.
- [ ] Add session open/patch/close APIs.
- [ ] Exclude server listen/accept/send-result APIs from browser package exports.

## Browser Transports

- [ ] Define `BrowserTransportProvider` interface.
- [ ] Add WebSocket adapter slot.
- [ ] Add WebTransport adapter slot when browser support and protocol mapping are frozen.
- [ ] Use the same candidate scoring model as backend mode.
- [ ] Keep transport adapters optional so pure WASM primitive tests can run without network access.

## Browser Artifact Gate

- [ ] Packed browser package contains WASM loader and browser client APIs.
- [ ] Packed browser package does not contain native FFI loader code.
- [ ] Packed browser package does not contain server APIs.
- [ ] Packed browser package does not import `node:*` modules.
- [ ] CI runs browser bundling smoke.
