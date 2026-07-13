# 06 - IPC Carrier Provider

## Package and Native Artifact

- [ ] Add the `@nnrp/transport-ipc` workspace package.
  - [ ] Export `createIpcTransportProvider(options?)`.
  - [ ] Export frozen provider option, probe, connection, listener, and diagnostic types.
  - [ ] Add package metadata, README, public API snapshot, and workspace import mapping.
- [ ] Load only Rust Preview4 IPC artifacts.
  - [ ] Resolve the current platform from the package-owned `native` directory.
  - [ ] Validate artifact scope `ipc`, ABI version, architecture, library file, and checksum metadata.
  - [ ] Bind IPC connect/listen/read/write/close behavior through the package-owned native binding.
  - [ ] Fail explicitly on an unsupported platform or missing artifact.

## Endpoint and Lifecycle

- [ ] Implement IPC endpoint handling.
  - [ ] Accept `unix://` provider endpoints on Unix hosts.
  - [ ] Accept `npipe://` provider endpoints on Windows hosts.
  - [ ] Reject platform-incompatible IPC schemes.
  - [ ] Reject IPC as a browser provider.
- [ ] Implement client and server lifecycle.
  - [ ] Connect, write, read, half-close, close, and propagate diagnostics.
  - [ ] Listen, accept, close listener, and reject accept after close.
  - [ ] Preserve frame boundaries and backpressure through the Rust provider.
  - [ ] Do not route IPC through TCP loopback or a config-only provider.

## Selection and Tests

- [ ] Integrate IPC with installed-provider discovery.
  - [ ] Select IPC directly when it is the only compatible installed provider.
  - [ ] Include IPC cost, limit, and diagnostics in multi-provider probing.
  - [ ] Enforce `prefer-ipc` and `force-ipc` semantics.
- [ ] Add provider tests.
  - [ ] Unix-domain loopback fixture.
  - [ ] Windows named-pipe loopback fixture.
  - [ ] Invalid endpoint, missing artifact, close, cancellation, and backpressure cases.
  - [ ] Native client/server session integration over IPC.

## Acceptance Evidence

- [ ] Package policy proves only IPC native artifacts are present.
- [ ] Loopback tests exchange control, object, cache, partial-result, and terminal frames.
- [ ] Public API snapshot matches the frozen JavaScript transport page in `nnrp-doc`.
