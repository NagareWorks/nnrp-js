<p align="center">
  <img src="https://raw.githubusercontent.com/NagareWorks/nnrp-js/main/assets/nnrp-readme-banner.svg" alt="NNRP" width="720">
</p>

# @nnrp/native-server

Native server entrypoint for NNRP Node.js and Deno adapter processes.

This package exposes server/listen/session receive APIs only. Client callers should use `@nnrp/native-client`.

```bash
npm install @nnrp/native-server @nnrp/transport-tcp
```

```ts
import { openBackendRuntime } from "@nnrp/native-server";
import { NnrpEndpoint, NnrpResultClass } from "@nnrp/core";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const runtime = await openBackendRuntime({
  transports: [createTcpTransportProvider()],
  transportPolicy: "force-tcp",
});

const server = runtime.listen({ endpoint: NnrpEndpoint.parse("nnrp://0.0.0.0:4433/session/default") });
const session = await server.accept();
const operation = await session.receiveSubmit();

await operation.sendResult({
  statusCode: 0,
  resultFlags: 0,
  sectionCount: 0,
  tileCount: 0,
  activeProfileId: 0,
  inferenceMs: 0,
  queueMs: 0,
  serverTotalMs: 0,
  tileBaseId: 0,
  tileIndexBytes: 0,
  resultClass: NnrpResultClass.Complete,
  appliedBudgetPolicy: 0,
  reusedFrameId: 0,
  coveredTileCount: 0,
  droppedTileCount: 0,
  payloadKindBitmap: 0,
  payloadFrameCount: 0,
});

await server.close();
await runtime.close();
```

The server session owns listener/session controls, backpressure, credits, diagnostics, runtime objects, and cache
references. Each accepted `NnrpServerOperation` owns progress, partial results, terminal results, and result drops for
its submit. Transport packages own carrier listeners and their native artifacts.

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/native-server
