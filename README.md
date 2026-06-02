<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP - Neural Network Runtime Protocol" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/NagareWorks/nnrp-js/actions"><img alt="CI" src="https://img.shields.io/badge/CI-typescript-22c55e"></a>
  <a href="https://deno.com"><img alt="Deno" src="https://img.shields.io/badge/Deno-2.x-000000?logo=deno&logoColor=white"></a>
  <a href="https://www.typescriptlang.org"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white"></a>
  <a href="https://nodejs.org"><img alt="Node-compatible" src="https://img.shields.io/badge/Node-compatible-64748b?logo=node.js&logoColor=white"></a>
  <a href="https://nagareworks.github.io/nnrp-doc/"><img alt="Docs" src="https://img.shields.io/badge/docs-nnrp--doc-38bdf8"></a>
  <a href="https://github.com/NagareWorks/nnrp-js/blob/main/LICENSE"><img alt="Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-64748b"></a>
</p>

# nnrp-js

Deno-first TypeScript SDK workspace for NNRP, with Node-compatible package output.

NNRP is a lightweight real-time AI application-layer protocol. This repository is the JavaScript SDK surface for
Deno-driven tooling, Node-compatible service packages, browser/edge WASM integrations, and later Coding Agent
orchestration experiments.

## Packages

| Package        | Purpose                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `@nnrp/core`   | Shared TypeScript types, protocol constants, capability and transport selection helpers.     |
| `@nnrp/native` | Node.js native library discovery and loader primitives for `nnrp-rs` FFI artifacts.          |
| `@nnrp/wasm`   | Browser and edge WASM loading primitives for protocol/runtime helpers produced by `nnrp-rs`. |

## Build Modes

| Build mode       | Package        | Runtime target                         | Transport slots                  |
| ---------------- | -------------- | -------------------------------------- | -------------------------------- |
| `core`           | `@nnrp/core`   | Runtime-neutral TypeScript contract    | None                             |
| `backend-native` | `@nnrp/native` | Node-compatible services, CLIs, agents | TCP and QUIC native providers    |
| `browser-wasm`   | `@nnrp/wasm`   | Browser and edge WASM clients          | WebSocket and WebTransport slots |

The backend-native packages target Node.js 20.11 or newer compatible runtimes. Browser-WASM packages target modern
ES2022 browser and edge environments with `WebAssembly.Module`; WebSocket/WebTransport providers remain optional slots
until the browser transport mapping is frozen.

## Quick Start

```bash
deno task lint
deno task test
deno task build
deno task manifest
deno task conformance:backend
deno task benchmark:backend
```

The first preview keeps the JavaScript layer thin: Deno drives formatting, linting, tests, and TypeScript builds. The
published package shape remains Node-compatible ESM with declaration files, but Node.js is treated as a compatibility
target rather than the repository tooling base. Rust remains the preferred implementation for protocol-critical native
and WASM primitives.

`nnrp-js` uses Deno for repository tooling and keeps Node.js compatibility for package consumers. Bun is not a supported
runtime, build tool, compatibility target, or CI axis for this SDK.

## Examples

| Example                             | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `examples/native-client.ts`         | Node/Deno native client shape for CLI and agent callers.  |
| `examples/native-server-adapter.ts` | Native server/adapter lifecycle shape.                    |
| `examples/browser-client.ts`        | Browser/edge WASM client shape.                           |
| `examples/opencode-agent-client.ts` | Native client sketch for coding-agent style integrations. |

Examples use package entrypoint names through the repository import map. They are checked with
`deno task examples:check`.

## Repository Status

This repository is being bootstrapped for Preview3-era SDK integration. Public package publishing is intentionally
deferred until the package names, native artifact matrix, and WASM distribution shape are frozen.

Preview package versions are synchronized across `@nnrp/core`, `@nnrp/native`, and `@nnrp/wasm` until the first npm
publication. Package manifests stay `private: true` while release gates are dry-run only.

Native artifacts are not bundled in the JavaScript package yet. `@nnrp/native` accepts explicit library paths, artifact
directories, or injected FFI bindings so services can choose local packaging policy without forcing one npm asset
layout. WASM assets are likewise injected by URL, manifest, or precompiled `WebAssembly.Module` until the browser asset
policy is frozen.
