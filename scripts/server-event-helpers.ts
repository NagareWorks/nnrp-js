import type { NnrpOperationLifecycleEvent, NnrpOperationState, NnrpRuntimeEvent } from "@nnrp/core";
import type { NnrpServerSession } from "@nnrp/native-server";

export async function receiveServerRuntimeEvent(
  session: NnrpServerSession,
  timeoutMillis: number,
): Promise<NnrpRuntimeEvent> {
  const event = await session.nextEvent({ timeoutMillis });
  if (event.type === "runtime") return event.event;
  if (event.type === "submit") return event.operation.submit;
  throw new Error(`expected server runtime event, received lifecycle state ${event.event.state}`);
}

export async function receiveServerLifecycleEvent(
  session: NnrpServerSession,
  timeoutMillis: number,
  operationId: bigint,
  state: NnrpOperationState,
): Promise<NnrpOperationLifecycleEvent> {
  const event = await session.nextEvent({ timeoutMillis });
  if (event.type !== "lifecycle") {
    throw new Error(`expected server lifecycle event, received ${event.type}`);
  }
  if (event.event.operationId !== operationId || event.event.state !== state) {
    throw new Error(
      `expected server lifecycle ${state} for operation ${operationId}, received ${event.event.state} for ${event.event.operationId}`,
    );
  }
  return event.event;
}

export async function awaitClientResultAndServerCompletion<TResult>(
  session: NnrpServerSession,
  clientResult: Promise<TResult>,
  timeoutMillis: number,
  operationId: bigint,
): Promise<TResult> {
  const [result] = await Promise.all([
    clientResult,
    receiveServerLifecycleEvent(session, timeoutMillis, operationId, "completed"),
  ]);
  return result;
}
