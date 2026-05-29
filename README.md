<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP - Neural Network Runtime Protocol" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/NagareWorks/nnrp-js/actions"><img alt="CI" src="https://img.shields.io/badge/CI-typescript-22c55e"></a>
  <a href="https://nodejs.org"><img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white"></a>
  <a href="https://www.typescriptlang.org"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white"></a>
  <a href="https://nagareworks.github.io/nnrp-doc/"><img alt="Docs" src="https://img.shields.io/badge/docs-nnrp--doc-38bdf8"></a>
  <a href="https://github.com/NagareWorks/nnrp-js/blob/main/LICENSE"><img alt="Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-64748b"></a>
</p>

# nnrp-js

TypeScript and JavaScript SDK workspace for NNRP.

NNRP is a lightweight real-time AI application-layer protocol. This repository is the JavaScript SDK surface for Node.js
services, browser/edge WASM integrations, and later Coding Agent orchestration experiments.

## Packages

| Package        | Purpose                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `@nnrp/core`   | Shared TypeScript types, protocol constants, capability and transport selection helpers.     |
| `@nnrp/native` | Node.js native library discovery and loader primitives for `nnrp-rs` FFI artifacts.          |
| `@nnrp/wasm`   | Browser and edge WASM loading primitives for protocol/runtime helpers produced by `nnrp-rs`. |

## Quick Start

```bash
deno task lint
deno task test
deno task build
```

The first preview keeps the JavaScript layer thin: Deno drives formatting, linting, tests, and TypeScript builds, while
the packages still emit Node/npm-compatible ESM and declaration files. Rust remains the preferred implementation for
protocol-critical native and WASM primitives.

## Repository Status

This repository is being bootstrapped for Preview3-era SDK integration. Public package publishing is intentionally
deferred until the package names, native artifact matrix, and WASM distribution shape are frozen.
