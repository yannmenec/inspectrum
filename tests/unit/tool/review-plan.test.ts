import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../../src/reviewers/index.js", () => ({
  createReviewer: vi.fn(),
  ClaudeReviewer: class {},
}));

vi.mock("../../../src/judge/judge.js", () => ({
  runJudge: vi.fn(),
}));

import { createReviewer } from "../../../src/reviewers/index.js";
import { runJudge } from "../../../src/judge/judge.js";
import { reviewPlan } from "../../../src/tool/review-plan.js";
import type { Config } from "../../../src/config.js";

const mockCreateReviewer = vi.mocked(createReviewer);
const mockRunJudge = vi.mocked(runJudge);

function makeConfig(sessionsDir: string): Config {
  return {
    version: 1,
    defaults: { reviewers: ["claude"], judge: "claude", focus: "all" },
    reviewers: {
      claude: { type: "cli", binary: "claude", args: ["-p", "--output-format", "json"] },
    },
    limits: { plan_max_chars: 16000, report_max_chars: 8000, timeout_seconds: 60 },
  };
}

function makeReviewerMock(verdict: "approve" | "revise" | "reject", findings = []) {
  return {
    id: "claude",
    review: vi.fn().mockResolvedValue({
      reviewer: "claude",
      verdict,
      findings,
      summary: "Looks good.",
    }),
  };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "inspectrum-tool-test-"));
  vi.resetAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// Patch writeSession to use tmpDir — we import store and override default
vi.mock("../../../src/session/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/session/store.js")>();
  return {
    ...actual,
    defaultSessionsDir: () => tmpDir,
  };
});

