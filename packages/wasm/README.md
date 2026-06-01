# @nnrp/wasm

Browser and edge WASM runtime surface for NNRP.

This package exposes the browser client facade, explicit WASM module/URL injection, optional browser transport provider
slots, and runtime-neutral contracts from `@nnrp/core`.

It must not import Node built-ins or native FFI loader code. WASM artifacts can be supplied by URL, by precompiled
`WebAssembly.Module`, or by a later package asset policy.
