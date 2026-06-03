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

| Package                     | Purpose                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `@nnrp/core`                | Shared TypeScript types, protocol constants, capability and transport selection helpers. |
| `@nnrp/native-client`       | Node.js and Deno native client/session entrypoint.                                       |
| `@nnrp/native-server`       | Node.js and Deno native server/listen/session entrypoint.                                |
| `@nnrp/browser-client`      | Browser and edge client/session entrypoint backed by browser runtime primitives.         |
| `@nnrp/transport-tcp`       | TCP transport adapter descriptor for native clients and servers.                         |
| `@nnrp/transport-quic`      | QUIC transport adapter descriptor for native clients and servers.                        |
| `@nnrp/transport-websocket` | WebSocket transport adapter descriptor for browser clients.                              |

## Build Modes

| Build mode       | Role packages                                | Runtime target                         | Transport adapter packages                    |
| ---------------- | -------------------------------------------- | -------------------------------------- | --------------------------------------------- |
| `core`           | `@nnrp/core`                                 | Runtime-neutral TypeScript contract    | None                                          |
| `backend-native` | `@nnrp/native-client`, `@nnrp/native-server` | Node-compatible services, CLIs, agents | `@nnrp/transport-tcp`, `@nnrp/transport-quic` |
| `browser-wasm`   | `@nnrp/browser-client`                       | Browser and edge clients               | `@nnrp/transport-websocket`                   |

The backend-native packages target Node.js 20.11 or newer compatible runtimes. Browser packages target modern ES2022
browser and edge environments with `WebAssembly.Module`. Transport packages are independent install units: install one
transport to force that candidate shape, or install several and let runtime probing plus policy select the active
transport.

## Quick Start

```bash
deno task lint
deno task test
deno task build
deno task manifest
deno task conformance:backend
deno task benchmark:backend
deno task benchmark:conformance --plan ../nnrp-conformance/docs/examples/benchmark-execution-plan.sample.json --output artifacts/benchmark-results.json
```

The first preview keeps the JavaScript layer thin: Deno drives formatting, linting, tests, and TypeScript builds. The
published package shape remains Node-compatible ESM with declaration files, but Node.js is treated as a compatibility
target rather than the repository tooling base. Rust remains the preferred implementation for protocol-critical native
and WASM primitives.

`benchmark:backend` and `benchmark:browser` keep SDK-local smoke reports for release dry runs. `benchmark:conformance`
is the cross-SDK benchmark entrypoint: it consumes a conformance benchmark execution plan and emits a results document
that validates against the conformance benchmark-results schema. Native throughput scenarios require
`NNRP_NATIVE_LIBRARY` or `NNRP_JS_BENCHMARK_NATIVE_LIBRARY` to point at a real `nnrp_ffi` dynamic library, or
`NNRP_JS_BENCHMARK_FFI_MODULE` to point at a real Rust-backed FFI binding module. They are skipped instead of measured
when no real binding is provided, and release publishing is gated on the Rust-backed throughput scenario.

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

This repository is being bootstrapped for Preview3-era SDK integration. Public package publishing is gated by the
release workflow until package checks, conformance smoke, benchmark smoke, and import smoke pass.

Preview package versions are synchronized across the role, transport, and core packages. Source package manifests stay
`private: true` for workspace safety; the release workflow stages publishable manifests before running `npm publish`.

The release workflow uses npm Trusted Publishing with GitHub OIDC. Configure trusted publishers for all npm packages
with repository `NagareWorks/nnrp-js`, workflow `release.yml`, and GitHub environment `npm`; no `NPM_TOKEN` secret is
required for the default path.

Native artifacts are not bundled in the JavaScript package yet. Native role packages accept explicit library paths,
artifact directories, or injected FFI bindings so services can choose local packaging policy without forcing one npm
asset layout. Browser runtime assets are likewise injected by URL, manifest, or precompiled `WebAssembly.Module`.

## Contributors

<a href="https://github.com/NagareWorks/nnrp-js/graphs/contributors" title="Open the contributors graph for individual GitHub profiles and IDs.">
  <img src="https://contrib.rocks/image?repo=NagareWorks/nnrp-js" alt="Contributors" />
</a>

The avatar wall above is updated automatically from the repository contributor list.

GitHub README rendering does not support per-avatar dynamic tooltips for an auto-generated contributor wall, so use the
linked contributors graph if you want individual profile pages and account IDs.
