import { type NnrpDiagnostic, type NnrpTransportCandidate, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportProvider, type NnrpTransportServer } from "@nnrp/core";
export interface NnrpQuicNativeBinding {
    connect?(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
    listen?(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}
export interface NnrpQuicTransportProviderOptions {
    readonly available?: boolean;
    readonly score?: number;
    readonly diagnostic?: NnrpDiagnostic;
    readonly native?: NnrpQuicNativeBinding;
}
export interface NnrpQuicTransportProvider extends NnrpTransportProvider {
    readonly kind: "quic";
    readonly endpointSchemes: readonly ["quic"];
    probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
    connect(options: NnrpTransportEndpoint): NnrpTransportConnection | Promise<NnrpTransportConnection>;
    listen(options: NnrpTransportEndpoint): NnrpTransportServer | Promise<NnrpTransportServer>;
}
export declare function createQuicTransportProvider(options?: NnrpQuicTransportProviderOptions): NnrpQuicTransportProvider;
//# sourceMappingURL=index.d.ts.map