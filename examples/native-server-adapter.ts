import { NnrpNativeBindingUnavailableError, openBackendRuntime } from "@nnrp/native-server";
import { NnrpResultClass } from "@nnrp/core";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const runtime = await openBackendRuntime({
  transports: [createTcpTransportProvider()],
  transportPolicy: "auto",
});

const server = runtime.listen({ endpoint: "nnrp://0.0.0.0:4433/session/default" });

try {
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
} catch (error) {
  if (error instanceof NnrpNativeBindingUnavailableError) {
    console.log("Native server runtime is not connected yet:", error.diagnostic.code);
  } else {
    throw error;
  }
} finally {
  await server.close();
  await runtime.close();
}
