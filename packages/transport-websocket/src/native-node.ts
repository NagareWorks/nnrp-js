import {
  decodeSessionOpenMetadata,
  type NnrpNativeTransportBinding,
  type NnrpSchemaDescriptorHeader,
  type NnrpSessionOpenMetadata,
  type NnrpTransportAcceptOptions,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  NnrpTransportError,
  type NnrpTransportProbeMetrics,
  type NnrpTransportProbeOptions,
  type NnrpTransportReceiveOptions,
  type NnrpTransportServer,
} from "@nnrp/core";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import koffi, { type LibraryHandle } from "koffi";

const TRANSPORT_ID = 4;
const TRANSPORT_KIND = "websocket" as const;
const TRANSPORT_LABEL = "WEBSOCKET";
const PACKAGE_NAME = "nnrp-ffi-transport-websocket";
const TRANSPORT_SCOPE = "websocket";
const ABI_VERSION = "4.4.0";
const CLIENT_ROLE_ADOPT = Symbol.for("nnrp.internal.native.client-role-adopt.v1");
const SERVER_ROLE_ADOPT = Symbol.for("nnrp.internal.native.server-role-adopt.v1");
const HANDLE_KIND_INVALID = 0;
const HANDLE_KIND_BUFFER = 5;
const HANDLE_KIND_CONNECTION = 10;
const HANDLE_KIND_LISTENER = 11;
const HANDLE_KIND_SECURITY_CONFIG = 12;
const HANDLE_KIND_SERVER_ACCEPT = 13;

interface NativeHandle {
  kind: number;
  id: number | bigint;
  generation: number;
  flags: number;
}

interface NativeStatus {
  status_code: number;
  error_family: number;
  protocol_error_code: number;
  detail_code: number;
}

interface NativeBufferView {
  ptr: unknown;
  len: number | bigint;
}

interface NativeSlice {
  ptr: unknown;
  len: number | bigint;
}

interface InternalServerPolicyDecision {
  readonly accepted: boolean;
  readonly sessionErrorCode: number;
  readonly diagnostic?: string;
}

interface InternalServerRoleOptions {
  readonly supportedProfiles: readonly number[];
  readonly supportedCacheObjects: readonly number[];
  readonly maxCacheObjects: bigint;
  readonly maxCacheObjectBytes: number;
  readonly schemaDescriptors: readonly NnrpSchemaDescriptorHeader[];
  readonly resumeTokenBytes: number;
  readonly maxInFlightOperations: number;
  readonly grantedOperationCredit: number;
  readonly leaseTtlMs: number;
  readonly resumeWindowMs: number;
  readonly evaluateSession?: (open: NnrpSessionOpenMetadata) => Promise<InternalServerPolicyDecision>;
}

interface InternalClientSessionOpenOptions {
  readonly requestedSessionId: number;
  readonly sessionHandleId: bigint;
  readonly generation: number;
  readonly profileId: number;
  readonly priorityClass: number;
  readonly allowResume: boolean;
  readonly schemaId: number;
  readonly schemaVersion: number;
  readonly defaultDeadlineMillis: number;
  readonly maxInFlightOperations: number;
  readonly leaseTtlHintMillis: number;
  readonly resumeTokenBytes: number;
  readonly cacheHints: readonly number[];
}

interface NativeProbeResult {
  sample_count: number;
  success_count: number;
  median_throughput_bytes_per_second: number | bigint;
  median_rtt_microseconds: number | bigint;
}

interface NativeFrameBatch {
  payload_owner: NativeHandle;
  payload: NativeBufferView;
  frame_count: number;
  reserved0: number;
}

interface NativeRuntimeFrameHeader {
  present: number;
  version_major: number;
  wire_format: number;
  message_type: number;
  flags: number;
  session_id: number;
  frame_id: number;
  view_id: number;
  route_id: number;
  trace_id: number | bigint;
}

interface NativeEvent {
  kind: number;
  header: NativeRuntimeFrameHeader;
  connection: NativeHandle;
  session: NativeHandle;
  operation: NativeHandle;
  payload_owner: NativeHandle;
  payload: NativeBufferView;
  diagnostic: {
    related_operation_id: number | bigint;
    related_frame_id: number;
  };
}

interface NativeServerAcceptResult {
  session: NativeHandle;
  active_transport_id: number;
  reserved0: number;
}

interface InternalRoleEvent {
  readonly kind: number;
  readonly headerPresent: boolean;
  readonly messageType: number;
  readonly versionMajor: number;
  readonly wireFormat: number;
  readonly headerFlags: number;
  readonly wireSessionId: number;
  readonly connection: NativeHandle;
  readonly session: NativeHandle;
  readonly operation: NativeHandle;
  readonly relatedOperationId: bigint;
  readonly relatedFrameId: number;
  readonly frameId: number;
  readonly viewId: number;
  readonly routeId: number;
  readonly traceId: bigint;
  readonly payload: Uint8Array;
}

type NativeFunction = ReturnType<LibraryHandle["func"]>;

