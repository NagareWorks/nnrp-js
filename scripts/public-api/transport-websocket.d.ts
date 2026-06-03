import { type NnrpDiagnostic, type NnrpTransportCandidate } from "@nnrp/core";
export interface NnrpWebSocketTransportProviderOptions {
    readonly available?: boolean;
    readonly score?: number;
    readonly endpointScheme?: "ws" | "wss";
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpWebSocketTransportProvider {
    readonly kind: "websocket";
    readonly endpointScheme: "ws" | "wss";
    probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
}
export declare function createWebSocketTransportProvider(options?: NnrpWebSocketTransportProviderOptions): NnrpWebSocketTransportProvider;
//# sourceMappingURL=index.d.ts.map