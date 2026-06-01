import { assertEquals } from "jsr:@std/assert@1";
import { createNativeRuntimeBinding, resolveNativeLibraryPath } from "../src/index.ts";

Deno.test("@nnrp/native prefers an explicit native library path", () => {
  assertEquals(resolveNativeLibraryPath({ libraryPath: "C:/nnrp/nnrp_ffi.dll" }), "C:/nnrp/nnrp_ffi.dll");
});

Deno.test("@nnrp/native falls back to the environment override before platform defaults", () => {
  assertEquals(
    resolveNativeLibraryPath({ env: { NNRP_NATIVE_LIBRARY: "/opt/nnrp/libnnrp_ffi.so" } }),
    "/opt/nnrp/libnnrp_ffi.so",
  );
});

Deno.test("@nnrp/native builds a platform-specific default path", () => {
  assertEquals(
    resolveNativeLibraryPath({ platform: "darwin", arch: "arm64", env: {} }),
    "native/darwin-arm64/nnrp_ffi.dylib",
  );
});

Deno.test("@nnrp/native creates a native binding descriptor", () => {
  const binding = createNativeRuntimeBinding({ platform: "linux", arch: "x64", env: {} });

  assertEquals(binding.manifest.capabilities, ["client.session", "server.session", "native.loader"]);
  assertEquals(binding.manifest.buildMode, "backend-native");
  assertEquals(binding.libraryPath, "native/linux-x64/nnrp_ffi.so");
});
