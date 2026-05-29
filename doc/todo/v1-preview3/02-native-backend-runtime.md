# JS/TS Preview3 Native Backend Runtime

## Scope

1. Implement Node.js/Deno backend runtime APIs on top of `nnrp-rs` native FFI artifacts.
2. Support backend client and server usage without shipping browser client code in the backend artifact.
3. Keep native loading explicit, diagnosable, and artifact-manifest driven.

## Native Dependency

- [ ] Consume `nnrp-rs` native artifact packages for Windows, Linux, macOS, Android, and iOS where applicable.
- [ ] Parse native artifact `manifest.json` before loading any library.
- [ ] Validate required exported symbols before exposing runtime APIs.
- [ ] Resolve local library path from explicit option, environment variable, package artifact, then system policy.
- [ ] Surface rejected candidates with structured diagnostics.

## Backend API

- [ ] Add `NnrpBackendRuntime.open(options)`.
- [ ] Add `NnrpClient.connect(options)` for backend native mode.
- [ ] Add `NnrpServer.listen(options)` for backend native mode.
- [ ] Add `NnrpClientSession` and `NnrpServerSession` wrappers over native handles.
- [ ] Add operation submit/cancel/result/event APIs.
- [ ] Add session open/patch/close/recovery APIs.
- [ ] Add flow-control and backpressure diagnostics.

## Transport Providers

- [ ] Consume native TCP provider capability from Rust artifact when available.
- [ ] Consume native QUIC provider capability from Rust artifact when available.
- [ ] Select transport by provider score, not by fixed QUIC-first preference.
- [ ] Expose rejected provider diagnostics.

## Backend Artifact Gate

- [ ] Packed backend package contains native loader, backend client, and backend server APIs.
- [ ] Packed backend package does not contain browser-only client transport implementation.
- [ ] Packed backend package does not import DOM globals.
- [ ] CI runs backend API smoke on Node.js.
- [ ] CI runs Deno tooling smoke without adding Deno-specific runtime API dependencies.
