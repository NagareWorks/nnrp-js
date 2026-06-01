# JS/TS Preview3 Validation and Docs

## Scope

1. Prove the JS/TS packages match the frozen public API and active runtime capabilities.
2. Add conformance and benchmark entrypoints by build mode.
3. Keep docs, examples, and release gates synchronized with package exports.

## Static Validation

- [x] Deno format task exists.
- [x] Deno lint task exists.
- [x] Deno typecheck task exists.
- [x] Deno test task exists.
- [ ] Add package declaration diff check.
- [x] Add package export snapshot check.
- [x] Add runtime-policy checks for core/native/wasm import boundaries.
- [ ] Add content-policy checks for docs and examples.
- [ ] Add coverage gate once implementation tests cover real logic.

## Conformance

- [ ] Add JS/TS capability manifest generator.
- [ ] Add conformance adapter command for backend native mode.
- [ ] Add conformance adapter command for browser WASM mode where behavior can be exercised headlessly.
- [ ] Ensure capability claims are build-mode specific.
- [ ] Include artifact/build-mode diagnostics in adapter output.
- [ ] Add CI job that runs public suite smoke cases through the adapter.
- [ ] Add negative conformance cases for unavailable native/WASM artifacts.

## Benchmarks

- [ ] Add backend native benchmark command.
- [ ] Add browser WASM benchmark command.
- [ ] Report latency and throughput separately by build mode.
- [ ] Report native artifact version or WASM artifact version.
- [ ] Report selected transport and rejected provider diagnostics.
- [ ] Add smoke thresholds only after first stable local baseline.
- [ ] Store benchmark JSON artifacts in CI when benchmark workflow is explicitly requested.

## Examples

- [ ] Add Node native client example for CLI/agent usage.
- [ ] Add Node native server/adapter example.
- [ ] Add browser WASM client example.
- [ ] Add opencode-style native client sketch once API names are implemented.
- [ ] Ensure examples import package entrypoints, not source files.
- [ ] Keep examples small enough for users to copy without reading internals.

## Docs Synchronization

- [ ] Keep `nnrp-doc` English JS/TS SDK pages synchronized.
- [ ] Keep `nnrp-doc` Chinese JS/TS SDK pages synchronized.
- [ ] Update local README when package layout changes.
- [ ] Add docs links from package READMEs after package names are frozen.
- [ ] Add API change checklist to PR template if one is introduced.

## Release Gates

- [ ] Add release workflow only after npm package names are frozen.
- [ ] Add npm publish dry run.
- [ ] Add package artifact verification before enabling registry publish.
- [ ] Document environment secrets required for npm publish.
- [ ] Tag release only after docs, conformance smoke, package pack checks, and import smoke pass.
