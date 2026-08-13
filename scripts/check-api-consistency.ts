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
import { NnrpServerOperation, NnrpServerSession } from "@nnrp/native-server";
import { EXPECTED_JAVASCRIPT_PROJECTIONS, projectionMapsEqual } from "./frozen-javascript-projections.ts";

const failures: string[] = [];

interface FrozenContractField {
  readonly name: string;
  readonly type: string;
}

interface FrozenContractType {
  readonly fields: readonly FrozenContractField[];
  readonly variants?: readonly string[];
  readonly variantTypes?: Readonly<Record<string, string | null>>;
  readonly validation?: Readonly<Record<string, string>>;
}

type FrozenProjectionValue = string | readonly string[] | FrozenProjectionMap;

interface FrozenProjectionMap {
  readonly [key: string]: FrozenProjectionValue;
}

interface FrozenSdkContract {
  readonly contract: string;
  readonly contractVersion: number;
  readonly semanticEnums: Readonly<Record<string, readonly string[]>>;
  readonly enums: Readonly<Record<string, { readonly values: Readonly<Record<string, number>> }>>;
  readonly types: Readonly<Record<string, FrozenContractType>>;
  readonly wireLayouts: Readonly<
    Record<
      string,
      {
        readonly size: number;
        readonly validation?: Readonly<Record<string, string | number>>;
      }
    >
  >;
  readonly roleSurfaces: {
    readonly clientSubmitWait: {
      readonly scopeRule: string;
      readonly preDispatchCancellationRule: string;
      readonly postDispatchCancellationRule: string;
      readonly timeoutRule: string;
      readonly lifecycleRule: string;
    };
  };
  readonly languageProjections: {
    readonly javascript: Readonly<Record<string, FrozenProjectionValue>>;
  };
}

