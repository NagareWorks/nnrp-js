# 04 - Server Control Surface

## Receive Path

- [x] Implement the frozen `NnrpServerEvent` receive surface.
  - [x] `nextEvent(options?)` returns `submit`, `runtime`, or `lifecycle`.
  - [x] `submit` carries an owning `NnrpServerOperation` for `FRAME_SUBMIT`.
  - [x] `runtime` carries every non-submit wire event.
  - [x] `lifecycle` carries headerless operation lifecycle notifications.
  - [x] Preserve operation-local order and owned tail bytes across all variants.
  - [x] Keep skipped non-submit and lifecycle events queued when `receiveSubmit()` selects the next operation.

## Operation Replies and Session Controls

- [x] Put every operation-scoped reply on `NnrpServerOperation`.
  - [x] `sendProgress(metadata, body?)`.
  - [x] `sendPartialResult(metadata, body?)`.
  - [x] `sendResult(metadata, body?)`.
  - [x] `sendResultDrop(metadata, diagnostic?)`.
  - [x] Validate the supplied operation id against the accepted operation.
  - [x] Route every reply through the accepted native operation handle, including its generation and flags.
- [x] Keep session-scoped flow, diagnostics, object, and cache methods on `NnrpServerSession`.
  - [x] `sendBackpressure(metadata)`.
  - [x] `sendCreditUpdate(metadata)`.
  - [x] `sendTraceContext(metadata, body?)`.
  - [x] `sendRecoverableError(metadata, diagnostic?)`.
  - [x] `sendRetryAfter(metadata, diagnostic?)`.
  - [x] Keep `sendControl(messageType, metadata, tail?)` for session-scoped server messages only.
  - [x] Reject progress, partial-result, result, and result-drop bypass through the session.
- [x] Enforce operation terminal semantics.
  - [x] Reject partial-result or progress sends after a terminal result.
  - [x] Reject a second terminal result.
  - [x] Roll back local terminal state if the native send fails before completion.
  - [x] Keep session trace evidence available after an operation reaches a terminal reply.

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

- [x] Replace `providerEndpoints` and role-wide security with `NnrpServerProviderRoutes`.
  - [x] Resolve every policy-allowed installed provider independently.
  - [x] Filter security-incompatible routes while preserving their diagnostics.
  - [x] Treat a missing locator for an otherwise eligible provider as a hard configuration error.
  - [x] Pass each route's own security handle only to its provider artifact.
- [x] Complete atomic multi-listener ownership.
  - [x] Start every eligible Auto/Prefer bind before returning the logical server and gate acceptance on the complete
        set.
  - [x] Restrict Force to the named route.
  - [x] Roll back every opened listener after any bind or adoption failure.
  - [x] Accept sessions from each listener and report the active transport.
  - [x] Expose `boundProviderEndpoints` with every actual bound listener endpoint.
  - [x] Expose the actual listener transport as `NnrpServerSession.activeTransport`.
  - [x] Fail and close the complete logical server after a terminal provider-listener failure.
  - [x] Close every listener and accepted session exactly once.
- [x] Add TCP TLS and mixed-security listener-set tests.
  - [x] Cover TCP TLS plus QUIC.
  - [x] Cover IPC plus plain WebSocket under `nnrp://`.
  - [x] Cover exclusion of IPC, plain TCP, and WS under `nnrps://`.
  - [x] Cover route-local credentials that cannot leak between providers.

## Acceptance Evidence

- [x] Server tests cover every receive variant, operation reply method, multi-listener ordering, rollback, and
      ownership.
- [x] State-machine tests cover partial, terminal, duplicate-terminal, and post-terminal behavior.
- [x] Direction tests reject client-only messages from server send helpers.
- [x] Public API snapshot `scripts/public-api/native-server.d.ts` matches the frozen JavaScript server page in
      `nnrp-doc`.
