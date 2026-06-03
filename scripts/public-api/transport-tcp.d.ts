import { type NnrpDiagnostic, type NnrpTransportCandidate } from "@nnrp/core";
export interface NnrpTcpTransportProviderOptions {
    readonly available?: boolean;
    readonly score?: number;
    readonly endpointScheme?: "tcp";
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpTcpTransportProvider {
    readonly kind: "tcp";
    readonly endpointScheme: "tcp";
    probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
}
export declare function createTcpTransportProvider(options?: NnrpTcpTransportProviderOptions): NnrpTcpTransportProvider;
//# sourceMappingURL=index.d.ts.map