async function checkFrozenMachineContract(): Promise<void> {
  const contractRoot = Deno.env.get("NNRP_DOC_ROOT") ?? "../nnrp-doc";
  const contractPath = `${contractRoot}/docs/public/contracts/nnrp-1-preview4-sdk-api.json`;
  let contract: FrozenSdkContract;
  try {
    contract = JSON.parse(await Deno.readTextFile(contractPath)) as FrozenSdkContract;
  } catch (error) {
    failures.push(`cannot read the frozen SDK contract at ${contractPath}: ${errorMessage(error)}`);
    return;
  }

  if (contract.contract !== "nnrp-1-preview4-sdk-api" || contract.contractVersion !== 15) {
    failures.push(
      `expected nnrp-1-preview4-sdk-api contract version 15, received ${contract.contract}@${contract.contractVersion}`,
    );
    return;
  }

  const coreSource = await Deno.readTextFile("packages/core/src/index.ts");
  const nativeClientSource = await Deno.readTextFile("packages/native-client/src/index.ts");
  const browserClientSource = await Deno.readTextFile("packages/browser-client/src/index.ts");
  const nativeServerSource = await Deno.readTextFile("packages/native-server/src/index.ts");
  const coreDeclaration = await Deno.readTextFile("scripts/public-api/core.d.ts");
  const nativeClientDeclaration = await Deno.readTextFile("scripts/public-api/native-client.d.ts");
  const browserClientDeclaration = await Deno.readTextFile("scripts/public-api/browser-client.d.ts");
  const nativeServerDeclaration = await Deno.readTextFile("scripts/public-api/native-server.d.ts");

  if (!projectionMapsEqual(contract.languageProjections.javascript, EXPECTED_JAVASCRIPT_PROJECTIONS)) {
    failures.push("frozen JavaScript projection map drifted; update the implementation contract test with the API");
  }
  checkProjectedPublicExports(contract.languageProjections.javascript, {
    "@nnrp/core": coreSource,
    "@nnrp/native-client": nativeClientSource,
    "@nnrp/browser-client": browserClientSource,
    "@nnrp/native-server": nativeServerSource,
  });
  checkBaselineMetadataCodecExports(contract.languageProjections.javascript, coreSource);
  checkProjectedPublicExports(contract.languageProjections.javascript, {
    "@nnrp/core": coreDeclaration,
    "@nnrp/native-client": nativeClientDeclaration,
    "@nnrp/browser-client": browserClientDeclaration,
    "@nnrp/native-server": nativeServerDeclaration,
  });
  checkBaselineMetadataCodecExports(contract.languageProjections.javascript, coreDeclaration);

  checkProjection(contract, "runtimeFrameHeader", "@nnrp/core.NnrpRuntimeFrameHeader");
  checkProjection(contract, "runtimeEvent", "@nnrp/core.NnrpRuntimeEvent");
  checkProjection(contract, "clientEvent", "@nnrp/core.NnrpClientEvent");
  checkProjection(contract, "serverEvent", "@nnrp/native-server.NnrpServerEvent");
  checkProjection(contract, "serverOperation", "@nnrp/native-server.NnrpServerOperation");
  checkRoleMethodProjection(contract);
  checkProjection(contract, "operationLifecycleEvent", "@nnrp/core.NnrpOperationLifecycleEvent");
  checkProjection(contract, "terminalEvent", "@nnrp/core.NnrpTerminalEvent");
  checkProjection(contract, "result", "@nnrp/core.NnrpResult");
  checkProjection(contract, "sessionRecoveryTicket", "@nnrp/core.NnrpSessionRecoveryTicket");
  checkProjection(contract, "sessionRecoveryTicketEncode", "NnrpSessionRecoveryTicket.toBytes");
  checkProjection(contract, "sessionRecoveryTicketDecode", "NnrpSessionRecoveryTicket.fromBytes");
  checkClientSubmitWaitContract(contract, nativeClientSource, browserClientSource);
  checkFrozenDataPlaneValidation(contract, coreSource);

  for (
    const requiredSurface of [
      "export class NnrpSessionRecoveryTicket",
      "public toBytes(): Uint8Array",
      "public static fromBytes(encoded: Uint8Array): NnrpSessionRecoveryTicket",
    ]
  ) {
    if (!coreSource.includes(requiredSurface)) {
      failures.push(`@nnrp/core is missing frozen recovery-ticket surface: ${requiredSurface}`);
    }
  }

  checkInterfaceFields(
    coreSource,
    "NnrpRuntimeFrameHeader",
    contractFields(contract, "RuntimeFrameHeader"),
    {
      versionMajor: "1",
      wireFormat: "0",
      messageType: "NnrpMessageType",
      flags: "NnrpHeaderFlags | number",
      sessionId: "number",
      frameId: "number",
      viewId: "number",
      routeId: "number",
      traceId: "bigint",
    },
  );
  checkInterfaceFields(
    coreSource,
    "NnrpRuntimeEvent",
    contractFields(contract, "RuntimeEvent"),
    { header: "NnrpRuntimeFrameHeader", metadata: "NnrpRuntimeEventMetadata", tail: "NnrpRuntimeEventTail" },
  );
  checkInterfaceFields(
    coreSource,
    "NnrpOperationLifecycleEvent",
    contractFields(contract, "OperationLifecycleEvent"),
    { operationId: "bigint", state: "NnrpOperationState" },
  );
  checkInterfaceFields(
    coreSource,
    "NnrpResult",
    contractFields(contract, "NnrpResult"),
    { operationId: "bigint", terminalState: "NnrpResultTerminalState", event: "NnrpTerminalEvent" },
  );

  checkTaggedUnion(
    coreSource,
    "NnrpClientEvent",
    contractVariants(contract, "ClientEvent"),
    { runtime: "NnrpRuntimeEvent", lifecycle: "NnrpOperationLifecycleEvent" },
  );
  checkTaggedUnion(
    nativeServerSource,
    "NnrpServerEvent",
    contractVariants(contract, "ServerEvent"),
    { submit: "NnrpServerOperation", runtime: "NnrpRuntimeEvent", lifecycle: "NnrpOperationLifecycleEvent" },
  );
  checkTaggedUnion(
    coreSource,
    "NnrpTerminalEvent",
    contractVariants(contract, "TerminalEvent"),
    { runtime: "NnrpRuntimeEvent", lifecycle: "NnrpOperationLifecycleEvent" },
  );
  checkTaggedUnion(
    coreSource,
    "NnrpRuntimeEventMetadata",
    contractVariants(contract, "RuntimeEventMetadata"),
    runtimeMetadataProjection(contract),
  );
  checkTaggedUnion(
    coreSource,
    "NnrpRuntimeEventTail",
    contractVariants(contract, "RuntimeEventTail"),
    { none: null, body: null, diagnostic: null, metadata_body_and_delta: null },
  );
  checkStringUnion(
    coreSource,
    "NnrpResultTerminalState",
    enumValues(contract, "ResultTerminalState"),
  );
  checkStringUnion(coreSource, "NnrpOperationState", enumValues(contract, "OperationState"));

  checkClassMethodSignature(nativeClientSource, "NnrpClientSession", "submit", "Promise<NnrpResult>");
  checkClassMethodSignature(nativeClientSource, "NnrpClientSession", "nextResult", "Promise<NnrpResult>");
  checkClassMethodSignature(nativeClientSource, "NnrpClientSession", "nextEvent", "Promise<NnrpClientEvent>");
  checkClassMethodSignature(browserClientSource, "NnrpBrowserClientSession", "submit", "Promise<NnrpResult>");
  checkClassMethodSignature(browserClientSource, "NnrpBrowserClientSession", "nextResult", "Promise<NnrpResult>");
  checkClassMethodSignature(browserClientSource, "NnrpBrowserClientSession", "nextEvent", "Promise<NnrpClientEvent>");
  checkClassMethodSignature(nativeServerSource, "NnrpServerSession", "nextEvent", "Promise<NnrpServerEvent>");
  checkClassMethodSignature(nativeServerSource, "NnrpServerSession", "receiveSubmit", "Promise<NnrpServerOperation>");
  checkClassMethodSignature(
    nativeServerSource,
    "NnrpServerOperation",
    "sendResult",
    "Promise<void>",
    "metadata: NnrpResultPushMetadata",
  );
  checkClassMethodSignature(
    nativeServerSource,
    "NnrpServerOperation",
    "sendResultDrop",
    "Promise<void>",
    "metadata: ResultDropReasonMetadata",
  );
  checkClassMethodSignature(
    nativeServerSource,
    "NnrpServerOperation",
    "sendProgress",
    "Promise<void>",
    "metadata: ProgressMetadata",
  );
  checkClassMethodSignature(
    nativeServerSource,
    "NnrpServerOperation",
    "sendPartialResult",
    "Promise<void>",
    "metadata: PartialResultMetadata",
  );
  checkRequiredSourceFragments("@nnrp/native-server NnrpServerOperation", nativeServerSource, [
    "public get operationId(): bigint",
    "public get frameId(): number",
    "public get submit(): NnrpRuntimeEvent",
  ]);
  checkV9OptionAndRoleSurfaces(contract, nativeClientSource, browserClientSource, nativeServerSource);
  checkGeneratedDeclarationSurfaces(
    contract,
    coreDeclaration,
    nativeClientDeclaration,
    browserClientDeclaration,
    nativeServerDeclaration,
  );
  checkNegotiatedSessionIdentity(nativeClientSource, browserClientSource, nativeServerSource);
  checkBrowserNegotiatedSessionIdentity(await Deno.readTextFile("packages/browser-client/src/wasm-role.ts"));
  await checkProviderSessionIdentityAbi();
  await checkProviderRoleHandleOwnership();
}

