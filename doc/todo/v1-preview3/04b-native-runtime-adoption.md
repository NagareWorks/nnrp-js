# JS/TS Preview3 Native Runtime Adoption

## Scope

1. Implement `@nnrp/native` on top of `nnrp-rs` native artifacts.
2. Support Node.js/Deno client-first usage, backend services, and adapter processes.
3. Keep native loading explicit, diagnosable, lazy, and artifact-manifest driven.

## Native Artifact Resolution

- [ ] Consume `nnrp-rs` native artifact packages for supported desktop/server targets.
- [ ] Parse native artifact `manifest.json` before loading any library.
- [ ] Validate ABI version compatibility.
- [ ] Validate required exported symbols before exposing runtime APIs.
- [ ] Resolve local library path from explicit option.
- [ ] Resolve local library path from environment variable.
- [ ] Resolve local library path from packaged artifact.
- [ ] Resolve local library path from system policy only when explicitly enabled.
- [ ] Surface rejected candidates with structured diagnostics.
- [ ] Add tests for explicit path, environment path, packaged path, and missing artifact.

## Native Binding Layer

- [ ] Choose a binding mechanism that works for Node-compatible packages and release artifacts.
- [ ] Keep raw FFI handles private.
- [ ] Wrap runtime handles.
- [ ] Wrap client handles.
- [ ] Wrap server handles.
- [ ] Wrap session handles.
- [ ] Wrap operation handles/ids.
- [ ] Map native status/error objects to `NnrpDiagnostic`.
- [ ] Ensure finalizers do not hide required explicit close behavior.
- [ ] Add fake-binding tests for handle ownership and double-close.

## Client-First API

- [ ] Add `openNativeClient(options)`.
- [ ] Add `NnrpNativeClientOptions`.
- [ ] Open runtime, connect endpoint, and return `NnrpClient`.
- [ ] Apply `sessionDefaults` to sessions.
- [ ] Add `NnrpClient.openSession(options)`.
- [ ] Add `NnrpClient.close()`.
- [ ] Add tests for client open/close and failed connect diagnostics.

## Backend Runtime API

- [ ] Add `openBackendRuntime(options)`.
- [ ] Add `NnrpBackendRuntime.connect(options)`.
- [ ] Add `NnrpBackendRuntime.listen(options)`.
- [ ] Add `NnrpBackendRuntime.close()`.
- [ ] Add `NnrpServer.accept()`.
- [ ] Add `NnrpServer.close()`.
- [ ] Add tests for runtime connect/listen lifecycle.

## Session and Operation API

- [ ] Add `NnrpClientSession.submit(request)`.
- [ ] Add `NnrpClientSession.submitNoWait(request)`.
- [ ] Add `NnrpClientSession.nextEvent(options?)`.
- [ ] Add `NnrpClientSession.cancel(operationIdOrFrameId, options?)`.
- [ ] Add `NnrpClientSession.close(reason?)`.
- [ ] Add `NnrpServerSession.receive(options?)`.
- [ ] Add `NnrpServerSession.sendResult(result)`.
- [ ] Add `NnrpServerSession.close(reason?)`.
- [ ] Preserve backpressure and flow-control diagnostics.
- [ ] Add tests for submit/result, no-wait/event, cancel, and close paths.

## Native Package Gates

- [ ] Packed native package contains native loader and runtime wrappers.
- [ ] Packed native package contains client and server APIs.
- [ ] Packed native package does not contain browser transport implementation files.
- [ ] Packed native package does not import DOM globals.
- [ ] CI runs Node import smoke for `@nnrp/native`.
- [ ] CI runs Deno tooling smoke without adding Deno-specific runtime API dependencies.
