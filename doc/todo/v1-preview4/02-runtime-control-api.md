# 02 - Runtime Control API

## Client API

- [ ] Add cancel API.
  - [ ] Cancel operation.
  - [ ] Abort operation.
  - [ ] Cancellation reason.
  - [ ] Late result suppression.
- [ ] Add scheduling API.
  - [ ] Priority update.
  - [ ] Deadline.
  - [ ] Expire-at timestamp.
  - [ ] Supersede operation.
  - [ ] Budget update.
- [ ] Add routing API.
  - [ ] Route hint.
  - [ ] Execution hint.
  - [ ] Preferred profile list.
  - [ ] Degrade profile callback.

## Server API

- [ ] Add progress event API.
  - [ ] Stage.
  - [ ] Percent.
  - [ ] Trace context.
- [ ] Add partial result API.
  - [ ] Object reference.
  - [ ] Payload view.
  - [ ] Partial completion marker.
- [ ] Add result drop API.
  - [ ] Drop reason.
  - [ ] Operation ID.
  - [ ] Trace context.
- [ ] Add backpressure API.
  - [ ] Credit update.
  - [ ] Max in-flight.
  - [ ] Pressure reason.

## Event Model

- [ ] Extend async iterator event streams.
- [ ] Extend callback-style event delivery.
- [ ] Preserve event order within an operation.
- [ ] Allow interleaving across operations.
- [ ] Add abort signal integration.
- [ ] Add timeout helpers around deadline frames.

## Tests

- [ ] Add type-level tests for public API shapes.
- [ ] Add unit tests for cancel and drop reason events.
- [ ] Add unit tests for progress and partial result event ordering.
- [ ] Add unit tests for backpressure credit updates.
- [ ] Add integration tests against native/WASM fixtures when artifacts exist.
