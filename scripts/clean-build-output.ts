const outputDirectories = [
  "packages/core/dist",
  "packages/native-client/dist",
  "packages/native-server/dist",
  "packages/browser-client/dist",
  "packages/transport-tcp/dist",
  "packages/transport-quic/dist",
  "packages/transport-websocket/dist",
] as const;

for (const directory of outputDirectories) {
  await Deno.remove(directory, { recursive: true }).catch((error) => {
    if (error instanceof Deno.errors.NotFound) {
      return;
    }

    throw error;
  });
}
