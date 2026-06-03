# 02. Connection, Session, and Flow Control

Preview3 exposes client and server session operations through role packages while keeping shared protocol behavior in
core.

- [x] Provide native client connect, session open, submit, cancel, patch, and event polling surfaces.
- [x] Provide native server listen, accept, receive, and session event surfaces.
- [x] Provide browser client connect and session surfaces for WebSocket-capable runtimes.
- [x] Route shared request normalization through `@nnrp/core`.
- [x] Preserve flow-control credit validation at the role package boundary.
- [x] Surface protocol, transport, timeout, recovery, and capability errors consistently across role packages.
