import { NnrpNativeBindingUnavailableError, openNativeClient } from "@nnrp/native-client";
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
    sessionDefaults: { inputProfile: "tool_delta", metadata: { app: "opencode-agent" } },
  });

  const session = client.openSession();

  try {
    await session.submitNoWait({
      operationId: BigInt(turn.id),
      frameId: turn.id,
      payload: new TextEncoder().encode(turn.prompt),
      inputProfile: "tool_delta",
      submitMode: "inline",
      metadata: { kind: "agent-turn" },
    });
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
