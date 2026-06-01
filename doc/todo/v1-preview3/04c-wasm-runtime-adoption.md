# JS/TS Preview3 WASM Runtime Adoption

## Scope

1. Implement `@nnrp/wasm` on top of `nnrp-rs` WASM primitives.
2. Support browser/edge client usage without server APIs, native loaders, or Node built-ins.
3. Keep WASM loading explicit, cacheable, and bundler-friendly.

## WASM Artifact Resolution

- [ ] Consume `nnrp-rs` WASM primitive package.
- [ ] Validate WASM artifact manifest before instantiation.
- [ ] Support explicit WASM URL injection.
- [ ] Support explicit `WebAssembly.Module` injection.
- [ ] Support package-default WASM asset resolution for bundlers.
- [ ] Surface missing or mismatched WASM primitive diagnostics.
- [ ] Add tests for URL, module, package-default, and missing artifact paths.

## WASM Primitive Binding

- [ ] Wrap protocol/version primitive calls.
- [ ] Wrap transport selection primitive calls.
- [ ] Wrap payload/schema validation primitive calls where available.
- [ ] Wrap submit/result encode/decode primitives where available.
- [ ] Keep raw WASM memory details private.
- [ ] Normalize binary payload inputs without unnecessary copies.
- [ ] Add tests with fake primitive module.

## Browser Runtime API

- [ ] Add `openBrowserRuntime(options)`.
- [ ] Add `NnrpBrowserRuntime.connect(options)`.
- [ ] Add `NnrpBrowserRuntime.close()`.
- [ ] Add `NnrpBrowserClient.openSession(options)`.
- [ ] Add `NnrpBrowserClient.close()`.
- [ ] Add `NnrpBrowserClientSession.submit(request)`.
- [ ] Add browser event delivery when runtime support is available.
- [ ] Add browser cancel API when runtime support is available.
- [ ] Add tests for open/connect/session/close lifecycle.

## Browser Transport Adapters

- [ ] Define `NnrpBrowserTransportProvider`.
- [ ] Add WebSocket provider slot.
- [ ] Add WebTransport provider slot after mapping is frozen.
- [ ] Keep transport providers optional.
- [ ] Keep network-free WASM primitive tests possible.
- [ ] Use the same candidate/rejection type shapes as native mode.
- [ ] Add bundling tests with no adapter installed.

## Browser Package Gates

- [ ] Packed browser package contains WASM loader and browser client APIs.
- [ ] Packed browser package does not contain native FFI loader code.
- [ ] Packed browser package does not contain server APIs.
- [ ] Packed browser package does not import `node:*` modules.
- [ ] Packed browser package contains WASM assets or documents external asset injection.
- [ ] CI runs browser bundling smoke.
