# NNRP/1-preview3 JS/TS SDK Implementation Todo

## 0. Scope

1. This directory tracks the Preview3 JS/TS SDK rollout as a Deno-authored, Node-compatible package workspace.
2. Preview3 wire semantics, native FFI ABI, and WASM primitives are owned by `nnrp-doc` and `nnrp-rs`; this repository
   owns JS/TS package boundaries, runtime selection, native/WASM loaders, and browser/server API ergonomics.
3. Do not reimplement protocol-critical codec or state-machine behavior in TypeScript when a Rust native or WASM
   primitive exists.
4. Deno is the repository tooling layer. Published runtime packages must remain Node-compatible ESM with `.d.ts`
   declarations.
5. Bun is out of scope for runtime support, adaptation, tests, CI, examples, and package exports.

## 1. Required Build Modes

Preview3 must support exactly two SDK build modes:

1. **Backend build mode**: Node.js/Deno service packages that use native FFI artifacts from `nnrp-rs`.
2. **Browser client build mode**: browser/edge packages that use WASM artifacts from `nnrp-rs`.

These build modes produce three distribution artifacts:

| Artifact               | Package target | Native dependency                                                        | Contains                                                                                 |
| ---------------------- | -------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Core package           | `@nnrp/core`   | None                                                                     | Shared types, capability manifest types, transport selection types, protocol constants   |
| Backend package        | `@nnrp/native` | `nnrp-rs` native FFI link library (`.dll` / `.so` / `.dylib` / `.a`)     | backend client/server/session wrappers, native artifact resolver, Node/Deno service glue |
| Browser client package | `@nnrp/wasm`   | `nnrp-rs` WASM primitive bundle (`.wasm` + generated JS/TS declarations) | browser client/session wrappers, WASM loader, browser transport adapters                 |

Hard gates:

1. Backend artifacts must not include browser client-only transport code or DOM-only dependencies.
2. Browser artifacts must not include server APIs, native FFI loader code, Node built-ins, or native library manifests.
3. Core artifacts must stay transport-neutral and must not import backend or browser packages.
4. Backend mode may expose client and server APIs.
5. Browser mode exposes client APIs only.

## 2. Shard Map

1. `01-package-boundaries-and-build-modes.md`: package layout, exports, build modes, dependency isolation, and runtime
   policy.
2. `02-native-backend-runtime.md`: Node.js/Deno backend native FFI loading, backend client/server API, native artifact
   probe, and fallback policy.
3. `03-browser-wasm-client.md`: browser client API, WASM primitive loading, WebSocket/WebTransport adapter slots, and
   server-code exclusion.
4. `04-api-contract-and-conformance.md`: frozen JS/TS data structures, conformance adapter, benchmark hooks, docs, and
   release gates.

## 3. PR Rules

1. One shard per PR by default.
2. If a change affects package exports or artifact contents, update `nnrp-doc` JS/TS SDK pages in the same PR or an
   immediately linked PR.
3. If a change needs new Rust native or WASM symbols, update `nnrp-rs` first and consume the released artifact here.
4. Do not add Bun-specific support, compatibility probes, lockfiles, examples, CI axes, or package exports.
5. Normal work targets `main` until a separate release freeze branch is created.

## 4. Protocol Coverage Check

1. Core package owns TypeScript representations of capability manifests, transport candidates, error families, and
   shared session/operation ids.
2. Backend package consumes FFI client/server/session/operation/event handles and maps them to JS objects without
   exposing raw Rust object lifetimes.
3. Browser package consumes WASM primitives and browser transports; it never loads native libraries.
4. Conformance adapter must claim only capabilities that are implemented by the active build mode.
5. Benchmark runner must report native backend and browser WASM modes separately.
