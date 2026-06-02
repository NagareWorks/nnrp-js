# @nnrp/wasm

Browser and edge WASM runtime surface for NNRP.

This package exposes the browser client facade, explicit WASM module/URL injection, optional browser transport provider
slots, and runtime-neutral contracts from `@nnrp/core`.

It must not import Node built-ins or native FFI loader code. WASM artifacts can be supplied by URL, by precompiled
`WebAssembly.Module`, or by a later package asset policy.

WASM assets remain externally injected during the preview phase. The package validates artifact manifests and keeps the
browser runtime wrapper stable while the final npm asset layout is still gated by release dry runs.
