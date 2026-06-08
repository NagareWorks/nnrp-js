# JavaScript/TypeScript Preview4 Implementation Todo

Preview4 keeps the role package plus transport package architecture and adds runtime control, runtime objects, IPC,
WebSocket, and wire-level conformance.

## Workstreams

- [ ] [01 - Package boundaries and contract](01-package-boundaries-and-contract.md)
- [ ] [02 - Runtime control API](02-runtime-control-api.md)
- [ ] [03 - Runtime object and cache references](03-runtime-object-cache-references.md)
- [ ] [04 - IPC and WebSocket transports](04-ipc-websocket-transports.md)
- [ ] [05 - Wire conformance and benchmarks](05-wire-conformance-and-benchmarks.md)
- [ ] [06 - Release, docs, and npm hygiene](06-release-docs-npm-hygiene.md)

## Coordination Rules

- [ ] Keep role packages focused on client/server user APIs.
- [ ] Keep transport packages owning real transport behavior and artifacts.
- [ ] Keep browser WebSocket API as I/O substrate only; NNRP semantics remain in transport package code.
- [ ] Keep native and WASM artifact loading scoped to the transport package that owns the transport.
- [ ] Update this index as workstreams split or complete.
