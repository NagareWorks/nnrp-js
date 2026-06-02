# JS/TS Preview3 Implementation Surface Map

## Scope

1. Split implementation work by package and runtime boundary.
2. Keep API shape tasks separate from native/WASM loader mechanics.
3. Make package verification and release behavior explicit before npm publication.

## Shard Ownership

- [ ] Use `04a-core-package-contract.md` for `@nnrp/core` shared public types, helpers, and declaration stability.
- [ ] Use `04b-native-runtime-adoption.md` for `@nnrp/native` artifact loading, native client/server/session wrappers,
      and FFI diagnostics.
- [ ] Use `04c-wasm-runtime-adoption.md` for `@nnrp/wasm` WASM loading, browser client/session wrappers, and browser
      transport slots.
- [ ] Use `04d-package-and-runtime-boundaries.md` for export maps, package contents, bundling, runtime-policy checks,
      and npm artifact structure.
- [ ] Use `05-validation-and-docs.md` for conformance, benchmarks, docs, release gates, and publication smoke.

## Dependency Order

- [ ] Finish public type names in `04a` before native and browser packages expose final APIs.
- [ ] Finish native artifact resolver in `04b` before backend native conformance adapter claims runtime support.
- [ ] Finish WASM artifact resolver in `04c` before browser conformance adapter claims runtime support.
- [ ] Finish package-content gates in `04d` before enabling npm publish.
- [ ] Finish docs sync in `05` before tagging a release candidate.

## Cross-Package Test Strategy

- [x] Unit-test `@nnrp/core` without native/WASM artifacts.
- [x] Unit-test `@nnrp/native` with fake native binding handles.
- [x] Unit-test `@nnrp/wasm` with fake WASM primitives.
- [ ] Add integration tests only after real artifacts are available in CI.
- [x] Keep tests deterministic without network access unless they are explicitly adapter/conformance tests.
