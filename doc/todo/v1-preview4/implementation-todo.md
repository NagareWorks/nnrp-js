# NNRP/1 Preview4 JavaScript/TypeScript Implementation Todo

This directory is the closed implementation plan for JavaScript/TypeScript Preview4. The public API contract is frozen
in `nnrp-doc`; audited Rust release `1.0.0-preview.4.22` at merge commit `784a4a354f4e6a73798248f93cf574bd7a5af829` owns
native ABI `4.4.x`; and `nnrp-conformance` owns wire-level schemas and scenarios.

## Closure Rules

- [x] Implement only the tasks already listed in this directory.
- [x] Do not preserve Preview1, Preview2, or Preview3 aliases, overloads, endpoint forms, message names, transport
      policies, or artifact layouts.
- [x] Do not add a code-path placeholder, mock runtime, config-only provider, or package that delegates its owned
      behavior to another package.
- [x] If implementation evidence contradicts a frozen public API, stop that implementation path and resolve the
      `nnrp-doc` contract before changing code.
- [x] If a new product requirement is discovered, stop the affected workstream and revise the frozen design and this
      plan before implementation resumes.
- [x] Check a parent item only when every child item and its named acceptance evidence are complete.
- [x] Keep commits scoped to one workstream and include the matching todo updates in the same commit.

## Frozen Workstreams

- [x] [00 - Scope, ownership, and closure](00-scope-and-closure.md)
- [x] [01 - Core contract and endpoints](01-core-contract-and-endpoints.md)
- [x] [02 - Codecs and runtime events](02-codecs-and-runtime-events.md)
- [x] [03 - Client control surface](03-client-control-surface.md)
- [x] [04 - Server control surface](04-server-control-surface.md)
- [x] [05 - Runtime objects and cache references](05-runtime-object-and-cache.md)
- [x] [06 - IPC carrier provider](06-ipc-provider.md)
- [x] [07 - WebSocket carrier provider](07-websocket-provider.md)
- [x] [08 - Wire conformance and benchmarks](08-wire-conformance-and-benchmarks.md)
- [x] [09 - Artifacts, release, and docs](09-artifacts-release-docs.md)
- [x] [10 - SDK contract v9 recovery and multiplexing](10-sdk-contract-v9-recovery-and-multiplexing.md)

## Release Closure

- [x] All workstream files contain zero unchecked boxes.
- [x] `deno task lint`, `deno task test`, `deno task coverage`, and `deno task package-check` pass.
- [x] Native and browser wire-conformance target manifests validate against the released suite schema.
- [x] Release dry-run tarballs pass the ownership checks in workstream 09.
