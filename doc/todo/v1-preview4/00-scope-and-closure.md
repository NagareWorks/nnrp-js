# 00 - Scope, Ownership, and Closure

## Package Ownership

- [ ] Freeze role-package ownership in repository policy checks.
  - [ ] `@nnrp/native-client` owns Node/Deno client lifecycle and no server listener API.
  - [ ] `@nnrp/native-server` owns Node/Deno server lifecycle and no client top-level helper.
  - [ ] `@nnrp/browser-client` owns browser client lifecycle and the single `nnrp-wasm-browser` artifact.
  - [ ] `@nnrp/core` owns shared types, validation, codecs, errors, endpoint resolution, and provider contracts.
  - [ ] Role packages contain no native TCP, QUIC, IPC, or WebSocket dynamic libraries.
- [ ] Freeze carrier-package ownership in repository policy checks.
  - [ ] `@nnrp/transport-tcp` owns TCP provider behavior and TCP native artifacts.
  - [ ] `@nnrp/transport-quic` owns QUIC provider behavior and QUIC native artifacts.
  - [ ] `@nnrp/transport-ipc` owns IPC provider behavior and IPC native artifacts.
  - [ ] `@nnrp/transport-websocket` owns native WebSocket provider behavior and browser host-WebSocket binding.
  - [ ] TCP, QUIC, and IPC packages contain no browser WASM.
  - [ ] The WebSocket package does not duplicate `nnrp-wasm-browser`.

## Runtime Boundary

- [ ] Keep the coarse Rust-call boundary.
  - [ ] One public control operation maps to one native or WASM submit call.
  - [ ] One public runtime-object operation maps to one native or WASM submit call.
  - [ ] Event polling decodes batches without one FFI call per metadata field.
  - [ ] Provider selection occurs before runtime dispatch and does not add per-frame dynamic imports.
- [ ] Remove JavaScript-owned protocol fallbacks.
  - [ ] Native role packages fail with a typed capability error when no installed provider can load.
  - [ ] Browser runtime fails with a typed capability error when browser WASM or host WebSocket is absent.
  - [ ] No Preview3 fake FFI, mock native session, or silent pure-JavaScript protocol path remains.

## Closure Automation

- [ ] Replace the Preview3 todo checker with a Preview4 checker.
  - [ ] Validate every markdown checkbox in `doc/todo/v1-preview4`.
  - [ ] Reject a checked parent with an unchecked child.
  - [ ] Reject deferred-contract phrases and old-preview compatibility language.
  - [ ] Reject `transport-ws`, `webtransport`, `score`, `tcp-only`, and `quic-only` as API identifiers.
- [ ] Add ownership checks to CI.
  - [ ] Validate package dependency direction.
  - [ ] Validate artifact placement.
  - [ ] Validate that every public API snapshot is linked from one frozen workstream.

## Acceptance Evidence

- [ ] `deno task runtime-policy` proves package and runtime ownership.
- [ ] `deno task todo:check` proves parent/child closure and vocabulary rules.
- [ ] Unit tests prove missing providers fail explicitly without fallback execution.
