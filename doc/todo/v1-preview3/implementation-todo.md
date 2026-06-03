# NNRP/1-preview3 JavaScript/TypeScript SDK Implementation Todo

## 0. Scope

1. This directory tracks the JavaScript/TypeScript SDK rollout as a Deno-authored, Node-compatible package workspace.
2. Wire semantics, native FFI ABI, and WASM primitives are owned by `nnrp-doc` and `nnrp-rs`; this repository owns JS/TS
   package boundaries, runtime loading, public API ergonomics, conformance adapters, and npm release gates.
3. Do not reimplement protocol-critical codecs, state machines, transport scoring, or schema validation in TypeScript
   when a Rust native or WASM primitive exists.
4. Deno is the repository tooling layer. Published packages must remain Node-compatible ESM with `.d.ts` declarations
   and browser-safe bundles where applicable.
5. Bun is out of scope for runtime support, adaptation, tests, CI axes, examples, and package exports.

## 2. Shard Map

1. `01-foundation-and-contract.md`: package graph, build modes, naming rules, dependency isolation, and public API
   contract consumed from `nnrp-doc`.
2. `02-connection-session-flow-control.md`: ownership and dependency map for the `02a/02b/02c` connection/session
   shards.
3. `02a-connection-session-lifecycle.md`: client/server bootstrap, session open/patch/close, and handle lifecycle.
4. `02b-scheduling-events-and-diagnostics.md`: submit/cancel, priority, result events, flow updates, diagnostics, and
   async delivery shape.
5. `02c-recovery-and-transport-binding.md`: transport provider selection, migration/recovery, and browser transport slot
   behavior.
6. `03-cache-schema-profile-registry.md`: cache leases, schema/profile registry, standard payload profiles, and typed
   payload ownership.
7. `04-implementation-surface.md`: ownership and dependency map for `04a/04b/04c/04d` implementation shards.
8. `04a-core-package-contract.md`: `@nnrp/core` constants, types, manifest helpers, validation helpers, and declaration
   stability.
9. `04b-native-runtime-adoption.md`: `@nnrp/native-client`, `@nnrp/native-server`, `@nnrp/transport-tcp`,
   `@nnrp/transport-quic`, artifact loading, native role facades, and FFI handle wrappers.
10. `04c-wasm-runtime-adoption.md`: `@nnrp/browser-client`, `@nnrp/transport-websocket`, browser runtime loading, client
    facade, and browser transport adapter.
11. `04d-package-and-runtime-boundaries.md`: export maps, package contents, runtime-policy gates, bundling checks, and
    npm artifact structure.
12. `05-validation-and-docs.md`: conformance, benchmarks, docs synchronization, release workflow, and publication gates.

## 3. PR Rules

1. One shard per PR by default.
2. If a change affects package exports, public method names, or artifact contents, update `nnrp-doc` JS/TS SDK pages in
   the same PR or an immediately linked PR.
3. If a change needs new Rust native or WASM symbols, update `nnrp-rs` first and consume the released artifact here.
4. Do not add Bun-specific support, compatibility probes, lockfiles, examples, CI axes, or package exports.
5. Normal work targets `main` until a separate release freeze branch is created.
6. Keep core, native client, native server, browser client, and individual transport adapter package changes separated
   unless a boundary rule itself changes.

## 4. Protocol Coverage Check

1. Capability manifests, transport candidates, diagnostics, request/result types, and shared identifiers are tracked in
   `01` and `04a`.
2. Client/server connection lifecycle, session lifecycle, and raw handle ownership are tracked in `02a`, `04b`, and
   `04c`.
3. Priority classes, operation lifecycle, cancel scope, flow updates, result hints, and event delivery are tracked in
   `02b`, `04b`, and `04c`.
4. Transport provider scoring, rejection diagnostics, migration, recovery, and browser transport slots are tracked in
   `02c`, `04b`, and `04c`.
5. Cache lease/version/dependency rules, schema descriptors, typed payload descriptors, and profile registry behavior
   are tracked in `03` and `04a`.
6. Package boundaries, runtime import rules, native/browser artifact contents, and npm publish layout are tracked in
   `04d` and `05`.
7. Conformance adapters and benchmark runners must claim/report capabilities by active build mode, tracked in `05`.
