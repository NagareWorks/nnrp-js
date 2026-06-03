# 04d. Package and Runtime Boundaries

- [x] Publish only user-facing role and transport packages.
- [x] Do not publish platform-specific native artifact packages.
- [x] Do not publish a standalone WASM artifact package as a primary SDK entrypoint.
- [x] Keep transport packages as real provider implementations, not configuration aliases.
- [x] Keep TCP and QUIC native/WASM artifacts in their transport packages, not in client/server role packages.
- [x] Keep WebSocket free of rs artifacts until rs exposes a real WebSocket transport.
- [x] Keep package READMEs aligned with the role-package installation model.
- [x] Release packaging stages generated artifacts into the transport packages that consume them.
