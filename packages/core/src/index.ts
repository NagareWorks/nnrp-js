export const NNRP_PROTOCOL_NAME = "NNRP";
export const NNRP_PROTOCOL_VERSION = "1.0.0";
export const NNRP_TYPED_PAYLOAD_DESCRIPTOR_BYTES = 24;
export const NNRP_SESSION_OPEN_METADATA_BYTES = 48;
export const NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES = 28;
export const NNRP_SCHEMA_DESCRIPTOR_HEADER_BYTES = 32;
export const NNRP_STANDARD_PROFILE_TOKEN = 2;
export const NNRP_TOKEN_DELTA_SCHEMA_ID = 0x0000_1001;
export const NNRP_TOKEN_DELTA_SCHEMA_VERSION = 3;
export const NNRP_TOKEN_DELTA_SCHEMA_HASH = 0x6e6e_7270_746f_6b33n;

export enum NnrpStandardProfile {
  Unspecified = 0,
  Tensor = 1,
  Token = 2,
}

export enum NnrpStreamSemantics {
  Unspecified = 0,
  Snapshot = 1,
  Append = 2,
}

export enum NnrpSchemaDescriptorFlags {
  None = 0,
  BreakingChange = 0x01,
  CompatibleUpdate = 0x02,
  DependencyBound = 0x04,
  BodySchemaPresent = 0x08,
}

export enum NnrpSchemaRegistryAction {
  Installed = 1,
  AlreadyInstalled = 2,
  Updated = 3,
  Invalidated = 4,
}

export enum NnrpSchemaRegistryFailure {
  Unknown = 1,
  VersionUnknown = 2,
  HashConflict = 3,
  Incompatible = 4,
  UpdateRejected = 5,
}

export interface NnrpSchemaDescriptorHeader {
  readonly schemaId: number;
  readonly schemaVersion: number;
  readonly profileId: NnrpStandardProfile | number;
  readonly schemaFlags: NnrpSchemaDescriptorFlags | number;
  readonly minVersionMajor: number;
  readonly maxVersionMajor: number;
  readonly bodyBytes: number;
  readonly dependencyCount: number;
  readonly defaultStreamSemantics: NnrpStreamSemantics | number;
  readonly schemaHash: bigint;
}

export class NnrpSchemaRegistry {
  readonly #descriptors = new Map<string, NnrpSchemaDescriptorHeader>();

  public constructor(descriptors: readonly NnrpSchemaDescriptorHeader[] = []) {
    for (const descriptor of descriptors) this.install(descriptor);
  }

  public install(descriptor: NnrpSchemaDescriptorHeader): NnrpSchemaRegistryAction {
    const normalized = normalizeSchemaDescriptorHeader(descriptor);
    validateStandardProfile(normalized.profileId);
    const key = schemaDescriptorKey(normalized.schemaId, normalized.schemaVersion);
    const existing = this.#descriptors.get(key);
    if (existing !== undefined) {
      if (existing.schemaHash === normalized.schemaHash && existing.profileId === normalized.profileId) {
        return NnrpSchemaRegistryAction.AlreadyInstalled;
      }
      throw schemaRegistryError(NnrpSchemaRegistryFailure.HashConflict, "schema hash conflict for installed version");
    }
    const updatesExistingSchema = [...this.#descriptors.values()].some((candidate) =>
      candidate.schemaId === normalized.schemaId && candidate.schemaVersion < normalized.schemaVersion
    );
    this.#descriptors.set(key, normalized);
    return updatesExistingSchema ? NnrpSchemaRegistryAction.Updated : NnrpSchemaRegistryAction.Installed;
  }

