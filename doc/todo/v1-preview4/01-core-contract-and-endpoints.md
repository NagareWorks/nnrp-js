# 01 - Core Contract and Endpoints

## Protocol Contract

- [ ] Replace the Preview3 protocol constants with Preview4 constants.
  - [ ] Set the protocol version claim to `nnrp-1-preview4`.
  - [ ] Add every frozen control, runtime-object, cache, recoverable-error, and retry message type.
  - [ ] Preserve the existing NNRP/1 `CacheInvalidate` message as the cache invalidation frame.
  - [ ] Remove message aliases that exist only for an older preview.
- [ ] Add every frozen capability token.
  - [ ] Add control capability tokens exactly as emitted by Rust Preview4.
  - [ ] Add runtime-object and cache capability tokens exactly as emitted by Rust Preview4.
  - [ ] Add `tcp`, `quic`, `ipc`, and `websocket` transport capability tokens.
  - [ ] Reject unknown built-in tokens while preserving extension-token validation rules.

## Transport Types and Selection

- [ ] Replace the transport type union.
  - [ ] Set `NnrpTransportKind` to `tcp | quic | ipc | websocket`.
  - [ ] Remove `webtransport` from types, manifests, fixtures, and diagnostics.
- [ ] Replace the transport policy union.
  - [ ] Add `auto`.
  - [ ] Add `prefer-quic`, `prefer-tcp`, `prefer-ipc`, and `prefer-websocket`.
  - [ ] Add `force-quic`, `force-tcp`, `force-ipc`, and `force-websocket`.
  - [ ] Remove `score`, `tcp-only`, and `quic-only` policy values.
- [ ] Implement deterministic selection.
  - [ ] Select the only installed and compatible provider without probing unrelated packages.
  - [ ] Probe all installed compatible providers for `auto` and `prefer-*`.
  - [ ] Reject a missing or incompatible forced provider without fallback.
  - [ ] Return ordered candidate diagnostics with availability, score, cost, limit, and rejection reason.

## Endpoint Model

- [ ] Add the application endpoint parser.
  - [ ] Accept `nnrp://` and `nnrps://` application endpoints.
  - [ ] Preserve authority, path, query, and security intent in the parsed result.
  - [ ] Reject provider-local schemes in the application endpoint field.
- [ ] Add provider endpoint resolution.
  - [ ] Derive TCP and QUIC host/port endpoints from the application endpoint.
  - [ ] Resolve IPC `unix://` and `npipe://` endpoints from an explicit `providerEndpoint` override.
  - [ ] Resolve WebSocket `ws://` and `wss://` endpoints from an explicit `providerEndpoint` override.
  - [ ] Reject a provider override whose scheme does not match the selected provider.
  - [ ] Keep provider-local endpoint strings out of operation metadata and public request payloads.

## Public Types and Tests

- [ ] Publish exact Preview4 public types from `@nnrp/core`.
  - [ ] Update capability manifests and provider contracts.
  - [ ] Update selection options, candidate diagnostics, and endpoint resolution results.
  - [ ] Update public API snapshots without old-preview aliases.
- [ ] Add contract tests.
  - [ ] Cover every transport kind and policy.
  - [ ] Cover single-provider, multi-provider, preference, and force behavior.
  - [ ] Cover application and provider endpoint validation.
  - [ ] Cover capability token serialization and rejection.

## Acceptance Evidence

- [ ] Core unit tests cover every enum member and policy branch.
- [ ] Type tests prove removed Preview3 values do not compile.
- [ ] Public API snapshots match the frozen JavaScript core and transport pages in `nnrp-doc`.
