import { NnrpNativeBindingUnavailableError, openBackendRuntime } from "@nnrp/native-server";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const runtime = await openBackendRuntime({
  nativeLibrary: { artifactDir: "./native" },
  transports: [createTcpTransportProvider()],
  transportPolicy: "score",
});

const server = runtime.listen({ endpoint: "0.0.0.0:4433" });

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
