const snapshots: readonly PublicApiSnapshot[] = [
  {
    packageName: "@nnrp/core",
    actualPath: "packages/core/dist/index.d.ts",
    snapshotPath: "scripts/public-api/core.d.ts",
  },
  {
    packageName: "@nnrp/native",
    actualPath: "packages/native/dist/index.d.ts",
    snapshotPath: "scripts/public-api/native.d.ts",
  },
  {
    packageName: "@nnrp/wasm",
    actualPath: "packages/wasm/dist/index.d.ts",
    snapshotPath: "scripts/public-api/wasm.d.ts",
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
