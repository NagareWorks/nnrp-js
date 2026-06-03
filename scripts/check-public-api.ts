const snapshots: readonly PublicApiSnapshot[] = [
  {
    packageName: "@nnrp/core",
    actualPath: "packages/core/dist/index.d.ts",
    snapshotPath: "scripts/public-api/core.d.ts",
  },
  {
    packageName: "@nnrp/native-client",
    actualPath: "packages/native-client/dist/index.d.ts",
    snapshotPath: "scripts/public-api/native-client.d.ts",
  },
  {
    packageName: "@nnrp/native-server",
    actualPath: "packages/native-server/dist/index.d.ts",
    snapshotPath: "scripts/public-api/native-server.d.ts",
  },
  {
    packageName: "@nnrp/browser-client",
    actualPath: "packages/browser-client/dist/index.d.ts",
    snapshotPath: "scripts/public-api/browser-client.d.ts",
  },
  {
    packageName: "@nnrp/transport-tcp",
    actualPath: "packages/transport-tcp/dist/index.d.ts",
    snapshotPath: "scripts/public-api/transport-tcp.d.ts",
  },
  {
    packageName: "@nnrp/transport-quic",
    actualPath: "packages/transport-quic/dist/index.d.ts",
    snapshotPath: "scripts/public-api/transport-quic.d.ts",
  },
  {
    packageName: "@nnrp/transport-websocket",
    actualPath: "packages/transport-websocket/dist/index.d.ts",
    snapshotPath: "scripts/public-api/transport-websocket.d.ts",
  },
];

const failures: string[] = [];

for (const snapshot of snapshots) {
  const actual = await readNormalized(snapshot.actualPath);
  const expected = await readNormalized(snapshot.snapshotPath);

  if (actual !== expected) {
    failures.push(
      `${snapshot.packageName}: public declaration drifted; update ${snapshot.snapshotPath} only with an intentional API change`,
    );
  }
}

if (failures.length > 0) {
  console.error("Public API check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  Deno.exit(1);
}

async function readNormalized(path: string): Promise<string> {
  return (await Deno.readTextFile(path)).replaceAll("\r\n", "\n").trimEnd();
}

interface PublicApiSnapshot {
  readonly packageName: string;
  readonly actualPath: string;
  readonly snapshotPath: string;
}
