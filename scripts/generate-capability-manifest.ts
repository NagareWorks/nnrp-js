import { createCapabilityManifestReport, parseCommandOptions, writeJson } from "./sdk-reporting.ts";

writeJson(createCapabilityManifestReport(parseCommandOptions(Deno.args)));
