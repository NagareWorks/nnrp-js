# JS/TS Preview3 Scheduling, Events, and Diagnostics

## Scope

1. Expose submit/cancel/result/event APIs consistently across native and browser clients.
2. Preserve structured diagnostics from Rust native/WASM artifacts.
3. Make async event delivery usable for agent runtimes, CLIs, services, and browser apps.

## Submit and Result APIs

- [ ] Add `NnrpClientSession.submit(request)` for native client sessions.
- [ ] Add `NnrpBrowserClientSession.submit(request)` for browser client sessions.
- [ ] Add `NnrpClientSession.submitNoWait(request)` returning a `bigint` operation id.
- [ ] Add browser `submitNoWait` only if WASM/runtime support can deliver events safely.
- [ ] Add `NnrpServerSession.receive()` for server-side submit/control events.
- [ ] Add `NnrpServerSession.sendResult(result)`.
- [ ] Validate `frameId` uniqueness while in flight.
- [ ] Validate payload ownership rules before calling native/WASM backends.
- [ ] Map result drops to typed JS errors with diagnostics.
- [ ] Add tests for submit success, result drop, malformed request rejection, and close-during-submit.

## Cancel and Operation Lifecycle

- [ ] Add `session.cancel(operationIdOrFrameId, options?)` where supported by runtime artifacts.
- [ ] Preserve cancel scope semantics from the Rust-backed protocol layer.
- [ ] Expose operation states as typed values, not ad hoc strings.
- [ ] Emit terminal events exactly once.
- [ ] Reject duplicate cancel attempts with deterministic diagnostics.
- [ ] Add tests for cancel before dispatch, cancel after result, and cancel after close.

## Event Delivery

- [ ] Add `NnrpClientSession.nextEvent(options?)`.
- [ ] Add async iterator convenience for client session events if it does not hide backpressure.
- [ ] Add `NnrpServerSession.receive()` event shape for server sessions.
- [ ] Define event discriminants for result, flow update, result hint, drop, close, and diagnostic events.
- [ ] Support timeout/cancellation for event polling.
- [ ] Avoid unbounded event queues.
- [ ] Add tests for event ordering under multiple in-flight operations.
- [ ] Add tests for no-event timeout behavior.

## Flow Control and Backpressure

- [ ] Represent flow update metadata in `@nnrp/core`.
- [ ] Surface available credits and recommended send pacing.
- [ ] Expose result hint metadata in `@nnrp/core`.
- [ ] Preserve transport/backpressure diagnostics from native/WASM backends.
- [ ] Ensure `submit` awaits capacity when runtime policy requires it.
- [ ] Ensure `submitNoWait` reports backpressure rejection without losing diagnostics.
- [ ] Add tests for credit exhaustion and credit recovery.

## Diagnostics and Errors

- [ ] Add `NnrpDiagnostic` type with code, message, source, retryability, transport, and optional cause fields.
- [ ] Add `NnrpError` base class that carries `NnrpDiagnostic`.
- [ ] Add `NnrpNativeBindingUnavailableError`.
- [ ] Add browser/WASM loading error class with the same diagnostic shape.
- [ ] Preserve native/WASM status codes without flattening them into strings.
- [ ] Ensure thrown errors are serializable enough for CLI/agent logs.
- [ ] Add tests for diagnostic mapping from fake native and fake WASM errors.
