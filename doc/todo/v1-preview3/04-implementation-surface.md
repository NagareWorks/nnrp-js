# JS/TS Preview3 Implementation Surface Map

## Scope

1. Split implementation work by package and runtime boundary.
2. Keep API shape tasks separate from native/WASM loader mechanics.
3. Make package verification and release behavior explicit before npm publication.

## Shard Ownership

- [x] Use `04a-core-package-contract.md` for `@nnrp/core` shared public types, helpers, and declaration stability.
- [x] Use `04b-native-runtime-adoption.md` for `@nnrp/native` artifact loading, native client/server/session wrappers,
      and FFI diagnostics.
- [x] Use `04c-wasm-runtime-adoption.md` for `@nnrp/wasm` WASM loading, browser client/session wrappers, and browser
      transport slots.
- [x] Use `04d-package-and-runtime-boundaries.md` for export maps, package contents, bundling, runtime-policy checks,
      and npm artifact structure.
- [x] Use `05-validation-and-docs.md` for conformance, benchmarks, docs, release gates, and publication smoke.

## Dependency Order

- [x] Finish public type names in `04a` before native and browser packages expose final APIs.
- [x] Finish native artifact resolver in `04b` before backend native conformance adapter claims runtime support.
- [x] Finish WASM artifact resolver in `04c` before browser conformance adapter claims runtime support.
- [x] Finish package-content gates in `04d` before enabling npm publish.
- [x] Finish docs sync in `05` before tagging a release candidate.

## Cross-Package Test Strategy

- [x] Unit-test `@nnrp/core` without native/WASM artifacts.
- [x] Unit-test `@nnrp/native` with fake native binding handles.
- [x] Unit-test `@nnrp/wasm` with fake WASM primitives.
- [x] Keep real-artifact integration tests deferred until `@nnrp/native` bundles or downloads released artifacts in CI.
- [x] Keep tests deterministic without network access unless they are explicitly adapter/conformance tests.
