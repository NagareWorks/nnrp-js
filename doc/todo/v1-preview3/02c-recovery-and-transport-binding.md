# JS/TS Preview3 Recovery and Transport Binding

## Scope

1. Use Rust-backed transport provider scoring and recovery semantics instead of JavaScript-side protocol reinvention.
2. Keep TCP, QUIC, and WebSocket transport adapter slots in separate packages.
3. Runtime behavior is install-driven: if one transport package is installed, use that candidate; if multiple transport
   packages are installed, probe all available candidates, score them, and select by policy.
4. Surface enough diagnostics for agent runtimes to explain fallback and recovery decisions.

## Transport Selection

- [x] Represent `NnrpTransportCandidate` and `NnrpTransportSelection` in `@nnrp/core`.
- [x] Add transport adapter descriptor type that role packages can consume without importing concrete transports.
- [x] Add provider probe result shape with available/unavailable diagnostics.
- [x] Add helper that turns installed transport adapters into candidate probes.
- [x] Use Rust-backed scoring for native transport providers when the artifact exposes it.
- [x] Use WASM primitive scoring for browser provider candidates when available.
- [x] Keep candidate scoring stable and deterministic for tests.
- [x] Expose rejected candidates with reason codes.
- [x] Do not hard-code QUIC-first ordering.
- [x] Add tests for one installed provider, multiple installed providers, unavailable providers, score ordering, and
      policy rejection.

## Native Transport Binding

- [x] Discover native TCP provider capability from artifact manifest.
- [x] Discover native QUIC provider capability from artifact manifest.
- [x] Expose TCP provider construction through `@nnrp/transport-tcp`.
- [x] Expose QUIC provider construction through `@nnrp/transport-quic`.
- [x] Keep TCP and QUIC adapter packages independent so users can install only the transport they need.
- [x] Let native client/server accept explicit transport provider arrays.
- [x] Let native client/server use installed TCP/QUIC adapter packages when explicit providers are not supplied.
- [x] Probe installed TCP/QUIC adapters before connection/listen decisions.
- [x] Report which installed native transport packages were found, selected, rejected, or unavailable.
- [x] Pass explicit `tcp-only`, `quic-only`, `score`, and future policies to native runtime.
- [x] Fail `quic-only` when QUIC is unavailable; do not silently downgrade.
- [x] Report selected provider in connection diagnostics.
- [x] Add Node tests using fake installed provider manifests.

## Browser Transport Slots

- [x] Define `NnrpBrowserTransportProvider` interface.
- [x] Expose WebSocket provider construction through `@nnrp/transport-websocket`.
- [x] Defer WebTransport adapter slot to preview4 or a later browser mapping pass.
- [x] Keep browser transport adapters optional so runtime tests can run without network access.
- [x] Let browser client accept explicit transport provider arrays.
- [x] Let browser client use installed WebSocket adapter package when explicit providers are not supplied.
- [x] Probe installed WebSocket adapter before connect decisions.
- [x] Report installed browser transport package discovery in structured diagnostics.
- [x] Ensure browser package exports no server transport APIs.
- [x] Add bundling smoke that verifies adapter slots do not import Node built-ins.

## Migration and Recovery

- [x] Add recovery token/binding type in `@nnrp/core` if exposed by Rust artifacts.
- [x] Add client API for session migration when native/WASM backend supports it.
- [x] Add event shape for migration requested/accepted/rejected.
- [x] Preserve recovery rejection diagnostics.
- [x] Add tests for unsupported migration producing typed errors.
- [x] Add tests for recovery object validation via fake native/WASM backends.

## Agent-Facing Reporting

- [x] Provide transport selection summary suitable for CLI/agent logs.
- [x] Include selected transport, rejected candidates, score inputs, and fallback reason.
- [x] Keep reporting structured so opencode-style integrations can render it without parsing text.
