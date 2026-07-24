<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP - Neural Network Runtime Protocol" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/NagareWorks/nnrp-js/actions"><img alt="CI" src="https://img.shields.io/badge/CI-typescript-22c55e"></a>
  <a href="https://deno.com"><img alt="Deno" src="https://img.shields.io/badge/Deno-2.x-000000?logo=deno&logoColor=white"></a>
  <a href="https://www.typescriptlang.org"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white"></a>
  <a href="https://nodejs.org"><img alt="Node-compatible" src="https://img.shields.io/badge/Node-compatible-64748b?logo=node.js&logoColor=white"></a>
  <a href="https://nagareworks.github.io/nnrp-doc/"><img alt="Docs" src="https://img.shields.io/badge/docs-nnrp--doc-38bdf8"></a>
  <a href="https://github.com/NagareWorks/nnrp-js/blob/main/LICENSE"><img alt="Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-64748b"></a>
</p>

# nnrp-js

Deno-first TypeScript SDK for NNRP/1 Preview4, with Node-compatible ESM packages and a browser WASM client.

The SDK separates application roles from carrier providers. Native client and server packages own role/session
lifecycle; each native carrier package owns its Rust transport implementation and platform libraries; the browser client
owns the browser WASM runtime.

## Packages

| Package                     | Owned boundary                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `@nnrp/core`                | Runtime-neutral contracts, codecs, validation, endpoints, and provider selection.   |
| `@nnrp/native-client`       | Node.js/Deno client, session, control, object, and cache lifecycle.                 |
| `@nnrp/native-server`       | Node.js/Deno listener, accepted session, response, control, object, and cache APIs. |
| `@nnrp/browser-client`      | Browser client/session lifecycle and the single `nnrp-wasm-browser` artifact.       |
| `@nnrp/transport-tcp`       | TCP provider behavior and TCP native libraries.                                     |
| `@nnrp/transport-quic`      | QUIC provider behavior and QUIC native libraries.                                   |
| `@nnrp/transport-ipc`       | Unix-domain socket / Windows named-pipe provider behavior and native libraries.     |
| `@nnrp/transport-websocket` | Native WebSocket provider libraries plus the browser host-WebSocket binding.        |

## Build Modes

| Build mode       | Role packages                                | Runtime target                  | Carrier packages                       |
| ---------------- | -------------------------------------------- | ------------------------------- | -------------------------------------- |
| `core`           | `@nnrp/core`                                 | Runtime-neutral TypeScript      | None                                   |
| `backend-native` | `@nnrp/native-client`, `@nnrp/native-server` | Node.js 20.11+ and Deno 2+      | TCP, QUIC, IPC, and WebSocket packages |
| `browser-client` | `@nnrp/browser-client`                       | Modern ES2022 browser with WASM | `@nnrp/transport-websocket`            |

Install exactly the carriers an application permits. One installed provider is used directly; multiple providers are
probed and selected by the frozen policy, limits, cost, preference, throughput, and RTT rules.

## Quick Start

```bash
npm install @nnrp/native-client @nnrp/transport-tcp
```

```ts
import { openNativeClient } from "@nnrp/native-client";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const client = await openNativeClient({
  endpoint: "nnrp://127.0.0.1:4433/session/default",
  transports: [createTcpTransportProvider()],
  transportPolicy: "auto",
});

const session = client.openSession({ inputProfile: "tensor" });
const result = await session.submit({
  operationId: 1n,
  frameId: 1,
  payload: new Uint8Array([1, 2, 3]),
  inputProfile: "tensor",
  submitMode: "inline",
});

await session.close();
await client.close();
```

Use `@nnrp/native-server` for a listener and `@nnrp/browser-client` with `@nnrp/transport-websocket` for a browser
client. The [JavaScript quick start](https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/quick-start) covers all
three roles.

## Endpoints

Role APIs receive an NNRP application endpoint such as `nnrp://host:4433/session/default`. A carrier-local endpoint is
separate: clients use one optional `providerEndpoint`, while server listener sets use `providerEndpoints` keyed by
transport kind. TCP/QUIC can derive a locator; IPC (`unix://`, `npipe://`) and WebSocket (`ws://`, `wss://`) require an
explicit locator. Provider-local addresses are never serialized into operation payloads.

## Runtime Surface

Native and browser clients expose the same submit, cancellation, deadline, priority, progress, partial-result, runtime
object, cache reference, and event polling concepts. `@nnrp/native-server` additionally exposes listen/accept and
server-only response controls. Public methods use structured Preview4 metadata and `bigint` for wire `u64` fields;
native handles, WASM handles, and transport-library handles remain private.

## Conformance And Benchmarks

```bash
deno task wire-conformance:native
deno task wire-conformance:browser
deno task installed-package-smoke
deno task benchmark:conformance --plan scripts/release-benchmark-plan.json --output artifacts/release-benchmark-results.json
```

Wire evidence is written beneath `artifacts/wire-conformance/native` and `artifacts/wire-conformance/browser`. Release
tarball evidence, including Node, Deno, and browser import results, is written to
`artifacts/installed-package-smoke/evidence.json`. Benchmark results are checked against the committed Preview3
coarse-FFI baseline and the public result is recorded in
[`doc/benchmarks/preview4-runtime-and-carriers.md`](doc/benchmarks/preview4-runtime-and-carriers.md).

`nnrp-js` uses Deno for repository tooling and keeps Node.js compatibility for package consumers. Bun is not a supported
runtime, build tool, compatibility target, or CI axis for this SDK.

## Examples

| Example                             | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `examples/native-client.ts`         | Node/Deno native client shape for CLI and agent callers.  |
| `examples/native-server-adapter.ts` | Native server/adapter lifecycle shape.                    |
| `examples/browser-client.ts`        | Browser/edge WASM client shape.                           |
| `examples/opencode-agent-client.ts` | Native client sketch for coding-agent style integrations. |

Examples use package entrypoint names through the repository import map. They are checked with
`deno task examples:check`.

Preview package versions are synchronized across the role, transport, and core packages. Source package manifests stay
`private: true` for workspace safety; the release workflow stages publishable manifests before running `npm publish`.

The release workflow uses npm Trusted Publishing with GitHub OIDC. Configure trusted publishers for all npm packages
with repository `NagareWorks/nnrp-js`, workflow `release.yml`, and GitHub environment `npm`; no `NPM_TOKEN` secret is
required for the default path.

TCP, QUIC, IPC, and WebSocket transport packages each bundle their own supported native platform artifacts. Role
packages contain no native libraries. The browser client is the only package carrying browser WASM; the WebSocket
package does not duplicate it.

## Contributors

<a href="https://github.com/NagareWorks/nnrp-js/graphs/contributors" title="Open the contributors graph for individual GitHub profiles and IDs.">
  <img src="https://contrib.rocks/image?repo=NagareWorks/nnrp-js" alt="Contributors" />
</a>

The avatar wall above is updated automatically from the repository contributor list.

GitHub README rendering does not support per-avatar dynamic tooltips for an auto-generated contributor wall, so use the
linked contributors graph if you want individual profile pages and account IDs.