function checkFrozenDataPlaneValidation(contract: FrozenSdkContract, coreSource: string): void {
  const prelude = contract.wireLayouts.BodyRegionPrelude;
  const expectedPrelude = {
    objectReferenceBlockBytesMultiple: 24,
    typedPayloadDescriptorBytesMultiple: 24,
    extensionDescriptorBytesMultiple: 16,
    typedPayloadDescriptorCountRule:
      "typed_payload_descriptor_bytes equals payload_frame_count * 24 for FRAME_SUBMIT and RESULT_PUSH",
  } as const;
  if (prelude?.size !== 32 || !recordsEqual(prelude.validation, expectedPrelude)) {
    failures.push("frozen BodyRegionPrelude validation must equal the contract v15 block and descriptor rules");
  }

  const expectedResult = {
    staleReuseRule:
      "(result_class is stale_reuse or result_flags contains stale) if and only if reused_frame_id is non-zero",
    tensorPartialRule:
      "(result_class is partial or result_flags contains partial) requires dropped_tile_count greater than zero for tensor payloads",
    tensorCoverageRule: "covered_tile_count plus dropped_tile_count equals tile_count for tensor payloads",
    nonTensorCoverageRule:
      "section_count, tile_count, tile_base_id, tile_index_bytes, covered_tile_count, and dropped_tile_count are zero when payload_kind_bitmap contains no tensor payload",
  } as const;
  if (!recordsEqual(contract.types.ResultPushMetadata?.validation, expectedResult)) {
    failures.push("frozen ResultPushMetadata validation must equal the contract v15 result coverage rules");
  }

  checkRequiredSourceFragments("@nnrp/core frozen data-plane validation", coreSource, [
    "validateSubmitBody(request.metadata, request.body)",
    "validateSubmitBody(metadata, body)",
    '"NNRP_SUBMIT_OBJECT_REFERENCE_LENGTH_INVALID"',
    '"NNRP_SUBMIT_TYPED_DESCRIPTOR_LENGTH_INVALID"',
    '"NNRP_SUBMIT_EXTENSION_DESCRIPTOR_LENGTH_INVALID"',
    '"NNRP_RESULT_STALE_REUSE_INVALID"',
    '"NNRP_RESULT_PARTIAL_COVERAGE_INVALID"',
    '"NNRP_RESULT_TENSOR_COVERAGE_INVALID"',
    '"NNRP_RESULT_TENSOR_FIELDS_INVALID"',
  ]);
}

function recordsEqual(
  actual: Readonly<Record<string, string | number>> | undefined,
  expected: Readonly<Record<string, string | number>>,
): boolean {
  return actual !== undefined && JSON.stringify(actual) === JSON.stringify(expected);
}

function checkBrowserNegotiatedSessionIdentity(browserWasmRoleSource: string): void {
  for (
    const required of [
      "assertNegotiatedBrowserSessionId(binding.sessionId)",
      'throw new RangeError("negotiated sessionId must be a non-zero u32")',
    ]
  ) {
    if (!browserWasmRoleSource.includes(required)) {
      failures.push(`@nnrp/browser-client must validate provider-reported session identity: ${required}`);
    }
  }
}

