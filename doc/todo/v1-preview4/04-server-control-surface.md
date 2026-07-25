# 04 - Server Control Surface

## Receive Path

- [x] Extend `NnrpServerSession.receive(options?)` to return the complete Preview4 event union.
  - [x] Decode incoming cancellation and scheduling controls.
  - [x] Decode capability, route, execution, and trace controls.
  - [x] Decode object and cache frames.
  - [x] Preserve operation-local order and owned tail bytes.

## Incremental Result and Flow Methods

- [x] Add every frozen server control method.
  - [x] `sendProgress(metadata, body?)`.
  - [x] `sendPartialResult(metadata, body?)`.
  - [x] `sendBackpressure(metadata)`.
  - [x] `sendCreditUpdate(metadata)`.
  - [x] `sendResultDropReason(metadata, diagnostic?)`.
  - [x] `sendTraceContext(metadata, body?)`.
  - [x] `sendRecoverableError(metadata, diagnostic?)`.
  - [x] `sendRetryAfter(metadata, diagnostic?)`.
  - [x] Public `sendControl(messageType, metadata, tail?)` escape hatch.
- [x] Keep final result semantics separate.
  - [x] Preserve `sendResult(result)` as the terminal result API.
  - [x] Reject partial-result or progress sends after a terminal result.
  - [x] Reject a second terminal result.
  - [x] Permit the frozen result-drop and trace terminal evidence sequence.

## Runtime and Provider Integration

- [x] Route every method through the codec and one coarse runtime call.
  - [x] Validate message direction before dispatch.
  - [x] Validate body/diagnostic length before dispatch.
  - [x] Map native status and diagnostics to typed errors.
- [x] Keep listener lifecycle provider-neutral.
  - [x] `auto` and `prefer-*` open every eligible installed provider listener without synthetic peer probes.
  - [x] The server role does not import provider implementation internals.
  - [x] `force-*` restricts the same atomic listener lifecycle to the named provider.
- [x] Bind the selected provider listener to the native server role runtime.
  - [x] Transfer listener ownership inside the same transport-scoped library.
  - [x] Accept a real carrier connection and complete `SESSION_OPEN` handling in Rust.
  - [x] Receive submit/control/object/cache events from the carrier-backed server session.
  - [x] Send partial/terminal/drop/trace output over the accepted carrier.
  - [x] Close accepted sessions and the listener exactly once.

## Route-Local Listener Set

- [ ] Replace `providerEndpoints` and role-wide security with `NnrpServerProviderRoutes`.
  - [ ] Resolve every policy-allowed installed provider independently.
  - [ ] Filter security-incompatible routes while preserving their diagnostics.
  - [ ] Treat a missing locator for an otherwise eligible provider as a hard configuration error.
  - [ ] Pass each route's own security handle only to its provider artifact.
- [ ] Complete atomic multi-listener ownership.
  - [ ] Bind every eligible Auto/Prefer route before exposing the logical server.
  - [ ] Restrict Force to the named route.
  - [ ] Roll back every opened listener after any bind or adoption failure.
  - [ ] Accept sessions from each listener and report the active transport.
  - [ ] Expose `boundProviderEndpoints` with every actual bound listener endpoint.
  - [ ] Expose the actual listener transport as `NnrpServerSession.activeTransport`.
  - [ ] Fail and close the complete logical server after a terminal provider-listener failure.
  - [ ] Close every listener and accepted session exactly once.
- [ ] Add TCP TLS and mixed-security listener-set tests.
  - [ ] Cover TCP TLS plus QUIC.
  - [ ] Cover IPC plus plain WebSocket under `nnrp://`.
  - [ ] Cover exclusion of IPC, plain TCP, and WS under `nnrps://`.
  - [ ] Cover route-local credentials that cannot leak between providers.

## Acceptance Evidence

- [x] Server tests cover every receive and send method plus multi-listener ordering, rollback, and ownership.
- [x] State-machine tests cover partial, terminal, duplicate-terminal, and post-terminal behavior.
- [x] Direction tests reject client-only messages from server send helpers.
- [x] Public API snapshot `scripts/public-api/native-server.d.ts` matches the frozen JavaScript server page in
      `nnrp-doc`.
