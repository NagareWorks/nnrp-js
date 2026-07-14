import { type NnrpDiagnostic, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportProvider, type NnrpTransportProviderCost, type NnrpTransportServer } from "@nnrp/core";
export interface NnrpQuicNativeBinding {
    connect?(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
    listen?(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}
export interface NnrpQuicTransportProviderOptions {
    readonly available?: boolean;
    readonly cost?: NnrpTransportProviderCost;
    readonly preferenceRank?: number;
    readonly maxFrameBytes?: bigint;
    readonly diagnostic?: NnrpDiagnostic;
    readonly binding?: NnrpQuicNativeBinding;
}
export interface NnrpQuicTransportProvider extends NnrpTransportProvider {
    readonly kind: "quic";
    readonly endpointSchemes: readonly ["quic"];
    connect(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
    listen(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}
export declare function createQuicTransportProvider(options?: NnrpQuicTransportProviderOptions): NnrpQuicTransportProvider;
//# sourceMappingURL=index.d.ts.map