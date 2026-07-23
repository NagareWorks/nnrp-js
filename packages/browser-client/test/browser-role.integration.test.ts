import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  CacheMissReason,
  CacheReuseScope,
  ErrorScope,
  MemoryLocationHint,
  NnrpMessageType,
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

Deno.test({
  name: "@nnrp/browser-client runs the package-owned WASM role over the browser WebSocket carrier",
  sanitizeResources: false,
  fn: async () => {
    const nativeProvider = createWebSocketTransportProvider();
    const reservation = await nativeProvider.listen({ endpoint: "ws://127.0.0.1:0" });
    const providerEndpoint = reservation.endpoint;
    await reservation.close();

    const serverRuntime = await openBackendRuntime({
      transports: [nativeProvider],
      transportPolicy: "force-websocket",
    });
    const server = serverRuntime.listen({
      endpoint: "nnrp://127.0.0.1/browser-role",
      providerEndpoint,
      transportPolicy: "force-websocket",
    });
    const accepting = server.accept();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const wasmBytes = await Deno.readFile(new URL("../wasm/nnrp_wasm_bg.wasm", import.meta.url));
    const sentMessageTypes: number[] = [];
    const sentPackets: Uint8Array[] = [];
    const browserProvider = createWebSocketTransportProvider({ WebSocket: globalThis.WebSocket });
    const browserRuntime = await openBrowserRuntime({
      module: await WebAssembly.compile(wasmBytes),
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
    });
    const client = browserRuntime.connect({
      endpoint: "nnrp://127.0.0.1/browser-role",
      providerEndpoint,
    });
    const session = client.openSession({ sessionId: "browser-role-e2e", inputProfile: "token" });

    try {
      const submit = session.submit({
        operationId: 11n,
        frameId: 7,
        inputProfile: "token",
        payload: new Uint8Array([1, 2, 3]),
      });
      void submit.catch(() => undefined);
      const serverSession = await accepting;
      const event = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(event.type, "submit");
      if (event.type !== "submit") throw new Error("expected submit event");
      assertEquals(event.submit.frameId, 7);
      assertEquals(event.submit.payload, new Uint8Array([1, 2, 3]));
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
      await serverSession.sendResult({ frameId: 7, payload: new Uint8Array([9, 8]) });
      assertEquals(await submit, {
        frameId: 7,
        payload: new Uint8Array([9, 8]),
        sessionId: "browser-role-e2e",
      });
      assertEquals((await session.nextEvent()).type, "progress");
      assertEquals((await session.nextEvent()).type, "partial-result");

      await session.submitNoWait({
        operationId: 99n,
        frameId: 8,
        inputProfile: "token",
        payload: new Uint8Array([4, 5]),
      });
      const cancellable = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(cancellable.type, "submit");
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
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "object-declare");
      await session.referenceObject({
        objectId: 99n,
        operationId: 99n,
        objectVersion: 1n,
        offset: 0n,
        length: 4n,
        flags: 0,
        metadataBytes: 0,
      });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "object-ref");
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
      assertEquals(control.type, "cancel");
      const released = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(released.type, "object-release");
      if (released.type === "object-release") {
        assertEquals(released.metadata.objectId, 99n);
        assertEquals(released.metadata.operationId, 99n);
        assertEquals(released.metadata.releaseReason, ObjectReleaseReason.Cancelled);
        assertEquals(released.metadata.sourceRole, RuntimeRole.Client);
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

      await session.submitNoWait({
        operationId: 100n,
        frameId: 9,
        inputProfile: "token",
        payload: new Uint8Array([6]),
      });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "submit");
      await session.updatePriority({
        operationId: 100n,
        controlSequence: 2n,
        priorityClass: 2,
        priorityDelta: 1,
        deadlineUnixMs: 0n,
        flags: 0,
      });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "priority-update");

      const scheduling = {
        operationId: 100n,
        controlSequence: 3n,
        priorityClass: 2,
        priorityDelta: 0,
        deadlineUnixMs: 10_000n,
        flags: 0,
      } as const;
      await session.updateDeadline(scheduling);
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "deadline");
      await session.expireAt({ ...scheduling, controlSequence: 4n });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "expire-at");
      await session.updateBudget({
        operationId: 100n,
        computeBudgetUnits: 3n,
        memoryBudgetBytes: 4n,
        bandwidthBudgetBytes: 5n,
        tokenBudget: 6,
        flags: 0,
      });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "budget-update");

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
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "capability-negotiation");
      await session.degradeProfile(capability, new Uint8Array([4]));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "degrade-profile");

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
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "route-hint");
      await session.sendExecutionHint(route, new Uint8Array([6]));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "execution-hint");
      await session.sendTraceContext({
        traceId: 1n,
        spanId: 2n,
        parentSpanId: 0n,
        stageCode: 3,
        flags: 0,
        bodyBytes: 1,
      }, new Uint8Array([7]));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "trace-context");
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
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "retry-after");

      await session.submitNoWait({
        operationId: 101n,
        frameId: 10,
        inputProfile: "token",
        payload: new Uint8Array([7]),
      });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "submit");
      await session.supersede({
        oldOperationId: 101n,
        newOperationId: 102n,
        controlSequence: 7n,
        dropReasonCode: 3,
        flags: 0,
        diagnosticBytes: 1,
      }, new Uint8Array([2]));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "supersede");

      await session.abort({
        operationId: 100n,
        controlSequence: 8n,
        reasonCode: 2,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 1,
      }, new Uint8Array([1]));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "abort");
      await session.submitNoWait({
        operationId: 103n,
        frameId: 11,
        inputProfile: "token",
        payload: new Uint8Array([8]),
      });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "submit");
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
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "object-declare");

      await session.referenceObject({
        objectId: 101n,
        operationId: 103n,
        objectVersion: 1n,
        offset: 0n,
        length: 2n,
        flags: 0,
        metadataBytes: 1,
      }, new Uint8Array([9]));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "object-ref");
      await session.releaseObject({
        objectId: 101n,
        operationId: 103n,
        releaseReason: ObjectReleaseReason.Completed,
        sourceRole: RuntimeRole.Client,
        flags: 0,
        diagnosticBytes: 1,
      }, new Uint8Array([10]));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "object-release");
      const delta = {
        objectId: 101n,
        deltaSequence: 2n,
        regionOffset: 0n,
        regionBytes: 2,
        deltaBytes: 2,
        flags: 0,
        metadataBytes: 0,
      } as const;
      await session.patchObject(delta, new Uint8Array([11, 12]));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "object-patch");
      await session.sendObjectDelta({ ...delta, deltaSequence: 3n }, new Uint8Array([13, 14]));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "object-delta");

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
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "cache-reference");

      await session.reportCacheMiss({
        cacheNamespace: 5,
        cacheKeyHi: 6n,
        cacheKeyLo: 7n,
        missReason: CacheMissReason.Expired,
        profileId: 2,
        diagnosticBytes: 1,
      }, new Uint8Array([15]));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "cache-miss");

      await session.invalidateCache({
        invalidateScope: 3,
        cacheNamespace: 5,
        cacheKeyHi: 6n,
        cacheKeyLo: 7n,
        reasonCode: 2,
      });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "cache-invalidate");
      await serverSession.sendResult({ frameId: 11, payload: new Uint8Array([20]) });
      assertEquals((await session.nextEvent({ timeoutMillis: 5_000 })).type, "result");

      await session.submitNoWait({
        operationId: 109n,
        frameId: 12,
        inputProfile: "token",
        payload: new Uint8Array([26]),
      });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "submit");
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
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "cancel");
      await serverSession.sendTraceContext({
        traceId: 109n,
        spanId: 1n,
        parentSpanId: 0n,
        stageCode: 1,
        flags: 0,
        bodyBytes: 0,
      });
      assertEquals((await pendingWhileCancelling).type, "trace-context");

      const abortController = new AbortController();
      const abortedSubmit = session.submit({
        operationId: 104n,
        frameId: 13,
        inputProfile: "token",
        payload: new Uint8Array([20]),
      }, { signal: abortController.signal });
      const abortObserved = abortedSubmit.catch((error) => error);
      const abortSubmitEvent = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(abortSubmitEvent.type, "submit");
      if (abortSubmitEvent.type !== "submit") throw new Error("expected submit event");
      assertEquals(abortSubmitEvent.submit.operationId, 104n);
      abortController.abort("caller-stop");
      const abortError = await abortObserved;
      assert(abortError instanceof NnrpTimeoutError);
      assertEquals(abortError.diagnostic.code, "NNRP_SUBMIT_CANCELLED");
      assert(sentMessageTypes.includes(NnrpMessageType.Cancel));
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "cancel");

      const terminalSignal = new TrackingAbortSignal();
      const completedSubmit = session.submit({
        operationId: 105n,
        frameId: 14,
        inputProfile: "token",
        payload: new Uint8Array([21]),
      }, { signal: terminalSignal });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "submit");
      await serverSession.sendResult({ frameId: 14, payload: new Uint8Array([22]) });
      assertEquals((await completedSubmit).payload, new Uint8Array([22]));
      assertEquals(terminalSignal.addCount, 1);
      assertEquals(terminalSignal.removeCount, 1);

      const timedSubmit = session.submit({
        operationId: 106n,
        frameId: 15,
        inputProfile: "token",
        payload: new Uint8Array([23]),
      }, { timeoutMillis: 200 });
      const timedObserved = timedSubmit.catch((error) => error);
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "submit");
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "deadline");
      const timeoutError = await timedObserved;
      assert(timeoutError instanceof NnrpTimeoutError);
      assertEquals(timeoutError.diagnostic.code, "NNRP_SUBMIT_TIMEOUT");
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "cancel");

      await serverSession.reportCacheMiss({
        cacheNamespace: 5,
        cacheKeyHi: 6n,
        cacheKeyLo: 7n,
        missReason: CacheMissReason.NotFound,
        profileId: 2,
        diagnosticBytes: 1,
      }, new Uint8Array([3]));
      assertEquals((await session.nextEvent({ timeoutMillis: 5_000 })).type, "cache-miss");

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
      await session.submitNoWait({
        operationId: 107n,
        frameId: 16,
        inputProfile: "token",
        payload: new Uint8Array([24]),
      });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "submit");
      const creditError = await assertRejects(
        () =>
          session.submitNoWait({
            operationId: 108n,
            frameId: 17,
            inputProfile: "token",
            payload: new Uint8Array([25]),
          }),
        NnrpTransportError,
      );
      assertEquals(creditError.diagnostic.code, "NNRP_BACKPRESSURE_CREDIT_EXHAUSTED");
      await serverSession.sendCreditUpdate({ ...pressure, scopeId: 107n, creditWindow: 1n });
      assertEquals((await session.nextEvent({ timeoutMillis: 5_000 })).type, "credit-update");
      await session.submitNoWait({
        operationId: 108n,
        frameId: 17,
        inputProfile: "token",
        payload: new Uint8Array([25]),
      });
      assertEquals((await serverSession.receive({ timeoutMillis: 5_000 })).type, "submit");

      const pendingEventRejected = assertRejects(() => session.nextEvent({ timeoutMillis: 5_000 }));
      const clientClosing = session.close();
      const closeEvent = await serverSession.receive({ timeoutMillis: 5_000 });
      assertEquals(closeEvent.type, "close");
      await serverSession.close();
      await clientClosing;
      await pendingEventRejected;
    } finally {
      await closeForTest(() => session.close());
      await closeForTest(() => client.close());
      await closeForTest(() => browserRuntime.close());
      await closeForTest(() => server.close());
      await closeForTest(() => serverRuntime.close());
    }
  },
});

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
    types.push((await session.nextEvent({ timeoutMillis: 5_000 })).type);
  }
  return types;
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
