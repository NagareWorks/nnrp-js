# JS/TS Preview3 Package and Runtime Boundaries

## Scope

1. Make package contents and runtime boundaries enforceable instead of relying on review memory.
2. Prepare npm-ready artifacts without leaking wrong-runtime code.
3. Keep Deno tooling while publishing Node/browser-compatible packages.

## Export Maps and Type Declarations

- [x] Add package export map for `@nnrp/core`.
- [x] Add package export map for `@nnrp/native`.
- [x] Add package export map for `@nnrp/wasm`.
- [x] Add type declaration output for each package.
- [x] Add declaration maps if they do not bloat package artifacts.
- [x] Add subpath export policy for future internal helpers.
- [x] Add tests that import built package entrypoints instead of source paths.

## Build Outputs

- [x] Build `@nnrp/core` to ESM.
- [x] Build `@nnrp/native` to Node-compatible ESM.
- [x] Build `@nnrp/wasm` to browser-compatible ESM.
- [ ] Keep source maps only if package policy allows them.
- [x] Ensure package output is reproducible enough for CI artifact diffing.
- [ ] Add clean build task that removes stale output before building.

## Package Content Checks

- [ ] Add script that runs `npm pack --dry-run` for each package.
- [x] Assert `@nnrp/core` package contains no native or WASM artifacts.
- [x] Assert `@nnrp/native` package contains no browser-only implementation files.
- [x] Assert `@nnrp/wasm` package contains no native loader files.
- [x] Assert browser package contains no server exports.
- [ ] Assert native package contains required native artifact metadata when artifact packaging is enabled.
- [x] Assert README/license/package metadata are present.

## Runtime Policy CI

- [x] Reject Bun files and adaptation traces.
- [x] Reject accidental `node:*` imports in `@nnrp/core`.
- [x] Reject accidental `node:*` imports in `@nnrp/wasm`.
- [x] Reject DOM globals in `@nnrp/native`.
- [x] Reject direct package-to-source imports in built packages.
- [x] Add Node import smoke for built `@nnrp/native`.
- [x] Add browser bundling smoke for built `@nnrp/wasm`.

## Release Artifact Shape

- [ ] Decide npm package versioning policy for preview builds.
- [ ] Ensure package versions are synchronized or explicitly independent.
- [ ] Decide whether native artifacts are bundled, optional peer artifacts, or downloaded by package policy.
- [ ] Decide whether WASM assets are bundled or externally injected by package policy.
- [x] Document supported Node versions.
- [x] Document supported browser baseline.
- [ ] Add release dry-run workflow before enabling publish.
