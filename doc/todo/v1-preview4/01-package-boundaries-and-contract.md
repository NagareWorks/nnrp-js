# 01 - Package Boundaries And Contract

## Package Roles

- [ ] Keep `@nnrp/core` as shared types, errors, capability declarations, provider contracts, and feature probes.
- [ ] Keep `@nnrp/native-client` as Node/Deno client role package.
- [ ] Keep `@nnrp/native-server` as Node/Deno server role package.
- [ ] Keep `@nnrp/browser-client` as browser/edge client role package.
- [ ] Keep transport packages separate from role packages.
- [ ] Keep platform artifacts hidden from direct npm install targets.

## Preview4 Package Set

- [ ] Keep `@nnrp/transport-tcp`.
- [ ] Keep `@nnrp/transport-quic`.
- [ ] Add `@nnrp/transport-ipc`.
- [ ] Add `@nnrp/transport-ws`.
- [ ] Ensure each transport package owns its native and/or WASM artifacts.
- [ ] Ensure each transport package exports its provider registration.
- [ ] Ensure installing only one transport package selects that transport directly.
- [ ] Ensure installing multiple transport packages enables policy-based probing.

## Core Contract

- [ ] Add preview4 runtime-control types.
- [ ] Add preview4 runtime-object types.
- [ ] Add preview4 cache-reference types.
- [ ] Add preview4 trace-context types.
- [ ] Add preview4 result-drop reason types.
- [ ] Add transport capability and cost metadata.
- [ ] Add provider probe result types.

## Version Line Policy

- [ ] Publish preview4 on its own preview version line.
- [ ] Keep preview4 APIs explicit instead of overloading existing helper names with different semantics.
- [ ] Rename Rust artifact manifest `legacy_header` metadata to `ffi_header` or `c_header` once preview4 artifacts are
      produced.
- [ ] Keep current documentation focused on the active `NNRP/1` package shape and do not publish old-preview transition
      pages.
