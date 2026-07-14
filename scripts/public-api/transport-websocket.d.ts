import { type NnrpDiagnostic, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportProvider, type NnrpTransportProviderCost } from "@nnrp/core";
export interface NnrpWebSocketTransportProviderOptions {
    readonly available?: boolean;
    readonly cost?: NnrpTransportProviderCost;
    readonly preferenceRank?: number;
    readonly maxFrameBytes?: bigint;
    readonly diagnostic?: NnrpDiagnostic;
    readonly WebSocket?: typeof WebSocket;
}
export interface NnrpWebSocketTransportProvider extends NnrpTransportProvider {
    readonly kind: "websocket";
    readonly endpointSchemes: readonly ["ws", "wss"];
    connect(options: NnrpTransportEndpoint): Promise<NnrpWebSocketTransportConnection>;
}
export interface NnrpWebSocketTransportConnection extends NnrpTransportConnection {
    readonly kind: "websocket";
    readonly socket: WebSocket;
}
export declare function createWebSocketTransportProvider(options?: NnrpWebSocketTransportProviderOptions): NnrpWebSocketTransportProvider;
//# sourceMappingURL=index.d.ts.map