function checkV9OptionAndRoleSurfaces(
  contract: FrozenSdkContract,
  nativeClientSource: string,
  browserClientSource: string,
  nativeServerSource: string,
): void {
  for (
    const [key, projection] of [
      ["clientBootstrapOptions", "@nnrp/native-client.NnrpNativeClientOptions"],
      ["clientSessionOptions", "@nnrp/native-client.NnrpSessionOptions"],
      ["serverBootstrapOptions", "@nnrp/native-server.NnrpListenOptions"],
      ["serverSessionOptions", "@nnrp/native-server.NnrpServerSessionOptions"],
      ["serverAcceptOptions", "@nnrp/native-server.NnrpServerAcceptOptions"],
      ["serverSessionPolicy", "@nnrp/native-server.NnrpServerSessionPolicy"],
    ] as const
  ) {
    checkProjection(contract, key, projection);
  }

  const clientSessionFields = [
    "requestedSessionId",
    "profileId",
    "schemaId",
    "schemaVersion",
    "priorityClass",
    "defaultDeadlineMillis",
    "maxInFlightOperations",
    "leaseTtlHintMillis",
    "allowResume",
    "resumeTokenBytes",
    "cacheHints",
  ] as const;
  const clientSessionTypes = {
    requestedSessionId: "number",
    profileId: "number",
    schemaId: "number",
    schemaVersion: "number",
    priorityClass: "NnrpSessionPriorityClass",
    defaultDeadlineMillis: "number",
    maxInFlightOperations: "number",
    leaseTtlHintMillis: "number",
    allowResume: "boolean",
    resumeTokenBytes: "number",
    cacheHints: "readonly NnrpCacheObjectKind[]",
  } as const;
  checkInterfaceFields(nativeClientSource, "NnrpSessionOptions", clientSessionFields, clientSessionTypes);
  checkInterfaceFields(browserClientSource, "NnrpBrowserSessionOptions", clientSessionFields, clientSessionTypes);

  checkInterfaceFields(
    nativeClientSource,
    "NnrpNativeClientOptions",
    ["endpoint", "providerRoutes", "transports", "transportPolicy", "sessionDefaults", "ffi"],
    {
      endpoint: contractFieldType(contract, "ClientBootstrapOptions", "endpoint"),
      providerRoutes: "NnrpClientProviderRoutes",
      transports: "readonly NnrpNativeTransportProvider[]",
      transportPolicy: "NnrpTransportPolicy",
      sessionDefaults: "NnrpSessionOptions",
      ffi: "NnrpNativeFfiBinding",
    },
  );
  checkInterfaceFields(
    nativeServerSource,
    "NnrpListenOptions",
    ["endpoint", "providerRoutes", "transports", "transportPolicy", "sessionDefaults"],
    {
      endpoint: contractFieldType(contract, "ServerBootstrapOptions", "endpoint"),
      providerRoutes: "NnrpServerProviderRoutes",
      transports: "readonly NnrpNativeTransportProvider[]",
      transportPolicy: "NnrpTransportPolicy",
      sessionDefaults: "NnrpServerSessionOptions",
    },
  );
  checkInterfaceFields(
    nativeServerSource,
    "NnrpServerSessionOptions",
    contractFields(contract, "ServerSessionOptions"),
    {
      supportedProfiles: "readonly number[]",
      supportedCacheObjects: "readonly number[]",
      maxCacheObjects: "bigint",
      maxCacheObjectBytes: "number",
      schemaRegistry: "NnrpSchemaRegistry",
      resumeTokenBytes: "number",
      maxInFlightOperations: "number",
      grantedOperationCredit: "number",
      leaseTtlMs: "number",
      resumeWindowMs: "number",
      applicationPolicy: "NnrpServerSessionPolicy",
    },
  );
  checkInterfaceFields(
    nativeServerSource,
    "NnrpServerAcceptOptions",
    ["timeoutMs"],
    { timeoutMs: "number" },
  );
  checkInterfaceFields(
    nativeServerSource,
    "NnrpServerSessionPolicyDecision",
    contractFields(contract, "ServerSessionPolicyDecision"),
    { accepted: "boolean", sessionErrorCode: "number", diagnostic: "string" },
  );

  checkClassMethodSignature(
    nativeClientSource,
    "NnrpClient",
    "openSession",
    "Promise<NnrpClientSession>",
    "options: NnrpSessionOptions",
  );
  checkClassMethodSignature(
    nativeClientSource,
    "NnrpClient",
    "resumeSession",
    "Promise<NnrpClientSession>",
    "ticket: NnrpSessionRecoveryTicket",
  );
  checkClassMethodSignature(
    nativeClientSource,
    "NnrpClientSession",
    "recoveryTicket",
    "NnrpSessionRecoveryTicket | undefined",
  );
  checkClassMethodSignature(
    browserClientSource,
    "NnrpBrowserClient",
    "openSession",
    "Promise<NnrpBrowserClientSession>",
    "options: NnrpBrowserSessionOptions",
  );
  checkClassMethodSignature(
    browserClientSource,
    "NnrpBrowserClient",
    "resumeSession",
    "Promise<NnrpBrowserClientSession>",
    "ticket: NnrpSessionRecoveryTicket",
  );
  checkClassMethodSignature(
    browserClientSource,
    "NnrpBrowserClientSession",
    "recoveryTicket",
    "NnrpSessionRecoveryTicket | undefined",
  );
  checkClassMethodSignature(
    nativeServerSource,
    "NnrpServer",
    "accept",
    "Promise<NnrpServerSession>",
    "options: NnrpServerAcceptOptions",
  );
  checkInterfaceMethodSignature(
    nativeServerSource,
    "NnrpServerSessionPolicy",
    "evaluate",
    "Promise<NnrpServerSessionPolicyDecision>",
    "open: NnrpSessionOpenMetadata",
  );

  checkRequiredSourceFragments("native client session defaults", nativeClientSource, [
    "requestedSessionId: options.requestedSessionId ?? 0",
    "profileId: options.profileId ?? NNRP_STANDARD_PROFILE_TOKEN",
    "schemaId: options.schemaId ?? NNRP_TOKEN_DELTA_SCHEMA_ID",
    "schemaVersion: options.schemaVersion ?? NNRP_TOKEN_DELTA_SCHEMA_VERSION",
    "priorityClass: options.priorityClass ?? NnrpSessionPriorityClass.Balanced",
    "defaultDeadlineMillis: options.defaultDeadlineMillis ?? 500",
    "maxInFlightOperations: options.maxInFlightOperations ?? 4",
    "leaseTtlHintMillis: options.leaseTtlHintMillis ?? 30_000",
    "allowResume: options.allowResume ?? false",
    "resumeTokenBytes: options.resumeTokenBytes ?? 0",
    "cacheHints: Object.freeze([...(options.cacheHints ?? [])])",
  ]);
  checkRequiredSourceFragments("browser client session defaults", browserClientSource, [
    "requestedSessionId: 0",
    "profileId: NNRP_STANDARD_PROFILE_TOKEN",
    "schemaId: NNRP_TOKEN_DELTA_SCHEMA_ID",
    "schemaVersion: NNRP_TOKEN_DELTA_SCHEMA_VERSION",
    "priorityClass: NnrpSessionPriorityClass.Balanced",
    "defaultDeadlineMillis: 500",
    "maxInFlightOperations: 4",
    "leaseTtlHintMillis: 30_000",
    "allowResume: false",
    "resumeTokenBytes: 0",
    "cacheHints: Object.freeze([])",
  ]);
  checkRequiredSourceFragments("browser session open metadata validation", browserClientSource, [
    "resumeTokenBytes: merged.resumeTokenBytes",
  ]);
  checkRequiredSourceFragments("native server session defaults", nativeServerSource, [
    "options.supportedProfiles ?? [NnrpStandardProfile.Token]",
    "options.supportedCacheObjects ?? []",
    "options.maxCacheObjects ?? 0n",
    "options.maxCacheObjectBytes ?? 0",
    "options.resumeTokenBytes ?? 24",
    "options.maxInFlightOperations ?? 4",
    "options.grantedOperationCredit ?? 2",
    "options.leaseTtlMs ?? 30_000",
    "options.resumeWindowMs ?? 120_000",
    "options.applicationPolicy ?? ACCEPT_VALID_SERVER_SESSIONS",
    "options.timeoutMs ?? 0",
  ]);
}

