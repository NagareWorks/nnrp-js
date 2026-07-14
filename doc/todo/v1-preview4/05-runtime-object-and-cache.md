# 05 - Runtime Objects and Cache References

## Shared Session Methods

- [x] Add the same object/cache methods to native client, browser client, and server sessions.
  - [x] `declareObject(metadata, body?)`.
  - [x] `referenceObject(metadata, body?)`.
  - [x] `releaseObject(metadata, diagnostic?)`.
  - [x] `patchObject(metadata, delta)`.
  - [x] `sendObjectDelta(metadata, delta)`.
  - [x] `referenceCache(metadata, body?)`.
  - [x] `reportCacheMiss(metadata, diagnostic?)`.
  - [x] `invalidateCache(metadata)`.
- [ ] Enforce object lifecycle validation.
  - [ ] Require declaration before a local reference when local tracking is enabled.
  - [ ] Track version and delta sequence monotonically.
  - [ ] Reject a use-after-release operation.
  - [ ] Release superseded or cancelled operation-owned objects without implicit global invalidation.

## Cache Semantics

- [x] Implement explicit cache references only.
  - [x] Do not perform an implicit cache lookup on request submission.
  - [x] Preserve profile, reuse scope, lease, producer trace, expiration, and flags.
  - [x] Report misses with the frozen reason and diagnostic contract.
- [x] Implement baseline cache invalidation.
  - [x] Encode the existing `CacheInvalidate` NNRP/1 frame.
  - [x] Preserve namespace and 128-bit cache key components.
  - [x] Apply invalidation scope and reason without inventing a Preview4-only replacement frame.
- [ ] Implement local cache lease validation.
  - [ ] Validate object/version, lease id, owner scope/id, grant time, and TTL.
  - [ ] Keep lease state local and out of public native pointer representations.

## Browser and Worker Safety

- [ ] Keep public descriptors structured-clone compatible.
  - [ ] Use numbers, bigints, strings, plain records, and owned `Uint8Array` values only.
  - [ ] Expose no native pointer, file descriptor, or borrowed WASM memory view.
  - [ ] Copy object/cache tail bytes before transferring them to another worker.
- [ ] Add worker transfer tests.
  - [ ] Transfer descriptors and references through `structuredClone`.
  - [ ] Transfer owned payload buffers without invalidating retained metadata.
  - [ ] Verify native and browser normalized object events are equivalent.

## Acceptance Evidence

- [ ] Lifecycle tests cover declare, ref, patch/delta, release, cancellation, and supersession.
- [ ] Cache tests cover hit-reference, miss, invalidate, lease expiry, and no-implicit-lookup behavior.
- [ ] Structured-clone tests cover every public object/cache type.
- [ ] Public API snapshots match the frozen JavaScript client, server, and runtime pages in `nnrp-doc`.
