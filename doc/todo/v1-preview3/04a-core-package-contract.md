# 04a. Core Package Contract

- [x] Export protocol constants, build-mode types, capability manifests, and transport selection helpers.
- [x] Export request normalization helpers for submit, cancel, migration, and session patch flows.
- [x] Export shared error classes for protocol, transport, timeout, recovery, and capability failures.
- [x] Avoid runtime-specific imports in `@nnrp/core`.
- [x] Keep core free of native, WASM, and transport implementation payloads.
