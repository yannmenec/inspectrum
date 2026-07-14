import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPlanGate } from "../../../src/hook/plan-gate.js";
import { loadGateState, planHash } from "../../../src/hook/state.js";
import { ConfigSchema, type Config, type ReviewPlanOutput } from "../../../src/schemas.js";

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "inspectrum-gate-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  chmodSync(stateDir, 0o700);
  rmSync(stateDir, { recursive: true, force: true });
});

function config(overrides: Partial<Config["plan_gate"]> = {}): Config {
  const base = ConfigSchema.parse({});
  return { ...base, plan_gate: { ...base.plan_gate, ...overrides } };
}

function hookInput(plan = "# Plan\nDo the thing.", extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    session_id: "sess1",
    transcript_path: "/tmp/t.jsonl",
    hook_event_name: "PreToolUse",
    tool_name: "ExitPlanMode",
    tool_input: { plan },
    ...extra,
  });
}

function reviewResult(verdict: ReviewPlanOutput["verdict"], findings: ReviewPlanOutput["findings"] = []): ReviewPlanOutput {
  return {
    verdict,
    report_markdown: "# report",
    findings,
    session_id: "ab12cd34",
    session_path: "/home/u/.inspectrum/sessions/x__ab12cd34",
  };
}

const majorFinding = {
  severity: "major" as const,
  category: "risk" as const,
  reviewer: "codex",
  message: "No rollback plan.",
  suggested_fix: "Add a rollback step.",
};

describe("runPlanGate decisions", () => {
  it("approve → no permissionDecision, systemMessage, hash recorded, rounds reset", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("approve"));
    const out = await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir });
    const decision = JSON.parse(out) as Record<string, unknown>;
    expect(decision["hookSpecificOutput"]).toBeUndefined();
    expect(decision["systemMessage"]).toContain("codex approved");
    const state = loadGateState("sess1", stateDir);
    expect(state.approved_hashes).toContain(planHash("# Plan\nDo the thing."));
    expect(state.rounds_used).toBe(0);
  });

  it("revise → deny with budgeted reason and round counter", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("revise", [majorFinding]));
    const out = await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir });
    const decision = JSON.parse(out) as {
      hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string };
      suppressOutput: boolean;
    };
    expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(decision.hookSpecificOutput.permissionDecisionReason).toContain("REVISE (round 1/2)");
    expect(decision.hookSpecificOutput.permissionDecisionReason).toContain("No rollback plan.");
    expect(decision.hookSpecificOutput.permissionDecisionReason.length).toBeLessThanOrEqual(3000);
    expect(decision.suppressOutput).toBe(true);
    expect(loadGateState("sess1", stateDir).rounds_used).toBe(1);
  });

  it("reject → deny mentioning REJECT", async () => {
    const blocker = { ...majorFinding, severity: "blocker" as const, message: "Deletes prod data." };
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("reject", [blocker]));
    const out = await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir });
    expect(out).toContain("REJECT");
    expect(out).toContain("Deletes prod data.");
  });

  it("passes through after max_rounds denials without calling the reviewer", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("revise", [majorFinding]));
    await runPlanGate(hookInput("plan v1"), config(), { reviewPlanFn, stateDir });
    await runPlanGate(hookInput("plan v2"), config(), { reviewPlanFn, stateDir });
    expect(reviewPlanFn).toHaveBeenCalledTimes(2);

    const out = await runPlanGate(hookInput("plan v3"), config(), { reviewPlanFn, stateDir });
    const decision = JSON.parse(out) as Record<string, unknown>;
    expect(reviewPlanFn).toHaveBeenCalledTimes(2);
    expect(decision["hookSpecificOutput"]).toBeUndefined();
    expect(decision["systemMessage"]).toContain("review budget exhausted");
  });

  it("allows an already-approved hash immediately without re-review", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("approve"));
    await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir });
    const out = await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir });
    expect(reviewPlanFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(out)).toMatchObject({ systemMessage: expect.stringContaining("already approved") });
  });

  it("replays a cached deny for an unchanged plan and burns a round", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("revise", [majorFinding]));
    const first = await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir });
    const second = await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir });
    expect(reviewPlanFn).toHaveBeenCalledTimes(1);
    const firstReason = (JSON.parse(first) as { hookSpecificOutput: { permissionDecisionReason: string } })
      .hookSpecificOutput.permissionDecisionReason;
    const secondReason = (JSON.parse(second) as { hookSpecificOutput: { permissionDecisionReason: string } })
      .hookSpecificOutput.permissionDecisionReason;
    expect(secondReason).toBe(firstReason);
    expect(loadGateState("sess1", stateDir).rounds_used).toBe(2);
  });

  it("treats whitespace-only reformatting as the same plan (cached deny)", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("revise", [majorFinding]));
    await runPlanGate(hookInput("# Plan\nDo   the thing."), config(), { reviewPlanFn, stateDir });
    await runPlanGate(hookInput("# Plan Do the thing."), config(), { reviewPlanFn, stateDir });
    expect(reviewPlanFn).toHaveBeenCalledTimes(1);
  });
});