function checkNegotiatedSessionIdentity(
  nativeClientSource: string,
  browserClientSource: string,
  nativeServerSource: string,
): void {
  for (
    const [label, source] of [
      ["@nnrp/native-client NnrpClientSession", nativeClientSource],
      ["@nnrp/native-server NnrpServerSession", nativeServerSource],
    ] as const
  ) {
    if (!source.includes("public get sessionId(): number")) {
      failures.push(`${label} must expose the negotiated non-zero u32 sessionId`);
    }
  }
  for (
    const staleSurface of [
      "readonly sessionId: string",
      "readonly sessionId?: string",
      "native-server-session-",
    ]
  ) {
    if (nativeServerSource.includes(staleSurface)) {
      failures.push(`@nnrp/native-server still contains stale session identity surface: ${staleSurface}`);
    }
  }
  if (!nativeClientSource.includes("sessionId: assertNegotiatedSessionId(resolved.sessionId)")) {
    failures.push("@nnrp/native-client must use the provider-reported negotiated sessionId");
  }
  if (!nativeClientSource.includes("assertNegotiatedSessionId(registration.sessionId)")) {
    failures.push("@nnrp/native-client must validate every public session registration identity");
  }
  if (!nativeClientSource.includes("assertNegotiatedSessionId(sessionId);")) {
    failures.push("@nnrp/native-client must reject the reserved zero sessionId when polling events");
  }
  if (!nativeServerSource.includes("const sessionId = nativeSession.sessionId;")) {
    failures.push("@nnrp/native-server must use the provider-reported negotiated sessionId");
  }
  for (
    const [label, source] of [
      ["@nnrp/native-client", nativeClientSource],
      ["@nnrp/browser-client", browserClientSource],
    ] as const
  ) {
    for (const required of ["requestedSessionId: ticket.sessionId", "allowResume: true"]) {
      if (!source.includes(required)) {
        failures.push(`${label} resumeSession must bind recovery identity: ${required}`);
      }
    }
  }
}

async function checkProviderSessionIdentityAbi(): Promise<void> {
  for (const transport of ["tcp", "quic", "ipc", "websocket"]) {
    for (const host of ["native.ts", "native-node.ts"]) {
      const path = `packages/transport-${transport}/src/${host}`;
      const source = await Deno.readTextFile(path);
      for (const required of ["nnrp_session_id", "negotiated session id", "readonly sessionId: number"]) {
        if (!source.includes(required)) {
          failures.push(`${path} is missing negotiated session identity ABI surface: ${required}`);
        }
      }
    }
  }
}

async function checkProviderRoleHandleOwnership(): Promise<void> {
  for (const transport of ["tcp", "quic", "ipc", "websocket"]) {
    const denoPath = `packages/transport-${transport}/src/native.ts`;
    const denoSource = await Deno.readTextFile(denoPath);
    const denoClient = sourceBetween(denoSource, "class DenoClientRoleSession", "class DenoServerRole");
    const denoServer = sourceBetween(denoSource, "class DenoServerRoleSession", "function packSessionOpenRequest");
    checkRequiredSourceFragments(`${denoPath} client role handle ownership`, denoClient, [
      "async sendRuntimeFrame(messageType: number",
      "packRuntimeFrameRequest(this.handle, messageType",
    ]);
    checkRequiredSourceFragments(`${denoPath} server operation handle ownership`, denoServer, [
      "async sendRuntimeFrame(handle: FfiHandle",
      "packRuntimeFrameRequest(handle, messageType",
    ]);

    const nodePath = `packages/transport-${transport}/src/native-node.ts`;
    const nodeSource = await Deno.readTextFile(nodePath);
    const nodeClient = sourceBetween(nodeSource, "class NodeClientRoleSession", "class NodeServerRole");
    const nodeServer = sourceBetween(nodeSource, "class NodeServerRoleSession", "function requiredHandle");
    checkRequiredSourceFragments(`${nodePath} client role handle ownership`, nodeClient, [
      "async sendRuntimeFrame(\n    messageType: number",
      "handle: this.handle",
    ]);
    checkRequiredSourceFragments(`${nodePath} server operation handle ownership`, nodeServer, [
      "async sendRuntimeFrame(\n    handle: NativeHandle",
      "handle,\n        message_type: messageType",
    ]);
  }
}

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    failures.push(`source segment is missing: ${startMarker} -> ${endMarker}`);
    return "";
  }
  return source.slice(start, end);
}

function checkProjection(contract: FrozenSdkContract, key: string, expected: string): void {
  const actual = contract.languageProjections.javascript[key];
  if (actual !== expected) {
    failures.push(`frozen JavaScript projection ${key} must be ${expected}, received ${String(actual)}`);
  }
}

