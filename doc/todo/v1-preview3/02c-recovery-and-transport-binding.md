# JS/TS Preview3 Recovery and Transport Binding

## Scope

1. Use Rust-backed transport provider scoring and recovery semantics instead of JavaScript-side protocol reinvention.
2. Keep backend native transport providers and browser transport adapter slots separate.
3. Surface enough diagnostics for agent runtimes to explain fallback and recovery decisions.

## Transport Selection

- [x] Represent `NnrpTransportCandidate` and `NnrpTransportSelection` in `@nnrp/core`.
- [ ] Use Rust-backed scoring for native transport providers when the artifact exposes it.
- [x] Use WASM primitive scoring for browser provider candidates when available.
- [x] Keep candidate scoring stable and deterministic for tests.
- [x] Expose rejected candidates with reason codes.
- [x] Do not hard-code QUIC-first ordering.
- [x] Add tests for score ordering, unavailable providers, and policy rejection.

## Native Transport Binding

- [x] Discover native TCP provider capability from artifact manifest.
- [x] Discover native QUIC provider capability from artifact manifest.
- [x] Pass explicit `tcp-only`, `quic-only`, `score`, and future policies to native runtime.
- [x] Fail `quic-only` when QUIC is unavailable; do not silently downgrade.
- [x] Report selected provider in connection diagnostics.
- [x] Add Node tests using fake provider manifests.

## Browser Transport Slots

- [ ] Define `NnrpBrowserTransportProvider` interface.
- [ ] Add WebSocket adapter slot.
- [ ] Add WebTransport adapter slot only after browser protocol mapping is frozen.
- [ ] Keep browser transport adapters optional so WASM primitive tests can run without network access.
- [ ] Ensure browser package exports no server transport APIs.
- [ ] Add bundling smoke that verifies adapter slots do not import Node built-ins.

## Migration and Recovery

- [ ] Add recovery token/binding type in `@nnrp/core` if exposed by Rust artifacts.
- [ ] Add client API for session migration when native/WASM backend supports it.
- [ ] Add event shape for migration requested/accepted/rejected.
- [ ] Preserve recovery rejection diagnostics.
- [ ] Add tests for unsupported migration producing typed errors.
- [ ] Add tests for recovery object validation via fake native/WASM backends.

## Agent-Facing Reporting

- [x] Provide transport selection summary suitable for CLI/agent logs.
- [x] Include selected transport, rejected candidates, score inputs, and fallback reason.
- [x] Keep reporting structured so opencode-style integrations can render it without parsing text.