describe("runPlanGate plan extraction", () => {
  it("falls back to planFilePath when plan is missing", async () => {
    const planFile = join(stateDir, "plan.md");
    writeFileSync(planFile, "# File plan", "utf8");
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("approve"));
    const raw = JSON.stringify({
      session_id: "sess1",
      tool_name: "ExitPlanMode",
      tool_input: { planFilePath: planFile },
    });
    await runPlanGate(raw, config(), { reviewPlanFn, stateDir, plansDir: stateDir });
    expect(reviewPlanFn.mock.calls[0]![0]).toMatchObject({ plan: "# File plan" });
  });

  it("resolves the default plans root from CLAUDE_CONFIG_DIR", async () => {
    const claudeDir = join(stateDir, "claude-config");
    const plansDir = join(claudeDir, "plans");
    mkdirSync(plansDir, { recursive: true });
    const planFile = join(plansDir, "plan.md");
    writeFileSync(planFile, "# Configured plan");
    vi.stubEnv("CLAUDE_CONFIG_DIR", claudeDir);
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("approve"));
    const raw = JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath: planFile } });
    await runPlanGate(raw, config(), { reviewPlanFn, stateDir });
    expect(reviewPlanFn.mock.calls[0]![0]).toMatchObject({ plan: "# Configured plan" });
  });

  it("fails open when neither plan nor planFilePath is usable", async () => {
    const reviewPlanFn = vi.fn();
    const out = await runPlanGate(hookInput(""), config(), { reviewPlanFn, stateDir });
    expect(JSON.parse(out)).toMatchObject({ systemMessage: expect.stringContaining("no plan found") });
    expect(reviewPlanFn).not.toHaveBeenCalled();
  });

  it("fails open when planFilePath does not exist", async () => {
    const raw = JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath: "/no/such/file.md" } });
    const out = await runPlanGate(raw, config(), { reviewPlanFn: vi.fn(), stateDir });
    expect(JSON.parse(out)).toMatchObject({ systemMessage: expect.stringContaining("plan-gate skipped") });
  });

  it("prefers an inline plan without touching a hostile planFilePath", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("approve"));
    const raw = JSON.stringify({
      tool_name: "ExitPlanMode",
      tool_input: { plan: "# Inline", planFilePath: "/dev/zero" },
    });
    await runPlanGate(raw, config(), { reviewPlanFn, stateDir, plansDir: stateDir });
    expect(reviewPlanFn.mock.calls[0]![0]).toMatchObject({ plan: "# Inline" });
  });

  it.each([
    ["outside the plans directory", () => join(stateDir, "..", "outside.md")],
    ["a directory", () => stateDir],
    ["a device path", () => "/dev/zero"],
  ])("fails open for %s", async (_name, makePath) => {
    const reviewPlanFn = vi.fn();
    const raw = JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath: makePath() } });
    const out = await runPlanGate(raw, config(), { reviewPlanFn, stateDir, plansDir: stateDir });
    expect(JSON.parse(out)).toMatchObject({ systemMessage: expect.stringContaining("Plan proceeds unreviewed") });
    expect(reviewPlanFn).not.toHaveBeenCalled();
  });

  it("rejects a final symlink, including one targeting /dev/zero", async () => {
    const link = join(stateDir, "plan.md");
    symlinkSync("/dev/zero", link);
    const reviewPlanFn = vi.fn();
    const raw = JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath: link } });
    const out = await runPlanGate(raw, config(), { reviewPlanFn, stateDir, plansDir: stateDir });
    expect(JSON.parse(out).systemMessage).toContain("Plan proceeds unreviewed");
    expect(reviewPlanFn).not.toHaveBeenCalled();
  });

  it("rejects a plan file above 64,000 bytes before review", async () => {
    const planFile = join(stateDir, "large.md");
    writeFileSync(planFile, "x".repeat(64_001));
    const reviewPlanFn = vi.fn();
    const raw = JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath: planFile } });
    const out = await runPlanGate(raw, config(), { reviewPlanFn, stateDir, plansDir: stateDir });
    expect(JSON.parse(out).systemMessage).toContain("Plan proceeds unreviewed");
    expect(reviewPlanFn).not.toHaveBeenCalled();
  });

  it("rejects a non-Markdown plan file", async () => {
    const planFile = join(stateDir, "plan.txt");
    writeFileSync(planFile, "# Plan");
    const reviewPlanFn = vi.fn();
    const raw = JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath: planFile } });
    const out = await runPlanGate(raw, config(), { reviewPlanFn, stateDir, plansDir: stateDir });
    expect(JSON.parse(out).systemMessage).toContain("Plan proceeds unreviewed");
    expect(reviewPlanFn).not.toHaveBeenCalled();
  });

  it("rejects a file whose owner does not match the expected uid", async () => {
    const planFile = join(stateDir, "owner.md");
    writeFileSync(planFile, "# Plan");
    const reviewPlanFn = vi.fn();
    const raw = JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath: planFile } });
    const out = await runPlanGate(raw, config(), {
      reviewPlanFn,
      stateDir,
      plansDir: stateDir,
      planFileUid: (process.getuid?.() ?? 0) + 1,
    });
    expect(JSON.parse(out).systemMessage).toContain("Plan proceeds unreviewed");
    expect(reviewPlanFn).not.toHaveBeenCalled();
  });

  it("rejects an inner directory symlink that escapes the plans directory", async () => {
    const outside = mkdtempSync(join(tmpdir(), "inspectrum-outside-"));
    try {
      const nested = join(stateDir, "nested");
      writeFileSync(join(outside, "plan.md"), "# Outside");
      symlinkSync(outside, nested);
      const reviewPlanFn = vi.fn();
      const raw = JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { planFilePath: join(nested, "plan.md") } });
      const out = await runPlanGate(raw, config(), { reviewPlanFn, stateDir, plansDir: stateDir });
      expect(JSON.parse(out).systemMessage).toContain("Plan proceeds unreviewed");
      expect(reviewPlanFn).not.toHaveBeenCalled();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("truncates an oversized plan before review", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("approve"));
    await runPlanGate(hookInput("x".repeat(20_000)), config(), { reviewPlanFn, stateDir });
    const plan = (reviewPlanFn.mock.calls[0]![0] as { plan: string }).plan;
    expect(plan.length).toBeLessThanOrEqual(16_000);
    expect(plan).toContain("[...truncated]");
  });
});

