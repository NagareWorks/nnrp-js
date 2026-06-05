# Native Runtime Benchmark Baseline

## Goal

Track the JavaScript/TypeScript SDK native runtime path against the Rust-backed `nnrp-rs` artifacts. Backend packages
use native FFI artifacts, while browser packages use WASM and are benchmarked separately once the browser client runtime
lands.

## Runtime Strategy

1. Use Deno as the build and benchmark runner while keeping package code compatible with Node.js hosts.
2. Resolve backend native artifacts from the installed transport package or explicit benchmark environment variables.
3. Keep browser client code out of backend native packages and server/native code out of browser packages.
4. Treat `@nnrp/transport-tcp` and `@nnrp/transport-quic` as split native artifact owners rather than config flags.

## Pinned Native Contract

The current preview3 benchmark consumes `nnrp-rs` native artifact version `1.0.0-preview.3.8`.

The benchmark hot path calls the Rust compact submit/result FFI path in 1024-operation batches through Deno FFI.
Transport provider packages are split, but the measured submit/result hot path remains in the same native ABI family as
Python cffi and C# NativeBridge.

## Environment

| Run                          | Date       | SDK commit | nnrp-rs artifact  | Host runtime | OS/arch        | Notes                                                                                             |
| ---------------------------- | ---------- | ---------- | ----------------- | ------------ | -------------- | ------------------------------------------------------------------------------------------------- |
| Previous all-in-one artifact | 2026-06-06 | 697e9fb    | 1.0.0-preview.3.8 | deno 2.7.14  | windows/x86_64 | Earlier local run before validating split provider packaging; throughput range 7.80M-7.81M ops/s. |
| Split native artifact run 1  | 2026-06-06 | 697e9fb    | 1.0.0-preview.3.8 | deno 2.7.14  | windows/x86_64 | Explicit Rust-backed FFI module through `NNRP_JS_BENCHMARK_NATIVE_LIBRARY`.                       |
| Split native artifact run 2  | 2026-06-06 | 697e9fb    | 1.0.0-preview.3.8 | deno 2.7.14  | windows/x86_64 | Repeat run for local stability check.                                                             |

## Throughput And Latency

| Benchmark          | Payload                  | Runtime path                           |      p50 |      p95 |      p99 |                    Throughput |  Peak memory | Notes                                                    |
| ------------------ | ------------------------ | -------------------------------------- | -------: | -------: | -------: | ----------------------------: | -----------: | -------------------------------------------------------- |
| Submit/result loop | 1024-byte inline payload | Deno FFI, previous all-in-one artifact |      TBD |      TBD |      TBD | 7,799,233.8-7,810,385.7 ops/s |          TBD | Historical local reference from the pre-split run.       |
| Submit/result loop | 1024-byte inline payload | Deno FFI, split artifact run 1         | 0.118 us | 0.136 us | 0.192 us |             8,217,746.5 ops/s | 20,314,464 B | Measured by `l4.native.submit_result.js_ffi.throughput`. |
| Submit/result loop | 1024-byte inline payload | Deno FFI, split artifact run 2         | 0.118 us | 0.136 us | 0.192 us |             8,213,098.9 ops/s | 20,183,712 B | Repeat run; no split artifact regression observed.       |

## Current Reading

Split native artifacts are slightly faster than the previous all-in-one artifact reference on this host. The JavaScript
FFI hot path is in the same 8M ops/s class as Python cffi API and C# NativeBridge compact-batch runs.
