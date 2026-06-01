# JS/TS Preview3 Scheduling, Events, and Diagnostics

## Scope

1. Expose submit/cancel/result/event APIs consistently across native and browser clients.
2. Preserve structured diagnostics from Rust native/WASM artifacts.
3. Make async event delivery usable for agent runtimes, CLIs, services, and browser apps.

## Submit and Result APIs

- [x] Add `NnrpClientSession.submit(request)` for native client sessions.
- [x] Add `NnrpBrowserClientSession.submit(request)` for browser client sessions.
- [x] Add `NnrpClientSession.submitNoWait(request)` returning a `bigint` operation id.
- [ ] Add browser `submitNoWait` only if WASM/runtime support can deliver events safely.
- [x] Add `NnrpServerSession.receive()` for server-side submit/control events.
- [x] Add `NnrpServerSession.sendResult(result)`.
- [ ] Validate `frameId` uniqueness while in flight.
- [x] Validate payload ownership rules before calling native/WASM backends.
- [ ] Map result drops to typed JS errors with diagnostics.
- [ ] Add tests for submit success, result drop, and close-during-submit.
- [x] Add tests for malformed request rejection.

## Cancel and Operation Lifecycle

- [x] Add `session.cancel(operationIdOrFrameId, options?)` where supported by runtime artifacts.
- [x] Preserve cancel scope semantics from the Rust-backed protocol layer.
- [x] Expose operation states as typed values, not ad hoc strings.
- [ ] Emit terminal events exactly once.
- [ ] Reject duplicate cancel attempts with deterministic diagnostics.
- [x] Add tests for cancel before dispatch.
- [ ] Add tests for cancel after result and cancel after close.

## Event Delivery

- [x] Add `NnrpClientSession.nextEvent(options?)`.
- [x] Add async iterator convenience for client session events if it does not hide backpressure.
- [x] Add `NnrpServerSession.receive()` event shape for server sessions.
- [x] Define event discriminants for result, flow update, result hint, drop, close, and diagnostic events.
- [x] Support timeout for event polling.
- [ ] Support cancellation for event polling.
- [x] Avoid unbounded event queues.
- [ ] Add tests for event ordering under multiple in-flight operations.
- [x] Add tests for invalid no-event timeout behavior.
- [ ] Add tests for successful no-event timeout behavior once runtime polling is implemented.

## Flow Control and Backpressure

- [x] Represent flow update metadata in `@nnrp/core`.
- [x] Surface available credits and recommended send pacing.
- [x] Expose result hint metadata in `@nnrp/core`.
- [ ] Preserve transport/backpressure diagnostics from native/WASM backends.
- [ ] Ensure `submit` awaits capacity when runtime policy requires it.
- [ ] Ensure `submitNoWait` reports backpressure rejection without losing diagnostics.
- [ ] Add tests for credit exhaustion and credit recovery.

## Diagnostics and Errors

- [x] Add `NnrpDiagnostic` type with code, message, source, retryability, transport, and optional cause fields.
- [x] Add `NnrpError` base class that carries `NnrpDiagnostic`.
- [x] Add `NnrpNativeBindingUnavailableError`.
- [x] Add browser/WASM loading error class with the same diagnostic shape.
- [ ] Preserve native/WASM status codes without flattening them into strings.
- [x] Ensure thrown errors are serializable enough for CLI/agent logs.
- [x] Add tests for diagnostic mapping from fake native and fake WASM errors.
