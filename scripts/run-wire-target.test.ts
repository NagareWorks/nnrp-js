import { NnrpMessageType, NnrpResultClass, type NnrpRuntimeEvent } from "@nnrp/core";
import type { NnrpServerSession } from "@nnrp/native-server";
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { handleDeadlineBeforeSubmit } from "./wire-target-scenarios.ts";

Deno.test("wire target routes every server accept through the diagnostic helper", async () => {
  const source = await Deno.readTextFile("scripts/run-wire-target.ts");

  assertEquals(source.match(/server\.accept\(\)/g)?.length, 1);
  assertEquals(source.includes("await tcp.server.accept()"), false);
  assertEquals(source.includes("await quic.server.accept()"), false);
});

Deno.test("wire target requires frozen deadline-before-submit ordering and correlation", async () => {
  const calls: string[] = [];
  const session = deadlineSession(calls);

  await handleDeadlineBeforeSubmit(session);

  assertEquals(calls, ["deadline", "submit", "result", "lifecycle", "session-close", "close"]);
});

Deno.test("wire target rejects submit before the frozen deadline", async () => {
  const session = deadlineSession([], { firstEvent: { type: "submit" } });

  await assertRejects(
    () => handleDeadlineBeforeSubmit(session),
    Error,
    "expected DEADLINE first",
  );
});

Deno.test("wire target rejects mismatched deadline and submit identities", async () => {
  const session = deadlineSession([], { operationId: 152n });

  await assertRejects(
    () => handleDeadlineBeforeSubmit(session),
    Error,
    "mismatched submit correlation",
  );
});

function deadlineSession(
  calls: string[],
  options: {
    readonly firstEvent?: { readonly type: "submit" };
    readonly operationId?: bigint;
  } = {},
): NnrpServerSession {
  let nextEventIndex = 0;
  const operationId = options.operationId ?? 151n;
  const session = {
    nextEvent() {
      nextEventIndex += 1;
      if (nextEventIndex === 1) {
        calls.push("deadline");
        if (options.firstEvent !== undefined) return Promise.resolve(options.firstEvent);
        return Promise.resolve({ type: "runtime", event: deadlineEvent() });
      }
      if (nextEventIndex === 2) {
        calls.push("lifecycle");
        return Promise.resolve({ type: "lifecycle", event: { operationId, state: "completed" } });
      }
      calls.push("session-close");
      return Promise.resolve({ type: "runtime", event: sessionCloseEvent() });
    },
    receiveSubmit() {
      calls.push("submit");
      return Promise.resolve({
        operationId,
        frameId: 1,
        sendResult(metadata: { readonly resultClass: NnrpResultClass }, body: Uint8Array) {
          assertEquals(metadata.resultClass, NnrpResultClass.Complete);
          assertEquals(new TextDecoder().decode(body), "wire-external-result");
          calls.push("result");
          return Promise.resolve();
        },
      });
    },
    close() {
      calls.push("close");
      return Promise.resolve();
    },
  };
  return session as unknown as NnrpServerSession;
}

function deadlineEvent(): NnrpRuntimeEvent {
  return {
    header: runtimeHeader(NnrpMessageType.Deadline, 1),
    metadata: {
      type: "scheduling",
      value: {
        operationId: 151n,
        controlSequence: 1n,
        priorityClass: 0,
        priorityDelta: 0,
        deadlineUnixMs: 4_000_000_000_000n,
        flags: 0,
      },
    },
    tail: { type: "none" },
  };
}

function sessionCloseEvent(): NnrpRuntimeEvent {
  return {
    header: runtimeHeader(NnrpMessageType.SessionClose, 0),
    metadata: { type: "none" },
    tail: { type: "none" },
  };
}

function runtimeHeader(messageType: NnrpMessageType, frameId: number) {
  return {
    versionMajor: 1 as const,
    wireFormat: 0 as const,
    messageType,
    flags: 0,
    sessionId: 1,
    frameId,
    viewId: 0,
    routeId: 0,
    traceId: 0n,
  };
}
