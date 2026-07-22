# 01 - Core Contract and Endpoints

## Protocol Contract

- [x] Replace the Preview3 protocol constants with Preview4 constants.
  - [x] Keep the public NNRP/1 protocol version claim at `1.0.0`; `nnrp-1-preview4` remains a conformance target
        identifier.
  - [x] Add every frozen control, runtime-object, cache, recoverable-error, and retry message type.
  - [x] Preserve the existing NNRP/1 `CacheInvalidate` message as the cache invalidation frame.
  - [x] Remove message aliases that exist only for an older preview.
- [x] Add every frozen capability token.
  - [x] Add control capability tokens exactly as emitted by Rust Preview4.
  - [x] Add runtime-object and cache capability tokens exactly as emitted by Rust Preview4.
  - [x] Add `tcp`, `quic`, `ipc`, and `websocket` transport capability tokens.
  - [x] Reject tokens outside the frozen NNRP/1 capability catalog.

## Transport Types and Selection

- [x] Replace the transport type union.
  - [x] Set `NnrpTransportKind` to `tcp | quic | ipc | websocket`.
  - [x] Remove `webtransport` from types, manifests, fixtures, and diagnostics.
- [x] Replace the transport policy union.
  - [x] Add `auto`.
  - [x] Add `prefer-quic`, `prefer-tcp`, `prefer-ipc`, and `prefer-websocket`.
  - [x] Add `force-quic`, `force-tcp`, `force-ipc`, and `force-websocket`.
  - [x] Remove `score`, `tcp-only`, and `quic-only` policy values.
- [x] Implement deterministic selection.
  - [x] Select the only installed and compatible provider without probing unrelated packages.
  - [x] Probe all installed compatible providers for `auto` and `prefer-*`.
  - [x] Reject a missing or incompatible forced provider without fallback.
  - [x] Return ordered candidate diagnostics with availability, probe metrics, cost, limit, and rejection reason.

## Endpoint Model

- [x] Add the application endpoint parser.
  - [x] Accept `nnrp://` and `nnrps://` application endpoints.
  - [x] Preserve authority, path, query, and security intent in the parsed result.
  - [x] Reject provider-local schemes in the application endpoint field.
- [x] Add provider endpoint resolution.
  - [x] Derive TCP and QUIC host/port endpoints from the application endpoint.
  - [x] Resolve IPC `unix://` and `npipe://` endpoints from an explicit `providerEndpoint` override.
  - [x] Resolve WebSocket `ws://` and `wss://` endpoints from an explicit `providerEndpoint` override.
  - [x] Reject a provider override whose scheme does not match the selected provider.
  - [x] Keep provider-local endpoint strings out of operation metadata and public request payloads.

## Public Types and Tests

- [x] Publish exact Preview4 public types from `@nnrp/core`.
  - [x] Update capability manifests and provider contracts.
  - [x] Update selection options, candidate diagnostics, and endpoint resolution results.
  - [x] Update public API snapshots without old-preview aliases.
- [x] Add contract tests.
  - [x] Cover every transport kind and policy.
  - [x] Cover single-provider, multi-provider, preference, and force behavior.
  - [x] Cover application and provider endpoint validation.
  - [x] Cover capability token serialization and rejection.

## Acceptance Evidence

- [x] Core unit tests cover every enum member and policy branch.
- [x] Type tests prove removed Preview3 values do not compile.
- [x] Public API snapshots match the frozen JavaScript core and transport pages in `nnrp-doc`.
