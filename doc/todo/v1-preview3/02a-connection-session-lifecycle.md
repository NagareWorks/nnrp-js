# JS/TS Preview3 Connection and Session Lifecycle

## Scope

1. Define how JavaScript opens native/browser runtimes, connects clients, listens as a server, and owns sessions.
2. Expose a client-first API for Node/Deno applications while retaining a full backend runtime for services/adapters.
3. Keep raw native/WASM handles private and lifecycle-safe.

## Native Client Lifecycle

- [x] Add public `openNativeClient(options)` in `@nnrp/native`.
- [x] Load native artifacts only inside `openNativeClient` or explicit runtime open functions.
- [ ] Connect to endpoint after manifest and required-symbol validation.
- [x] Return `NnrpClient` with no raw handle exposure.
- [x] Support explicit close/dispose on `NnrpClient`.
- [x] Reject use-after-close with structured diagnostics.
- [x] Add Node smoke test for `openNativeClient` without real network by using a test loader/fake binding.
- [ ] Add docs example for coding-agent/CLI client usage.

## Native Backend Runtime Lifecycle

- [x] Add public `openBackendRuntime(options)` in `@nnrp/native`.
- [x] Add `NnrpBackendRuntime.connect(options)` for client mode when explicit runtime lifecycle is needed.
- [x] Add `NnrpBackendRuntime.listen(options)` for server mode.
- [x] Add `NnrpServer.accept()` for incoming sessions.
- [x] Add explicit runtime close/dispose semantics.
- [x] Ensure closing a runtime closes child clients/servers/sessions or rejects if children are still active.
- [x] Map native lifecycle failures to `NnrpDiagnostic`.
- [x] Add lifecycle tests for open/connect/listen/close ordering.

## Browser Runtime Lifecycle

- [ ] Add public `openBrowserRuntime(options)` or documented equivalent in `@nnrp/wasm`.
- [ ] Validate WASM manifest before instantiation.
- [ ] Instantiate WASM lazily, not during module import.
- [ ] Add `NnrpBrowserRuntime.connect(options)`.
- [ ] Add `NnrpBrowserClient` with explicit close/dispose semantics.
- [ ] Exclude server listen/accept APIs from browser exports.
- [ ] Add browser bundling smoke that imports the runtime without Node built-ins.

## Session Lifecycle

- [x] Add `NnrpClient.openSession(options)` in native mode.
- [ ] Add `NnrpBrowserClient.openSession(options)` in browser mode.
- [x] Add `NnrpServer.accept()` returning `NnrpServerSession` in native mode.
- [x] Wrap session ids/handles without exposing raw pointers or WASM internals.
- [ ] Add session patch/update API once Rust artifact support is available.
- [x] Add explicit `session.close(reason?)`.
- [x] Reject submit/cancel/event operations after close.
- [ ] Route events by session id so multiple sessions can share one runtime connection.
- [ ] Add multi-session lifecycle tests.

## Options and Defaults

- [x] Add `NnrpNativeClientOptions` with endpoint, native library, transport policy, and session defaults.
- [x] Add `NnrpBackendRuntimeOptions` with native artifact and transport policy settings.
- [x] Add `NnrpConnectOptions` and `NnrpListenOptions`.
- [x] Add `NnrpSessionOptions` with input profile, target cadence, quality tier, and metadata.
- [x] Validate endpoints before invoking native/WASM backends.
- [ ] Validate session metadata key/value size limits before sending.
