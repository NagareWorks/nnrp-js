# 10 - SDK Contract V15 Role Events And Multiplexing

This workstream adopts frozen NNRP/1 Preview4 SDK API contract version 15. Public JavaScript APIs remain
transport-neutral and never expose native handles, generations, raw recovery tokens, or earlier-preview compatibility
paths.

## Core Contract

- [x] Add canonical `NnrpSessionRecoveryTicket` with the exact NRTK version 1 encoding and validation rules.
- [x] Add exact 48-byte `NnrpSessionOpenMetadata` and `NnrpSessionPriorityClass` codec surfaces.
- [x] Export the frozen recovery and multiplexing symbols and reject non-canonical ticket or metadata encodings.
- [x] Upgrade the machine-contract checker to version 15.
- [x] Validate every JavaScript v15 projection, option field, default, role operation, and async semantic.
- [x] Freeze deterministic pre-dispatch cancellation, post-dispatch cancellation, timeout, and lifecycle-race behavior.

## Closed Role Events

- [x] Expose `@nnrp/core.NnrpClientEvent` as the exact runtime/lifecycle tagged union.
- [x] Return `NnrpClientEvent` from native and browser event polling and async iteration.
- [x] Decode native and WASM headerless lifecycle packets without synthesizing wire headers.
- [x] Expose `@nnrp/native-server.NnrpServerEvent` as the exact submit/runtime/lifecycle tagged union.
- [x] Expose owning `@nnrp/native-server.NnrpServerOperation` instances for submit delivery and replies.
- [x] Make `receiveSubmit()` selective without dropping skipped runtime or lifecycle events.
- [x] Remove session-owned operation reply methods and reject generic-control bypasses.
- [x] Preserve the exact native operation handle for progress, partial, result, and result-drop sends.

## Native Client

- [x] Replace flow-only session options with every frozen `NnrpSessionOptions` field and default.
- [x] Keep endpoint, provider routes, transport policy, and session defaults on `NnrpNativeClientOptions`.
- [x] Make `NnrpClient.openSession(options?)` await the real native handshake before returning.
- [x] Add `NnrpClient.resumeSession(ticket, options?)` through the Rust resume boundary.
- [x] Add `NnrpClientSession.recoveryTicket()` through the Rust-owned ticket buffer boundary.
- [x] Keep one native connection reusable across many concurrent protocol sessions.
- [x] Allocate private FFI session handles independently from requested protocol session ids.
- [x] Keep CLIENT_HELLO and SERVER_HELLO_ACK automatic with no application bypass.

## Browser Client

- [x] Project the same frozen client session fields, defaults, async open/resume operations, and recovery-ticket type.
- [x] Keep browser session handles private and allow one browser connection to own many protocol sessions.
- [x] Pass open, resume, and recovery-ticket operations through the browser-client WASM runtime boundary.
- [x] Preserve WebSocket as the browser-owned carrier while the WASM runtime owns protocol session semantics.
- [x] Keep CLIENT_HELLO and SERVER_HELLO_ACK automatic with no browser application bypass.

## Native Server

- [x] Add exact `NnrpServerSessionOptions`, `NnrpServerAcceptOptions`, policy decision, and async policy types.
- [x] Keep endpoint, provider routes, transport policy, and session defaults on `NnrpListenOptions`.
- [x] Restrict public accept options to timeout and keep native handle allocation internal.
- [x] Pass all negotiation, cache, schema, credit, recovery, and policy fields through server adoption.
- [x] Preserve multiple sessions per logical server and active-transport identity per accepted session.
- [x] Keep policy callback objects and diagnostic bytes alive for the complete Rust callback invocation.

## ABI 4.4 Provider Bindings

- [x] Update all TCP, QUIC, IPC, and WebSocket Deno FFI layouts to ABI 4.4.
- [x] Update all TCP, QUIC, IPC, and WebSocket Node FFI layouts to ABI 4.4.
- [x] Add exact u16/u32 slice, server policy, expanded bind/open/resume, and recovery-ticket boundaries.
- [x] Preserve package-owned carrier and role behavior in every transport package.
- [x] Assert ABI sizes, offsets, symbols, and manifest versions on 32-bit and 64-bit layouts.
- [x] Keep role-level calls coarse; recovery must not add per-frame FFI crossings.
- [x] Update the browser-client WASM import/export contract for frozen session open, resume, and recovery tickets.

## Validation And Release

- [x] Add unit coverage for canonical tickets, option validation, async handshake, resume, policy, and multi-session
      use.
- [x] Run real TCP, QUIC, IPC, and WebSocket role E2E against successful full-matrix Rust workflow artifact run
      `31442036247` at merge commit `13f72e7a81a54b9eb26ee68e399c2cf84bb5525d`.
- [x] Run suite-owned adapter conformance and native/browser independent-process wire E2E without skips.
- [x] Run format, lint, typecheck, tests, total and incremental coverage, build, package, and installed-package gates.
- [x] Inspect every staged npm package and verify only provider packages contain their owned native artifacts.
- [x] Update README, release notes, examples, and public API snapshots after implementation matches contract v15.
- [ ] Pin the audited Rust ABI 4.4 release that contains the server-operation lifetime fix after all SDKs align.
