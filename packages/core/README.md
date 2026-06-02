# @nnrp/core

Runtime-neutral TypeScript contracts for NNRP.

This package contains protocol constants, shared request/result/event types, capability manifests, transport selection
helpers, diagnostics, and small validation helpers used by the runtime-specific SDK packages.

Use `@nnrp/core` when building tools that need NNRP types without importing a native loader, browser WASM loader, or
transport implementation.

Preview3 session contracts include submit/cancel/migration/recovery shapes plus `NnrpSessionPatchRequest` for updating
session metadata, input profile, cadence, quality tier, and flow-control credits through runtime-specific adapters.

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/core
