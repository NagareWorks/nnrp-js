import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { parseLcovCoverage } from "./lcov-coverage.ts";

Deno.test("LCOV coverage merges duplicate source mappings by file and line", () => {
  const coverage = parseLcovCoverage(
    [
      "SF:D:\\project\\nnrp-js\\packages\\core\\src\\index.ts",
      "DA:10,0",
      "DA:10,3",
      "DA:11,0",
      "end_of_record",
      "SF:/work/nnrp-js/packages/core/src/index.ts",
      "DA:10,1",
      "DA:12,2",
      "end_of_record",
    ].join("\n"),
    new Set(),
  );

  assertEquals(coverage, { lines: { found: 3, hit: 2 } });
});

Deno.test("LCOV coverage applies normalized exclusions on Windows and Unix paths", () => {
  const coverage = parseLcovCoverage(
    [
      "SF:D:\\project\\.codex-worktrees\\nnrp-js-sdk-v9\\packages\\native-client\\src\\index.ts",
      "DA:1,1",
      "end_of_record",
      "SF:/work/feature-checkout/packages/core/src/index.ts",
      "DA:1,1",
      "end_of_record",
    ].join("\n"),
    new Set(["packages/native-client/src/index.ts"]),
  );

  assertEquals(coverage, { lines: { found: 1, hit: 1 } });
});

Deno.test("LCOV coverage rejects invalid or empty line evidence", () => {
  assertThrows(() => parseLcovCoverage("SF:/work/nnrp-js/core.ts\nDA:nope,1\nend_of_record", new Set()));
  assertThrows(() => parseLcovCoverage("SF:/work/nnrp-js/core.ts\nend_of_record", new Set()));
});
