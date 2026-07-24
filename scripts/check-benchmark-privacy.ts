const paths = Deno.args.length === 0
  ? ["artifacts/release-benchmark-results.json", "doc/benchmarks/preview4-runtime-and-carriers.md"]
  : Deno.args;
const prohibited = [
  { label: "credential token", pattern: /\b(?:npm_|gh[pousr]_)[A-Za-z0-9_-]+/ },
  { label: "Windows user path", pattern: /\b[A-Za-z]:\\Users\\[^\\\s]+/ },
  { label: "Unix user path", pattern: /\/(?:home|Users)\/[^/\s]+/ },
  { label: "non-loopback IPv4 address", pattern: /\b(?!127\.)\d{1,3}(?:\.\d{1,3}){3}\b/ },
] as const;

for (const path of paths) {
  const content = await Deno.readTextFile(path);
  for (const rule of prohibited) {
    if (rule.pattern.test(content)) throw new Error(`${path} contains ${rule.label}`);
  }
}

console.log(`Benchmark privacy check passed for ${paths.length} evidence files.`);
