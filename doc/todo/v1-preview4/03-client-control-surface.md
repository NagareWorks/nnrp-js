# 03 - Client Control Surface

## Native and Browser Parity

- [x] Add the same Preview4 methods to `NnrpClientSession` and `NnrpBrowserClientSession`.
  - [x] `cancel(metadata, diagnostic?)`.
  - [x] `abort(metadata, diagnostic?)`.
  - [x] `updatePriority(metadata)`.
  - [x] `updateDeadline(metadata)`.
  - [x] `expireAt(metadata)`.
  - [x] `supersede(metadata, diagnostic?)`.
  - [x] `updateBudget(metadata)`.
  - [x] `negotiateCapabilities(metadata, body?)`.
  - [x] `degradeProfile(metadata, body?)`.
  - [x] `sendRouteHint(metadata, body?)`.
  - [x] `sendExecutionHint(metadata, body?)`.
  - [x] `sendTraceContext(metadata, body?)`.
  - [x] `sendControl(messageType, metadata, tail?)`.
- [x] Route every method through the codec and one coarse runtime submit call.
  - [x] Preserve caller-supplied control sequence values through encoding and dispatch.
  - [x] Validate the message direction before runtime dispatch.
  - [x] Surface native/WASM status and diagnostics as typed JavaScript errors.

## Submit Cancellation and Deadlines

- [ ] Add frozen submit options to `submit` and `submitNoWait`.
  - [ ] Reject an already-aborted signal before dispatch.
  - [ ] Send `Cancel` when a signal aborts after dispatch.
  - [ ] Send `Deadline` before dispatch when `timeoutMillis` is present.
  - [ ] Cancel in-flight work when the local timeout expires.
  - [ ] Remove abort listeners after terminal completion.
- [ ] Keep cancellation semantics on the protocol path.
  - [ ] Do not add an out-of-band provider cancellation message.
  - [ ] Do not resolve a cancelled operation with a late normal result.
  - [ ] Deliver result-drop reason and trace events after cancellation.

## Event Consumption

- [x] Extend `nextEvent()` and `events()` with the complete Preview4 event union.
  - [x] Preserve operation-local ordering.
  - [x] Preserve backpressure and credit updates.
  - [x] Preserve progress and partial-result sequence values.
  - [x] Preserve object/cache event metadata and owned tail bytes.

## Acceptance Evidence

- [x] Native-client tests cover every public control method and failure path.
- [x] Browser-client tests cover every public control method and failure path.
- [ ] AbortSignal tests cover pre-dispatch, in-flight, terminal, and listener-cleanup cases.
- [x] Type tests prove native and browser client session method parity.
- [x] Public API snapshots match the frozen JavaScript client page in `nnrp-doc`.
