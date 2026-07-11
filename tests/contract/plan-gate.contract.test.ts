import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPlanGate } from "../../src/hook/plan-gate.js";
import { ConfigSchema, PreToolUseDecisionSchema, type ReviewPlanOutput } from "../../src/schemas.js";

/**
 * Locks the stdout contract of `inspectrum plan-gate` — Claude Code parses
 * this JSON directly. Loosening PreToolUseDecisionSchema or emitting
 * permissionDecision on an approve would silently change plan-mode UX.
 */

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "inspectrum-gate-contract-"));
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

const config = ConfigSchema.parse({});

function stdin(plan = "# Plan"): string {
  return JSON.stringify({ session_id: "s1", tool_name: "ExitPlanMode", tool_input: { plan } });
}

function result(verdict: ReviewPlanOutput["verdict"], findings: ReviewPlanOutput["findings"] = []): ReviewPlanOutput {
  return { verdict, report_markdown: "r", findings, session_id: "id1", session_path: "/tmp/sessions/x" };
}

describe("plan-gate stdout contract", () => {
  it("deny output matches PreToolUseDecisionSchema exactly", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(
      result("revise", [{ severity: "major", category: "risk", reviewer: "codex", message: "m" }]),
    );
    const out = await runPlanGate(stdin(), config, { reviewPlanFn, stateDir });
    const parsed = PreToolUseDecisionSchema.parse(JSON.parse(out));
    expect(parsed.hookSpecificOutput).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
    });
    expect(parsed.hookSpecificOutput!.permissionDecisionReason.length).toBeGreaterThan(0);
  });

  it("approve output matches the schema and never carries a permissionDecision", async () => {
    const reviewPlanFn = vi.fn().mockResolvedValue(result("approve"));
    const out = await runPlanGate(stdin(), config, { reviewPlanFn, stateDir });
    const parsed = PreToolUseDecisionSchema.parse(JSON.parse(out));
    expect(parsed.hookSpecificOutput).toBeUndefined();
    expect(parsed.systemMessage).toBeDefined();
    expect(out).not.toContain('"permissionDecision"');
    expect(out).not.toContain('"allow"');
  });

  it("fail-open output matches the schema with a warning systemMessage", async () => {
    const reviewPlanFn = vi.fn().mockRejectedValue(new Error("boom"));
    const out = await runPlanGate(stdin(), config, { reviewPlanFn, stateDir });
    const parsed = PreToolUseDecisionSchema.parse(JSON.parse(out));
    expect(parsed.hookSpecificOutput).toBeUndefined();
    expect(parsed.systemMessage).toMatch(/plan-gate skipped/);
  });

  it("no-op paths emit an empty string, not JSON", async () => {
    const disabled = { ...config, plan_gate: { ...config.plan_gate, enabled: false } };
    await expect(runPlanGate(stdin(), disabled, { reviewPlanFn: vi.fn(), stateDir })).resolves.toBe("");
  });
});
