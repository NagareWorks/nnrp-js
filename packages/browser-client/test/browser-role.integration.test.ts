import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  CacheMissReason,
  CacheReuseScope,
  createTokenSubmitRequest,
  ErrorScope,
  MemoryLocationHint,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  NnrpMessageType,
  type NnrpRuntimeEvent,
  NnrpTimeoutError,
  NnrpTransportError,
  ObjectReleaseReason,
  OwnershipHint,
  RuntimeObjectKind,
  RuntimeRole,
} from "@nnrp/core";
import { openBackendRuntime } from "@nnrp/native-server";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
import { type NnrpBrowserClientSession, openBrowserRuntime } from "../src/index.ts";
import { createSuccessResult } from "../../../scripts/runtime-event-fixtures.ts";

function tokenSubmit(operationId: bigint, frameId: number, payload: Uint8Array) {
  return createTokenSubmitRequest({
    identity: { operationId, frameId, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload }],
  });
}

Deno.test({
  name: "@nnrp/browser-client runs the package-owned WASM role over the browser WebSocket carrier",
  sanitizeResources: false,
  fn: async () => {
    const nativeProvider = createWebSocketTransportProvider();
    const serverRuntime = await within(
      openBackendRuntime({
        transports: [nativeProvider],
        transportPolicy: "force-websocket",
      }),
      "server runtime open",
    );
    const cleanups: TestCleanup[] = [() => serverRuntime.close()];
    const server = await setupForTest(
      () =>
        serverRuntime.listen({
          endpoint: "nnrp://127.0.0.1/browser-role",
          providerRoutes: { websocket: { endpoint: "ws://127.0.0.1:0" } },
          transportPolicy: "force-websocket",
        }),
      cleanups,
      "server listen",
    );
    cleanups.push(() => server.close());
    const providerEndpoint = await setupForTest(
      () => waitForBoundProviderEndpoint(server, "websocket"),
      cleanups,
      "server provider bind",
    );

    const wasmBytes = await setupForTest(
      () => Deno.readFile(new URL("../wasm/nnrp_wasm_bg.wasm", import.meta.url)),
      cleanups,
      "browser WASM read",
    );
    const sentMessageTypes: number[] = [];
    const sentPackets: Uint8Array[] = [];
    const browserProvider = await setupForTest(
      () => createWebSocketTransportProvider({ WebSocket: globalThis.WebSocket }),
      cleanups,
      "browser provider creation",
    );
    const wasmModule = await setupForTest(
      () => WebAssembly.compile(wasmBytes),
      cleanups,
      "browser WASM compilation",
    );
    const browserRuntime = await setupForTest(
      () =>
        openBrowserRuntime({
          module: wasmModule,
          transportProviders: [
            {
              ...browserProvider,
              connect: async (options) => {
                const connection = await browserProvider.connect(options);
                return {
                  kind: connection.kind,
                  endpoint: connection.endpoint,
                  get connected() {
                    return connection.connected;
                  },
                  send: (packets) => {
                    const values = packets instanceof Uint8Array ? [packets] : packets;
                    sentMessageTypes.push(...values.map((packet) => packet[6] ?? -1));
                    sentPackets.push(...values.map((packet) => packet.slice()));
                    return connection.send(packets);
                  },
                  receive: (receiveOptions) => connection.receive(receiveOptions),
                  close: () => connection.close(),
                };
              },
            },
          ],
          transportPolicy: "force-websocket",
        }),
      cleanups,
      "browser runtime open",
    );
    cleanups.push(() => browserRuntime.close());
    const client = await setupForTest(
      () =>
        browserRuntime.connect({
          endpoint: "nnrp://127.0.0.1/browser-role",
          providerRoutes: { websocket: { endpoint: providerEndpoint } },
        }),
      cleanups,
      "browser client creation",
    );
    cleanups.push(() => client.close());
    const accepting = server.accept({ timeoutMs: 20_000 });
    void accepting.catch(() => undefined);
    const session = await setupForTest(
      () =>
        client.openSession({
          requestedSessionId: 1,
          profileId: 2,
          schemaId: 0x1001,
          schemaVersion: 3,
        }),
      cleanups,
      "browser session open",
    );
    cleanups.push(() => session.close());

    try {
      const submit = session.submit(tokenSubmit(11n, 7, new Uint8Array([1, 2, 3])));
      void submit.catch(() => undefined);
      const serverSession = await within(accepting, "server session accept", 25_000);
      const event = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(eventLabel(event), "submit");
      if (event.metadata.type !== "frame_submit" || event.tail.type !== "body") {
        throw new Error("expected submit event");
      }
      assertEquals(event.header.frameId, 7);
      assertEquals(event.tail.body.slice(-3), new Uint8Array([1, 2, 3]));
      await serverSession.sendProgress({
        operationId: 11n,
        progressSequence: 1n,
        stageCode: 2,
        percentX100: 5_000,
        objectId: 0n,
        bodyBytes: 1,
      }, new Uint8Array([6]));
      await serverSession.sendPartialResult({
        operationId: 11n,
        resultSequence: 2n,
        objectId: 0n,
        deltaSequence: 0n,
        bodyBytes: 1,
        flags: 0,
      }, new Uint8Array([7]));
      await serverSession.sendResult(createSuccessResult(11n, 7, new Uint8Array([9, 8])));
      const submitted = await submit;
      assertEquals(submitted.operationId, 11n);
      assertEquals(submitted.terminalState, "success");
      assertEquals(submitted.event.type === "runtime" ? submitted.event.event.tail : undefined, {
        type: "body",
        body: new Uint8Array([9, 8]),
      });
      assertEquals(eventLabel(await session.nextEvent()), "progress");
      assertEquals(eventLabel(await session.nextEvent()), "partial-result");

      await session.submitNoWait(tokenSubmit(99n, 8, new Uint8Array([4, 5])));
      const cancellable = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(eventLabel(cancellable), "submit");
      await session.declareObject({
        objectId: 99n,
        objectKind: RuntimeObjectKind.Tensor,
        producerRole: RuntimeRole.Client,
        consumerRole: RuntimeRole.Server,
        sessionId: 1,
        byteSize: 4n,
        computeCostUnits: 1,
        memoryLocationHint: MemoryLocationHint.HostMemory,
        ownershipHint: OwnershipHint.ReleaseOnDrop,
        lifetimeHintMs: 1_000,
        metadataBytes: 0,
      });
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "object-declare");
      await session.referenceObject({
        objectId: 99n,
        operationId: 99n,
        objectVersion: 1n,
        offset: 0n,
        length: 4n,
        flags: 0,
        metadataBytes: 0,
      });
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "object-ref");
      const beforeCancellation = sentPackets.length;
      await session.sendControl(NnrpMessageType.Cancel, {
        operationId: 99n,
        controlSequence: 1n,
        reasonCode: 2,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      });
      const cancellationPackets = sentPackets.slice(beforeCancellation);
      const manualCancelPacket = cancellationPackets.find((packet) => packet[6] === NnrpMessageType.Cancel)!;
      assertEquals(manualCancelPacket[6], NnrpMessageType.Cancel);
      assertEquals(new DataView(manualCancelPacket.buffer).getUint32(20, true), 1);
      assertEquals(new DataView(manualCancelPacket.buffer).getUint32(24, true), 8);
      assertEquals(new DataView(manualCancelPacket.buffer).getBigUint64(40, true), 99n);
      const control = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(eventLabel(control), "cancel");
      const released = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(eventLabel(released), "object-release");
      if (released.metadata.type === "object_release") {
        assertEquals(released.metadata.value.objectId, 99n);
        assertEquals(released.metadata.value.operationId, 99n);
        assertEquals(released.metadata.value.releaseReason, ObjectReleaseReason.Cancelled);
        assertEquals(released.metadata.value.sourceRole, RuntimeRole.Client);
      }
      assertEquals(
        cancellationPackets.some((packet) => packet[6] === NnrpMessageType.CacheInvalidate),
        false,
      );
      await assertRejects(
        () =>
          session.referenceObject({
            objectId: 99n,
            operationId: 99n,
            objectVersion: 2n,
            offset: 0n,
            length: 4n,
            flags: 0,
            metadataBytes: 0,
          }),
        Error,
        "was already released",
      );

      await session.submitNoWait(tokenSubmit(100n, 9, new Uint8Array([6])));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "submit");
      await session.updatePriority({
        operationId: 100n,
        controlSequence: 2n,
        priorityClass: 2,
        priorityDelta: 1,
        deadlineUnixMs: 0n,
        flags: 0,
      });
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "priority-update");

      const scheduling = {
        operationId: 100n,
        controlSequence: 3n,
        priorityClass: 2,
        priorityDelta: 0,
        deadlineUnixMs: 10_000n,
        flags: 0,
      } as const;
      await session.updateDeadline(scheduling);
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "deadline");
      await session.expireAt({ ...scheduling, controlSequence: 4n });
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "expire-at");
      await session.updateBudget({
        operationId: 100n,
        computeBudgetUnits: 3n,
        memoryBudgetBytes: 4n,
        bandwidthBudgetBytes: 5n,
        tokenBudget: 6,
        flags: 0,
      });
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "budget-update");

      const capability = {
        profileId: 2,
        capabilityCount: 1,
        costModelId: 3,
        preferenceRank: 4,
        limitBytes: 5n,
        limitUnits: 6n,
        bodyBytes: 1,
        flags: 0,
      } as const;
      await session.negotiateCapabilities(capability, new Uint8Array([3]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "capability-negotiation");
      await session.degradeProfile(capability, new Uint8Array([4]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "degrade-profile");

      const route = {
        operationId: 100n,
        routeId: 2,
        executorClass: 3,
        affinityClass: 4,
        deadlineUnixMs: 5n,
        bodyBytes: 1,
        flags: 0,
      } as const;
      await session.sendRouteHint(route, new Uint8Array([5]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "route-hint");
      await session.sendExecutionHint(route, new Uint8Array([6]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "execution-hint");
      await session.sendTraceContext({
        traceId: 1n,
        spanId: 2n,
        parentSpanId: 0n,
        stageCode: 3,
        flags: 0,
        bodyBytes: 1,
      }, new Uint8Array([7]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "trace-context");
      await session.sendControl(NnrpMessageType.RetryAfter, {
        scopeId: 100n,
        controlSequence: 6n,
        retryAfterMs: 8,
        jitterMs: 1,
        reasonCode: 2,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 1,
      }, new Uint8Array([8]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "retry-after");

      await session.submitNoWait(tokenSubmit(101n, 10, new Uint8Array([7])));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "submit");
      await session.supersede({
        oldOperationId: 101n,
        newOperationId: 102n,
        controlSequence: 7n,
        dropReasonCode: 3,
        flags: 0,
        diagnosticBytes: 1,
      }, new Uint8Array([2]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "supersede");

      await session.abort({
        operationId: 100n,
        controlSequence: 8n,
        reasonCode: 2,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 1,
      }, new Uint8Array([1]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "abort");
      await session.submitNoWait(tokenSubmit(103n, 11, new Uint8Array([8])));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "submit");
      await session.declareObject({
        objectId: 101n,
        objectKind: RuntimeObjectKind.Tensor,
        producerRole: RuntimeRole.Client,
        consumerRole: RuntimeRole.Server,
        sessionId: 1,
        byteSize: 2n,
        computeCostUnits: 3,
        memoryLocationHint: MemoryLocationHint.HostMemory,
        ownershipHint: OwnershipHint.SessionOwned,
        lifetimeHintMs: 1_000,
        metadataBytes: 1,
      }, new Uint8Array([1]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "object-declare");

      await session.referenceObject({
        objectId: 101n,
        operationId: 103n,
        objectVersion: 1n,
        offset: 0n,
        length: 2n,
        flags: 0,
        metadataBytes: 1,
      }, new Uint8Array([9]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "object-ref");
      await session.releaseObject({
        objectId: 101n,
        operationId: 103n,
        releaseReason: ObjectReleaseReason.Completed,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 1,
      }, new Uint8Array([10]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "object-release");
      const delta = {
        objectId: 101n,
        deltaSequence: 2n,
        regionOffset: 0n,
        regionBytes: 2,
        deltaBytes: 2,
        flags: 0,
        metadataBytes: 1,
      } as const;
      await session.patchObject(delta, new Uint8Array([11, 12]), new Uint8Array([21]));
      const patch = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(eventLabel(patch), "object-patch");
      if (patch.tail.type === "metadata_body_and_delta") {
        assertEquals(patch.tail.metadataBody, new Uint8Array([21]));
        assertEquals(patch.tail.delta, new Uint8Array([11, 12]));
      }
      await session.sendObjectDelta(
        { ...delta, deltaSequence: 3n },
        new Uint8Array([13, 14]),
        new Uint8Array([22]),
      );
      const objectDelta = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(eventLabel(objectDelta), "object-delta");
      if (objectDelta.tail.type === "metadata_body_and_delta") {
        assertEquals(objectDelta.tail.metadataBody, new Uint8Array([22]));
        assertEquals(objectDelta.tail.delta, new Uint8Array([13, 14]));
      }
      await assertRejects(
        () =>
          session.patchObject(
            { ...delta, deltaSequence: 4n },
            new Uint8Array(),
            new Uint8Array([23, 24]),
          ),
        Error,
        "metadataBody declares 1 bytes but received 2",
      );
      await assertRejects(
        () =>
          session.patchObject(
            { ...delta, deltaSequence: 4n, deltaBytes: 3 },
            new Uint8Array([15, 16]),
            new Uint8Array([23]),
          ),
        Error,
        "delta declares 3 bytes but received 2",
      );

      await session.referenceCache({
        cacheNamespace: 5,
        cacheKeyHi: 6n,
        cacheKeyLo: 7n,
        profileId: 2,
        reuseScope: CacheReuseScope.Session,
        leaseId: 8n,
        producerTraceId: 9n,
        expirationHintMs: 1_000,
        metadataBytes: 1,
        flags: 0,
      }, new Uint8Array([2]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "cache-reference");

      await session.reportCacheMiss({
        cacheNamespace: 5,
        cacheKeyHi: 6n,
        cacheKeyLo: 7n,
        missReason: CacheMissReason.Expired,
        profileId: 2,
        diagnosticBytes: 1,
      }, new Uint8Array([15]));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "cache-miss");

      await session.invalidateCache({
        invalidateScope: 3,
        cacheNamespace: 5,
        cacheKeyHi: 6n,
        cacheKeyLo: 7n,
        reasonCode: 2,
      });
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "cache-invalidate");
      await serverSession.sendResult(createSuccessResult(103n, 11, new Uint8Array([20])));
      assertEquals(eventLabel(await session.nextEvent({ timeoutMillis: 5_000 })), "result");

      await session.submitNoWait(tokenSubmit(109n, 12, new Uint8Array([26])));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "submit");
      const pendingWhileCancelling = session.nextEvent({ timeoutMillis: 5_000 }).catch((error) => error);
      const sentBeforeCancel = sentPackets.length;
      await session.cancel({
        operationId: 109n,
        controlSequence: 9n,
        reasonCode: 2,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 0,
      });
      assertEquals(sentPackets.length, sentBeforeCancel + 1);
      const pendingCancelPacket = sentPackets.at(-1)!;
      const pendingCancelView = new DataView(
        pendingCancelPacket.buffer,
        pendingCancelPacket.byteOffset,
        pendingCancelPacket.byteLength,
      );
      assertEquals(pendingCancelPacket[6], NnrpMessageType.Cancel);
      assertEquals(pendingCancelView.getUint32(20, true), 1);
      assertEquals(pendingCancelView.getUint32(24, true), 12);
      assertEquals(pendingCancelView.getBigUint64(40, true), 109n);
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "cancel");
      await serverSession.sendTraceContext({
        traceId: 109n,
        spanId: 1n,
        parentSpanId: 0n,
        stageCode: 1,
        flags: 0,
        bodyBytes: 0,
      });
      assertEquals(eventLabel(await pendingWhileCancelling), "trace-context");

      const abortController = new AbortController();
      const abortedSubmit = session.submit(tokenSubmit(104n, 13, new Uint8Array([20])), {
        signal: abortController.signal,
      });
      const abortObserved = abortedSubmit.catch((error) => error);
      const abortSubmitEvent = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(eventLabel(abortSubmitEvent), "submit");
      if (abortSubmitEvent.metadata.type !== "frame_submit") throw new Error("expected submit event");
      assertEquals(abortSubmitEvent.metadata.value.operationId, 104n);
      abortController.abort("caller-stop");
      const abortError = await abortObserved;
      assert(abortError instanceof NnrpTimeoutError);
      assertEquals(abortError.diagnostic.code, "NNRP_SUBMIT_CANCELLED");
      assert(sentMessageTypes.includes(NnrpMessageType.Cancel));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "cancel");

      const terminalSignal = new TrackingAbortSignal();
      const completedSubmit = session.submit(tokenSubmit(105n, 14, new Uint8Array([21])), {
        signal: terminalSignal,
      });
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "submit");
      await serverSession.sendResult(createSuccessResult(105n, 14, new Uint8Array([22])));
      const completed = await completedSubmit;
      assertEquals(completed.event.type === "runtime" ? completed.event.event.tail : undefined, {
        type: "body",
        body: new Uint8Array([22]),
      });
      assertEquals(terminalSignal.addCount, 1);
      assertEquals(terminalSignal.removeCount, 1);

      const timedSubmit = session.submit(tokenSubmit(106n, 15, new Uint8Array([23])), { timeoutMillis: 200 });
      const timedObserved = timedSubmit.catch((error) => error);
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "submit");
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "deadline");
      const timeoutError = await timedObserved;
      assert(timeoutError instanceof NnrpTimeoutError);
      assertEquals(timeoutError.diagnostic.code, "NNRP_SUBMIT_TIMEOUT");
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "cancel");

      await serverSession.reportCacheMiss({
        cacheNamespace: 5,
        cacheKeyHi: 6n,
        cacheKeyLo: 7n,
        missReason: CacheMissReason.NotFound,
        profileId: 2,
        diagnosticBytes: 1,
      }, new Uint8Array([3]));
      assertEquals(eventLabel(await session.nextEvent({ timeoutMillis: 5_000 })), "cache-miss");

      const pressure = {
        scopeId: 102n,
        creditWindow: 3n,
        pressureLevel: 2,
        pressureReason: 4,
        retryAfterMs: 5,
        flags: 0,
      } as const;
      await serverSession.sendBackpressure(pressure);
      await serverSession.sendCreditUpdate(pressure);
      await serverSession.sendTraceContext({
        traceId: 8n,
        spanId: 9n,
        parentSpanId: 7n,
        stageCode: 4,
        flags: 0,
        bodyBytes: 1,
      }, new Uint8Array([16]));
      await serverSession.sendRecoverableError({
        errorCode: 9,
        errorScope: ErrorScope.Session,
        recoveryAction: 2,
        sourceRole: RuntimeRole.Server,
        flags: 0,
        retryAfterMs: 10,
        relatedSessionId: 1,
        relatedFrameId: 13,
        relatedViewId: 0,
        diagnosticBytes: 1,
      }, new Uint8Array([17]));
      await serverSession.sendRetryAfter({
        scopeId: 104n,
        controlSequence: 1n,
        retryAfterMs: 10,
        jitterMs: 1,
        reasonCode: 2,
        sourceRole: RuntimeRole.Server,
        flags: 0,
        diagnosticBytes: 1,
      }, new Uint8Array([18]));
      await serverSession.sendResultDropReason({
        operationId: 104n,
        resultSequence: 3n,
        dropReasonCode: 4,
        sourceRole: RuntimeRole.Server,
        flags: 0,
        diagnosticBytes: 1,
      }, new Uint8Array([19]));
      assertEquals(
        await receiveEventTypes(session, 6),
        ["backpressure", "credit-update", "trace-context", "recoverable-error", "retry-after", "result-drop-reason"],
      );

      await session.patch({ initialCredits: 1, submitCapacityPolicy: "await" });
      await session.submitNoWait(tokenSubmit(107n, 16, new Uint8Array([24])));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "submit");
      const creditError = await assertRejects(
        () => session.submitNoWait(tokenSubmit(108n, 17, new Uint8Array([25]))),
        NnrpTransportError,
      );
      assertEquals(creditError.diagnostic.code, "NNRP_BACKPRESSURE_CREDIT_EXHAUSTED");
      await serverSession.sendCreditUpdate({ ...pressure, scopeId: 107n, creditWindow: 1n });
      assertEquals(eventLabel(await session.nextEvent({ timeoutMillis: 5_000 })), "credit-update");
      await session.submitNoWait(tokenSubmit(108n, 17, new Uint8Array([25])));
      assertEquals(eventLabel(await serverSession.receive({ timeoutMillis: 5_000 })), "submit");

      const pendingEventRejected = assertRejects(() => session.nextEvent({ timeoutMillis: 5_000 }));
      const clientClosing = session.close();
      const closeEvent = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(eventLabel(closeEvent), "close");
      await serverSession.close();
      await clientClosing;
      await pendingEventRejected;
    } finally {
      await closeAllForTest(cleanups);
    }
  },
});