function checkProjectedPublicExports(
  projections: FrozenSdkContract["languageProjections"]["javascript"],
  sources: Readonly<Record<string, string>>,
): void {
  for (const projection of projectedSymbols(projections)) {
    const match = /^(@nnrp\/[a-z-]+)\.([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(projection);
    if (match === null) continue;
    const [, packageName, symbol] = match;
    const source = sources[packageName];
    if (source === undefined) {
      failures.push(`frozen JavaScript projection references an unchecked package: ${projection}`);
      continue;
    }
    const exportPattern = new RegExp(
      `\\bexport\\s+(?:declare\\s+)?(?:abstract\\s+)?(?:class|interface|type|enum|const|function)\\s+${symbol}\\b`,
    );
    if (!exportPattern.test(source)) {
      failures.push(`frozen JavaScript projection does not resolve to a public export: ${projection}`);
    }
  }
}

function checkBaselineMetadataCodecExports(
  projections: FrozenSdkContract["languageProjections"]["javascript"],
  coreSource: string,
): void {
  const codecs = projections.baselineMetadataCodecs;
  if (codecs === null || typeof codecs !== "object" || Array.isArray(codecs)) {
    failures.push("frozen JavaScript projection baselineMetadataCodecs must be an object");
    return;
  }
  for (const [typeName, pair] of Object.entries(codecs)) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((entry) => typeof entry !== "string")) {
      failures.push(`frozen JavaScript baseline codec ${typeName} must contain one encoder and one decoder`);
      continue;
    }
    for (const symbol of pair as readonly string[]) {
      const exportPattern = new RegExp(`\\bexport\\s+(?:declare\\s+)?function\\s+${symbol}\\b`);
      if (!exportPattern.test(coreSource)) {
        failures.push(`@nnrp/core is missing frozen baseline codec export: ${symbol}`);
      }
    }
  }
}

function checkGeneratedDeclarationSurfaces(
  contract: FrozenSdkContract,
  coreDeclaration: string,
  nativeClientDeclaration: string,
  browserClientDeclaration: string,
  nativeServerDeclaration: string,
): void {
  checkInterfaceFields(
    nativeClientDeclaration,
    "NnrpNativeClientOptions",
    ["endpoint", "providerRoutes", "transports", "transportPolicy", "sessionDefaults", "ffi"],
    {
      endpoint: contractFieldType(contract, "ClientBootstrapOptions", "endpoint"),
      providerRoutes: "NnrpClientProviderRoutes",
      transports: "readonly NnrpNativeTransportProvider[]",
      transportPolicy: "NnrpTransportPolicy",
      sessionDefaults: "NnrpSessionOptions",
      ffi: "NnrpNativeFfiBinding",
    },
  );
  checkInterfaceFields(
    browserClientDeclaration,
    "NnrpBrowserConnectOptions",
    ["endpoint", "providerRoutes", "transportPolicy", "transportProviders", "sessionDefaults"],
    {
      endpoint: contractFieldType(contract, "ClientBootstrapOptions", "endpoint"),
      providerRoutes: "NnrpClientProviderRoutes",
      transportPolicy: "NnrpTransportPolicy",
      transportProviders: "readonly NnrpBrowserTransportProvider[]",
      sessionDefaults: "NnrpBrowserSessionOptions",
    },
  );
  checkInterfaceFields(
    nativeServerDeclaration,
    "NnrpListenOptions",
    ["endpoint", "providerRoutes", "transports", "transportPolicy", "sessionDefaults"],
    {
      endpoint: contractFieldType(contract, "ServerBootstrapOptions", "endpoint"),
      providerRoutes: "NnrpServerProviderRoutes",
      transports: "readonly NnrpNativeTransportProvider[]",
      transportPolicy: "NnrpTransportPolicy",
      sessionDefaults: "NnrpServerSessionOptions",
    },
  );
  checkTaggedUnion(
    coreDeclaration,
    "NnrpClientEvent",
    contractVariants(contract, "ClientEvent"),
    { runtime: "NnrpRuntimeEvent", lifecycle: "NnrpOperationLifecycleEvent" },
  );
  checkTaggedUnion(
    nativeServerDeclaration,
    "NnrpServerEvent",
    contractVariants(contract, "ServerEvent"),
    { submit: "NnrpServerOperation", runtime: "NnrpRuntimeEvent", lifecycle: "NnrpOperationLifecycleEvent" },
  );
  for (const source of [nativeClientDeclaration, browserClientDeclaration]) {
    checkClassMethodSignature(
      source,
      source === nativeClientDeclaration ? "NnrpClientSession" : "NnrpBrowserClientSession",
      "submit",
      "Promise<NnrpResult>",
    );
    checkClassMethodSignature(
      source,
      source === nativeClientDeclaration ? "NnrpClientSession" : "NnrpBrowserClientSession",
      "nextEvent",
      "Promise<NnrpClientEvent>",
    );
  }
  checkClassMethodSignature(nativeServerDeclaration, "NnrpServerSession", "nextEvent", "Promise<NnrpServerEvent>");
  checkClassMethodSignature(
    nativeServerDeclaration,
    "NnrpServerSession",
    "receiveSubmit",
    "Promise<NnrpServerOperation>",
  );
  checkClassMethodSignature(
    nativeServerDeclaration,
    "NnrpServerOperation",
    "sendResult",
    "Promise<void>",
    "metadata: NnrpResultPushMetadata",
  );
}

function projectedSymbols(value: unknown): readonly string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(projectedSymbols);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(projectedSymbols);
  return [];
}

function checkRoleMethodProjection(contract: FrozenSdkContract): void {
  const actual = contract.languageProjections.javascript.roleMethods;
  const expected = {
    "client.open_session": "openSession",
    "client.resume_session": "resumeSession",
    "client_session.recovery_ticket": "recoveryTicket",
    "client_session.next_event": "nextEvent",
    "server.accept": "accept",
    "server_session.next_event": "nextEvent",
    "server_session.receive_submit": "receiveSubmit",
    "server_operation.send_result": "sendResult",
    "server_operation.send_result_drop": "sendResultDrop",
    "server_operation.send_progress": "sendProgress",
    "server_operation.send_partial_result": "sendPartialResult",
  } as const;
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
    failures.push("frozen JavaScript projection roleMethods must be an object");
    return;
  }
  const roleMethods = actual as Readonly<Record<string, string>>;
  checkExactMembers("languageProjections.javascript.roleMethods", Object.keys(roleMethods), Object.keys(expected));
  for (const [roleMethod, method] of Object.entries(expected)) {
    if (roleMethods[roleMethod] !== method) {
      failures.push(
        `frozen JavaScript role method ${roleMethod} must be ${method}, received ${roleMethods[roleMethod]}`,
      );
    }
  }
}

