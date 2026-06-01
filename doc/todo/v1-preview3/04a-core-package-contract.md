# JS/TS Preview3 Core Package Contract

## Scope

1. Build `@nnrp/core` as the runtime-neutral contract package for all JS/TS runtimes.
2. Provide shared types and small helpers without importing native, WASM, Node, or DOM dependencies.
3. Keep declarations stable enough for `@nnrp/native`, `@nnrp/wasm`, docs, and conformance adapters.

## Constants and Versioning

- [x] Export `NNRP_PROTOCOL_NAME`.
- [x] Export `NNRP_PROTOCOL_VERSION`.
- [x] Export build-mode type values for `backend-native` and `browser-wasm`.
- [x] Remove placeholder `NNRP_PREVIEW_VERSION` naming from public exports before publication.
- [x] Add tests for version constants.

## Capability Manifest

- [x] Add `NnrpCapabilityManifest`.
- [x] Add build-mode-specific manifest helpers.
- [x] Add transport capability fields.
- [x] Add feature/capability identifiers for client, server, cache, schema, flow update, result hint, and recovery.
- [x] Validate that browser manifests cannot claim server/native transport capabilities.
- [x] Validate that native manifests cannot claim browser-only transports unless a browser adapter is active.
- [x] Add tests for manifest construction and invalid capability combinations.

## Transport Selection Types

- [x] Add `NnrpTransportCandidate`.
- [x] Add `NnrpTransportSelection`.
- [x] Add typed rejection reason codes.
- [x] Add policy type for `score`, `tcp-only`, `quic-only`, and future extension values.
- [x] Add deterministic selection helper only for non-protocol-critical local ordering.
- [ ] Delegate provider score calculation to Rust/WASM/native primitives when available.
- [x] Add tests for candidate copying and selection stability.

## Request, Result, and Event Types

- [x] Add `NnrpSubmitRequest`.
- [x] Add `NnrpResult`.
- [x] Add `NnrpRuntimeEvent` discriminated union.
- [x] Add `NnrpDiagnostic`.
- [x] Add operation id type guidance using `bigint`.
- [x] Add binary payload type aliases for `Uint8Array` and `ArrayBufferView`.
- [x] Add docs-linked type exports for client/server/native/wasm packages.

## Error Types

- [x] Add `NnrpError` base class carrying `NnrpDiagnostic`.
- [x] Add `NnrpCapabilityError`.
- [x] Add `NnrpTransportError`.
- [x] Add `NnrpTimeoutError`.
- [x] Add `NnrpProtocolError`.
- [x] Add tests for error serialization.

## Declaration Stability

- [ ] Add generated declaration output for `@nnrp/core`.
- [ ] Add declaration diff check against an approved snapshot.
- [ ] Add API extractor or equivalent public export verification.
- [ ] Ensure docs references use names exported by `@nnrp/core`.
