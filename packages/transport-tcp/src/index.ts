import {
  type NnrpDiagnostic,
  type NnrpTransportCandidate,
  type NnrpTransportConnection,
  type NnrpTransportEndpoint,
  type NnrpTransportProvider,
  type NnrpTransportServer,
} from "@nnrp/core";
import { connect as connectSocket, createServer, type Server, type Socket } from "node:net";

export interface NnrpTcpTransportProviderOptions {
  readonly available?: boolean;
  readonly score?: number;
  readonly diagnostic?: NnrpDiagnostic;
}

export interface NnrpTcpTransportProvider extends NnrpTransportProvider {
  readonly kind: "tcp";
  readonly endpointSchemes: readonly ["tcp"];
  probe(): NnrpTransportCandidate | Promise<NnrpTransportCandidate>;
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

export function createTcpTransportProvider(
  options: NnrpTcpTransportProviderOptions = {},
): NnrpTcpTransportProvider {
  return {
    kind: "tcp",
    endpointSchemes: ["tcp"],
    probe: () => ({
      kind: "tcp",
      peerSupported: true,
      localAvailable: options.available ?? true,
      score: options.score ?? 60,
      ...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
    }),
    connect: (endpoint) => connectTcp(endpoint),
    listen: (endpoint) => listenTcp(endpoint),
  };
}

async function connectTcp(options: NnrpTransportEndpoint): Promise<NnrpTcpTransportConnection> {
  const endpoint = normalizeTcpEndpoint(options.endpoint, { allowEphemeralPort: false });
  const socket = connectSocket(endpoint.port, endpoint.host);

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  return {
    kind: "tcp",
    endpoint: endpoint.raw,
    socket,
    get connected() {
      return !socket.destroyed;
    },
    send: (payload) =>
      new Promise<void>((resolve, reject) => {
        socket.write(payload, (error) => error === undefined ? resolve() : reject(error));
      }),
    close: () => {
      socket.destroy();
    },
  };
}

async function listenTcp(options: NnrpTransportEndpoint): Promise<NnrpTcpTransportServer> {
  const endpoint = normalizeTcpEndpoint(options.endpoint, { allowEphemeralPort: true });
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
    server.listen(endpoint.port, endpoint.host);
  });

  return {
    kind: "tcp",
    endpoint: resolveListeningEndpoint(server, endpoint.host),
    server,
    get listening() {
      return server.listening;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      }),
  };
}

function normalizeTcpEndpoint(
  endpoint: string | URL,
  options: { readonly allowEphemeralPort: boolean },
): { readonly host: string; readonly port: number; readonly raw: string } {
  const url = endpoint instanceof URL ? endpoint : new URL(`tcp://${endpoint}`);
  if (url.protocol !== "tcp:") {
    throw new Error(`TCP transport requires a tcp:// endpoint, got ${url.protocol}`);
  }

  const port = Number(url.port);
  if (!Number.isInteger(port) || port > 65535 || port < (options.allowEphemeralPort ? 0 : 1)) {
    throw new Error(`TCP transport endpoint requires a valid port: ${url.toString()}`);
  }

  return {
    host: url.hostname || "127.0.0.1",
    port,
    raw: `${url.hostname || "127.0.0.1"}:${port}`,
  };
}

function resolveListeningEndpoint(server: Server, fallbackHost: string): string {
  const address = server.address();
  if (address === null || typeof address === "string") {
    return fallbackHost;
  }

  return `${address.address}:${address.port}`;
}
