import { resolve } from "jsr:@std/path@1";

const outputRoot = "artifacts/installed-package-smoke";
const stagedRoot = "artifacts/npm-publish";
const releaseAssets = `${outputRoot}/release-assets`;
const installRoot = `${outputRoot}/consumer`;

const packages: readonly PackagePolicy[] = [
  { name: "@nnrp/core", stage: "nnrp-core" },
  { name: "@nnrp/transport-tcp", stage: "nnrp-transport-tcp" },
  { name: "@nnrp/transport-quic", stage: "nnrp-transport-quic" },
  { name: "@nnrp/transport-ipc", stage: "nnrp-transport-ipc" },
  { name: "@nnrp/transport-websocket", stage: "nnrp-transport-websocket" },
  { name: "@nnrp/native-client", stage: "nnrp-native-client" },
  { name: "@nnrp/native-server", stage: "nnrp-native-server" },
  { name: "@nnrp/browser-client", stage: "nnrp-browser-client" },
];

await resetDirectory(outputRoot);
await run(Deno.execPath(), [
  "run",
  "--allow-read",
  `--allow-write=${stagedRoot}`,
  "--allow-env=ComSpec",
  "--allow-run=npm,cmd",
  "scripts/publish-packages.ts",
  "--skip-publish",
]);
await Deno.mkdir(releaseAssets, { recursive: true });

const packed = new Map<string, PackResult>();
for (const policy of packages) {
  const result = await npmPack(policy);
  packed.set(policy.name, result);
}

