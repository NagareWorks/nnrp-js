export const EXPECTED_JAVASCRIPT_PROJECTIONS = {
  submitRequest: "@nnrp/core.NnrpSubmitRequest",
  submitHeaderContext: "@nnrp/core.NnrpSubmitHeaderContext",
  submitBuilders: ["createTensorSubmitRequest", "createTokenSubmitRequest", "createTypedPayloadSubmitRequest"],
  runtimeFrameHeader: "@nnrp/core.NnrpRuntimeFrameHeader",
  runtimeEvent: "@nnrp/core.NnrpRuntimeEvent",
  clientEvent: "@nnrp/core.NnrpClientEvent",
  serverEvent: "@nnrp/native-server.NnrpServerEvent",
  serverOperation: "@nnrp/native-server.NnrpServerOperation",
  roleMethods: {
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
  },
  operationLifecycleEvent: "@nnrp/core.NnrpOperationLifecycleEvent",
  terminalEvent: "@nnrp/core.NnrpTerminalEvent",
  result: "@nnrp/core.NnrpResult",
  clientRoles: ["@nnrp/native-client.NnrpClientSession", "@nnrp/browser-client.NnrpBrowserClientSession"],
  serverRoles: ["@nnrp/native-server.NnrpServerSession"],
  runtimeMetadataNamespace: "@nnrp/core",
  baselineMetadataCodecs: {
    ClientHelloMetadata: ["encodeClientHelloMetadata", "decodeClientHelloMetadata"],
    SessionPatchAckMetadata: ["encodeSessionPatchAckMetadata", "decodeSessionPatchAckMetadata"],
    FlowUpdateMetadata: ["encodeFlowUpdateMetadata", "decodeFlowUpdateMetadata"],
    ResultHintMetadata: ["encodeResultHintMetadata", "decodeResultHintMetadata"],
    FrameSubmitMetadata: ["encodeFrameSubmitMetadata", "decodeFrameSubmitMetadata"],
    ResultPushMetadata: ["encodeResultPushMetadata", "decodeResultPushMetadata"],
    CachePutMetadata: ["encodeCachePutMetadata", "decodeCachePutMetadata"],
    CacheAckMetadata: ["encodeCacheAckMetadata", "decodeCacheAckMetadata"],
    CacheInvalidateMetadata: ["encodeCacheInvalidateMetadata", "decodeCacheInvalidateMetadata"],
    TransportProbeMetadata: ["encodeTransportProbeMetadata", "decodeTransportProbeMetadata"],
    TransportProbeAckMetadata: ["encodeTransportProbeAckMetadata", "decodeTransportProbeAckMetadata"],
    ObjectReferenceBlock: ["encodeObjectReferenceBlock", "decodeObjectReferenceBlock"],
  },
  capabilityMetadata: "@nnrp/core.CapabilityMetadata",
  connectionLifecycle: "@nnrp/core.NnrpConnectionLifecycle",
  sessionLifecycle: "@nnrp/core.NnrpSessionLifecycle",
  typedPayloadDescriptor: "@nnrp/core.NnrpTypedPayloadDescriptor",
  typedPayloadFrame: "@nnrp/core.NnrpTypedPayloadFrame",
  cacheObjectId: "@nnrp/core.CacheObjectId",
  cacheLease: "@nnrp/core.CacheLease",
  cacheLeaseResult: "@nnrp/core.NnrpCacheLeaseResult",
  cachePolicyOptions: "@nnrp/core.NnrpCachePolicyOptions",
  transportProviderMetadata: "@nnrp/core.NnrpTransportProviderMetadata",
  transportProviderDescriptor: "@nnrp/core.NnrpTransportProviderDescriptor",
  transportSelectionOptions: "@nnrp/core.NnrpTransportSelectionOptions",
  transportSelection: "@nnrp/core.NnrpTransportSelection",
  transportSelectionFailure: "@nnrp/core.NnrpTransportSelectionError",
  applicationEndpoint: "@nnrp/core.NnrpEndpoint",
  providerEndpoint: "@nnrp/core.NnrpProviderEndpoint",
  clientTransportSecurity: "@nnrp/core.NnrpTransportClientSecurity",
  serverTransportSecurity: "@nnrp/core.NnrpTransportServerSecurity",
  clientProviderRoute: "@nnrp/core.NnrpClientProviderRoute",
  serverProviderRoute: "@nnrp/core.NnrpServerProviderRoute",
  schemaDescriptor: "@nnrp/core.NnrpSchemaDescriptorHeader",
  schemaRegistry: "@nnrp/core.NnrpSchemaRegistry",
  clientBootstrapOptions: "@nnrp/native-client.NnrpNativeClientOptions",
  clientSessionOptions: "@nnrp/native-client.NnrpSessionOptions",
  sessionRecoveryTicket: "@nnrp/core.NnrpSessionRecoveryTicket",
  sessionRecoveryTicketEncode: "NnrpSessionRecoveryTicket.toBytes",
  sessionRecoveryTicketDecode: "NnrpSessionRecoveryTicket.fromBytes",
  serverBootstrapOptions: "@nnrp/native-server.NnrpListenOptions",
  serverSessionOptions: "@nnrp/native-server.NnrpServerSessionOptions",
  serverAcceptOptions: "@nnrp/native-server.NnrpServerAcceptOptions",
  serverSessionPolicy: "@nnrp/native-server.NnrpServerSessionPolicy",
} as const;

export function projectionMapsEqual(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(normalizeProjection(actual)) === JSON.stringify(normalizeProjection(expected));
}

function normalizeProjection(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeProjection);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeProjection(nested)]),
    );
  }
  return value;
}
