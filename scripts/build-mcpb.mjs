import { packExtension } from "@anthropic-ai/mcpb";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  createMcpbManifest,
  mcpbArchiveName,
  normalizeZipTimestamps,
} from "./mcpb-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
}

export async function buildMcpb() {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const output = resolve(root, "dist-mcpb", mcpbArchiveName(pkg));
  const stage = mkdtempSync(resolve(tmpdir(), "inspectrum-mcpb-"));

  try {
    run(npm, ["run", "build", "--", "--outDir", resolve(stage, "dist")], root);
    cpSync(resolve(root, "package.json"), resolve(stage, "package.json"));
    cpSync(resolve(root, "package-lock.json"), resolve(stage, "package-lock.json"));
    writeFileSync(resolve(stage, ".mcpbignore"), "!package-lock.json\n");
    writeFileSync(
      resolve(stage, "manifest.json"),
      `${JSON.stringify(createMcpbManifest(pkg), null, 2)}\n`,
    );
    run(npm, ["ci", "--omit=dev", "--ignore-scripts"], stage);

    mkdirSync(dirname(output), { recursive: true });
    const packed = await packExtension({ extensionPath: stage, outputPath: output, silent: true });
    if (!packed) throw new Error("official MCPB packer rejected the staged bundle");
    writeFileSync(output, normalizeZipTimestamps(readFileSync(output)));
    process.stdout.write(`${output}\n`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

await buildMcpb();
