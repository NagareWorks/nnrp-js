# JS/TS Preview3 Cache, Schema, and Profile Registry

## Scope

1. Represent cache, schema, profile, and typed payload concepts needed by JS/TS clients and servers.
2. Keep validation in Rust/WASM/native primitives where possible.
3. Provide ergonomic TypeScript types without creating a parallel protocol implementation.

## Cache Types

- [x] Add `NnrpCacheKey` to `@nnrp/core`.
- [x] Add cache object kind enum/union matching the canonical contract.
- [x] Add cache lease/version/dependency metadata types.
- [x] Add cache put/ack/invalidate request/result types where exposed through public APIs.
- [x] Validate simple shape constraints in TypeScript before calling runtime backends.
- [x] Delegate protocol-critical cache descriptor validation to Rust/WASM/native primitives.
- [x] Add tests for cache key normalization and invalid value rejection.

## Schema Registry

- [x] Add schema descriptor type to `@nnrp/core`.
- [x] Add schema id/name/version fields with documented limits.
- [x] Add descriptor flag representation.
- [x] Add helper to attach schema descriptor to submit requests.
- [x] Ensure schema descriptors are serializable without losing binary fields.
- [x] Add tests for schema descriptor construction and invalid descriptor rejection.

## Standard Profiles

- [x] Add first-round standard profile names for tensor payloads.
- [x] Add first-round standard profile names for token payloads.
- [x] Add `structured_event` profile representation.
- [x] Add `tool_delta` profile representation for coding-agent integrations.
- [x] Keep profile registry extensible without accepting arbitrary undocumented magic strings in strict mode.
- [x] Add tests for known profile acceptance and unknown profile policy.

## Typed Payloads

- [x] Add `NnrpTensorSection` type.
- [x] Add typed payload descriptor type.
- [x] Add binary ownership rules for typed payload frames.
- [x] Support `Uint8Array` and `ArrayBufferView` inputs.
- [x] Copy retained payloads unless ownership transfer is explicitly documented.
- [x] Add tests for payload normalization without extra copies where possible.

## Runtime Integration

- [x] Native submit APIs accept cache/schema/profile fields and pass them to FFI wrappers.
- [x] Browser submit APIs accept cache/schema/profile fields and pass them to WASM wrappers.
- [ ] Server receive APIs expose decoded cache/schema/profile metadata when available.
- [x] Conformance adapter includes cache/schema/profile capability claims only when implemented.
