# 04 - IPC And WebSocket Transports

## IPC Transport Package

- [ ] Add `@nnrp/transport-ipc`.
- [ ] Own IPC provider registration inside the package.
- [ ] Own native IPC artifacts inside the package.
- [ ] Support Node/Deno local endpoints.
  - [ ] `unix://`.
  - [ ] `npipe://`.
- [ ] Expose client connect provider.
- [ ] Expose server listen provider.
- [ ] Add loopback tests.
- [ ] Add package README with install and endpoint examples.

## WebSocket Transport Package

- [ ] Add `@nnrp/transport-ws`.
- [ ] Own WebSocket provider registration inside the package.
- [ ] Own native WebSocket artifacts for Node/Deno.
- [ ] Own WASM/browser WebSocket substrate bindings for browser clients.
- [ ] Support endpoint forms.
  - [ ] `ws://`.
  - [ ] `wss://`.
- [ ] Reject text-message protocol paths for data frames.
- [ ] Map browser WebSocket binary messages to NNRP frames.
- [ ] Add Node loopback tests.
- [ ] Add browser/WASM fixture tests.
- [ ] Add package README with Node and browser examples.

## Provider Selection

- [ ] Register providers from installed transport packages.
- [ ] Select one installed transport directly when only one provider exists.
- [ ] Probe multiple installed transports by policy when multiple providers exist.
- [ ] Expose probe diagnostics.
- [ ] Expose provider costs and limitations.
- [ ] Avoid hidden fallback to a transport package that was not installed.

## Artifact Boundaries

- [ ] Keep native artifacts inside Node-capable transport packages.
- [ ] Keep WASM artifacts inside browser-capable transport packages.
- [ ] Keep role packages free of transport artifacts.
- [ ] Add package validation that fails when artifacts appear in the wrong package.
