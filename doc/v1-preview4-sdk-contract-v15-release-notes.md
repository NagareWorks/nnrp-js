# Preview4 SDK Contract V15 Release Notes

This release adopts the frozen NNRP/1 Preview4 SDK API contract version 15 and the Rust ABI 4.4 role boundary. It
provides transport-neutral negotiated client and server sessions with explicit server-operation ownership.

## Session Lifecycle

- `NnrpClient.openSession()` and the browser equivalent are asynchronous and complete only after the NNRP session
  handshake succeeds.
- One native or browser connection can own multiple independent protocol sessions.
- `resumeSession()` and `recoveryTicket()` use the canonical NRTK version 1 ticket encoding without exposing native
  handles or raw runtime tokens.
- Native server acceptance is asynchronous, supports multiple sessions, and applies the frozen server policy decision
  contract before a session becomes public.
- `NnrpServerSession.nextEvent()` returns the closed submit/runtime/lifecycle union, while `receiveSubmit()` selects an
  operation without discarding skipped events.
- Every accepted submit carries an `NnrpServerOperation`; progress, partial result, result, and result-drop methods are
  available only on that operation.
- Submit cancellation and timeout deterministically reject the local wait, dispatch protocol cancellation only after
  submit dispatch, and keep the resulting lifecycle event observable through `nextEvent()`.

## Runtime Boundaries

- TCP, QUIC, IPC, and native WebSocket packages each own their carrier implementation and native artifact.
- Native client and server packages own role orchestration but do not duplicate transport libraries.
- Browser client owns the protocol WASM runtime and uses the browser WebSocket carrier; native libraries are never
  included in browser packages.
- Role operations remain coarse across FFI and WASM boundaries. Recovery and multiplexing do not introduce a per-frame
  language boundary crossing.

## Compatibility

Preview4 is a breaking preview contract. This release does not provide compatibility aliases or fallback behavior for
earlier preview APIs. Applications must await session creation and adopt the contract v15 role-event, operation,
session-option, and recovery types.

## Validation

The release gate covers all four native carriers, browser WASM role execution, multi-session isolation, recovery, server
policy, suite-owned adapter conformance, independent-process wire conformance, package ownership, and installed Node,
Deno, and browser imports.
