# JS/TS Preview3 WASM Runtime Adoption

## Scope

1. Implement `@nnrp/wasm` on top of `nnrp-rs` WASM primitives.
2. Support browser/edge client usage without server APIs, native loaders, or Node built-ins.
3. Keep WASM loading explicit, cacheable, and bundler-friendly.

## WASM Artifact Resolution

- [ ] Consume `nnrp-rs` WASM primitive package.
- [ ] Validate WASM artifact manifest before instantiation.
- [x] Support explicit WASM URL injection.
- [x] Support explicit `WebAssembly.Module` injection.
- [x] Support package-default WASM asset resolution for bundlers.
- [x] Surface missing or mismatched WASM primitive diagnostics.
- [x] Add tests for URL, module, and package-default artifact paths.
- [ ] Add tests for missing artifact paths once runtime instantiation is wired.

## WASM Primitive Binding

- [ ] Wrap protocol/version primitive calls.
- [ ] Wrap transport selection primitive calls.
- [ ] Wrap payload/schema validation primitive calls where available.
- [ ] Wrap submit/result encode/decode primitives where available.
- [x] Keep raw WASM memory details private.
- [x] Normalize binary payload inputs without unnecessary copies.
- [x] Add tests with fake primitive module.

## Browser Runtime API

- [x] Add `openBrowserRuntime(options)`.
- [x] Add `NnrpBrowserRuntime.connect(options)`.
- [x] Add `NnrpBrowserRuntime.close()`.
- [x] Add `NnrpBrowserClient.openSession(options)`.
- [x] Add `NnrpBrowserClient.close()`.
- [x] Add `NnrpBrowserClientSession.submit(request)`.
- [x] Add browser event delivery when runtime support is available.
- [ ] Add browser cancel API when runtime support is available.
- [x] Add tests for open/connect/session/close lifecycle.

## Browser Transport Adapters

- [x] Define `NnrpBrowserTransportProvider`.
- [x] Add WebSocket provider slot.
- [ ] Add WebTransport provider slot after mapping is frozen.
- [x] Keep transport providers optional.
- [x] Keep network-free WASM primitive tests possible.
- [x] Use the same candidate/rejection type shapes as native mode.
- [x] Add bundling tests with no adapter installed.

## Browser Package Gates

- [x] Packed browser package contains WASM loader and browser client APIs.
- [x] Packed browser package does not contain native FFI loader code.
- [x] Packed browser package does not contain server APIs.
- [x] Packed browser package does not import `node:*` modules.
- [x] Packed browser package contains WASM assets or documents external asset injection.
- [x] CI runs browser bundling smoke.