await Deno.mkdir(installRoot, { recursive: true });
await writeConsumerProject(packed);
await runNpm(["install", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund"], installRoot);
await run("node", ["package-smoke.mjs"], installRoot);
await Deno.copyFile("scripts/check-node-import-smoke.mjs", `${installRoot}/native-role-smoke.mjs`);
await run("node", ["native-role-smoke.mjs", "--installed"], installRoot);
await run(Deno.execPath(), ["run", "--node-modules-dir=manual", "package-smoke.mjs"], installRoot);
await runBrowserSmoke(installRoot);

await Deno.writeTextFile(
  `${outputRoot}/evidence.json`,
  `${
    JSON.stringify(
      {
        packageCount: packages.length,
        packages: packages.map(({ name }) => {
          const result = packed.get(name)!;
          return { name, version: result.version, filename: result.filename, integrity: result.integrity };
        }),
        runtimes: { node: "passed", nodeNativeRole: "passed", deno: "passed", browser: "passed" },
      },
      null,
      2,
    )
  }\n`,
);

async function npmPack(policy: PackagePolicy): Promise<PackResult> {
  const stageDirectory = resolvePath(`${stagedRoot}/${policy.stage}`);
  const output = await runNpmCapture(
    ["pack", stageDirectory, "--pack-destination", resolvePath(releaseAssets), "--json"],
    Deno.cwd(),
  );
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isPackResult(parsed[0])) {
    throw new Error(`${policy.name}: unexpected npm pack output`);
  }
  const result = parsed[0];
  if (result.name !== policy.name || !result.integrity.startsWith("sha512-") || result.files.length === 0) {
    throw new Error(`${policy.name}: incomplete npm pack evidence`);
  }
  return result;
}

async function writeConsumerProject(packed: ReadonlyMap<string, PackResult>): Promise<void> {
  const dependencies = Object.fromEntries(packages.map(({ name }) => {
    const result = packed.get(name);
    if (result === undefined) throw new Error(`${name}: missing packed archive`);
    return [name, `file:../release-assets/${result.filename}`];
  }));
  await Deno.writeTextFile(
    `${installRoot}/package.json`,
    `${JSON.stringify({ name: "nnrp-installed-smoke", private: true, type: "module", dependencies }, null, 2)}\n`,
  );
  await Deno.writeTextFile(
    `${installRoot}/package-smoke.mjs`,
    `const expected = ${JSON.stringify(packages.map(({ name }) => name))};\n` +
      `for (const name of expected) {\n` +
      `  const loaded = await import(name);\n` +
      `  if (Object.keys(loaded).length === 0) throw new Error(name + " has no exports");\n` +
      `}\n` +
      `console.log("installed package imports passed", expected.length);\n`,
  );
  await Deno.writeTextFile(`${installRoot}/browser-smoke.html`, browserSmokeHtml());
}

async function runBrowserSmoke(root: string): Promise<void> {
  const executable = await resolveBrowserExecutable();
  const profile = resolvePath(`${outputRoot}/browser-profile`);
  await Deno.mkdir(profile, { recursive: true });
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0 }, async (request) => {
    const url = new URL(request.url);
    const relative = url.pathname === "/" ? "browser-smoke.html" : url.pathname.slice(1);
    if (relative.includes("..") || (!relative.startsWith("node_modules/") && relative !== "browser-smoke.html")) {
      return new Response("not found", { status: 404 });
    }
    try {
      const body = await Deno.readFile(`${root}/${relative}`);
      return new Response(body, { headers: { "content-type": contentType(relative) } });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return new Response("not found", { status: 404 });
      throw error;
    }
  });
  try {
    const port = (server.addr as Deno.NetAddr).port;
    const output = await new Deno.Command(executable, {
      args: [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        `--user-data-dir=${profile}`,
        "--virtual-time-budget=3000",
        "--dump-dom",
        `http://127.0.0.1:${port}/`,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);
    if (!output.success || !stdout.includes('data-status="passed"')) {
      throw new Error(`browser installed-package smoke failed\n${stderr}\n${stdout}`);
    }
  } finally {
    await server.shutdown();
  }
}

function browserSmokeHtml(): string {
  return `<!doctype html>
<html><body data-status="pending">pending
<script type="importmap">{"imports":{
  "@nnrp/core":"/node_modules/@nnrp/core/dist/index.js",
  "@nnrp/browser-client":"/node_modules/@nnrp/browser-client/dist/index.js",
  "@nnrp/transport-websocket":"/node_modules/@nnrp/transport-websocket/dist/browser.js"
}}</script>
<script type="module">
import { openBrowserRuntime } from "@nnrp/browser-client";
import { createWebSocketTransportProvider } from "@nnrp/transport-websocket";
if (typeof openBrowserRuntime !== "function" || typeof createWebSocketTransportProvider !== "function") {
  throw new Error("browser package exports are missing");
}
document.body.dataset.status = "passed";
document.body.textContent = "passed";
</script></body></html>`;
}

async function resolveBrowserExecutable(): Promise<string> {
  const explicit = Deno.env.get("NNRP_BROWSER_EXECUTABLE");
  const candidates = [
    explicit,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    Deno.env.get("LOCALAPPDATA") === undefined
      ? undefined
      : `${Deno.env.get("LOCALAPPDATA")}/Google/Chrome/Application/chrome.exe`,
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ].filter((value): value is string => value !== undefined && value.length > 0);
  for (const candidate of candidates) {
    try {
      if ((await Deno.stat(candidate)).isFile) return candidate;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  throw new Error("installed-package browser smoke requires Chrome, Chromium, or Edge");
}

async function resetDirectory(path: string): Promise<void> {
  await Deno.remove(path, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  await Deno.mkdir(path, { recursive: true });
}

async function run(command: string, args: readonly string[], cwd = Deno.cwd()): Promise<void> {
  const output = await new Deno.Command(command, { args: [...args], cwd, stdout: "inherit", stderr: "inherit" })
    .output();
  if (!output.success) throw new Error(`${command} ${args.join(" ")} failed with code ${output.code}`);
}

async function runNpm(args: readonly string[], cwd: string): Promise<void> {
  const output = await new Deno.Command(npmCommand(), {
    args: npmArgs(args),
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!output.success) throw new Error(`npm ${args.join(" ")} failed with code ${output.code}`);
}

async function runNpmCapture(args: readonly string[], cwd: string): Promise<string> {
  const output = await new Deno.Command(npmCommand(), {
    args: npmArgs(args),
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!output.success) {
    throw new Error(`npm ${args.join(" ")} failed\n${new TextDecoder().decode(output.stderr)}`);
  }
  return new TextDecoder().decode(output.stdout);
}

function npmCommand(): string {
  return Deno.build.os === "windows" ? Deno.env.get("ComSpec") ?? "cmd" : "npm";
}

function npmArgs(args: readonly string[]): string[] {
  return Deno.build.os === "windows" ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : [...args];
}

function resolvePath(path: string): string {
  return resolve(path);
}

function contentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

function isPackResult(value: unknown): value is PackResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  return typeof result.name === "string" && typeof result.version === "string" &&
    typeof result.filename === "string" && typeof result.integrity === "string" && Array.isArray(result.files);
}

interface PackagePolicy {
  readonly name: string;
  readonly stage: string;
}

interface PackResult {
  readonly name: string;
  readonly version: string;
  readonly filename: string;
  readonly integrity: string;
  readonly files: readonly { readonly path: string }[];
}
