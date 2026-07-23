# 00 - Scope, Ownership, and Closure

## Package Ownership

- [x] Freeze role-package ownership in repository policy checks.
  - [x] `@nnrp/native-client` owns Node/Deno client lifecycle and no server listener API.
  - [x] `@nnrp/native-server` owns Node/Deno server lifecycle and no client top-level helper.
  - [x] `@nnrp/browser-client` owns browser client lifecycle and the single `nnrp-wasm-browser` artifact.
  - [x] `@nnrp/core` owns shared types, validation, codecs, errors, endpoint resolution, and provider contracts.
  - [x] Role packages contain no native TCP, QUIC, IPC, or WebSocket dynamic libraries.
- [x] Freeze carrier-package ownership in repository policy checks.
  - [x] `@nnrp/transport-tcp` owns TCP provider behavior and TCP native artifacts.
  - [x] `@nnrp/transport-quic` owns QUIC provider behavior and QUIC native artifacts.
  - [x] `@nnrp/transport-ipc` owns IPC provider behavior and IPC native artifacts.
  - [x] `@nnrp/transport-websocket` owns native WebSocket provider behavior and browser host-WebSocket binding.
  - [x] TCP, QUIC, and IPC packages contain no browser WASM.
  - [x] The WebSocket package does not duplicate `nnrp-wasm-browser`.

## Runtime Boundary

- [x] Keep the coarse Rust-call boundary.
  - [x] One public control operation maps to one native or WASM submit call.
  - [x] One public runtime-object operation maps to one native or WASM submit call.
  - [x] Event polling decodes batches without one FFI call per metadata field.
  - [x] Provider selection occurs before runtime dispatch and does not add per-frame dynamic imports.
- [ ] Remove JavaScript-owned protocol fallbacks.
  - [x] Native role packages fail with a typed capability error when no installed provider can load.
  - [ ] Browser runtime fails with a typed capability error when browser WASM or host WebSocket is absent.
  - [x] No Preview3 fake FFI, mock native session, or silent pure-JavaScript protocol path remains.

## Closure Automation

- [x] Replace the Preview3 todo checker with a Preview4 checker.
  - [x] Validate every markdown checkbox in `doc/todo/v1-preview4`.
  - [x] Reject a checked parent with an unchecked child.
  - [x] Reject deferred-contract phrases and old-preview compatibility language.
  - [x] Reject `transport-ws`, `webtransport`, `score`, `tcp-only`, and `quic-only` as API identifiers.
- [ ] Add ownership checks to CI.
  - [x] Validate package dependency direction.
  - [x] Validate artifact placement.
  - [ ] Validate that every public API snapshot is linked from one frozen workstream.

## Acceptance Evidence

- [x] `deno task runtime-policy` proves package and runtime ownership.
- [x] `deno task todo:check` proves parent/child closure and vocabulary rules.
- [x] Unit tests prove missing providers fail explicitly without fallback execution.
