# JS/TS Preview3 Package and Runtime Boundaries

## Scope

1. Make package contents and runtime boundaries enforceable instead of relying on review memory.
2. Prepare npm-ready artifacts without leaking wrong-role or wrong-transport code.
3. Keep Deno tooling while publishing Node/browser-compatible packages.

## Export Maps and Type Declarations

- [x] Add package export map for `@nnrp/core`.
- [x] Add package export map for `@nnrp/native-client`.
- [x] Add package export map for `@nnrp/native-server`.
- [x] Add package export map for `@nnrp/browser-client`.
- [x] Add package export map for `@nnrp/transport-tcp`.
- [x] Add package export map for `@nnrp/transport-quic`.
- [x] Add package export map for `@nnrp/transport-websocket`.
- [x] Add type declaration output for each package.
- [x] Add declaration maps if they do not bloat package artifacts.
- [x] Add subpath export policy for future internal helpers.
- [x] Add tests that import built package entrypoints instead of source paths.

## Build Outputs

- [x] Build `@nnrp/core` to ESM.
- [x] Build `@nnrp/native-client` to Node-compatible ESM.
- [x] Build `@nnrp/native-server` to Node-compatible ESM.
- [x] Build `@nnrp/browser-client` to browser-compatible ESM.
- [x] Build `@nnrp/transport-tcp` to Node-compatible ESM.
- [x] Build `@nnrp/transport-quic` to Node-compatible ESM.
- [x] Build `@nnrp/transport-websocket` to browser-compatible ESM.
- [x] Keep source maps only if package policy allows them.
- [x] Ensure package output is reproducible enough for CI artifact diffing.
- [x] Add clean build task that removes stale output before building.

## Package Content Checks

- [x] Add script that runs `npm pack --dry-run` for each package.
- [x] Assert `@nnrp/core` package contains no role package, transport adapter, native artifact, or browser artifact
      files.
- [x] Assert `@nnrp/native-client` package contains no server exports.
- [x] Assert `@nnrp/native-server` package contains no client exports.
- [x] Assert `@nnrp/browser-client` package contains no server exports and no native loader files.
- [x] Assert `@nnrp/transport-tcp` and `@nnrp/transport-quic` contain no browser-only implementation files.
- [x] Assert `@nnrp/transport-websocket` contains no native loader files.
- [x] Assert role packages do not bundle concrete transport package code.
- [x] Assert transport packages do not depend on role packages.
- [x] Assert installed-transport probing remains optional so missing transport packages do not fail module import.
- [x] Assert native role packages contain required native artifact metadata when artifact packaging is enabled.
- [x] Assert README/license/package metadata are present.

## Runtime Policy CI

- [x] Reject Bun files and adaptation traces.
- [x] Reject accidental `node:*` imports in `@nnrp/core`.
- [x] Reject accidental `node:*` imports in `@nnrp/browser-client` and `@nnrp/transport-websocket`.
- [x] Reject DOM globals in `@nnrp/native-client`, `@nnrp/native-server`, `@nnrp/transport-tcp`, and
      `@nnrp/transport-quic`.
- [x] Reject direct package-to-source imports in built packages.
- [x] Add Node import smoke for built native role and native transport packages.
- [x] Add browser bundling smoke for built browser client and WebSocket transport packages.

## Release Artifact Shape

- [x] Decide npm package versioning policy for preview builds.
- [x] Ensure corrected preview3 hotfix package versions are synchronized.
- [x] Decide whether native artifacts are bundled, optional peer artifacts, or downloaded by package policy.
- [x] Decide whether browser runtime assets are bundled or externally injected by package policy.
- [x] Publish only corrected preview3 package set from release workflow.
- [x] Keep release assets and npm publish lists aligned with the corrected preview3 package graph.
- [x] Document supported Node versions.
- [x] Document supported browser baseline.
- [x] Add release dry-run workflow before enabling publish.
