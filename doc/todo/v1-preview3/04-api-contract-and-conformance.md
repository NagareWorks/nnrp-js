# JS/TS Preview3 API Contract and Conformance

## Scope

1. Track the frozen JS/TS data structures and API names documented in `nnrp-doc`.
2. Wire JS/TS conformance and benchmark hooks to build-mode-specific implementations.
3. Keep docs, capability claims, and package exports synchronized.

## Frozen API Contract

- [ ] Mirror `nnrp-doc` JS/TS SDK package map.
- [ ] Freeze core interfaces: `NnrpCapabilityManifest`, `NnrpTransportCandidate`, `NnrpTransportSelection`,
      `NnrpDiagnostic`, `NnrpResult`.
- [ ] Freeze backend interfaces: `NnrpBackendRuntime`, `NnrpClient`, `NnrpServer`, backend session wrappers, native
      artifact resolver.
- [ ] Freeze browser interfaces: `NnrpBrowserRuntime`, `NnrpBrowserClient`, browser session wrapper, WASM loader.
- [ ] Add API extractor or generated declaration diff check.

## Conformance

- [ ] Add JS/TS capability manifest.
- [ ] Add conformance adapter command for backend native mode.
- [ ] Add conformance adapter command for browser WASM mode where behavior can be exercised headlessly.
- [ ] Ensure capability claims are build-mode specific.
- [ ] Add CI job that runs public suite cases through the adapter.

## Benchmarks

- [ ] Add backend native benchmark command.
- [ ] Add browser WASM benchmark command.
- [ ] Report latency and throughput separately by build mode.
- [ ] Add smoke thresholds only after first stable local baseline.

## Docs and Release

- [ ] Keep `nnrp-doc/docs/{zh,en}/sdk/javascript` synchronized with package exports.
- [ ] Add release workflow only after npm package names are frozen.
- [ ] Add package artifact verification before enabling registry publish.
- [ ] Document environment secrets required for npm publish.
