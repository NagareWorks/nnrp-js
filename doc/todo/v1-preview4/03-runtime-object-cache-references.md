# 03 - Runtime Object And Cache References

## Runtime Object Types

- [ ] Add `RuntimeObjectDescriptor`.
- [ ] Add `RuntimeObjectRef`.
- [ ] Add `RuntimeObjectDelta`.
- [ ] Add `RuntimeObjectRelease`.
- [ ] Add object kind enums.
- [ ] Add ownership and lifetime metadata.
- [ ] Add compute and memory cost metadata.

## Client Object Flow

- [ ] Declare object before request.
- [ ] Submit request with object refs.
- [ ] Receive partial result object refs.
- [ ] Release objects after use.
- [ ] Release superseded objects after cancellation.

## Server Object Flow

- [ ] Accept object refs from client requests.
- [ ] Emit object deltas as partial results.
- [ ] Emit final object refs.
- [ ] Emit object release hints.
- [ ] Report object-related drop reasons.

## Cache References

- [ ] Add cache reference type.
- [ ] Add cache miss type.
- [ ] Add cache invalidate type.
- [ ] Add cache lease metadata type.
- [ ] Keep cache reference opt-in per request or profile.
- [ ] Avoid implicit cache lookup on every request.

## Browser Constraints

- [ ] Ensure object descriptors are structured-clone friendly.
- [ ] Avoid exposing native pointer concepts in browser packages.
- [ ] Use WASM-owned handles only through safe wrapper objects.
- [ ] Add tests for object refs crossing worker boundaries where supported.
