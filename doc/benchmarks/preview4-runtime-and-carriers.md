# Preview4 Runtime and Carrier Benchmarks

## Purpose

This run records the JavaScript SDK transition to the released Rust `1.0.0-preview.4.16` artifacts. It covers the coarse
native FFI boundary, Preview4 control and object paths, package-owned IPC and WebSocket carriers, and the browser WASM
role over a real WebSocket connection.

The coarse FFI result is the release regression gate. Carrier rows are single-concurrency request/echo measurements, so
they describe per-operation latency for this harness rather than maximum pipelined or batched carrier throughput.

## Environment

| Date       | SDK revision             | Rust artifact      | Runtime     | OS/arch        | Concurrency |
| ---------- | ------------------------ | ------------------ | ----------- | -------------- | ----------: |
| 2026-07-23 | develop after `c81e6fd2` | 1.0.0-preview.4.16 | Deno 2.7.14 | Windows/x86_64 |           1 |

Production scenarios load the transport-scoped native libraries and browser WASM staged from the published Rust release.
The coarse FFI row uses an explicit `benchmark-ffi,transport-tcp` build from the same release revision; those
benchmark-only symbols are excluded from every production transport artifact.

## Results

| Scenario                         | Path                                  | Payload | Samples |         p50 |         p95 |         p99 |        Throughput |
| -------------------------------- | ------------------------------------- | ------: | ------: | ----------: | ----------: | ----------: | ----------------: |
| Coarse submit/result batch       | Deno FFI, 1024 operations per batch   | 1,024 B |  25,060 |    0.068 us |    0.149 us |    0.752 us | 8,553,349.7 ops/s |
| Priority update                  | TCP role encode/send/poll             |     0 B |   1,189 |    339.5 us |  3,602.3 us |  9,577.8 us |     1,186.0 ops/s |
| Object reference                 | TCP role send/poll                    | 1,024 B |   1,699 |    290.9 us |  1,819.7 us |  5,954.4 us |     1,698.9 ops/s |
| Object delta                     | TCP role send/poll                    | 1,024 B |   1,105 |    318.1 us |  2,406.3 us | 11,827.9 us |     1,098.4 ops/s |
| IPC packet loopback              | Package-owned Rust IPC provider       |    40 B |      64 | 15,636.5 us | 26,658.4 us | 28,885.2 us |        63.3 ops/s |
| Native WebSocket packet loopback | Package-owned Rust WebSocket provider |    40 B |      69 | 14,725.1 us | 28,013.3 us | 33,664.2 us |        68.3 ops/s |
| Browser submit/result            | Browser WASM role over real WebSocket | 1,024 B |   1,726 |    509.9 us |    942.5 us |  1,393.3 us |     1,725.3 ops/s |

## Regression Gate

The checked-in Preview3 coarse FFI baseline is `7,799,233.8 ops/s`. Preview4 measured `8,553,349.7 ops/s`, about `9.7%`
above that baseline. The release gate permits at most a 10% regression, which sets the minimum at `7,019,310.4 ops/s`;
this run passes with all seven scenarios measured and no skips.

## Reproduction

```powershell
$env:NNRP_JS_RUST_ARTIFACT_VERSION = "1.0.0-preview.4.16"
deno task artifacts:prepare

# Build nnrp-ffi from the matching Rust tag with benchmark-ffi,transport-tcp.
$env:NNRP_JS_BENCHMARK_NATIVE_LIBRARY = "<benchmark-ffi-library>"
deno task benchmark:conformance --plan scripts/release-benchmark-plan.json --output artifacts/release-benchmark-results.json
deno task benchmark:release-gate --results artifacts/release-benchmark-results.json
deno task benchmark:privacy
```

The machine-readable report is generated at `artifacts/release-benchmark-results.json`. It is a release evidence
artifact rather than a tracked source file; this document preserves the reviewed milestone values.
