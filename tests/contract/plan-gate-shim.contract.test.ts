import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PreToolUseDecisionSchema } from "../../src/schemas.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const shim = join(repoRoot, "scripts/plan-gate-shim.sh");
const packageVersion = (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version;
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runShim(mode: string, options: { home?: boolean; homeAccessible?: boolean; npx?: boolean; version?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "inspectrum-shim-"));
  tempDirs.push(root);
  const bin = join(root, "bin");
  const home = join(root, "home");
  const npxLog = join(root, "npx.log");
  const globalLog = join(root, "global.log");
  const completedLog = join(root, "completed.log");
  mkdirSync(bin);
  mkdirSync(home);

  if (options.npx !== false) {
    writeFileSync(
      join(bin, "npx"),
      `#!/bin/sh
printf '%s\\n' "$*" >> "$NPX_LOG"
case "$NPX_MODE:$*" in
  mismatch:*--version*) printf '%s\\n' "$NPX_VERSION" ;;
  offline:*|failure:*) printf '%s\\n' 'npm unavailable' >&2; exit 1 ;;
  hanging:*) sleep 5 ;;
  noisy:*) head -c 1048576 /dev/zero | tr '\\000' x; printf done > "$NPX_COMPLETED_LOG" ;;
  malformed:*--version*) printf '%s\\n' "$NPX_VERSION" ;;
  malformed:*plan-gate*) printf '%s\\n' 'not-json' ;;
  empty:*--version*) printf '%s\\n' "$NPX_VERSION" ;;
  empty:*plan-gate*) : ;;
  *:*-\-version*) printf '%s\\n' "$NPX_VERSION" ;;
  *:*plan-gate*) printf '%s\\n' '{"systemMessage":"reviewed"}' ;;
esac
`,
      { mode: 0o755 },
    );
    chmodSync(join(bin, "npx"), 0o755);
  }
  writeFileSync(join(bin, "inspectrum"), `#!/bin/sh\nprintf invoked >> "$GLOBAL_LOG"\nexit 99\n`, { mode: 0o755 });
  symlinkSync(process.execPath, join(bin, "node"));
  if (options.npx === false) symlinkSync("/usr/bin/dirname", join(bin, "dirname"));
  chmodSync(join(bin, "inspectrum"), 0o755);

  const env: NodeJS.ProcessEnv = {
    PATH: options.npx === false ? bin : `${bin}:/usr/bin:/bin`,
    NPX_LOG: npxLog,
    GLOBAL_LOG: globalLog,
    NPX_MODE: mode,
    NPX_VERSION: options.version ?? packageVersion,
    NPX_COMPLETED_LOG: completedLog,
    INSPECTRUM_NPX_TIMEOUT_MS: "1000",
  };
  if (options.home !== false) env["HOME"] = home;
  if (options.homeAccessible === false) chmodSync(home, 0o000);

  const result = spawnSync("/bin/sh", [shim], {
    cwd: repoRoot,
    env,
    input: '{"tool_name":"ExitPlanMode"}',
    encoding: "utf8",
    timeout: 2_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (options.homeAccessible === false) chmodSync(home, 0o700);
  return {
    ...result,
    npxCalls: existsSync(npxLog) ? readFileSync(npxLog, "utf8").trim().split("\n") : [],
    globalCalled: existsSync(globalLog),
    npxCompleted: existsSync(completedLog),
  };
}

function expectFailOpen(stdout: string): void {
  const decision = PreToolUseDecisionSchema.parse(JSON.parse(stdout));
  expect(decision.hookSpecificOutput).toBeUndefined();
  expect(decision.systemMessage).toContain("Plan proceeds unreviewed.");
}

describe("plan-gate shim contract", () => {
  it("ignores a stale global binary and invokes only the exact package version", () => {
    const result = runShim("success");
    expect(result.status).toBe(0);
    expect(result.globalCalled).toBe(false);
    expect(result.npxCalls).toEqual([
      `-y inspectrum@${packageVersion} --version`,
      `-y inspectrum@${packageVersion} plan-gate`,
    ]);
    expect(JSON.parse(result.stdout)).toEqual({ systemMessage: "reviewed" });
  });

  it("fails open without running plan-gate when the resolved version mismatches", () => {
    const result = runShim("mismatch", { version: "0.1.5" });
    expect(result.status).toBe(0);
    expect(result.npxCalls).toHaveLength(1);
    expectFailOpen(result.stdout);
  });

  it.each(["offline", "failure", "malformed", "hanging"])("fails open on %s bootstrap/output failure", (mode) => {
    const result = runShim(mode);
    expect(result.status).toBe(0);
    expectFailOpen(result.stdout);
  });

  it("bounds bootstrap output before failing open", () => {
    const result = runShim("noisy");
    expect(result.status).toBe(0);
    expect(result.npxCompleted).toBe(false);
    expectFailOpen(result.stdout);
  });

  it("fails open when HOME is absent", () => {
    const result = runShim("success", { home: false });
    expect(result.status).toBe(0);
    expect(result.npxCalls).toEqual([]);
    expectFailOpen(result.stdout);
  });

  it("fails open when HOME is inaccessible", () => {
    const result = runShim("success", { homeAccessible: false });
    expect(result.status).toBe(0);
    expectFailOpen(result.stdout);
  });

  it("fails open when npx is absent", () => {
    const result = runShim("success", { npx: false });
    expect(result.status).toBe(0);
    expect(result.npxCalls).toEqual([]);
    expectFailOpen(result.stdout);
  });

  it("preserves an empty successful no-op", () => {
    const result = runShim("empty");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
