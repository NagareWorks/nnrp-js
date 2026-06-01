import { assertEquals } from "jsr:@std/assert@1";
import { createWasmRuntimeBinding } from "../src/index.ts";

Deno.test("@nnrp/wasm creates a default wasm binding descriptor", () => {
  const binding = createWasmRuntimeBinding();

  assertEquals(binding.moduleUrl, "./nnrp_wasm_bg.wasm");
  assertEquals(binding.manifest.capabilities, ["client.session", "wasm.loader"]);
  assertEquals(binding.manifest.buildMode, "browser-wasm");
});

Deno.test("@nnrp/wasm normalizes URL module locations", () => {
  const binding = createWasmRuntimeBinding({ moduleUrl: new URL("https://example.test/nnrp.wasm") });

  assertEquals(binding.moduleUrl, "https://example.test/nnrp.wasm");
});
