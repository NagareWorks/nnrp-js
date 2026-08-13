import { NnrpMessageType } from "@nnrp/core";
import type { NnrpServerSession } from "@nnrp/native-server";
import { assertRuntimeMetadata, createSuccessResultReply } from "./runtime-event-fixtures.ts";
import { receiveServerLifecycleEvent, receiveServerRuntimeEvent } from "./server-event-helpers.ts";

const TIMEOUT_MILLIS = 5_000;
const DEADLINE_OPERATION_ID = 151n;
const DEADLINE_UNIX_MS = 4_000_000_000_000n;
const RESPONSE_BODY = new TextEncoder().encode("wire-external-result");

export async function handleDeadlineBeforeSubmit(session: NnrpServerSession): Promise<void> {
  const deadlineEvent = await session.nextEvent({ timeoutMillis: TIMEOUT_MILLIS });
  if (deadlineEvent.type !== "runtime") {
    throw new Error(`deadline-before-submit target expected DEADLINE first, got ${deadlineEvent.type}`);
  }
  const deadline = deadlineEvent.event;
  if (deadline.header.messageType !== NnrpMessageType.Deadline) {
    throw new Error(`deadline-before-submit target expected DEADLINE, got ${deadline.header.messageType}`);
  }
  assertRuntimeMetadata(deadline, "scheduling");
  if (
    deadline.metadata.value.operationId !== DEADLINE_OPERATION_ID ||
    deadline.metadata.value.deadlineUnixMs !== DEADLINE_UNIX_MS ||
    deadline.header.frameId !== 1
  ) {
    throw new Error("deadline-before-submit target received metadata outside the frozen scenario");
  }

  const operation = await session.receiveSubmit({ timeoutMillis: TIMEOUT_MILLIS });
  if (
    operation.operationId !== deadline.metadata.value.operationId ||
    operation.frameId !== deadline.header.frameId
  ) {
    throw new Error("deadline-before-submit target received mismatched submit correlation");
  }
  const result = createSuccessResultReply(RESPONSE_BODY);
  await operation.sendResult(result.metadata, result.body);
  await receiveServerLifecycleEvent(
    session,
    TIMEOUT_MILLIS,
    operation.operationId,
    "completed",
  );
  const close = await receiveServerRuntimeEvent(session, TIMEOUT_MILLIS);
  if (close.header.messageType !== NnrpMessageType.SessionClose) {
    throw new Error(`deadline-before-submit target expected SESSION_CLOSE, got ${close.header.messageType}`);
  }
  await session.close();
}
