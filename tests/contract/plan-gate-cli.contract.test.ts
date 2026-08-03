import { afterEach, describe, expect, it } from "vitest";
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HOOK_STDIN_MAX_BYTES } from "../../src/hook/stdin.js";
import { PreToolUseDecisionSchema } from "../../src/schemas.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function expectCliFailOpen(result: ReturnType<typeof spawnSync>): void {
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  const decision = PreToolUseDecisionSchema.parse(JSON.parse(String(result.stdout)));
  expect(decision.systemMessage).toContain("Plan proceeds unreviewed.");
}

describe("plan-gate CLI bounded stdin", () => {
  it("fails open after reading only one byte above the cap", () => {
    const home = mkdtempSync(join(tmpdir(), "inspectrum-cli-home-"));
    tempDirs.push(home);
    const result = spawnSync(process.execPath, ["--import", "tsx/esm", "src/cli.ts", "plan-gate"], {
      cwd: repoRoot,
      env: { ...process.env, HOME: home },
      input: "x".repeat(HOOK_STDIN_MAX_BYTES + 1),
      encoding: "utf8",
      timeout: 5_000,
    });
    expectCliFailOpen(result);
  });

  it("does not hang when stdin is /dev/zero", () => {
    const home = mkdtempSync(join(tmpdir(), "inspectrum-cli-home-"));
    tempDirs.push(home);
    const zero = openSync("/dev/zero", "r");
    try {
      const result = spawnSync(process.execPath, ["--import", "tsx/esm", "src/cli.ts", "plan-gate"], {
        cwd: repoRoot,
        env: { ...process.env, HOME: home },
        stdio: [zero, "pipe", "pipe"],
        encoding: "utf8",
        timeout: 5_000,
      });
      expectCliFailOpen(result);
    } finally {
      closeSync(zero);
    }
  });

  it("rejects a FIFO plan path in a kill-bounded subprocess", () => {
    const home = mkdtempSync(join(tmpdir(), "inspectrum-cli-home-"));
    tempDirs.push(home);
    const plans = join(home, ".claude", "plans");
    mkdirSync(plans, { recursive: true });
    const fifo = join(plans, "plan.md");
    execFileSync("mkfifo", [fifo]);
    const result = spawnSync(process.execPath, ["--import", "tsx/esm", "src/cli.ts", "plan-gate"], {
      cwd: repoRoot,
      env: { ...process.env, HOME: home },
      input: JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath: fifo } }),
      encoding: "utf8",
      timeout: 5_000,
    });
    expectCliFailOpen(result);
  });

  // The gate must stay fail-open on an invalid config (AGENTS.md invariant), and the
  // reason it reports must be the readable config error, not a raw ZodError dump (#67).
  it("fails open with a readable reason when the config is invalid (#67)", () => {
    const home = mkdtempSync(join(tmpdir(), "inspectrum-cli-home-"));
    tempDirs.push(home);
    mkdirSync(join(home, ".inspectrum"), { recursive: true });
    writeFileSync(join(home, ".inspectrum", "config.toml"), '[reviewers.codex]\ntype = "nonsense"\n');
    const result = spawnSync(process.execPath, ["--import", "tsx/esm", "src/cli.ts", "plan-gate"], {
      cwd: repoRoot,
      env: { ...process.env, HOME: home },
      input: JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { plan: "# Plan" } }),
      encoding: "utf8",
      timeout: 15_000,
    });

    expectCliFailOpen(result);
    const decision = PreToolUseDecisionSchema.parse(JSON.parse(String(result.stdout)));
    expect(decision.systemMessage).toContain("reviewers.codex.type");
    expect(decision.systemMessage).not.toContain("ZodError");
  });
});
