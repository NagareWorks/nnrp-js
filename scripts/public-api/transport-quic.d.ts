import { type NnrpDiagnostic, type NnrpNativeTransportBinding, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportProbeMetrics, type NnrpTransportProbeOptions, type NnrpTransportProvider, type NnrpTransportProviderCost, type NnrpTransportServer } from "@nnrp/core";
export type NnrpQuicNativeBinding = NnrpNativeTransportBinding;
export interface NnrpQuicTransportProviderOptions {
    readonly available?: boolean;
    readonly cost?: NnrpTransportProviderCost;
    readonly preferenceRank?: number;
    readonly maxFrameBytes?: bigint;
    readonly diagnostic?: NnrpDiagnostic;
    readonly binding?: NnrpNativeTransportBinding;
}
export interface NnrpQuicTransportProvider extends NnrpTransportProvider {
    readonly kind: "quic";
    readonly endpointSchemes: readonly ["quic"];
    probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
    connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
    listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}
export declare function createQuicTransportProvider(options?: NnrpQuicTransportProviderOptions): NnrpQuicTransportProvider;
//# sourceMappingURL=index.d.ts.map