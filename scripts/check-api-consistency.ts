import {
  createTokenSubmitRequest,
  NNRP_DEFAULT_SUBMIT_HEADER,
  NNRP_DEFAULT_SUBMIT_POLICY,
  NnrpCapabilityError,
  NnrpError,
  NnrpProtocolError,
  NnrpTimeoutError,
  NnrpTransportError,
  normalizeSubmitRequest,
} from "@nnrp/core";
import { NnrpBrowserClientSession } from "@nnrp/browser-client";
import { NnrpClientSession } from "@nnrp/native-client";
import { NnrpServerSession } from "@nnrp/native-server";

const failures: string[] = [];

checkSessionMethodParity();
checkServerControlSurface();
checkBinaryPayloadOwnership();
checkDiagnosticErrorFamilies();

if (failures.length > 0) {
  console.error("API consistency check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  Deno.exit(1);
}

function checkSessionMethodParity(): void {
  const sharedMethods = [
    "submit",
    "submitNoWait",
    "cancel",
    "abort",
    "updatePriority",
    "updateDeadline",
    "expireAt",
    "supersede",
    "updateBudget",
    "negotiateCapabilities",
    "degradeProfile",
    "sendRouteHint",
    "sendExecutionHint",
    "sendTraceContext",
    "sendControl",
    "declareObject",
    "referenceObject",
    "releaseObject",
    "patchObject",
    "sendObjectDelta",
    "referenceCache",
    "reportCacheMiss",
    "invalidateCache",
    "patch",
    "inFlightFrames",
    "completeEvent",
    "nextEvent",
    "nextResult",
    "migrate",
    "events",
    "close",
  ];

  for (const method of sharedMethods) {
    if (typeof NnrpClientSession.prototype[method as keyof NnrpClientSession] !== "function") {
      failures.push(`@nnrp/native-client NnrpClientSession is missing ${method}()`);
    }
    if (typeof NnrpBrowserClientSession.prototype[method as keyof NnrpBrowserClientSession] !== "function") {
      failures.push(`@nnrp/browser-client NnrpBrowserClientSession is missing ${method}()`);
    }
  }
}

function checkServerControlSurface(): void {
  const methods = [
    "sendProgress",
    "sendPartialResult",
    "sendBackpressure",
    "sendCreditUpdate",
    "sendResultDropReason",
    "sendTraceContext",
    "sendRecoverableError",
    "sendRetryAfter",
    "sendControl",
    "declareObject",
    "referenceObject",
    "releaseObject",
    "patchObject",
    "sendObjectDelta",
    "referenceCache",
    "reportCacheMiss",
    "invalidateCache",
  ];
  for (const method of methods) {
    if (typeof NnrpServerSession.prototype[method as keyof NnrpServerSession] !== "function") {
      failures.push(`@nnrp/native-server NnrpServerSession is missing ${method}()`);
    }
  }
}

function checkBinaryPayloadOwnership(): void {
  const retained = new Uint8Array([1, 2, 3]);
  const retainedRequest = tokenSubmit(1n, 1, retained);
  const retainedSubmit = normalizeSubmitRequest(retainedRequest);
  retainedRequest.body[0] = 99;
  if (retainedSubmit.body === retainedRequest.body || retainedSubmit.body[0] !== 0) {
    failures.push("retained submit payloads must be copied by default");
  }

  const backing = new Uint8Array([0, 7, 8, 0]);
  const viewRequest = tokenSubmit(2n, 2, backing.subarray(1, 3));
  backing[1] = 9;
  if (viewRequest.body.at(-2) !== 7) {
    failures.push("Uint8Array views must be normalized and copied by builders");
  }

  const transferred = tokenSubmit(3n, 3, new Uint8Array([4, 5, 6]));
  const transferredSubmit = normalizeSubmitRequest(transferred, { copyPayloads: false });
  if (transferredSubmit.body !== transferred.body) {
    failures.push("explicit ownership transfer must avoid unnecessary Uint8Array copies");
  }
}

function tokenSubmit(operationId: bigint, frameId: number, payload: Uint8Array) {
  return createTokenSubmitRequest({
    identity: { operationId, frameId, header: NNRP_DEFAULT_SUBMIT_HEADER },
    policy: NNRP_DEFAULT_SUBMIT_POLICY,
    chunks: [{ payload }],
  });
}

function checkDiagnosticErrorFamilies(): void {
  const diagnostic = {
    code: "NNRP_API_CONSISTENCY",
    message: "api consistency check",
    source: "core" as const,
    retryable: false,
  };

  const errors = [
    new NnrpError(diagnostic),
    new NnrpCapabilityError(diagnostic),
    new NnrpTransportError(diagnostic),
    new NnrpTimeoutError(diagnostic),
    new NnrpProtocolError(diagnostic),
  ];

  for (const error of errors) {
    if (error.diagnostic !== diagnostic) {
      failures.push(`${error.name} must preserve its diagnostic object`);
    }
  }
}
