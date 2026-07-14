import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertValidOrders,
  buildConfig,
  buildSchedule,
  buildToolArguments,
  normalizeForPublication,
  scoreRecords,
} from "../../../benchmarks/plan-review-v0.2.1/lib.mjs";

const ok = {
  mcp_started: true,
  tool_responded: true,
  schema_valid: true,
  reviewer_succeeded: true,
  session_complete: true,
};

describe("plan-review synthetic evaluation", () => {
  it("requires three permutations containing every fixture exactly once", () => {
    const ids = ["a", "b", "c"];
    expect(() => assertValidOrders({ blocks: [["a", "b", "c"], ["b", "c", "a"], ["c", "a", "b"]] }, ids)).not.toThrow();
    expect(() => assertValidOrders({ blocks: [["a", "a", "c"], ["b", "c", "a"], ["c", "a", "b"]] }, ids)).toThrow(/block 1/i);
  });

  it("normalizes machine paths without changing evidence content", () => {
    const value = {
      cwd: "/Users/test/project/run",
      output: "saved /private/tmp/run-1/result.json",
      nested: ["/Users/test/.codex/auth.json", "unchanged"],
    };
    expect(normalizeForPublication(value, [
      ["/Users/test/project", "$REPO"],
      ["/Users/test/.codex", "$CODEX_HOME"],
      ["/private/tmp/run-1", "$RUN_ROOT"],
    ])).toEqual({
      cwd: "$REPO/run",
      output: "saved $RUN_ROOT/result.json",
      nested: ["$CODEX_HOME/auth.json", "unchanged"],
    });
  });

  it("builds an immutable 24-call schedule and label-free MCP arguments", () => {
    const blocks = Array.from({ length: 3 }, (_, block) =>
      Array.from({ length: 8 }, (_, index) => `case-${(index + block) % 8}`),
    );
    const schedule = buildSchedule({ blocks });
    expect(schedule).toHaveLength(24);
    expect(schedule[0]).toEqual({ block: 1, position: 1, fixture_id: "case-0", call_id: "b1-p1-case-0" });
    expect(schedule[23]).toEqual({ block: 3, position: 8, fixture_id: "case-1", call_id: "b3-p8-case-1" });
    expect(buildToolArguments("# Synthetic plan")).toEqual({
      plan: "# Synthetic plan",
      reviewers: ["codex"],
      focus: "all",
      judge: false,
    });
    const config = buildConfig({ model: "runtime-model", effort: "high", wrapper: "/tmp/codex-wrapper" });
    expect(config).toContain('backend = "codex"');
    expect(config).toContain('args = ["--ignore-user-config", "--ignore-rules"]');
    expect(config).not.toMatch(/expected|legacy|acceptable/i);
  });

  it("keeps the oracle out of the runner and preregistered request condition", () => {
    const runner = readFileSync(resolve("benchmarks/plan-review-v0.2.1/run.mjs"), "utf8");
    const preregistration = readFileSync(resolve("benchmarks/plan-review-v0.2.1/preregistration.json"), "utf8");
    expect(runner).not.toContain("oracle.json");
    expect(preregistration).not.toMatch(/legacy_verdict|acceptable_verdicts|expected_categories/);
  });

  it("reports agreement, category recall, one-fixture false positives, operations and latency", () => {
    const oracle = {
      fixtures: {
        "trivial-correct": {
          legacy_verdict: "approve",
          acceptable_verdicts: ["approve"],
          expected_categories: [],
        },
        risky: {
          legacy_verdict: "reject",
          acceptable_verdicts: ["revise", "reject"],
          expected_categories: ["risk", "correctness"],
        },
      },
    };
    const records = [
      record(1, "trivial-correct", "approve", ["clarity"], 100),
      record(1, "risky", "revise", ["risk", "correctness"], 200),
      record(2, "trivial-correct", "approve", [], 300),
      record(2, "risky", "revise", ["risk"], 400),
      record(3, "trivial-correct", "revise", ["risk"], 500),
      record(3, "risky", "revise", ["risk", "correctness"], 600, { ...ok, session_complete: false }),
    ];

    const summary = scoreRecords(records, oracle);
    expect(summary.attempts).toBe(6);
    expect(summary.completed_blocks).toBe(3);
    expect(summary.semantic_calls).toBe(6);
    expect(summary.verdict_agreement.legacy).toEqual({ hits: 2, total: 6, ratio: 1 / 3 });
    expect(summary.verdict_agreement.acceptable).toEqual({ hits: 5, total: 6, ratio: 5 / 6 });
    expect(summary.category_recall.micro).toEqual({ hits: 5, total: 6, ratio: 5 / 6 });
    expect(summary.category_recall.macro_ratio).toBeCloseTo(5 / 6);
    expect(summary.category_recall.majority).toEqual({ hits: 2, total: 2, ratio: 1 });
    expect(summary.correct_fixture).toEqual({ attempts: 3, non_approvals: 1, minor_findings_on_approvals: 1 });
    expect(summary.operations).toMatchObject({
      mcp_started: 6,
      tool_responded: 6,
      schema_valid: 6,
      reviewer_succeeded: 6,
      session_complete: 5,
      full_success: 5,
    });
    expect(summary.latency).toEqual({ success_count: 5, sorted_ms: [100, 200, 300, 400, 500], median_ms: 300, p95_ms: 500, failure_ms: [600] });
  });
});

function record(
  block: number,
  fixture_id: string,
  verdict: string,
  categories: string[],
  duration_ms: number,
  status = ok,
) {
  return {
    block,
    fixture_id,
    duration_ms,
    status,
    result: {
      verdict,
      findings: categories.map((category, index) => ({
        category,
        severity: fixture_id === "trivial-correct" && index === 0 ? "minor" : "major",
      })),
    },
  };
}
