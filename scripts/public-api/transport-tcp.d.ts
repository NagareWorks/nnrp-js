import { type NnrpDiagnostic, type NnrpTransportConnection, type NnrpTransportEndpoint, type NnrpTransportProvider, type NnrpTransportProviderCost, type NnrpTransportServer } from "@nnrp/core";
import { type Server, type Socket } from "node:net";
export interface NnrpTcpTransportProviderOptions {
    readonly available?: boolean;
    readonly cost?: NnrpTransportProviderCost;
    readonly preferenceRank?: number;
    readonly maxFrameBytes?: bigint;
    readonly diagnostic?: NnrpDiagnostic;
}
export interface NnrpTcpTransportProvider extends NnrpTransportProvider {
    readonly kind: "tcp";
    readonly endpointSchemes: readonly ["tcp"];
    connect(options: NnrpTransportEndpoint): Promise<NnrpTcpTransportConnection>;
    listen(options: NnrpTransportEndpoint): Promise<NnrpTcpTransportServer>;
}
export interface NnrpTcpTransportConnection extends NnrpTransportConnection {
    readonly kind: "tcp";
    readonly socket: Socket;
}
export interface NnrpTcpTransportServer extends NnrpTransportServer {
    readonly kind: "tcp";
    readonly server: Server;
}
export declare function createTcpTransportProvider(options?: NnrpTcpTransportProviderOptions): NnrpTcpTransportProvider;
//# sourceMappingURL=index.d.ts.map