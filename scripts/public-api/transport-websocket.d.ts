import { type NnrpDiagnostic, type NnrpTransportCandidate, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportProvider } from "@nnrp/core";
export interface NnrpWebSocketTransportProviderOptions {
    readonly available?: boolean;
    readonly score?: number;
    readonly diagnostic?: NnrpDiagnostic;
    readonly WebSocket?: typeof WebSocket;
}
export interface NnrpWebSocketTransportProvider extends NnrpTransportProvider {
    readonly kind: "websocket";
    readonly endpointSchemes: readonly ["ws", "wss"];
    probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
    connect(options: NnrpTransportEndpoint): Promise<NnrpWebSocketTransportConnection>;
}
export interface NnrpWebSocketTransportConnection extends NnrpTransportConnection {
    readonly kind: "websocket";
    readonly socket: WebSocket;
}
export declare function createWebSocketTransportProvider(options?: NnrpWebSocketTransportProviderOptions): NnrpWebSocketTransportProvider;
//# sourceMappingURL=index.d.ts.map