# 05 - Wire Conformance And Benchmarks

## Wire Target Manifest

- [ ] Add command to emit JS target manifests for wire conformance.
- [ ] Include role package name.
- [ ] Include protocol version.
- [ ] Include suite version.
- [ ] Include supported modes.
  - [ ] Suite as client.
  - [ ] Suite as server for Node/Deno.
  - [ ] Suite as proxy where package support exists.
- [ ] Include supported transports.
  - [ ] TCP.
  - [ ] QUIC.
  - [ ] IPC.
  - [ ] WebSocket.
- [ ] Include capabilities and limits.

## Wire Harness

- [ ] Add Node harness for suite-as-client scenarios.
- [ ] Add Node harness for suite-as-server scenarios.
- [ ] Add Node harness for IPC scenarios.
- [ ] Add Node harness for WebSocket scenarios.
- [ ] Add browser harness for WebSocket client scenarios.
- [ ] Write observed frame result reports.
- [ ] Write evidence logs.

## Adapter Separation

- [ ] Keep adapter conformance command separate from wire conformance command.
- [ ] Keep OpenAI API profile conformance separate from protocol wire conformance.
- [ ] Add CI jobs that show which contract is running.
- [ ] Add skip output for unavailable runtime environments.

## Benchmarks

- [ ] Add runtime-control event benchmark.
- [ ] Add object ref benchmark.
- [ ] Add IPC loopback benchmark.
- [ ] Add WebSocket loopback benchmark.
- [ ] Add browser WebSocket/WASM benchmark.
- [ ] Compare preview4 transports against preview3 baselines.
- [ ] Store benchmark results under `doc/benchmarks`.
