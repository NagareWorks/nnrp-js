import { type NnrpDiagnostic, type NnrpNativeTransportBinding, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportProbeMetrics, type NnrpTransportProbeOptions, type NnrpTransportProvider, type NnrpTransportProviderCost, type NnrpTransportServer } from "@nnrp/core";
export interface NnrpTcpTransportProviderOptions {
    readonly available?: boolean;
    readonly cost?: NnrpTransportProviderCost;
    readonly preferenceRank?: number;
    readonly maxFrameBytes?: bigint;
    readonly diagnostic?: NnrpDiagnostic;
    readonly binding?: NnrpNativeTransportBinding;
}
export interface NnrpTcpTransportProvider extends NnrpTransportProvider {
    readonly kind: "tcp";
    readonly endpointSchemes: readonly ["tcp"];
    probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
    connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
    listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}
export declare function createTcpTransportProvider(options?: NnrpTcpTransportProviderOptions): NnrpTcpTransportProvider;
//# sourceMappingURL=index.d.ts.map