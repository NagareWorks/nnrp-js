# JS/TS Preview3 Cache, Schema, and Profile Registry

## Scope

1. Represent cache, schema, profile, and typed payload concepts needed by JS/TS clients and servers.
2. Keep validation in Rust/WASM/native primitives where possible.
3. Provide ergonomic TypeScript types without creating a parallel protocol implementation.

## Cache Types

- [ ] Add `NnrpCacheKey` to `@nnrp/core`.
- [ ] Add cache object kind enum/union matching the canonical contract.
- [ ] Add cache lease/version/dependency metadata types.
- [ ] Add cache put/ack/invalidate request/result types where exposed through public APIs.
- [ ] Validate simple shape constraints in TypeScript before calling runtime backends.
- [ ] Delegate protocol-critical cache descriptor validation to Rust/WASM/native primitives.
- [ ] Add tests for cache key normalization and invalid value rejection.

## Schema Registry

- [ ] Add schema descriptor type to `@nnrp/core`.
- [ ] Add schema id/name/version fields with documented limits.
- [ ] Add descriptor flag representation.
- [ ] Add helper to attach schema descriptor to submit requests.
- [ ] Ensure schema descriptors are serializable without losing binary fields.
- [ ] Add tests for schema descriptor construction and invalid descriptor rejection.

## Standard Profiles

- [ ] Add first-round standard profile names for tensor payloads.
- [ ] Add first-round standard profile names for token payloads.
- [ ] Add `structured_event` profile representation.
- [ ] Add `tool_delta` profile representation for coding-agent integrations.
- [ ] Keep profile registry extensible without accepting arbitrary undocumented magic strings in strict mode.
- [ ] Add tests for known profile acceptance and unknown profile policy.

## Typed Payloads

- [ ] Add `NnrpTensorSection` type.
- [ ] Add typed payload descriptor type.
- [ ] Add binary ownership rules for typed payload frames.
- [ ] Support `Uint8Array` and `ArrayBufferView` inputs.
- [ ] Copy retained payloads unless ownership transfer is explicitly documented.
- [ ] Add tests for payload normalization without extra copies where possible.

## Runtime Integration

- [ ] Native submit APIs accept cache/schema/profile fields and pass them to FFI wrappers.
- [ ] Browser submit APIs accept cache/schema/profile fields and pass them to WASM wrappers.
- [ ] Server receive APIs expose decoded cache/schema/profile metadata when available.
- [ ] Conformance adapter includes cache/schema/profile capability claims only when implemented.
