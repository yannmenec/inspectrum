import * as fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { checkReviewer } from "./reviewers/health.js";
import { loadConfig, getConfigPath, defaultConfig } from "./config.js";
import type { Config } from "./config.js";

export async function runDoctor(configPath?: string): Promise<boolean> {
  const useColor = process.stdout.isTTY === true && !process.env["NO_COLOR"];
  const G = useColor ? "\x1b[32m" : "";
  const R = useColor ? "\x1b[31m" : "";
  const B = useColor ? "\x1b[1m"  : "";
  const Z = useColor ? "\x1b[0m"  : "";

  const pass    = (label: string) => process.stdout.write(`  ${G}✅${Z} ${label}\n`);
  const failMsg = (label: string) => process.stdout.write(`  ${R}❌${Z} ${label}\n`);
  const hint    = (text: string)  => process.stdout.write(`     ${text}\n`);
  const section = (title: string) => process.stdout.write(`\n${B}${title}${Z}\n`);

  let allOk = true;
  let config: Config;
  let configLoadFailed = false;

  process.stdout.write(`\n${B}inspectrum doctor${Z}\n`);

  // 0 — Runtime
  section("Runtime");
  const nodeMajor = parseInt(process.versions.node.split(".")[0]!, 10);
  if (nodeMajor >= 20) {
    pass(`Node ${process.versions.node}`);
  } else {
    failMsg(`Node ${process.versions.node} — inspectrum requires Node ≥ 20`);
    allOk = false;
  }

  // 1 — Config
  section("Config");
  const resolvedPath = configPath ?? getConfigPath();
  try {
    config = loadConfig(configPath);
    pass(`${resolvedPath} — valid`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failMsg(`${resolvedPath} — ${msg}`);
    allOk = false;
    config = defaultConfig;
    configLoadFailed = true;
  }

  // 2 — Sessions directory
  section("Sessions");
  const sessionsDir = join(homedir(), ".inspectrum", "sessions");
  try {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.accessSync(sessionsDir, fs.constants.W_OK);
    pass(`${sessionsDir} — writable`);
  } catch {
    failMsg(`${sessionsDir} — not writable`);
    allOk = false;
  }

  // 3 — Reviewer CLIs / HTTP endpoints
  section("Reviewers");
  if (configLoadFailed) {
    process.stdout.write(`  (skipped — fix config errors above first)\n`);
  } else {
    for (const [id, reviewerConfig] of Object.entries(config.reviewers)) {
      const result = await checkReviewer(id, reviewerConfig);
      if (result.ok) {
        pass(id);
      } else {
        failMsg(`${id}${result.reason ? ` — ${result.reason}` : ""}`);
        if (result.fix) hint(`Fix: ${result.fix}`);
        allOk = false;
      }
    }
  }

  // Summary
  process.stdout.write("\n");
  if (allOk) {
    process.stdout.write(`${G}✅ All checks passed${Z}\n\n`);
  } else {
    process.stdout.write(`${R}❌ Some checks failed${Z}\n\n`);
  }

  return allOk;
}
