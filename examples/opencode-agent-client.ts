import { NnrpNativeBindingUnavailableError, openNativeClient } from "@nnrp/native-client";
import { createTokenSubmitRequest, NNRP_DEFAULT_SUBMIT_HEADER, NNRP_DEFAULT_SUBMIT_POLICY } from "@nnrp/core";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

interface AgentTurn {
  readonly id: number;
  readonly prompt: string;
}

async function submitAgentTurn(turn: AgentTurn): Promise<void> {
  const client = await openNativeClient({
    endpoint: "nnrp://127.0.0.1:4433/session/default",
    transports: [createTcpTransportProvider()],
    transportPolicy: "auto",
  });

  const session = await client.openSession();

  try {
    await session.submitNoWait(createTokenSubmitRequest({
      identity: {
        operationId: BigInt(turn.id),
        frameId: turn.id,
        header: NNRP_DEFAULT_SUBMIT_HEADER,
      },
      policy: NNRP_DEFAULT_SUBMIT_POLICY,
      chunks: [{ payload: new TextEncoder().encode(turn.prompt) }],
    }));
  } catch (error) {
    if (error instanceof NnrpNativeBindingUnavailableError) {
      console.log("Agent transport is not connected yet:", error.diagnostic.code);
      return;
    }
    throw error;
  } finally {
    await session.close();
    await client.close();
  }
}

await submitAgentTurn({ id: 1, prompt: "Summarize the current repository status." });