const StatusType = koffi.struct({
  status_code: "uint32_t",
  error_family: "uint32_t",
  protocol_error_code: "uint32_t",
  detail_code: "uint32_t",
});
const HandleType = koffi.struct({
  kind: "uint32_t",
  id: "uint64_t",
  generation: "uint32_t",
  flags: "uint32_t",
});
const BufferViewType = koffi.struct({ ptr: "const uint8_t *", len: "size_t" });
const U16SliceType = koffi.struct({ ptr: "const uint16_t *", len: "size_t" });
const U32SliceType = koffi.struct({ ptr: "const uint32_t *", len: "size_t" });
const ServerPolicyBeginCallbackType = koffi.proto("uint32_t", ["void *", "uint64_t", BufferViewType]);
const ServerPolicySinkType = koffi.struct({
  user_data: "void *",
  begin: koffi.pointer(ServerPolicyBeginCallbackType),
});
const ServerPolicyDecisionType = koffi.struct({
  accepted: "uint8_t",
  reserved0: koffi.array("uint8_t", 3),
  session_error_code: "uint32_t",
  diagnostic: BufferViewType,
});
const ServerPolicyCompleteRequestType = koffi.struct({
  request_id: "uint64_t",
  decision: ServerPolicyDecisionType,
});
const SchemaDescriptorHeaderType = koffi.struct({
  schema_id: "uint32_t",
  schema_version: "uint32_t",
  profile_id: "uint16_t",
  schema_flags: "uint16_t",
  min_version_major: "uint8_t",
  max_version_major: "uint8_t",
  reserved0: "uint16_t",
  body_bytes: "uint32_t",
  dependency_count: "uint16_t",
  default_stream_semantics: "uint16_t",
  schema_hash: "uint64_t",
});
const OpenRequestType = koffi.struct({
  transport_id: "uint32_t",
  flags: "uint32_t",
  endpoint: BufferViewType,
  config: HandleType,
  max_packet_bytes: "uint64_t",
  timeout_ms: "uint32_t",
  reserved0: "uint32_t",
});
const AcceptRequestType = koffi.struct({ listener: HandleType, timeout_ms: "uint32_t", reserved0: "uint32_t" });
const WriteBatchRequestType = koffi.struct({
  connection: HandleType,
  frames: koffi.pointer(BufferViewType),
  frame_count: "uint32_t",
  flags: "uint32_t",
});
const ReadBatchRequestType = koffi.struct({
  connection: HandleType,
  max_frames: "uint32_t",
  timeout_ms: "uint32_t",
  max_bytes: "uint64_t",
});
const FrameBatchType = koffi.struct({
  payload_owner: HandleType,
  payload: BufferViewType,
  frame_count: "uint32_t",
  reserved0: "uint32_t",
});
const ProbeRequestType = koffi.struct({
  open: OpenRequestType,
  sample_count: "uint32_t",
  probe_payload_bytes: "uint32_t",
});
const ProbeResultType = koffi.struct({
  sample_count: "uint32_t",
  success_count: "uint32_t",
  median_throughput_bytes_per_second: "uint64_t",
  median_rtt_microseconds: "uint64_t",
});
const SecurityConfigRequestType = koffi.struct({
  transport_id: "uint32_t",
  flags: "uint32_t",
  first: BufferViewType,
  second: BufferViewType,
});
const ClientConnectRequestType = koffi.struct({
  connection_id: "uint64_t",
  generation: "uint32_t",
  reserved0: "uint32_t",
  transport_connection: HandleType,
});
const ServerBindRequestType = koffi.struct({
  server_id: "uint64_t",
  generation: "uint32_t",
  reserved0: "uint32_t",
  transport_listener: HandleType,
  supported_profiles: U16SliceType,
  supported_cache_objects: U32SliceType,
  max_cache_objects: "uint64_t",
  max_cache_object_bytes: "uint32_t",
  resume_token_bytes: "uint32_t",
  max_in_flight_operations: "uint16_t",
  granted_operation_credit: "uint16_t",
  lease_ttl_ms: "uint32_t",
  resume_window_ms: "uint32_t",
  schema_registry: HandleType,
  application_policy: ServerPolicySinkType,
});
const SessionOpenRequestType = koffi.struct({
  connection: HandleType,
  requested_session_id: "uint32_t",
  session_handle_id: "uint64_t",
  generation: "uint32_t",
  profile_id: "uint16_t",
  priority_class: "uint8_t",
  allow_resume: "uint8_t",
  schema_id: "uint32_t",
  schema_version: "uint32_t",
  default_deadline_ms: "uint32_t",
  max_in_flight_operations: "uint16_t",
  reserved0: "uint16_t",
  lease_ttl_hint_ms: "uint32_t",
  resume_token_bytes: "uint32_t",
  cache_hints: U32SliceType,
});
const SessionResumeRequestType = koffi.struct({ open: SessionOpenRequestType, recovery_ticket: BufferViewType });
const SessionRecoveryOutcomeType = koffi.struct({ outcome_code: "uint32_t", resume_window_ms: "uint32_t" });
const SubmitRequestType = koffi.struct({
  session: HandleType,
  operation_id: "uint64_t",
  frame_id: "uint32_t",
  header_flags: "uint32_t",
  view_id: "uint16_t",
  route_id: "uint16_t",
  trace_id: "uint64_t",
  payload: BufferViewType,
});
const RoleEventPollRequestType = koffi.struct({
  scope: HandleType,
  max_events: "uint32_t",
  timeout_ms: "uint32_t",
  flags: "uint32_t",
  reserved0: "uint32_t",
});
const ServerAcceptBeginRequestType = koffi.struct({
  server: HandleType,
  accept_handle_id: "uint64_t",
  generation: "uint32_t",
  reserved0: "uint32_t",
});
const ServerAcceptClaimRequestType = koffi.struct({
  accept: HandleType,
  session_handle_id: "uint64_t",
  generation: "uint32_t",
  reserved0: "uint32_t",
});
const ServerAcceptWaitRequestType = koffi.struct({
  accept: HandleType,
  timeout_ms: "uint32_t",
  flags: "uint32_t",
});
const ServerAcceptResultType = koffi.struct({
  session: HandleType,
  active_transport_id: "uint32_t",
  reserved0: "uint32_t",
});
const ServerSendResultRequestType = koffi.struct({ operation: HandleType, payload: BufferViewType });
const RuntimeFrameSendRequestType = koffi.struct({
  handle: HandleType,
  message_type: "uint32_t",
  frame_id: "uint32_t",
  payload: BufferViewType,
});
const DiagnosticType = koffi.struct({
  status: StatusType,
  related_connection_id: "uint64_t",
  related_session_id: "uint32_t",
  related_operation_id: "uint64_t",
  related_frame_id: "uint32_t",
});
const RuntimeFrameHeaderType = koffi.struct({
  present: "uint8_t",
  version_major: "uint8_t",
  wire_format: "uint8_t",
  message_type: "uint8_t",
  flags: "uint32_t",
  session_id: "uint32_t",
  frame_id: "uint32_t",
  view_id: "uint16_t",
  route_id: "uint16_t",
  trace_id: "uint64_t",
});
const EventType = koffi.struct({
  kind: "uint32_t",
  header: RuntimeFrameHeaderType,
  connection: HandleType,
  session: HandleType,
  operation: HandleType,
  payload_owner: HandleType,
  payload: BufferViewType,
  diagnostic: DiagnosticType,
});
const pointerSize = koffi.sizeof("void *");
const u64Alignment = koffi.alignof("uint64_t");
const nativeLayout = selectNativeAbiLayout(pointerSize, u64Alignment);
const { request: requestLayout, diagnostic: diagnosticLayout, header: headerLayout, event: eventLayout } = nativeLayout;
const layoutChecks = [
  ["handle.size", koffi.sizeof(HandleType), requestLayout.handleSize],
  ["handle.kind", koffi.offsetof(HandleType, "kind"), 0],
  ["handle.id", koffi.offsetof(HandleType, "id"), requestLayout.handleId],
  ["handle.generation", koffi.offsetof(HandleType, "generation"), requestLayout.handleId + 8],
  ["handle.flags", koffi.offsetof(HandleType, "flags"), requestLayout.handleId + 12],
  ["buffer.size", koffi.sizeof(BufferViewType), requestLayout.bufferSize],
  ["buffer.ptr", koffi.offsetof(BufferViewType, "ptr"), 0],
  ["buffer.len", koffi.offsetof(BufferViewType, "len"), requestLayout.bufferLength],
  ["transport_open.size", koffi.sizeof(OpenRequestType), requestLayout.openSize],
  ["transport_open.endpoint", koffi.offsetof(OpenRequestType, "endpoint"), requestLayout.openEndpoint],
  ["transport_open.config", koffi.offsetof(OpenRequestType, "config"), requestLayout.openConfig],
  [
    "transport_open.max_packet_bytes",
    koffi.offsetof(OpenRequestType, "max_packet_bytes"),
    requestLayout.openMaxPacket,
  ],
  ["transport_open.reserved0", koffi.offsetof(OpenRequestType, "reserved0"), requestLayout.openReserved],
  ["client_connect.size", koffi.sizeof(ClientConnectRequestType), requestLayout.adoptionSize],
  ["client_connect.reserved0", koffi.offsetof(ClientConnectRequestType, "reserved0"), requestLayout.adoptionReserved],
  [
    "client_connect.transport",
    koffi.offsetof(ClientConnectRequestType, "transport_connection"),
    requestLayout.adoptionTransport,
  ],
  ["server_bind.size", koffi.sizeof(ServerBindRequestType), requestLayout.serverBindSize],
  ["server_bind.reserved0", koffi.offsetof(ServerBindRequestType, "reserved0"), requestLayout.adoptionReserved],
  [
    "server_bind.transport",
    koffi.offsetof(ServerBindRequestType, "transport_listener"),
    requestLayout.adoptionTransport,
  ],
  ["server_bind.profiles", koffi.offsetof(ServerBindRequestType, "supported_profiles"), requestLayout.serverProfiles],
  [
    "server_bind.cache_objects",
    koffi.offsetof(ServerBindRequestType, "supported_cache_objects"),
    requestLayout.serverCacheObjects,
  ],
  [
    "server_bind.max_cache_objects",
    koffi.offsetof(ServerBindRequestType, "max_cache_objects"),
    requestLayout.serverMaxCacheObjects,
  ],
  [
    "server_bind.schema_registry",
    koffi.offsetof(ServerBindRequestType, "schema_registry"),
    requestLayout.serverSchemaRegistry,
  ],
  [
    "server_bind.application_policy",
    koffi.offsetof(ServerBindRequestType, "application_policy"),
    requestLayout.serverApplicationPolicy,
  ],
  ["session_open.size", koffi.sizeof(SessionOpenRequestType), requestLayout.sessionOpenSize],
  [
    "session_open.session_handle_id",
    koffi.offsetof(SessionOpenRequestType, "session_handle_id"),
    requestLayout.sessionHandleId,
  ],
  ["session_open.generation", koffi.offsetof(SessionOpenRequestType, "generation"), requestLayout.sessionGeneration],
  ["session_open.profile_id", koffi.offsetof(SessionOpenRequestType, "profile_id"), requestLayout.sessionProfileId],
  ["session_open.schema_id", koffi.offsetof(SessionOpenRequestType, "schema_id"), requestLayout.sessionSchemaId],
  ["session_open.cache_hints", koffi.offsetof(SessionOpenRequestType, "cache_hints"), requestLayout.sessionCacheHints],
  ["session_resume.size", koffi.sizeof(SessionResumeRequestType), requestLayout.sessionResumeSize],
  ["session_resume.ticket", koffi.offsetof(SessionResumeRequestType, "recovery_ticket"), requestLayout.sessionOpenSize],
  ["session_recovery_outcome.size", koffi.sizeof(SessionRecoveryOutcomeType), 8],
  ["schema_descriptor.size", koffi.sizeof(SchemaDescriptorHeaderType), 32],
  ["policy_decision.size", koffi.sizeof(ServerPolicyDecisionType), requestLayout.policyDecisionSize],
  ["policy_complete.size", koffi.sizeof(ServerPolicyCompleteRequestType), requestLayout.policyCompleteSize],
  ["submit.size", koffi.sizeof(SubmitRequestType), requestLayout.submitSize],
  ["submit.operation_id", koffi.offsetof(SubmitRequestType, "operation_id"), requestLayout.handleSize],
  ["submit.frame_id", koffi.offsetof(SubmitRequestType, "frame_id"), requestLayout.handleSize + 8],
  ["submit.header_flags", koffi.offsetof(SubmitRequestType, "header_flags"), requestLayout.handleSize + 12],
  ["submit.view_id", koffi.offsetof(SubmitRequestType, "view_id"), requestLayout.handleSize + 16],
  ["submit.route_id", koffi.offsetof(SubmitRequestType, "route_id"), requestLayout.handleSize + 18],
  ["submit.trace_id", koffi.offsetof(SubmitRequestType, "trace_id"), requestLayout.submitTrace],
  ["submit.payload", koffi.offsetof(SubmitRequestType, "payload"), requestLayout.submitPayload],
  ["role_poll.size", koffi.sizeof(RoleEventPollRequestType), requestLayout.rolePollSize],
  ["role_poll.max_events", koffi.offsetof(RoleEventPollRequestType, "max_events"), requestLayout.handleSize],
  ["accept_begin.size", koffi.sizeof(ServerAcceptBeginRequestType), requestLayout.acceptTicketSize],
  ["accept_claim.size", koffi.sizeof(ServerAcceptClaimRequestType), requestLayout.acceptTicketSize],
  ["accept_wait.size", koffi.sizeof(ServerAcceptWaitRequestType), requestLayout.acceptWaitSize],
  ["accept_result.size", koffi.sizeof(ServerAcceptResultType), requestLayout.acceptWaitSize],
  ["runtime_frame.size", koffi.sizeof(RuntimeFrameSendRequestType), requestLayout.runtimeFrameSize],
  ["runtime_frame.message_type", koffi.offsetof(RuntimeFrameSendRequestType, "message_type"), requestLayout.handleSize],
  ["diagnostic.size", koffi.sizeof(DiagnosticType), diagnosticLayout.size],
  ["diagnostic.status", koffi.offsetof(DiagnosticType, "status"), 0],
  [
    "diagnostic.related_connection_id",
    koffi.offsetof(DiagnosticType, "related_connection_id"),
    diagnosticLayout.connection,
  ],
  ["diagnostic.related_session_id", koffi.offsetof(DiagnosticType, "related_session_id"), diagnosticLayout.session],
  [
    "diagnostic.related_operation_id",
    koffi.offsetof(DiagnosticType, "related_operation_id"),
    diagnosticLayout.operation,
  ],
  ["diagnostic.related_frame_id", koffi.offsetof(DiagnosticType, "related_frame_id"), diagnosticLayout.frame],
  ["header.size", koffi.sizeof(RuntimeFrameHeaderType), headerLayout.size],
  ["header.flags", koffi.offsetof(RuntimeFrameHeaderType, "flags"), headerLayout.flags],
  ["header.session_id", koffi.offsetof(RuntimeFrameHeaderType, "session_id"), headerLayout.session],
  ["header.frame_id", koffi.offsetof(RuntimeFrameHeaderType, "frame_id"), headerLayout.frame],
  ["header.view_id", koffi.offsetof(RuntimeFrameHeaderType, "view_id"), headerLayout.view],
  ["header.route_id", koffi.offsetof(RuntimeFrameHeaderType, "route_id"), headerLayout.route],
  ["header.trace_id", koffi.offsetof(RuntimeFrameHeaderType, "trace_id"), headerLayout.trace],
  ["event.size", koffi.sizeof(EventType), eventLayout.size],
  ["event.kind", koffi.offsetof(EventType, "kind"), 0],
  ["event.header", koffi.offsetof(EventType, "header"), eventLayout.header],
  ["event.connection", koffi.offsetof(EventType, "connection"), eventLayout.connection],
  ["event.session", koffi.offsetof(EventType, "session"), eventLayout.session],
  ["event.operation", koffi.offsetof(EventType, "operation"), eventLayout.operation],
  ["event.payload_owner", koffi.offsetof(EventType, "payload_owner"), eventLayout.owner],
  ["event.payload", koffi.offsetof(EventType, "payload"), eventLayout.payload],
  ["event.diagnostic", koffi.offsetof(EventType, "diagnostic"), eventLayout.diagnostic],
] as const;
const mismatch = layoutChecks.find(([, actual, expected]) => actual !== expected);
if (mismatch) {
  const [field, actual, expected] = mismatch;
  throw new Error(`${TRANSPORT_LABEL} native ABI layout mismatch for ${field}: expected ${expected}, got ${actual}.`);
}