function checkClientSubmitWaitContract(
  contract: FrozenSdkContract,
  nativeClientSource: string,
  browserClientSource: string,
): void {
  const submitWait = contract.roleSurfaces.clientSubmitWait;
  const requiredRules = [
    ["scopeRule", submitWait.scopeRule, "cancellable or time-bounded submit-and-wait"],
    ["preDispatchCancellationRule", submitWait.preDispatchCancellationRule, "emits no submit or cancellation frame"],
    ["postDispatchCancellationRule", submitWait.postDispatchCancellationRule, "sends CANCEL"],
    ["timeoutRule", submitWait.timeoutRule, "sends DEADLINE before dispatch"],
    ["timeoutRule", submitWait.timeoutRule, "sends CANCEL"],
    ["lifecycleRule", submitWait.lifecycleRule, "remains observable through the client event pump"],
    ["lifecycleRule", submitWait.lifecycleRule, "must not race the same submit wait"],
  ] as const;
  for (const [rule, value, requiredText] of requiredRules) {
    if (!value.includes(requiredText)) {
      failures.push(`roleSurfaces.clientSubmitWait.${rule} must include: ${requiredText}`);
    }
  }

  for (
    const [label, source] of [
      ["@nnrp/native-client", nativeClientSource],
      ["@nnrp/browser-client", browserClientSource],
    ] as const
  ) {
    checkRequiredSourceFragments(`${label} submit-wait cancellation`, source, [
      'code: "NNRP_SUBMIT_CANCELLED"',
      'code: "NNRP_SUBMIT_TIMEOUT"',
      "this.#cancelledOperations.add(operationId)",
      "onCancelled?.(error)",
      "sourceRole: RuntimeRole.Client",
    ]);
  }
}

function contractFields(contract: FrozenSdkContract, typeName: string): readonly string[] {
  const type = contract.types[typeName];
  if (type === undefined) {
    failures.push(`frozen contract is missing type ${typeName}`);
    return [];
  }
  return type.fields.map(({ name }) => snakeToCamel(name));
}

function contractFieldType(contract: FrozenSdkContract, typeName: string, fieldName: string): string {
  const type = contract.types[typeName];
  if (type === undefined) {
    failures.push(`frozen contract is missing type ${typeName}`);
    return "<missing>";
  }
  const field = type.fields.find(({ name }) => name === fieldName);
  if (field === undefined) {
    failures.push(`frozen contract type ${typeName} is missing field ${fieldName}`);
    return "<missing>";
  }
  return field.type;
}

function contractVariants(contract: FrozenSdkContract, typeName: string): readonly string[] {
  const type = contract.types[typeName];
  if (type?.variants === undefined) {
    failures.push(`frozen contract is missing variants for ${typeName}`);
    return [];
  }
  return type.variants;
}

function enumValues(contract: FrozenSdkContract, enumName: string): readonly string[] {
  const values = contract.enums[enumName]?.values;
  if (values === undefined) {
    failures.push(`frozen contract is missing enum ${enumName}`);
    return [];
  }
  return Object.keys(values).map((value) => value.replaceAll("_", "-"));
}

function runtimeMetadataProjection(contract: FrozenSdkContract): Readonly<Record<string, string | null>> {
  const variants = contract.types.RuntimeEventMetadata?.variantTypes;
  if (variants === undefined) {
    failures.push("frozen contract is missing RuntimeEventMetadata.variantTypes");
    return {};
  }
  const prefixed = new Map([
    ["FrameSubmitMetadata", "NnrpFrameSubmitMetadata"],
    ["ResultPushMetadata", "NnrpResultPushMetadata"],
    ["ResultHintMetadata", "NnrpResultHintMetadata"],
    ["FlowUpdateMetadata", "NnrpFlowUpdateMetadata"],
    ["SessionCloseMetadata", "NnrpSessionCloseMetadata"],
  ]);
  return Object.fromEntries(
    Object.entries(variants).map(([tag, type]) => [tag, type === null ? null : prefixed.get(type) ?? type]),
  );
}

function checkInterfaceFields(
  source: string,
  interfaceName: string,
  expectedFields: readonly string[],
  expectedTypes: Readonly<Record<string, string>>,
): void {
  const declaration = interfaceDeclaration(source, interfaceName);
  if (declaration === undefined) return;
  const actual = new Map<string, string>();
  for (const match of declaration.matchAll(/readonly\s+([A-Za-z0-9_]+)(?:\?)?\s*:\s*([^;]+);/g)) {
    actual.set(match[1]!, normalizeType(match[2]!));
  }
  checkExactMembers(interfaceName, [...actual.keys()], expectedFields);
  for (const [field, expectedType] of Object.entries(expectedTypes)) {
    const actualType = actual.get(field);
    if (actualType !== normalizeType(expectedType)) {
      failures.push(`${interfaceName}.${field} must be ${expectedType}, received ${actualType ?? "missing"}`);
    }
  }
}

