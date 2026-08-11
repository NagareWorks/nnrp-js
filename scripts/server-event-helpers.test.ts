import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { NnrpServerSession } from "@nnrp/native-server";
import { awaitClientResultAndServerCompletion } from "./server-event-helpers.ts";
import { createSuccessResultReply } from "./runtime-event-fixtures.ts";

Deno.test("awaitClientResultAndServerCompletion drains the matching lifecycle event", async () => {
  let polls = 0;
  const session = {
    nextEvent: () => {
      polls += 1;
      return Promise.resolve({
        type: "lifecycle" as const,
        event: { operationId: 7n, state: "completed" as const },
      });
    },
  } as unknown as NnrpServerSession;

  const result = await awaitClientResultAndServerCompletion(session, Promise.resolve("done"), 5_000, 7n);

  assertEquals(result, "done");
  assertEquals(polls, 1);
});

Deno.test("createSuccessResultReply leaves the terminal-copy boundary to sendResult", () => {
  const body = new Uint8Array([1, 2, 3]);
  const reply = createSuccessResultReply(body);

  assertStrictEquals(reply.body, body);
});