export function selectNativeAbiLayout(pointerBytes: number, u64Align: number) {
  if (pointerBytes === 8 && u64Align === 8) {
    return {
      request: {
        handleSize: 24,
        handleId: 8,
        bufferSize: 16,
        bufferLength: 8,
        openSize: 64,
        openEndpoint: 8,
        openConfig: 24,
        openMaxPacket: 48,
        openReserved: 60,
        adoptionSize: 40,
        adoptionReserved: 12,
        adoptionTransport: 16,
        serverBindSize: 144,
        serverProfiles: 40,
        serverCacheObjects: 56,
        serverMaxCacheObjects: 72,
        serverSchemaRegistry: 104,
        serverApplicationPolicy: 128,
        sessionOpenSize: 88,
        sessionHandleId: 32,
        sessionGeneration: 40,
        sessionProfileId: 44,
        sessionSchemaId: 48,
        sessionCacheHints: 72,
        sessionResumeSize: 104,
        policyDecisionSize: 24,
        policyCompleteSize: 32,
        submitSize: 72,
        submitTrace: 48,
        submitPayload: 56,
        rolePollSize: 40,
        acceptTicketSize: 40,
        acceptWaitSize: 32,
        runtimeFrameSize: 48,
      },
      diagnostic: { size: 48, connection: 16, session: 24, operation: 32, frame: 40 },
      header: { size: 32, flags: 4, session: 8, frame: 12, view: 16, route: 18, trace: 24 },
      event: {
        size: 200,
        header: 8,
        connection: 40,
        session: 64,
        operation: 88,
        owner: 112,
        payload: 136,
        diagnostic: 152,
      },
    } as const;
  }
  if (pointerBytes === 4 && u64Align === 8) {
    return {
      request: {
        handleSize: 24,
        handleId: 8,
        bufferSize: 8,
        bufferLength: 4,
        openSize: 56,
        openEndpoint: 8,
        openConfig: 16,
        openMaxPacket: 40,
        openReserved: 52,
        adoptionSize: 40,
        adoptionReserved: 12,
        adoptionTransport: 16,
        serverBindSize: 120,
        serverProfiles: 40,
        serverCacheObjects: 48,
        serverMaxCacheObjects: 56,
        serverSchemaRegistry: 88,
        serverApplicationPolicy: 112,
        sessionOpenSize: 80,
        sessionHandleId: 32,
        sessionGeneration: 40,
        sessionProfileId: 44,
        sessionSchemaId: 48,
        sessionCacheHints: 72,
        sessionResumeSize: 88,
        policyDecisionSize: 16,
        policyCompleteSize: 24,
        submitSize: 64,
        submitTrace: 48,
        submitPayload: 56,
        rolePollSize: 40,
        acceptTicketSize: 40,
        acceptWaitSize: 32,
        runtimeFrameSize: 40,
      },
      diagnostic: { size: 48, connection: 16, session: 24, operation: 32, frame: 40 },
      header: { size: 32, flags: 4, session: 8, frame: 12, view: 16, route: 18, trace: 24 },
      event: {
        size: 192,
        header: 8,
        connection: 40,
        session: 64,
        operation: 88,
        owner: 112,
        payload: 136,
        diagnostic: 144,
      },
    } as const;
  }
  if (pointerBytes === 4 && u64Align === 4) {
    return {
      request: {
        handleSize: 20,
        handleId: 4,
        bufferSize: 8,
        bufferLength: 4,
        openSize: 52,
        openEndpoint: 8,
        openConfig: 16,
        openMaxPacket: 36,
        openReserved: 48,
        adoptionSize: 36,
        adoptionReserved: 12,
        adoptionTransport: 16,
        serverBindSize: 108,
        serverProfiles: 36,
        serverCacheObjects: 44,
        serverMaxCacheObjects: 52,
        serverSchemaRegistry: 80,
        serverApplicationPolicy: 100,
        sessionOpenSize: 72,
        sessionHandleId: 24,
        sessionGeneration: 32,
        sessionProfileId: 36,
        sessionSchemaId: 40,
        sessionCacheHints: 64,
        sessionResumeSize: 80,
        policyDecisionSize: 16,
        policyCompleteSize: 24,
        submitSize: 56,
        submitTrace: 40,
        submitPayload: 48,
        rolePollSize: 36,
        acceptTicketSize: 36,
        acceptWaitSize: 28,
        runtimeFrameSize: 36,
      },
      diagnostic: { size: 40, connection: 16, session: 24, operation: 28, frame: 36 },
      header: { size: 28, flags: 4, session: 8, frame: 12, view: 16, route: 18, trace: 20 },
      event: {
        size: 160,
        header: 4,
        connection: 32,
        session: 52,
        operation: 72,
        owner: 92,
        payload: 112,
        diagnostic: 120,
      },
    } as const;
  }
  throw new Error(`${TRANSPORT_LABEL} native ABI does not support pointer=${pointerBytes}, u64-align=${u64Align}.`);
}

