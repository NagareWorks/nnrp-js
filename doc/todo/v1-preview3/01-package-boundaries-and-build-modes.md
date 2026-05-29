# JS/TS Preview3 Package Boundaries and Build Modes

## Scope

1. Define the Preview3 package graph before implementation grows.
2. Freeze the two build modes and three artifacts so backend and browser bundles do not leak into each other.
3. Keep Deno as tooling while preserving Node-compatible runtime output.

## Package Graph

- [x] Create `@nnrp/core` package skeleton.
- [x] Create `@nnrp/native` package skeleton.
- [x] Create `@nnrp/wasm` package skeleton.
- [ ] Freeze public package names before npm publication.
- [ ] Add package export maps for runtime, types, and future subpath exports.
- [ ] Add package-content checks that inspect packed artifacts.

## Build Modes

- [ ] Add backend build mode for Node.js/Deno services using native FFI artifacts.
- [ ] Add browser client build mode using WASM primitives.
- [ ] Add build-mode documentation to README and `nnrp-doc`.
- [ ] Add CI smoke that verifies backend packages do not contain browser-only files.
- [ ] Add CI smoke that verifies browser packages do not contain server/native-loader files.

## Artifact Boundaries

- [ ] `@nnrp/core` has no native dependency and no runtime-specific imports.
- [ ] `@nnrp/native` depends on native FFI artifacts and may expose client/server APIs.
- [ ] `@nnrp/wasm` depends on WASM artifacts and exposes browser client APIs only.
- [ ] Backend artifact excludes DOM/WebTransport implementation code unless it is behind a transport-neutral interface.
- [ ] Browser artifact excludes server APIs, native library manifests, Node built-ins, and native FFI loader code.

## Runtime Policy

- [x] Deno drives formatting, linting, testing, type checking, and package builds.
- [x] Node.js compatibility remains the package runtime target.
- [x] Add runtime policy check that rejects Bun files or Bun adaptation traces.
- [ ] Add Node import smoke for built packages.
- [ ] Add browser bundling smoke for `@nnrp/wasm`.
