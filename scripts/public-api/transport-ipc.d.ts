import { type NnrpDiagnostic, type NnrpNativeTransportBinding, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportProbeMetrics, type NnrpTransportProbeOptions, type NnrpTransportProvider, type NnrpTransportProviderCost, type NnrpTransportServer } from "@nnrp/core";
export interface NnrpIpcTransportProviderOptions {
    readonly available?: boolean;
    readonly cost?: NnrpTransportProviderCost;
    readonly preferenceRank?: number;
    readonly maxFrameBytes?: bigint;
    readonly diagnostic?: NnrpDiagnostic;
    readonly binding?: NnrpNativeTransportBinding;
    readonly platform?: "unix" | "windows";
}
export interface NnrpIpcTransportProvider extends NnrpTransportProvider {
    readonly kind: "ipc";
    readonly endpointSchemes: readonly ["unix", "npipe"];
    probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
    connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
    listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}
export declare function createIpcTransportProvider(options?: NnrpIpcTransportProviderOptions): NnrpIpcTransportProvider;
//# sourceMappingURL=index.d.ts.map