interface NodeSymbols {
  readonly probe: NativeFunction;
  readonly connect: NativeFunction;
  readonly listen: NativeFunction;
  readonly listenerEndpoint: NativeFunction;
  readonly accept: NativeFunction;
  readonly writeBatch: NativeFunction;
  readonly readBatch: NativeFunction;
  readonly close: NativeFunction;
  readonly shutdownRuntime: NativeFunction;
  readonly releaseBuffer: NativeFunction;
  readonly createClientSecurity: NativeFunction;
  readonly createServerSecurity: NativeFunction;
  readonly clientConnect: NativeFunction;
  readonly clientOpenSession: NativeFunction;
  readonly sessionId: NativeFunction;
  readonly clientResumeSession: NativeFunction;
  readonly clientSessionRecoveryTicket: NativeFunction;
  readonly clientSubmit: NativeFunction;
  readonly clientAwaitEvents: NativeFunction;
  readonly clientClose: NativeFunction;
  readonly connectionClose: NativeFunction;
  readonly clientCloseConnection: NativeFunction;
  readonly serverBind: NativeFunction;
  readonly schemaRegistryCreate: NativeFunction;
  readonly schemaRegistryInstall: NativeFunction;
  readonly schemaRegistryRelease: NativeFunction;
  readonly serverPolicyComplete: NativeFunction;
  readonly serverAcceptBegin: NativeFunction;
  readonly serverAcceptWait: NativeFunction;
  readonly serverAcceptClaim: NativeFunction;
  readonly serverAcceptRelease: NativeFunction;
  readonly serverAwaitEvents: NativeFunction;
  readonly serverSendResult: NativeFunction;
  readonly serverClose: NativeFunction;
  readonly runtimeFrameSend: NativeFunction;
}