async function waitForBoundProviderEndpoint(
  server: { readonly boundProviderEndpoints: Readonly<Record<string, string>> },
  providerKind: string,
): Promise<string> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const endpoint = server.boundProviderEndpoints[providerKind];
    if (endpoint !== undefined) return endpoint;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`provider ${providerKind} did not bind within 5000ms`);
}

async function within<T>(promise: Promise<T>, label: string, timeoutMillis = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMillis}ms`)), timeoutMillis);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

type TestCleanup = () => void | Promise<void>;

async function setupForTest<T>(
  operation: () => T | Promise<T>,
  cleanups: readonly TestCleanup[],
  label: string,
): Promise<T> {
  try {
    return await within(Promise.resolve().then(operation), label);
  } catch (error) {
    await closeAllForTest(cleanups);
    throw error;
  }
}

async function closeAllForTest(cleanups: readonly TestCleanup[]): Promise<void> {
  for (const cleanup of [...cleanups].reverse()) await closeForTest(cleanup);
}

async function closeForTest(close: () => void | Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(close).catch(() => undefined),
      new Promise<void>((resolve) => timer = setTimeout(resolve, 1_000)),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function receiveEventTypes(session: NnrpBrowserClientSession, count: number): Promise<string[]> {
  const types: string[] = [];
  for (let index = 0; index < count; index += 1) {
    types.push(eventLabel(await session.nextEvent({ timeoutMillis: 5_000 })));
  }
  return types;
}

function eventLabel(event: NnrpRuntimeEvent): string {
  switch (event.header.messageType) {
    case NnrpMessageType.SessionClose:
      return "close";
    case NnrpMessageType.FrameSubmit:
      return "submit";
    case NnrpMessageType.ResultPush:
      return "result";
    case NnrpMessageType.Cancel:
      return "cancel";
    case NnrpMessageType.Abort:
      return "abort";
    case NnrpMessageType.PriorityUpdate:
      return "priority-update";
    case NnrpMessageType.Deadline:
      return "deadline";
    case NnrpMessageType.ExpireAt:
      return "expire-at";
    case NnrpMessageType.Supersede:
      return "supersede";
    case NnrpMessageType.BudgetUpdate:
      return "budget-update";
    case NnrpMessageType.Progress:
      return "progress";
    case NnrpMessageType.PartialResult:
      return "partial-result";
    case NnrpMessageType.Backpressure:
      return "backpressure";
    case NnrpMessageType.CreditUpdate:
      return "credit-update";
    case NnrpMessageType.CapabilityNegotiation:
      return "capability-negotiation";
    case NnrpMessageType.DegradeProfile:
      return "degrade-profile";
    case NnrpMessageType.RouteHint:
      return "route-hint";
    case NnrpMessageType.ExecutionHint:
      return "execution-hint";
    case NnrpMessageType.TraceContext:
      return "trace-context";
    case NnrpMessageType.ResultDropReason:
      return "result-drop-reason";
    case NnrpMessageType.ErrorRecoverable:
      return "recoverable-error";
    case NnrpMessageType.RetryAfter:
      return "retry-after";
    case NnrpMessageType.ObjectDeclare:
      return "object-declare";
    case NnrpMessageType.ObjectRef:
      return "object-ref";
    case NnrpMessageType.ObjectRelease:
      return "object-release";
    case NnrpMessageType.ObjectPatch:
      return "object-patch";
    case NnrpMessageType.ObjectDelta:
      return "object-delta";
    case NnrpMessageType.CacheReference:
      return "cache-reference";
    case NnrpMessageType.CacheMiss:
      return "cache-miss";
    case NnrpMessageType.CacheInvalidate:
      return "cache-invalidate";
    default:
      return `message-${event.header.messageType}`;
  }
}

class TrackingAbortSignal {
  public aborted = false;
  public reason: unknown;
  public addCount = 0;
  public removeCount = 0;
  readonly #listeners = new Set<() => void>();

  public addEventListener(_type: "abort", listener: () => void): void {
    this.addCount += 1;
    this.#listeners.add(listener);
  }

  public removeEventListener(_type: "abort", listener: () => void): void {
    this.removeCount += 1;
    this.#listeners.delete(listener);
  }
}
