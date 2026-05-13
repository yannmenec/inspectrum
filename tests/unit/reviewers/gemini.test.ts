import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { GeminiReviewer } from "../../../src/reviewers/gemini.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const mockSpawn = vi.mocked(childProcess.spawn);

function makeMockProcess(stdout: string, exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as never;
  proc.stderr = new EventEmitter() as never;
  proc.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as never;
  proc.kill = vi.fn() as never;
  setTimeout(() => {
    (proc.stdout as EventEmitter).emit("data", Buffer.from(stdout));
    (proc.stderr as EventEmitter).emit("data", Buffer.from(""));
    proc.emit("close", exitCode);
  }, 0);
  return proc;
}

function makeNeverClosingProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as never;
  proc.stderr = new EventEmitter() as never;
  proc.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as never;
  proc.kill = vi.fn() as never;
  return proc;
}

const cfg: ReviewerConfig = { type: "cli", binary: "gemini", model: "gemini-2.5-pro" };

const validRawReview = {
  verdict: "revise",
  findings: [
    {
      severity: "major",
      category: "completeness",
      reviewer: "gemini",
      message: "Missing rollback plan.",
    },
  ],
  summary: "Needs rollback.",
};

describe("GeminiReviewer", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns a parsed RawReview on success", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const reviewer = new GeminiReviewer("gemini", cfg);
    const result = await reviewer.review("# Plan\ncontent", "all");
    expect(result.verdict).toBe("revise");
    expect(result.reviewer).toBe("gemini");
    expect(result.findings).toHaveLength(1);
  });

  it("strips markdown code fences before parsing JSON", async () => {
    const fenced = "```json\n" + JSON.stringify(validRawReview) + "\n```";
    mockSpawn.mockReturnValue(makeMockProcess(fenced));
    const reviewer = new GeminiReviewer("gemini", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("strips uppercase JSON code fences before parsing JSON", async () => {
    const fenced = "  ```JSON\n" + JSON.stringify(validRawReview) + "\n```  ";
    mockSpawn.mockReturnValue(makeMockProcess(fenced));
    const reviewer = new GeminiReviewer("gemini", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("rejects prose wrapped around a JSON code fence", async () => {
    const fenced = "Here is the review:\n```json\n" + JSON.stringify(validRawReview) + "\n```";
    mockSpawn.mockReturnValue(makeMockProcess(fenced));
    const reviewer = new GeminiReviewer("gemini", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("strips plain code fences (no language tag)", async () => {
    const fenced = "```\n" + JSON.stringify(validRawReview) + "\n```";
    mockSpawn.mockReturnValue(makeMockProcess(fenced));
    const reviewer = new GeminiReviewer("gemini", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("throws on non-zero exit code", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("", 1));
    const reviewer = new GeminiReviewer("gemini", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/exited with code 1/i);
  });

  it("throws on non-JSON stdout output", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("not valid json at all"));
    const reviewer = new GeminiReviewer("gemini", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("throws on stdout JSON failing Zod schema validation", async () => {
    mockSpawn.mockReturnValue(
      makeMockProcess(JSON.stringify({ verdict: "maybe", findings: "not an array" })),
    );
    const reviewer = new GeminiReviewer("gemini", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/schema validation/i);
  });

  it("truncates plan at 16000 chars before sending via stdin", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const reviewer = new GeminiReviewer("gemini", cfg);
    const longPlan = "x".repeat(20_000);
    await reviewer.review(longPlan, "all");
    const writeCall = (
      mockSpawn.mock.results[0]!.value.stdin.write as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0] as string;
    expect(writeCall).toContain("[...truncated]");
    expect(writeCall.length).toBeLessThan(17_000);
  });

  it("passes -m flag with model from config.model", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const reviewer = new GeminiReviewer("gemini", cfg);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const mIdx = args.indexOf("-m");
    expect(mIdx).toBeGreaterThanOrEqual(0);
    expect(args[mIdx + 1]).toBe("gemini-2.5-pro");
  });

  it("passes -p flag with system prompt", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const reviewer = new GeminiReviewer("gemini", cfg);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const pIdx = args.indexOf("-p");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(args[pIdx + 1]).toContain("reviewer");
  });

  it("rejects with 'failed to start' when spawn emits error event", async () => {
    const proc = new EventEmitter() as ChildProcess;
    proc.stdout = new EventEmitter() as never;
    proc.stderr = new EventEmitter() as never;
    proc.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as never;
    proc.kill = vi.fn() as never;
    setTimeout(() => proc.emit("error", new Error("spawn ENOENT")), 0);
    mockSpawn.mockReturnValue(proc);
    const reviewer = new GeminiReviewer("gemini", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/failed to start/i);
  });

  it("rejects on timeout", async () => {
    mockSpawn.mockReturnValue(makeNeverClosingProcess());
    const reviewer = new GeminiReviewer("gemini", cfg, 50);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/timed out/i);
  }, 2000);

  it("normalizes top-level reviewer field to wrapper id", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const reviewer = new GeminiReviewer("my-gemini", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.reviewer).toBe("my-gemini");
  });

  it("normalizes findings[].reviewer to wrapper id", async () => {
    const reviewWithWrongId = {
      ...validRawReview,
      findings: [{ ...validRawReview.findings[0]!, reviewer: "model-said-this" }],
    };
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(reviewWithWrongId)));
    const reviewer = new GeminiReviewer("my-gemini", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.findings[0]!.reviewer).toBe("my-gemini");
  });

  it("extracts model from config.args when config.model is absent", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const cfgWithArgs: ReviewerConfig = { type: "cli", binary: "gemini", args: ["-m", "gemini-2.0-flash"] };
    const reviewer = new GeminiReviewer("gemini", cfgWithArgs);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const mIdx = args.indexOf("-m");
    expect(args[mIdx + 1]).toBe("gemini-2.0-flash");
  });

  it("falls back to default model when no model in config", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const minimalCfg: ReviewerConfig = { type: "cli" };
    const reviewer = new GeminiReviewer("gemini", minimalCfg);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const mIdx = args.indexOf("-m");
    expect(args[mIdx + 1]).toBe("gemini-2.5-pro");
  });

  it("includes context in the stdin message when provided", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const reviewer = new GeminiReviewer("gemini", cfg);
    await reviewer.review("# Plan", "all", "some codebase context");
    const writeCall = (
      mockSpawn.mock.results[0]!.value.stdin.write as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0] as string;
    expect(writeCall).toContain("CODEBASE CONTEXT:");
    expect(writeCall).toContain("some codebase context");
  });
});
