import { NnrpNativeBindingUnavailableError, openBackendRuntime } from "@nnrp/native-server";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const runtime = await openBackendRuntime({
  transports: [createTcpTransportProvider()],
  transportPolicy: "auto",
});

const server = runtime.listen({ endpoint: "nnrp://0.0.0.0:4433/session/default" });

try {
  const session = await server.accept();
  const event = await session.receive();

  if (event.type === "result-hint") {
    await session.sendResult({
      frameId: event.hint.frameId,
      payload: new Uint8Array(),
      metadata: { source: "native-server-adapter-example" },
    });
  }
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
