import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../../../src/reviewers/index.js", () => ({
  createReviewer: vi.fn(),
  ClaudeReviewer: class {},
}));

import { createReviewer } from "../../../src/reviewers/index.js";
import { reviewPlan } from "../../../src/tool/review-plan.js";
import type { Config } from "../../../src/config.js";

const mockCreateReviewer = vi.mocked(createReviewer);

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
    const result = await reviewPlan({ plan: "# Plan", reviewers: ["claude", "codex"] }, cfg);
    expect(result.verdict).toBe("reject");
  });

  it("throws when reviewer ID not in config", async () => {
    await expect(
      reviewPlan({ plan: "# Plan", reviewers: ["nonexistent"] }, makeConfig(tmpDir)),
    ).rejects.toThrow(/not found in config/i);
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
});
