import { unpackExtension, validateManifest } from "@anthropic-ai/mcpb";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  createMcpbManifest,
  mcpbArchiveName,
  readZipEntries,
} from "./mcpb-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const archive = resolve(process.argv[2] ?? resolve(root, "dist-mcpb", mcpbArchiveName(pkg)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyEntries(zip) {
  const entries = readZipEntries(zip);
  const names = entries.map((entry) => entry.name);
  assert(new Set(names).size === names.length, "archive contains duplicate paths");
  for (const entry of entries) {
    const parts = entry.name.split("/");
    assert(
      entry.time === 0 && entry.date === 33 && entry.localTime === 0 && entry.localDate === 33,
      `non-deterministic timestamp: ${entry.name}`,
    );
    assert(!entry.name.startsWith("/") && !entry.name.includes("\\"), `unsafe path: ${entry.name}`);
    assert(!parts.includes("..") && !parts.includes("."), `unsafe path: ${entry.name}`);
  }
  for (const required of ["manifest.json", "package.json", "package-lock.json", "dist/cli.js"]) {
    assert(names.includes(required), `archive is missing ${required}`);
  }
  assert(names.some((name) => name.startsWith("node_modules/@modelcontextprotocol/sdk/")), "MCP SDK is not bundled");
  for (const prefix of ["src/", "tests/", "scripts/", "mcpb/", ".env"]) {
    assert(!names.some((name) => name.startsWith(prefix)), `archive contains forbidden project path ${prefix}`);
  }
  for (const dependency of Object.keys(pkg.devDependencies ?? {})) {
    if (pkg.dependencies?.[dependency]) continue;
    assert(!names.some((name) => name.startsWith(`node_modules/${dependency}/`)), `devDependency is bundled: ${dependency}`);
  }
}

async function smoke(extracted, home, cwd) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(extracted, "dist", "cli.js")],
    cwd,
    env: {
      HOME: home,
      PATH: process.env.PATH ?? "",
      NO_COLOR: "1",
      npm_config_offline: "true",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "inspectrum-mcpb-smoke", version: "1.0.0" });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    assert(result.tools.length === 1, `expected one tool, got ${result.tools.length}`);
    assert(result.tools[0]?.name === "review_plan", "review_plan tool is missing");
  } finally {
    await client.close();
  }
}

async function main() {
  assert(existsSync(archive), `archive not found: ${archive}`);
  assert(basename(archive) === mcpbArchiveName(pkg), `unexpected archive name: ${basename(archive)}`);
  const plugin = JSON.parse(readFileSync(resolve(root, ".claude-plugin/plugin.json"), "utf8"));
  assert(plugin.version === pkg.version, "Claude plugin version does not match package.json");
  verifyEntries(readFileSync(archive));

  const temp = mkdtempSync(resolve(tmpdir(), "inspectrum-mcpb-verify-"));
  const extracted = resolve(temp, "bundle");
  try {
    assert(await unpackExtension({ mcpbPath: archive, outputDir: extracted, silent: true }), "official MCPB unpack failed");
    const manifestPath = resolve(extracted, "manifest.json");
    assert(validateManifest(manifestPath), "official MCPB manifest validation failed");
    const bundledPkg = JSON.parse(readFileSync(resolve(extracted, "package.json"), "utf8"));
    const bundledLock = JSON.parse(readFileSync(resolve(extracted, "package-lock.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert(JSON.stringify(manifest) === JSON.stringify(createMcpbManifest(bundledPkg)), "generated manifest drifted from package.json");
    assert(
      bundledPkg.version === pkg.version &&
        bundledLock.version === pkg.version &&
        bundledLock.packages[""].version === pkg.version,
      "package versions are inconsistent",
    );

    const listed = spawnSync(npm, ["ls", "--omit=dev", "--all", "--offline"], {
      cwd: extracted,
      encoding: "utf8",
      env: { ...process.env, npm_config_ignore_scripts: "true" },
    });
    assert(listed.status === 0, `production dependency tree is incomplete:\n${listed.stderr || listed.stdout}`);

    const home = resolve(temp, "home");
    const cwd = resolve(temp, "cwd");
    mkdirSync(home);
    mkdirSync(cwd);
    await smoke(extracted, home, cwd);
    process.stdout.write(`Verified ${basename(archive)}: schema, contents, production dependencies, and MCP smoke passed.\n`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

await main();
