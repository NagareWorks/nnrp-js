# 06 - IPC Carrier Provider

## Package and Native Artifact

- [x] Add the `@nnrp/transport-ipc` workspace package.
  - [x] Export `createIpcTransportProvider(options?)`.
  - [x] Export frozen provider option, probe, connection, listener, and diagnostic types.
  - [x] Add package metadata, README, public API snapshot, and workspace import mapping.
- [x] Load only Rust Preview4 IPC artifacts.
  - [x] Resolve the current platform from the package-owned `native` directory.
  - [x] Validate artifact scope `ipc`, ABI version, architecture, library file, and checksum metadata.
  - [x] Bind IPC connect/listen/read/write/close behavior through the package-owned native binding.
  - [x] Fail explicitly on an unsupported platform or missing artifact.

## Endpoint and Lifecycle

- [x] Implement IPC endpoint handling.
  - [x] Accept `unix://` provider endpoints on Unix hosts.
  - [x] Accept `npipe://` provider endpoints on Windows hosts.
  - [x] Reject platform-incompatible IPC schemes.
  - [x] Reject IPC as a browser provider.
- [x] Implement client and server lifecycle.
  - [x] Connect, write, read, close, and propagate diagnostics.
  - [x] Listen, accept, close listener, and reject accept after close.
  - [x] Preserve frame boundaries and backpressure through the Rust provider.
  - [x] Do not route IPC through TCP loopback or a config-only provider.

## Selection and Tests

- [x] Integrate IPC with installed-provider discovery.
  - [x] Select IPC directly when it is the only compatible installed provider.
  - [x] Include IPC cost, limit, and diagnostics in multi-provider probing.
  - [x] Enforce `prefer-ipc` and `force-ipc` semantics.
- [x] Add provider tests.
  - [x] Unix-domain loopback fixture.
  - [x] Windows named-pipe loopback fixture.
  - [x] Invalid endpoint, missing artifact, close, timeout, and backpressure cases.
  - [x] Native client/server session integration over IPC.

## Acceptance Evidence

- [x] Package policy proves only IPC native artifacts are present.
- [x] Loopback tests exchange control, object, cache, partial-result, and terminal frames.
- [x] Public API snapshot `scripts/public-api/transport-ipc.d.ts` matches the frozen JavaScript transport page in
      `nnrp-doc`.
