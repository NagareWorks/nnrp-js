# JS/TS Preview3 Native Runtime Adoption

## Scope

1. Implement `@nnrp/native` on top of `nnrp-rs` native artifacts.
2. Support Node.js/Deno client-first usage, backend services, and adapter processes.
3. Keep native loading explicit, diagnosable, lazy, and artifact-manifest driven.

## Native Artifact Resolution

- [x] Consume `nnrp-rs` native artifact packages for supported desktop/server targets.
- [x] Parse native artifact `manifest.json` before loading any library.
- [x] Validate ABI version compatibility.
- [x] Validate required exported symbols before exposing runtime APIs.
- [x] Resolve local library path from explicit option.
- [x] Resolve local library path from environment variable.
- [x] Resolve local library path from packaged artifact.
- [x] Resolve local library path from system policy only when explicitly enabled.
- [x] Surface rejected candidates with structured diagnostics.
- [x] Add tests for explicit path, environment path, packaged path, and missing artifact.

## Native Binding Layer

- [ ] Choose a production binding mechanism that works for Node-compatible packages and release artifacts.
- [x] Define a coarse FFI binding contract that batches submit/result and event polling work.
- [x] Keep raw FFI handles private.
- [x] Wrap runtime handles.
- [x] Wrap client handles.
- [x] Wrap server handles.
- [x] Wrap session handles.
- [x] Wrap operation handles/ids.
- [x] Probe native runtime capabilities before exposing accelerated runtime paths.
- [x] Map native status/error objects to `NnrpDiagnostic`.
- [ ] Ensure finalizers do not hide required explicit close behavior.
- [x] Add fake-binding tests for handle ownership and double-close.

## Client-First API

- [x] Add `openNativeClient(options)`.
- [x] Add `NnrpNativeClientOptions`.
- [x] Open runtime, connect endpoint, and return `NnrpClient`.
- [x] Apply `sessionDefaults` to sessions.
- [x] Add `NnrpClient.openSession(options)`.
- [x] Add `NnrpClient.close()`.
- [x] Add tests for client open/close and failed connect diagnostics.

## Backend Runtime API

- [x] Add `openBackendRuntime(options)`.
- [x] Add `NnrpBackendRuntime.connect(options)`.
- [x] Add `NnrpBackendRuntime.listen(options)`.
- [x] Add `NnrpBackendRuntime.close()`.
- [x] Add `NnrpServer.accept()`.
- [x] Add `NnrpServer.close()`.
- [x] Add tests for runtime connect/listen lifecycle.

## Session and Operation API

- [x] Add `NnrpClientSession.submit(request)`.
- [x] Add `NnrpClientSession.submitNoWait(request)`.
- [x] Add `NnrpClientSession.nextEvent(options?)`.
- [x] Add `NnrpClientSession.cancel(operationIdOrFrameId, options?)`.
- [x] Add `NnrpClientSession.close(reason?)`.
- [x] Add `NnrpServerSession.receive(options?)`.
- [x] Add `NnrpServerSession.sendResult(result)`.
- [x] Add `NnrpServerSession.close(reason?)`.
- [x] Preserve backpressure and flow-control diagnostics.
- [x] Add tests for submit/result, no-wait/event, cancel, and close paths.

## Native Package Gates

- [x] Packed native package contains native loader and runtime wrappers.
- [x] Packed native package contains client and server APIs.
- [x] Packed native package does not contain browser transport implementation files.
- [x] Packed native package does not import DOM globals.
- [x] CI runs Node import smoke for `@nnrp/native`.
- [x] CI runs Deno tooling smoke without adding Deno-specific runtime API dependencies.
