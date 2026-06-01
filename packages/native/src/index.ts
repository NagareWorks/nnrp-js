import { createBackendNativeManifest, type NnrpCapabilityManifest } from "@nnrp/core";
import process from "node:process";

export interface NativeRuntimeOptions {
  readonly libraryPath?: string;
  readonly env?: Record<string, string | undefined>;
  readonly platform?: NodePlatform;
  readonly arch?: NodeArchitecture;
}

export interface NativeRuntimeBinding {
  readonly manifest: NnrpCapabilityManifest;
  readonly libraryPath: string;
}

export class NativeBindingUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NativeBindingUnavailableError";
  }
}

export function resolveNativeLibraryPath(options: NativeRuntimeOptions = {}): string {
  const env = options.env ?? process.env;
  const explicit = options.libraryPath ?? env.NNRP_NATIVE_LIBRARY;

  if (explicit && explicit.length > 0) {
    return explicit;
  }

  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const suffix = nativeLibrarySuffix(platform);

  return `native/${platform}-${arch}/nnrp_ffi.${suffix}`;
}

export function createNativeRuntimeBinding(options: NativeRuntimeOptions = {}): NativeRuntimeBinding {
  return {
    manifest: createBackendNativeManifest(),
    libraryPath: resolveNativeLibraryPath(options),
  };
}

function nativeLibrarySuffix(platform: NodePlatform): "dll" | "dylib" | "so" {
  if (platform === "win32") {
    return "dll";
  }

  if (platform === "darwin") {
    return "dylib";
  }

  return "so";
}

type NodePlatform = NodeJS.Platform;

type NodeArchitecture = NodeJS.Architecture;
