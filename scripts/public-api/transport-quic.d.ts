import { type NnrpDiagnostic, type NnrpTransportCandidate } from "@nnrp/core";
export interface NnrpQuicTransportProviderOptions {
    readonly available?: boolean;
    readonly score?: number;
    readonly endpointScheme?: "quic";
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpQuicTransportProvider {
    readonly kind: "quic";
    readonly endpointScheme: "quic";
    probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
}
export declare function createQuicTransportProvider(options?: NnrpQuicTransportProviderOptions): NnrpQuicTransportProvider;
//# sourceMappingURL=index.d.ts.map