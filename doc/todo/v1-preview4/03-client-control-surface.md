# 03 - Client Control Surface

## Native and Browser Parity

- [x] Add the same Preview4 methods to `NnrpClientSession` and `NnrpBrowserClientSession`.
  - [x] `cancel(metadata, diagnostic?)`.
  - [x] `abort(metadata, diagnostic?)`.
  - [x] `updatePriority(metadata)`.
  - [x] `updateDeadline(metadata)`.
  - [x] `expireAt(metadata)`.
  - [x] `supersede(metadata, diagnostic?)`.
  - [x] `updateBudget(metadata)`.
  - [x] `negotiateCapabilities(metadata, body?)`.
  - [x] `degradeProfile(metadata, body?)`.
  - [x] `sendRouteHint(metadata, body?)`.
  - [x] `sendExecutionHint(metadata, body?)`.
  - [x] `sendTraceContext(metadata, body?)`.
  - [x] Public `sendControl(messageType, metadata, tail?)` escape hatch.
- [x] Route every method through the codec and one coarse runtime submit call.
  - [x] Preserve caller-supplied control sequence values through encoding and dispatch.
  - [x] Validate the message direction before runtime dispatch.
  - [x] Surface native/WASM status and diagnostics as typed JavaScript errors.

## Submit Cancellation and Deadlines

- [x] Add frozen submit options to `submit` and `submitNoWait`.
  - [x] Reject an already-aborted signal before dispatch.
  - [x] Send `Cancel` when a signal aborts after dispatch.
  - [x] Send `Deadline` before dispatch when `timeoutMillis` is present.
  - [x] Cancel in-flight work when the local timeout expires.
  - [x] Remove abort listeners after terminal completion.
- [x] Keep cancellation semantics on the protocol path.
  - [x] Do not add an out-of-band provider cancellation message.
  - [x] Do not resolve a cancelled operation with a late normal result.
  - [x] Deliver result-drop reason and trace events after cancellation.

## Event Consumption

- [x] Extend `nextEvent()` and `events()` with the complete Preview4 event union.
  - [x] Preserve operation-local ordering.
  - [x] Preserve backpressure and credit updates.
  - [x] Preserve progress and partial-result sequence values.
  - [x] Preserve object/cache event metadata and owned tail bytes.

## Acceptance Evidence

- [x] Native-client tests cover every public control method and failure path.
- [x] Browser-client tests cover every public control method and failure path.
- [x] AbortSignal tests cover pre-dispatch, in-flight, terminal, and listener-cleanup cases.
- [x] Type tests prove native and browser client session method parity.
- [x] Public API snapshots `scripts/public-api/native-client.d.ts` and `scripts/public-api/browser-client.d.ts` match
      the frozen JavaScript client page in `nnrp-doc`.

## Native Carrier-Backed Role Integration

- [x] Make `openNativeClient` establish a carrier-backed role connection.
  - [x] Resolve one provider by the frozen forced/auto/probe policy.
  - [x] Open the provider-local endpoint through the selected provider artifact.
  - [x] Transfer the native carrier to the role runtime in the same loaded library.
  - [x] Perform the real session handshake before returning a usable session.
  - [x] Keep transfer handles private to provider and role packages.
- [x] Send and receive every native client operation over the adopted carrier.
  - [x] Submit encoded metadata/body without local result echo.
  - [x] Send control/object/cache frames through one coarse Rust call each.
  - [x] Decode partial, terminal, flow, control, object, and cache events from Rust-owned reads.
  - [x] Close the carrier exactly once through the role owner.
- [x] Add real client/server loopback evidence for all native provider packages.
  - [x] Assert role traffic reaches a peer process or peer runtime instance.
  - [x] Assert a standalone provider loopback cannot satisfy role E2E by itself.
  - [x] Assert a provider without role adoption symbols is rejected before connect.

## Multi-Route Client Host

- [x] Replace singular client routing with `NnrpClientProviderRoutes`.
  - [x] Resolve every installed provider against its own route.
  - [x] Keep unresolved and security-incompatible candidates in ordered diagnostics.
  - [x] Probe every eligible Auto/Prefer candidate.
  - [x] Make Force fail without fallback.
  - [x] Adopt only the selected carrier into the native runtime.
- [x] Keep browser routing aligned without exposing native credentials.
  - [x] Accept only the WebSocket entry from `NnrpClientProviderRoutes`.
  - [x] Require WSS for `nnrps://` and use browser-owned TLS verification.
  - [x] Reject native DER security fields in browser routes.
- [ ] Add two-provider E2E tests against suite-owned endpoints.
  - [ ] Verify selection diagnostics and active transport identity.
  - [ ] Verify no connection is adopted from a rejected candidate.
  - [ ] Verify close ownership for selected and unselected candidates.
