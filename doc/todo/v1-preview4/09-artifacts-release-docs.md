# 09 - Artifacts, Release, and Docs

## Coordinated Route-Contract Release Gate

- [x] Do not publish another JavaScript Preview4 package until the full route-cardinality correction is complete.
  - [x] Native client multi-route selection passes suite-owned E2E.
  - [x] Native server multi-listener ownership and rollback pass suite-owned E2E.
  - [x] Native and browser security-intent matrices pass.
  - [x] Public declarations contain route sets and no production singular route overrides.
- [x] Pin reviewed Rust artifact `1.0.0-preview.4.24`, containing the complete unified role-event ABI and preserving
      protocol operation identity independently from opaque native handles and frame identity.
- [x] Reinspect every npm tarball for role, transport-native, and browser-WASM ownership boundaries.
- [x] Publish only after the cross-SDK design-to-code audit has no unresolved findings.

## Rust Preview4 Artifact Adoption

- [x] Set the default Rust artifact version to `1.0.0-preview.4.24`.
  - [x] Update release workflow inputs and fallback values.
  - [x] Update local artifact preparation defaults.
  - [x] Record the resolved Rust release tag and checksums in dry-run evidence.
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

- [x] Update Preview4 workspace versions consistently.
  - [x] Set every publishable package to the same Preview4 SDK version.
  - [x] Set internal dependency ranges to the exact workspace release version during staging.
  - [x] Validate the Git tag version against every staged package version.
- [x] Keep publishing rerunnable and trusted.
  - [x] Publish in dependency order: core, transports, role packages.
  - [x] Skip an already-published identical package version and continue remaining packages.
  - [x] Fail on an already-published version whose staged tarball digest differs.
  - [x] Apply one requested canonical npm dist-tag through each publish, then verify it after every package version
        exists; reject post-publish tag mutation under Trusted Publishing.
  - [x] Create or verify the matching Git tag only after npm publication succeeds.

## Documentation and Package Metadata

- [x] Synchronize repository and npm documentation.
  - [x] Document role-package selection.
  - [x] Document all four carrier packages and application/provider endpoint separation.
  - [x] Document native and browser client parity and server-only APIs.
  - [x] Document control, object/cache, IPC, native WebSocket, and browser WebSocket examples.
  - [x] Document wire-conformance commands and expected evidence files.
- [x] Validate package metadata.
  - [x] Every package has description, keywords, license, repository, exports, files, and runtime constraints.
  - [x] Every package README has the shared banner, installation, owned boundary, and relevant example.
  - [x] The repository README has the contributor avatar wall and current package map.

## Final Validation

- [x] Run `deno task lint`.
- [x] Run `deno task test` and the 90 percent line coverage gate.
- [x] Run `deno task package-check` and `deno task release-dry-run`.
- [x] Inspect every generated npm tarball and GitHub release archive.
- [x] Validate installed-package smoke tests on Node, Deno, and a browser runner.
- [x] Confirm all Preview4 todo files contain zero unchecked boxes before release.
