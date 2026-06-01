import { NnrpWasmBindingUnavailableError, openBrowserRuntime } from "@nnrp/wasm";

const runtime = await openBrowserRuntime({
  moduleUrl: "/assets/nnrp_wasm_bg.wasm",
  transportPolicy: "score",
});

const client = runtime.connect({
  endpoint: "wss://nnrp.example.test/session",
  sessionDefaults: { inputProfile: "token", metadata: { app: "nnrp-browser-client-example" } },
});

const session = client.openSession();

try {
  const result = await session.submit({
    frameId: 1,
    payload: new TextEncoder().encode("hello"),
    inputProfile: "token",
    submitMode: "inline",
  });

  console.log("NNRP browser result", result.frameId);
} catch (error) {
  if (error instanceof NnrpWasmBindingUnavailableError) {
    console.log("WASM runtime is not instantiated yet:", error.diagnostic.code);
  } else {
    throw error;
  }
} finally {
  await session.close();
  await client.close();
  await runtime.close();
}
