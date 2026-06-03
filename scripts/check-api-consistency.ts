import {
  NnrpCapabilityError,
  NnrpError,
  NnrpProtocolError,
  NnrpTimeoutError,
  NnrpTransportError,
  normalizeCancelRequest,
  normalizeSubmitRequest,
} from "@nnrp/core";
import { NnrpBrowserClientSession } from "@nnrp/browser-client";
import { NnrpClientSession } from "@nnrp/native-client";

const failures: string[] = [];

checkSessionMethodParity();
checkOperationIdNormalization();
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

function checkOperationIdNormalization(): void {
  const largeOperationId = 9_007_199_254_740_993n;
  const normalized = normalizeCancelRequest(largeOperationId);
  if (normalized.operation !== largeOperationId) {
    failures.push("operation ids beyond Number.MAX_SAFE_INTEGER must remain bigint values");
  }
}

function checkBinaryPayloadOwnership(): void {
  const retained = new Uint8Array([1, 2, 3]);
  const retainedSubmit = normalizeSubmitRequest({ frameId: 1, payload: retained });
  retained[0] = 99;
  if (retainedSubmit.payload === retained || retainedSubmit.payload?.[0] !== 1) {
    failures.push("retained submit payloads must be copied by default");
  }

  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer, 1, 2);
  view.setUint8(0, 7);
  const viewSubmit = normalizeSubmitRequest({ frameId: 2, payload: view });
  view.setUint8(0, 8);
  if (viewSubmit.payload?.[0] !== 7) {
    failures.push("ArrayBufferView submit payloads must be normalized and copied by default");
  }

  const transferred = new Uint8Array([4, 5, 6]);
  const transferredSubmit = normalizeSubmitRequest(
    { frameId: 3, payload: transferred },
    { copyPayloads: false },
  );
  if (transferredSubmit.payload !== transferred) {
    failures.push("explicit ownership transfer must avoid unnecessary Uint8Array copies");
  }
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
