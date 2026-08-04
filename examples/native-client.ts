import { NnrpNativeBindingUnavailableError, openNativeClient } from "@nnrp/native-client";
import { createTokenSubmitRequest, NNRP_DEFAULT_SUBMIT_HEADER, NNRP_DEFAULT_SUBMIT_POLICY } from "@nnrp/core";
import { createQuicTransportProvider } from "@nnrp/transport-quic";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const client = await openNativeClient({
  endpoint: "nnrp://127.0.0.1:4433/session/default",
  transports: [createTcpTransportProvider(), createQuicTransportProvider()],
  transportPolicy: "auto",
});

const session = await client.openSession();

try {
  const result = await session.submit(createTokenSubmitRequest({
    identity: { operationId: 1n, frameId: 1, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload: new Uint8Array([1, 2, 3, 4]) }],
  }));

  const bodyBytes = result.event.type === "runtime" && result.event.event.tail.type === "body"
    ? result.event.event.tail.body.byteLength
    : 0;
  console.log("NNRP result", result.operationId, result.terminalState, bodyBytes);
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