function checkTaggedUnion(
  source: string,
  typeName: string,
  expectedTags: readonly string[],
  expectedValueTypes: Readonly<Record<string, string | null>>,
): void {
  const declaration = typeDeclaration(source, typeName);
  if (declaration === undefined) return;
  const variants = new Map<string, string | null>();
  for (
    const match of declaration.matchAll(
      /\{\s*readonly type:\s*"([^"]+)"(?:;\s*readonly (?:value|event|operation):\s*([^;}]+))?/g,
    )
  ) {
    variants.set(match[1]!, match[2] === undefined ? null : normalizeType(match[2]));
  }
  checkExactMembers(typeName, [...variants.keys()], expectedTags);
  for (const [tag, expectedType] of Object.entries(expectedValueTypes)) {
    if (!variants.has(tag)) continue;
    const actualType = variants.get(tag) ?? null;
    if (expectedType !== null && actualType !== normalizeType(expectedType)) {
      failures.push(`${typeName}.${tag} must contain ${expectedType}, received ${actualType ?? "no value"}`);
    }
  }
}

function checkStringUnion(source: string, typeName: string, expectedValues: readonly string[]): void {
  const declaration = typeDeclaration(source, typeName);
  if (declaration === undefined) return;
  const actual = [...declaration.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
  checkExactMembers(typeName, actual, expectedValues);
}

function checkMethodSignature(
  source: string,
  methodName: string,
  expectedReturn: string,
  requiredParameter?: string,
): void {
  const match = new RegExp(
    `(?:public\\s+)?(?:async\\s+)?${methodName}\\s*\\(([^)]*)\\)\\s*:\\s*([^\\{;]+)`,
    "s",
  ).exec(source);
  if (match === null) {
    failures.push(`public method ${methodName}() is missing from its frozen role surface`);
    return;
  }
  if (normalizeType(match[2]!) !== normalizeType(expectedReturn)) {
    failures.push(`${methodName}() must return ${expectedReturn}, received ${match[2]!.trim()}`);
  }
  if (requiredParameter !== undefined && !normalizeType(match[1]!).includes(normalizeType(requiredParameter))) {
    failures.push(`${methodName}() must accept ${requiredParameter}`);
  }
}

function checkInterfaceMethodSignature(
  source: string,
  interfaceName: string,
  methodName: string,
  expectedReturn: string,
  requiredParameter: string,
): void {
  const declaration = interfaceDeclaration(source, interfaceName);
  if (declaration === undefined) return;
  const match = new RegExp(`${methodName}\\s*\\(([^)]*)\\)\\s*:\\s*([^;]+);`, "s").exec(declaration);
  if (match === null) {
    failures.push(`${interfaceName}.${methodName}() is missing from its frozen surface`);
    return;
  }
  if (normalizeType(match[2]!) !== normalizeType(expectedReturn)) {
    failures.push(
      `${interfaceName}.${methodName}() must return ${expectedReturn}, received ${match[2]!.trim()}`,
    );
  }
  if (!normalizeType(match[1]!).includes(normalizeType(requiredParameter))) {
    failures.push(`${interfaceName}.${methodName}() must accept ${requiredParameter}`);
  }
}

function checkClassMethodSignature(
  source: string,
  className: string,
  methodName: string,
  expectedReturn: string,
  requiredParameter?: string,
): void {
  const declaration = classDeclaration(source, className);
  if (declaration === undefined) return;
  checkMethodSignature(declaration, methodName, expectedReturn, requiredParameter);
}

function checkRequiredSourceFragments(label: string, source: string, requiredFragments: readonly string[]): void {
  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) failures.push(`${label} is missing frozen value: ${fragment}`);
  }
}

function interfaceDeclaration(source: string, interfaceName: string): string | undefined {
  return bracedDeclaration(source, `export interface ${interfaceName} {`, interfaceName);
}

function classDeclaration(source: string, className: string): string | undefined {
  const declaredMarker = `export declare class ${className} {`;
  const sourceMarker = `export class ${className} {`;
  return bracedDeclaration(source, source.includes(declaredMarker) ? declaredMarker : sourceMarker, className);
}

function bracedDeclaration(source: string, marker: string, declarationName: string): string | undefined {
  const start = source.indexOf(marker);
  if (start < 0) {
    failures.push(`frozen JavaScript surface is missing ${declarationName}`);
    return undefined;
  }
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  failures.push(`${declarationName} declaration is unterminated`);
  return undefined;
}

function typeDeclaration(source: string, typeName: string): string | undefined {
  const marker = `export type ${typeName} =`;
  const start = source.indexOf(marker);
  if (start < 0) {
    failures.push(`@nnrp/core is missing ${typeName}`);
    return undefined;
  }
  const nextExport = source.indexOf("\nexport ", start + marker.length);
  return source.slice(start + marker.length, nextExport < 0 ? source.length : nextExport);
}

function checkExactMembers(label: string, actual: readonly string[], expected: readonly string[]): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    failures.push(`${label} members must be [${expected.join(", ")}], received [${actual.join(", ")}]`);
  }
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function normalizeType(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const sessionMethods = [
    "nextEvent",
    "receiveSubmit",
    "sendBackpressure",
    "sendCreditUpdate",
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
  for (const method of sessionMethods) {
    if (typeof NnrpServerSession.prototype[method as keyof NnrpServerSession] !== "function") {
      failures.push(`@nnrp/native-server NnrpServerSession is missing ${method}()`);
    }
  }
  for (const removed of ["receive", "sendResult", "sendResultDropReason", "sendProgress", "sendPartialResult"]) {
    if (removed in NnrpServerSession.prototype) {
      failures.push(`@nnrp/native-server NnrpServerSession must not expose operation-owned ${removed}()`);
    }
  }
  for (const method of ["sendResult", "sendResultDrop", "sendProgress", "sendPartialResult"]) {
    if (typeof NnrpServerOperation.prototype[method as keyof NnrpServerOperation] !== "function") {
      failures.push(`@nnrp/native-server NnrpServerOperation is missing ${method}()`);
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

if (import.meta.main) {
  await checkFrozenMachineContract();
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
}
