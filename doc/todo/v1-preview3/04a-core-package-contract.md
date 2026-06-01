# JS/TS Preview3 Core Package Contract

## Scope

1. Build `@nnrp/core` as the runtime-neutral contract package for all JS/TS runtimes.
2. Provide shared types and small helpers without importing native, WASM, Node, or DOM dependencies.
3. Keep declarations stable enough for `@nnrp/native`, `@nnrp/wasm`, docs, and conformance adapters.

## Constants and Versioning

- [ ] Export `NNRP_PROTOCOL_NAME`.
- [ ] Export `NNRP_PROTOCOL_VERSION`.
- [ ] Export build-mode type values for `backend-native` and `browser-wasm`.
- [ ] Remove placeholder `NNRP_PREVIEW_VERSION` naming from public exports before publication.
- [ ] Add tests for version constants.

## Capability Manifest

- [ ] Add `NnrpCapabilityManifest`.
- [ ] Add build-mode-specific manifest helpers.
- [ ] Add transport capability fields.
- [ ] Add feature/capability identifiers for client, server, cache, schema, flow update, result hint, and recovery.
- [ ] Validate that browser manifests cannot claim server/native transport capabilities.
- [ ] Validate that native manifests cannot claim browser-only transports unless a browser adapter is active.
- [ ] Add tests for manifest construction and invalid capability combinations.

## Transport Selection Types

- [ ] Add `NnrpTransportCandidate`.
- [ ] Add `NnrpTransportSelection`.
- [ ] Add typed rejection reason codes.
- [ ] Add policy type for `score`, `tcp-only`, `quic-only`, and future extension values.
- [ ] Add deterministic selection helper only for non-protocol-critical local ordering.
- [ ] Delegate provider score calculation to Rust/WASM/native primitives when available.
- [ ] Add tests for candidate copying and selection stability.

## Request, Result, and Event Types

- [ ] Add `NnrpSubmitRequest`.
- [ ] Add `NnrpResult`.
- [ ] Add `NnrpRuntimeEvent` discriminated union.
- [ ] Add `NnrpDiagnostic`.
- [ ] Add operation id type guidance using `bigint`.
- [ ] Add binary payload type aliases for `Uint8Array` and `ArrayBufferView`.
- [ ] Add docs-linked type exports for client/server/native/wasm packages.

## Error Types

- [ ] Add `NnrpError` base class carrying `NnrpDiagnostic`.
- [ ] Add `NnrpCapabilityError`.
- [ ] Add `NnrpTransportError`.
- [ ] Add `NnrpTimeoutError`.
- [ ] Add `NnrpProtocolError`.
- [ ] Add tests for error serialization.

## Declaration Stability

- [ ] Add generated declaration output for `@nnrp/core`.
- [ ] Add declaration diff check against an approved snapshot.
- [ ] Add API extractor or equivalent public export verification.
- [ ] Ensure docs references use names exported by `@nnrp/core`.
