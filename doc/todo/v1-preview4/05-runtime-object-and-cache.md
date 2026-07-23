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
- [x] Enforce object lifecycle validation.
  - [x] Require declaration before a local reference when local tracking is enabled.
  - [x] Track version and delta sequence monotonically.
  - [x] Reject a use-after-release operation.
  - [x] Release superseded or cancelled operation-owned objects without implicit global invalidation.

## Cache Semantics

- [x] Implement explicit cache references only.
  - [x] Do not perform an implicit cache lookup on request submission.
  - [x] Preserve profile, reuse scope, lease, producer trace, expiration, and flags.
  - [x] Report misses with the frozen reason and diagnostic contract.
- [x] Implement baseline cache invalidation.
  - [x] Encode the existing `CacheInvalidate` NNRP/1 frame.
  - [x] Preserve namespace and 128-bit cache key components.
  - [x] Apply invalidation scope and reason without inventing a Preview4-only replacement frame.
- [x] Implement local cache lease validation.
  - [x] Validate object/version, lease id, owner scope/id, grant time, and TTL.
  - [x] Keep lease state local and out of public native pointer representations.

## Browser and Worker Safety

- [x] Keep public descriptors structured-clone compatible.
  - [x] Use numbers, bigints, strings, plain records, and owned `Uint8Array` values only.
  - [x] Expose no native pointer, file descriptor, or borrowed WASM memory view.
  - [x] Copy object/cache tail bytes before transferring them to another worker.
- [x] Add worker transfer tests.
  - [x] Transfer descriptors and references through `structuredClone`.
  - [x] Transfer owned payload buffers without invalidating retained metadata.
  - [x] Verify native and browser normalized object events are equivalent.

## Acceptance Evidence

- [x] Lifecycle tests cover declare, ref, patch/delta, release, cancellation, and supersession.
- [x] Cache tests cover hit-reference, miss, invalidate, lease expiry, and no-implicit-lookup behavior.
- [x] Structured-clone tests cover every public object/cache type.
- [x] Public API snapshots match the frozen JavaScript client, server, and runtime pages in `nnrp-doc`.
