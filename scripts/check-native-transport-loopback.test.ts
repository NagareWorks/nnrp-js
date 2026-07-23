import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { resolve } from "node:path";
import { parseNativeTransportSmokeOptions } from "./native-transport-smoke-options.ts";

Deno.test("native transport smoke selects explicit matrix cells and evidence paths", () => {
  assertEquals(parseNativeTransportSmokeOptions([]), {
    transports: ["tcp", "quic", "ipc", "websocket"],
  });
  assertEquals(
    parseNativeTransportSmokeOptions([
      "--transport",
      "tcp",
      "--transport",
      "ipc",
      "--result",
      "artifacts/native-carrier-matrix/result.json",
    ]),
    {
      transports: ["tcp", "ipc"],
      resultPath: resolve("artifacts/native-carrier-matrix/result.json"),
    },
  );
});

Deno.test("native transport smoke rejects ambiguous matrix arguments", () => {
  assertThrows(() => parseNativeTransportSmokeOptions(["--transport", "udp"]), Error, "requires one of");
  assertThrows(
    () => parseNativeTransportSmokeOptions(["--transport", "ipc", "--transport", "ipc"]),
    Error,
    "duplicate",
  );
  assertThrows(() => parseNativeTransportSmokeOptions(["--result"]), Error, "non-empty path");
  assertThrows(() => parseNativeTransportSmokeOptions(["--unknown"]), Error, "unknown");
});