  public lookup(schemaId: number, schemaVersion: number): NnrpSchemaDescriptorHeader {
    assertUnsigned("schemaId", schemaId, 0xffff_ffff);
    assertUnsigned("schemaVersion", schemaVersion, 0xffff_ffff);
    const descriptor = this.#descriptors.get(schemaDescriptorKey(schemaId, schemaVersion));
    if (descriptor !== undefined) return descriptor;
    const failure = [...this.#descriptors.values()].some((candidate) => candidate.schemaId === schemaId)
      ? NnrpSchemaRegistryFailure.VersionUnknown
      : NnrpSchemaRegistryFailure.Unknown;
    throw schemaRegistryError(failure, "schema descriptor is not installed");
  }

  public invalidate(schemaId: number, schemaVersion: number): NnrpSchemaRegistryAction {
    assertUnsigned("schemaId", schemaId, 0xffff_ffff);
    assertUnsigned("schemaVersion", schemaVersion, 0xffff_ffff);
    if (!this.#descriptors.delete(schemaDescriptorKey(schemaId, schemaVersion))) {
      throw schemaRegistryError(NnrpSchemaRegistryFailure.VersionUnknown, "schema version is not installed");
    }
    return NnrpSchemaRegistryAction.Invalidated;
  }

  public validateBinding(descriptor: NnrpTypedPayloadDescriptor): void {
    validateTypedPayloadDescriptor(descriptor);
    validateStandardProfile(descriptor.profileId);
    if (descriptor.profileId === NnrpStandardProfile.Unspecified) {
      if (descriptor.schemaId === 0 && descriptor.schemaVersion === 0) return;
      throw schemaRegistryError(NnrpSchemaRegistryFailure.Incompatible, "unspecified profile cannot bind a schema");
    }
    if (descriptor.schemaId === 0) {
      throw schemaRegistryError(NnrpSchemaRegistryFailure.Unknown, "typed payload schema id is zero");
    }
    const schema = this.lookup(descriptor.schemaId, descriptor.schemaVersion);
    if (schema.profileId !== descriptor.profileId) {
      throw schemaRegistryError(NnrpSchemaRegistryFailure.Incompatible, "typed payload profile does not match schema");
    }
  }

  public snapshot(): readonly NnrpSchemaDescriptorHeader[] {
    return Object.freeze([...this.#descriptors.values()]);
  }
}

export function tokenDeltaSchemaDescriptor(): NnrpSchemaDescriptorHeader {
  return normalizeSchemaDescriptorHeader({
    schemaId: NNRP_TOKEN_DELTA_SCHEMA_ID,
    schemaVersion: NNRP_TOKEN_DELTA_SCHEMA_VERSION,
    profileId: NnrpStandardProfile.Token,
    schemaFlags: NnrpSchemaDescriptorFlags.None,
    minVersionMajor: 1,
    maxVersionMajor: 1,
    bodyBytes: 0,
    dependencyCount: 0,
    defaultStreamSemantics: NnrpStreamSemantics.Append,
    schemaHash: NNRP_TOKEN_DELTA_SCHEMA_HASH,
  });
}

export enum NnrpPayloadKind {
  Tensor = 0x01,
  TokenChunk = 0x02,
  AudioChunk = 0x04,
  VideoChunk = 0x08,
  StructuredEvent = 0x10,
  ToolDelta = 0x20,
  OpaqueBytes = 0x40,
}

export enum NnrpTypedPayloadDescriptorFlags {
  None = 0,
  Terminal = 0x01,
  Partial = 0x02,
  SchemaOverride = 0x04,
  ProfileHintPresent = 0x08,
}

export interface NnrpTypedPayloadDescriptor {
  profileId: number;
  payloadKind: NnrpPayloadKind;
  descriptorFlags: NnrpTypedPayloadDescriptorFlags;
  schemaId: number;
  schemaVersion: number;
  streamSemantics: number;
  offset: number;
  length: number;
}

export interface NnrpTypedPayloadFrame {
  descriptor: NnrpTypedPayloadDescriptor;
  payload: Uint8Array;
}

export function encodeTypedPayloadDescriptor(
  descriptor: NnrpTypedPayloadDescriptor,
): Uint8Array {
  validateTypedPayloadDescriptor(descriptor);
  const bytes = new Uint8Array(NNRP_TYPED_PAYLOAD_DESCRIPTOR_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, descriptor.profileId, true);
  view.setUint8(2, descriptor.payloadKind);
  view.setUint8(3, descriptor.descriptorFlags);
  view.setUint32(4, descriptor.schemaId, true);
  view.setUint32(8, descriptor.schemaVersion, true);
  view.setUint16(12, descriptor.streamSemantics, true);
  view.setUint32(16, descriptor.offset, true);
  view.setUint32(20, descriptor.length, true);
  return bytes;
}

export function decodeTypedPayloadDescriptor(
  source: Uint8Array,
): NnrpTypedPayloadDescriptor {
  if (source.byteLength !== NNRP_TYPED_PAYLOAD_DESCRIPTOR_BYTES) {
    throw new RangeError(
      `typed payload descriptor must be ${NNRP_TYPED_PAYLOAD_DESCRIPTOR_BYTES} bytes`,
    );
  }
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (view.getUint16(14, true) !== 0) {
    throw new RangeError("typed payload descriptor reserved0 must be zero");
  }
  const descriptor: NnrpTypedPayloadDescriptor = {
    profileId: view.getUint16(0, true),
    payloadKind: view.getUint8(2) as NnrpPayloadKind,
    descriptorFlags: view.getUint8(3) as NnrpTypedPayloadDescriptorFlags,
    schemaId: view.getUint32(4, true),
    schemaVersion: view.getUint32(8, true),
    streamSemantics: view.getUint16(12, true),
    offset: view.getUint32(16, true),
    length: view.getUint32(20, true),
  };
  validateTypedPayloadDescriptor(descriptor);
  return descriptor;
}

function validateTypedPayloadDescriptor(
  descriptor: NnrpTypedPayloadDescriptor,
): void {
  const kind = Number(descriptor.payloadKind);
  if (kind === 0 || (kind & (kind - 1)) !== 0 || (kind & ~0x7f) !== 0) {
    throw new RangeError("payloadKind must contain exactly one current payload kind");
  }
  if ((descriptor.descriptorFlags & ~0x0f) !== 0) {
    throw new RangeError("descriptorFlags contains reserved bits");
  }
  assertUnsigned("profileId", descriptor.profileId, 0xffff);
  assertUnsigned("schemaId", descriptor.schemaId, 0xffff_ffff);
  assertUnsigned("schemaVersion", descriptor.schemaVersion, 0xffff_ffff);
  assertUnsigned("streamSemantics", descriptor.streamSemantics, 0xffff);
  assertUnsigned("offset", descriptor.offset, 0xffff_ffff);
  assertUnsigned("length", descriptor.length, 0xffff_ffff);
}

function assertUnsigned(name: string, value: number, maximum: number): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} is outside its unsigned wire range`);
  }
}

function assertUnsignedBigInt(name: string, value: bigint, maximum: bigint): void {
  if (value < 0n || value > maximum) {
    throw new RangeError(`${name} is outside its unsigned wire range`);
  }
}

function normalizeSchemaDescriptorHeader(descriptor: NnrpSchemaDescriptorHeader): NnrpSchemaDescriptorHeader {
  assertUnsigned("schemaId", descriptor.schemaId, 0xffff_ffff);
  assertUnsigned("schemaVersion", descriptor.schemaVersion, 0xffff_ffff);
  assertUnsigned("profileId", descriptor.profileId, 0xffff);
  assertUnsigned("schemaFlags", descriptor.schemaFlags, 0xffff);
  if ((descriptor.schemaFlags & ~0x0f) !== 0) throw new RangeError("schemaFlags contains reserved bits");
  assertUnsigned("minVersionMajor", descriptor.minVersionMajor, 0xff);
  assertUnsigned("maxVersionMajor", descriptor.maxVersionMajor, 0xff);
  if (descriptor.minVersionMajor > descriptor.maxVersionMajor) {
    throw new RangeError("minVersionMajor must not exceed maxVersionMajor");
  }
  assertUnsigned("bodyBytes", descriptor.bodyBytes, 0xffff_ffff);
  assertUnsigned("dependencyCount", descriptor.dependencyCount, 0xffff);
  assertUnsigned("defaultStreamSemantics", descriptor.defaultStreamSemantics, 0xffff);
  if (!Object.values(NnrpStreamSemantics).includes(descriptor.defaultStreamSemantics)) {
    throw new RangeError("defaultStreamSemantics is not registered");
  }
  assertUnsignedBigInt("schemaHash", descriptor.schemaHash, 0xffff_ffff_ffff_ffffn);
  return Object.freeze({ ...descriptor });
}

function validateStandardProfile(profileId: number): void {
  if (
    profileId !== NnrpStandardProfile.Unspecified &&
    profileId !== NnrpStandardProfile.Tensor &&
    profileId !== NnrpStandardProfile.Token
  ) {
    throw schemaRegistryError(NnrpSchemaRegistryFailure.UpdateRejected, "profile id is not registered");
  }
}

function schemaDescriptorKey(schemaId: number, schemaVersion: number): string {
  return `${schemaId}:${schemaVersion}`;
}

function schemaRegistryError(failure: NnrpSchemaRegistryFailure, message: string): NnrpProtocolError {
  return new NnrpProtocolError({
    code: `NNRP_SCHEMA_REGISTRY_${
      NnrpSchemaRegistryFailure[failure].replaceAll(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()
    }`,
    message,
    source: "protocol",
    retryable: false,
    cause: failure,
  });
}

export enum NnrpSessionPriorityClass {
  Interactive = 0,
  Balanced = 1,
  Background = 2,
}

export interface ClientHelloMetadata {
  readonly minVersionMajor: number;
  readonly maxVersionMajor: number;
  readonly supportedWireFormatBitmap: number;
  readonly supportedProfileBitmap: number;
  readonly supportedPayloadKindBitmap: number;
  readonly supportedCodecBitmap: number;
  readonly supportedCompressionBitmap: number;
  readonly supportedDtypeBitmap: number;
  readonly supportedLayoutBitmap: number;
  readonly cacheDigestBitmap: number;
  readonly cacheObjectBitmap: number;
  readonly cacheNamespaceCount: number;
  readonly maxLaneCount: number;
  readonly maxCacheEntries: number;
  readonly maxCacheBytes: number;
  readonly targetCadenceX100: number;
  readonly latencyBudgetMs: number;
  readonly qualityTier: number;
  readonly degradePolicy: number;
  readonly requestedSessionId: number;
  readonly authBytes: number;
  readonly controlExtensionBytes: number;
}

export enum SessionPatchAckStatus {
  Accepted = 0,
  PartiallyApplied = 1,
  Rejected = 2,
}

export enum SessionPatchRejectReason {
  None = 0,
  UnsupportedField = 1,
  InvalidRange = 2,
  UnsupportedStrategy = 3,
  InvalidLaneMask = 4,
  RateLimited = 5,
}

export interface SessionPatchAckMetadata {
  readonly ackStatus: SessionPatchAckStatus;
  readonly rejectReason: SessionPatchRejectReason;
  readonly appliedPatchMask: number;
  readonly rejectedPatchMask: number;
  readonly retryAfterMs: number;
  readonly effectiveProfileId: number;
  readonly effectiveTargetCadenceX100: number;
  readonly effectiveQualityTier: number;
  readonly effectiveDegradePolicy: number;
  readonly effectiveLaneMask: bigint;
  readonly effectiveCodecBitmap: number;
  readonly effectiveCompressionBitmap: number;
  readonly profilePatchAckBytes: number;
}

export function encodeClientHelloMetadata(metadata: ClientHelloMetadata): Uint8Array {
  validateClientHelloMetadata(metadata);
  const encoded = new Uint8Array(64);
  const view = new DataView(encoded.buffer);
  view.setUint8(0, metadata.minVersionMajor);
  view.setUint8(1, metadata.maxVersionMajor);
  view.setUint16(2, metadata.supportedWireFormatBitmap, true);
  view.setUint32(4, metadata.supportedProfileBitmap, true);
  view.setUint32(8, metadata.supportedPayloadKindBitmap, true);
  view.setUint32(12, metadata.supportedCodecBitmap, true);
  view.setUint32(16, metadata.supportedCompressionBitmap, true);
  view.setUint32(20, metadata.supportedDtypeBitmap, true);
  view.setUint32(24, metadata.supportedLayoutBitmap, true);
  view.setUint16(28, metadata.cacheDigestBitmap, true);
  view.setUint16(30, metadata.cacheObjectBitmap, true);
  view.setUint16(32, metadata.cacheNamespaceCount, true);
  view.setUint16(34, metadata.maxLaneCount, true);
  view.setUint32(36, metadata.maxCacheEntries, true);
  view.setUint32(40, metadata.maxCacheBytes, true);
  view.setUint16(44, metadata.targetCadenceX100, true);
  view.setUint16(46, metadata.latencyBudgetMs, true);
  view.setUint16(48, metadata.qualityTier, true);
  view.setUint16(50, metadata.degradePolicy, true);
  view.setUint32(52, metadata.requestedSessionId, true);
  view.setUint32(56, metadata.authBytes, true);
  view.setUint32(60, metadata.controlExtensionBytes, true);
  return encoded;
}

export function decodeClientHelloMetadata(encoded: Uint8Array): ClientHelloMetadata {
  requireExactRuntimePayload(encoded, 64, "CLIENT_HELLO");
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const metadata: ClientHelloMetadata = {
    minVersionMajor: view.getUint8(0),
    maxVersionMajor: view.getUint8(1),
    supportedWireFormatBitmap: view.getUint16(2, true),
    supportedProfileBitmap: view.getUint32(4, true),
    supportedPayloadKindBitmap: view.getUint32(8, true),
    supportedCodecBitmap: view.getUint32(12, true),
    supportedCompressionBitmap: view.getUint32(16, true),
    supportedDtypeBitmap: view.getUint32(20, true),
    supportedLayoutBitmap: view.getUint32(24, true),
    cacheDigestBitmap: view.getUint16(28, true),
    cacheObjectBitmap: view.getUint16(30, true),
    cacheNamespaceCount: view.getUint16(32, true),
    maxLaneCount: view.getUint16(34, true),
    maxCacheEntries: view.getUint32(36, true),
    maxCacheBytes: view.getUint32(40, true),
    targetCadenceX100: view.getUint16(44, true),
    latencyBudgetMs: view.getUint16(46, true),
    qualityTier: view.getUint16(48, true),
    degradePolicy: view.getUint16(50, true),
    requestedSessionId: view.getUint32(52, true),
    authBytes: view.getUint32(56, true),
    controlExtensionBytes: view.getUint32(60, true),
  };
  validateClientHelloMetadata(metadata);
  return metadata;
}

export function encodeSessionPatchAckMetadata(metadata: SessionPatchAckMetadata): Uint8Array {
  validateSessionPatchAckMetadata(metadata);
  const encoded = new Uint8Array(48);
  const view = new DataView(encoded.buffer);
  view.setUint16(0, metadata.ackStatus, true);
  view.setUint16(2, metadata.rejectReason, true);
  view.setUint32(4, metadata.appliedPatchMask, true);
  view.setUint32(8, metadata.rejectedPatchMask, true);
  view.setUint32(12, metadata.retryAfterMs, true);
  view.setUint16(16, metadata.effectiveProfileId, true);
  view.setUint32(20, metadata.effectiveTargetCadenceX100, true);
  view.setUint16(24, metadata.effectiveQualityTier, true);
  view.setUint16(26, metadata.effectiveDegradePolicy, true);
  view.setBigUint64(28, metadata.effectiveLaneMask, true);
  view.setUint32(36, metadata.effectiveCodecBitmap, true);
  view.setUint32(40, metadata.effectiveCompressionBitmap, true);
  view.setUint32(44, metadata.profilePatchAckBytes, true);
  return encoded;
}

export function decodeSessionPatchAckMetadata(encoded: Uint8Array): SessionPatchAckMetadata {
  requireExactRuntimePayload(encoded, 48, "SESSION_PATCH_ACK");
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  if (view.getUint16(18, true) !== 0) {
    throw runtimeEventError("NNRP_SESSION_PATCH_ACK_RESERVED", "SESSION_PATCH_ACK reserved field must be zero.");
  }
  const metadata: SessionPatchAckMetadata = {
    ackStatus: view.getUint16(0, true) as SessionPatchAckStatus,
    rejectReason: view.getUint16(2, true) as SessionPatchRejectReason,
    appliedPatchMask: view.getUint32(4, true),
    rejectedPatchMask: view.getUint32(8, true),
    retryAfterMs: view.getUint32(12, true),
    effectiveProfileId: view.getUint16(16, true),
    effectiveTargetCadenceX100: view.getUint32(20, true),
    effectiveQualityTier: view.getUint16(24, true),
    effectiveDegradePolicy: view.getUint16(26, true),
    effectiveLaneMask: view.getBigUint64(28, true),
    effectiveCodecBitmap: view.getUint32(36, true),
    effectiveCompressionBitmap: view.getUint32(40, true),
    profilePatchAckBytes: view.getUint32(44, true),
  };
  validateSessionPatchAckMetadata(metadata);
  return metadata;
}

export interface NnrpSessionOpenMetadata {
  readonly requestedSessionId: number;
  readonly profileId: number;
  readonly priorityClass: NnrpSessionPriorityClass;
  readonly sessionFlags: number;
  readonly schemaId: number;
  readonly schemaVersion: number;
  readonly defaultDeadlineMillis: number;
  readonly maxInFlightOperations: number;
  readonly leaseTtlHintMillis: number;
  readonly resumeTokenBytes: number;
  readonly authBytes: number;
  readonly sessionExtensionBytes: number;
  readonly clientSessionTag: bigint;
}

export function encodeSessionOpenMetadata(metadata: NnrpSessionOpenMetadata): Uint8Array {
  validateSessionOpenMetadata(metadata);
  const encoded = new Uint8Array(NNRP_SESSION_OPEN_METADATA_BYTES);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, metadata.requestedSessionId, true);
  view.setUint16(4, metadata.profileId, true);
  view.setUint8(6, metadata.priorityClass);
  view.setUint8(7, metadata.sessionFlags);
  view.setUint32(8, metadata.schemaId, true);
  view.setUint32(12, metadata.schemaVersion, true);
  view.setUint32(16, metadata.defaultDeadlineMillis, true);
  view.setUint16(20, metadata.maxInFlightOperations, true);
  view.setUint32(24, metadata.leaseTtlHintMillis, true);
  view.setUint32(28, metadata.resumeTokenBytes, true);
  view.setUint32(32, metadata.authBytes, true);
  view.setUint32(36, metadata.sessionExtensionBytes, true);
  view.setBigUint64(40, metadata.clientSessionTag, true);
  return encoded;
}

export function decodeSessionOpenMetadata(encoded: Uint8Array): NnrpSessionOpenMetadata {
  if (encoded.byteLength !== NNRP_SESSION_OPEN_METADATA_BYTES) {
    throw new RangeError(`SESSION_OPEN metadata must be ${NNRP_SESSION_OPEN_METADATA_BYTES} bytes`);
  }
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  if (view.getUint16(22, true) !== 0) {
    throw new RangeError("SESSION_OPEN reserved0 must be zero");
  }
  const metadata: NnrpSessionOpenMetadata = {
    requestedSessionId: view.getUint32(0, true),
    profileId: view.getUint16(4, true),
    priorityClass: view.getUint8(6) as NnrpSessionPriorityClass,
    sessionFlags: view.getUint8(7),
    schemaId: view.getUint32(8, true),
    schemaVersion: view.getUint32(12, true),
    defaultDeadlineMillis: view.getUint32(16, true),
    maxInFlightOperations: view.getUint16(20, true),
    leaseTtlHintMillis: view.getUint32(24, true),
    resumeTokenBytes: view.getUint32(28, true),
    authBytes: view.getUint32(32, true),
    sessionExtensionBytes: view.getUint32(36, true),
    clientSessionTag: view.getBigUint64(40, true),
  };
  validateSessionOpenMetadata(metadata);
  return metadata;
}

function validateSessionOpenMetadata(metadata: NnrpSessionOpenMetadata): void {
  assertUnsigned("requestedSessionId", metadata.requestedSessionId, 0xffff_ffff);
  assertUnsigned("profileId", metadata.profileId, 0xffff);
  if (
    metadata.priorityClass !== NnrpSessionPriorityClass.Interactive &&
    metadata.priorityClass !== NnrpSessionPriorityClass.Balanced &&
    metadata.priorityClass !== NnrpSessionPriorityClass.Background
  ) {
    throw new RangeError("priorityClass is not a current SESSION_OPEN priority class");
  }
  assertUnsigned("sessionFlags", metadata.sessionFlags, 0xff);
  if ((metadata.sessionFlags & ~0x0f) !== 0) {
    throw new RangeError("sessionFlags contains reserved bits");
  }
  assertUnsigned("schemaId", metadata.schemaId, 0xffff_ffff);
  assertUnsigned("schemaVersion", metadata.schemaVersion, 0xffff_ffff);
  assertUnsigned("defaultDeadlineMillis", metadata.defaultDeadlineMillis, 0xffff_ffff);
  assertUnsigned("maxInFlightOperations", metadata.maxInFlightOperations, 0xffff);
  assertUnsigned("leaseTtlHintMillis", metadata.leaseTtlHintMillis, 0xffff_ffff);
  assertUnsigned("resumeTokenBytes", metadata.resumeTokenBytes, 0xffff_ffff);
  assertUnsigned("authBytes", metadata.authBytes, 0xffff_ffff);
  assertUnsigned("sessionExtensionBytes", metadata.sessionExtensionBytes, 0xffff_ffff);
  assertUnsignedBigInt("clientSessionTag", metadata.clientSessionTag, 0xffff_ffff_ffff_ffffn);
}

const SESSION_RECOVERY_TICKET_MAGIC = new Uint8Array([0x4e, 0x52, 0x54, 0x4b]);
const SESSION_RECOVERY_TICKET_VERSION = 1;
const SESSION_RECOVERY_TICKET_OPERATION_PRESENT = 0x0001;

export class NnrpSessionRecoveryTicket {
  readonly #resumeToken: Uint8Array;

  private constructor(
    public readonly sessionId: number,
    resumeToken: Uint8Array,
    public readonly resumeFromOperationId: bigint | undefined,
    public readonly resumeWindowMillis: number,
  ) {
    this.#resumeToken = resumeToken.slice();
    Object.freeze(this);
  }

  public get resumeToken(): Uint8Array {
    return this.#resumeToken.slice();
  }

  public toBytes(): Uint8Array {
    const encoded = new Uint8Array(NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES + this.#resumeToken.byteLength);
    encoded.set(SESSION_RECOVERY_TICKET_MAGIC, 0);
    const view = new DataView(encoded.buffer);
    view.setUint16(4, SESSION_RECOVERY_TICKET_VERSION, true);
    const operationPresent = this.resumeFromOperationId !== undefined;
    view.setUint16(6, operationPresent ? SESSION_RECOVERY_TICKET_OPERATION_PRESENT : 0, true);
    view.setUint32(8, this.sessionId, true);
    view.setUint32(12, this.#resumeToken.byteLength, true);
    view.setUint32(16, this.resumeWindowMillis, true);
    view.setBigUint64(20, this.resumeFromOperationId ?? 0n, true);
    encoded.set(this.#resumeToken, NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES);
    return encoded;
  }

  public static fromBytes(encoded: Uint8Array): NnrpSessionRecoveryTicket {
    if (!(encoded instanceof Uint8Array)) throw new TypeError("encoded recovery ticket must be a Uint8Array");
    if (encoded.byteLength < NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES) {
      throw new RangeError("recovery ticket is truncated");
    }
    if (!SESSION_RECOVERY_TICKET_MAGIC.every((value, index) => encoded[index] === value)) {
      throw new RangeError("recovery ticket magic is invalid");
    }
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    if (view.getUint16(4, true) !== SESSION_RECOVERY_TICKET_VERSION) {
      throw new RangeError("recovery ticket version is unsupported");
    }
    const flags = view.getUint16(6, true);
    if ((flags & ~SESSION_RECOVERY_TICKET_OPERATION_PRESENT) !== 0) {
      throw new RangeError("recovery ticket contains reserved flags");
    }
    const sessionId = view.getUint32(8, true);
    const resumeTokenBytes = view.getUint32(12, true);
    const resumeWindowMillis = view.getUint32(16, true);
    const operationId = view.getBigUint64(20, true);
    if (sessionId === 0) throw new RangeError("recovery ticket sessionId must be non-zero");
    if (resumeTokenBytes === 0) throw new RangeError("recovery ticket resumeToken must be non-empty");
    if (encoded.byteLength !== NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES + resumeTokenBytes) {
      throw new RangeError("recovery ticket length does not match its token length");
    }
    const operationPresent = (flags & SESSION_RECOVERY_TICKET_OPERATION_PRESENT) !== 0;
    if (!operationPresent && operationId !== 0n) {
      throw new RangeError("recovery ticket carries an operation id without its presence flag");
    }
    if (operationPresent && operationId === 0n) {
      throw new RangeError("recovery ticket resumeFromOperationId must be non-zero when present");
    }
    return new NnrpSessionRecoveryTicket(
      sessionId,
      encoded.subarray(NNRP_SESSION_RECOVERY_TICKET_PREFIX_BYTES),
      operationPresent ? operationId : undefined,
      resumeWindowMillis,
    );
  }
}

export enum NnrpMessageType {
  ClientHello = 0x01,
  ServerHelloAck = 0x02,
  SessionPatch = 0x03,
  SessionPatchAck = 0x04,
  Close = 0x05,
  Error = 0x06,
  SessionOpen = 0x07,
  SessionOpenAck = 0x08,
  SessionClose = 0x09,
  SessionCloseAck = 0x0a,
  FrameSubmit = 0x10,
  FrameCancel = 0x11,
  ResultPush = 0x12,
  ResultDrop = 0x13,
  CachePut = 0x14,
  CacheAck = 0x15,
  CacheInvalidate = 0x16,
  FlowUpdate = 0x17,
  ResultHint = 0x18,
  TransportProbe = 0x19,
  TransportProbeAck = 0x1a,
  SessionMigrate = 0x1b,
  SessionMigrateAck = 0x1c,
  Ping = 0x20,
  Pong = 0x21,
  Cancel = 0x30,
  Abort = 0x31,
  PriorityUpdate = 0x32,
  Deadline = 0x33,
  ExpireAt = 0x34,
  Supersede = 0x35,
  BudgetUpdate = 0x36,
  Progress = 0x37,
  PartialResult = 0x38,
  Backpressure = 0x39,
  CreditUpdate = 0x3a,
  CapabilityNegotiation = 0x3b,
  DegradeProfile = 0x3c,
  RouteHint = 0x3d,
  ExecutionHint = 0x3e,
  TraceContext = 0x3f,
  ResultDropReason = 0x40,
  ObjectDeclare = 0x41,
  ObjectRef = 0x42,
  ObjectRelease = 0x43,
  ObjectPatch = 0x44,
  ObjectDelta = 0x45,
  CacheReference = 0x46,
  CacheMiss = 0x47,
  ErrorRecoverable = 0x48,
  RetryAfter = 0x49,
}

export enum RuntimeRole {
  Unspecified = 0,
  Client = 1,
  Server = 2,
  Runtime = 3,
  Subagent = 4,
  Tool = 5,
  Scheduler = 6,
  ConformanceRunner = 7,
}

export enum ErrorScope {
  Connection = 0,
  Session = 1,
  Frame = 2,
}

export enum RuntimeObjectKind {
  Unspecified = 0x0000,
  Tensor = 0x0001,
  TokenBlock = 0x0002,
  ImageTile = 0x0003,
  FeatureMap = 0x0004,
  ToolResult = 0x0005,
  TraceSegment = 0x0006,
  OpaqueBytes = 0x0007,
  DocumentChunk = 0x0008,
  AudioChunk = 0x0009,
  VideoChunk = 0x000a,
  RoutePlan = 0x000b,
  CacheManifest = 0x000c,
}

export enum MemoryLocationHint {
  Unspecified = 0x0000,
  HostMemory = 0x0001,
  DeviceMemory = 0x0002,
  SharedMemory = 0x0003,
  RemoteMemory = 0x0004,
  MmapFile = 0x0005,
  ObjectStore = 0x0006,
}

export enum OwnershipHint {
  Unspecified = 0x0000,
  ProducerOwned = 0x0001,
  ConsumerOwned = 0x0002,
  SessionOwned = 0x0003,
  Borrowed = 0x0004,
  TransferOnRef = 0x0005,
  ReleaseOnDrop = 0x0006,
}

export enum ObjectReleaseReason {
  Completed = 0x0000,
  Cancelled = 0x0001,
  Expired = 0x0002,
  Replaced = 0x0003,
  Invalidated = 0x0004,
  OwnerClosed = 0x0005,
  LeaseExpired = 0x0006,
  ConformanceInjection = 0x0007,
}

export enum CacheReuseScope {
  Operation = 0x0000,
  Session = 0x0001,
  Connection = 0x0002,
  Global = 0x0003,
  Tenant = 0x0004,
  Profile = 0x0005,
}

export enum CacheMissReason {
  Unknown = 0x0000,
  NotFound = 0x0001,
  Expired = 0x0002,
  Invalidated = 0x0003,
  SchemaMismatch = 0x0004,
  ProducerUnavailable = 0x0005,
  LeaseRequired = 0x0006,
  PermissionDenied = 0x0007,
}

export enum NnrpCacheObjectKind {
  CameraBlock = 0x0001,
  TileIndexBlock = 0x0002,
  TensorSectionTable = 0x0003,
  CodecTable = 0x0004,
  ReusableResultObject = 0x0005,
  PayloadLayoutTemplate = 0x0006,
  PromptSegment = 0x0007,
  ToolSchema = 0x0008,
  StructuredEventSchema = 0x0009,
}

export enum CacheLeaseOwnerScope {
  Connection = 0,
  Session = 1,
  Operation = 2,
}

export interface CacheObjectId {
  readonly cacheNamespace: number;
  readonly cacheKeyHi: bigint;
  readonly cacheKeyLo: bigint;
  readonly objectKind: NnrpCacheObjectKind;
}

export interface NnrpCacheObjectVersion {
  readonly objectId: CacheObjectId;
  readonly objectVersion: bigint;
  readonly schemaId: number;
  readonly schemaVersion: number;
}

export type NnrpCacheLeaseOutcome = "valid" | "expired" | "renewed" | "released" | "missing";

export type NnrpCacheInvalidationReason =
  | "explicit"
  | "dependency-invalidated"
  | "lease-expired"
  | "version-mismatch"
  | "schema-mismatch";

export interface ObjectDescriptorMetadata {
  readonly objectId: bigint;
  readonly objectKind: RuntimeObjectKind;
  readonly producerRole: RuntimeRole;
  readonly consumerRole: RuntimeRole;
  readonly sessionId: number;
  readonly byteSize: bigint;
  readonly computeCostUnits: number;
  readonly memoryLocationHint: MemoryLocationHint;
  readonly ownershipHint: OwnershipHint;
  readonly lifetimeHintMs: number;
  readonly metadataBytes: number;
}

export interface ObjectReferenceMetadata {
  readonly objectId: bigint;
  readonly operationId: bigint;
  readonly objectVersion: bigint;
  readonly offset: bigint;
  readonly length: bigint;
  readonly flags: number;
  readonly metadataBytes: number;
}

export interface ObjectReleaseMetadata {
  readonly objectId: bigint;
  readonly operationId: bigint;
  readonly releaseReason: ObjectReleaseReason;
  readonly sourceRole: RuntimeRole;
  readonly flags: number;
  readonly diagnosticBytes: number;
}

export interface ObjectDeltaMetadata {
  readonly objectId: bigint;
  readonly deltaSequence: bigint;
  readonly regionOffset: bigint;
  readonly regionBytes: number;
  readonly deltaBytes: number;
  readonly flags: number;
  readonly metadataBytes: number;
}

export interface CacheReferenceMetadata {
  readonly cacheNamespace: number;
  readonly cacheKeyHi: bigint;
  readonly cacheKeyLo: bigint;
  readonly profileId: number;
  readonly reuseScope: CacheReuseScope;
  readonly leaseId: bigint;
  readonly producerTraceId: bigint;
  readonly expirationHintMs: number;
  readonly metadataBytes: number;
  readonly flags: number;
}

export interface CacheMissMetadata {
  readonly cacheNamespace: number;
  readonly cacheKeyHi: bigint;
  readonly cacheKeyLo: bigint;
  readonly missReason: CacheMissReason;
  readonly profileId: number;
  readonly diagnosticBytes: number;
}

export type RuntimeObjectMetadata =
  | ObjectDescriptorMetadata
  | ObjectReferenceMetadata
  | ObjectReleaseMetadata
  | ObjectDeltaMetadata
  | CacheReferenceMetadata
  | CacheMissMetadata;

export interface DecodedRuntimeObjectMetadata {
  readonly metadata: RuntimeObjectMetadata;
  readonly tail: Uint8Array;
}

export interface CacheInvalidateMetadata {
  readonly invalidateScope: CacheInvalidateScope;
  readonly cacheNamespace: number;
  readonly cacheKeyHi: bigint;
  readonly cacheKeyLo: bigint;
  readonly reasonCode: number;
}

export enum CacheAckStatus {
  Accepted = 0,
  Rejected = 1,
  Replaced = 2,
}

export enum CacheInvalidateScope {
  WholeSession = 0,
  Namespace = 1,
  ObjectKind = 2,
  ObjectKey = 3,
}

export interface CachePutMetadata {
  readonly cacheNamespace: number;
  readonly cacheKeyHi: bigint;
  readonly cacheKeyLo: bigint;
  readonly objectKind: NnrpCacheObjectKind;
  readonly ttlMs: number;
  readonly objectBytes: number;
  readonly codecBitmap: number;
  readonly flags: number;
}

export interface CacheAckMetadata {
  readonly cacheNamespace: number;
  readonly cacheKeyHi: bigint;
  readonly cacheKeyLo: bigint;
  readonly status: CacheAckStatus;
  readonly acceptedTtlMs: number;
  readonly maxObjectBytes: number;
  readonly detailCode: number;
}

export interface TransportProbeMetadata {
  readonly probeId: number;
  readonly probePayloadBytes: number;
  readonly clientSendTsUs: bigint;
}

export interface TransportProbeAckMetadata {
  readonly probeId: number;
  readonly serverRecvTsUs: bigint;
}

export function encodeCachePutMetadata(metadata: CachePutMetadata): Uint8Array {
  validateCachePutMetadata(metadata);
  const encoded = new Uint8Array(40);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, metadata.cacheNamespace, true);
  view.setUint32(4, metadata.objectKind, true);
  view.setBigUint64(8, metadata.cacheKeyHi, true);
  view.setBigUint64(16, metadata.cacheKeyLo, true);
  view.setUint32(24, metadata.ttlMs, true);
  view.setUint32(28, metadata.objectBytes, true);
  view.setUint32(32, metadata.codecBitmap, true);
  view.setUint32(36, metadata.flags, true);
  return encoded;
}

export function decodeCachePutMetadata(encoded: Uint8Array): CachePutMetadata {
  requireExactRuntimePayload(encoded, 40, "CACHE_PUT");
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const metadata: CachePutMetadata = {
    cacheNamespace: view.getUint32(0, true),
    objectKind: view.getUint32(4, true) as NnrpCacheObjectKind,
    cacheKeyHi: view.getBigUint64(8, true),
    cacheKeyLo: view.getBigUint64(16, true),
    ttlMs: view.getUint32(24, true),
    objectBytes: view.getUint32(28, true),
    codecBitmap: view.getUint32(32, true),
    flags: view.getUint32(36, true),
  };
  validateCachePutMetadata(metadata);
  return metadata;
}

export function encodeCacheAckMetadata(metadata: CacheAckMetadata): Uint8Array {
  validateCacheAckMetadata(metadata);
  const encoded = new Uint8Array(40);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, metadata.cacheNamespace, true);
  view.setUint32(4, metadata.status, true);
  view.setBigUint64(8, metadata.cacheKeyHi, true);
  view.setBigUint64(16, metadata.cacheKeyLo, true);
  view.setUint32(24, metadata.acceptedTtlMs, true);
  view.setUint32(28, metadata.maxObjectBytes, true);
  view.setUint32(32, metadata.detailCode, true);
  return encoded;
}

export function decodeCacheAckMetadata(encoded: Uint8Array): CacheAckMetadata {
  requireExactRuntimePayload(encoded, 40, "CACHE_ACK");
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  if (view.getUint32(36, true) !== 0) {
    throw runtimeObjectError("NNRP_CACHE_ACK_RESERVED_NONZERO", "CACHE_ACK reserved field must be zero.");
  }
  const metadata: CacheAckMetadata = {
    cacheNamespace: view.getUint32(0, true),
    status: view.getUint32(4, true) as CacheAckStatus,
    cacheKeyHi: view.getBigUint64(8, true),
    cacheKeyLo: view.getBigUint64(16, true),
    acceptedTtlMs: view.getUint32(24, true),
    maxObjectBytes: view.getUint32(28, true),
    detailCode: view.getUint32(32, true),
  };
  validateCacheAckMetadata(metadata);
  return metadata;
}

export function encodeTransportProbeMetadata(metadata: TransportProbeMetadata): Uint8Array {
  validateTransportProbeMetadata(metadata);
  const encoded = new Uint8Array(16);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, metadata.probeId, true);
  view.setUint32(4, metadata.probePayloadBytes, true);
  view.setBigUint64(8, metadata.clientSendTsUs, true);
  return encoded;
}

export function decodeTransportProbeMetadata(encoded: Uint8Array): TransportProbeMetadata {
  requireExactRuntimePayload(encoded, 16, "TRANSPORT_PROBE");
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const metadata: TransportProbeMetadata = {
    probeId: view.getUint32(0, true),
    probePayloadBytes: view.getUint32(4, true),
    clientSendTsUs: view.getBigUint64(8, true),
  };
  validateTransportProbeMetadata(metadata);
  return metadata;
}

export function encodeTransportProbeAckMetadata(metadata: TransportProbeAckMetadata): Uint8Array {
  validateTransportProbeAckMetadata(metadata);
  const encoded = new Uint8Array(16);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, metadata.probeId, true);
  view.setBigUint64(8, metadata.serverRecvTsUs, true);
  return encoded;
}

export function decodeTransportProbeAckMetadata(encoded: Uint8Array): TransportProbeAckMetadata {
  requireExactRuntimePayload(encoded, 16, "TRANSPORT_PROBE_ACK");
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  if (view.getUint32(4, true) !== 0) {
    throw runtimeEventError("NNRP_TRANSPORT_PROBE_ACK_RESERVED", "TRANSPORT_PROBE_ACK reserved field must be zero.");
  }
  const metadata: TransportProbeAckMetadata = {
    probeId: view.getUint32(0, true),
    serverRecvTsUs: view.getBigUint64(8, true),
  };
  validateTransportProbeAckMetadata(metadata);
  return metadata;
}

export class CacheLease {
  public readonly objectId: CacheObjectId;
  public readonly objectVersion: bigint;
  public readonly leaseId: bigint;
  public readonly ownerScope: CacheLeaseOwnerScope;
  public readonly ownerId: bigint;
  public readonly grantedAtMillis: bigint;
  public readonly ttlMillis: number;

  public constructor(
    objectId: CacheObjectId,
    objectVersion: bigint,
    leaseId: bigint,
    ownerScope: CacheLeaseOwnerScope,
    ownerId: bigint,
    grantedAtMillis: bigint,
    ttlMillis: number,
  ) {
    validateCacheObjectId(objectId);
    validateU64BigInt("objectVersion", objectVersion);
    validateU64BigInt("leaseId", leaseId);
    if (!isCacheLeaseOwnerScope(ownerScope)) {
      throw runtimeObjectError("NNRP_CACHE_LEASE_OWNER_SCOPE_INVALID", "Cache lease ownerScope is not recognized.");
    }
    validateU64BigInt("ownerId", ownerId);
    validateU64BigInt("grantedAtMillis", grantedAtMillis);
    validateU32Number("ttlMillis", ttlMillis);

    this.objectId = Object.freeze({ ...objectId });
    this.objectVersion = objectVersion;
    this.leaseId = leaseId;
    this.ownerScope = ownerScope;
    this.ownerId = ownerId;
    this.grantedAtMillis = grantedAtMillis;
    this.ttlMillis = ttlMillis;
  }

  public get expiresAtMillis(): bigint {
    const ttl = BigInt(this.ttlMillis);
    return U64_MAX - this.grantedAtMillis < ttl ? U64_MAX : this.grantedAtMillis + ttl;
  }

  public isExpiredAt(nowMillis: bigint): boolean {
    validateU64BigInt("nowMillis", nowMillis);
    return nowMillis >= this.expiresAtMillis;
  }

  public validateVersion(expectedVersion: bigint): void {
    validateU64BigInt("expectedVersion", expectedVersion);
    if (expectedVersion !== this.objectVersion) {
      throw runtimeObjectError(
        "NNRP_CACHE_LEASE_VERSION_MISMATCH",
        `Cache lease covers object version ${this.objectVersion}, received ${expectedVersion}.`,
      );
    }
  }
}

export class NnrpCacheLeaseResult {
  public readonly objectId: CacheObjectId;
  public readonly outcome: NnrpCacheLeaseOutcome;
  public readonly lease?: CacheLease;
  public readonly objectVersion?: NnrpCacheObjectVersion;
  public readonly diagnostic?: string;

  public constructor(options: {
    readonly objectId: CacheObjectId;
    readonly outcome: NnrpCacheLeaseOutcome;
    readonly lease?: CacheLease;
    readonly objectVersion?: NnrpCacheObjectVersion;
    readonly diagnostic?: string;
  }) {
    validateCacheObjectId(options.objectId);
    if (!NNRP_CACHE_LEASE_OUTCOMES.has(options.outcome)) {
      throw runtimeObjectError("NNRP_CACHE_LEASE_OUTCOME_INVALID", "Cache lease outcome is not recognized.");
    }
    if (options.lease !== undefined && !cacheObjectIdsEqual(options.lease.objectId, options.objectId)) {
      throw runtimeObjectError(
        "NNRP_CACHE_LEASE_IDENTITY_MISMATCH",
        "Cache lease identity must match result identity.",
      );
    }
    if (options.objectVersion !== undefined) {
      validateCacheObjectVersion(options.objectVersion);
      if (!cacheObjectIdsEqual(options.objectVersion.objectId, options.objectId)) {
        throw runtimeObjectError(
          "NNRP_CACHE_VERSION_IDENTITY_MISMATCH",
          "Cache object version identity must match result identity.",
        );
      }
    }
    if (options.diagnostic !== undefined && options.diagnostic.trim().length === 0) {
      throw runtimeObjectError("NNRP_CACHE_DIAGNOSTIC_INVALID", "Cache diagnostic must not be empty when present.");
    }

    this.objectId = Object.freeze({ ...options.objectId });
    this.outcome = options.outcome;
    if (options.lease !== undefined) this.lease = options.lease;
    if (options.objectVersion !== undefined) {
      this.objectVersion = Object.freeze({
        ...options.objectVersion,
        objectId: Object.freeze({ ...options.objectVersion.objectId }),
      });
    }
    if (options.diagnostic !== undefined) this.diagnostic = options.diagnostic;
  }
}

export class NnrpCachePolicyOptions {
  public readonly enabled: boolean;
  public readonly reuseScope?: CacheReuseScope;
  public readonly expirationHintMs: bigint;
  public readonly invalidationReason: NnrpCacheInvalidationReason;

  public constructor(options: {
    readonly enabled: boolean;
    readonly reuseScope?: CacheReuseScope;
    readonly expirationHintMs?: bigint;
    readonly invalidationReason?: NnrpCacheInvalidationReason;
  }) {
    const expirationHintMs = options.expirationHintMs ?? 0n;
    const invalidationReason = options.invalidationReason ?? "explicit";
    validateU64BigInt("expirationHintMs", expirationHintMs);
    if (!NNRP_CACHE_INVALIDATION_REASONS.has(invalidationReason)) {
      throw runtimeObjectError(
        "NNRP_CACHE_INVALIDATION_REASON_INVALID",
        "Cache invalidation reason is not recognized.",
      );
    }
    if (options.reuseScope !== undefined && !isCacheReuseScope(options.reuseScope)) {
      throw runtimeObjectError("NNRP_CACHE_REUSE_SCOPE_INVALID", "Cache reuse scope is not recognized.");
    }
    if (!options.enabled && (options.reuseScope !== undefined || expirationHintMs !== 0n)) {
      throw runtimeObjectError(
        "NNRP_CACHE_POLICY_INVALID",
        "Disabled cache policy must not carry a reuse scope or expiration hint.",
      );
    }
    if (options.enabled && options.reuseScope === undefined) {
      throw runtimeObjectError("NNRP_CACHE_POLICY_INVALID", "Enabled cache policy requires a reuse scope.");
    }

    this.enabled = options.enabled;
    if (options.reuseScope !== undefined) this.reuseScope = options.reuseScope;
    this.expirationHintMs = expirationHintMs;
    this.invalidationReason = invalidationReason;
  }
}

export interface ControlRequestMetadata {
  readonly operationId: bigint;
  readonly controlSequence: bigint;
  readonly reasonCode: number;
  readonly sourceRole: RuntimeRole;
  readonly flags: number;
  readonly diagnosticBytes: number;
}

export interface SchedulingMetadata {
  readonly operationId: bigint;
  readonly controlSequence: bigint;
  readonly priorityClass: number;
  readonly priorityDelta: number;
  readonly deadlineUnixMs: bigint;
  readonly flags: number;
}

export interface SupersedeMetadata {
  readonly oldOperationId: bigint;
  readonly newOperationId: bigint;
  readonly controlSequence: bigint;
  readonly dropReasonCode: number;
  readonly flags: number;
  readonly diagnosticBytes: number;
}

export interface BudgetMetadata {
  readonly operationId: bigint;
  readonly computeBudgetUnits: bigint;
  readonly memoryBudgetBytes: bigint;
  readonly bandwidthBudgetBytes: bigint;
  readonly tokenBudget: number;
  readonly flags: number;
}

export interface ProgressMetadata {
  readonly operationId: bigint;
  readonly progressSequence: bigint;
  readonly stageCode: number;
  readonly percentX100: number;
  readonly objectId: bigint;
  readonly bodyBytes: number;
}

export interface PartialResultMetadata {
  readonly operationId: bigint;
  readonly resultSequence: bigint;
  readonly objectId: bigint;
  readonly deltaSequence: bigint;
  readonly bodyBytes: number;
  readonly flags: number;
}

export interface PressureMetadata {
  readonly scopeId: bigint;
  readonly creditWindow: bigint;
  readonly pressureLevel: number;
  readonly pressureReason: number;
  readonly retryAfterMs: number;
  readonly flags: number;
}

export interface CapabilityMetadata {
  readonly profileId: number;
  readonly capabilityCount: number;
  readonly costModelId: number;
  readonly preferenceRank: number;
  readonly limitBytes: bigint;
  readonly limitUnits: bigint;
  readonly bodyBytes: number;
  readonly flags: number;
}

export interface RouteHintMetadata {
  readonly operationId: bigint;
  readonly routeId: number;
  readonly executorClass: number;
  readonly affinityClass: number;
  readonly deadlineUnixMs: bigint;
  readonly bodyBytes: number;
  readonly flags: number;
}

export interface TraceContextMetadata {
  readonly traceId: bigint;
  readonly spanId: bigint;
  readonly parentSpanId: bigint;
  readonly stageCode: number;
  readonly flags: number;
  readonly bodyBytes: number;
}

export interface ResultDropReasonMetadata {
  readonly operationId: bigint;
  readonly resultSequence: bigint;
  readonly dropReasonCode: number;
  readonly sourceRole: RuntimeRole;
  readonly flags: number;
  readonly diagnosticBytes: number;
}

export interface RecoverableErrorMetadata {
  readonly errorCode: number;
  readonly errorScope: ErrorScope;
  readonly recoveryAction: number;
  readonly sourceRole: RuntimeRole;
  readonly flags: number;
  readonly retryAfterMs: number;
  readonly relatedSessionId: number;
  readonly relatedFrameId: number;
  readonly relatedViewId: number;
  readonly diagnosticBytes: number;
}

export interface RetryAfterMetadata {
  readonly scopeId: bigint;
  readonly controlSequence: bigint;
  readonly retryAfterMs: number;
  readonly jitterMs: number;
  readonly reasonCode: number;
  readonly sourceRole: RuntimeRole;
  readonly flags: number;
  readonly diagnosticBytes: number;
}

export type RuntimeControlMetadata =
  | ControlRequestMetadata
  | SchedulingMetadata
  | SupersedeMetadata
  | BudgetMetadata
  | ProgressMetadata
  | PartialResultMetadata
  | PressureMetadata
  | CapabilityMetadata
  | RouteHintMetadata
  | TraceContextMetadata
  | ResultDropReasonMetadata
  | RecoverableErrorMetadata
  | RetryAfterMetadata;

export interface DecodedRuntimeControlMetadata {
  readonly metadata: RuntimeControlMetadata;
  readonly tail: Uint8Array;
}

export type NnrpBuildMode = "backend-native" | "browser-wasm";

export type NnrpTransportKind = "tcp" | "quic" | "ipc" | "websocket";

export type NnrpConnectionLifecycleState = "open" | "closing" | "closed";

export type NnrpSessionLifecycleState = "open" | "resumed" | "closing" | "draining" | "closed";

export class NnrpSessionLifecycle {
  public readonly sessionId: number;
  public readonly state: NnrpSessionLifecycleState;
  public readonly profileId: number;
  public readonly priorityClass: NnrpSessionPriorityClass;
  public readonly schemaId: number;
  public readonly schemaVersion: number;
  public readonly maxInFlightOperations: number;
  public readonly routeScopeId: number;
  public readonly lastOperationId: bigint;
  public readonly sessionErrorCode: number;

  public constructor(options: {
    readonly sessionId: number;
    readonly state: NnrpSessionLifecycleState;
    readonly profileId: number;
    readonly priorityClass: NnrpSessionPriorityClass;
    readonly schemaId: number;
    readonly schemaVersion: number;
    readonly maxInFlightOperations: number;
    readonly routeScopeId: number;
    readonly lastOperationId: bigint;
    readonly sessionErrorCode: number;
  }) {
    validateLifecycleU32("sessionId", options.sessionId, true);
    validateLifecycleU16("profileId", options.profileId);
    validateLifecycleU32("schemaId", options.schemaId);
    validateLifecycleU32("schemaVersion", options.schemaVersion);
    validateLifecycleU16("maxInFlightOperations", options.maxInFlightOperations);
    validateLifecycleU32("routeScopeId", options.routeScopeId);
    validateU64BigInt("lastOperationId", options.lastOperationId);
    validateLifecycleU32("sessionErrorCode", options.sessionErrorCode);
    if (!NNRP_SESSION_LIFECYCLE_STATES.has(options.state)) {
      throw lifecycleError("NNRP_SESSION_LIFECYCLE_STATE_INVALID", "Session lifecycle state is not recognized.");
    }
    if (!Object.values(NnrpSessionPriorityClass).includes(options.priorityClass)) {
      throw lifecycleError("NNRP_SESSION_PRIORITY_INVALID", "Session priority class is not recognized.");
    }
    this.sessionId = options.sessionId;
    this.state = options.state;
    this.profileId = options.profileId;
    this.priorityClass = options.priorityClass;
    this.schemaId = options.schemaId;
    this.schemaVersion = options.schemaVersion;
    this.maxInFlightOperations = options.maxInFlightOperations;
    this.routeScopeId = options.routeScopeId;
    this.lastOperationId = options.lastOperationId;
    this.sessionErrorCode = options.sessionErrorCode;
  }

  public get acceptsSessionScopedMessages(): boolean {
    return this.state !== "closed";
  }

  public get acceptsNewOperations(): boolean {
    return this.state === "open" || this.state === "resumed";
  }
}

export class NnrpConnectionLifecycle {
  public readonly state: NnrpConnectionLifecycleState;
  public readonly sessions: readonly NnrpSessionLifecycle[];

  public constructor(options: {
    readonly state: NnrpConnectionLifecycleState;
    readonly sessions?: readonly NnrpSessionLifecycle[];
  }) {
    if (!NNRP_CONNECTION_LIFECYCLE_STATES.has(options.state)) {
      throw lifecycleError("NNRP_CONNECTION_LIFECYCLE_STATE_INVALID", "Connection lifecycle state is not recognized.");
    }
    const sessions = [...(options.sessions ?? [])].sort((left, right) => left.sessionId - right.sessionId);
    if (sessions.some((session) => !(session instanceof NnrpSessionLifecycle))) {
      throw lifecycleError("NNRP_CONNECTION_SESSIONS_INVALID", "Connection sessions must be lifecycle values.");
    }
    if (new Set(sessions.map((session) => session.sessionId)).size !== sessions.length) {
      throw lifecycleError("NNRP_CONNECTION_SESSION_DUPLICATE", "Connection sessions must have unique session ids.");
    }
    if (options.state === "closed" && sessions.some((session) => session.state !== "closed")) {
      throw lifecycleError("NNRP_CONNECTION_CLOSE_INVALID", "Closed connections require every session to be closed.");
    }
    this.state = options.state;
    this.sessions = Object.freeze(sessions);
  }
}

const NNRP_TRANSPORT_KINDS: ReadonlySet<NnrpTransportKind> = new Set(["tcp", "quic", "ipc", "websocket"]);
const NNRP_CONNECTION_LIFECYCLE_STATES: ReadonlySet<NnrpConnectionLifecycleState> = new Set([
  "open",
  "closing",
  "closed",
]);
const NNRP_SESSION_LIFECYCLE_STATES: ReadonlySet<NnrpSessionLifecycleState> = new Set([
  "open",
  "resumed",
  "closing",
  "draining",
  "closed",
]);

export type NnrpTransportPolicy =
  | "auto"
  | "prefer-quic"
  | "prefer-tcp"
  | "prefer-ipc"
  | "prefer-websocket"
  | "force-quic"
  | "force-tcp"
  | "force-ipc"
  | "force-websocket";

export type NnrpOperationId = bigint;

export type NnrpOperationState =
  | "accepted"
  | "running"
  | "partial"
  | "waiting-tool"
  | "superseded"
  | "cancelled"
  | "failed"
  | "completed";

export type NnrpCapability =
  | "client.session"
  | "server.session"
  | "native.loader"
  | "wasm.loader"
  | "transport.tcp"
  | "transport.quic"
  | "transport.ipc"
  | "transport.websocket"
  | "flow.update"
  | "result.hint"
  | "cache"
  | "schema"
  | "recovery"
  | "handshake.basic"
  | "session.open_close"
  | "session.resume"
  | "flow_update"
  | "frame_submit.tensor.inline"
  | "result_push.basic"
  | "cache.lifecycle"
  | "payload.typed"
  | "control.cancel_abort"
  | "control.supersede"
  | "control.priority_update"
  | "control.deadline_expire"
  | "control.progress_partial"
  | "control.credit_backpressure"
  | "control.capability_costs"
  | "control.route_execution_hint"
  | "control.trace_context"
  | "control.result_drop_reason"
  | "control.degrade_profile"
  | "control.budget_update"
  | "control.recoverable_error"
  | "object.lifecycle"
  | "object.delta"
  | "object.cost"
  | "object.ownership"
  | "cache.reference";

const NNRP_CAPABILITY_TOKENS = new Set<NnrpCapability>([
  "client.session",
  "server.session",
  "native.loader",
  "wasm.loader",
  "transport.tcp",
  "transport.quic",
  "transport.ipc",
  "transport.websocket",
  "flow.update",
  "result.hint",
  "cache",
  "schema",
  "recovery",
  "handshake.basic",
  "session.open_close",
  "session.resume",
  "flow_update",
  "frame_submit.tensor.inline",
  "result_push.basic",
  "cache.lifecycle",
  "payload.typed",
  "control.cancel_abort",
  "control.supersede",
  "control.priority_update",
  "control.deadline_expire",
  "control.progress_partial",
  "control.credit_backpressure",
  "control.capability_costs",
  "control.route_execution_hint",
  "control.trace_context",
  "control.result_drop_reason",
  "control.degrade_profile",
  "control.budget_update",
  "control.recoverable_error",
  "object.lifecycle",
  "object.delta",
  "object.cost",
  "object.ownership",
  "cache.reference",
]);

const NNRP_TRANSPORT_PROVIDER_LIMITATIONS: ReadonlySet<NnrpTransportProviderLimitation> = new Set([
  "requires-udp",
  "requires-tcp",
  "local-host-only",
  "native-host-only",
  "browser-host-only",
  "unix-domain-socket",
  "windows-named-pipe",
]);

export type NnrpDiagnosticSource = "core" | "native" | "wasm" | "transport" | "protocol" | "runtime";

export interface NnrpDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly source: NnrpDiagnosticSource;
  readonly retryable?: boolean;
  readonly transport?: NnrpTransportKind;
  readonly cause?: unknown;
}

export interface NnrpCapabilityManifest {
  readonly protocol: typeof NNRP_PROTOCOL_NAME;
  readonly version: string;
  readonly buildMode: NnrpBuildMode;
  readonly transports: readonly NnrpTransportKind[];
  readonly capabilities: readonly NnrpCapability[];
}

export type NnrpTransportRejectionReason =
  | "policy-disallowed"
  | "local-unavailable"
  | "peer-unsupported"
  | "limit-exceeded"
  | "route-unresolved"
  | "security-unsatisfied"
  | "probe-missing"
  | "probe-failed";

export type NnrpTransportProviderLimitation =
  | "requires-udp"
  | "requires-tcp"
  | "local-host-only"
  | "native-host-only"
  | "browser-host-only"
  | "unix-domain-socket"
  | "windows-named-pipe";

export type NnrpTransportProbeState = "not-run" | "succeeded" | "failed" | "missing";

export interface NnrpTransportProviderCost {
  readonly modelId: number;
  readonly units: bigint;
}

export interface NnrpTransportProviderLimits {
  readonly maxFrameBytes: bigint;
}

export interface NnrpTransportProviderMetadata {
  readonly id: string;
  readonly cost: NnrpTransportProviderCost;
  readonly preferenceRank: number;
  readonly limits: NnrpTransportProviderLimits;
  readonly limitations: readonly NnrpTransportProviderLimitation[];
}

export type NnrpTransportProviderKind = "pure-rust" | "native-dynamic" | "wasm";

export interface NnrpTransportProviderDescriptor {
  readonly name: string;
  readonly version: string;
  readonly transportId: NnrpTransportKind;
  readonly kind: NnrpTransportProviderKind;
  readonly available: boolean;
  readonly libraryPath?: string;
  readonly metadata: NnrpTransportProviderMetadata;
  readonly diagnostic?: string;
}

export interface NnrpTransportProviderObservation {
  readonly kind: NnrpTransportKind;
  readonly metadata: NnrpTransportProviderMetadata;
  readonly localAvailable: boolean;
  readonly diagnostic?: NnrpDiagnostic;
}

export interface NnrpTransportProbeMetrics {
  readonly sampleCount: number;
  readonly successCount: number;
  readonly medianThroughputBytesPerSecond: bigint;
  readonly medianRttMicroseconds: bigint;
}

export interface NnrpTransportCandidateReadiness {
  readonly transportId: NnrpTransportKind;
  readonly providerId: string;
  readonly routeResolved: boolean;
  readonly securitySatisfied: boolean;
  readonly diagnostic?: string;
}

export interface NnrpTransportProbeObservation {
  readonly transportId: NnrpTransportKind;
  readonly providerId: string;
  readonly state: "succeeded" | "failed";
  readonly metrics?: NnrpTransportProbeMetrics;
  readonly diagnostic?: string;
}

export interface NnrpTransportClientSecurity {
  readonly mode: "client";
  readonly serverName: string;
  readonly trustedCertificateDer: Uint8Array;
}

export interface NnrpTransportServerSecurity {
  readonly mode: "server";
  readonly certificateDer: Uint8Array;
  readonly privateKeyPkcs8Der: Uint8Array;
}

export type NnrpTransportSecurity = NnrpTransportClientSecurity | NnrpTransportServerSecurity;

export interface NnrpClientProviderRoute {
  readonly endpoint?: NnrpProviderEndpoint;
  readonly security?: NnrpTransportClientSecurity;
}

export interface NnrpServerProviderRoute {
  readonly endpoint?: NnrpProviderEndpoint;
  readonly security?: NnrpTransportServerSecurity;
}

export type NnrpClientProviderRoutes = Readonly<Partial<Record<NnrpTransportKind, NnrpClientProviderRoute>>>;

export type NnrpServerProviderRoutes = Readonly<Partial<Record<NnrpTransportKind, NnrpServerProviderRoute>>>;

export interface NnrpTransportCandidate {
  readonly transportId: NnrpTransportKind;
  readonly provider: NnrpTransportProviderMetadata;
  readonly localAvailable: boolean;
  readonly peerSupported: boolean;
  readonly withinLimits: boolean;
  readonly probeState: NnrpTransportProbeState;
  readonly probe?: NnrpTransportProbeMetrics;
  readonly selectionRank?: number;
  readonly rejectionReason?: NnrpTransportRejectionReason;
  readonly diagnostic?: string;
}

export interface NnrpTransportEndpoint {
  readonly endpoint: string | URL;
  readonly maxPacketBytes?: bigint;
  readonly timeoutMillis?: number;
  readonly security?: NnrpTransportSecurity;
}

export interface NnrpTransportProbeOptions extends NnrpTransportEndpoint {
  readonly sampleCount?: number;
  readonly payloadBytes?: number;
}

export interface NnrpTransportReceiveOptions {
  readonly maxPackets?: number;
  readonly maxBytes?: bigint;
  readonly timeoutMillis?: number;
}

export interface NnrpTransportAcceptOptions {
  readonly timeoutMillis?: number;
}

const NNRP_DEFAULT_PORT = 4433;

export class NnrpEndpoint {
  public readonly uri: string;
  readonly #url: URL;

  public constructor(uri: string | URL) {
    const parsed = parseApplicationEndpointUrl(uri);
    this.uri = parsed.toString();
    this.#url = parsed;
  }

  public static parse(uri: string | URL): NnrpEndpoint {
    return new NnrpEndpoint(uri);
  }

  public get protocol(): "nnrp:" | "nnrps:" {
    return this.#url.protocol as "nnrp:" | "nnrps:";
  }

  public get host(): string {
    return this.#url.host;
  }

  public get hostname(): string {
    return this.#url.hostname;
  }

  public get port(): string {
    return this.#url.port;
  }

  public get pathname(): string {
    return this.#url.pathname;
  }

  public get search(): string {
    return this.#url.search;
  }

  public get hash(): string {
    return this.#url.hash;
  }

  public get secure(): boolean {
    return this.protocol === "nnrps:";
  }

  public toString(): string {
    return this.uri;
  }
}

export class NnrpProviderEndpoint {
  public readonly uri: string;
  public readonly scheme: "tcp" | "quic" | "unix" | "npipe" | "ws" | "wss";

  public constructor(uri: string | URL) {
    const value = uri instanceof URL ? uri.toString() : uri.trim();
    const schemeEnd = value.indexOf("://");
    const scheme = schemeEnd < 0 ? "" : value.slice(0, schemeEnd);
    if (!isProviderEndpointScheme(scheme)) {
      throw invalidProviderEndpoint(undefined, "Provider endpoint uses an unsupported or missing scheme.");
    }
    const locator = value.slice(schemeEnd + 3);
    if (locator.length === 0 || value.includes("#")) {
      throw invalidProviderEndpoint(undefined, "Provider endpoint requires a locator and must not contain a fragment.");
    }
    if (scheme === "unix" && (!locator.startsWith("/") || locator === "/" || locator.includes("?"))) {
      throw invalidProviderEndpoint(undefined, "unix provider endpoint requires an absolute socket path.");
    }
    if (scheme === "npipe" && (locator.includes("?") || locator.includes("@"))) {
      throw invalidProviderEndpoint(undefined, "npipe provider endpoint contains an invalid locator.");
    }
    if (scheme !== "unix" && scheme !== "npipe") {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch (cause) {
        throw invalidProviderEndpoint(undefined, "Provider endpoint is malformed.", cause);
      }
      if (parsed.host.length === 0 || parsed.username.length > 0 || parsed.password.length > 0) {
        throw invalidProviderEndpoint(undefined, "Provider endpoint requires an authority without user information.");
      }
    }
    this.uri = value;
    this.scheme = scheme;
  }

  public static parse(uri: string | URL): NnrpProviderEndpoint {
    return new NnrpProviderEndpoint(uri);
  }

  public matchesTransport(transport: NnrpTransportKind): boolean {
    return (transport === "tcp" && this.scheme === "tcp") || (transport === "quic" && this.scheme === "quic") ||
      (transport === "ipc" && (this.scheme === "unix" || this.scheme === "npipe")) ||
      (transport === "websocket" && (this.scheme === "ws" || this.scheme === "wss"));
  }

  public get secure(): boolean {
    return this.scheme === "wss";
  }

  public toString(): string {
    return this.uri;
  }
}

export interface NnrpTransportConnection {
  readonly kind: NnrpTransportKind;
  readonly endpoint: string;
  readonly connected: boolean;
  send(packets: Uint8Array | readonly Uint8Array[]): Promise<void>;
  receive(options?: NnrpTransportReceiveOptions): Promise<readonly Uint8Array[]>;
  close(): void | Promise<void>;
}

export interface NnrpTransportServer {
  readonly kind: NnrpTransportKind;
  readonly endpoint: string;
  readonly listening: boolean;
  accept(options?: NnrpTransportAcceptOptions): Promise<NnrpTransportConnection>;
  close(): void | Promise<void>;
}

export interface NnrpNativeTransportBinding {
  readonly mode: "deno-ffi" | "node-addon" | "managed-ffi" | "test";
  probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
  connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
  listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}

export interface NnrpTransportProvider extends NnrpTransportProviderObservation {
  readonly descriptor: NnrpTransportProviderDescriptor;
  readonly endpointSchemes: readonly string[];
  probe?(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
  connect?(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
  listen?(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}

export interface NnrpTransportSelection {
  readonly selectedProvider: NnrpTransportProviderDescriptor;
  readonly candidates: readonly NnrpTransportCandidate[];
  readonly policy: NnrpTransportPolicy;
  readonly diagnostic?: string;
}

export interface NnrpTransportSelectionOptions {
  readonly peerSupportedTransports: readonly NnrpTransportKind[];
  readonly policy: NnrpTransportPolicy;
  readonly requestedMaxFrameBytes?: bigint;
  readonly candidateReadiness: readonly NnrpTransportCandidateReadiness[];
  readonly probeObservations: readonly NnrpTransportProbeObservation[];
}

export type NnrpTransportSelectionErrorCode =
  | "INVALID_EVIDENCE"
  | "FORCED_TRANSPORT_UNAVAILABLE"
  | "NO_VIABLE_TRANSPORT";

export interface NnrpTransportSelectionSummary {
  readonly policy: NnrpTransportPolicy;
  readonly selected: NnrpTransportKind | null;
  readonly rejected: readonly NnrpRejectedTransportCandidate[];
  readonly candidates: readonly NnrpTransportCandidate[];
}

export interface NnrpRejectedTransportCandidate {
  readonly transportId: NnrpTransportKind;
  readonly provider: NnrpTransportProviderMetadata;
  readonly reason: NnrpTransportRejectionReason;
  readonly diagnostic?: string;
}

export const NNRP_STANDARD_INPUT_PROFILES = ["tensor", "token", "structured_event", "tool_delta"] as const;

export type NnrpInputProfile = (typeof NNRP_STANDARD_INPUT_PROFILES)[number];

export enum NnrpSubmitMode {
  Inline = 0,
  Reference = 1,
  Mixed = 2,
}

export enum NnrpHeaderFlags {
  None = 0,
  AckRequired = 0x0000_0001,
  CanDrop = 0x0000_0002,
  Stale = 0x0000_0004,
  EndOfStream = 0x0000_0008,
  Retransmit = 0x0000_0010,
  Keyframe = 0x0000_0020,
}

export enum NnrpBudgetPolicy {
  None = 0,
  AllowPartial = 0x01,
  AllowStaleReuse = 0x02,
  AllowDegraded = 0x04,
  AllowDrop = 0x08,
}

export enum NnrpLossTolerancePolicy {
  Strict = 0,
  BestEffort = 1,
  LowLatency = 2,
  FireAndForget = 3,
  InheritSession = 0xff,
}

export enum NnrpTensorInputProfile {
  Unspecified = 0,
  ChangedTilesLuma = 1,
  DenseLumaFrame = 2,
}

export enum NnrpTileIndexMode {
  DenseRange = 0,
  RawU16 = 1,
  DeltaU16 = 2,
  Bitset = 3,
}

export type NnrpSubmitCapacityPolicy = "reject" | "await";

export type NnrpBinaryPayload = Uint8Array | ArrayBufferView;

export interface NnrpSubmitHeaderContext {
  readonly flags: NnrpHeaderFlags | number;
  readonly viewId: number;
  readonly routeId: number;
  readonly traceId: bigint;
}

export interface NnrpSubmitIdentity {
  readonly operationId: bigint;
  readonly frameId: number;
  readonly header: NnrpSubmitHeaderContext;
}

export interface NnrpSubmitPolicy {
  readonly frameClass: number;
  readonly latencyBudgetMs: number;
  readonly targetFpsX100: number;
  readonly retryOfFrame: number;
  readonly budgetPolicy: NnrpBudgetPolicy | number;
  readonly lossTolerancePolicy: NnrpLossTolerancePolicy | number;
  readonly dependencyFrameId: number;
}

export interface NnrpTensorSection {
  readonly roleId: number;
  readonly defaultCodecId: number;
  readonly dtypeId: number;
  readonly layoutId: number;
  readonly scalePolicy: number;
  readonly elementCountPerTile: number;
  readonly tilePayloads: readonly NnrpBinaryPayload[];
  readonly codecIds: readonly number[];
  readonly payloadStrideBytes: number;
}

export interface NnrpObjectReferenceBlock {
  readonly objectKind: NnrpCacheObjectKind;
  readonly refFlags: number;
  readonly cacheNamespace: number;
  readonly cacheKeyHi: bigint;
  readonly cacheKeyLo: bigint;
}

export interface NnrpSubmitObjectReferences {
  readonly camera?: NnrpObjectReferenceBlock;
  readonly tileIndex?: NnrpObjectReferenceBlock;
  readonly tensorSectionTable?: NnrpObjectReferenceBlock;
}

export interface NnrpTensorSubmitInput {
  readonly identity: NnrpSubmitIdentity;
  readonly policy: NnrpSubmitPolicy;
  readonly srcWidth: number;
  readonly srcHeight: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tileIds: readonly number[];
  readonly sections: readonly NnrpTensorSection[];
  readonly cameraBlock: NnrpBinaryPayload;
  readonly inputProfile: NnrpTensorInputProfile;
  readonly tileIndexMode: NnrpTileIndexMode;
  readonly tileBaseId: number;
  readonly references: NnrpSubmitObjectReferences;
}

export interface NnrpTokenChunk {
  readonly payload: NnrpBinaryPayload;
  readonly descriptorFlags?: NnrpTypedPayloadDescriptorFlags;
}

export interface NnrpTokenSubmitInput {
  readonly identity: NnrpSubmitIdentity;
  readonly policy: NnrpSubmitPolicy;
  readonly chunks: readonly NnrpTokenChunk[];
}

export interface NnrpTypedPayloadInputFrame {
  readonly profileId: number;
  readonly payloadKind: NnrpPayloadKind;
  readonly descriptorFlags?: NnrpTypedPayloadDescriptorFlags;
  readonly schemaId?: number;
  readonly schemaVersion?: number;
  readonly streamSemantics?: number;
  readonly payload: NnrpBinaryPayload;
}

export interface NnrpTypedPayloadSubmitInput {
  readonly identity: NnrpSubmitIdentity;
  readonly policy: NnrpSubmitPolicy;
  readonly frames: readonly NnrpTypedPayloadInputFrame[];
}

export interface NnrpCacheKey {
  readonly kind: NnrpCacheObjectKind;
  readonly key: bigint | number | string;
  readonly namespaceId?: number;
}

export interface NnrpCacheMetadata {
  readonly key: NnrpCacheKey;
  readonly version?: bigint | number | string;
  readonly leaseMillis?: number;
  readonly dependencies?: readonly NnrpCacheKey[];
}

export type NnrpCacheOperationStatus = "accepted" | "stored" | "invalidated" | "miss" | "rejected";

export interface NnrpCachePutRequest {
  readonly key: NnrpCacheKey;
  readonly payload?: NnrpBinaryPayload;
  readonly descriptor?: NnrpPayloadDescriptor;
  readonly leaseMillis?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpCachePutResult {
  readonly key: NnrpCacheKey;
  readonly status: Extract<NnrpCacheOperationStatus, "accepted" | "stored" | "rejected">;
  readonly version?: bigint | number | string;
  readonly diagnostic?: NnrpDiagnostic;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpCacheInvalidateRequest {
  readonly key: NnrpCacheKey;
  readonly version?: bigint | number | string;
  readonly recursive?: boolean;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpCacheInvalidateResult {
  readonly key: NnrpCacheKey;
  readonly status: Extract<NnrpCacheOperationStatus, "invalidated" | "miss" | "rejected">;
  readonly diagnostic?: NnrpDiagnostic;
  readonly metadata?: Readonly<Record<string, string>>;
}

export type NnrpSchemaFlag = "required" | "streamable" | "lossless" | "opaque";

export interface NnrpSchemaDescriptor {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly flags?: readonly NnrpSchemaFlag[];
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpPayloadDescriptor {
  readonly profile: NnrpInputProfile;
  readonly schema?: NnrpSchemaDescriptor;
  readonly cache?: NnrpCacheMetadata;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpSubmitRequest {
  readonly operationId: bigint;
  readonly frameId: number;
  readonly header: NnrpSubmitHeaderContext;
  readonly metadata: NnrpSubmitMetadata;
  readonly body: Uint8Array;
}

export interface NnrpSubmitMetadata {
  readonly srcWidth: number;
  readonly srcHeight: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tileCount: number;
  readonly sectionCount: number;
  readonly frameClass: number;
  readonly inputProfile: NnrpTensorInputProfile;
  readonly tileIndexMode: NnrpTileIndexMode;
  readonly latencyBudgetMs: number;
  readonly targetFpsX100: number;
  readonly retryOfFrame: number;
  readonly tileBaseId: number;
  readonly cameraBytes: number;
  readonly tileIndexBytes: number;
  readonly submitMode: NnrpSubmitMode;
  readonly budgetPolicy: NnrpBudgetPolicy | number;
  readonly lossTolerancePolicy: NnrpLossTolerancePolicy | number;
  readonly objectRefMask: number;
  readonly dependencyFrameId: number;
  readonly payloadKindBitmap: number;
  readonly payloadFrameCount: number;
}

export type NnrpNormalizedSubmitRequest = NnrpSubmitRequest;

export enum NnrpResultClass {
  Complete = 0,
  Partial = 1,
  StaleReuse = 2,
  Degraded = 3,
}

export interface NnrpResultPushMetadata {
  readonly statusCode: number;
  readonly resultFlags: number;
  readonly sectionCount: number;
  readonly tileCount: number;
  readonly activeProfileId: number;
  readonly inferenceMs: number;
  readonly queueMs: number;
  readonly serverTotalMs: number;
  readonly tileBaseId: number;
  readonly tileIndexBytes: number;
  readonly resultClass: NnrpResultClass;
  readonly appliedBudgetPolicy: number;
  readonly reusedFrameId: number;
  readonly coveredTileCount: number;
  readonly droppedTileCount: number;
  readonly payloadKindBitmap: number;
  readonly payloadFrameCount: number;
}

export enum NnrpFlowScopeKind {
  Connection = 0,
  Session = 1,
  Operation = 2,
}

export enum NnrpFlowUpdateReason {
  Grant = 0,
  Reduce = 1,
  Pause = 2,
  Resume = 3,
  Congestion = 4,
}

export enum NnrpBackpressureLevel {
  None = 0,
  Soft = 1,
  Hard = 2,
  Paused = 3,
}

export interface NnrpFlowUpdateMetadata {
  readonly scopeKind: NnrpFlowScopeKind;
  readonly updateReason: NnrpFlowUpdateReason;
  readonly backpressureLevel: NnrpBackpressureLevel;
  readonly connectionCredit: number;
  readonly sessionCredit: number;
  readonly operationCredit: number;
  readonly operationId: bigint;
  readonly retryAfterMs: number;
  readonly creditEpoch: number;
  readonly flowFlags: number;
}

export enum NnrpResultHintBudgetPolicy {
  None = 0,
  Full = 1,
  Partial = 2,
  StaleReuse = 3,
  Drop = 4,
}

export enum NnrpResultHintCongestionState {
  None = 0,
  Steady = 1,
  Elevated = 2,
  Saturated = 3,
}

export enum NnrpResultHintReason {
  None = 0,
  QueueFull = 1,
  ServerBusy = 2,
  BudgetExceeded = 3,
  Superseded = 4,
}

export interface NnrpResultHintMetadata {
  readonly appliedBudgetPolicy: NnrpResultHintBudgetPolicy;
  readonly congestionState: NnrpResultHintCongestionState;
  readonly reason: NnrpResultHintReason;
  readonly retryAfterMs: number;
}

export enum NnrpSessionCloseReason {
  Normal = 0,
  ClientShutdown = 1,
  ServerShutdown = 2,
  IdleTimeout = 3,
  ProtocolError = 4,
  AuthRevoked = 5,
}

export enum NnrpInFlightPolicy {
  Drain = 0,
  Abort = 1,
}

export interface NnrpSessionCloseMetadata {
  readonly closeReason: NnrpSessionCloseReason;
  readonly inFlightPolicy: NnrpInFlightPolicy;
  readonly drainTimeoutMs: number;
  readonly lastOperationId: bigint;
  readonly sessionErrorCode: number;
  readonly sessionCloseTag: number;
}

export interface NnrpRuntimeFrameHeader {
  readonly versionMajor: 1;
  readonly wireFormat: 0;
  readonly messageType: NnrpMessageType;
  readonly flags: NnrpHeaderFlags | number;
  readonly sessionId: number;
  readonly frameId: number;
  readonly viewId: number;
  readonly routeId: number;
  readonly traceId: bigint;
}

export interface NnrpFrameSubmitMetadata extends NnrpSubmitMetadata {
  readonly operationId: bigint;
}

export type NnrpRuntimeEventMetadata =
  | { readonly type: "none" }
  | { readonly type: "frame_submit"; readonly value: NnrpFrameSubmitMetadata }
  | { readonly type: "result_push"; readonly value: NnrpResultPushMetadata }
  | { readonly type: "result_hint"; readonly value: NnrpResultHintMetadata }
  | { readonly type: "control_request"; readonly value: ControlRequestMetadata }
  | { readonly type: "scheduling"; readonly value: SchedulingMetadata }
  | { readonly type: "supersede"; readonly value: SupersedeMetadata }
  | { readonly type: "budget"; readonly value: BudgetMetadata }
  | { readonly type: "progress"; readonly value: ProgressMetadata }
  | { readonly type: "partial_result"; readonly value: PartialResultMetadata }
  | { readonly type: "pressure"; readonly value: PressureMetadata }
  | { readonly type: "capability"; readonly value: CapabilityMetadata }
  | { readonly type: "route_hint"; readonly value: RouteHintMetadata }
  | { readonly type: "trace_context"; readonly value: TraceContextMetadata }
  | { readonly type: "result_drop_reason"; readonly value: ResultDropReasonMetadata }
  | { readonly type: "recoverable_error"; readonly value: RecoverableErrorMetadata }
  | { readonly type: "retry_after"; readonly value: RetryAfterMetadata }
  | { readonly type: "flow_update"; readonly value: NnrpFlowUpdateMetadata }
  | { readonly type: "object_descriptor"; readonly value: ObjectDescriptorMetadata }
  | { readonly type: "object_reference"; readonly value: ObjectReferenceMetadata }
  | { readonly type: "object_release"; readonly value: ObjectReleaseMetadata }
  | { readonly type: "object_delta"; readonly value: ObjectDeltaMetadata }
  | { readonly type: "cache_reference"; readonly value: CacheReferenceMetadata }
  | { readonly type: "cache_miss"; readonly value: CacheMissMetadata }
  | { readonly type: "cache_invalidate"; readonly value: CacheInvalidateMetadata }
  | { readonly type: "session_close"; readonly value: NnrpSessionCloseMetadata };

export type NnrpRuntimeEventTail =
  | { readonly type: "none" }
  | { readonly type: "body"; readonly body: Uint8Array }
  | { readonly type: "diagnostic"; readonly diagnostic: Uint8Array }
  | {
    readonly type: "metadata_body_and_delta";
    readonly metadataBody: Uint8Array;
    readonly delta: Uint8Array;
  };

export interface NnrpRuntimeEvent {
  readonly header: NnrpRuntimeFrameHeader;
  readonly metadata: NnrpRuntimeEventMetadata;
  readonly tail: NnrpRuntimeEventTail;
}

export interface NnrpOperationLifecycleEvent {
  readonly operationId: bigint;
  readonly state: NnrpOperationState;
}

export type NnrpClientEvent =
  | { readonly type: "runtime"; readonly event: NnrpRuntimeEvent }
  | { readonly type: "lifecycle"; readonly event: NnrpOperationLifecycleEvent };

export type NnrpTerminalEvent =
  | { readonly type: "runtime"; readonly event: NnrpRuntimeEvent }
  | { readonly type: "lifecycle"; readonly event: NnrpOperationLifecycleEvent };

export type NnrpResultTerminalState = "success" | "cancelled" | "dropped" | "error";

export interface NnrpResult {
  readonly operationId: bigint;
  readonly terminalState: NnrpResultTerminalState;
  readonly event: NnrpTerminalEvent;
}

export interface NnrpRecoveryToken {
  readonly token: string | Uint8Array;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpSessionMigrationRequest {
  readonly recoveryToken: NnrpRecoveryToken;
  readonly targetEndpoint?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export type NnrpSessionMigrationEvent =
  | {
    readonly type: "migration-requested";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | {
    readonly type: "migration-accepted";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic?: NnrpDiagnostic;
  }
  | {
    readonly type: "migration-rejected";
    readonly sessionId?: string;
    readonly recoveryToken: NnrpRecoveryToken;
    readonly targetEndpoint?: string;
    readonly diagnostic: NnrpDiagnostic;
  };

export interface NnrpAbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener?(type: "abort", listener: () => void, options?: { readonly once?: boolean }): void;
  removeEventListener?(type: "abort", listener: () => void): void;
}

export interface NnrpEventPollOptions {
  readonly timeoutMillis?: number;
  readonly signal?: NnrpAbortSignalLike;
}

export interface NnrpSubmitOptions {
  readonly timeoutMillis?: number;
  readonly signal?: NnrpAbortSignalLike;
}

export interface NnrpSessionMetadataOptions {
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NnrpSessionFlowControlOptions {
  readonly submitCapacityPolicy?: NnrpSubmitCapacityPolicy;
  readonly initialCredits?: number;
}

export interface NnrpSessionPatchRequest extends NnrpSessionMetadataOptions, NnrpSessionFlowControlOptions {
  readonly inputProfile?: NnrpInputProfile;
  readonly targetCadence?: number;
  readonly qualityTier?: number;
}

export interface NnrpSessionPatchResult {
  readonly accepted: boolean;
  readonly sessionId?: number;
  readonly diagnostic?: NnrpDiagnostic;
  readonly metadata?: Readonly<Record<string, string>>;
}

export class NnrpError<TDiagnostic extends NnrpDiagnostic | string = NnrpDiagnostic> extends Error {
  public readonly diagnostic: TDiagnostic;

  public constructor(diagnostic: TDiagnostic) {
    super(typeof diagnostic === "string" ? diagnostic : diagnostic.message);
    this.name = "NnrpError";
    this.diagnostic = diagnostic;
  }
}

export class NnrpCapabilityError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpCapabilityError";
  }
}

export class NnrpTransportError<TDiagnostic extends NnrpDiagnostic | string = NnrpDiagnostic>
  extends NnrpError<TDiagnostic> {
  public constructor(diagnostic: TDiagnostic) {
    super(diagnostic);
    this.name = "NnrpTransportError";
  }
}

export class NnrpTransportSelectionError extends NnrpTransportError<string> {
  public readonly code: NnrpTransportSelectionErrorCode;
  public readonly policy?: NnrpTransportPolicy;
  public readonly transportId?: NnrpTransportKind;
  public readonly candidates: readonly NnrpTransportCandidate[];

  public constructor(
    code: NnrpTransportSelectionErrorCode,
    diagnostic: string,
    evidence: {
      readonly policy?: NnrpTransportPolicy;
      readonly transportId?: NnrpTransportKind;
      readonly candidates?: readonly NnrpTransportCandidate[];
    } = {},
  ) {
    super(diagnostic);
    this.name = "NnrpTransportSelectionError";
    this.code = code;
    if (evidence.policy !== undefined) this.policy = evidence.policy;
    if (evidence.transportId !== undefined) this.transportId = evidence.transportId;
    this.candidates = Object.freeze([...(evidence.candidates ?? [])]);
  }
}

export class NnrpTimeoutError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpTimeoutError";
  }
}

export class NnrpProtocolError extends NnrpError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpProtocolError";
  }
}

export function encodeRuntimeControlMetadata(
  messageType: NnrpMessageType,
  metadata: RuntimeControlMetadata,
  tail: Uint8Array = new Uint8Array(),
): Uint8Array {
  const layout = getRuntimeControlLayout(messageType);
  if (!(tail instanceof Uint8Array)) {
    throw runtimeControlError("NNRP_CONTROL_TAIL_INVALID", "Runtime control tail must be a Uint8Array.");
  }

  validateRuntimeControlMetadata(layout, metadata);
  const ownedTail = tail.slice();
  validateRuntimeControlTail(layout, metadata, ownedTail.byteLength);

  const encoded = new Uint8Array(layout.length + ownedTail.byteLength);
  const view = new DataView(encoded.buffer);
  const values = metadata as unknown as Record<string, unknown>;
  for (const field of layout.fields) {
    writeRuntimeInteger(view, field, values[field.name]);
  }
  encoded.set(ownedTail, layout.length);
  return encoded;
}

export function decodeRuntimeControlMetadata(
  messageType: NnrpMessageType,
  payload: Uint8Array,
): DecodedRuntimeControlMetadata {
  const layout = getRuntimeControlLayout(messageType);
  if (!(payload instanceof Uint8Array)) {
    throw runtimeControlError("NNRP_CONTROL_PAYLOAD_INVALID", "Runtime control payload must be a Uint8Array.");
  }
  if (payload.byteLength < layout.length) {
    throw runtimeControlError(
      "NNRP_CONTROL_METADATA_TRUNCATED",
      `Runtime control metadata requires ${layout.length} bytes but received ${payload.byteLength}.`,
    );
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (const reserved of layout.reserved ?? []) {
    const reservedValue = readRuntimeInteger(view, reserved);
    if (reservedValue !== 0 && reservedValue !== 0n) {
      throw runtimeControlError(
        "NNRP_CONTROL_RESERVED_NONZERO",
        `Runtime control reserved field at offset ${reserved.offset} must be zero.`,
      );
    }
  }

  const decoded: Record<string, bigint | number> = {};
  for (const field of layout.fields) {
    decoded[field.name] = readRuntimeInteger(view, field);
  }
  const metadata = decoded as unknown as RuntimeControlMetadata;
  validateRuntimeControlMetadata(layout, metadata);

  const tail = payload.slice(layout.length);
  validateRuntimeControlTail(layout, metadata, tail.byteLength);
  return { metadata, tail };
}

export function encodeRuntimeObjectMetadata(
  messageType: NnrpMessageType,
  metadata: RuntimeObjectMetadata,
  tail: Uint8Array = new Uint8Array(),
): Uint8Array {
  return encodeRuntimeObjectMetadataTailSegments(messageType, metadata, [tail], false);
}

export function encodeRuntimeObjectMetadataSegments(
  messageType: NnrpMessageType,
  metadata: RuntimeObjectMetadata,
  tailSegments: readonly Uint8Array[],
): Uint8Array {
  return encodeRuntimeObjectMetadataTailSegments(messageType, metadata, tailSegments, true);
}

function encodeRuntimeObjectMetadataTailSegments(
  messageType: NnrpMessageType,
  metadata: RuntimeObjectMetadata,
  tailSegments: readonly Uint8Array[],
  validateSemanticSegments: boolean,
): Uint8Array {
  const layout = getRuntimeObjectLayout(messageType);
  if (!Array.isArray(tailSegments)) {
    throw runtimeObjectError("NNRP_OBJECT_TAIL_INVALID", "Runtime object tail segments must be an array.");
  }

  let tailBytes = 0;
  for (const segment of tailSegments) {
    if (!(segment instanceof Uint8Array)) {
      throw runtimeObjectError("NNRP_OBJECT_TAIL_INVALID", "Every runtime object tail segment must be a Uint8Array.");
    }
    tailBytes += segment.byteLength;
  }

  validateRuntimeObjectMetadata(layout, metadata);
  if (
    validateSemanticSegments &&
    (messageType === NnrpMessageType.ObjectPatch || messageType === NnrpMessageType.ObjectDelta)
  ) {
    if (tailSegments.length !== 2) {
      throw runtimeObjectError(
        "NNRP_OBJECT_TAIL_INVALID",
        "Object patch and delta segmented tails require [metadataBody, delta].",
      );
    }
    const deltaMetadata = metadata as ObjectDeltaMetadata;
    validateRuntimeObjectTailSegment("metadataBody", deltaMetadata.metadataBytes, tailSegments[0]);
    validateRuntimeObjectTailSegment("delta", deltaMetadata.deltaBytes, tailSegments[1]);
  }
  validateRuntimeObjectTail(layout, metadata, tailBytes);

  const encoded = new Uint8Array(layout.length + tailBytes);
  const view = new DataView(encoded.buffer);
  const values = metadata as unknown as Record<string, unknown>;
  for (const field of layout.fields) {
    writeRuntimeInteger(view, field, values[field.name]);
  }
  let offset = layout.length;
  for (const segment of tailSegments) {
    encoded.set(segment, offset);
    offset += segment.byteLength;
  }
  return encoded;
}

function validateRuntimeObjectTailSegment(name: string, declaredBytes: number, segment: Uint8Array): void {
  if (segment.byteLength !== declaredBytes) {
    throw runtimeObjectError(
      "NNRP_OBJECT_TAIL_LENGTH_INVALID",
      `Object delta ${name} declares ${declaredBytes} bytes but received ${segment.byteLength}.`,
    );
  }
}

export function decodeRuntimeObjectMetadata(
  messageType: NnrpMessageType,
  payload: Uint8Array,
): DecodedRuntimeObjectMetadata {
  const layout = getRuntimeObjectLayout(messageType);
  if (!(payload instanceof Uint8Array)) {
    throw runtimeObjectError("NNRP_OBJECT_PAYLOAD_INVALID", "Runtime object payload must be a Uint8Array.");
  }
  if (payload.byteLength < layout.length) {
    throw runtimeObjectError(
      "NNRP_OBJECT_METADATA_TRUNCATED",
      `Runtime object metadata requires ${layout.length} bytes but received ${payload.byteLength}.`,
    );
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (const reserved of layout.reserved ?? []) {
    const reservedValue = readRuntimeInteger(view, reserved);
    if (reservedValue !== 0 && reservedValue !== 0n) {
      throw runtimeObjectError(
        "NNRP_OBJECT_RESERVED_NONZERO",
        `Runtime object reserved field at offset ${reserved.offset} must be zero.`,
      );
    }
  }

  const decoded: Record<string, bigint | number> = {};
  for (const field of layout.fields) {
    decoded[field.name] = readRuntimeInteger(view, field);
  }
  const metadata = decoded as unknown as RuntimeObjectMetadata;
  validateRuntimeObjectMetadata(layout, metadata);

  const tail = payload.slice(layout.length);
  validateRuntimeObjectTail(layout, metadata, tail.byteLength);
  return { metadata, tail };
}

export function encodeCacheInvalidateMetadata(metadata: CacheInvalidateMetadata): Uint8Array {
  validateCacheInvalidateMetadata(metadata);
  const encoded = new Uint8Array(32);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, metadata.invalidateScope, true);
  view.setUint32(4, metadata.cacheNamespace, true);
  view.setBigUint64(8, metadata.cacheKeyHi, true);
  view.setBigUint64(16, metadata.cacheKeyLo, true);
  view.setUint32(24, metadata.reasonCode, true);
  return encoded;
}

export function decodeCacheInvalidateMetadata(payload: Uint8Array): CacheInvalidateMetadata {
  if (!(payload instanceof Uint8Array)) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_PAYLOAD_INVALID",
      "Cache invalidate metadata must be a Uint8Array.",
    );
  }
  if (payload.byteLength !== 32) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_LENGTH_INVALID",
      `Cache invalidate metadata requires exactly 32 bytes but received ${payload.byteLength}.`,
    );
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (view.getUint32(28, true) !== 0) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_RESERVED_NONZERO",
      "Cache invalidate reserved field must be zero.",
    );
  }
  const metadata: CacheInvalidateMetadata = {
    invalidateScope: view.getUint32(0, true),
    cacheNamespace: view.getUint32(4, true),
    cacheKeyHi: view.getBigUint64(8, true),
    cacheKeyLo: view.getBigUint64(16, true),
    reasonCode: view.getUint32(24, true),
  };
  validateCacheInvalidateMetadata(metadata);
  return metadata;
}

export class NnrpResultDropError extends NnrpProtocolError {
  public readonly event: NnrpRuntimeEvent;
  public readonly frameId: number;
  public readonly sessionId: number;

  public constructor(event: NnrpRuntimeEvent) {
    super({
      code: "NNRP_RESULT_DROPPED",
      message: "The runtime established a dropped terminal result.",
      source: "protocol",
      retryable: false,
    });
    this.name = "NnrpResultDropError";
    this.event = event;
    this.frameId = event.header.frameId;
    this.sessionId = event.header.sessionId;
  }
}

export class NnrpRecoveryError extends NnrpCapabilityError {
  public constructor(diagnostic: NnrpDiagnostic) {
    super(diagnostic);
    this.name = "NnrpRecoveryError";
  }
}

export interface NnrpCapabilityManifestOptions {
  readonly buildMode: NnrpBuildMode;
  readonly transports?: readonly NnrpTransportKind[];
  readonly capabilities?: readonly NnrpCapability[];
}

export function createCapabilityManifest(options: NnrpCapabilityManifestOptions): NnrpCapabilityManifest {
  validateCapabilityManifestOptions(options);

  return {
    protocol: NNRP_PROTOCOL_NAME,
    version: NNRP_PROTOCOL_VERSION,
    buildMode: options.buildMode,
    transports: [...(options.transports ?? [])],
    capabilities: [...(options.capabilities ?? [])],
  };
}

export function createBackendNativeManifest(
  capabilities: readonly NnrpCapability[] = [],
): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "backend-native",
    transports: ["tcp", "quic"],
    capabilities: ["client.session", "server.session", "native.loader", ...capabilities],
  });
}

export function createBrowserWasmManifest(
  capabilities: readonly NnrpCapability[] = [],
): NnrpCapabilityManifest {
  return createCapabilityManifest({
    buildMode: "browser-wasm",
    transports: ["websocket"],
    capabilities: ["client.session", "wasm.loader", ...capabilities],
  });
}

export function selectTransport(
  providers: readonly NnrpTransportProviderDescriptor[],
  options: NnrpTransportSelectionOptions,
): NnrpTransportSelection {
  const candidates = createTransportCandidates(providers, options);
  const policy = options.policy;
  validateTransportSelectionCandidates(candidates);
  const evaluated = candidates.map((candidate) => evaluateTransportCandidate(candidate, policy));
  const eligible = evaluated.filter((candidate) => candidate.rejectionReason === undefined);
  const ordered = eligible.length <= 1 ? eligible.map(directTransportCandidate) : eligible
    .filter((candidate) => candidate.probeState === "succeeded" && candidate.probe !== undefined)
    .sort((left, right) => compareTransportCandidates(left, right, policy))
    .map((candidate, selectionRank) => ({ ...candidate, selectionRank }));
  const orderedKeys = new Set(ordered.map(candidateIdentity));
  const rejected = evaluated
    .filter((candidate) => !orderedKeys.has(candidateIdentity(candidate)))
    .map((candidate) => {
      if (eligible.length > 1 && candidate.rejectionReason === undefined) {
        const probeState = candidate.probeState === "failed" ? "failed" : "missing";
        return {
          ...candidate,
          probeState,
          rejectionReason: probeState === "failed" ? "probe-failed" : "probe-missing",
        } satisfies NnrpTransportCandidate;
      }
      return candidate;
    })
    .sort(compareRejectedTransportCandidates);
  const annotatedCandidates = [...ordered, ...rejected];

  const selected = ordered[0];
  if (selected === undefined) throw transportSelectionError(policy, annotatedCandidates);
  const selectedProvider = providers.find((provider) =>
    provider.transportId === selected.transportId && provider.metadata.id === selected.provider.id
  );
  if (selectedProvider === undefined) {
    throw invalidTransportEvidence("Selected candidate does not resolve to a provider descriptor.", policy);
  }
  return { selectedProvider, candidates: annotatedCandidates, policy };
}

export function createTransportCandidates(
  providers: readonly NnrpTransportProviderDescriptor[],
  options: NnrpTransportSelectionOptions,
): readonly NnrpTransportCandidate[] {
  if (
    options.requestedMaxFrameBytes !== undefined &&
    (options.requestedMaxFrameBytes < 0n || options.requestedMaxFrameBytes > 0xffff_ffff_ffff_ffffn)
  ) {
    throw transportContractError(
      "NNRP_TRANSPORT_REQUESTED_FRAME_LIMIT_INVALID",
      "requestedMaxFrameBytes must fit the frozen u64 wire range.",
      providers[0]?.transportId ?? "tcp",
    );
  }
  const observations = options.probeObservations;
  validateTransportSelectionEvidence(providers, options.candidateReadiness, observations, options.policy);
  const readinessByKey = new Map(
    options.candidateReadiness.map((
      readiness,
    ) => [transportEvidenceKey(readiness.transportId, readiness.providerId), readiness]),
  );
  const observationByKey = new Map(
    observations.map((
      observation,
    ) => [transportEvidenceKey(observation.transportId, observation.providerId), observation]),
  );
  return providers.map((provider) => {
    validateTransportProviderDescriptor(provider);
    const key = transportEvidenceKey(provider.transportId, provider.metadata.id);
    const readiness = readinessByKey.get(key)!;
    const observation = observationByKey.get(key);
    const probe = observation?.metrics;
    const rejectionReason = !readiness.routeResolved
      ? "route-unresolved"
      : !readiness.securitySatisfied
      ? "security-unsatisfied"
      : undefined;
    const diagnostic = observation?.diagnostic ?? readiness.diagnostic ?? provider.diagnostic;

    return {
      transportId: provider.transportId,
      provider: provider.metadata,
      localAvailable: provider.available,
      peerSupported: options.peerSupportedTransports.includes(provider.transportId),
      withinLimits: options.requestedMaxFrameBytes === undefined ||
        options.requestedMaxFrameBytes <= provider.metadata.limits.maxFrameBytes,
      probeState: observation?.state ?? "not-run",
      ...(probe === undefined ? {} : { probe }),
      ...(rejectionReason === undefined ? {} : { rejectionReason }),
      ...(diagnostic === undefined ? {} : { diagnostic }),
    } satisfies NnrpTransportCandidate;
  });
}

export function createTransportSelectionSummary(
  selection: NnrpTransportSelection,
): NnrpTransportSelectionSummary {
  return {
    policy: selection.policy,
    selected: selection.selectedProvider.transportId,
    rejected: selection.candidates
      .filter((
        candidate,
      ): candidate is NnrpTransportCandidate & { readonly rejectionReason: NnrpTransportRejectionReason } =>
        candidate.rejectionReason !== undefined
      )
      .map((candidate) => ({
        transportId: candidate.transportId,
        provider: candidate.provider,
        reason: candidate.rejectionReason,
        ...(candidate.diagnostic === undefined ? {} : { diagnostic: candidate.diagnostic }),
      })),
    candidates: [...selection.candidates],
  };
}

export function parseApplicationEndpoint(endpoint: string | URL): NnrpEndpoint {
  return NnrpEndpoint.parse(endpoint);
}

function parseApplicationEndpointUrl(endpoint: string | URL): URL {
  const raw = normalizeEndpointValue(endpoint);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (cause) {
    throw invalidApplicationEndpoint("NNRP application endpoint is malformed.", cause);
  }

  if (parsed.protocol !== "nnrp:" && parsed.protocol !== "nnrps:") {
    throw invalidApplicationEndpoint("NNRP application endpoint must use nnrp:// or nnrps://.");
  }
  if (parsed.hostname.length === 0) {
    throw invalidApplicationEndpoint("NNRP application endpoint requires an authority host.");
  }

  return parsed;
}

export function resolveProviderEndpoint(
  endpoint: NnrpEndpoint,
  transport: NnrpTransportKind,
  providerEndpoint?: NnrpProviderEndpoint,
): string {
  switch (transport) {
    case "tcp":
    case "quic":
      return providerEndpoint === undefined
        ? applicationHostPort(endpoint)
        : parseHostPortProviderEndpoint(providerEndpoint, transport);
    case "ipc":
      return parseIpcProviderEndpoint(providerEndpoint, transport);
    case "websocket":
      return parseWebsocketProviderEndpoint(endpoint, providerEndpoint, transport);
  }
}

export interface NormalizeSubmitRequestOptions {
  readonly copyPayloads?: boolean;
}

export function createCacheKey(
  kind: NnrpCacheObjectKind,
  key: bigint | number | string,
  namespaceId?: number,
): NnrpCacheKey {
  validateCacheKey({ kind, key, ...(namespaceId === undefined ? {} : { namespaceId }) });
  return { kind, key, ...(namespaceId === undefined ? {} : { namespaceId }) };
}

export function createSchemaDescriptor(descriptor: NnrpSchemaDescriptor): NnrpSchemaDescriptor {
  validateSchemaDescriptor(descriptor);
  return {
    id: descriptor.id,
    name: descriptor.name,
    version: descriptor.version,
    ...(descriptor.flags === undefined ? {} : { flags: [...descriptor.flags] }),
    ...(descriptor.metadata === undefined ? {} : { metadata: { ...descriptor.metadata } }),
  };
}

export function normalizeCachePutRequest(request: NnrpCachePutRequest): NnrpCachePutRequest {
  validateCacheKey(request.key);
  validateLeaseMillis(request.leaseMillis);

  return {
    key: createCacheKey(request.key.kind, request.key.key, request.key.namespaceId),
    ...(request.payload === undefined ? {} : { payload: normalizeBinaryPayload(request.payload, true) }),
    ...(request.descriptor === undefined ? {} : { descriptor: createPayloadDescriptor(request.descriptor) }),
    ...(request.leaseMillis === undefined ? {} : { leaseMillis: request.leaseMillis }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

export function normalizeCacheInvalidateRequest(
  request: NnrpCacheInvalidateRequest,
): NnrpCacheInvalidateRequest {
  validateCacheKey(request.key);

  return {
    key: createCacheKey(request.key.kind, request.key.key, request.key.namespaceId),
    ...(request.version === undefined ? {} : { version: request.version }),
    ...(request.recursive === undefined ? {} : { recursive: request.recursive }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

export function isStandardInputProfile(profile: string): profile is NnrpInputProfile {
  return (NNRP_STANDARD_INPUT_PROFILES as readonly string[]).includes(profile);
}

export const NNRP_DEFAULT_SUBMIT_HEADER: NnrpSubmitHeaderContext = Object.freeze({
  flags: NnrpHeaderFlags.None,
  viewId: 0,
  routeId: 0,
  traceId: 0n,
});

export const NNRP_DEFAULT_SUBMIT_POLICY: NnrpSubmitPolicy = Object.freeze({
  frameClass: 0,
  latencyBudgetMs: 0,
  targetFpsX100: 0,
  retryOfFrame: 0,
  budgetPolicy: NnrpBudgetPolicy.None,
  lossTolerancePolicy: NnrpLossTolerancePolicy.InheritSession,
  dependencyFrameId: 0,
});

export function createTensorSubmitRequest(input: NnrpTensorSubmitInput): NnrpSubmitRequest {
  validateSubmitIdentity(input.identity);
  validateSubmitPolicy(input.policy);
  assertUnsigned("srcWidth", input.srcWidth, 0xffff);
  assertUnsigned("srcHeight", input.srcHeight, 0xffff);
  assertUnsigned("tileWidth", input.tileWidth, 0xffff);
  assertUnsigned("tileHeight", input.tileHeight, 0xffff);
  assertUnsigned("tileBaseId", input.tileBaseId, 0xffff_ffff);
  if (input.tileIds.length > 0xffff || input.sections.length > 0xffff) {
    throw submitProtocolError("NNRP_SUBMIT_COUNT_OVERFLOW", "Tensor tile and section counts must fit in u16.");
  }

  const tileIndex = encodeSubmitTileIndices(input.tileIds, input.tileIndexMode, input.tileBaseId);
  const sectionTable = encodeSubmitTensorSections(input.sections, input.tileIds.length);
  const camera = normalizeBinaryPayload(input.cameraBlock, true);
  const references = input.references;
  validateSubmitReference(references.camera, NnrpCacheObjectKind.CameraBlock, "camera");
  validateSubmitReference(references.tileIndex, NnrpCacheObjectKind.TileIndexBlock, "tileIndex");
  validateSubmitReference(
    references.tensorSectionTable,
    NnrpCacheObjectKind.TensorSectionTable,
    "tensorSectionTable",
  );

  const inlineRegion: number[] = [];
  if (references.camera === undefined && camera.byteLength > 0) {
    appendInlineSubmitObject(inlineRegion, NnrpCacheObjectKind.CameraBlock, camera);
  }
  if (references.tileIndex === undefined && input.tileIds.length > 0) {
    appendInlineSubmitObject(inlineRegion, NnrpCacheObjectKind.TileIndexBlock, tileIndex);
  }
  if (references.tensorSectionTable === undefined && input.sections.length > 0) {
    appendInlineSubmitObject(inlineRegion, NnrpCacheObjectKind.TensorSectionTable, sectionTable);
  }

  const referenceBlocks = [references.camera, references.tileIndex, references.tensorSectionTable]
    .filter((value): value is NnrpObjectReferenceBlock => value !== undefined);
  const referenceRegion = concatBytes(referenceBlocks.map(encodeObjectReferenceBlock));
  const hasInline = inlineRegion.length > 0;
  const hasReferences = referenceBlocks.length > 0;
  const submitMode = hasInline && hasReferences
    ? NnrpSubmitMode.Mixed
    : hasReferences
    ? NnrpSubmitMode.Reference
    : NnrpSubmitMode.Inline;
  const objectRefMask = (references.camera === undefined ? 0 : 1) |
    (references.tileIndex === undefined ? 0 : 2) |
    (references.tensorSectionTable === undefined ? 0 : 4);
  const body = encodeSubmitBody(new Uint8Array(inlineRegion), referenceRegion, new Uint8Array(), new Uint8Array());
  return normalizedSubmitFromParts(input.identity, {
    srcWidth: input.srcWidth,
    srcHeight: input.srcHeight,
    tileWidth: input.tileWidth,
    tileHeight: input.tileHeight,
    tileCount: input.tileIds.length,
    sectionCount: input.sections.length,
    frameClass: input.policy.frameClass,
    inputProfile: input.inputProfile,
    tileIndexMode: input.tileIndexMode,
    latencyBudgetMs: input.policy.latencyBudgetMs,
    targetFpsX100: input.policy.targetFpsX100,
    retryOfFrame: input.policy.retryOfFrame,
    tileBaseId: input.tileBaseId,
    cameraBytes: references.camera === undefined ? camera.byteLength : 0,
    tileIndexBytes: references.tileIndex === undefined ? tileIndex.byteLength : 0,
    submitMode,
    budgetPolicy: input.policy.budgetPolicy,
    lossTolerancePolicy: input.policy.lossTolerancePolicy,
    objectRefMask,
    dependencyFrameId: input.policy.dependencyFrameId,
    payloadKindBitmap: NnrpPayloadKind.Tensor,
    payloadFrameCount: 0,
  }, body);
}

export function createTokenSubmitRequest(input: NnrpTokenSubmitInput): NnrpSubmitRequest {
  return createTypedPayloadSubmitRequest({
    identity: input.identity,
    policy: input.policy,
    frames: input.chunks.map((chunk) => ({
      profileId: 2,
      payloadKind: NnrpPayloadKind.TokenChunk,
      descriptorFlags: chunk.descriptorFlags ?? NnrpTypedPayloadDescriptorFlags.Partial,
      schemaId: 0x0000_1001,
      schemaVersion: 3,
      streamSemantics: 2,
      payload: chunk.payload,
    })),
  });
}

export function createTypedPayloadSubmitRequest(input: NnrpTypedPayloadSubmitInput): NnrpSubmitRequest {
  validateSubmitIdentity(input.identity);
  validateSubmitPolicy(input.policy);
  if (input.frames.length === 0 || input.frames.length > 0xffff) {
    throw submitProtocolError(
      "NNRP_TYPED_PAYLOAD_FRAME_COUNT_INVALID",
      "Typed payload submits require between one and 65535 frames.",
    );
  }

  const descriptors: Uint8Array[] = [];
  const payloads: Uint8Array[] = [];
  let payloadOffset = 0;
  let payloadKindBitmap = 0;
  for (const frame of input.frames) {
    const payload = normalizeBinaryPayload(frame.payload, true);
    const descriptor = encodeTypedPayloadDescriptor({
      profileId: frame.profileId,
      payloadKind: frame.payloadKind,
      descriptorFlags: frame.descriptorFlags ?? NnrpTypedPayloadDescriptorFlags.None,
      schemaId: frame.schemaId ?? 0,
      schemaVersion: frame.schemaVersion ?? 0,
      streamSemantics: frame.streamSemantics ?? 0,
      offset: payloadOffset,
      length: payload.byteLength,
    });
    descriptors.push(descriptor);
    payloads.push(payload);
    payloadOffset = checkedSubmitU32(payloadOffset + payload.byteLength, "typed payload bytes");
    payloadKindBitmap |= frame.payloadKind;
  }
  const body = encodeSubmitBody(
    new Uint8Array(),
    new Uint8Array(),
    concatBytes(descriptors),
    concatBytes(payloads),
  );
  return normalizedSubmitFromParts(input.identity, {
    srcWidth: 0,
    srcHeight: 0,
    tileWidth: 0,
    tileHeight: 0,
    tileCount: 0,
    sectionCount: 0,
    frameClass: input.policy.frameClass,
    inputProfile: NnrpTensorInputProfile.Unspecified,
    tileIndexMode: NnrpTileIndexMode.RawU16,
    latencyBudgetMs: input.policy.latencyBudgetMs,
    targetFpsX100: input.policy.targetFpsX100,
    retryOfFrame: input.policy.retryOfFrame,
    tileBaseId: 0,
    cameraBytes: 0,
    tileIndexBytes: 0,
    submitMode: NnrpSubmitMode.Inline,
    budgetPolicy: input.policy.budgetPolicy,
    lossTolerancePolicy: input.policy.lossTolerancePolicy,
    objectRefMask: 0,
    dependencyFrameId: input.policy.dependencyFrameId,
    payloadKindBitmap,
    payloadFrameCount: input.frames.length,
  }, body);
}

export function encodeFrameSubmitMetadata(metadata: NnrpFrameSubmitMetadata): Uint8Array {
  validateFrameSubmitMetadata(metadata);
  const output = new Uint8Array(72);
  const view = new DataView(output.buffer);
  view.setUint16(0, metadata.srcWidth, true);
  view.setUint16(2, metadata.srcHeight, true);
  view.setUint16(4, metadata.tileWidth, true);
  view.setUint16(6, metadata.tileHeight, true);
  view.setUint16(8, metadata.tileCount, true);
  view.setUint16(10, metadata.sectionCount, true);
  view.setUint8(12, metadata.frameClass);
  view.setUint8(13, metadata.inputProfile);
  view.setUint8(14, metadata.tileIndexMode);
  view.setUint16(16, metadata.latencyBudgetMs, true);
  view.setUint16(18, metadata.targetFpsX100, true);
  view.setUint32(20, metadata.retryOfFrame, true);
  view.setUint32(24, metadata.tileBaseId, true);
  view.setUint32(28, metadata.cameraBytes, true);
  view.setUint32(32, metadata.tileIndexBytes, true);
  view.setBigUint64(40, metadata.operationId, true);
  view.setUint8(52, metadata.submitMode);
  view.setUint8(53, metadata.budgetPolicy);
  view.setUint8(54, metadata.lossTolerancePolicy);
  view.setUint32(56, metadata.objectRefMask, true);
  view.setUint32(60, metadata.dependencyFrameId, true);
  view.setUint32(64, metadata.payloadKindBitmap, true);
  view.setUint16(68, metadata.payloadFrameCount, true);
  return output;
}

export function decodeFrameSubmitMetadata(payload: Uint8Array): NnrpFrameSubmitMetadata {
  requireExactRuntimePayload(payload, 72, "FRAME_SUBMIT");
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (
    view.getUint8(15) !== 0 || view.getUint32(36, true) !== 0 || view.getUint32(48, true) !== 0 ||
    view.getUint8(55) !== 0 || view.getUint16(70, true) !== 0
  ) {
    throw submitProtocolError("NNRP_SUBMIT_METADATA_RESERVED", "FRAME_SUBMIT metadata reserved fields must be zero.");
  }
  const metadata: NnrpFrameSubmitMetadata = {
    srcWidth: view.getUint16(0, true),
    srcHeight: view.getUint16(2, true),
    tileWidth: view.getUint16(4, true),
    tileHeight: view.getUint16(6, true),
    tileCount: view.getUint16(8, true),
    sectionCount: view.getUint16(10, true),
    frameClass: view.getUint8(12),
    inputProfile: view.getUint8(13) as NnrpTensorInputProfile,
    tileIndexMode: view.getUint8(14) as NnrpTileIndexMode,
    latencyBudgetMs: view.getUint16(16, true),
    targetFpsX100: view.getUint16(18, true),
    retryOfFrame: view.getUint32(20, true),
    tileBaseId: view.getUint32(24, true),
    cameraBytes: view.getUint32(28, true),
    tileIndexBytes: view.getUint32(32, true),
    operationId: view.getBigUint64(40, true),
    submitMode: view.getUint8(52) as NnrpSubmitMode,
    budgetPolicy: view.getUint8(53),
    lossTolerancePolicy: view.getUint8(54),
    objectRefMask: view.getUint32(56, true),
    dependencyFrameId: view.getUint32(60, true),
    payloadKindBitmap: view.getUint32(64, true),
    payloadFrameCount: view.getUint16(68, true),
  };
  validateFrameSubmitMetadata(metadata);
  return metadata;
}

export function encodeSubmitMetadata(request: NnrpSubmitRequest): Uint8Array {
  validateSubmitRequestShape(request);
  return encodeFrameSubmitMetadata({ operationId: request.operationId, ...request.metadata });
}

export function encodeSubmitPayload(request: NnrpSubmitRequest): Uint8Array {
  return concatBytes([encodeSubmitMetadata(request), request.body]);
}

export function decodeSubmitPayload(payload: Uint8Array): {
  readonly operationId: bigint;
  readonly metadata: NnrpSubmitMetadata;
  readonly body: Uint8Array;
} {
  if (payload.byteLength < 104) {
    throw submitProtocolError(
      "NNRP_SUBMIT_PAYLOAD_TRUNCATED",
      "FRAME_SUBMIT payload must contain 72-byte metadata and a BodyRegionPrelude.",
    );
  }
  const completeMetadata = decodeFrameSubmitMetadata(payload.subarray(0, 72));
  const { operationId, ...metadata } = completeMetadata;
  const body = payload.slice(72);
  validateSubmitBody(metadata, body);
  return {
    operationId,
    metadata,
    body,
  };
}

export function encodeResultPushPayload(
  metadata: NnrpResultPushMetadata,
  body: Uint8Array = new Uint8Array(),
): Uint8Array {
  if (!(body instanceof Uint8Array)) {
    throw runtimeEventError("NNRP_RESULT_BODY_INVALID", "RESULT_PUSH body must be a Uint8Array.");
  }
  const encoded = new Uint8Array(64 + body.byteLength);
  encoded.set(encodeResultPushMetadata(metadata), 0);
  encoded.set(body, 64);
  return encoded;
}

export function encodeResultPushMetadata(metadata: NnrpResultPushMetadata): Uint8Array {
  validateResultPushMetadata(metadata);
  const encoded = new Uint8Array(64);
  const view = new DataView(encoded.buffer);
  view.setUint16(0, metadata.statusCode, true);
  view.setUint16(2, metadata.resultFlags, true);
  view.setUint16(4, metadata.sectionCount, true);
  view.setUint16(6, metadata.tileCount, true);
  view.setUint16(8, metadata.activeProfileId, true);
  view.setUint16(12, metadata.inferenceMs, true);
  view.setUint16(14, metadata.queueMs, true);
  view.setUint16(16, metadata.serverTotalMs, true);
  view.setUint32(20, metadata.tileBaseId, true);
  view.setUint32(24, metadata.tileIndexBytes, true);
  view.setUint8(44, metadata.resultClass);
  view.setUint8(45, metadata.appliedBudgetPolicy);
  view.setUint32(48, metadata.reusedFrameId, true);
  view.setUint16(52, metadata.coveredTileCount, true);
  view.setUint16(54, metadata.droppedTileCount, true);
  view.setUint32(56, metadata.payloadKindBitmap, true);
  view.setUint16(60, metadata.payloadFrameCount, true);
  return encoded;
}

export function decodeResultPushMetadata(payload: Uint8Array): NnrpResultPushMetadata {
  requireExactRuntimePayload(payload, 64, "RESULT_PUSH");
  return decodeResultPushPayload(payload).metadata;
}

export function decodeResultPushPayload(payload: Uint8Array): {
  readonly metadata: NnrpResultPushMetadata;
  readonly body: Uint8Array;
} {
  requireRuntimePayload(payload, 64, "RESULT_PUSH");
  const view = new DataView(payload.buffer, payload.byteOffset, 64);
  if (
    view.getUint16(10, true) !== 0 || view.getUint16(18, true) !== 0 ||
    view.getBigUint64(28, true) !== 0n || view.getBigUint64(36, true) !== 0n ||
    view.getUint16(46, true) !== 0 || view.getUint16(62, true) !== 0
  ) {
    throw runtimeEventError("NNRP_RESULT_METADATA_RESERVED", "RESULT_PUSH reserved fields must be zero.");
  }
  const metadata: NnrpResultPushMetadata = {
    statusCode: view.getUint16(0, true),
    resultFlags: view.getUint16(2, true),
    sectionCount: view.getUint16(4, true),
    tileCount: view.getUint16(6, true),
    activeProfileId: view.getUint16(8, true),
    inferenceMs: view.getUint16(12, true),
    queueMs: view.getUint16(14, true),
    serverTotalMs: view.getUint16(16, true),
    tileBaseId: view.getUint32(20, true),
    tileIndexBytes: view.getUint32(24, true),
    resultClass: view.getUint8(44) as NnrpResultClass,
    appliedBudgetPolicy: view.getUint8(45),
    reusedFrameId: view.getUint32(48, true),
    coveredTileCount: view.getUint16(52, true),
    droppedTileCount: view.getUint16(54, true),
    payloadKindBitmap: view.getUint32(56, true),
    payloadFrameCount: view.getUint16(60, true),
  };
  validateResultPushMetadata(metadata);
  return { metadata, body: payload.slice(64) };
}

export function decodeNnrpRuntimeEvent(
  header: NnrpRuntimeFrameHeader,
  payload: Uint8Array,
): NnrpRuntimeEvent {
  const ownedHeader = normalizeRuntimeFrameHeader(header);
  if (!(payload instanceof Uint8Array)) {
    throw runtimeEventError("NNRP_RUNTIME_PAYLOAD_INVALID", "Runtime event payload must be a Uint8Array.");
  }

  switch (ownedHeader.messageType) {
    case NnrpMessageType.SessionClose: {
      const value = decodeSessionCloseMetadata(payload);
      return runtimeEvent(ownedHeader, { type: "session_close", value }, { type: "none" });
    }
    case NnrpMessageType.FrameSubmit: {
      const decoded = decodeSubmitPayload(payload);
      const value: NnrpFrameSubmitMetadata = { operationId: decoded.operationId, ...decoded.metadata };
      return runtimeEvent(ownedHeader, { type: "frame_submit", value }, { type: "body", body: decoded.body });
    }
    case NnrpMessageType.FrameCancel:
    case NnrpMessageType.ResultDrop:
      requireEmptyRuntimePayload(payload, NnrpMessageType[ownedHeader.messageType]);
      return runtimeEvent(ownedHeader, { type: "none" }, { type: "none" });
    case NnrpMessageType.ResultPush: {
      const decoded = decodeResultPushPayload(payload);
      return runtimeEvent(
        ownedHeader,
        { type: "result_push", value: decoded.metadata },
        { type: "body", body: decoded.body },
      );
    }
    case NnrpMessageType.ResultHint: {
      const value = decodeResultHintMetadata(payload);
      return runtimeEvent(ownedHeader, { type: "result_hint", value }, { type: "none" });
    }
    case NnrpMessageType.FlowUpdate: {
      const value = decodeFlowUpdateMetadata(payload);
      validateFlowUpdateHeaderScope(value, ownedHeader);
      return runtimeEvent(ownedHeader, { type: "flow_update", value }, { type: "none" });
    }
    case NnrpMessageType.CacheInvalidate: {
      const value = decodeCacheInvalidateMetadata(payload);
      return runtimeEvent(ownedHeader, { type: "cache_invalidate", value }, { type: "none" });
    }
    case NnrpMessageType.Cancel:
    case NnrpMessageType.Abort:
    case NnrpMessageType.PriorityUpdate:
    case NnrpMessageType.Deadline:
    case NnrpMessageType.ExpireAt:
    case NnrpMessageType.Supersede:
    case NnrpMessageType.BudgetUpdate:
    case NnrpMessageType.Progress:
    case NnrpMessageType.PartialResult:
    case NnrpMessageType.Backpressure:
    case NnrpMessageType.CreditUpdate:
    case NnrpMessageType.CapabilityNegotiation:
    case NnrpMessageType.DegradeProfile:
    case NnrpMessageType.RouteHint:
    case NnrpMessageType.ExecutionHint:
    case NnrpMessageType.TraceContext:
    case NnrpMessageType.ResultDropReason:
    case NnrpMessageType.ErrorRecoverable:
    case NnrpMessageType.RetryAfter:
      return decodeRuntimeControlEvent(ownedHeader, payload);
    case NnrpMessageType.ObjectDeclare:
    case NnrpMessageType.ObjectRef:
    case NnrpMessageType.ObjectRelease:
    case NnrpMessageType.ObjectPatch:
    case NnrpMessageType.ObjectDelta:
    case NnrpMessageType.CacheReference:
    case NnrpMessageType.CacheMiss:
      return decodeRuntimeObjectEvent(ownedHeader, payload);
    default:
      throw runtimeEventError(
        "NNRP_RUNTIME_MESSAGE_UNSUPPORTED",
        `Message type ${ownedHeader.messageType} is not part of the frozen role event surface.`,
      );
  }
}

export function createNnrpResultFromRuntimeEvent(
  operationId: bigint,
  event: NnrpRuntimeEvent,
): NnrpResult {
  validateNonZeroOperationId(operationId);
  let terminalState: NnrpResultTerminalState;
  if (
    event.header.messageType === NnrpMessageType.ResultPush && event.metadata.type === "result_push" &&
    event.tail.type === "body"
  ) {
    terminalState = "success";
  } else if (
    event.header.messageType === NnrpMessageType.ResultDrop && event.metadata.type === "none" &&
    event.tail.type === "none"
  ) {
    terminalState = "dropped";
  } else if (
    event.header.messageType === NnrpMessageType.ResultDropReason && event.metadata.type === "result_drop_reason" &&
    event.tail.type === "diagnostic"
  ) {
    terminalState = "dropped";
  } else {
    throw runtimeEventError(
      "NNRP_TERMINAL_EVENT_INVALID",
      "Runtime terminal evidence does not match RESULT_PUSH, RESULT_DROP, or RESULT_DROP_REASON.",
    );
  }
  return { operationId, terminalState, event: { type: "runtime", event } };
}

export function createNnrpResultFromLifecycle(event: NnrpOperationLifecycleEvent): NnrpResult {
  validateNonZeroOperationId(event.operationId);
  const terminalState = operationTerminalState(event.state);
  if (terminalState === undefined) {
    throw runtimeEventError(
      "NNRP_LIFECYCLE_NOT_TERMINAL",
      `Operation state '${event.state}' does not establish a terminal result.`,
    );
  }
  return {
    operationId: event.operationId,
    terminalState,
    event: { type: "lifecycle", event: { ...event } },
  };
}

export function normalizeSubmitRequest(
  request: NnrpSubmitRequest,
  options: NormalizeSubmitRequestOptions = {},
): NnrpNormalizedSubmitRequest {
  validateSubmitRequestShape(request);
  const body = options.copyPayloads ?? true ? request.body.slice() : request.body;
  return {
    operationId: request.operationId,
    frameId: request.frameId,
    header: { ...request.header },
    metadata: { ...request.metadata },
    body,
  };
}

function decodeRuntimeControlEvent(
  header: NnrpRuntimeFrameHeader,
  payload: Uint8Array,
): NnrpRuntimeEvent {
  const decoded = decodeRuntimeControlMetadata(header.messageType, payload);
  const metadata = runtimeControlEventMetadata(header.messageType, decoded.metadata);
  const tail = runtimeControlEventTail(header.messageType, decoded.tail);
  return runtimeEvent(header, metadata, tail);
}

function decodeRuntimeObjectEvent(
  header: NnrpRuntimeFrameHeader,
  payload: Uint8Array,
): NnrpRuntimeEvent {
  const decoded = decodeRuntimeObjectMetadata(header.messageType, payload);
  switch (header.messageType) {
    case NnrpMessageType.ObjectDeclare:
      return runtimeEvent(
        header,
        { type: "object_descriptor", value: decoded.metadata as ObjectDescriptorMetadata },
        { type: "body", body: decoded.tail },
      );
    case NnrpMessageType.ObjectRef:
      return runtimeEvent(
        header,
        { type: "object_reference", value: decoded.metadata as ObjectReferenceMetadata },
        { type: "body", body: decoded.tail },
      );
    case NnrpMessageType.ObjectRelease:
      return runtimeEvent(
        header,
        { type: "object_release", value: decoded.metadata as ObjectReleaseMetadata },
        { type: "diagnostic", diagnostic: decoded.tail },
      );
    case NnrpMessageType.ObjectPatch:
    case NnrpMessageType.ObjectDelta: {
      const value = decoded.metadata as ObjectDeltaMetadata;
      const metadataEnd = value.metadataBytes;
      const deltaEnd = metadataEnd + value.deltaBytes;
      if (deltaEnd !== decoded.tail.byteLength) {
        throw runtimeEventError(
          "NNRP_OBJECT_TAIL_LENGTH_INVALID",
          `Object delta declares ${deltaEnd} tail bytes but received ${decoded.tail.byteLength}.`,
        );
      }
      return runtimeEvent(
        header,
        { type: "object_delta", value },
        {
          type: "metadata_body_and_delta",
          metadataBody: decoded.tail.slice(0, metadataEnd),
          delta: decoded.tail.slice(metadataEnd, deltaEnd),
        },
      );
    }
    case NnrpMessageType.CacheReference:
      return runtimeEvent(
        header,
        { type: "cache_reference", value: decoded.metadata as CacheReferenceMetadata },
        { type: "body", body: decoded.tail },
      );
    case NnrpMessageType.CacheMiss:
      return runtimeEvent(
        header,
        { type: "cache_miss", value: decoded.metadata as CacheMissMetadata },
        { type: "diagnostic", diagnostic: decoded.tail },
      );
    default:
      throw runtimeEventError("NNRP_OBJECT_MESSAGE_UNSUPPORTED", "Unsupported runtime object event.");
  }
}

function runtimeControlEventMetadata(
  messageType: NnrpMessageType,
  value: RuntimeControlMetadata,
): NnrpRuntimeEventMetadata {
  switch (messageType) {
    case NnrpMessageType.Cancel:
    case NnrpMessageType.Abort:
      return { type: "control_request", value: value as ControlRequestMetadata };
    case NnrpMessageType.PriorityUpdate:
    case NnrpMessageType.Deadline:
    case NnrpMessageType.ExpireAt:
      return { type: "scheduling", value: value as SchedulingMetadata };
    case NnrpMessageType.Supersede:
      return { type: "supersede", value: value as SupersedeMetadata };
    case NnrpMessageType.BudgetUpdate:
      return { type: "budget", value: value as BudgetMetadata };
    case NnrpMessageType.Progress:
      return { type: "progress", value: value as ProgressMetadata };
    case NnrpMessageType.PartialResult:
      return { type: "partial_result", value: value as PartialResultMetadata };
    case NnrpMessageType.Backpressure:
    case NnrpMessageType.CreditUpdate:
      return { type: "pressure", value: value as PressureMetadata };
    case NnrpMessageType.CapabilityNegotiation:
    case NnrpMessageType.DegradeProfile:
      return { type: "capability", value: value as CapabilityMetadata };
    case NnrpMessageType.RouteHint:
    case NnrpMessageType.ExecutionHint:
      return { type: "route_hint", value: value as RouteHintMetadata };
    case NnrpMessageType.TraceContext:
      return { type: "trace_context", value: value as TraceContextMetadata };
    case NnrpMessageType.ResultDropReason:
      return { type: "result_drop_reason", value: value as ResultDropReasonMetadata };
    case NnrpMessageType.ErrorRecoverable:
      return { type: "recoverable_error", value: value as RecoverableErrorMetadata };
    case NnrpMessageType.RetryAfter:
      return { type: "retry_after", value: value as RetryAfterMetadata };
    default:
      throw runtimeEventError("NNRP_CONTROL_MESSAGE_UNSUPPORTED", "Unsupported runtime control event.");
  }
}

function runtimeControlEventTail(messageType: NnrpMessageType, bytes: Uint8Array): NnrpRuntimeEventTail {
  switch (messageType) {
    case NnrpMessageType.Cancel:
    case NnrpMessageType.Abort:
    case NnrpMessageType.Supersede:
    case NnrpMessageType.ResultDropReason:
    case NnrpMessageType.ErrorRecoverable:
    case NnrpMessageType.RetryAfter:
      return { type: "diagnostic", diagnostic: bytes };
    case NnrpMessageType.Progress:
    case NnrpMessageType.PartialResult:
    case NnrpMessageType.CapabilityNegotiation:
    case NnrpMessageType.DegradeProfile:
    case NnrpMessageType.RouteHint:
    case NnrpMessageType.ExecutionHint:
    case NnrpMessageType.TraceContext:
      return { type: "body", body: bytes };
    default:
      requireEmptyRuntimePayload(bytes, NnrpMessageType[messageType]);
      return { type: "none" };
  }
}

export function encodeResultHintMetadata(metadata: NnrpResultHintMetadata): Uint8Array {
  validateResultHintMetadata(metadata);
  const encoded = new Uint8Array(16);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, metadata.appliedBudgetPolicy, true);
  view.setUint32(4, metadata.congestionState, true);
  view.setUint32(8, metadata.reason, true);
  view.setUint32(12, metadata.retryAfterMs, true);
  return encoded;
}

export function decodeResultHintMetadata(payload: Uint8Array): NnrpResultHintMetadata {
  requireExactRuntimePayload(payload, 16, "RESULT_HINT");
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const metadata: NnrpResultHintMetadata = {
    appliedBudgetPolicy: view.getUint32(0, true) as NnrpResultHintBudgetPolicy,
    congestionState: view.getUint32(4, true) as NnrpResultHintCongestionState,
    reason: view.getUint32(8, true) as NnrpResultHintReason,
    retryAfterMs: view.getUint32(12, true),
  };
  validateResultHintMetadata(metadata);
  return metadata;
}

export function encodeFlowUpdateMetadata(metadata: NnrpFlowUpdateMetadata): Uint8Array {
  validateFlowUpdateMetadata(metadata);
  const encoded = new Uint8Array(32);
  const view = new DataView(encoded.buffer);
  view.setUint8(0, metadata.scopeKind);
  view.setUint8(1, metadata.updateReason);
  view.setUint8(2, metadata.backpressureLevel);
  view.setUint16(4, metadata.connectionCredit, true);
  view.setUint16(6, metadata.sessionCredit, true);
  view.setUint16(8, metadata.operationCredit, true);
  view.setBigUint64(12, metadata.operationId, true);
  view.setUint32(20, metadata.retryAfterMs, true);
  view.setUint32(24, metadata.creditEpoch, true);
  view.setUint32(28, metadata.flowFlags, true);
  return encoded;
}

export function decodeFlowUpdateMetadata(payload: Uint8Array): NnrpFlowUpdateMetadata {
  requireExactRuntimePayload(payload, 32, "FLOW_UPDATE");
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (view.getUint8(3) !== 0 || view.getUint16(10, true) !== 0) {
    throw runtimeEventError("NNRP_FLOW_RESERVED_NONZERO", "FLOW_UPDATE reserved fields must be zero.");
  }
  const metadata: NnrpFlowUpdateMetadata = {
    scopeKind: view.getUint8(0) as NnrpFlowScopeKind,
    updateReason: view.getUint8(1) as NnrpFlowUpdateReason,
    backpressureLevel: view.getUint8(2) as NnrpBackpressureLevel,
    connectionCredit: view.getUint16(4, true),
    sessionCredit: view.getUint16(6, true),
    operationCredit: view.getUint16(8, true),
    operationId: view.getBigUint64(12, true),
    retryAfterMs: view.getUint32(20, true),
    creditEpoch: view.getUint32(24, true),
    flowFlags: view.getUint32(28, true),
  };
  validateFlowUpdateMetadata(metadata);
  return metadata;
}

function validateFlowUpdateHeaderScope(
  metadata: NnrpFlowUpdateMetadata,
  header: NnrpRuntimeFrameHeader,
): void {
  if (
    (metadata.scopeKind === NnrpFlowScopeKind.Connection &&
      (header.sessionId !== 0 || metadata.sessionCredit !== 0 || metadata.operationCredit !== 0 ||
        metadata.operationId !== 0n)) ||
    (metadata.scopeKind === NnrpFlowScopeKind.Session &&
      (header.sessionId === 0 || metadata.connectionCredit !== 0 || metadata.operationCredit !== 0 ||
        metadata.operationId !== 0n)) ||
    (metadata.scopeKind === NnrpFlowScopeKind.Operation &&
      (header.sessionId === 0 || metadata.operationId === 0n))
  ) {
    throw runtimeEventError("NNRP_FLOW_SCOPE_INVALID", "FLOW_UPDATE scope fields do not match its common header.");
  }
}

function decodeSessionCloseMetadata(payload: Uint8Array): NnrpSessionCloseMetadata {
  requireExactRuntimePayload(payload, 24, "SESSION_CLOSE");
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (view.getUint8(3) !== 0) {
    throw runtimeEventError("NNRP_SESSION_CLOSE_RESERVED", "SESSION_CLOSE reserved fields must be zero.");
  }
  const metadata: NnrpSessionCloseMetadata = {
    closeReason: view.getUint16(0, true) as NnrpSessionCloseReason,
    inFlightPolicy: view.getUint8(2) as NnrpInFlightPolicy,
    drainTimeoutMs: view.getUint32(4, true),
    lastOperationId: view.getBigUint64(8, true),
    sessionErrorCode: view.getUint32(16, true),
    sessionCloseTag: view.getUint32(20, true),
  };
  assertEnumRange("closeReason", metadata.closeReason, NnrpSessionCloseReason.AuthRevoked);
  assertEnumRange("inFlightPolicy", metadata.inFlightPolicy, NnrpInFlightPolicy.Abort);
  return metadata;
}

function validateResultPushMetadata(metadata: NnrpResultPushMetadata): void {
  for (const [name, value] of Object.entries(metadata)) {
    if (
      name === "payloadKindBitmap" || name === "tileBaseId" || name === "tileIndexBytes" ||
      name === "reusedFrameId"
    ) {
      assertUnsigned(name, value, 0xffff_ffff);
    } else if (name !== "resultClass" && name !== "appliedBudgetPolicy") {
      assertUnsigned(name, value, 0xffff);
    }
  }
  assertEnumRange("resultClass", metadata.resultClass, NnrpResultClass.Degraded);
  if ((metadata.resultFlags & ~0x07) !== 0 || (metadata.appliedBudgetPolicy & ~0x0f) !== 0) {
    throw runtimeEventError("NNRP_RESULT_FLAGS_INVALID", "RESULT_PUSH contains reserved flag bits.");
  }
  if ((metadata.payloadKindBitmap & ~0x7f) !== 0) {
    throw runtimeEventError("NNRP_RESULT_PAYLOAD_KIND_INVALID", "RESULT_PUSH contains unknown payload kinds.");
  }
  const stale = metadata.resultClass === NnrpResultClass.StaleReuse || (metadata.resultFlags & 0x01) !== 0;
  if (stale !== (metadata.reusedFrameId !== 0)) {
    throw runtimeEventError(
      "NNRP_RESULT_STALE_REUSE_INVALID",
      "RESULT_PUSH stale semantics and reusedFrameId must agree.",
    );
  }
  if (
    (metadata.payloadKindBitmap & NnrpPayloadKind.Tensor) === 0 &&
    (metadata.sectionCount !== 0 || metadata.tileCount !== 0 || metadata.tileBaseId !== 0 ||
      metadata.tileIndexBytes !== 0 ||
      metadata.coveredTileCount !== 0 || metadata.droppedTileCount !== 0)
  ) {
    throw runtimeEventError(
      "NNRP_RESULT_TENSOR_FIELDS_INVALID",
      "Non-tensor RESULT_PUSH must clear tensor tile fields.",
    );
  }
  if ((metadata.payloadKindBitmap & NnrpPayloadKind.Tensor) !== 0) {
    const partial = metadata.resultClass === NnrpResultClass.Partial || (metadata.resultFlags & 0x04) !== 0;
    if (partial && metadata.droppedTileCount === 0) {
      throw runtimeEventError(
        "NNRP_RESULT_PARTIAL_COVERAGE_INVALID",
        "Partial tensor RESULT_PUSH requires droppedTileCount greater than zero.",
      );
    }
    if (metadata.coveredTileCount + metadata.droppedTileCount !== metadata.tileCount) {
      throw runtimeEventError(
        "NNRP_RESULT_TENSOR_COVERAGE_INVALID",
        "Tensor RESULT_PUSH coverage must equal tileCount.",
      );
    }
  }
}

function normalizeRuntimeFrameHeader(header: NnrpRuntimeFrameHeader): NnrpRuntimeFrameHeader {
  if (header.versionMajor !== 1 || header.wireFormat !== 0) {
    throw runtimeEventError("NNRP_RUNTIME_HEADER_VERSION", "Runtime event header must be NNRP/1 wire format 0.");
  }
  assertUnsigned("messageType", header.messageType, 0xff);
  if (NnrpMessageType[header.messageType] === undefined) {
    throw runtimeEventError("NNRP_RUNTIME_MESSAGE_UNKNOWN", `Unknown runtime message type ${header.messageType}.`);
  }
  assertUnsigned("flags", header.flags, 0xffff_ffff);
  assertUnsigned("sessionId", header.sessionId, 0xffff_ffff);
  assertUnsigned("frameId", header.frameId, 0xffff_ffff);
  assertUnsigned("viewId", header.viewId, 0xffff);
  assertUnsigned("routeId", header.routeId, 0xffff);
  validateU64BigInt("traceId", header.traceId);
  return { ...header };
}

function runtimeEvent(
  header: NnrpRuntimeFrameHeader,
  metadata: NnrpRuntimeEventMetadata,
  tail: NnrpRuntimeEventTail,
): NnrpRuntimeEvent {
  return { header, metadata, tail };
}

function operationTerminalState(state: NnrpOperationState): NnrpResultTerminalState | undefined {
  switch (state) {
    case "completed":
      return "success";
    case "cancelled":
      return "cancelled";
    case "superseded":
      return "dropped";
    case "failed":
      return "error";
    default:
      return undefined;
  }
}

function validateNonZeroOperationId(operationId: bigint): void {
  validateU64BigInt("operationId", operationId);
  if (operationId === 0n) {
    throw runtimeEventError("NNRP_OPERATION_ID_ZERO", "Terminal results require a non-zero operation id.");
  }
}

function validateClientHelloMetadata(metadata: ClientHelloMetadata): void {
  const u8Fields = ["minVersionMajor", "maxVersionMajor"] as const;
  const u16Fields = [
    "supportedWireFormatBitmap",
    "cacheDigestBitmap",
    "cacheObjectBitmap",
    "cacheNamespaceCount",
    "maxLaneCount",
    "targetCadenceX100",
    "latencyBudgetMs",
    "qualityTier",
    "degradePolicy",
  ] as const;
  const u32Fields = [
    "supportedProfileBitmap",
    "supportedPayloadKindBitmap",
    "supportedCodecBitmap",
    "supportedCompressionBitmap",
    "supportedDtypeBitmap",
    "supportedLayoutBitmap",
    "maxCacheEntries",
    "maxCacheBytes",
    "requestedSessionId",
    "authBytes",
    "controlExtensionBytes",
  ] as const;
  u8Fields.forEach((field) => assertUnsigned(field, metadata[field], 0xff));
  u16Fields.forEach((field) => assertUnsigned(field, metadata[field], 0xffff));
  u32Fields.forEach((field) => assertUnsigned(field, metadata[field], 0xffff_ffff));
  if (
    metadata.minVersionMajor > metadata.maxVersionMajor || metadata.minVersionMajor > 1 ||
    metadata.maxVersionMajor < 1
  ) {
    throw runtimeEventError("NNRP_CLIENT_HELLO_VERSION_INVALID", "CLIENT_HELLO version range must include NNRP/1.");
  }
  if ((metadata.supportedWireFormatBitmap & 0x01) === 0) {
    throw runtimeEventError(
      "NNRP_CLIENT_HELLO_WIRE_FORMAT_INVALID",
      "CLIENT_HELLO must advertise wire format 0.",
    );
  }
  if (metadata.supportedProfileBitmap === 0 || metadata.supportedPayloadKindBitmap === 0) {
    throw runtimeEventError(
      "NNRP_CLIENT_HELLO_CAPABILITY_INVALID",
      "CLIENT_HELLO profile and payload-kind bitmaps must be non-zero.",
    );
  }
}

function validateSessionPatchAckMetadata(metadata: SessionPatchAckMetadata): void {
  assertEnumRange("ackStatus", metadata.ackStatus, SessionPatchAckStatus.Rejected);
  assertEnumRange("rejectReason", metadata.rejectReason, SessionPatchRejectReason.RateLimited);
  assertUnsigned("appliedPatchMask", metadata.appliedPatchMask, 0x7f);
  assertUnsigned("rejectedPatchMask", metadata.rejectedPatchMask, 0x7f);
  assertUnsigned("retryAfterMs", metadata.retryAfterMs, 0xffff_ffff);
  assertUnsigned("effectiveProfileId", metadata.effectiveProfileId, 0xffff);
  assertUnsigned("effectiveTargetCadenceX100", metadata.effectiveTargetCadenceX100, 0xffff_ffff);
  assertUnsigned("effectiveQualityTier", metadata.effectiveQualityTier, 0xffff);
  assertUnsigned("effectiveDegradePolicy", metadata.effectiveDegradePolicy, 0xffff);
  assertUnsignedBigInt("effectiveLaneMask", metadata.effectiveLaneMask, 0xffff_ffff_ffff_ffffn);
  assertUnsigned("effectiveCodecBitmap", metadata.effectiveCodecBitmap, 0xffff_ffff);
  assertUnsigned("effectiveCompressionBitmap", metadata.effectiveCompressionBitmap, 0xffff_ffff);
  assertUnsigned("profilePatchAckBytes", metadata.profilePatchAckBytes, 0xffff_ffff);
}

function validateResultHintMetadata(metadata: NnrpResultHintMetadata): void {
  assertEnumRange("appliedBudgetPolicy", metadata.appliedBudgetPolicy, NnrpResultHintBudgetPolicy.Drop);
  assertEnumRange("congestionState", metadata.congestionState, NnrpResultHintCongestionState.Saturated);
  assertEnumRange("reason", metadata.reason, NnrpResultHintReason.Superseded);
  assertUnsigned("retryAfterMs", metadata.retryAfterMs, 0xffff_ffff);
}

function validateFlowUpdateMetadata(metadata: NnrpFlowUpdateMetadata): void {
  assertEnumRange("scopeKind", metadata.scopeKind, NnrpFlowScopeKind.Operation);
  assertEnumRange("updateReason", metadata.updateReason, NnrpFlowUpdateReason.Congestion);
  assertEnumRange("backpressureLevel", metadata.backpressureLevel, NnrpBackpressureLevel.Paused);
  assertUnsigned("connectionCredit", metadata.connectionCredit, 0xffff);
  assertUnsigned("sessionCredit", metadata.sessionCredit, 0xffff);
  assertUnsigned("operationCredit", metadata.operationCredit, 0xffff);
  assertUnsignedBigInt("operationId", metadata.operationId, 0xffff_ffff_ffff_ffffn);
  assertUnsigned("retryAfterMs", metadata.retryAfterMs, 0xffff_ffff);
  assertUnsigned("creditEpoch", metadata.creditEpoch, 0xffff_ffff);
  if (!Number.isSafeInteger(metadata.flowFlags) || metadata.flowFlags < 0 || metadata.flowFlags > 0x0f) {
    throw runtimeEventError("NNRP_FLOW_FLAGS_INVALID", "FLOW_UPDATE contains reserved flag bits.");
  }
  if (metadata.retryAfterMs !== 0 && (metadata.flowFlags & 0x02) === 0) {
    throw runtimeEventError("NNRP_FLOW_RETRY_FLAG_MISSING", "FLOW_UPDATE retryAfterMs requires its validity flag.");
  }
}

function requireRuntimePayload(payload: Uint8Array, minimum: number, name: string): void {
  if (!(payload instanceof Uint8Array) || payload.byteLength < minimum) {
    throw runtimeEventError(
      "NNRP_RUNTIME_METADATA_TRUNCATED",
      `${name} requires at least ${minimum} bytes but received ${payload?.byteLength ?? 0}.`,
    );
  }
}

function requireExactRuntimePayload(payload: Uint8Array, length: number, name: string): void {
  requireRuntimePayload(payload, length, name);
  if (payload.byteLength !== length) {
    throw runtimeEventError(
      "NNRP_RUNTIME_PAYLOAD_LENGTH_INVALID",
      `${name} requires exactly ${length} bytes but received ${payload.byteLength}.`,
    );
  }
}

function requireEmptyRuntimePayload(payload: Uint8Array, name: string): void {
  if (payload.byteLength !== 0) {
    throw runtimeEventError("NNRP_RUNTIME_PAYLOAD_UNEXPECTED", `${name} does not permit payload bytes.`);
  }
}

function assertEnumRange(name: string, value: number, maximum: number): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw runtimeEventError(
      "NNRP_RUNTIME_ENUM_INVALID",
      `${name} is not a frozen runtime metadata enum value.`,
    );
  }
}

function runtimeEventError(code: string, message: string): NnrpProtocolError {
  return new NnrpProtocolError({ code, message, source: "protocol", retryable: false });
}

export function createRecoveryToken(
  token: string | NnrpBinaryPayload,
  metadata?: Readonly<Record<string, string>>,
): NnrpRecoveryToken {
  const normalized = typeof token === "string" ? token : normalizeBinaryPayload(token, true);
  validateRecoveryToken({ token: normalized, ...(metadata === undefined ? {} : { metadata }) });

  return {
    token: normalized,
    ...(metadata === undefined ? {} : { metadata: normalizeMetadataMap(metadata) }),
  };
}

export function normalizeSessionMigrationRequest(request: NnrpSessionMigrationRequest): NnrpSessionMigrationRequest {
  validateRecoveryToken(request.recoveryToken);
  if (request.metadata !== undefined) {
    normalizeMetadataMap(request.metadata);
  }

  return {
    recoveryToken: createRecoveryToken(request.recoveryToken.token, request.recoveryToken.metadata),
    ...(request.targetEndpoint === undefined ? {} : { targetEndpoint: request.targetEndpoint }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

export function throwIfResultDrop(event: NnrpRuntimeEvent): void {
  if (
    event.header.messageType === NnrpMessageType.ResultDrop ||
    event.header.messageType === NnrpMessageType.ResultDropReason
  ) {
    throw new NnrpResultDropError(event);
  }
}

export function validateEventPollOptions(options: NnrpEventPollOptions = {}): void {
  if (
    options.timeoutMillis !== undefined &&
    (!Number.isFinite(options.timeoutMillis) || options.timeoutMillis < 0)
  ) {
    throw new NnrpProtocolError({
      code: "NNRP_EVENT_TIMEOUT_INVALID",
      message: "Event timeoutMillis must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }

  if (options.signal?.aborted) {
    throw new NnrpTimeoutError({
      code: "NNRP_EVENT_POLL_CANCELLED",
      message: "Event polling was cancelled.",
      source: "runtime",
      retryable: false,
      cause: options.signal.reason,
    });
  }
}

export function validateSessionMetadata(options: NnrpSessionMetadataOptions = {}): void {
  if (options.metadata !== undefined) {
    normalizeMetadataMap(options.metadata);
  }
}

export function normalizeSessionPatchRequest(request: NnrpSessionPatchRequest): NnrpSessionPatchRequest {
  if (request.inputProfile !== undefined) {
    validateInputProfile(request.inputProfile, true);
  }

  if (request.targetCadence !== undefined && (!Number.isFinite(request.targetCadence) || request.targetCadence < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_SESSION_TARGET_CADENCE_INVALID",
      message: "Session targetCadence must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }

  if (request.qualityTier !== undefined && (!Number.isSafeInteger(request.qualityTier) || request.qualityTier < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_SESSION_QUALITY_TIER_INVALID",
      message: "Session qualityTier must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }

  if (
    request.initialCredits !== undefined && (!Number.isFinite(request.initialCredits) || request.initialCredits < 0)
  ) {
    throw new NnrpProtocolError({
      code: "NNRP_SESSION_INITIAL_CREDITS_INVALID",
      message: "Session initialCredits must be a non-negative finite number.",
      source: "core",
      retryable: false,
    });
  }

  return {
    ...(request.inputProfile === undefined ? {} : { inputProfile: request.inputProfile }),
    ...(request.targetCadence === undefined ? {} : { targetCadence: request.targetCadence }),
    ...(request.qualityTier === undefined ? {} : { qualityTier: request.qualityTier }),
    ...(request.submitCapacityPolicy === undefined ? {} : { submitCapacityPolicy: request.submitCapacityPolicy }),
    ...(request.initialCredits === undefined ? {} : { initialCredits: request.initialCredits }),
    ...(request.metadata === undefined ? {} : { metadata: normalizeMetadataMap(request.metadata) }),
  };
}

function evaluateTransportCandidate(
  candidate: NnrpTransportCandidate,
  policy: NnrpTransportPolicy,
): NnrpTransportCandidate {
  validateTransportCandidate(candidate);
  const rejectionReason = transportRejectionReason(candidate, policy);
  const { rejectionReason: _rejectionReason, selectionRank: _selectionRank, ...evaluated } = candidate;
  return {
    ...evaluated,
    ...(rejectionReason === undefined ? {} : { rejectionReason }),
  };
}

function transportRejectionReason(
  candidate: NnrpTransportCandidate,
  policy: NnrpTransportPolicy,
): NnrpTransportRejectionReason | undefined {
  const forcedKind = forcedTransportKind(policy);
  if (forcedKind !== undefined && candidate.transportId !== forcedKind) {
    return "policy-disallowed";
  }
  if (!candidate.localAvailable) {
    return "local-unavailable";
  }
  if (!candidate.peerSupported) {
    return "peer-unsupported";
  }
  if (!candidate.withinLimits) {
    return "limit-exceeded";
  }
  if (
    candidate.rejectionReason === "route-unresolved" ||
    candidate.rejectionReason === "security-unsatisfied"
  ) {
    return candidate.rejectionReason;
  }

  return undefined;
}

function directTransportCandidate(candidate: NnrpTransportCandidate): NnrpTransportCandidate {
  const { probe: _probe, rejectionReason: _rejectionReason, selectionRank: _selectionRank, ...direct } = candidate;
  return { ...direct, probeState: "not-run", selectionRank: 0 };
}

function compareTransportCandidates(
  left: NnrpTransportCandidate,
  right: NnrpTransportCandidate,
  policy: NnrpTransportPolicy,
): number {
  const leftProbe = left.probe;
  const rightProbe = right.probe;
  if (leftProbe === undefined || rightProbe === undefined) {
    throw transportContractError(
      "NNRP_TRANSPORT_PROBE_METRICS_MISSING",
      "Successful transport candidates require probe metrics before comparison.",
      leftProbe === undefined ? left.transportId : right.transportId,
    );
  }

  return rightProbe.successCount - leftProbe.successCount ||
    compareBigInt(rightProbe.medianThroughputBytesPerSecond, leftProbe.medianThroughputBytesPerSecond) ||
    compareBigInt(leftProbe.medianRttMicroseconds, rightProbe.medianRttMicroseconds) ||
    compareProviderCost(left.provider.cost, right.provider.cost) ||
    comparePreferredTransport(left.transportId, right.transportId, policy) ||
    left.provider.preferenceRank - right.provider.preferenceRank ||
    transportNumericId(left.transportId) - transportNumericId(right.transportId) ||
    compareBytewise(left.provider.id, right.provider.id);
}

function compareProviderCost(left: NnrpTransportProviderCost, right: NnrpTransportProviderCost): number {
  return left.modelId !== 0 && left.modelId === right.modelId ? compareBigInt(left.units, right.units) : 0;
}

function comparePreferredTransport(
  left: NnrpTransportKind,
  right: NnrpTransportKind,
  policy: NnrpTransportPolicy,
): number {
  const preferred = preferredTransportKind(policy);
  if (preferred === undefined) {
    return 0;
  }
  return Number(right === preferred) - Number(left === preferred);
}

function compareRejectedTransportCandidates(left: NnrpTransportCandidate, right: NnrpTransportCandidate): number {
  return transportNumericId(left.transportId) - transportNumericId(right.transportId) ||
    compareBytewise(left.provider.id, right.provider.id);
}

function candidateIdentity(candidate: NnrpTransportCandidate): string {
  return `${transportNumericId(candidate.transportId)}\0${candidate.provider.id}`;
}

function transportNumericId(kind: NnrpTransportKind): number {
  switch (kind) {
    case "quic":
      return 1;
    case "tcp":
      return 2;
    case "ipc":
      return 3;
    case "websocket":
      return 4;
  }
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareBytewise(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  for (let index = 0; index < Math.min(leftBytes.length, rightBytes.length); index += 1) {
    const difference = (leftBytes[index] ?? 0) - (rightBytes[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return leftBytes.length - rightBytes.length;
}

function validateTransportCandidate(candidate: NnrpTransportCandidate): void {
  validateTransportProviderMetadata(candidate.provider, candidate.transportId);
  if (candidate.probeState === "succeeded") {
    if (candidate.probe === undefined) {
      throw transportContractError(
        "NNRP_TRANSPORT_PROBE_METRICS_MISSING",
        "A succeeded transport probe must include metrics.",
        candidate.transportId,
      );
    }
    validateTransportProbeMetrics(candidate.probe, candidate.transportId);
  } else if (candidate.probe !== undefined) {
    throw transportContractError(
      "NNRP_TRANSPORT_PROBE_STATE_INVALID",
      "Probe metrics are allowed only when probeState is succeeded.",
      candidate.transportId,
    );
  }
}

function validateTransportSelectionCandidates(candidates: readonly NnrpTransportCandidate[]): void {
  const kinds = new Set<NnrpTransportKind>();
  const providerIds = new Set<string>();
  for (const candidate of candidates) {
    validateTransportCandidate(candidate);
    if (kinds.has(candidate.transportId) || providerIds.has(candidate.provider.id)) {
      throw invalidTransportEvidence("Transport candidates must contain unique transport kinds and provider ids.");
    }
    kinds.add(candidate.transportId);
    providerIds.add(candidate.provider.id);
  }
}

function validateTransportSelectionEvidence(
  providers: readonly NnrpTransportProviderDescriptor[],
  readiness: readonly NnrpTransportCandidateReadiness[],
  observations: readonly NnrpTransportProbeObservation[],
  policy?: NnrpTransportPolicy,
): void {
  const kinds = new Set<NnrpTransportKind>();
  const providerIds = new Set<string>();
  const providerKeys = new Set<string>();
  for (const provider of providers) {
    validateTransportProviderDescriptor(provider);
    if (kinds.has(provider.transportId) || providerIds.has(provider.metadata.id)) {
      throw invalidTransportEvidence(
        "Provider descriptors must contain unique transport kinds and provider ids.",
        policy,
      );
    }
    kinds.add(provider.transportId);
    providerIds.add(provider.metadata.id);
    providerKeys.add(transportEvidenceKey(provider.transportId, provider.metadata.id));
  }

  const readinessKeys = new Set<string>();
  for (const record of readiness) {
    validateTransportCandidateReadiness(record);
    const key = transportEvidenceKey(record.transportId, record.providerId);
    if (!providerKeys.has(key)) {
      throw invalidTransportEvidence("Candidate readiness contains an unmatched provider identity.", policy);
    }
    if (readinessKeys.has(key)) {
      throw invalidTransportEvidence("Candidate readiness contains a duplicate provider identity.", policy);
    }
    readinessKeys.add(key);
  }
  if (readinessKeys.size !== providerKeys.size) {
    throw invalidTransportEvidence("Candidate readiness must contain exactly one record for every provider.", policy);
  }

  const observationKeys = new Set<string>();
  for (const observation of observations) {
    validateTransportProbeObservation(observation);
    const key = transportEvidenceKey(observation.transportId, observation.providerId);
    if (!providerKeys.has(key)) {
      throw invalidTransportEvidence("Probe observations contain an unmatched provider identity.", policy);
    }
    if (observationKeys.has(key)) {
      throw invalidTransportEvidence("Probe observations contain a duplicate provider identity.", policy);
    }
    observationKeys.add(key);
  }
}

function validateTransportCandidateReadiness(readiness: NnrpTransportCandidateReadiness): void {
  if (
    !NNRP_TRANSPORT_KINDS.has(readiness.transportId) || !isNonEmptyAscii(readiness.providerId) ||
    typeof readiness.routeResolved !== "boolean" || typeof readiness.securitySatisfied !== "boolean" ||
    (readiness.diagnostic !== undefined && typeof readiness.diagnostic !== "string")
  ) {
    throw invalidTransportEvidence("Candidate readiness contains an invalid provider identity or readiness value.");
  }
}

function validateTransportProbeObservation(observation: NnrpTransportProbeObservation): void {
  if (
    !NNRP_TRANSPORT_KINDS.has(observation.transportId) || !isNonEmptyAscii(observation.providerId) ||
    (observation.state !== "succeeded" && observation.state !== "failed") ||
    (observation.diagnostic !== undefined && typeof observation.diagnostic !== "string")
  ) {
    throw invalidTransportEvidence("Probe observation contains an invalid provider identity or state.");
  }
  if (observation.state === "succeeded") {
    if (observation.metrics === undefined) {
      throw invalidTransportEvidence("Succeeded probe observations require metrics.");
    }
    validateTransportProbeMetrics(observation.metrics, observation.transportId);
  } else if (observation.metrics !== undefined) {
    throw invalidTransportEvidence("Failed probe observations must not include metrics.");
  }
}

function transportEvidenceKey(kind: NnrpTransportKind, providerId: string): string {
  return `${transportNumericId(kind)}\0${providerId}`;
}

function invalidTransportEvidence(message: string, policy?: NnrpTransportPolicy): NnrpTransportSelectionError {
  return new NnrpTransportSelectionError(
    "INVALID_EVIDENCE",
    message,
    { ...(policy === undefined ? {} : { policy }) },
  );
}

function transportSelectionError(
  policy: NnrpTransportPolicy,
  candidates: readonly NnrpTransportCandidate[],
): NnrpTransportSelectionError {
  const forcedKind = forcedTransportKind(policy);
  if (forcedKind !== undefined) {
    const candidate = candidates.find((value) => value.transportId === forcedKind);
    const reason = candidate?.rejectionReason;
    return new NnrpTransportSelectionError(
      "FORCED_TRANSPORT_UNAVAILABLE",
      reason === undefined
        ? `Forced transport is not available: ${forcedKind}.`
        : `Forced transport ${forcedKind} was rejected: ${reason}.`,
      { policy, transportId: forcedKind, candidates },
    );
  }
  return new NnrpTransportSelectionError(
    "NO_VIABLE_TRANSPORT",
    "No viable transport provider remains after applying policy and evidence.",
    { policy, candidates },
  );
}

function validateTransportProviderDescriptor(provider: NnrpTransportProviderDescriptor): void {
  if (
    !isNonEmptyAscii(provider.name) || provider.version.trim().length === 0 ||
    !NNRP_TRANSPORT_KINDS.has(provider.transportId) ||
    (provider.kind !== "pure-rust" && provider.kind !== "native-dynamic" && provider.kind !== "wasm") ||
    typeof provider.available !== "boolean" ||
    (provider.libraryPath !== undefined && provider.libraryPath.trim().length === 0) ||
    (provider.diagnostic !== undefined && provider.diagnostic.trim().length === 0)
  ) {
    throw invalidTransportEvidence(`Transport provider descriptor is invalid: ${provider.name || "<empty>"}.`);
  }
  validateTransportProviderMetadata(provider.metadata, provider.transportId);
}

function validateTransportProviderMetadata(
  metadata: NnrpTransportProviderMetadata,
  kind: NnrpTransportKind,
): void {
  const limitations = metadata.limitations;
  if (
    !isNonEmptyAscii(metadata.id) || !Number.isInteger(metadata.cost.modelId) || metadata.cost.modelId < 0 ||
    metadata.cost.modelId > 0xffff || metadata.cost.units < 0n ||
    (metadata.cost.modelId === 0 && metadata.cost.units !== 0n) ||
    metadata.cost.units > 0xffff_ffff_ffff_ffffn || !Number.isInteger(metadata.preferenceRank) ||
    metadata.preferenceRank < 0 || metadata.preferenceRank > 0xffff || metadata.limits.maxFrameBytes <= 0n ||
    metadata.limits.maxFrameBytes > 0xffff_ffff_ffff_ffffn || new Set(limitations).size !== limitations.length ||
    limitations.some((limitation) => !NNRP_TRANSPORT_PROVIDER_LIMITATIONS.has(limitation))
  ) {
    throw transportContractError(
      "NNRP_TRANSPORT_PROVIDER_METADATA_INVALID",
      `Transport provider metadata is invalid: ${metadata.id || "<empty>"}.`,
      kind,
    );
  }
}

function isNonEmptyAscii(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) {
      return false;
    }
  }
  return true;
}

function validateTransportProbeMetrics(metrics: NnrpTransportProbeMetrics, kind: NnrpTransportKind): void {
  if (
    !Number.isInteger(metrics.sampleCount) || !Number.isInteger(metrics.successCount) || metrics.sampleCount <= 0 ||
    metrics.sampleCount > 0xffff_ffff || metrics.successCount <= 0 || metrics.successCount > metrics.sampleCount ||
    metrics.medianThroughputBytesPerSecond < 0n ||
    metrics.medianThroughputBytesPerSecond > 0xffff_ffff_ffff_ffffn || metrics.medianRttMicroseconds < 0n ||
    metrics.medianRttMicroseconds > 0xffff_ffff_ffff_ffffn
  ) {
    throw transportContractError(
      "NNRP_TRANSPORT_PROBE_METRICS_INVALID",
      "Transport probe metrics must contain positive bounded sample counts and non-negative medians.",
      kind,
    );
  }
}

function transportContractError(code: string, message: string, transport: NnrpTransportKind): NnrpTransportError {
  return new NnrpTransportError({ code, message, source: "transport", retryable: false, transport });
}

function preferredTransportKind(policy: NnrpTransportPolicy): NnrpTransportKind | undefined {
  switch (policy) {
    case "prefer-quic":
    case "force-quic":
      return "quic";
    case "prefer-tcp":
    case "force-tcp":
      return "tcp";
    case "prefer-ipc":
    case "force-ipc":
      return "ipc";
    case "prefer-websocket":
    case "force-websocket":
      return "websocket";
    case "auto":
      return undefined;
  }
}

function forcedTransportKind(policy: NnrpTransportPolicy): NnrpTransportKind | undefined {
  return policy.startsWith("force-") ? preferredTransportKind(policy) : undefined;
}

function createPayloadDescriptor(descriptor: NnrpPayloadDescriptor): NnrpPayloadDescriptor {
  validateInputProfile(descriptor.profile, true);

  return {
    profile: descriptor.profile,
    ...(descriptor.schema === undefined ? {} : { schema: createSchemaDescriptor(descriptor.schema) }),
    ...(descriptor.cache === undefined ? {} : { cache: createCacheMetadata(descriptor.cache) }),
    ...(descriptor.metadata === undefined ? {} : { metadata: { ...descriptor.metadata } }),
  };
}

function normalizeEndpointValue(endpoint: string | URL): string {
  const value = endpoint instanceof URL ? endpoint.toString() : endpoint.trim();
  if (value.length === 0) {
    throw invalidApplicationEndpoint("NNRP application endpoint cannot be empty.");
  }
  return value;
}

function applicationHostPort(endpoint: NnrpEndpoint): string {
  return `${endpoint.hostname}:${endpoint.port || NNRP_DEFAULT_PORT}`;
}

function isProviderEndpointScheme(
  value: string,
): value is "tcp" | "quic" | "unix" | "npipe" | "ws" | "wss" {
  return value === "tcp" || value === "quic" || value === "unix" || value === "npipe" || value === "ws" ||
    value === "wss";
}

function parseHostPortProviderEndpoint(
  endpoint: NnrpProviderEndpoint,
  transport: Extract<NnrpTransportKind, "tcp" | "quic">,
): string {
  if (!endpoint.matchesTransport(transport)) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint must use ${transport}://.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint.uri);
  } catch (cause) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint is malformed.`, cause);
  }

