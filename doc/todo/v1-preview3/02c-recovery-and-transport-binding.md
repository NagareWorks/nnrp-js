# 02c. Recovery and Transport Binding

- [x] Transport candidates are declared through the shared provider contract.
- [x] TCP transport is implemented in `@nnrp/transport-tcp`.
- [x] QUIC transport is implemented in `@nnrp/transport-quic`.
- [x] WebSocket transport is implemented in `@nnrp/transport-websocket`.
- [x] Role packages accept installed transport providers instead of hiding transport behavior in artifact packages.
- [x] Recovery helper paths expose unsupported-state diagnostics until the underlying runtime supports migration.
