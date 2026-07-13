# 02 - Codecs and Runtime Events

## Control Metadata Codecs

- [x] Implement encode/decode/validation for every frozen control metadata type.
  - [x] `ControlRequestMetadata` for `Cancel` and `Abort`.
  - [x] `SchedulingMetadata` for `PriorityUpdate`, `Deadline`, and `ExpireAt`.
  - [x] `SupersedeMetadata` and `BudgetMetadata`.
  - [x] `ProgressMetadata` and `PartialResultMetadata`.
  - [x] `PressureMetadata` for `Backpressure` and `CreditUpdate`.
  - [x] `CapabilityMetadata` for `CapabilityNegotiation` and `DegradeProfile`.
  - [x] `RouteHintMetadata` for `RouteHint` and `ExecutionHint`.
  - [x] `TraceContextMetadata` and `ResultDropReasonMetadata`.
  - [x] `RecoverableErrorMetadata` and `RetryAfterMetadata`.
- [x] Enforce metadata/tail contracts.
  - [x] Reject mismatched message and metadata types.
  - [x] Reject body, diagnostic, and metadata byte-length mismatches.
  - [x] Reject integers outside their frozen wire width.
  - [x] Reject reserved built-in flag bits while preserving frozen private enum ranges.

## Object and Cache Codecs

- [ ] Implement encode/decode/validation for every frozen object/cache metadata type.
  - [x] `ObjectDescriptorMetadata`.
  - [x] `ObjectReferenceMetadata`.
  - [x] `ObjectReleaseMetadata`.
  - [x] `ObjectDeltaMetadata` for `ObjectPatch` and `ObjectDelta`.
  - [x] `CacheReferenceMetadata` and `CacheMissMetadata`.
  - [x] `CacheInvalidateMetadata` with scope, namespace, key, and reason fields.
  - [ ] Local `CacheLease` validation with object, owner, grant, and TTL fields.
- [x] Add every frozen runtime enum and numeric mapping.
  - [x] Object kind and runtime role.
  - [x] Memory location and ownership hint.
  - [x] Object release reason.
  - [x] Cache reuse scope and cache miss reason.

## Runtime Event Union

- [ ] Replace the Preview3 runtime event union with the frozen Preview4 union.
  - [ ] Add control-event discriminants.
  - [ ] Add object/cache-event discriminants.
  - [ ] Add recoverable-error and retry events.
  - [ ] Keep terminal result, flow, close, and diagnostics typed distinctly.
- [ ] Implement event ordering rules.
  - [ ] Preserve wire order within one operation.
  - [ ] Permit interleaving across operations.
  - [ ] Suppress late result and partial-result payloads after cancellation.
  - [ ] Keep the matching result-drop-reason observable.

## Runtime Adapter Calls

- [ ] Bind Preview4 native exports.
  - [ ] Bind `nnrp_client_submit_control`.
  - [ ] Bind `nnrp_client_submit_runtime_object_loop_compact`.
  - [ ] Bind server receive, control/result send, and event polling exports used by the frozen API.
- [ ] Bind equivalent browser WASM exports.
  - [ ] Decode control/object batches in browser workers.
  - [ ] Keep native and browser event shapes identical.
  - [ ] Copy owned bytes before a native or WASM buffer is released.

## Acceptance Evidence

- [ ] Golden vectors round-trip every metadata type against Rust Preview4 fixtures.
- [ ] Negative vectors cover length, range, message/type, and truncation failures.
- [ ] Native and WASM parity tests produce identical normalized events.
- [ ] Public API snapshots match the frozen JavaScript runtime page in `nnrp-doc`.
