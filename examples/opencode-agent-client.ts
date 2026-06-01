import { NnrpNativeBindingUnavailableError, openNativeClient } from "@nnrp/native";

interface AgentTurn {
  readonly id: number;
  readonly prompt: string;
}

async function submitAgentTurn(turn: AgentTurn): Promise<void> {
  const client = await openNativeClient({
    endpoint: "127.0.0.1:4433",
    nativeLibrary: { artifactDir: "./native" },
    transportPolicy: "score",
    sessionDefaults: { inputProfile: "tool_delta", metadata: { app: "opencode-agent" } },
  });

  const session = client.openSession();

  try {
    await session.submitNoWait({
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
