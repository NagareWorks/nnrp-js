# 04 - Server Control Surface

## Receive Path

- [ ] Extend `NnrpServerSession.receive(options?)` to return the complete Preview4 event union.
  - [ ] Decode incoming cancellation and scheduling controls.
  - [ ] Decode capability, route, execution, and trace controls.
  - [ ] Decode object and cache frames.
  - [ ] Preserve operation-local order and owned tail bytes.

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
- [ ] Keep final result semantics separate.
  - [ ] Preserve `sendResult(result)` as the terminal result API.
  - [ ] Reject partial-result or progress sends after a terminal result.
  - [ ] Reject a second terminal result.
  - [ ] Permit the frozen result-drop and trace terminal evidence sequence.

## Runtime and Provider Integration

- [x] Route every method through the codec and one coarse runtime call.
  - [x] Validate message direction before dispatch.
  - [x] Validate body/diagnostic length before dispatch.
  - [x] Map native status and diagnostics to typed errors.
- [ ] Keep listener lifecycle provider-neutral.
  - [ ] The server role receives a selected provider from `@nnrp/core` policy resolution.
  - [ ] The server role does not import provider implementation internals.
  - [ ] Forced and automatic provider selection use the same listener lifecycle.

## Acceptance Evidence

- [ ] Server tests cover every receive and send method.
- [ ] State-machine tests cover partial, terminal, duplicate-terminal, and post-terminal behavior.
- [x] Direction tests reject client-only messages from server send helpers.
- [x] Public API snapshots match the frozen JavaScript server page in `nnrp-doc`.
