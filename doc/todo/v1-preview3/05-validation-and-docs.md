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
- [x] Add package declaration diff check.
- [x] Add package export snapshot check.
- [x] Add runtime-policy checks for core/native/wasm import boundaries.
- [x] Add content-policy checks for docs and examples.
- [x] Add coverage gate once implementation tests cover real logic.

## Conformance

- [x] Add JS/TS capability manifest generator.
- [x] Add conformance adapter command for backend native mode.
- [x] Add conformance adapter command for browser WASM mode where behavior can be exercised headlessly.
- [x] Ensure capability claims are build-mode specific.
- [x] Include artifact/build-mode diagnostics in adapter output.
- [x] Add CI job that runs public suite smoke cases through the adapter.
- [x] Add negative conformance cases for unavailable native/WASM artifacts.

## Benchmarks

- [x] Add backend native benchmark command.
- [x] Add browser WASM benchmark command.
- [x] Report latency and throughput separately by build mode.
- [x] Report native artifact version or WASM artifact version.
- [x] Report selected transport and rejected provider diagnostics.
- [x] Add smoke thresholds only after first stable local baseline.
- [x] Store benchmark JSON artifacts in CI when benchmark workflow is explicitly requested.

## Examples

- [x] Add Node native client example for CLI/agent usage.
- [x] Add Node native server/adapter example.
- [x] Add browser WASM client example.
- [x] Add opencode-style native client sketch once API names are implemented.
- [x] Ensure examples import package entrypoints, not source files.
- [x] Keep examples small enough for users to copy without reading internals.

## Docs Synchronization

- [x] Keep `nnrp-doc` English JS/TS SDK pages synchronized.
- [x] Keep `nnrp-doc` Chinese JS/TS SDK pages synchronized.
- [x] Update local README when package layout changes.
- [x] Add docs links from package READMEs after package names are frozen.
- [x] Add API change checklist to PR template if one is introduced.

## Release Gates

- [x] Add release workflow only after npm package names are frozen.
- [x] Add npm publish dry run.
- [x] Add package artifact verification before enabling registry publish.
- [x] Document environment secrets required for npm publish.
- [x] Add trusted-publishing release workflow that publishes packages after release gates pass.
- [ ] Manually tag release from the release workflow only after docs, conformance smoke, package pack checks, and import
      smoke pass.