export function loadNodeWebSocketBinding(): NnrpNativeTransportBinding {
  const platform = nativePlatform(process.platform, process.arch);
  const manifestUrl = new URL(`../native/${platform.tag}/manifest.json`, import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as unknown;
  const libraryName = validateManifest(manifest, platform.os, platform.arch);
  const library = koffi.load(fileURLToPath(new URL(`../native/${platform.tag}/${libraryName}`, import.meta.url)));
  const symbols = bindSymbols(library);
  registerNodeRuntimeShutdown(symbols.shutdownRuntime);
  return new NodeTransportBinding(library, symbols);
}

class NodeTransportBinding implements NnrpNativeTransportBinding {
  readonly mode = "managed-ffi" as const;

  constructor(readonly library: LibraryHandle, readonly symbols: NodeSymbols) {}

  async probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics> {
    return await withEndpointSecurity(this.symbols, options, "client", async (config) => {
      const result: Partial<NativeProbeResult> = {};
      const status = await invoke<NativeStatus>(this.symbols.probe, [
        {
          open: openRequest(options, config),
          sample_count: boundedU32("sampleCount", options.sampleCount ?? 0),
          probe_payload_bytes: boundedU32("payloadBytes", options.payloadBytes ?? 0),
        },
        result,
      ]);
      assertStatus(status, "transport probe");
      return {
        sampleCount: requiredNumber(result.sample_count, "probe sample count"),
        successCount: requiredNumber(result.success_count, "probe success count"),
        medianThroughputBytesPerSecond: requiredBigInt(
          result.median_throughput_bytes_per_second,
          "probe throughput",
        ),
        medianRttMicroseconds: requiredBigInt(result.median_rtt_microseconds, "probe RTT"),
      };
    });
  }

  async connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection> {
    return await withEndpointSecurity(this.symbols, options, "client", async (config) => {
      const output: Partial<NativeHandle> = {};
      assertStatus(
        await invoke<NativeStatus>(this.symbols.connect, [openRequest(options, config), output]),
        "transport connect",
      );
      return new NodeTransportConnection(
        this.symbols,
        requiredHandle(output, HANDLE_KIND_CONNECTION),
        String(options.endpoint),
      );
    });
  }

  async listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer> {
    return await withEndpointSecurity(this.symbols, options, "server", async (config) => {
      const output: Partial<NativeHandle> = {};
      assertStatus(
        await invoke<NativeStatus>(this.symbols.listen, [openRequest(options, config), output]),
        "transport listen",
      );
      const handle = requiredHandle(output, HANDLE_KIND_LISTENER);
      try {
        return new NodeTransportServer(this.symbols, handle, await readListenerEndpoint(this.symbols, handle));
      } catch (error) {
        closeHandle(this.symbols, handle, "transport listener cleanup");
        throw error;
      }
    });
  }
}

class NodeTransportConnection implements NnrpTransportConnection {
  readonly kind = TRANSPORT_KIND;
  #closed = false;

  constructor(readonly symbols: NodeSymbols, readonly handle: NativeHandle, readonly endpoint: string) {}

  get connected(): boolean {
    return !this.#closed;
  }

  async send(packets: Uint8Array | readonly Uint8Array[]): Promise<void> {
    this.#requireOpen();
    const payloads = normalizePackets(packets).map((packet) => Buffer.from(packet));
    const frames = payloads.map((packet) => ({ ptr: packet, len: packet.byteLength }));
    assertStatus(
      await invoke<NativeStatus>(this.symbols.writeBatch, [{
        connection: this.handle,
        frames,
        frame_count: frames.length,
        flags: 0,
      }]),
      "transport write batch",
    );
  }

  async receive(options: NnrpTransportReceiveOptions = {}): Promise<readonly Uint8Array[]> {
    this.#requireOpen();
    const output: Partial<NativeFrameBatch> = {};
    assertStatus(
      await invoke<NativeStatus>(this.symbols.readBatch, [{
        connection: this.handle,
        max_frames: boundedU32("maxPackets", options.maxPackets ?? 0),
        timeout_ms: boundedU32("timeoutMillis", options.timeoutMillis ?? 0),
        max_bytes: boundedU64("maxBytes", options.maxBytes ?? 0n),
      }, output]),
      "transport read batch",
    );
    const owner = requiredHandle(output.payload_owner ?? {}, undefined);
    try {
      if (owner.kind !== HANDLE_KIND_INVALID && owner.kind !== HANDLE_KIND_BUFFER) {
        throw transportError("NNRP_NATIVE_OWNER_INVALID", `Transport returned owner handle kind ${owner.kind}.`);
      }
      const payload = output.payload;
      if (payload === undefined) {
        throw transportError("NNRP_NATIVE_BUFFER_INVALID", "Transport omitted its batch buffer.");
      }
      return decodePacketBatch(copyNativeBytes(payload), requiredNumber(output.frame_count, "batch frame count"));
    } finally {
      if (owner.kind === HANDLE_KIND_BUFFER) releaseBuffer(this.symbols, owner);
    }
  }

  async [CLIENT_ROLE_ADOPT](connectionId: bigint, generation: number): Promise<NodeClientRoleConnection> {
    this.#requireOpen();
    const output: Partial<NativeHandle> = {};
    assertStatus(
      await invoke<NativeStatus>(this.symbols.clientConnect, [{
        connection_id: connectionId,
        generation,
        reserved0: 0,
        transport_connection: this.handle,
      }, output]),
      "client role adoption",
    );
    this.#closed = true;
    return new NodeClientRoleConnection(this.symbols, requiredHandle(output));
  }

  close(): void {
    if (this.#closed) return;
    closeHandle(this.symbols, this.handle, "transport connection close");
    this.#closed = true;
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_CONNECTION_CLOSED", `${TRANSPORT_LABEL} connection is closed.`);
  }
}

class NodeTransportServer implements NnrpTransportServer {
  readonly kind = TRANSPORT_KIND;
  #closed = false;

  constructor(readonly symbols: NodeSymbols, readonly handle: NativeHandle, readonly endpoint: string) {}

  get listening(): boolean {
    return !this.#closed;
  }

  async accept(options: NnrpTransportAcceptOptions = {}): Promise<NnrpTransportConnection> {
    if (this.#closed) throw transportError("NNRP_LISTENER_CLOSED", `${TRANSPORT_LABEL} listener is closed.`);
    const output: Partial<NativeHandle> = {};
    assertStatus(
      await invoke<NativeStatus>(this.symbols.accept, [{
        listener: this.handle,
        timeout_ms: boundedU32("timeoutMillis", options.timeoutMillis ?? 0),
        reserved0: 0,
      }, output]),
      "transport accept",
    );
    return new NodeTransportConnection(this.symbols, requiredHandle(output, HANDLE_KIND_CONNECTION), this.endpoint);
  }

  async [SERVER_ROLE_ADOPT](
    serverId: bigint,
    generation: number,
    options: InternalServerRoleOptions,
  ): Promise<NodeServerRole> {
    if (this.#closed) throw transportError("NNRP_LISTENER_CLOSED", `${TRANSPORT_LABEL} listener is closed.`);
    const output: Partial<NativeHandle> = {};
    const profiles = Uint16Array.from(options.supportedProfiles);
    const cacheObjects = Uint32Array.from(options.supportedCacheObjects);
    const schemaRegistry = createNativeSchemaRegistry(this.symbols, options.schemaDescriptors);
    let policyCallback: bigint | undefined;
    try {
      policyCallback = registerNodeServerPolicy(this.symbols, options.evaluateSession);
      assertStatus(
        await invoke<NativeStatus>(this.symbols.serverBind, [{
          server_id: serverId,
          generation,
          reserved0: 0,
          transport_listener: this.handle,
          supported_profiles: { ptr: profiles, len: profiles.length },
          supported_cache_objects: { ptr: cacheObjects, len: cacheObjects.length },
          max_cache_objects: options.maxCacheObjects,
          max_cache_object_bytes: options.maxCacheObjectBytes,
          resume_token_bytes: options.resumeTokenBytes,
          max_in_flight_operations: options.maxInFlightOperations,
          granted_operation_credit: options.grantedOperationCredit,
          lease_ttl_ms: options.leaseTtlMs,
          resume_window_ms: options.resumeWindowMs,
          schema_registry: schemaRegistry,
          application_policy: {
            user_data: null,
            begin: policyCallback ?? null,
          },
        }, output]),
        "server role adoption",
      );
    } catch (error) {
      if (policyCallback !== undefined) koffi.unregister(policyCallback);
      throw error;
    } finally {
      assertStatus(this.symbols.schemaRegistryRelease(schemaRegistry) as NativeStatus, "schema registry release");
    }
    this.#closed = true;
    return new NodeServerRole(this.symbols, requiredHandle(output), policyCallback);
  }

  close(): void {
    if (this.#closed) return;
    closeHandle(this.symbols, this.handle, "transport listener close");
    this.#closed = true;
  }
}

class NodeClientRoleConnection {
  #closed = false;

  constructor(readonly symbols: NodeSymbols, readonly handle: NativeHandle) {}

  async openSession(options: InternalClientSessionOpenOptions): Promise<NodeClientRoleSession> {
    this.#requireOpen();
    const cacheHints = Uint32Array.from(options.cacheHints);
    const output: Partial<NativeHandle> = {};
    assertStatus(
      await invoke<NativeStatus>(this.symbols.clientOpenSession, [
        nativeSessionOpenRequest(this.handle, options, cacheHints),
        output,
      ]),
      "client session open",
    );
    const handle = requiredHandle(output);
    return new NodeClientRoleSession(this.symbols, handle, readNodeSessionId(this.symbols, handle));
  }

  async resumeSession(
    options: InternalClientSessionOpenOptions,
    recoveryTicket: Uint8Array,
  ): Promise<NodeClientRoleSession> {
    this.#requireOpen();
    const cacheHints = Uint32Array.from(options.cacheHints);
    const ticket = Buffer.from(recoveryTicket);
    const output: Partial<NativeHandle> = {};
    const outcome: Record<string, number> = {};
    assertStatus(
      await invoke<NativeStatus>(this.symbols.clientResumeSession, [
        {
          open: nativeSessionOpenRequest(this.handle, options, cacheHints),
          recovery_ticket: { ptr: ticket, len: ticket.byteLength },
        },
        output,
        outcome,
      ]),
      "client session resume",
    );
    const handle = requiredHandle(output);
    return new NodeClientRoleSession(this.symbols, handle, readNodeSessionId(this.symbols, handle));
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    assertStatus(
      await invoke<NativeStatus>(this.symbols.clientCloseConnection, [this.handle]),
      "client connection close",
    );
    this.#closed = true;
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_CLIENT_CONNECTION_CLOSED", "Native client role connection is closed.");
  }
}

class NodeClientRoleSession {
  #closed = false;

  constructor(
    readonly symbols: NodeSymbols,
    readonly handle: NativeHandle,
    readonly sessionId: number,
  ) {}

  async submit(
    operationId: bigint,
    frameId: number,
    headerFlags: number,
    viewId: number,
    routeId: number,
    traceId: bigint,
    payload: Uint8Array,
  ): Promise<NativeHandle> {
    this.#requireOpen();
    const body = Buffer.from(payload);
    const output: Partial<NativeHandle> = {};
    assertStatus(
      await invoke<NativeStatus>(this.symbols.clientSubmit, [{
        session: this.handle,
        operation_id: operationId,
        frame_id: frameId,
        header_flags: headerFlags,
        view_id: viewId,
        route_id: routeId,
        trace_id: traceId,
        payload: { ptr: body, len: body.byteLength },
      }, output]),
      "client submit",
    );
    return requiredHandle(output);
  }

  async poll(maxEvents: number, timeoutMillis: number): Promise<readonly InternalRoleEvent[]> {
    this.#requireOpen();
    return await pollRoleEvents(this.symbols, "client", this.handle, maxEvents, timeoutMillis);
  }

  async sendRuntimeFrame(messageType: number, frameId: number, payload: Uint8Array): Promise<void> {
    this.#requireOpen();
    const body = Buffer.from(payload);
    assertStatus(
      await invoke<NativeStatus>(this.symbols.runtimeFrameSend, [{
        handle: this.handle,
        message_type: messageType,
        frame_id: frameId,
        payload: { ptr: body, len: body.byteLength },
      }]),
      "client runtime frame send",
    );
  }

  recoveryTicket(): Uint8Array | undefined {
    this.#requireOpen();
    const ownerOutput: Partial<NativeHandle> = {};
    const ticketOutput: Partial<NativeBufferView> = {};
    const status = this.symbols.clientSessionRecoveryTicket(this.handle, ownerOutput, ticketOutput) as NativeStatus;
    if (status.status_code === 4) return undefined;
    assertStatus(status, "client recovery ticket snapshot");
    const owner = requiredHandle(ownerOutput, HANDLE_KIND_BUFFER);
    try {
      return copyNativeBytes(ticketOutput as NativeBufferView);
    } finally {
      releaseBuffer(this.symbols, owner);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    assertStatus(await invoke<NativeStatus>(this.symbols.clientClose, [this.handle]), "client session close");
    this.#closed = true;
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_CLIENT_SESSION_CLOSED", "Native client role session is closed.");
  }
}

function createNativeSchemaRegistry(
  symbols: NodeSymbols,
  descriptors: readonly NnrpSchemaDescriptorHeader[],
): NativeHandle {
  const output: Partial<NativeHandle> = {};
  assertStatus(symbols.schemaRegistryCreate(output) as NativeStatus, "schema registry create");
  const registry = requiredHandle(output);
  try {
    for (const descriptor of descriptors) {
      const action = new Uint32Array(1);
      assertStatus(
        symbols.schemaRegistryInstall(registry, nativeSchemaDescriptor(descriptor), action) as NativeStatus,
        "schema registry install",
      );
    }
    return registry;
  } catch (error) {
    assertStatus(symbols.schemaRegistryRelease(registry) as NativeStatus, "schema registry release");
    throw error;
  }
}

function nativeSessionOpenRequest(
  connection: NativeHandle,
  options: InternalClientSessionOpenOptions,
  cacheHints: Uint32Array,
): Record<string, unknown> {
  return {
    connection,
    requested_session_id: options.requestedSessionId,
    session_handle_id: options.sessionHandleId,
    generation: options.generation,
    profile_id: options.profileId,
    priority_class: options.priorityClass,
    allow_resume: options.allowResume ? 1 : 0,
    schema_id: options.schemaId,
    schema_version: options.schemaVersion,
    default_deadline_ms: options.defaultDeadlineMillis,
    max_in_flight_operations: options.maxInFlightOperations,
    reserved0: 0,
    lease_ttl_hint_ms: options.leaseTtlHintMillis,
    resume_token_bytes: options.resumeTokenBytes,
    cache_hints: { ptr: cacheHints, len: cacheHints.length },
  };
}

function nativeSchemaDescriptor(descriptor: NnrpSchemaDescriptorHeader): Record<string, number | bigint> {
  return {
    schema_id: descriptor.schemaId,
    schema_version: descriptor.schemaVersion,
    profile_id: descriptor.profileId,
    schema_flags: descriptor.schemaFlags,
    min_version_major: descriptor.minVersionMajor,
    max_version_major: descriptor.maxVersionMajor,
    reserved0: 0,
    body_bytes: descriptor.bodyBytes,
    dependency_count: descriptor.dependencyCount,
    default_stream_semantics: descriptor.defaultStreamSemantics,
    schema_hash: descriptor.schemaHash,
  };
}

function registerNodeServerPolicy(
  symbols: NodeSymbols,
  evaluateSession: InternalServerRoleOptions["evaluateSession"],
): bigint | undefined {
  if (evaluateSession === undefined) return undefined;
  return koffi.register((_userData: unknown, requestId: bigint | number, metadata: NativeBufferView) => {
    let evaluation: Promise<InternalServerPolicyDecision>;
    try {
      evaluation = evaluateSession(decodeSessionOpenMetadata(copyNativeBytes(metadata)));
    } catch (error) {
      evaluation = Promise.reject(error);
    }
    void evaluation.then(
      (decision) => completeNodeServerPolicy(symbols, BigInt(requestId), decision),
      (error) =>
        completeNodeServerPolicy(symbols, BigInt(requestId), {
          accepted: false,
          sessionErrorCode: 0x0001_0007,
          diagnostic: error instanceof Error ? error.message : "Application policy evaluation failed.",
        }),
    );
    return 0;
  }, koffi.pointer(ServerPolicyBeginCallbackType));
}

function completeNodeServerPolicy(
  symbols: NodeSymbols,
  requestId: bigint,
  decision: InternalServerPolicyDecision,
): void {
  const diagnostic = Buffer.from(new TextEncoder().encode(decision.diagnostic ?? ""));
  assertStatus(
    symbols.serverPolicyComplete({
      request_id: requestId,
      decision: {
        accepted: decision.accepted ? 1 : 0,
        reserved0: [0, 0, 0],
        session_error_code: decision.sessionErrorCode,
        diagnostic: { ptr: diagnostic, len: diagnostic.byteLength },
      },
    }) as NativeStatus,
    "server policy completion",
  );
}

class NodeServerRole {
  #closed = false;
  readonly #accepts = new Map<string, NativeHandle>();

  constructor(
    readonly symbols: NodeSymbols,
    readonly handle: NativeHandle,
    readonly policyCallback: bigint | undefined,
  ) {}

  async accept(sessionHandleId: bigint, generation: number, timeoutMillis: number): Promise<NodeServerRoleSession> {
    this.#requireOpen();
    const beginOutput: Partial<NativeHandle> = {};
    assertStatus(
      this.symbols.serverAcceptBegin({
        server: this.handle,
        accept_handle_id: sessionHandleId,
        generation,
        reserved0: 0,
      }, beginOutput) as NativeStatus,
      "server session accept begin",
    );
    const accept = requiredHandle(beginOutput, HANDLE_KIND_SERVER_ACCEPT);
    const acceptKey = handleKey(accept);
    this.#accepts.set(acceptKey, accept);
    try {
      while (true) {
        const status = await invoke<NativeStatus>(this.symbols.serverAcceptWait, [{
          accept,
          timeout_ms: timeoutMillis,
          flags: 0,
        }]);
        if (timeoutMillis === 0 && status.status_code === 5) continue;
        assertStatus(status, "server session accept wait");
        break;
      }
      const output: Partial<NativeServerAcceptResult> = {};
      assertStatus(
        this.symbols.serverAcceptClaim({
          accept,
          session_handle_id: sessionHandleId,
          generation,
          reserved0: 0,
        }, output) as NativeStatus,
        "server session accept claim",
      );
      this.#accepts.delete(acceptKey);
      const handle = requiredHandle(output.session ?? {});
      return new NodeServerRoleSession(this.symbols, handle, readNodeSessionId(this.symbols, handle));
    } finally {
      if (this.#accepts.delete(acceptKey)) {
        assertStatus(this.symbols.serverAcceptRelease(accept) as NativeStatus, "server session accept release");
      }
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    for (const accept of this.#accepts.values()) {
      assertStatus(this.symbols.serverAcceptRelease(accept) as NativeStatus, "server session accept release");
    }
    this.#accepts.clear();
    try {
      assertStatus(await invoke<NativeStatus>(this.symbols.connectionClose, [this.handle]), "server close");
    } finally {
      if (this.policyCallback !== undefined) koffi.unregister(this.policyCallback);
    }
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_SERVER_CLOSED", "Native server role is closed.");
  }
}

class NodeServerRoleSession {
  #closed = false;

  constructor(
    readonly symbols: NodeSymbols,
    readonly handle: NativeHandle,
    readonly sessionId: number,
  ) {}

  async poll(maxEvents: number, timeoutMillis: number): Promise<readonly InternalRoleEvent[]> {
    this.#requireOpen();
    return await pollRoleEvents(this.symbols, "server", this.handle, maxEvents, timeoutMillis);
  }

  async sendResult(operation: NativeHandle, payload: Uint8Array): Promise<void> {
    this.#requireOpen();
    const body = Buffer.from(payload);
    assertStatus(
      await invoke<NativeStatus>(this.symbols.serverSendResult, [{
        operation,
        payload: { ptr: body, len: body.byteLength },
      }]),
      "server result send",
    );
  }

  async sendRuntimeFrame(messageType: number, frameId: number, payload: Uint8Array): Promise<void> {
    this.#requireOpen();
    const body = Buffer.from(payload);
    assertStatus(
      await invoke<NativeStatus>(this.symbols.runtimeFrameSend, [{
        handle: this.handle,
        message_type: messageType,
        frame_id: frameId,
        payload: { ptr: body, len: body.byteLength },
      }]),
      "server runtime frame send",
    );
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    assertStatus(await invoke<NativeStatus>(this.symbols.serverClose, [this.handle]), "server session close");
    this.#closed = true;
  }

  #requireOpen(): void {
    if (this.#closed) throw transportError("NNRP_SERVER_SESSION_CLOSED", "Native server role session is closed.");
  }
}

async function pollRoleEvents(
  symbols: NodeSymbols,
  role: "client" | "server",
  scope: NativeHandle,
  maxEvents: number,
  timeoutMillis: number,
): Promise<readonly InternalRoleEvent[]> {
  if (maxEvents === 0) return [];
  const nativeEvents = koffi.alloc(EventType, maxEvents);
  const nativeCount = koffi.alloc("size_t", 1);
  try {
    const status = await invoke<NativeStatus>(
      role === "client" ? symbols.clientAwaitEvents : symbols.serverAwaitEvents,
      [
        {
          scope,
          max_events: maxEvents,
          timeout_ms: timeoutMillis,
          flags: 0,
          reserved0: 0,
        },
        nativeEvents,
        maxEvents,
        nativeCount,
      ],
    );
    if (status.status_code === 5) return [];
    assertStatus(status, `${role} event poll`);
    const count = requiredNumber(koffi.decode(nativeCount, "size_t"), "event count");
    const decoded = koffi.decode(nativeEvents, EventType, count) as NativeEvent[];
    return decoded.map((event) => copyRoleEvent(symbols, event));
  } finally {
    koffi.free(nativeCount);
    koffi.free(nativeEvents);
  }
}

function copyRoleEvent(symbols: NodeSymbols, event: NativeEvent): InternalRoleEvent {
  const owner = requiredHandle(event.payload_owner);
  try {
    return {
      kind: event.kind,
      headerPresent: event.header.present !== 0,
      messageType: event.header.message_type,
      versionMajor: event.header.version_major,
      wireFormat: event.header.wire_format,
      headerFlags: event.header.flags,
      wireSessionId: event.header.session_id,
      connection: requiredHandle(event.connection),
      session: requiredHandle(event.session),
      operation: requiredHandle(event.operation),
      relatedOperationId: requiredBigInt(event.diagnostic.related_operation_id, "related operation id"),
      relatedFrameId: event.diagnostic.related_frame_id,
      frameId: event.header.frame_id,
      viewId: event.header.view_id,
      routeId: event.header.route_id,
      traceId: requiredBigInt(event.header.trace_id, "trace id"),
      payload: copyNativeBytes(event.payload),
    };
  } finally {
    if (owner.kind === HANDLE_KIND_BUFFER) releaseBuffer(symbols, owner);
  }
}

function bindSymbols(library: LibraryHandle): NodeSymbols {
  const outHandle = koffi.out(koffi.pointer(HandleType));
  return {
    probe: library.func("nnrp_transport_probe", StatusType, [
      ProbeRequestType,
      koffi.out(koffi.pointer(ProbeResultType)),
    ]),
    connect: library.func("nnrp_transport_connect", StatusType, [OpenRequestType, outHandle]),
    listen: library.func("nnrp_transport_listen", StatusType, [OpenRequestType, outHandle]),
    listenerEndpoint: library.func("nnrp_transport_listener_endpoint", StatusType, [
      HandleType,
      outHandle,
      koffi.out(koffi.pointer(BufferViewType)),
    ]),
    accept: library.func("nnrp_transport_accept", StatusType, [AcceptRequestType, outHandle]),
    writeBatch: library.func("nnrp_transport_write_batch", StatusType, [WriteBatchRequestType]),
    readBatch: library.func("nnrp_transport_read_batch", StatusType, [
      ReadBatchRequestType,
      koffi.out(koffi.pointer(FrameBatchType)),
    ]),
    close: library.func("nnrp_transport_close", StatusType, [HandleType]),
    shutdownRuntime: library.func("nnrp_transport_runtime_shutdown", StatusType, []),
    releaseBuffer: library.func("nnrp_buffer_release", StatusType, [HandleType]),
    createClientSecurity: library.func("nnrp_transport_client_security_config_create", StatusType, [
      SecurityConfigRequestType,
      outHandle,
    ]),
    createServerSecurity: library.func("nnrp_transport_server_security_config_create", StatusType, [
      SecurityConfigRequestType,
      outHandle,
    ]),
    clientConnect: library.func("nnrp_client_connect", StatusType, [ClientConnectRequestType, outHandle]),
    clientOpenSession: library.func("nnrp_client_open_session", StatusType, [SessionOpenRequestType, outHandle]),
    sessionId: library.func("nnrp_session_id", StatusType, [HandleType, koffi.out(koffi.pointer("uint32_t"))]),
    clientResumeSession: library.func("nnrp_client_resume_session", StatusType, [
      SessionResumeRequestType,
      outHandle,
      koffi.out(koffi.pointer(SessionRecoveryOutcomeType)),
    ]),
    clientSessionRecoveryTicket: library.func("nnrp_client_session_recovery_ticket", StatusType, [
      HandleType,
      outHandle,
      koffi.out(koffi.pointer(BufferViewType)),
    ]),
    clientSubmit: library.func("nnrp_client_submit", StatusType, [SubmitRequestType, outHandle]),
    clientAwaitEvents: library.func("nnrp_client_await_events", StatusType, [
      RoleEventPollRequestType,
      koffi.pointer(EventType),
      "size_t",
      koffi.out(koffi.pointer("size_t")),
    ]),
    clientClose: library.func("nnrp_client_close", StatusType, [HandleType]),
    connectionClose: library.func("nnrp_connection_close", StatusType, [HandleType]),
    clientCloseConnection: library.func("nnrp_client_close_connection", StatusType, [HandleType]),
    serverBind: library.func("nnrp_server_bind", StatusType, [ServerBindRequestType, outHandle]),
    schemaRegistryCreate: library.func("nnrp_schema_registry_create", StatusType, [outHandle]),
    schemaRegistryInstall: library.func("nnrp_schema_registry_install", StatusType, [
      HandleType,
      SchemaDescriptorHeaderType,
      koffi.pointer("uint32_t"),
    ]),
    schemaRegistryRelease: library.func("nnrp_schema_registry_release", StatusType, [HandleType]),
    serverPolicyComplete: library.func("nnrp_server_policy_complete", StatusType, [ServerPolicyCompleteRequestType]),
    serverAcceptBegin: library.func("nnrp_server_accept_begin", StatusType, [ServerAcceptBeginRequestType, outHandle]),
    serverAcceptWait: library.func("nnrp_server_accept_wait", StatusType, [ServerAcceptWaitRequestType]),
    serverAcceptClaim: library.func("nnrp_server_accept_claim", StatusType, [
      ServerAcceptClaimRequestType,
      koffi.out(koffi.pointer(ServerAcceptResultType)),
    ]),
    serverAcceptRelease: library.func("nnrp_server_accept_release", StatusType, [HandleType]),
    serverAwaitEvents: library.func("nnrp_server_await_events", StatusType, [
      RoleEventPollRequestType,
      koffi.pointer(EventType),
      "size_t",
      koffi.out(koffi.pointer("size_t")),
    ]),
    serverSendResult: library.func("nnrp_server_send_result", StatusType, [ServerSendResultRequestType]),
    serverClose: library.func("nnrp_server_close", StatusType, [HandleType]),
    runtimeFrameSend: library.func("nnrp_runtime_frame_send", StatusType, [RuntimeFrameSendRequestType]),
  };
}

function openRequest(options: NnrpTransportEndpoint, config: NativeHandle): Record<string, unknown> {
  const endpoint = Buffer.from(nativeEndpoint(options.endpoint));
  if (endpoint.byteLength === 0) throw transportError("NNRP_ENDPOINT_INVALID", `${TRANSPORT_LABEL} endpoint is empty.`);
  return {
    transport_id: TRANSPORT_ID,
    flags: 0,
    endpoint: { ptr: endpoint, len: endpoint.byteLength },
    config,
    max_packet_bytes: boundedU64("maxPacketBytes", options.maxPacketBytes ?? 0n),
    timeout_ms: boundedU32("timeoutMillis", options.timeoutMillis ?? 0),
    reserved0: 0,
  };
}

function nativeEndpoint(endpoint: string | URL): string {
  return String(endpoint).trim();
}

async function readListenerEndpoint(symbols: NodeSymbols, listener: NativeHandle): Promise<string> {
  const ownerOutput: Partial<NativeHandle> = {};
  const endpointOutput: Partial<NativeBufferView> = {};
  assertStatus(
    await invoke<NativeStatus>(symbols.listenerEndpoint, [listener, ownerOutput, endpointOutput]),
    "transport listener endpoint",
  );
  const owner = requiredHandle(ownerOutput);
  try {
    if (owner.kind !== HANDLE_KIND_INVALID && owner.kind !== HANDLE_KIND_BUFFER) {
      throw transportError("NNRP_NATIVE_OWNER_INVALID", `Transport returned owner handle kind ${owner.kind}.`);
    }
    return new TextDecoder().decode(copyNativeBytes(endpointOutput as NativeBufferView));
  } finally {
    if (owner.kind === HANDLE_KIND_BUFFER) releaseBuffer(symbols, owner);
  }
}

async function withEndpointSecurity<T>(
  symbols: NodeSymbols,
  options: NnrpTransportEndpoint,
  mode: "client" | "server",
  operation: (config: NativeHandle) => Promise<T>,
): Promise<T> {
  const protocol = new URL(options.endpoint).protocol;
  if (protocol === "ws:") {
    if (options.security !== undefined) {
      throw transportError("NNRP_SECURITY_INVALID", "ws:// endpoints reject security configuration.");
    }
    return await operation(invalidHandle());
  }
  if (protocol !== "wss:") {
    throw transportError("NNRP_ENDPOINT_INVALID", "WebSocket endpoints require ws:// or wss://.");
  }
  const config = createSecurityConfig(symbols, options, mode);
  try {
    return await operation(config);
  } finally {
    closeHandle(symbols, config, "transport security config close");
  }
}

function createSecurityConfig(
  symbols: NodeSymbols,
  options: NnrpTransportEndpoint,
  mode: "client" | "server",
): NativeHandle {
  const security = options.security;
  if (security === undefined || security.mode !== mode) {
    throw transportError(
      "NNRP_SECURITY_REQUIRED",
      `${TRANSPORT_LABEL} ${mode} requires ${mode} security configuration.`,
    );
  }
  const first = Buffer.from(
    security.mode === "client" ? new TextEncoder().encode(security.serverName) : security.certificateDer,
  );
  const second = Buffer.from(security.mode === "client" ? security.trustedCertificateDer : security.privateKeyPkcs8Der);
  if (first.byteLength === 0 || second.byteLength === 0) {
    throw transportError("NNRP_SECURITY_INVALID", `${TRANSPORT_LABEL} ${mode} security fields must be non-empty.`);
  }
  const output: Partial<NativeHandle> = {};
  const fn = mode === "client" ? symbols.createClientSecurity : symbols.createServerSecurity;
  assertStatus(
    fn({
      transport_id: TRANSPORT_ID,
      flags: 0,
      first: { ptr: first, len: first.byteLength },
      second: { ptr: second, len: second.byteLength },
    }, output) as NativeStatus,
    `transport ${mode} security config create`,
  );
  return requiredHandle(output, HANDLE_KIND_SECURITY_CONFIG);
}

function normalizePackets(packets: Uint8Array | readonly Uint8Array[]): readonly Uint8Array[] {
  const values = packets instanceof Uint8Array ? [packets] : packets;
  if (values.length === 0 || values.some((packet) => !(packet instanceof Uint8Array) || packet.byteLength === 0)) {
    throw new TypeError("transport send requires one or more non-empty complete NNRP packets");
  }
  return values;
}

function decodePacketBatch(payload: Uint8Array, frameCount: number): readonly Uint8Array[] {
  const packets: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; index < frameCount; index++) {
    if (offset + 4 > payload.byteLength) throw transportError("NNRP_BATCH_INVALID", "Packet batch is truncated.");
    const length = new DataView(payload.buffer, payload.byteOffset + offset, 4).getUint32(0, true);
    offset += 4;
    if (offset + length > payload.byteLength) {
      throw transportError("NNRP_BATCH_INVALID", "Packet payload is truncated.");
    }
    packets.push(payload.slice(offset, offset + length));
    offset += length;
  }
  if (offset !== payload.byteLength) throw transportError("NNRP_BATCH_INVALID", "Packet batch has trailing bytes.");
  return packets;
}

function copyNativeBytes(view: NativeBufferView): Uint8Array {
  const length = Number(view.len);
  if (length === 0) return new Uint8Array();
  if (view.ptr == null || !Number.isSafeInteger(length) || length < 0) {
    throw transportError("NNRP_NATIVE_BUFFER_INVALID", "Transport returned an invalid native buffer view.");
  }
  return new Uint8Array(koffi.view(view.ptr, length)).slice();
}

function requiredHandle(value: Partial<NativeHandle>, expectedKind?: number): NativeHandle {
  const handle = {
    kind: requiredNumber(value.kind, "handle kind"),
    id: requiredBigInt(value.id, "handle id"),
    generation: requiredNumber(value.generation, "handle generation"),
    flags: requiredNumber(value.flags, "handle flags"),
  };
  if (expectedKind !== undefined && (handle.kind !== expectedKind || handle.id === 0n || handle.generation === 0)) {
    throw transportError(
      "NNRP_NATIVE_HANDLE_INVALID",
      `Expected native handle kind ${expectedKind}, got ${handle.kind}.`,
    );
  }
  return handle;
}

function readNodeSessionId(symbols: NodeSymbols, session: NativeHandle): number {
  const output = new Uint32Array(1);
  assertStatus(symbols.sessionId(session, output) as NativeStatus, "negotiated session id");
  return output[0]!;
}

function handleKey(handle: NativeHandle): string {
  return `${handle.kind}:${BigInt(handle.id).toString()}:${handle.generation}`;
}

function invalidHandle(): NativeHandle {
  return { kind: HANDLE_KIND_INVALID, id: 0n, generation: 0, flags: 0 };
}

function releaseBuffer(symbols: NodeSymbols, owner: NativeHandle): void {
  assertStatus(symbols.releaseBuffer(owner) as NativeStatus, "transport buffer release");
}

function closeHandle(symbols: NodeSymbols, handle: NativeHandle, operation: string): void {
  assertStatus(symbols.close(handle) as NativeStatus, operation);
}

function assertStatus(status: NativeStatus, operation: string): void {
  if (status.status_code !== 0) {
    throw transportError(
      "NNRP_FFI_STATUS_ERROR",
      `${operation} failed with status=${status.status_code}, family=${status.error_family}, protocol=${status.protocol_error_code}, detail=${status.detail_code}.`,
      status.status_code === 5 || status.status_code === 6,
    );
  }
}

function invoke<T>(fn: NativeFunction, args: readonly unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    fn.async(...args, (error: unknown, result: T) => error == null ? resolve(result) : reject(error));
  });
}

const nodeRuntimeShutdowns = new Set<NativeFunction>();
let nodeRuntimeShutdownRegistered = false;

function registerNodeRuntimeShutdown(shutdown: NativeFunction): void {
  nodeRuntimeShutdowns.add(shutdown);
  if (nodeRuntimeShutdownRegistered) return;
  nodeRuntimeShutdownRegistered = true;
  process.once("exit", () => {
    for (const shutdownRuntime of nodeRuntimeShutdowns) {
      try {
        const status = shutdownRuntime() as NativeStatus;
        if (status.status_code !== 0) {
          process.stderr.write(
            `${TRANSPORT_LABEL} native runtime shutdown failed with status ${status.status_code}.\n`,
          );
        }
      } catch (error) {
        process.stderr.write(`${TRANSPORT_LABEL} native runtime shutdown threw: ${String(error)}.\n`);
      }
    }
  });
}

function validateManifest(value: unknown, os: string, arch: string): string {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${TRANSPORT_LABEL} native artifact manifest is not an object.`);
  }
  const manifest = value as Record<string, unknown>;
  if (manifest.package !== PACKAGE_NAME || manifest.transport_scope !== TRANSPORT_SCOPE) {
    throw new Error(`${TRANSPORT_LABEL} package contains an artifact for another transport scope.`);
  }
  if (manifest.abi_version !== ABI_VERSION) throw new Error(`${TRANSPORT_LABEL} artifact requires ABI ${ABI_VERSION}.`);
  if (manifest.os !== os || manifest.arch !== arch || manifest.library_kind !== "dynamic") {
    throw new Error(`${TRANSPORT_LABEL} artifact does not match ${os}/${arch} dynamic loading.`);
  }
  if (typeof manifest.library !== "string" || !/^[A-Za-z0-9_.-]+$/u.test(manifest.library)) {
    throw new Error(`${TRANSPORT_LABEL} artifact manifest has an invalid library name.`);
  }
  if (typeof manifest.source_archive_sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(manifest.source_archive_sha256)) {
    throw new Error(`${TRANSPORT_LABEL} artifact manifest has invalid checksum metadata.`);
  }
  const exports = Array.isArray(manifest.exports) ? manifest.exports : [];
  const required = [
    "nnrp_transport_probe",
    "nnrp_transport_connect",
    "nnrp_transport_listen",
    "nnrp_transport_listener_endpoint",
    "nnrp_transport_accept",
    "nnrp_transport_write_batch",
    "nnrp_transport_read_batch",
    "nnrp_transport_close",
    "nnrp_transport_runtime_shutdown",
    "nnrp_session_id",
    "nnrp_server_accept_begin",
    "nnrp_server_accept_wait",
    "nnrp_server_accept_claim",
    "nnrp_server_accept_release",
  ];
  const missing = required.filter((name) => !exports.includes(name));
  if (missing.length > 0) {
    throw new Error(`${TRANSPORT_LABEL} artifact is missing transport exports: ${missing.join(", ")}.`);
  }
  return manifest.library;
}

function nativePlatform(platform: string, archValue: string): { tag: string; os: string; arch: string } {
  const os = platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform;
  const arch = archValue === "x64"
    ? "x86_64"
    : archValue === "ia32"
    ? "x86"
    : archValue === "arm64"
    ? "aarch64"
    : archValue;
  if (!(["windows", "macos", "linux"] as const).includes(os as "windows" | "macos" | "linux")) {
    throw new Error(`${TRANSPORT_LABEL} Node FFI does not support ${platform}.`);
  }
  if (!(["x86_64", "x86", "aarch64", "armv7"] as const).includes(arch as "x86_64" | "x86" | "aarch64" | "armv7")) {
    throw new Error(`${TRANSPORT_LABEL} Node FFI does not support ${archValue}.`);
  }
  return { tag: `${os}-${arch}`, os, arch };
}

function boundedU32(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${name} must fit u32`);
  return value;
}

function boundedU64(name: string, value: bigint): bigint {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new RangeError(`${name} must fit u64`);
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw transportError("NNRP_NATIVE_RESULT_INVALID", `Native ${label} is invalid.`);
  }
  return value;
}

function requiredBigInt(value: unknown, label: string): bigint {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw transportError("NNRP_NATIVE_RESULT_INVALID", `Native ${label} is invalid.`);
    }
    return BigInt(value);
  }
  if (typeof value !== "bigint" || value < 0n) {
    throw transportError("NNRP_NATIVE_RESULT_INVALID", `Native ${label} is invalid.`);
  }
  return value;
}

function transportError(code: string, message: string, retryable = false): NnrpTransportError {
  return new NnrpTransportError({
    code: `${code}_${TRANSPORT_SCOPE.toUpperCase()}`,
    message,
    source: "transport",
    retryable,
    transport: TRANSPORT_KIND,
  });
}