describe("reviewPlan", () => {
  it("returns approve verdict when reviewer approves", async () => {
    mockCreateReviewer.mockReturnValue(makeReviewerMock("approve"));
    const result = await reviewPlan({ plan: "# Plan\nContent" }, makeConfig(tmpDir));
    expect(result.verdict).toBe("approve");
    expect(result.session_id).toHaveLength(8);
    expect(result.report_markdown).toContain("APPROVE");
  });

  it("returns revise verdict when reviewer requests revision", async () => {
    mockCreateReviewer.mockReturnValue(
      makeReviewerMock("revise", [
        { severity: "major", category: "correctness", reviewer: "claude", message: "Missing rollback" },
      ]),
    );
    const result = await reviewPlan({ plan: "# Plan\nContent" }, makeConfig(tmpDir));
    expect(result.verdict).toBe("revise");
    expect(result.findings).toHaveLength(1);
    expect(result.report_markdown).toContain("Missing rollback");
  });

  it("reject wins over revise in aggregation", async () => {
    // Two reviewers: one revise, one reject
    mockCreateReviewer
      .mockReturnValueOnce(makeReviewerMock("revise"))
      .mockReturnValueOnce(makeReviewerMock("reject"));

    const cfg: Config = {
      ...makeConfig(tmpDir),
      defaults: { reviewers: ["claude", "codex"], judge: "claude", focus: "all" },
      reviewers: {
        claude: { type: "cli", binary: "claude" },
        codex: { type: "cli", binary: "codex" },
      },
    };
    const result = await reviewPlan({ plan: "# Plan", reviewers: ["claude", "codex"], judge: false }, cfg);
    expect(result.verdict).toBe("reject");
  });

  it("throws 'All reviewers failed' when sole reviewer is not in config", async () => {
    await expect(
      reviewPlan({ plan: "# Plan", reviewers: ["nonexistent"] }, makeConfig(tmpDir)),
    ).rejects.toThrow(/all reviewers failed/i);
  });

  it("throws when no reviewers configured", async () => {
    const cfg: Config = { ...makeConfig(tmpDir), defaults: { ...makeConfig(tmpDir).defaults, reviewers: [] } };
    await expect(reviewPlan({ plan: "# Plan" }, cfg)).rejects.toThrow(/no reviewers/i);
  });

  it("writes session files to disk", async () => {
    mockCreateReviewer.mockReturnValue(makeReviewerMock("approve"));
    const result = await reviewPlan({ plan: "# Plan\nContent" }, makeConfig(tmpDir));
    const { existsSync } = await import("node:fs");
    expect(existsSync(result.session_path)).toBe(true);
    expect(existsSync(join(result.session_path, "plan-input.md"))).toBe(true);
    expect(existsSync(join(result.session_path, "session.json"))).toBe(true);
  });

  it("rejects invalid input (plan too long)", async () => {
    await expect(reviewPlan({ plan: "x".repeat(16001) }, makeConfig(tmpDir))).rejects.toThrow();
  });

  it("includes revised_plan in output when reviewer returns one", async () => {
    mockCreateReviewer.mockReturnValue({
      id: "claude",
      review: vi.fn().mockResolvedValue({
        reviewer: "claude",
        verdict: "revise",
        findings: [],
        revised_plan: "# Revised Plan\nFixed content.",
        summary: "",
      }),
    });
    const result = await reviewPlan({ plan: "# Plan" }, makeConfig(tmpDir));
    expect(result.revised_plan).toBe("# Revised Plan\nFixed content.");
  });

  it("report_markdown shows no issues message when findings=[]", async () => {
    mockCreateReviewer.mockReturnValue(makeReviewerMock("approve", []));
    const result = await reviewPlan({ plan: "# Plan" }, makeConfig(tmpDir));
    expect(result.report_markdown).toContain("No issues found");
  });

  it("failed reviewer produces operational finding instead of throwing", async () => {
    mockCreateReviewer
      .mockReturnValueOnce({ id: "claude", review: vi.fn().mockRejectedValue(new Error("timeout")) })
      .mockReturnValueOnce(makeReviewerMock("approve"));

    const cfg: Config = {
      ...makeConfig(tmpDir),
      defaults: { reviewers: ["claude", "codex"], judge: "claude", focus: "all" },
      reviewers: {
        claude: { type: "cli", binary: "claude" },
        codex: { type: "cli", binary: "codex" },
      },
    };
    mockRunJudge.mockResolvedValue({
      review: { reviewer: "judge", verdict: "approve", findings: [], summary: "" },
      status: "success",
    });
    const result = await reviewPlan({ plan: "# Plan", reviewers: ["claude", "codex"], judge: false }, cfg);
    // Verdict reflects only successful reviewers — operational failures surface in findings/report, not verdict
    expect(result.verdict).toBe("approve");
    expect(result.findings.some((f) => f.message.includes("timeout"))).toBe(true);
    expect(result.findings.some((f) => f.severity === "major" && f.category === "risk")).toBe(true);
    expect(result.report_markdown).toContain("Reviewer claude failed: timeout");
  });

  it("onProgress called once per reviewer when judge=false", async () => {
    mockCreateReviewer.mockReturnValue(makeReviewerMock("approve"));
    const calls: [number, number, string][] = [];
    const onProgress = vi.fn(async (p: number, t: number, m: string) => { calls.push([p, t, m]); });

    const cfg: Config = {
      ...makeConfig(tmpDir),
      defaults: { reviewers: ["claude"], judge: "claude", focus: "all" },
      reviewers: { claude: { type: "cli", binary: "claude" } },
    };
    await reviewPlan({ plan: "# Plan", judge: false }, cfg, onProgress);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([1, 1, "claude done"]);
  });

  it("onProgress called N+1 times with judge=true and ≥2 reviewers", async () => {
    mockCreateReviewer
      .mockReturnValueOnce(makeReviewerMock("approve"))
      .mockReturnValueOnce(makeReviewerMock("approve"));
    mockRunJudge.mockResolvedValue({
      review: {
        reviewer: "judge",
        verdict: "approve",
        findings: [],
        summary: "All good.",
      },
      status: "success",
    });

    const calls: [number, number, string][] = [];
    const onProgress = vi.fn(async (p: number, t: number, m: string) => { calls.push([p, t, m]); });

    const cfg: Config = {
      ...makeConfig(tmpDir),
      defaults: { reviewers: ["claude", "codex"], judge: "claude", focus: "all" },
      reviewers: {
        claude: { type: "cli", binary: "claude" },
        codex: { type: "cli", binary: "codex" },
      },
    };
    await reviewPlan({ plan: "# Plan", reviewers: ["claude", "codex"], judge: true }, cfg, onProgress);

    expect(calls).toHaveLength(3); // 2 reviewers + 1 judge
    expect(calls[2]).toEqual([3, 3, "judge done"]);
  });

  it("onProgress total = reviewers.length + 1 when judge active", async () => {
    mockCreateReviewer
      .mockReturnValueOnce(makeReviewerMock("approve"))
      .mockReturnValueOnce(makeReviewerMock("approve"));
    mockRunJudge.mockResolvedValue({
      review: {
        reviewer: "judge",
        verdict: "approve",
        findings: [],
      },
      status: "success",
    });

    const totals: number[] = [];
    const onProgress = vi.fn(async (_p: number, t: number) => { totals.push(t); });

    const cfg: Config = {
      ...makeConfig(tmpDir),
      defaults: { reviewers: ["claude", "codex"], judge: "claude", focus: "all" },
      reviewers: {
        claude: { type: "cli", binary: "claude" },
        codex: { type: "cli", binary: "codex" },
      },
    };
    await reviewPlan({ plan: "# Plan", reviewers: ["claude", "codex"], judge: true }, cfg, onProgress);

    expect(totals).toEqual([2, 2, 3]);
  });

  it("judge branch activated when judge=true with ≥2 successful reviews", async () => {
    mockCreateReviewer
      .mockReturnValueOnce(makeReviewerMock("approve"))
      .mockReturnValueOnce(makeReviewerMock("revise"));
    mockRunJudge.mockResolvedValue({
      review: {
        reviewer: "judge",
        verdict: "approve",
        findings: [],
      },
      status: "success",
    });

    const cfg: Config = {
      ...makeConfig(tmpDir),
      defaults: { reviewers: ["claude", "codex"], judge: "claude", focus: "all" },
      reviewers: {
        claude: { type: "cli", binary: "claude" },
        codex: { type: "cli", binary: "codex" },
      },
    };
    await reviewPlan({ plan: "# Plan", reviewers: ["claude", "codex"], judge: true }, cfg);

    expect(mockRunJudge).toHaveBeenCalledOnce();
  });

  it("does not leave progress incomplete when judge is skipped after reviewer failure", async () => {
    mockCreateReviewer
      .mockReturnValueOnce(makeReviewerMock("approve"))
      .mockReturnValueOnce({ id: "codex", review: vi.fn().mockRejectedValue(new Error("timeout")) });

    const calls: [number, number, string][] = [];
    const onProgress = vi.fn(async (p: number, t: number, m: string) => { calls.push([p, t, m]); });
    const cfg: Config = {
      ...makeConfig(tmpDir),
      defaults: { reviewers: ["claude", "codex"], judge: "claude", focus: "all" },
      reviewers: {
        claude: { type: "cli", binary: "claude" },
        codex: { type: "cli", binary: "codex" },
      },
    };

    await reviewPlan({ plan: "# Plan", reviewers: ["claude", "codex"], judge: true }, cfg, onProgress);

    expect(mockRunJudge).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);
    expect(calls.every(([, total]) => total === 2)).toBe(true);
  });

  it("labels judge fallback in the report and session output", async () => {
    mockCreateReviewer
      .mockReturnValueOnce(makeReviewerMock("approve"))
      .mockReturnValueOnce(makeReviewerMock("approve"));
    mockRunJudge.mockResolvedValue({
      review: {
        reviewer: "judge",
        verdict: "approve",
        findings: [],
        summary: "Judge failed; raw reviews concatenated.",
      },
      status: "fallback",
      error: "Judge returned invalid JSON",
    });
    const cfg: Config = {
      ...makeConfig(tmpDir),
      defaults: { reviewers: ["claude", "codex"], judge: "claude", focus: "all" },
      reviewers: {
        claude: { type: "cli", binary: "claude" },
        codex: { type: "cli", binary: "codex" },
      },
    };

    const result = await reviewPlan({ plan: "# Plan", reviewers: ["claude", "codex"], judge: true }, cfg);

    expect(result.report_markdown).toContain("Judge: fallback");
    expect(result.report_markdown).toContain("Judge returned invalid JSON");
  });

  it("judge NOT activated when judge=false", async () => {
    mockCreateReviewer
      .mockReturnValueOnce(makeReviewerMock("approve"))
      .mockReturnValueOnce(makeReviewerMock("approve"));

    const cfg: Config = {
      ...makeConfig(tmpDir),
      defaults: { reviewers: ["claude", "codex"], judge: "claude", focus: "all" },
      reviewers: {
        claude: { type: "cli", binary: "claude" },
        codex: { type: "cli", binary: "codex" },
      },
    };
    await reviewPlan({ plan: "# Plan", reviewers: ["claude", "codex"], judge: false }, cfg);

    expect(mockRunJudge).not.toHaveBeenCalled();
  });
});
