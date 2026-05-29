import { type CapabilityManifest, createPreviewManifest } from "@nnrp/core";

export interface WasmRuntimeOptions {
  readonly moduleUrl?: string | URL;
}

export interface WasmRuntimeBinding {
  readonly manifest: CapabilityManifest;
  readonly moduleUrl: string;
}

export function createWasmRuntimeBinding(options: WasmRuntimeOptions = {}): WasmRuntimeBinding {
  return {
    manifest: createPreviewManifest(["wasm.loader"]),
    moduleUrl: normalizeModuleUrl(options.moduleUrl ?? "./nnrp_wasm_bg.wasm"),
  };
}

function normalizeModuleUrl(moduleUrl: string | URL): string {
  return moduleUrl instanceof URL ? moduleUrl.toString() : moduleUrl;
}
