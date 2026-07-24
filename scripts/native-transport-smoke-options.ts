import { resolve } from "node:path";

export type NativeTransportKind = "tcp" | "quic" | "ipc" | "websocket";

export interface NativeTransportSmokeOptions {
  readonly transports: readonly NativeTransportKind[];
  readonly resultPath?: string;
}

const ALL_NATIVE_TRANSPORTS: readonly NativeTransportKind[] = ["tcp", "quic", "ipc", "websocket"];

export function parseNativeTransportSmokeOptions(args: readonly string[]): NativeTransportSmokeOptions {
  const transports: NativeTransportKind[] = [];
  let resultPath: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === "--transport") {
      const value = args[++index];
      if (value === undefined || !ALL_NATIVE_TRANSPORTS.includes(value as NativeTransportKind)) {
        throw new Error(`--transport requires one of: ${ALL_NATIVE_TRANSPORTS.join(", ")}`);
      }
      if (transports.includes(value as NativeTransportKind)) throw new Error(`duplicate --transport ${value}`);
      transports.push(value as NativeTransportKind);
      continue;
    }
    if (argument === "--result") {
      const value = args[++index];
      if (value === undefined || value.trim().length === 0) throw new Error("--result requires a non-empty path");
      resultPath = resolve(value);
      continue;
    }
    throw new Error(`unknown native transport smoke argument: ${argument}`);
  }
  return {
    transports: transports.length === 0 ? ALL_NATIVE_TRANSPORTS : transports,
    ...(resultPath === undefined ? {} : { resultPath }),
  };
}
