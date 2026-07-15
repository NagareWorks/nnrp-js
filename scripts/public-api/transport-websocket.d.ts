import { type NnrpDiagnostic, type NnrpNativeTransportBinding, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportProbeMetrics, type NnrpTransportProbeOptions, type NnrpTransportProvider, type NnrpTransportProviderCost, type NnrpTransportServer } from "@nnrp/core";
export interface NnrpWebSocketTransportProviderOptions {
    readonly available?: boolean;
    readonly cost?: NnrpTransportProviderCost;
    readonly preferenceRank?: number;
    readonly maxFrameBytes?: bigint;
    readonly diagnostic?: NnrpDiagnostic;
    readonly binding?: NnrpNativeTransportBinding;
    readonly WebSocket?: typeof WebSocket;
}
export interface NnrpWebSocketTransportProvider extends NnrpTransportProvider {
    readonly kind: "websocket";
    readonly endpointSchemes: readonly ["ws", "wss"];
    probe(options: NnrpTransportProbeOptions): Promise<NnrpTransportProbeMetrics>;
    connect(options: NnrpTransportEndpoint): Promise<NnrpTransportConnection>;
    listen(options: NnrpTransportEndpoint): Promise<NnrpTransportServer>;
}
export declare function createWebSocketTransportProvider(options?: NnrpWebSocketTransportProviderOptions): NnrpWebSocketTransportProvider;
//# sourceMappingURL=index.d.ts.map