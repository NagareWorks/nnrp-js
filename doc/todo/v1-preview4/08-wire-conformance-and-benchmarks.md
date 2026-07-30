# 08 - Wire Conformance and Benchmarks

## Target Manifests

- [x] Add a JavaScript wire-target manifest generator matching the released schema.
  - [x] Emit `protocol_version: nnrp-1-preview4` and the selected suite version.
  - [x] Emit only live endpoint entries with `name`, `endpoint`, and `tls`.
  - [x] Emit exact capability tokens and positive `max_frame_bytes`/`max_in_flight` limits.
  - [x] Validate generated manifests before starting a harness.
- [x] Declare modes by actual role behavior.
  - [x] Native server harness declares `suite_as_client`.
  - [x] Native client harness declares `suite_as_server`.
  - [x] Native target exposes the QUIC upstream role required by `suite_as_proxy`.
  - [x] Browser client harness declares `suite_as_server` over WebSocket only.
  - [x] No harness declares a mode or transport it did not start.

## Live Harnesses

- [x] Add Node/Deno native harnesses.
  - [x] Start server-target mode for the frozen TCP, QUIC, and IPC scenarios.
  - [x] Start client-target mode for the frozen TCP and WebSocket scenarios.
  - [x] Serve the QUIC upstream for the suite-owned proxy with independent ingress and egress evidence.
  - [x] Shut down providers and sessions deterministically after each plan.
- [x] Add the browser harness.
  - [x] Start a browser client against the suite-owned WebSocket endpoint.
  - [x] Report browser/WASM observations in the standard case-results schema.
  - [x] Capture console, frame, and timing evidence without SDK-adapter translation.
- [x] Integrate result validation.
  - [x] Write observed frames, terminal state, failures, and evidence paths.
  - [x] Run the suite validator on every produced report.
  - [x] Keep adapter conformance and OpenAI API profile conformance as separate commands/jobs.
  - [x] Consume the suite-owned Preview4 adapter plan instead of generating SDK-owned skip reports.
  - [x] Require exact equality between the 10 mandatory/optional suite-selected cases and the formal JS adapter catalog.
  - [x] Keep `supersede` and `recoverable-error` executable and directly tested while their frozen status remains
        experimental.
  - [x] Declare the complete 18-capability Preview4 catalog used for adapter case selection.

## CI Coverage

- [x] Add wire-conformance jobs with explicit result states.
  - [x] Run the complete Preview4 control/object/cache scenario set on the Linux x86_64 native job.
  - [x] Run TCP and IPC on every compatible native CI host.
  - [x] Run QUIC and native WebSocket in their configured integration jobs.
  - [x] Run browser WebSocket/WASM scenarios in the browser job.
  - [x] Emit a machine-readable skip only for a matrix cell whose platform cannot host that provider.
  - [x] Fail when a declared capability, mode, or transport has no selected scenario.
- [x] Add suite-owned adapter conformance as an independent CI and release gate.
  - [x] Execute all selected cases through released JS codecs, facades, or live native paths.
  - [x] Validate adapter results and evidence with the pinned conformance suite.
  - [x] Keep adapter conformance separate from native and browser wire-target jobs.
- [x] Add host-route cardinality coverage against suite-owned endpoints.
  - [x] Run a native client with at least two resolved routes and verify deterministic selection.
  - [x] Run forced unresolved and security-incompatible client routes without fallback.
  - [x] Run a native server with at least two simultaneously bound listeners.
  - [x] Verify every actual bound provider endpoint.
  - [x] Accept one real session through every listener and verify active transport identity.
  - [x] Inject a bind failure and verify atomic rollback.
  - [x] Inject a terminal listener failure and verify the logical set closes instead of shrinking.
  - [x] Run the native and browser `nnrps://` security matrix.
  - [x] Verify known-but-uninstalled routes and combined failures use exact rejection precedence.
  - [x] Reject self-adapter-only evidence for these scenarios.

## Benchmarks

- [x] Add Preview4 benchmark entrypoints.
  - [x] Runtime-control encode/submit/poll throughput.
  - [x] Runtime-object reference and delta throughput.
  - [x] IPC loopback throughput and latency.
  - [x] Native WebSocket loopback throughput and latency.
  - [x] Browser WebSocket/WASM throughput and latency.
- [x] Preserve performance evidence.
  - [x] Compare coarse-call overhead against the checked-in Preview3 native baseline.
  - [x] Record environment, artifact version, payload sizes, concurrency, and sample counts.
  - [x] Store machine-readable results and a human-readable report under `doc/benchmarks`.
  - [x] Fail the release gate on a configured coarse-FFI regression threshold.

## Acceptance Evidence

- [x] All generated target manifests validate against `wire-conformance-target.schema.json`.
- [x] All reports validate against the selected plan and case-results schema.
- [x] CI artifacts identify every executed and skipped matrix cell.
- [x] Benchmark reports contain no private hostnames, addresses, tokens, or local user paths.
