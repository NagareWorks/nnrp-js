# @nnrp/core

Runtime-neutral TypeScript contracts for NNRP.

This package contains protocol constants, shared request/result/event types, capability manifests, transport selection
helpers, diagnostics, and small validation helpers used by the runtime-specific SDK packages.

Use `@nnrp/core` when building tools that need NNRP types without importing a native loader, browser WASM loader, or
transport implementation.

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/core
