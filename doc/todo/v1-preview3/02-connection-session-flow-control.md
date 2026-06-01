# JS/TS Preview3 Connection, Session, and Flow-Control Map

## Scope

1. Track host-facing connection/session/control-plane work across native and browser runtimes.
2. Keep shared JS/TS object semantics aligned even when native and WASM backends use different artifacts.
3. Avoid hiding lifecycle and event delivery details inside package loaders.

## Shard Ownership

- [ ] Use `02a-connection-session-lifecycle.md` for runtime open/connect/listen, session open/patch/close, and handle
      ownership.
- [ ] Use `02b-scheduling-events-and-diagnostics.md` for submit/cancel/result, flow updates, result hints, priority,
      diagnostics, and event pumps.
- [ ] Use `02c-recovery-and-transport-binding.md` for transport provider selection, migration, recovery, and browser
      transport adapter slots.
- [ ] Keep semantic API items in `02*` and implementation package wiring in `04*`.
- [ ] Update `05-validation-and-docs.md` when a lifecycle or event shape affects conformance and benchmark output.

## Cross-Runtime Consistency Gates

- [ ] Native and browser client sessions expose the same submit/cancel/result/event method names unless a runtime cannot
      support a capability.
- [ ] Native and browser errors map to the same diagnostic families.
- [ ] Operation ids use `bigint` where they can exceed JavaScript safe integer range.
- [ ] Binary payload parameters accept `Uint8Array` or `ArrayBufferView`.
- [ ] Retained binary payloads are copied unless an API explicitly states ownership transfer.
- [ ] Cancellation and close semantics are explicit for all async methods.
- [ ] Runtime event objects can be pattern-matched without string parsing.

## Dependency Order

- [ ] Finish `01` public naming and build-mode contract before exposing lifecycle APIs.
- [ ] Finish `04a` shared core types before finalizing session and event object types.
- [ ] Finish `04b` native handle wrappers before enabling backend adapter conformance.
- [ ] Finish `04c` WASM loading before enabling browser adapter conformance.
- [ ] Finish `04d` package gates before publishing any runtime package.
