# 03 - Client Control Surface

## Native and Browser Parity

- [ ] Add the same Preview4 methods to `NnrpClientSession` and `NnrpBrowserClientSession`.
  - [ ] `cancel(metadata, diagnostic?)`.
  - [ ] `abort(metadata, diagnostic?)`.
  - [ ] `updatePriority(metadata)`.
  - [ ] `updateDeadline(metadata)`.
  - [ ] `expireAt(metadata)`.
  - [ ] `supersede(metadata, diagnostic?)`.
  - [ ] `updateBudget(metadata)`.
  - [ ] `negotiateCapabilities(metadata, body?)`.
  - [ ] `degradeProfile(metadata, body?)`.
  - [ ] `sendRouteHint(metadata, body?)`.
  - [ ] `sendExecutionHint(metadata, body?)`.
  - [ ] `sendTraceContext(metadata, body?)`.
  - [ ] `sendControl(messageType, metadata, tail?)`.
- [ ] Route every method through the codec and one coarse runtime submit call.
  - [ ] Allocate control sequence values consistently per operation/session.
  - [ ] Validate the message direction before runtime dispatch.
  - [ ] Surface native/WASM status and diagnostics as typed JavaScript errors.

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

- [ ] Extend `nextEvent()` and `events()` with the complete Preview4 event union.
  - [ ] Preserve operation-local ordering.
  - [ ] Preserve backpressure and credit updates.
  - [ ] Preserve progress and partial-result sequence values.
  - [ ] Preserve object/cache event metadata and owned tail bytes.

## Acceptance Evidence

- [ ] Native-client tests cover every public control method and failure path.
- [ ] Browser-client tests cover every public control method and failure path.
- [ ] AbortSignal tests cover pre-dispatch, in-flight, terminal, and listener-cleanup cases.
- [ ] Type tests prove native and browser client session method parity.
- [ ] Public API snapshots match the frozen JavaScript client page in `nnrp-doc`.
