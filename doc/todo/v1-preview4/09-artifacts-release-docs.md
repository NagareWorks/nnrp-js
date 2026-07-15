# 09 - Artifacts, Release, and Docs

## Rust Preview4 Artifact Adoption

- [ ] Set the default Rust artifact version to `1.0.0-preview.4.4`.
  - [x] Update release workflow inputs and fallback values.
  - [x] Update local artifact preparation defaults.
  - [ ] Record the resolved Rust release tag and checksums in dry-run evidence.
- [x] Stage all transport-scoped native artifacts.
  - [x] Download TCP platform archives into `@nnrp/transport-tcp`.
  - [x] Download QUIC platform archives into `@nnrp/transport-quic`.
  - [x] Download IPC platform archives into `@nnrp/transport-ipc`.
  - [x] Download WebSocket platform archives into `@nnrp/transport-websocket`.
  - [x] Cover every platform/architecture published by Rust Preview4.
- [x] Stage the browser artifact.
  - [x] Download `nnrp-wasm-browser` into `@nnrp/browser-client`.
  - [x] Validate the WASM, loader, declarations, manifest, and checksums.
  - [x] Reject `nnrp-wasm-primitives` and transport-scoped WASM names.
- [x] Normalize npm-owned artifact manifests.
  - [x] Remove C-header-only `header`, `headers`, and `legacy_header` fields while staging.
  - [x] Preserve ABI, feature, target, library, checksum, and capability fields.
  - [x] Keep C headers out of JavaScript package contents and public TypeScript types.

## Workspace and Package Automation

- [x] Register all Preview4 packages in workspace automation.
  - [x] Add IPC to imports, clean, build, typecheck, lint, test, API snapshot, and publish lists.
  - [x] Add IPC and WebSocket to native artifact preparation and package checks.
  - [x] Update optional peer dependencies for both native role packages.
  - [x] Preserve browser-client dependency on core and WebSocket provider without native peers.
- [x] Enforce tarball ownership.
  - [x] Role tarballs contain no native transport libraries.
  - [x] Each transport tarball contains only its own platform libraries.
  - [x] Browser-client contains one browser WASM artifact and no native library.
  - [x] WebSocket contains no duplicate browser WASM.
  - [x] No package exposes a private platform-artifact package as a user install target.

## Release Workflow

- [ ] Update Preview4 workspace versions consistently.
  - [ ] Set every publishable package to the same Preview4 SDK version.
  - [ ] Set internal dependency ranges to the exact workspace release version during staging.
  - [ ] Validate the Git tag version against every staged package version.
- [ ] Keep publishing rerunnable and trusted.
  - [ ] Publish in dependency order: core, transports, role packages.
  - [ ] Skip an already-published identical package version and continue remaining packages.
  - [ ] Fail on an already-published version whose staged tarball digest differs.
  - [ ] Apply requested npm dist-tags after every package version exists.
  - [ ] Create or verify the matching Git tag only after npm publication succeeds.

## Documentation and Package Metadata

- [ ] Synchronize repository and npm documentation.
  - [ ] Document role-package selection.
  - [ ] Document all four carrier packages and application/provider endpoint separation.
  - [ ] Document native and browser client parity and server-only APIs.
  - [ ] Document control, object/cache, IPC, native WebSocket, and browser WebSocket examples.
  - [ ] Document wire-conformance commands and expected evidence files.
- [ ] Validate package metadata.
  - [ ] Every package has description, keywords, license, repository, exports, files, and runtime constraints.
  - [ ] Every package README has the shared banner, installation, owned boundary, and relevant example.
  - [ ] The repository README has the contributor avatar wall and current package map.

## Final Validation

- [ ] Run `deno task lint`.
- [ ] Run `deno task test` and the 90 percent line coverage gate.
- [ ] Run `deno task package-check` and `deno task release-dry-run`.
- [ ] Inspect every generated npm tarball and GitHub release archive.
- [ ] Validate installed-package smoke tests on Node, Deno, and a browser runner.
- [ ] Confirm all Preview4 todo files contain zero unchecked boxes before release.
