import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { ClaudeReviewer } from "../../../src/reviewers/claude.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const mockSpawn = vi.mocked(childProcess.spawn);

function makeMockProcess(stdout: string, stderr = "", exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as never;
  proc.stderr = new EventEmitter() as never;
  proc.stdin = { write: vi.fn(), end: vi.fn() } as never;

  setTimeout(() => {
    (proc.stdout as EventEmitter).emit("data", Buffer.from(stdout));
    (proc.stderr as EventEmitter).emit("data", Buffer.from(stderr));
    (proc.stdout as EventEmitter).emit("end");
    proc.emit("close", exitCode);
  }, 0);

  return proc;
}

const cfg: ReviewerConfig = { type: "cli", binary: "claude", args: ["-p", "--output-format", "json"] };

const validClaudeEnvelope = (innerJson: object) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, result: JSON.stringify(innerJson) });

const validRawReview = {
  verdict: "approve",
  findings: [],
  summary: "Looks good.",
};

const validRawReviewWithFinding = {
  verdict: "revise",
  findings: [{ severity: "major", category: "completeness", reviewer: "model-said-this", message: "Missing rollback." }],
  summary: "Needs work.",
};

describe("ClaudeReviewer", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns a parsed RawReview on success", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(validClaudeEnvelope(validRawReview)));
    const reviewer = new ClaudeReviewer("claude", cfg);
    const result = await reviewer.review("# Plan\ncontent", "all");
    expect(result.verdict).toBe("approve");
    expect(result.reviewer).toBe("claude");
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it("parses Claude Code 2.1.145 structured_output when result is prose", async () => {
    const envelope = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 1234,
      duration_api_ms: 1000,
      num_turns: 1,
      result: "The structured review is available in structured_output.",
      session_id: "00000000-0000-0000-0000-000000000000",
      total_cost_usd: 0.01,
      structured_output: {
        ...validRawReviewWithFinding,
        findings: [{ ...validRawReviewWithFinding.findings[0], suggested_fix: null }],
        revised_plan: null,
      },
    });
    mockSpawn.mockReturnValue(makeMockProcess(envelope));
    const reviewer = new ClaudeReviewer("my-claude", cfg);

    const result = await reviewer.review("# Plan", "all");

    expect(result).toMatchObject({
      verdict: "revise",
      summary: "Needs work.",
      reviewer: "my-claude",
    });
    expect(result.findings[0]!.reviewer).toBe("my-claude");
  });

  it("falls back to result when structured_output is null", async () => {
    const envelope = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: JSON.stringify(validRawReview),
      structured_output: null,
    });
    mockSpawn.mockReturnValue(makeMockProcess(envelope));
    const reviewer = new ClaudeReviewer("claude", cfg);

    const result = await reviewer.review("# Plan", "all");

    expect(result.verdict).toBe("approve");
    expect(result.summary).toBe("Looks good.");
  });

  it("throws ReviewerError on is_error=true", async () => {
    const envelope = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "Failed to authenticate.",
    });
    mockSpawn.mockReturnValue(makeMockProcess(envelope));
    const reviewer = new ClaudeReviewer("claude", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/authenticate/i);
  });

  it("throws ReviewerError on non-zero exit with no JSON", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("not json at all", "stderr msg", 1));
    const reviewer = new ClaudeReviewer("claude", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow();
  });

  it("throws ReviewerError when inner JSON fails schema validation", async () => {
    const badInner = { verdict: "maybe", findings: "not an array" };
    mockSpawn.mockReturnValue(makeMockProcess(validClaudeEnvelope(badInner)));
    const reviewer = new ClaudeReviewer("claude", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow();
  });

  it("normalizes findings[].reviewer to wrapper id", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(validClaudeEnvelope(validRawReviewWithFinding)));
    const reviewer = new ClaudeReviewer("my-claude", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.findings[0]!.reviewer).toBe("my-claude");
  });

  it("truncates plan at 16000 chars before sending", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(validClaudeEnvelope(validRawReview)));
    const reviewer = new ClaudeReviewer("claude", cfg);
    const longPlan = "x".repeat(20000);
    await reviewer.review(longPlan, "all").catch(() => {});
    const writeCall = (mockSpawn.mock.results[0].value.stdin.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(writeCall.includes("[...truncated]")).toBe(true);
    expect(writeCall.length).toBeLessThan(17000);
  });
});