describe("runPlanGate fail-open and no-op paths", () => {
  it("fails open on non-JSON stdin", async () => {
    const out = await runPlanGate("not json {", config(), { reviewPlanFn: vi.fn(), stateDir });
    expect(JSON.parse(out)).toMatchObject({ systemMessage: expect.stringContaining("plan-gate skipped") });
  });

  it("fails open when the reviewer throws (codex down)", async () => {
    const reviewPlanFn = vi.fn().mockRejectedValue(new Error("All reviewers failed:\n  - codex not found"));
    const out = await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir });
    const decision = JSON.parse(out) as Record<string, unknown>;
    expect(decision["hookSpecificOutput"]).toBeUndefined();
    expect(decision["systemMessage"]).toContain("codex not found");
  });

  it("fails open when the review exceeds the deadline", async () => {
    const reviewPlanFn = vi.fn().mockReturnValue(new Promise(() => undefined));
    const out = await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir, deadlineMs: 20 });
    expect(JSON.parse(out)).toMatchObject({ systemMessage: expect.stringContaining("deadline") });
  });

  it("is a silent no-op for other tools", async () => {
    const out = await runPlanGate(hookInput("plan", { tool_name: "Write" }), config(), {
      reviewPlanFn: vi.fn(),
      stateDir,
    });
    expect(out).toBe("");
  });

  it("is a silent no-op when plan_gate.enabled = false", async () => {
    const reviewPlanFn = vi.fn();
    const out = await runPlanGate(hookInput(), config({ enabled: false }), { reviewPlanFn, stateDir });
    expect(out).toBe("");
    expect(reviewPlanFn).not.toHaveBeenCalled();
  });

  it("still reviews when the state dir is unwritable (degraded loop protection)", async () => {
    chmodSync(stateDir, 0o500);
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("revise", [majorFinding]));
    const out = await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir: join(stateDir, "sub") });
    const decision = JSON.parse(out) as { hookSpecificOutput: { permissionDecision: string } };
    expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("recovers from a corrupt state file", async () => {
    writeFileSync(join(stateDir, "plan-gate-sess1.json"), "{corrupt", "utf8");
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("approve"));
    const out = await runPlanGate(hookInput(), config(), { reviewPlanFn, stateDir });
    expect(JSON.parse(out)).toMatchObject({ systemMessage: expect.stringContaining("approved") });
  });

  it("derives a session key from transcript_path when session_id is missing", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("revise", [majorFinding]));
    const raw = JSON.stringify({
      transcript_path: "/tmp/some-transcript.jsonl",
      tool_name: "ExitPlanMode",
      tool_input: { plan: "# P" },
    });
    await runPlanGate(raw, config(), { reviewPlanFn, stateDir });
    // Same transcript → same state → cached deny (no second review).
    await runPlanGate(raw, config(), { reviewPlanFn, stateDir });
    expect(reviewPlanFn).toHaveBeenCalledTimes(1);
  });

  it("passes plan_gate.reviewers through to the review call", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(reviewResult("approve"));
    await runPlanGate(hookInput(), config({ reviewers: ["codex", "gemini"] }), { reviewPlanFn, stateDir });
    expect(reviewPlanFn.mock.calls[0]![0]).toMatchObject({ reviewers: ["codex", "gemini"], judge: false });
  });
});
