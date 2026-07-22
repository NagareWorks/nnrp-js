# 04 - Server Control Surface

## Receive Path

- [x] Extend `NnrpServerSession.receive(options?)` to return the complete Preview4 event union.
  - [x] Decode incoming cancellation and scheduling controls.
  - [x] Decode capability, route, execution, and trace controls.
  - [x] Decode object and cache frames.
  - [x] Preserve operation-local order and owned tail bytes.

## Incremental Result and Flow Methods

- [x] Add every frozen server control method.
  - [x] `sendProgress(metadata, body?)`.
  - [x] `sendPartialResult(metadata, body?)`.
  - [x] `sendBackpressure(metadata)`.
  - [x] `sendCreditUpdate(metadata)`.
  - [x] `sendResultDropReason(metadata, diagnostic?)`.
  - [x] `sendTraceContext(metadata, body?)`.
  - [x] `sendRecoverableError(metadata, diagnostic?)`.
  - [x] `sendRetryAfter(metadata, diagnostic?)`.
  - [x] Public `sendControl(messageType, metadata, tail?)` escape hatch.
- [x] Keep final result semantics separate.
  - [x] Preserve `sendResult(result)` as the terminal result API.
  - [x] Reject partial-result or progress sends after a terminal result.
  - [x] Reject a second terminal result.
  - [x] Permit the frozen result-drop and trace terminal evidence sequence.

## Runtime and Provider Integration

- [x] Route every method through the codec and one coarse runtime call.
  - [x] Validate message direction before dispatch.
  - [x] Validate body/diagnostic length before dispatch.
  - [x] Map native status and diagnostics to typed errors.
- [ ] Keep listener lifecycle provider-neutral.
  - [ ] The server role receives a selected provider from `@nnrp/core` policy resolution.
  - [x] The server role does not import provider implementation internals.
  - [x] Forced and automatic provider selection use the same listener lifecycle.
- [x] Bind the selected provider listener to the native server role runtime.
  - [x] Transfer listener ownership inside the same transport-scoped library.
  - [x] Accept a real carrier connection and complete `SESSION_OPEN` handling in Rust.
  - [x] Receive submit/control/object/cache events from the carrier-backed server session.
  - [x] Send partial/terminal/drop/trace output over the accepted carrier.
  - [x] Close accepted sessions and the listener exactly once.

## Acceptance Evidence

- [x] Server tests cover every receive and send method.
- [x] State-machine tests cover partial, terminal, duplicate-terminal, and post-terminal behavior.
- [x] Direction tests reject client-only messages from server send helpers.
- [x] Public API snapshots match the frozen JavaScript server page in `nnrp-doc`.
