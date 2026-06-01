const outputDirectories = [
  "packages/core/dist",
  "packages/native/dist",
  "packages/wasm/dist",
] as const;

for (const directory of outputDirectories) {
  await Deno.remove(directory, { recursive: true }).catch((error) => {
    if (error instanceof Deno.errors.NotFound) {
      return;
    }

    throw error;
  });
}