  if (
    parsed.hostname.length === 0 || parsed.port.length === 0 || parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    (parsed.pathname !== "" && parsed.pathname !== "/") || parsed.search.length > 0 || parsed.hash.length > 0
  ) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint must contain only host and port.`);
  }

  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw invalidProviderEndpoint(transport, `${transport} provider endpoint has an invalid port.`);
  }

  return `${parsed.hostname}:${port}`;
}

function parseIpcProviderEndpoint(
  endpoint: NnrpProviderEndpoint | undefined,
  transport: Extract<NnrpTransportKind, "ipc">,
): string {
  if (endpoint === undefined) {
    throw invalidProviderEndpoint(transport, "IPC selection requires an explicit unix:// or npipe:// endpoint.");
  }

  if (!endpoint.matchesTransport(transport)) {
    throw invalidProviderEndpoint(transport, "IPC provider endpoint must use unix:// or npipe://.");
  }
  const value = endpoint.uri;
  const scheme = value.startsWith("unix://") ? "unix://" : value.startsWith("npipe://") ? "npipe://" : undefined;
  if (scheme === undefined || value.slice(scheme.length).replace(/^\/+|\/+$/g, "").length === 0) {
    throw invalidProviderEndpoint(transport, "IPC provider endpoint must use unix:// or npipe:// with a locator.");
  }

  return value;
}

function parseWebsocketProviderEndpoint(
  applicationEndpoint: NnrpEndpoint,
  endpoint: NnrpProviderEndpoint | undefined,
  transport: Extract<NnrpTransportKind, "websocket">,
): string {
  if (endpoint === undefined) {
    throw invalidProviderEndpoint(transport, "websocket selection requires an explicit ws:// or wss:// endpoint.");
  }

  if (!endpoint.matchesTransport(transport)) {
    throw invalidProviderEndpoint(transport, "websocket provider endpoint must use ws:// or wss://.");
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint.uri);
  } catch (cause) {
    throw invalidProviderEndpoint(transport, "websocket provider endpoint is malformed.", cause);
  }

  if ((parsed.protocol !== "ws:" && parsed.protocol !== "wss:") || parsed.hostname.length === 0) {
    throw invalidProviderEndpoint(transport, "websocket provider endpoint must use ws:// or wss://.");
  }
  if (applicationEndpoint.protocol === "nnrps:" && parsed.protocol !== "wss:") {
    throw invalidProviderEndpoint(transport, "websocket provider endpoint must preserve application security intent.");
  }

  return parsed.toString();
}

function invalidApplicationEndpoint(message: string, cause?: unknown): NnrpProtocolError {
  return new NnrpProtocolError({
    code: "NNRP_APPLICATION_ENDPOINT_INVALID",
    message,
    source: "core",
    retryable: false,
    ...(cause === undefined ? {} : { cause }),
  });
}

function invalidProviderEndpoint(
  transport: NnrpTransportKind | undefined,
  message: string,
  cause?: unknown,
): NnrpTransportError {
  return new NnrpTransportError({
    code: "NNRP_PROVIDER_ENDPOINT_INVALID",
    message,
    source: "transport",
    retryable: false,
    ...(transport === undefined ? {} : { transport }),
    ...(cause === undefined ? {} : { cause }),
  });
}

function lifecycleError(code: string, message: string): NnrpProtocolError {
  return new NnrpProtocolError({ code, message, source: "core", retryable: false });
}

function validateLifecycleU16(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw lifecycleError("NNRP_LIFECYCLE_U16_INVALID", `${name} must fit the frozen u16 range.`);
  }
}

function validateLifecycleU32(name: string, value: number, nonzero = false): void {
  const minimum = nonzero ? 1 : 0;
  if (!Number.isInteger(value) || value < minimum || value > 0xffff_ffff) {
    throw lifecycleError(
      "NNRP_LIFECYCLE_U32_INVALID",
      `${name} must fit the frozen ${nonzero ? "non-zero " : ""}u32 range.`,
    );
  }
}

function createCacheMetadata(metadata: NnrpCacheMetadata): NnrpCacheMetadata {
  validateCacheKey(metadata.key);
  validateLeaseMillis(metadata.leaseMillis);

  return {
    key: metadata.key,
    ...(metadata.version === undefined ? {} : { version: metadata.version }),
    ...(metadata.leaseMillis === undefined ? {} : { leaseMillis: metadata.leaseMillis }),
    ...(metadata.dependencies === undefined
      ? {}
      : { dependencies: metadata.dependencies.map((key) => createCacheKey(key.kind, key.key, key.namespaceId)) }),
  };
}

function normalizedSubmitFromParts(
  identity: NnrpSubmitIdentity,
  metadata: NnrpSubmitMetadata,
  body: Uint8Array,
): NnrpSubmitRequest {
  const request: NnrpSubmitRequest = {
    operationId: identity.operationId,
    frameId: identity.frameId,
    header: { ...identity.header },
    metadata,
    body,
  };
  validateSubmitRequestShape(request);
  return request;
}

function validateSubmitIdentity(identity: NnrpSubmitIdentity): void {
  if (identity.operationId <= 0n || identity.operationId > 0xffff_ffff_ffff_ffffn) {
    throw submitProtocolError(
      "NNRP_SUBMIT_OPERATION_ID_INVALID",
      "Submit request operationId must be between 1 and 2^64-1.",
    );
  }
  if (!Number.isSafeInteger(identity.frameId) || identity.frameId <= 0 || identity.frameId > 0xffff_ffff) {
    throw submitProtocolError(
      "NNRP_SUBMIT_FRAME_ID_INVALID",
      "Submit request frameId must be between 1 and 2^32-1.",
    );
  }
  assertUnsigned("header.flags", identity.header.flags, 0x3f);
  assertUnsigned("header.viewId", identity.header.viewId, 0xffff);
  assertUnsigned("header.routeId", identity.header.routeId, 0xffff);
  assertSubmitU64("header.traceId", identity.header.traceId);
}

function validateSubmitPolicy(policy: NnrpSubmitPolicy): void {
  assertUnsigned("policy.frameClass", policy.frameClass, 0xff);
  assertUnsigned("policy.latencyBudgetMs", policy.latencyBudgetMs, 0xffff);
  assertUnsigned("policy.targetFpsX100", policy.targetFpsX100, 0xffff);
  assertUnsigned("policy.retryOfFrame", policy.retryOfFrame, 0xffff_ffff);
  assertUnsigned("policy.budgetPolicy", policy.budgetPolicy, 0x0f);
  if (![0, 1, 2, 3, 0xff].includes(policy.lossTolerancePolicy)) {
    throw submitProtocolError(
      "NNRP_SUBMIT_LOSS_TOLERANCE_INVALID",
      "Submit lossTolerancePolicy is not a frozen wire value.",
    );
  }
  assertUnsigned("policy.dependencyFrameId", policy.dependencyFrameId, 0xffff_ffff);
}

function validateFrameSubmitMetadata(metadata: NnrpFrameSubmitMetadata): void {
  validateSubmitMetadataShape(metadata.operationId, metadata);
}

function validateSubmitReference(
  reference: NnrpObjectReferenceBlock | undefined,
  expectedKind: NnrpCacheObjectKind,
  slot: string,
): void {
  if (reference === undefined) return;
  if (reference.objectKind !== expectedKind) {
    throw submitProtocolError(
      "NNRP_SUBMIT_REFERENCE_SLOT_INVALID",
      `Submit ${slot} reference uses the wrong object kind.`,
    );
  }
  validateObjectReferenceBlock(reference);
  assertUnsigned(`${slot}.cacheNamespace`, reference.cacheNamespace, 0xffff_ffff);
  assertSubmitU64(`${slot}.cacheKeyHi`, reference.cacheKeyHi);
  assertSubmitU64(`${slot}.cacheKeyLo`, reference.cacheKeyLo);
}

function validateObjectReferenceBlock(reference: NnrpObjectReferenceBlock): void {
  if (!isCacheObjectKind(reference.objectKind)) {
    throw submitProtocolError("NNRP_OBJECT_REFERENCE_KIND_INVALID", "Object reference kind is not registered.");
  }
  if (reference.refFlags !== 0) {
    throw submitProtocolError("NNRP_OBJECT_REFERENCE_FLAGS_INVALID", "Object reference flags must be zero.");
  }
  assertUnsigned("reference.cacheNamespace", reference.cacheNamespace, 0xffff_ffff);
  assertSubmitU64("reference.cacheKeyHi", reference.cacheKeyHi);
  assertSubmitU64("reference.cacheKeyLo", reference.cacheKeyLo);
}

export function encodeObjectReferenceBlock(reference: NnrpObjectReferenceBlock): Uint8Array {
  validateObjectReferenceBlock(reference);
  const output = new Uint8Array(24);
  const view = new DataView(output.buffer);
  view.setUint16(0, reference.objectKind, true);
  view.setUint16(2, reference.refFlags, true);
  view.setUint32(4, reference.cacheNamespace, true);
  view.setBigUint64(8, reference.cacheKeyHi, true);
  view.setBigUint64(16, reference.cacheKeyLo, true);
  return output;
}

export function decodeObjectReferenceBlock(encoded: Uint8Array): NnrpObjectReferenceBlock {
  requireExactRuntimePayload(encoded, 24, "OBJECT_REFERENCE_BLOCK");
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const reference: NnrpObjectReferenceBlock = {
    objectKind: view.getUint16(0, true) as NnrpCacheObjectKind,
    refFlags: view.getUint16(2, true),
    cacheNamespace: view.getUint32(4, true),
    cacheKeyHi: view.getBigUint64(8, true),
    cacheKeyLo: view.getBigUint64(16, true),
  };
  validateObjectReferenceBlock(reference);
  return reference;
}

function appendInlineSubmitObject(target: number[], objectKind: NnrpCacheObjectKind, payload: Uint8Array): void {
  checkedSubmitU32(payload.byteLength, "inline object bytes");
  const header = new Uint8Array(16);
  const view = new DataView(header.buffer);
  view.setUint16(0, objectKind, true);
  view.setUint32(8, payload.byteLength, true);
  target.push(...header, ...payload);
  while (target.length % 8 !== 0) target.push(0);
}

function encodeSubmitTileIndices(
  tileIds: readonly number[],
  mode: NnrpTileIndexMode,
  tileBaseId: number,
): Uint8Array {
  for (const tileId of tileIds) assertUnsigned("tileId", tileId, 0xffff);
  switch (mode) {
    case NnrpTileIndexMode.DenseRange:
      tileIds.forEach((tileId, index) => {
        if (tileId !== tileBaseId + index) {
          throw submitProtocolError(
            "NNRP_DENSE_TILE_IDS_INVALID",
            "Dense tile ids must be contiguous from tileBaseId.",
          );
        }
      });
      return new Uint8Array();
    case NnrpTileIndexMode.RawU16: {
      const output = new Uint8Array(tileIds.length * 2);
      const view = new DataView(output.buffer);
      tileIds.forEach((tileId, index) => view.setUint16(index * 2, tileId, true));
      return output;
    }
    case NnrpTileIndexMode.DeltaU16: {
      const output = new Uint8Array(tileIds.length * 2);
      const view = new DataView(output.buffer);
      let previous: number | undefined;
      tileIds.forEach((tileId, index) => {
        if (previous !== undefined && tileId <= previous) {
          throw submitProtocolError(
            "NNRP_DELTA_TILE_IDS_INVALID",
            "Delta tile ids must be strictly increasing.",
          );
        }
        const delta = previous === undefined ? tileId : tileId - previous;
        assertUnsigned("tileId delta", delta, 0xffff);
        view.setUint16(index * 2, delta, true);
        previous = tileId;
      });
      return output;
    }
    case NnrpTileIndexMode.Bitset: {
      for (let index = 1; index < tileIds.length; index += 1) {
        if (tileIds[index - 1]! >= tileIds[index]!) {
          throw submitProtocolError(
            "NNRP_BITSET_TILE_IDS_INVALID",
            "Bitset tile ids must be strictly increasing.",
          );
        }
      }
      const output = new Uint8Array(tileIds.length === 0 ? 0 : Math.floor(tileIds[tileIds.length - 1]! / 8) + 1);
      for (const tileId of tileIds) output[Math.floor(tileId / 8)]! |= 1 << (tileId % 8);
      return output;
    }
    default:
      throw submitProtocolError("NNRP_TILE_INDEX_MODE_INVALID", "Unknown tile index mode.");
  }
}

function encodeSubmitTensorSections(sections: readonly NnrpTensorSection[], tileCount: number): Uint8Array {
  const table: number[] = [];
  let previousRole: number | undefined;
  for (const section of sections) {
    assertUnsigned("section.roleId", section.roleId, 0xffff);
    if (previousRole !== undefined && section.roleId <= previousRole) {
      throw submitProtocolError(
        "NNRP_TENSOR_SECTION_ORDER_INVALID",
        "Tensor sections must be strictly ordered by roleId.",
      );
    }
    previousRole = section.roleId;
    assertUnsigned("section.defaultCodecId", section.defaultCodecId, 0xff);
    assertUnsigned("section.dtypeId", section.dtypeId, 0xff);
    assertUnsigned("section.layoutId", section.layoutId, 0xff);
    assertUnsigned("section.scalePolicy", section.scalePolicy, 0xff);
    assertUnsigned("section.elementCountPerTile", section.elementCountPerTile, 0xffff_ffff);
    assertUnsigned("section.payloadStrideBytes", section.payloadStrideBytes, 0xffff_ffff);
    if (section.tilePayloads.length !== tileCount) {
      throw submitProtocolError(
        "NNRP_TENSOR_TILE_PAYLOAD_COUNT_INVALID",
        "Tensor section tile payload count must match tile count.",
      );
    }
    if (section.codecIds.length !== 0 && section.codecIds.length !== tileCount) {
      throw submitProtocolError(
        "NNRP_TENSOR_CODEC_COUNT_INVALID",
        "Tensor codec id count must be zero or match tile count.",
      );
    }
    section.codecIds.forEach((codec) => assertUnsigned("section.codecId", codec, 0xff));
    const mixedCodec = section.codecIds.some((codec) => codec !== section.defaultCodecId);
    const codecTable = mixedCodec ? new Uint8Array(section.codecIds) : new Uint8Array();
    const lengthTable = new Uint8Array(tileCount * 4);
    const lengthView = new DataView(lengthTable.buffer);
    const payloadParts: Uint8Array[] = [];
    section.tilePayloads.forEach((value, index) => {
      const payload = normalizeBinaryPayload(value, true);
      lengthView.setUint32(index * 4, checkedSubmitU32(payload.byteLength, "tensor tile payload bytes"), true);
      if (section.payloadStrideBytes === 0) {
        payloadParts.push(payload);
      } else {
        if (payload.byteLength > section.payloadStrideBytes) {
          throw submitProtocolError(
            "NNRP_TENSOR_STRIDE_INVALID",
            "Tensor tile payload exceeds payloadStrideBytes.",
          );
        }
        const padded = new Uint8Array(section.payloadStrideBytes);
        padded.set(payload);
        payloadParts.push(padded);
      }
    });
    const payload = concatBytes(payloadParts);
    const descriptor = new Uint8Array(32);
    const descriptorView = new DataView(descriptor.buffer);
    descriptorView.setUint16(0, section.roleId, true);
    descriptorView.setUint8(2, section.defaultCodecId);
    descriptorView.setUint8(3, section.dtypeId);
    descriptorView.setUint8(4, section.layoutId);
    descriptorView.setUint8(5, section.scalePolicy);
    descriptorView.setUint16(6, (mixedCodec ? 1 : 0) | (section.payloadStrideBytes === 0 ? 0 : 2), true);
    descriptorView.setUint32(8, section.elementCountPerTile, true);
    descriptorView.setUint32(12, codecTable.byteLength, true);
    descriptorView.setUint32(16, lengthTable.byteLength, true);
    descriptorView.setUint32(20, checkedSubmitU32(payload.byteLength, "tensor section payload bytes"), true);
    descriptorView.setUint32(24, section.payloadStrideBytes, true);
    while (table.length % 8 !== 0) table.push(0);
    table.push(...descriptor, ...codecTable, ...lengthTable, ...payload);
  }
  return new Uint8Array(table);
}

function encodeSubmitBody(
  inlineRegion: Uint8Array,
  referenceRegion: Uint8Array,
  descriptorRegion: Uint8Array,
  payloadRegion: Uint8Array,
): Uint8Array {
  const prelude = new Uint8Array(32);
  const view = new DataView(prelude.buffer);
  view.setUint32(0, checkedSubmitU32(inlineRegion.byteLength, "inline object region"), true);
  view.setUint32(4, checkedSubmitU32(referenceRegion.byteLength, "object reference region"), true);
  view.setUint32(8, checkedSubmitU32(descriptorRegion.byteLength, "typed descriptor region"), true);
  view.setUint32(12, checkedSubmitU32(payloadRegion.byteLength, "typed payload region"), true);
  return concatBytes([prelude, inlineRegion, referenceRegion, descriptorRegion, payloadRegion]);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  checkedSubmitU32(length, "submit payload bytes");
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function checkedSubmitU32(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw submitProtocolError("NNRP_SUBMIT_LENGTH_OVERFLOW", `${name} must fit in u32.`);
  }
  return value;
}

function assertSubmitU64(name: string, value: bigint): void {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw submitProtocolError("NNRP_SUBMIT_U64_INVALID", `${name} is outside its unsigned wire range.`);
  }
}

function submitProtocolError(code: string, message: string): NnrpProtocolError {
  return new NnrpProtocolError({ code, message, source: "core", retryable: false });
}

function validateSubmitRequestShape(request: NnrpSubmitRequest): void {
  if (request.operationId <= 0n || request.operationId > 0xffff_ffff_ffff_ffffn) {
    throw new NnrpProtocolError({
      code: "NNRP_SUBMIT_OPERATION_ID_INVALID",
      message: "Submit request operationId must be between 1 and 2^64-1.",
      source: "core",
      retryable: false,
    });
  }

  if (!Number.isSafeInteger(request.frameId) || request.frameId <= 0 || request.frameId > 0xffff_ffff) {
    throw new NnrpProtocolError({
      code: "NNRP_SUBMIT_FRAME_ID_INVALID",
      message: "Submit request frameId must be between 1 and 2^32-1.",
      source: "core",
      retryable: false,
    });
  }

  validateSubmitIdentity({ operationId: request.operationId, frameId: request.frameId, header: request.header });
  validateSubmitMetadataShape(request.operationId, request.metadata);
  validateSubmitBody(request.metadata, request.body);
}

function validateSubmitMetadataShape(operationId: bigint, metadata: NnrpSubmitMetadata): void {
  if (operationId <= 0n || operationId > 0xffff_ffff_ffff_ffffn) {
    throw submitProtocolError(
      "NNRP_SUBMIT_OPERATION_ID_INVALID",
      "Submit metadata operationId must be between 1 and 2^64-1.",
    );
  }
  assertUnsigned("metadata.srcWidth", metadata.srcWidth, 0xffff);
  assertUnsigned("metadata.srcHeight", metadata.srcHeight, 0xffff);
  assertUnsigned("metadata.tileWidth", metadata.tileWidth, 0xffff);
  assertUnsigned("metadata.tileHeight", metadata.tileHeight, 0xffff);
  assertUnsigned("metadata.tileCount", metadata.tileCount, 0xffff);
  assertUnsigned("metadata.sectionCount", metadata.sectionCount, 0xffff);
  assertUnsigned("metadata.frameClass", metadata.frameClass, 0xff);
  assertUnsigned("metadata.inputProfile", metadata.inputProfile, 2);
  assertUnsigned("metadata.tileIndexMode", metadata.tileIndexMode, 3);
  assertUnsigned("metadata.latencyBudgetMs", metadata.latencyBudgetMs, 0xffff);
  assertUnsigned("metadata.targetFpsX100", metadata.targetFpsX100, 0xffff);
  assertUnsigned("metadata.retryOfFrame", metadata.retryOfFrame, 0xffff_ffff);
  assertUnsigned("metadata.tileBaseId", metadata.tileBaseId, 0xffff_ffff);
  assertUnsigned("metadata.cameraBytes", metadata.cameraBytes, 0xffff_ffff);
  assertUnsigned("metadata.tileIndexBytes", metadata.tileIndexBytes, 0xffff_ffff);
  assertUnsigned("metadata.submitMode", metadata.submitMode, 2);
  assertUnsigned("metadata.budgetPolicy", metadata.budgetPolicy, 0x0f);
  if (![0, 1, 2, 3, 0xff].includes(metadata.lossTolerancePolicy)) {
    throw submitProtocolError(
      "NNRP_SUBMIT_LOSS_TOLERANCE_INVALID",
      "Submit metadata lossTolerancePolicy is not a frozen wire value.",
    );
  }
  assertUnsigned("metadata.objectRefMask", metadata.objectRefMask, 0x0f);
  assertUnsigned("metadata.dependencyFrameId", metadata.dependencyFrameId, 0xffff_ffff);
  if (metadata.payloadKindBitmap === 0 || (metadata.payloadKindBitmap & ~0x7f) !== 0) {
    throw submitProtocolError(
      "NNRP_SUBMIT_PAYLOAD_BITMAP_INVALID",
      "Submit payloadKindBitmap must contain current payload kinds.",
    );
  }
  assertUnsigned("metadata.payloadFrameCount", metadata.payloadFrameCount, 0xffff);
  if (
    (metadata.payloadKindBitmap & NnrpPayloadKind.Tensor) === 0 && (
      metadata.srcWidth !== 0 || metadata.srcHeight !== 0 || metadata.tileWidth !== 0 ||
      metadata.tileHeight !== 0 || metadata.tileCount !== 0 || metadata.sectionCount !== 0 ||
      metadata.tileBaseId !== 0 || metadata.cameraBytes !== 0 || metadata.tileIndexBytes !== 0 ||
      metadata.inputProfile !== NnrpTensorInputProfile.Unspecified
    )
  ) {
    throw submitProtocolError(
      "NNRP_NON_TENSOR_FIELDS_INVALID",
      "Non-tensor submits must clear tensor tile fields.",
    );
  }
}

function validateSubmitBody(metadata: NnrpSubmitMetadata, body: Uint8Array): void {
  if (!(body instanceof Uint8Array) || body.byteLength < 32) {
    throw submitProtocolError("NNRP_SUBMIT_BODY_INVALID", "Submit body must contain a BodyRegionPrelude.");
  }
  const prelude = new DataView(body.buffer, body.byteOffset, 32);
  if (prelude.getUint32(24, true) !== 0 || prelude.getUint32(28, true) !== 0) {
    throw submitProtocolError("NNRP_SUBMIT_BODY_RESERVED", "Submit body prelude reserved fields must be zero.");
  }
  const regionBytes = prelude.getUint32(0, true) + prelude.getUint32(4, true) +
    prelude.getUint32(8, true) + prelude.getUint32(12, true) + prelude.getUint32(16, true) +
    prelude.getUint32(20, true);
  if (regionBytes !== body.byteLength - 32) {
    throw submitProtocolError("NNRP_SUBMIT_BODY_LENGTH_INVALID", "Submit body region lengths do not cover the body.");
  }
  const objectReferenceBytes = prelude.getUint32(4, true);
  const typedPayloadDescriptorBytes = prelude.getUint32(8, true);
  const typedPayloadFrameBytes = prelude.getUint32(12, true);
  const extensionDescriptorBytes = prelude.getUint32(16, true);
  if (objectReferenceBytes % 24 !== 0) {
    throw submitProtocolError(
      "NNRP_SUBMIT_OBJECT_REFERENCE_LENGTH_INVALID",
      "Submit object reference region must contain complete 24-byte blocks.",
    );
  }
  if (typedPayloadDescriptorBytes % 24 !== 0 || typedPayloadDescriptorBytes !== metadata.payloadFrameCount * 24) {
    throw submitProtocolError(
      "NNRP_SUBMIT_TYPED_DESCRIPTOR_LENGTH_INVALID",
      "Submit typed payload descriptor bytes must equal payloadFrameCount * 24.",
    );
  }
  if (metadata.payloadFrameCount === 0 && typedPayloadFrameBytes !== 0) {
    throw submitProtocolError(
      "NNRP_SUBMIT_TYPED_FRAME_LENGTH_INVALID",
      "Submit typed payload frame bytes must be zero when payloadFrameCount is zero.",
    );
  }
  if (extensionDescriptorBytes % 16 !== 0) {
    throw submitProtocolError(
      "NNRP_SUBMIT_EXTENSION_DESCRIPTOR_LENGTH_INVALID",
      "Submit extension descriptor region must contain complete 16-byte descriptors.",
    );
  }
}

function validateRecoveryToken(token: NnrpRecoveryToken): void {
  if (typeof token.token === "string") {
    if (token.token.trim().length === 0 || token.token.length > 4096) {
      throw new NnrpProtocolError({
        code: "NNRP_RECOVERY_TOKEN_INVALID",
        message: "Recovery token strings must be non-empty and at most 4096 characters.",
        source: "core",
        retryable: false,
      });
    }
  } else if (token.token.byteLength === 0 || token.token.byteLength > 4096) {
    throw new NnrpProtocolError({
      code: "NNRP_RECOVERY_TOKEN_INVALID",
      message: "Recovery token payloads must be non-empty and at most 4096 bytes.",
      source: "core",
      retryable: false,
    });
  }

  if (token.metadata !== undefined) {
    normalizeMetadataMap(token.metadata);
  }
}

function validateLeaseMillis(leaseMillis: number | undefined): void {
  if (leaseMillis !== undefined && (!Number.isSafeInteger(leaseMillis) || leaseMillis < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_LEASE_INVALID",
      message: "Cache leaseMillis must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }
}

function normalizeMetadataMap(metadata: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const entries = Object.entries(metadata);
  if (entries.length > 32) {
    throw new NnrpProtocolError({
      code: "NNRP_METADATA_TOO_MANY_ENTRIES",
      message: "Metadata maps must contain at most 32 entries.",
      source: "core",
      retryable: false,
    });
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (key.trim().length === 0 || key.length > 64) {
      throw new NnrpProtocolError({
        code: "NNRP_METADATA_KEY_INVALID",
        message: "Metadata keys must be non-empty and at most 64 characters.",
        source: "core",
        retryable: false,
      });
    }

    if (value.length > 1024) {
      throw new NnrpProtocolError({
        code: "NNRP_METADATA_VALUE_INVALID",
        message: "Metadata values must be at most 1024 characters.",
        source: "core",
        retryable: false,
      });
    }

    normalized[key] = value;
  }

  return normalized;
}

function validateInputProfile(profile: string, strictProfiles: boolean): void {
  if (strictProfiles && !isStandardInputProfile(profile)) {
    throw new NnrpProtocolError({
      code: "NNRP_INPUT_PROFILE_UNKNOWN",
      message: `Unknown NNRP input profile '${profile}'.`,
      source: "core",
      retryable: false,
    });
  }
}

function validateCacheKey(key: NnrpCacheKey): void {
  if (!isCacheObjectKind(key.kind)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_KIND_INVALID",
      message: `Unsupported NNRP cache object kind '${key.kind}'.`,
      source: "core",
      retryable: false,
    });
  }

  if (typeof key.key === "string" && key.key.trim().length === 0) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_KEY_EMPTY",
      message: "Cache key strings must not be empty.",
      source: "core",
      retryable: false,
    });
  }

  if (typeof key.key === "number" && (!Number.isSafeInteger(key.key) || key.key < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_KEY_NUMBER_INVALID",
      message: "Numeric cache keys must be non-negative safe integers.",
      source: "core",
      retryable: false,
    });
  }

  if (key.namespaceId !== undefined && (!Number.isSafeInteger(key.namespaceId) || key.namespaceId < 0)) {
    throw new NnrpProtocolError({
      code: "NNRP_CACHE_NAMESPACE_INVALID",
      message: "Cache namespaceId must be a non-negative safe integer.",
      source: "core",
      retryable: false,
    });
  }
}

const U64_MAX = 0xffff_ffff_ffff_ffffn;
const NNRP_CACHE_LEASE_OUTCOMES: ReadonlySet<NnrpCacheLeaseOutcome> = new Set([
  "valid",
  "expired",
  "renewed",
  "released",
  "missing",
]);
const NNRP_CACHE_INVALIDATION_REASONS: ReadonlySet<NnrpCacheInvalidationReason> = new Set([
  "explicit",
  "dependency-invalidated",
  "lease-expired",
  "version-mismatch",
  "schema-mismatch",
]);

function validateCacheObjectId(objectId: CacheObjectId): void {
  if (objectId === null || typeof objectId !== "object") {
    throw runtimeObjectError("NNRP_CACHE_OBJECT_ID_INVALID", "Cache lease objectId must be an object.");
  }
  validateU32Number("objectId.cacheNamespace", objectId.cacheNamespace);
  validateU64BigInt("objectId.cacheKeyHi", objectId.cacheKeyHi);
  validateU64BigInt("objectId.cacheKeyLo", objectId.cacheKeyLo);
  if (!isCacheObjectKind(objectId.objectKind)) {
    throw runtimeObjectError("NNRP_CACHE_OBJECT_KIND_INVALID", "Cache lease object kind is not recognized.");
  }
}

function validateCacheObjectVersion(version: NnrpCacheObjectVersion): void {
  validateCacheObjectId(version.objectId);
  validateU64BigInt("objectVersion.objectVersion", version.objectVersion);
  validateU32Number("objectVersion.schemaId", version.schemaId);
  validateU32Number("objectVersion.schemaVersion", version.schemaVersion);
}

function cacheObjectIdsEqual(left: CacheObjectId, right: CacheObjectId): boolean {
  return left.cacheNamespace === right.cacheNamespace && left.cacheKeyHi === right.cacheKeyHi &&
    left.cacheKeyLo === right.cacheKeyLo && left.objectKind === right.objectKind;
}

function validateU64BigInt(name: string, value: bigint): void {
  if (typeof value !== "bigint" || value < 0n || value > U64_MAX) {
    throw runtimeObjectError("NNRP_CACHE_LEASE_U64_INVALID", `${name} must fit the frozen u64 range.`);
  }
}

function validateU32Number(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw runtimeObjectError("NNRP_CACHE_LEASE_U32_INVALID", `${name} must fit the frozen u32 range.`);
  }
}

function isCacheObjectKind(value: number): value is NnrpCacheObjectKind {
  return Number.isInteger(value) && value >= NnrpCacheObjectKind.CameraBlock &&
    value <= NnrpCacheObjectKind.StructuredEventSchema;
}

function isCacheLeaseOwnerScope(value: number): value is CacheLeaseOwnerScope {
  return value === CacheLeaseOwnerScope.Connection || value === CacheLeaseOwnerScope.Session ||
    value === CacheLeaseOwnerScope.Operation;
}

function isCacheReuseScope(value: number): value is CacheReuseScope {
  return Number.isInteger(value) && value >= CacheReuseScope.Operation && value <= CacheReuseScope.Profile;
}

function validateSchemaDescriptor(descriptor: NnrpSchemaDescriptor): void {
  validateIdentifier("NNRP_SCHEMA_ID_INVALID", "Schema id", descriptor.id);
  validateIdentifier("NNRP_SCHEMA_NAME_INVALID", "Schema name", descriptor.name);
  validateIdentifier("NNRP_SCHEMA_VERSION_INVALID", "Schema version", descriptor.version);

  if (descriptor.flags !== undefined) {
    const allowed = new Set<NnrpSchemaFlag>(["required", "streamable", "lossless", "opaque"]);
    for (const flag of descriptor.flags) {
      if (!allowed.has(flag)) {
        throw new NnrpProtocolError({
          code: "NNRP_SCHEMA_FLAG_INVALID",
          message: `Unsupported schema flag '${flag}'.`,
          source: "core",
          retryable: false,
        });
      }
    }
  }
}

function validateIdentifier(code: string, label: string, value: string): void {
  if (value.trim().length === 0 || value.length > 128) {
    throw new NnrpProtocolError({
      code,
      message: `${label} must be non-empty and at most 128 characters.`,
      source: "core",
      retryable: false,
    });
  }
}

function normalizeBinaryPayload(payload: NnrpBinaryPayload, copyPayload: boolean): Uint8Array {
  const view = payload instanceof Uint8Array
    ? payload
    : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);

  if (!copyPayload) {
    return view;
  }

  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

function validateCapabilityManifestOptions(options: NnrpCapabilityManifestOptions): void {
  const transports = options.transports ?? [];
  const capabilities = options.capabilities ?? [];

  const unknownCapability = (capabilities as readonly string[]).find(
    (capability) => !NNRP_CAPABILITY_TOKENS.has(capability as NnrpCapability),
  );
  if (unknownCapability !== undefined) {
    throw new NnrpCapabilityError({
      code: "NNRP_CAPABILITY_UNKNOWN",
      message: `Capability manifest contains an unknown NNRP/1 capability token: ${unknownCapability}.`,
      source: "core",
      retryable: false,
    });
  }

  if (options.buildMode === "browser-wasm") {
    if (capabilities.includes("server.session") || capabilities.includes("native.loader")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_BROWSER_FORBIDDEN",
        message: "Browser WASM manifests cannot claim server or native loader capabilities.",
        source: "core",
        retryable: false,
      });
    }

    if (transports.some((transport) => transport !== "websocket")) {
      throw new NnrpCapabilityError({
        code: "NNRP_CAPABILITY_BROWSER_TRANSPORT_FORBIDDEN",
        message: "Browser WASM manifests can claim only the websocket transport.",
        source: "core",
        retryable: false,
      });
    }
  }
}

type RuntimeIntegerKind = "u64" | "u32" | "u16" | "u8" | "i16";

interface RuntimeIntegerField {
  readonly name: string;
  readonly offset: number;
  readonly kind: RuntimeIntegerKind;
  readonly runtimeRole?: boolean;
  readonly errorScope?: boolean;
}

interface RuntimeReservedField {
  readonly offset: number;
  readonly kind: RuntimeIntegerKind;
}

interface RuntimeControlLayout {
  readonly name: string;
  readonly length: number;
  readonly fields: readonly RuntimeIntegerField[];
  readonly flagMask?: number;
  readonly tailField?: "bodyBytes" | "diagnosticBytes";
  readonly percentField?: "percentX100";
  readonly reserved?: readonly RuntimeReservedField[];
}

type RuntimeObjectEnumField =
  | "objectKind"
  | "runtimeRole"
  | "memoryLocationHint"
  | "ownershipHint"
  | "objectReleaseReason"
  | "cacheReuseScope"
  | "cacheMissReason";

interface RuntimeObjectField extends RuntimeIntegerField {
  readonly enumField?: RuntimeObjectEnumField;
}

interface RuntimeObjectLayout {
  readonly name: string;
  readonly length: number;
  readonly fields: readonly RuntimeObjectField[];
  readonly flagMask?: number;
  readonly tailFields?: readonly ("metadataBytes" | "diagnosticBytes" | "deltaBytes")[];
  readonly reserved?: readonly RuntimeReservedField[];
}

const OBJECT_DESCRIPTOR_LAYOUT: RuntimeObjectLayout = {
  name: "ObjectDescriptorMetadata",
  length: 48,
  fields: [
    { name: "objectId", offset: 0, kind: "u64" },
    { name: "objectKind", offset: 8, kind: "u16", enumField: "objectKind" },
    { name: "producerRole", offset: 10, kind: "u8", enumField: "runtimeRole" },
    { name: "consumerRole", offset: 11, kind: "u8", enumField: "runtimeRole" },
    { name: "sessionId", offset: 12, kind: "u32" },
    { name: "byteSize", offset: 16, kind: "u64" },
    { name: "computeCostUnits", offset: 24, kind: "u32" },
    { name: "memoryLocationHint", offset: 28, kind: "u16", enumField: "memoryLocationHint" },
    { name: "ownershipHint", offset: 30, kind: "u16", enumField: "ownershipHint" },
    { name: "lifetimeHintMs", offset: 32, kind: "u32" },
    { name: "metadataBytes", offset: 36, kind: "u32" },
  ],
  tailFields: ["metadataBytes"],
  reserved: [{ offset: 40, kind: "u64" }],
};

const OBJECT_REFERENCE_LAYOUT: RuntimeObjectLayout = {
  name: "ObjectReferenceMetadata",
  length: 48,
  fields: [
    { name: "objectId", offset: 0, kind: "u64" },
    { name: "operationId", offset: 8, kind: "u64" },
    { name: "objectVersion", offset: 16, kind: "u64" },
    { name: "offset", offset: 24, kind: "u64" },
    { name: "length", offset: 32, kind: "u64" },
    { name: "flags", offset: 40, kind: "u32" },
    { name: "metadataBytes", offset: 44, kind: "u32" },
  ],
  flagMask: 0x07,
  tailFields: ["metadataBytes"],
};

const OBJECT_RELEASE_LAYOUT: RuntimeObjectLayout = {
  name: "ObjectReleaseMetadata",
  length: 32,
  fields: [
    { name: "objectId", offset: 0, kind: "u64" },
    { name: "operationId", offset: 8, kind: "u64" },
    { name: "releaseReason", offset: 16, kind: "u16", enumField: "objectReleaseReason" },
    { name: "sourceRole", offset: 18, kind: "u8", enumField: "runtimeRole" },
    { name: "flags", offset: 19, kind: "u8" },
    { name: "diagnosticBytes", offset: 20, kind: "u32" },
  ],
  flagMask: 0x03,
  tailFields: ["diagnosticBytes"],
  reserved: [{ offset: 24, kind: "u64" }],
};

const OBJECT_DELTA_LAYOUT: RuntimeObjectLayout = {
  name: "ObjectDeltaMetadata",
  length: 40,
  fields: [
    { name: "objectId", offset: 0, kind: "u64" },
    { name: "deltaSequence", offset: 8, kind: "u64" },
    { name: "regionOffset", offset: 16, kind: "u64" },
    { name: "regionBytes", offset: 24, kind: "u32" },
    { name: "deltaBytes", offset: 28, kind: "u32" },
    { name: "flags", offset: 32, kind: "u32" },
    { name: "metadataBytes", offset: 36, kind: "u32" },
  ],
  flagMask: 0x07,
  tailFields: ["metadataBytes", "deltaBytes"],
};

const CACHE_REFERENCE_LAYOUT: RuntimeObjectLayout = {
  name: "CacheReferenceMetadata",
  length: 56,
  fields: [
    { name: "cacheNamespace", offset: 0, kind: "u32" },
    { name: "profileId", offset: 4, kind: "u16" },
    { name: "reuseScope", offset: 6, kind: "u16", enumField: "cacheReuseScope" },
    { name: "cacheKeyHi", offset: 8, kind: "u64" },
    { name: "cacheKeyLo", offset: 16, kind: "u64" },
    { name: "leaseId", offset: 24, kind: "u64" },
    { name: "producerTraceId", offset: 32, kind: "u64" },
    { name: "expirationHintMs", offset: 40, kind: "u32" },
    { name: "metadataBytes", offset: 44, kind: "u32" },
    { name: "flags", offset: 48, kind: "u32" },
  ],
  flagMask: 0x03,
  tailFields: ["metadataBytes"],
  reserved: [{ offset: 52, kind: "u32" }],
};

const CACHE_MISS_LAYOUT: RuntimeObjectLayout = {
  name: "CacheMissMetadata",
  length: 32,
  fields: [
    { name: "cacheNamespace", offset: 0, kind: "u32" },
    { name: "profileId", offset: 4, kind: "u16" },
    { name: "missReason", offset: 6, kind: "u16", enumField: "cacheMissReason" },
    { name: "cacheKeyHi", offset: 8, kind: "u64" },
    { name: "cacheKeyLo", offset: 16, kind: "u64" },
    { name: "diagnosticBytes", offset: 24, kind: "u32" },
  ],
  tailFields: ["diagnosticBytes"],
  reserved: [{ offset: 28, kind: "u32" }],
};

const CONTROL_REQUEST_LAYOUT: RuntimeControlLayout = {
  name: "ControlRequestMetadata",
  length: 32,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "controlSequence", offset: 8, kind: "u64" },
    { name: "reasonCode", offset: 16, kind: "u16" },
    { name: "sourceRole", offset: 18, kind: "u8", runtimeRole: true },
    { name: "flags", offset: 19, kind: "u8" },
    { name: "diagnosticBytes", offset: 20, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "diagnosticBytes",
  reserved: [{ offset: 24, kind: "u64" }],
};

const SCHEDULING_LAYOUT: RuntimeControlLayout = {
  name: "SchedulingMetadata",
  length: 32,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "controlSequence", offset: 8, kind: "u64" },
    { name: "priorityClass", offset: 16, kind: "u16" },
    { name: "priorityDelta", offset: 18, kind: "i16" },
    { name: "deadlineUnixMs", offset: 20, kind: "u64" },
    { name: "flags", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
};

const SUPERSEDE_LAYOUT: RuntimeControlLayout = {
  name: "SupersedeMetadata",
  length: 32,
  fields: [
    { name: "oldOperationId", offset: 0, kind: "u64" },
    { name: "newOperationId", offset: 8, kind: "u64" },
    { name: "controlSequence", offset: 16, kind: "u64" },
    { name: "dropReasonCode", offset: 24, kind: "u16" },
    { name: "flags", offset: 26, kind: "u16" },
    { name: "diagnosticBytes", offset: 28, kind: "u32" },
  ],
  flagMask: 0x01,
  tailField: "diagnosticBytes",
};

const BUDGET_LAYOUT: RuntimeControlLayout = {
  name: "BudgetMetadata",
  length: 40,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "computeBudgetUnits", offset: 8, kind: "u64" },
    { name: "memoryBudgetBytes", offset: 16, kind: "u64" },
    { name: "bandwidthBudgetBytes", offset: 24, kind: "u64" },
    { name: "tokenBudget", offset: 32, kind: "u32" },
    { name: "flags", offset: 36, kind: "u32" },
  ],
  flagMask: 0x03,
};

const PROGRESS_LAYOUT: RuntimeControlLayout = {
  name: "ProgressMetadata",
  length: 32,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "progressSequence", offset: 8, kind: "u64" },
    { name: "stageCode", offset: 16, kind: "u16" },
    { name: "percentX100", offset: 18, kind: "u16" },
    { name: "objectId", offset: 20, kind: "u64" },
    { name: "bodyBytes", offset: 28, kind: "u32" },
  ],
  tailField: "bodyBytes",
  percentField: "percentX100",
};

const PARTIAL_RESULT_LAYOUT: RuntimeControlLayout = {
  name: "PartialResultMetadata",
  length: 40,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "resultSequence", offset: 8, kind: "u64" },
    { name: "objectId", offset: 16, kind: "u64" },
    { name: "deltaSequence", offset: 24, kind: "u64" },
    { name: "bodyBytes", offset: 32, kind: "u32" },
    { name: "flags", offset: 36, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "bodyBytes",
};

const PRESSURE_LAYOUT: RuntimeControlLayout = {
  name: "PressureMetadata",
  length: 32,
  fields: [
    { name: "scopeId", offset: 0, kind: "u64" },
    { name: "creditWindow", offset: 8, kind: "u64" },
    { name: "pressureLevel", offset: 16, kind: "u16" },
    { name: "pressureReason", offset: 18, kind: "u16" },
    { name: "retryAfterMs", offset: 20, kind: "u32" },
    { name: "flags", offset: 24, kind: "u32" },
  ],
  flagMask: 0x03,
  reserved: [{ offset: 28, kind: "u32" }],
};

const CAPABILITY_LAYOUT: RuntimeControlLayout = {
  name: "CapabilityMetadata",
  length: 32,
  fields: [
    { name: "profileId", offset: 0, kind: "u16" },
    { name: "capabilityCount", offset: 2, kind: "u16" },
    { name: "costModelId", offset: 4, kind: "u16" },
    { name: "preferenceRank", offset: 6, kind: "u16" },
    { name: "limitBytes", offset: 8, kind: "u64" },
    { name: "limitUnits", offset: 16, kind: "u64" },
    { name: "bodyBytes", offset: 24, kind: "u32" },
    { name: "flags", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "bodyBytes",
};

const ROUTE_HINT_LAYOUT: RuntimeControlLayout = {
  name: "RouteHintMetadata",
  length: 32,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "routeId", offset: 8, kind: "u32" },
    { name: "executorClass", offset: 12, kind: "u16" },
    { name: "affinityClass", offset: 14, kind: "u16" },
    { name: "deadlineUnixMs", offset: 16, kind: "u64" },
    { name: "bodyBytes", offset: 24, kind: "u32" },
    { name: "flags", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "bodyBytes",
};

const TRACE_CONTEXT_LAYOUT: RuntimeControlLayout = {
  name: "TraceContextMetadata",
  length: 32,
  fields: [
    { name: "traceId", offset: 0, kind: "u64" },
    { name: "spanId", offset: 8, kind: "u64" },
    { name: "parentSpanId", offset: 16, kind: "u64" },
    { name: "stageCode", offset: 24, kind: "u16" },
    { name: "flags", offset: 26, kind: "u16" },
    { name: "bodyBytes", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "bodyBytes",
};

const RESULT_DROP_REASON_LAYOUT: RuntimeControlLayout = {
  name: "ResultDropReasonMetadata",
  length: 32,
  fields: [
    { name: "operationId", offset: 0, kind: "u64" },
    { name: "resultSequence", offset: 8, kind: "u64" },
    { name: "dropReasonCode", offset: 16, kind: "u16" },
    { name: "sourceRole", offset: 18, kind: "u8", runtimeRole: true },
    { name: "flags", offset: 19, kind: "u8" },
    { name: "diagnosticBytes", offset: 20, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "diagnosticBytes",
  reserved: [{ offset: 24, kind: "u64" }],
};

const RECOVERABLE_ERROR_LAYOUT: RuntimeControlLayout = {
  name: "RecoverableErrorMetadata",
  length: 32,
  fields: [
    { name: "errorCode", offset: 0, kind: "u32" },
    { name: "errorScope", offset: 4, kind: "u32", errorScope: true },
    { name: "recoveryAction", offset: 8, kind: "u16" },
    { name: "sourceRole", offset: 10, kind: "u8", runtimeRole: true },
    { name: "flags", offset: 11, kind: "u8" },
    { name: "retryAfterMs", offset: 12, kind: "u32" },
    { name: "relatedSessionId", offset: 16, kind: "u32" },
    { name: "relatedFrameId", offset: 20, kind: "u32" },
    { name: "relatedViewId", offset: 24, kind: "u32" },
    { name: "diagnosticBytes", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "diagnosticBytes",
};

const RETRY_AFTER_LAYOUT: RuntimeControlLayout = {
  name: "RetryAfterMetadata",
  length: 32,
  fields: [
    { name: "scopeId", offset: 0, kind: "u64" },
    { name: "controlSequence", offset: 8, kind: "u64" },
    { name: "retryAfterMs", offset: 16, kind: "u32" },
    { name: "jitterMs", offset: 20, kind: "u32" },
    { name: "reasonCode", offset: 24, kind: "u16" },
    { name: "sourceRole", offset: 26, kind: "u8", runtimeRole: true },
    { name: "flags", offset: 27, kind: "u8" },
    { name: "diagnosticBytes", offset: 28, kind: "u32" },
  ],
  flagMask: 0x03,
  tailField: "diagnosticBytes",
};

function getRuntimeControlLayout(messageType: NnrpMessageType): RuntimeControlLayout {
  switch (messageType) {
    case NnrpMessageType.Cancel:
    case NnrpMessageType.Abort:
      return CONTROL_REQUEST_LAYOUT;
    case NnrpMessageType.PriorityUpdate:
    case NnrpMessageType.Deadline:
    case NnrpMessageType.ExpireAt:
      return SCHEDULING_LAYOUT;
    case NnrpMessageType.Supersede:
      return SUPERSEDE_LAYOUT;
    case NnrpMessageType.BudgetUpdate:
      return BUDGET_LAYOUT;
    case NnrpMessageType.Progress:
      return PROGRESS_LAYOUT;
    case NnrpMessageType.PartialResult:
      return PARTIAL_RESULT_LAYOUT;
    case NnrpMessageType.Backpressure:
    case NnrpMessageType.CreditUpdate:
      return PRESSURE_LAYOUT;
    case NnrpMessageType.CapabilityNegotiation:
    case NnrpMessageType.DegradeProfile:
      return CAPABILITY_LAYOUT;
    case NnrpMessageType.RouteHint:
    case NnrpMessageType.ExecutionHint:
      return ROUTE_HINT_LAYOUT;
    case NnrpMessageType.TraceContext:
      return TRACE_CONTEXT_LAYOUT;
    case NnrpMessageType.ResultDropReason:
      return RESULT_DROP_REASON_LAYOUT;
    case NnrpMessageType.ErrorRecoverable:
      return RECOVERABLE_ERROR_LAYOUT;
    case NnrpMessageType.RetryAfter:
      return RETRY_AFTER_LAYOUT;
    default:
      throw runtimeControlError(
        "NNRP_CONTROL_MESSAGE_UNSUPPORTED",
        `Message type ${messageType} does not use Preview4 runtime control metadata.`,
      );
  }
}

function getRuntimeObjectLayout(messageType: NnrpMessageType): RuntimeObjectLayout {
  switch (messageType) {
    case NnrpMessageType.ObjectDeclare:
      return OBJECT_DESCRIPTOR_LAYOUT;
    case NnrpMessageType.ObjectRef:
      return OBJECT_REFERENCE_LAYOUT;
    case NnrpMessageType.ObjectRelease:
      return OBJECT_RELEASE_LAYOUT;
    case NnrpMessageType.ObjectPatch:
    case NnrpMessageType.ObjectDelta:
      return OBJECT_DELTA_LAYOUT;
    case NnrpMessageType.CacheReference:
      return CACHE_REFERENCE_LAYOUT;
    case NnrpMessageType.CacheMiss:
      return CACHE_MISS_LAYOUT;
    default:
      throw runtimeObjectError(
        "NNRP_OBJECT_MESSAGE_UNSUPPORTED",
        `Message type ${messageType} does not use Preview4 runtime object metadata.`,
      );
  }
}

function validateRuntimeObjectMetadata(layout: RuntimeObjectLayout, metadata: RuntimeObjectMetadata): void {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw runtimeObjectError("NNRP_OBJECT_METADATA_MISMATCH", `${layout.name} must be a metadata object.`);
  }

  const values = metadata as unknown as Record<string, unknown>;
  const actualFields = Object.keys(values).sort();
  const expectedFields = layout.fields.map((field) => field.name).sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    throw runtimeObjectError(
      "NNRP_OBJECT_METADATA_MISMATCH",
      `Message requires ${layout.name} fields: ${expectedFields.join(", ")}.`,
    );
  }

  for (const field of layout.fields) {
    validateRuntimeObjectInteger(field, values[field.name]);
    if (field.enumField !== undefined) {
      validateRuntimeObjectEnum(field.enumField, values[field.name] as number);
    }
  }

  if (layout.flagMask !== undefined) {
    const flags = values.flags as number;
    if ((flags & ~layout.flagMask) !== 0) {
      throw runtimeObjectError(
        "NNRP_OBJECT_FLAGS_INVALID",
        `${layout.name}.flags contains reserved bits outside 0x${layout.flagMask.toString(16)}.`,
      );
    }
  }
}

function validateRuntimeObjectTail(
  layout: RuntimeObjectLayout,
  metadata: RuntimeObjectMetadata,
  actualBytes: number,
): void {
  const values = metadata as unknown as Record<string, number>;
  const declaredBytes = (layout.tailFields ?? []).reduce((total, field) => total + (values[field] as number), 0);
  if (declaredBytes !== actualBytes) {
    throw runtimeObjectError(
      "NNRP_OBJECT_TAIL_LENGTH_INVALID",
      `${layout.name} declares ${declaredBytes} tail bytes but received ${actualBytes}.`,
    );
  }
}

function validateRuntimeObjectInteger(field: RuntimeIntegerField, value: unknown): void {
  if (field.kind === "u64") {
    if (typeof value !== "bigint" || value < 0n || value > 0xffff_ffff_ffff_ffffn) {
      throw runtimeObjectError(
        "NNRP_OBJECT_INTEGER_INVALID",
        `${field.name} must be a bigint in the u64 wire range.`,
      );
    }
    return;
  }

  const maximum = field.kind === "u32" ? 0xffff_ffff : field.kind === "u16" ? 0xffff : 0xff;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) {
    throw runtimeObjectError(
      "NNRP_OBJECT_INTEGER_INVALID",
      `${field.name} must be an integer in the ${field.kind} wire range.`,
    );
  }
}

function validateRuntimeObjectEnum(field: RuntimeObjectEnumField, value: number): void {
  const [lastStandard, privateStart, privateEnd] = field === "runtimeRole"
    ? [RuntimeRole.ConformanceRunner, 0x80, 0xff]
    : [
      field === "objectKind"
        ? RuntimeObjectKind.CacheManifest
        : field === "memoryLocationHint"
        ? MemoryLocationHint.ObjectStore
        : field === "ownershipHint"
        ? OwnershipHint.ReleaseOnDrop
        : field === "objectReleaseReason"
        ? ObjectReleaseReason.ConformanceInjection
        : field === "cacheReuseScope"
        ? CacheReuseScope.Profile
        : CacheMissReason.PermissionDenied,
      0x8000,
      0xffff,
    ];
  if ((value >= 0 && value <= lastStandard) || (value >= privateStart && value <= privateEnd)) {
    return;
  }
  throw runtimeObjectError(
    "NNRP_OBJECT_ENUM_INVALID",
    `${field} must use a frozen standard value or its private extension range.`,
  );
}

function validateCacheInvalidateMetadata(metadata: CacheInvalidateMetadata): void {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_METADATA_MISMATCH",
      "CacheInvalidateMetadata must be a metadata object.",
    );
  }
  const values = metadata as unknown as Record<string, unknown>;
  const expectedFields = ["cacheKeyHi", "cacheKeyLo", "cacheNamespace", "invalidateScope", "reasonCode"];
  const actualFields = Object.keys(values).sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_METADATA_MISMATCH",
      `CacheInvalidateMetadata requires fields: ${expectedFields.join(", ")}.`,
    );
  }
  validateRuntimeObjectInteger({ name: "invalidateScope", offset: 0, kind: "u32" }, values.invalidateScope);
  validateRuntimeObjectInteger({ name: "cacheNamespace", offset: 4, kind: "u32" }, values.cacheNamespace);
  validateRuntimeObjectInteger({ name: "cacheKeyHi", offset: 8, kind: "u64" }, values.cacheKeyHi);
  validateRuntimeObjectInteger({ name: "cacheKeyLo", offset: 16, kind: "u64" }, values.cacheKeyLo);
  validateRuntimeObjectInteger({ name: "reasonCode", offset: 24, kind: "u32" }, values.reasonCode);
  if ((values.invalidateScope as number) > 3) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_SCOPE_INVALID",
      "invalidateScope must be WholeSession, Namespace, ObjectKind, or ObjectKey.",
    );
  }

  const scope = values.invalidateScope as number;
  const cacheNamespace = values.cacheNamespace as number;
  const cacheKeyHi = values.cacheKeyHi as bigint;
  const cacheKeyLo = values.cacheKeyLo as bigint;
  const identityMatchesScope = scope === 0
    ? cacheNamespace === 0 && cacheKeyHi === 0n && cacheKeyLo === 0n
    : scope === 1
    ? cacheKeyHi === 0n && cacheKeyLo === 0n
    : scope === 2
    ? cacheKeyHi <= 0xffff_ffffn && cacheKeyLo === 0n
    : true;
  if (!identityMatchesScope) {
    throw runtimeObjectError(
      "NNRP_CACHE_INVALIDATE_IDENTITY_INVALID",
      "Cache invalidate identity fields must match invalidateScope.",
    );
  }
}

function validateCachePutMetadata(metadata: CachePutMetadata): void {
  assertUnsigned("cacheNamespace", metadata.cacheNamespace, 0xffff_ffff);
  assertUnsignedBigInt("cacheKeyHi", metadata.cacheKeyHi, 0xffff_ffff_ffff_ffffn);
  assertUnsignedBigInt("cacheKeyLo", metadata.cacheKeyLo, 0xffff_ffff_ffff_ffffn);
  if (!isCacheObjectKind(metadata.objectKind)) {
    throw runtimeObjectError("NNRP_CACHE_OBJECT_KIND_INVALID", "CACHE_PUT objectKind is not registered.");
  }
  assertUnsigned("ttlMs", metadata.ttlMs, 0xffff_ffff);
  assertUnsigned("objectBytes", metadata.objectBytes, 0xffff_ffff);
  assertUnsigned("codecBitmap", metadata.codecBitmap, 0xffff_ffff);
  if (!Number.isInteger(metadata.flags) || metadata.flags < 0 || metadata.flags > 0x03) {
    throw runtimeObjectError("NNRP_CACHE_PUT_FLAGS_INVALID", "CACHE_PUT flags contain reserved bits.");
  }
}

function validateCacheAckMetadata(metadata: CacheAckMetadata): void {
  assertUnsigned("cacheNamespace", metadata.cacheNamespace, 0xffff_ffff);
  assertUnsignedBigInt("cacheKeyHi", metadata.cacheKeyHi, 0xffff_ffff_ffff_ffffn);
  assertUnsignedBigInt("cacheKeyLo", metadata.cacheKeyLo, 0xffff_ffff_ffff_ffffn);
  assertEnumRange("status", metadata.status, CacheAckStatus.Replaced);
  assertUnsigned("acceptedTtlMs", metadata.acceptedTtlMs, 0xffff_ffff);
  assertUnsigned("maxObjectBytes", metadata.maxObjectBytes, 0xffff_ffff);
  assertUnsigned("detailCode", metadata.detailCode, 0xffff_ffff);
}

function validateTransportProbeMetadata(metadata: TransportProbeMetadata): void {
  assertUnsigned("probeId", metadata.probeId, 0xffff_ffff);
  assertUnsigned("probePayloadBytes", metadata.probePayloadBytes, 0xffff_ffff);
  assertUnsignedBigInt("clientSendTsUs", metadata.clientSendTsUs, 0xffff_ffff_ffff_ffffn);
}

function validateTransportProbeAckMetadata(metadata: TransportProbeAckMetadata): void {
  assertUnsigned("probeId", metadata.probeId, 0xffff_ffff);
  assertUnsignedBigInt("serverRecvTsUs", metadata.serverRecvTsUs, 0xffff_ffff_ffff_ffffn);
}

function validateRuntimeControlMetadata(
  layout: RuntimeControlLayout,
  metadata: RuntimeControlMetadata,
): void {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw runtimeControlError(
      "NNRP_CONTROL_METADATA_MISMATCH",
      `${layout.name} must be a metadata object.`,
    );
  }

  const values = metadata as unknown as Record<string, unknown>;
  const actualFields = Object.keys(values).sort();
  const expectedFields = layout.fields.map((field) => field.name).sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    throw runtimeControlError(
      "NNRP_CONTROL_METADATA_MISMATCH",
      `Message requires ${layout.name} fields: ${expectedFields.join(", ")}.`,
    );
  }

  for (const field of layout.fields) {
    validateRuntimeInteger(field, values[field.name]);
    if (field.runtimeRole) {
      validateRuntimeRole(values[field.name] as number);
    }
    if (field.errorScope) {
      validateErrorScope(values[field.name] as number);
    }
  }

  if (layout.flagMask !== undefined) {
    const flags = values.flags as number;
    if ((flags & ~layout.flagMask) !== 0) {
      throw runtimeControlError(
        "NNRP_CONTROL_FLAGS_INVALID",
        `${layout.name}.flags contains reserved bits outside 0x${layout.flagMask.toString(16)}.`,
      );
    }
  }

  if (
    layout.percentField !== undefined &&
    (values[layout.percentField] as number) > 10_000 &&
    (values[layout.percentField] as number) !== 0xffff
  ) {
    throw runtimeControlError(
      "NNRP_CONTROL_PROGRESS_INVALID",
      `${layout.name}.percentX100 must be 0..10000 or the 0xffff unknown-value sentinel.`,
    );
  }
}

function validateRuntimeControlTail(
  layout: RuntimeControlLayout,
  metadata: RuntimeControlMetadata,
  actualBytes: number,
): void {
  const declaredBytes = layout.tailField === undefined
    ? 0
    : (metadata as unknown as Record<string, number>)[layout.tailField];
  if (declaredBytes !== actualBytes) {
    throw runtimeControlError(
      "NNRP_CONTROL_TAIL_LENGTH_INVALID",
      `${layout.name} declares ${declaredBytes} tail bytes but received ${actualBytes}.`,
    );
  }
}

function validateRuntimeInteger(field: RuntimeIntegerField, value: unknown): void {
  if (field.kind === "u64") {
    if (typeof value !== "bigint" || value < 0n || value > 0xffff_ffff_ffff_ffffn) {
      throw runtimeControlError(
        "NNRP_CONTROL_INTEGER_INVALID",
        `${field.name} must be a bigint in the u64 wire range.`,
      );
    }
    return;
  }

  const [minimum, maximum] = field.kind === "i16"
    ? [-0x8000, 0x7fff]
    : [0, field.kind === "u32" ? 0xffff_ffff : field.kind === "u16" ? 0xffff : 0xff];
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw runtimeControlError(
      "NNRP_CONTROL_INTEGER_INVALID",
      `${field.name} must be an integer in the ${field.kind} wire range.`,
    );
  }
}

function validateRuntimeRole(value: number): void {
  if (
    (value >= RuntimeRole.Unspecified && value <= RuntimeRole.ConformanceRunner) || (value >= 0x80 && value <= 0xff)
  ) {
    return;
  }
  throw runtimeControlError(
    "NNRP_CONTROL_ROLE_INVALID",
    "Runtime role must use a frozen standard value or the private extension range 0x80-0xff.",
  );
}

function validateErrorScope(value: number): void {
  if (value >= ErrorScope.Connection && value <= ErrorScope.Frame) {
    return;
  }
  throw runtimeControlError(
    "NNRP_CONTROL_ERROR_SCOPE_INVALID",
    "Error scope must be Connection, Session, or Frame.",
  );
}

function writeRuntimeInteger(view: DataView, field: RuntimeIntegerField, value: unknown): void {
  switch (field.kind) {
    case "u64":
      view.setBigUint64(field.offset, value as bigint, true);
      break;
    case "u32":
      view.setUint32(field.offset, value as number, true);
      break;
    case "u16":
      view.setUint16(field.offset, value as number, true);
      break;
    case "u8":
      view.setUint8(field.offset, value as number);
      break;
    case "i16":
      view.setInt16(field.offset, value as number, true);
      break;
  }
}

function readRuntimeInteger(
  view: DataView,
  field: RuntimeIntegerField | RuntimeReservedField,
): bigint | number {
  switch (field.kind) {
    case "u64":
      return view.getBigUint64(field.offset, true);
    case "u32":
      return view.getUint32(field.offset, true);
    case "u16":
      return view.getUint16(field.offset, true);
    case "u8":
      return view.getUint8(field.offset);
    case "i16":
      return view.getInt16(field.offset, true);
  }
}

function runtimeControlError(code: string, message: string): NnrpProtocolError {
  return new NnrpProtocolError({
    code,
    message,
    source: "protocol",
    retryable: false,
  });
}

function runtimeObjectError(code: string, message: string): NnrpProtocolError {
  return new NnrpProtocolError({
    code,
    message,
    source: "protocol",
    retryable: false,
  });
}
