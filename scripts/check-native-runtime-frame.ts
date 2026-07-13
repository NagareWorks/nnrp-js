import { RuntimeRole } from "@nnrp/core";
import { createDenoNativeFfiBinding, openNativeClient } from "@nnrp/native-client";
import { createTcpTransportProvider } from "@nnrp/transport-tcp";

const libraryPath = Deno.env.get("NNRP_NATIVE_LIBRARY") ?? defaultNativeLibraryPath();
const ffi = createDenoNativeFfiBinding({ libraryPath });
const client = await openNativeClient({
  endpoint: "127.0.0.1:4433",
  env: {},
  transports: [createTcpTransportProvider()],
  ffi,
});
const session = client.openSession({ sessionId: "native-runtime-frame-smoke" });
const diagnostic = new Uint8Array([0x6f, 0x6b]);

try {
  await session.cancel({
    operationId: 1n,
    controlSequence: 1n,
    reasonCode: 0,
    sourceRole: RuntimeRole.Client,
    flags: 0,
    diagnosticBytes: diagnostic.byteLength,
  }, diagnostic);
  diagnostic.fill(0);

  const event = await session.nextEvent();
  if (
    event.type !== "cancel" || event.sessionId !== "native-runtime-frame-smoke" ||
    event.metadata.operationId !== 1n || event.diagnostic?.[0] !== 0x6f || event.diagnostic?.[1] !== 0x6b
  ) {
    throw new Error(`unexpected native runtime frame event: ${JSON.stringify(event, bigintJsonReplacer)}`);
  }
} finally {
  await client.runtime.close();
}

function defaultNativeLibraryPath(): string {
  const platform = Deno.build.os === "windows" ? "windows" : Deno.build.os === "darwin" ? "macos" : "linux";
  const arch = Deno.build.arch === "x86_64" ? "x86_64" : Deno.build.arch;
  const file = Deno.build.os === "windows"
    ? "nnrp_ffi.dll"
    : Deno.build.os === "darwin"
    ? "libnnrp_ffi.dylib"
    : "libnnrp_ffi.so";
  return `packages/transport-tcp/native/${platform}-${arch}/${file}`;
}

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
