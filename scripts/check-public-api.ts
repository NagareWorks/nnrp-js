const snapshots: readonly PublicApiSnapshot[] = [
  {
    packageName: "@nnrp/core",
    actualPath: "packages/core/dist/index.d.ts",
    snapshotPath: "scripts/public-api/core.d.ts",
    workstreamPath: "doc/todo/v1-preview4/01-core-contract-and-endpoints.md",
  },
  {
    packageName: "@nnrp/native-client",
    actualPath: "packages/native-client/dist/index.d.ts",
    snapshotPath: "scripts/public-api/native-client.d.ts",
    workstreamPath: "doc/todo/v1-preview4/03-client-control-surface.md",
  },
  {
    packageName: "@nnrp/native-server",
    actualPath: "packages/native-server/dist/index.d.ts",
    snapshotPath: "scripts/public-api/native-server.d.ts",
    workstreamPath: "doc/todo/v1-preview4/04-server-control-surface.md",
  },
  {
    packageName: "@nnrp/browser-client",
    actualPath: "packages/browser-client/dist/index.d.ts",
    snapshotPath: "scripts/public-api/browser-client.d.ts",
    workstreamPath: "doc/todo/v1-preview4/03-client-control-surface.md",
  },
  {
    packageName: "@nnrp/transport-tcp",
    actualPath: "packages/transport-tcp/dist/index.d.ts",
    snapshotPath: "scripts/public-api/transport-tcp.d.ts",
    workstreamPath: "doc/todo/v1-preview4/01-core-contract-and-endpoints.md",
  },
  {
    packageName: "@nnrp/transport-quic",
    actualPath: "packages/transport-quic/dist/index.d.ts",
    snapshotPath: "scripts/public-api/transport-quic.d.ts",
    workstreamPath: "doc/todo/v1-preview4/01-core-contract-and-endpoints.md",
  },
  {
    packageName: "@nnrp/transport-ipc",
    actualPath: "packages/transport-ipc/dist/index.d.ts",
    snapshotPath: "scripts/public-api/transport-ipc.d.ts",
    workstreamPath: "doc/todo/v1-preview4/06-ipc-provider.md",
  },
  {
    packageName: "@nnrp/transport-websocket",
    actualPath: "packages/transport-websocket/dist/index.d.ts",
    snapshotPath: "scripts/public-api/transport-websocket.d.ts",
    workstreamPath: "doc/todo/v1-preview4/07-websocket-provider.md",
  },
];

const failures: string[] = [];
const workstreamPaths = await preview4WorkstreamPaths();

for (const snapshot of snapshots) {
  const actual = await readNormalized(snapshot.actualPath);
  const expected = await readNormalized(snapshot.snapshotPath);

  if (actual !== expected) {
    failures.push(
      `${snapshot.packageName}: public declaration drifted; update ${snapshot.snapshotPath} only with an intentional API change`,
    );
  }

  const marker = `\`${snapshot.snapshotPath}\``;
  const owners: string[] = [];
  for (const workstreamPath of workstreamPaths) {
    if ((await Deno.readTextFile(workstreamPath)).includes(marker)) {
      owners.push(workstreamPath);
    }
  }
  if (owners.length !== 1 || owners[0] !== snapshot.workstreamPath) {
    failures.push(
      `${snapshot.packageName}: ${snapshot.snapshotPath} must be linked only from ${snapshot.workstreamPath}; found ${
        owners.length === 0 ? "no owner" : owners.join(", ")
      }`,
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

async function preview4WorkstreamPaths(): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of Deno.readDir("doc/todo/v1-preview4")) {
    if (entry.isFile && /^\d{2}-.*\.md$/.test(entry.name)) {
      paths.push(`doc/todo/v1-preview4/${entry.name}`);
    }
  }
  return paths.sort();
}

interface PublicApiSnapshot {
  readonly packageName: string;
  readonly actualPath: string;
  readonly snapshotPath: string;
  readonly workstreamPath: string;
}
