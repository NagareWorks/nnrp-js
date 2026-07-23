# NNRP/1 Preview4 JavaScript/TypeScript Implementation Todo

This directory is the closed implementation plan for JavaScript/TypeScript Preview4. The public API contract is frozen
in `nnrp-doc`; Rust `1.0.0-preview.4.16` owns the native and WASM ABI; and `nnrp-conformance` owns wire-level schemas
and scenarios.

## Closure Rules

- [ ] Implement only the tasks already listed in this directory.
- [ ] Do not preserve Preview1, Preview2, or Preview3 aliases, overloads, endpoint forms, message names, transport
      policies, or artifact layouts.
- [ ] Do not add a code-path placeholder, mock runtime, config-only provider, or package that delegates its owned
      behavior to another package.
- [ ] If implementation evidence contradicts a frozen public API, stop that implementation path and resolve the
      `nnrp-doc` contract before changing code.
- [ ] If a new product requirement is discovered, stop the affected workstream and revise the frozen design and this
      plan before implementation resumes.
- [ ] Check a parent item only when every child item and its named acceptance evidence are complete.
- [ ] Keep commits scoped to one workstream and include the matching todo updates in the same commit.

## Frozen Workstreams

- [ ] [00 - Scope, ownership, and closure](00-scope-and-closure.md)
- [ ] [01 - Core contract and endpoints](01-core-contract-and-endpoints.md)
- [x] [02 - Codecs and runtime events](02-codecs-and-runtime-events.md)
- [ ] [03 - Client control surface](03-client-control-surface.md)
- [ ] [04 - Server control surface](04-server-control-surface.md)
- [x] [05 - Runtime objects and cache references](05-runtime-object-and-cache.md)
- [x] [06 - IPC carrier provider](06-ipc-provider.md)
- [x] [07 - WebSocket carrier provider](07-websocket-provider.md)
- [ ] [08 - Wire conformance and benchmarks](08-wire-conformance-and-benchmarks.md)
- [ ] [09 - Artifacts, release, and docs](09-artifacts-release-docs.md)

## Release Closure

- [ ] All workstream files contain zero unchecked boxes.
- [ ] `deno task lint`, `deno task test`, `deno task coverage`, and `deno task package-check` pass.
- [ ] Native and browser wire-conformance target manifests validate against the released suite schema.
- [ ] Release dry-run tarballs pass the ownership checks in workstream 09.
- [ ] The develop-to-main pull request is green before Preview4 publishing starts.
