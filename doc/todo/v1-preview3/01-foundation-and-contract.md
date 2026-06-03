# JS/TS Preview3 Foundation and Contract

## Scope

1. Align the repository with the frozen JS/TS SDK API in `nnrp-doc`.
2. Keep package boundaries explicit before implementation grows around them.
3. Make Node/Deno client, Node/Deno server, browser client, individual transport adapters, and runtime-neutral core
   behavior separable in source, tests, bundles, and release artifacts.

## Package Graph

- [x] Create `@nnrp/core` package skeleton.
- [x] Create `@nnrp/native-client` package skeleton.
- [x] Create `@nnrp/native-server` package skeleton.
- [x] Create `@nnrp/browser-client` package skeleton.
- [x] Create `@nnrp/transport-tcp` package skeleton.
- [x] Create `@nnrp/transport-quic` package skeleton.
- [x] Create `@nnrp/transport-websocket` package skeleton.
- [x] Ensure preview3 TODO files describe only the corrected role and transport package graph.
- [x] Freeze corrected preview3 public package names before publishing the hotfix package set.
- [x] Rename placeholder exports to the documented `Nnrp*` public names.
- [x] Decide not to add compatibility aliases before first publication because no published JS/TS names need migration.
- [x] Add package export maps for ESM runtime entrypoints.
- [x] Add package export maps for `.d.ts` type entrypoints.
- [x] Add package export maps for future subpath exports.
- [x] Add package metadata that clearly marks unpublished/internal packages as private until release gates pass.
- [x] Ensure release scripts publish only the corrected preview3 package graph.

## Build Modes

- [x] Define `backend-native` build mode for Node.js/Deno clients, servers, CLI tools, agent runtimes, adapter
      processes, and services.
- [x] Define `browser-wasm` build mode for browser/edge clients.
- [x] Define `core` as runtime-neutral and transport-neutral.
- [x] Add build-mode constants and capability manifest fields in `@nnrp/core`.
- [x] Add README build-mode table matching `nnrp-doc`.
- [x] Add package-level smoke tests that assert each build mode claims only implemented capabilities.
- [x] Add CI check that native client and native server packages do not contain browser-only files.
- [x] Add CI check that browser client and WebSocket transport packages do not contain native loader files.
- [x] Add CI check that core imports neither role packages nor transport packages.

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
- [x] `@nnrp/core` must not import Node built-ins, DOM APIs, native loaders, browser loaders, or transport adapters.
- [x] `@nnrp/native-client` may import Node-compatible native-loading helpers but must not export server APIs.
- [x] `@nnrp/native-server` may import Node-compatible native-loading helpers but must not export client APIs.
- [x] `@nnrp/browser-client` may import browser and WebAssembly APIs but must not export server APIs.
- [x] `@nnrp/transport-tcp` may expose TCP provider descriptors but must not expose lifecycle APIs.
- [x] `@nnrp/transport-quic` may expose QUIC provider descriptors but must not expose lifecycle APIs.
- [x] `@nnrp/transport-websocket` may expose WebSocket provider descriptors but must not expose lifecycle APIs.
- [x] Add dependency graph check for corrected cross-package import violations.

## Documentation Contract

- [x] Keep `nnrp-doc/docs/en/sdk/javascript` aligned with package exports.
- [x] Keep `nnrp-doc/docs/zh/sdk/javascript` aligned with package exports.
- [x] Update docs in the same PR when public API names or package boundaries change.
- [x] Link method parameters to shared core types in docs.
- [x] Keep code blocks as usage examples, not duplicate interface dumps.
