import { NnrpNativeBindingUnavailableError, openNativeClient } from "@nnrp/native";

const client = await openNativeClient({
  endpoint: "127.0.0.1:4433",
  nativeLibrary: { artifactDir: "./native" },
  transportPolicy: "score",
  sessionDefaults: { inputProfile: "tensor", metadata: { app: "nnrp-native-client-example" } },
});

const session = client.openSession();

try {
  const result = await session.submit({
    frameId: 1,
    payload: new Uint8Array([1, 2, 3, 4]),
    inputProfile: "tensor",
    submitMode: "inline",
  });

  console.log("NNRP result", result.frameId, result.payload?.byteLength ?? 0);
} catch (error) {
  if (error instanceof NnrpNativeBindingUnavailableError) {
    console.log("Native runtime is not connected yet:", error.diagnostic.code);
  } else {
    throw error;
  }
} finally {
  await session.close();
  await client.close();
}
