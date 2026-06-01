import { NnrpCapabilityError, NnrpProtocolError } from "@nnrp/core";
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { createWasmRuntimeBinding, NnrpWasmBindingUnavailableError, openBrowserRuntime } from "../src/index.ts";

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

Deno.test("@nnrp/wasm preserves injected modules on the descriptor", () => {
  const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  const binding = createWasmRuntimeBinding({ module });

  assertEquals(binding.module, module);
});

Deno.test("@nnrp/wasm opens a browser runtime and client session", async () => {
  const runtime = await openBrowserRuntime({ moduleUrl: "/assets/nnrp.wasm", transportPolicy: "score" });
  const client = runtime.connect({
    endpoint: "wss://example.test/nnrp",
    sessionDefaults: { inputProfile: "token", metadata: { app: "browser" } },
  });
  const session = client.openSession({ metadata: { request: "one" } });

  assertEquals(runtime.moduleUrl, "/assets/nnrp.wasm");
  assertEquals(client.endpoint, "wss://example.test/nnrp");
  assertEquals(client.transportPolicy, "score");
  assertEquals(session.options.inputProfile, "token");
  assertEquals(session.options.metadata, { app: "browser", request: "one" });
});

Deno.test("@nnrp/wasm rejects empty endpoints", async () => {
  const runtime = await openBrowserRuntime();

  assertThrows(
    () => runtime.connect({ endpoint: "" }),
    NnrpCapabilityError,
  );
});

Deno.test("@nnrp/wasm rejects use after close", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  await runtime.close();

  assertThrows(
    () => client.openSession(),
    NnrpCapabilityError,
  );
});

Deno.test("@nnrp/wasm session methods preserve not-instantiated diagnostics", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  const session = client.openSession();

  const error = await assertRejects(
    () => session.submit({ frameId: 1, payload: new Uint8Array([1]) }),
    NnrpWasmBindingUnavailableError,
  );

  assertEquals(error.diagnostic.code, "NNRP_WASM_BINDING_NOT_INSTANTIATED");
});

Deno.test("@nnrp/wasm validates submit requests before WASM dispatch", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  const session = client.openSession();

  const error = await assertRejects(
    () => session.submit({ frameId: -1 }),
    NnrpProtocolError,
  );

  assertEquals(error.diagnostic.code, "NNRP_SUBMIT_FRAME_ID_INVALID");
});

Deno.test("@nnrp/wasm validates cancel and event polling before WASM dispatch", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  const session = client.openSession();

  const cancelError = await assertRejects(
    () => session.cancel(-1),
    NnrpProtocolError,
  );
  const eventError = await assertRejects(
    () => session.nextEvent({ timeoutMillis: -1 }),
    NnrpProtocolError,
  );

  assertEquals(cancelError.diagnostic.code, "NNRP_OPERATION_ID_INVALID");
  assertEquals(eventError.diagnostic.code, "NNRP_EVENT_TIMEOUT_INVALID");
});

Deno.test("@nnrp/wasm exposes async event iterator convenience", async () => {
  const runtime = await openBrowserRuntime();
  const client = runtime.connect({ endpoint: "wss://example.test/nnrp" });
  const session = client.openSession();
  const iterator = session.events()[Symbol.asyncIterator]();

  const error = await assertRejects(
    () => iterator.next(),
    NnrpWasmBindingUnavailableError,
  );

  assertEquals(error.diagnostic.code, "NNRP_WASM_BINDING_NOT_INSTANTIATED");
});
