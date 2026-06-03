# JS/TS Preview3 Native Runtime Adoption

## Scope

1. Implement native client and native server role packages on top of `nnrp-rs` native artifacts.
2. Support Node.js/Deno client-first usage, backend services, and adapter processes.
3. Keep native loading explicit, diagnosable, lazy, and artifact-manifest driven.
4. Keep transport installation independent from role packages: `@nnrp/native-client` and `@nnrp/native-server` consume
   installed or explicitly supplied TCP/QUIC adapters instead of bundling those adapters.

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

- [x] Choose externally injected coarse FFI bindings as the production package boundary for preview3 release artifacts.
- [x] Keep concrete `native-addon`, `node-ffi`, and `nano-ffi` adapters outside the core package boundary until preview4
      binding policy is finalized.
- [x] Define a coarse FFI binding contract that batches submit/result and event polling work.
- [x] Keep raw FFI handles private.
- [x] Wrap runtime handles.
- [x] Wrap client handles.
- [x] Wrap server handles.
- [x] Wrap session handles.
- [x] Wrap operation handles/ids.
- [x] Probe native runtime capabilities before exposing accelerated runtime paths.
- [x] Map native status/error objects to `NnrpDiagnostic`.
- [x] Ensure finalizers do not hide required explicit close behavior.
- [x] Add fake-binding tests for handle ownership and double-close.

## Client-First API

- [x] Add `openNativeClient(options)` in `@nnrp/native-client`.
- [x] Add `NnrpNativeClientOptions`.
- [x] Add `transports` option accepting installed or explicit transport provider descriptors.
- [x] Add no-provider diagnostic when neither TCP nor QUIC adapter is installed or supplied.
- [x] Open runtime, connect endpoint, and return `NnrpClient`.
- [x] Apply `sessionDefaults` to sessions.
- [x] Add `NnrpClient.openSession(options)`.
- [x] Add `NnrpClient.close()`.
- [x] Add tests for client open/close and failed connect diagnostics.

## Backend Runtime API

- [x] Add `openBackendRuntime(options)` in `@nnrp/native-server`.
- [x] Add `NnrpBackendRuntime.connect(options)`.
- [x] Add `NnrpBackendRuntime.listen(options)`.
- [x] Add runtime/listen transport options accepting installed or explicit transport provider descriptors.
- [x] Add listen diagnostics when requested policy cannot be satisfied by installed adapters.
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

## Native Transport Adapter Packages

- [x] Add `@nnrp/transport-tcp` package with TCP provider descriptor exports.
- [x] Add `@nnrp/transport-quic` package with QUIC provider descriptor exports.
- [x] Keep transport packages free of client/server lifecycle exports.
- [x] Keep transport packages free of native loader implementation details beyond provider metadata.
- [x] Add installed package discovery path for TCP provider package.
- [x] Add installed package discovery path for QUIC provider package.
- [x] Add probe tests where only TCP is installed.
- [x] Add probe tests where only QUIC is installed.
- [x] Add probe tests where TCP and QUIC are both installed and policy selects one.

## Native Package Gates

- [x] Packed native client package contains native loader and client runtime wrappers.
- [x] Packed native client package does not contain server entrypoint exports.
- [x] Packed native server package contains native loader and server runtime wrappers.
- [x] Packed native server package does not contain client entrypoint exports.
- [x] Packed native packages do not contain browser transport implementation files.
- [x] Packed native packages do not import DOM globals.
- [x] CI runs Node import smoke for `@nnrp/native-client` and `@nnrp/native-server`.
- [x] CI runs Deno tooling smoke without adding Deno-specific runtime API dependencies.
