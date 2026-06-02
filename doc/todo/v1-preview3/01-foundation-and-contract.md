# JS/TS Preview3 Foundation and Contract

## Scope

1. Align the repository with the frozen JS/TS SDK API in `nnrp-doc`.
2. Keep package boundaries explicit before implementation grows around them.
3. Make Node/Deno native, browser WASM, and runtime-neutral core behavior separable in source, tests, bundles, and
   release artifacts.

## Package Graph

- [x] Create `@nnrp/core` package skeleton.
- [x] Create `@nnrp/native` package skeleton.
- [x] Create `@nnrp/wasm` package skeleton.
- [ ] Freeze public package names before npm publication.
- [x] Rename placeholder exports to the documented `Nnrp*` public names.
- [ ] Add compatibility aliases only when they avoid needless churn before first publication.
- [x] Add package export maps for ESM runtime entrypoints.
- [x] Add package export maps for `.d.ts` type entrypoints.
- [ ] Add package export maps for future subpath exports.
- [x] Add package metadata that clearly marks unpublished/internal packages as private until release gates pass.

## Build Modes

- [x] Define `backend-native` build mode for Node.js/Deno clients, CLI tools, agent runtimes, adapter processes, and
      services.
- [x] Define `browser-wasm` build mode for browser/edge clients.
- [x] Define `core` as runtime-neutral and transport-neutral.
- [x] Add build-mode constants and capability manifest fields in `@nnrp/core`.
- [x] Add README build-mode table matching `nnrp-doc`.
- [x] Add package-level smoke tests that assert each build mode claims only implemented capabilities.
- [x] Add CI check that backend packages do not contain browser-only files.
- [x] Add CI check that browser packages do not contain native loader files.
- [x] Add CI check that core imports neither native nor browser packages.

## Public Naming Contract

- [x] Use `Nnrp` prefix for public classes, interfaces, errors, and runtime objects.
- [x] Keep internal helper names unexported unless they are part of the frozen docs.
- [x] Replace `CapabilityManifest` with public `NnrpCapabilityManifest`.
- [x] Replace `TransportCandidate` with public `NnrpTransportCandidate`.
- [x] Replace `TransportSelection` with public `NnrpTransportSelection`.
- [x] Replace `NativeRuntimeOptions` with documented native runtime/client option types.
- [x] Replace `WasmRuntimeOptions` with documented WASM/browser runtime option types.
- [x] Add declaration tests that fail when documented public exports disappear.

## Dependency and Runtime Policy

- [x] Deno drives formatting, linting, testing, type checking, and package builds.
- [x] Node.js compatibility remains the backend runtime target.
- [x] Add runtime policy check that rejects Bun files or Bun adaptation traces.
- [x] `@nnrp/core` must not import Node built-ins, DOM APIs, native loaders, or WASM loaders.
- [x] `@nnrp/native` may import Node-compatible filesystem/process/native-loading helpers.
- [x] `@nnrp/native` must not import DOM globals or browser-only transport implementation files.
- [x] `@nnrp/wasm` may import browser and WebAssembly APIs.
- [x] `@nnrp/wasm` must not import `node:*` modules.
- [x] Add dependency graph check for cross-package import violations.

## Documentation Contract

- [x] Keep `nnrp-doc/docs/en/sdk/javascript` aligned with package exports.
- [x] Keep `nnrp-doc/docs/zh/sdk/javascript` aligned with package exports.
- [ ] Update docs in the same PR when public API names or package boundaries change.
- [x] Link method parameters to shared core types in docs.
- [x] Keep code blocks as usage examples, not duplicate interface dumps.
