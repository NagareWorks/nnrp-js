export interface CoverageCounters {
  readonly lines: {
    readonly found: number;
    readonly hit: number;
  };
}

export function parseLcovCoverage(lcov: string, excluded: ReadonlySet<string>): CoverageCounters {
  const linesBySource = new Map<string, Map<number, number>>();
  let currentLines: Map<number, number> | undefined;

  for (const line of lcov.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      const source = normalizeSourcePath(line.slice(3));
      if (excluded.has(source)) {
        currentLines = undefined;
        continue;
      }
      currentLines = linesBySource.get(source) ?? new Map<number, number>();
      linesBySource.set(source, currentLines);
      continue;
    }
    if (line === "end_of_record") {
      currentLines = undefined;
      continue;
    }
    if (currentLines === undefined || !line.startsWith("DA:")) {
      continue;
    }

    const [rawLineNumber, rawCount] = line.slice(3).split(",");
    const lineNumber = Number(rawLineNumber);
    const count = Number(rawCount);
    if (!Number.isInteger(lineNumber) || lineNumber <= 0 || !Number.isFinite(count) || count < 0) {
      throw new Error(`Invalid LCOV line counter: ${line}`);
    }
    currentLines.set(lineNumber, Math.max(currentLines.get(lineNumber) ?? 0, count));
  }

  let found = 0;
  let hit = 0;
  for (const sourceLines of linesBySource.values()) {
    found += sourceLines.size;
    hit += [...sourceLines.values()].filter((count) => count > 0).length;
  }

  if (found === 0) {
    throw new Error("Coverage report did not contain line counters.");
  }

  return { lines: { found, hit } };
}

function normalizeSourcePath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const marker = "/nnrp-js/";
  const markerIndex = normalized.lastIndexOf(marker);
  return markerIndex === -1 ? normalized : normalized.slice(markerIndex + marker.length);
}
