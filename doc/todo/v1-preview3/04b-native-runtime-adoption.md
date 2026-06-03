# 04b. Native Runtime Adoption

- [x] Keep `@nnrp/native-client` as the native client role package without bundling transport artifacts.
- [x] Keep `@nnrp/native-server` as the native server role package without bundling transport artifacts.
- [x] Embed full supported native artifact set inside `@nnrp/transport-tcp`.
- [x] Embed full supported native artifact set inside `@nnrp/transport-quic`.
- [x] Resolve native artifacts from the installed transport package before falling back to explicit/system paths.
- [x] Validate artifact manifest OS, architecture, library kind, and required exports before use.
- [x] Keep native client and server exports separated even when they share artifact preparation logic.
- [x] Package release gates require embedded native manifests in TCP and QUIC transport packages.
