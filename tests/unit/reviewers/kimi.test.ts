import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { KimiReviewer } from "../../../src/reviewers/kimi.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const mockSpawn = vi.mocked(childProcess.spawn);

/**
 * kimi 0.41.0 emits JSONL under --output-format stream-json: a version meta
 * line, one assistant line carrying the answer, then a resume-hint meta line.
 * Tests wrap their payload the same way the real CLI does.
 */
const streamJson = (content: string): string =>
  [
    JSON.stringify({ role: "meta", type: "system.version", version: "0.41.0" }),
    JSON.stringify({ role: "assistant", content }),
    JSON.stringify({ role: "meta", type: "session.resume_hint", session_id: "s1" }),
  ].join("\n");

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

const cfg: ReviewerConfig = { type: "cli", backend: "kimi", model: "kimi-k2" };

const validRawReview = {
  verdict: "revise",
  findings: [
    {
      severity: "blocker",
      category: "correctness",
      reviewer: "kimi",
      message: "Missing input validation.",
    },
  ],
  summary: "Needs validation.",
};

beforeEach(() => vi.resetAllMocks());

describe("KimiReviewer", () => {
  it("returns a parsed RawReview on success", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(validRawReview))));
    const reviewer = new KimiReviewer("kimi", cfg);
    const result = await reviewer.review("# Plan\ncontent", "all");
    expect(result.verdict).toBe("revise");
    expect(result.reviewer).toBe("kimi");
    expect(result.findings).toHaveLength(1);
  });

  it("strips markdown code fences before parsing JSON", async () => {
    const fenced = "```json\n" + JSON.stringify(validRawReview) + "\n```";
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(fenced)));
    const reviewer = new KimiReviewer("kimi", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("rejects prose wrapped around a JSON code fence", async () => {
    const fenced = "Here is the review:\n```json\n" + JSON.stringify(validRawReview) + "\n```";
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(fenced)));
    const reviewer = new KimiReviewer("kimi", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("throws on non-zero exit code", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("", 1));
    const reviewer = new KimiReviewer("kimi", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/exited with code 1/i);
  });

  it("throws on non-JSON stdout output", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson("not valid json at all")));
    const reviewer = new KimiReviewer("kimi", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("throws on stdout failing Zod schema validation", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify({ verdict: "maybe", findings: "not-array" }))));
    const reviewer = new KimiReviewer("kimi", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/schema validation/i);
  });

  it("truncates plan at 16000 chars before sending in the -p prompt", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(validRawReview))));
    const reviewer = new KimiReviewer("kimi", cfg);
    const longPlan = "x".repeat(20_000);
    await reviewer.review(longPlan, "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const prompt = args[args.indexOf("-p") + 1]!;
    expect(prompt).toContain("[...truncated]");
    const planSegment = prompt.slice(prompt.indexOf("PLAN TO REVIEW:"));
    expect(planSegment.length).toBeLessThanOrEqual(16_100);
  });

  it("omits -m when no model is configured, letting kimi use its own default", async () => {
    const minimalCfg: ReviewerConfig = { type: "cli", backend: "kimi" };
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(validRawReview))));
    const reviewer = new KimiReviewer("kimi", minimalCfg);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).not.toContain("-m");
  });

  it("passes -m flag with config.model when provided", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(validRawReview))));
    const reviewer = new KimiReviewer("kimi", cfg);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const mIdx = args.indexOf("-m");
    expect(mIdx).toBeGreaterThanOrEqual(0);
    expect(args[mIdx + 1]).toBe("kimi-k2");
  });

  it("passes -p flag with system prompt containing JSON instruction", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(validRawReview))));
    const reviewer = new KimiReviewer("kimi", cfg);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const pIdx = args.indexOf("-p");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(args[pIdx + 1]).toContain("reviewer");
    expect(args[pIdx + 1]).toContain("JSON");
  });

  it("extracts model from config.args [-m model] when config.model absent", async () => {
    const cfgWithArgs: ReviewerConfig = { type: "cli", backend: "kimi", args: ["-m", "kimi-k1"] };
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(validRawReview))));
    const reviewer = new KimiReviewer("kimi", cfgWithArgs);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const mIdx = args.indexOf("-m");
    expect(args[mIdx + 1]).toBe("kimi-k1");
  });

  it("rejects with 'failed to start' when spawn emits error event", async () => {
    const proc = new EventEmitter() as ChildProcess;
    proc.stdout = new EventEmitter() as never;
    proc.stderr = new EventEmitter() as never;
    proc.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as never;
    proc.kill = vi.fn() as never;
    setTimeout(() => proc.emit("error", new Error("spawn ENOENT")), 0);
    mockSpawn.mockReturnValue(proc);
    const reviewer = new KimiReviewer("kimi", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/failed to start/i);
  });

  it("rejects on timeout", async () => {
    mockSpawn.mockReturnValue(makeNeverClosingProcess());
    const reviewer = new KimiReviewer("kimi", cfg, 50);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/timed out/i);
  }, 2000);

  it("normalizes top-level reviewer field to wrapper id", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(validRawReview))));
    const reviewer = new KimiReviewer("my-kimi", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.reviewer).toBe("my-kimi");
  });

  it("normalizes findings[].reviewer to wrapper id", async () => {
    const reviewWithWrongId = {
      ...validRawReview,
      findings: [{ ...validRawReview.findings[0]!, reviewer: "model-said-this" }],
    };
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(reviewWithWrongId))));
    const reviewer = new KimiReviewer("my-kimi", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.findings[0]!.reviewer).toBe("my-kimi");
  });

  it("includes context in the -p prompt when provided", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(validRawReview))));
    const reviewer = new KimiReviewer("kimi", cfg);
    await reviewer.review("# Plan", "all", "some codebase context");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const prompt = args[args.indexOf("-p") + 1]!;
    expect(prompt).toContain("CODEBASE CONTEXT:");
    expect(prompt).toContain("some codebase context");
  });

  it("merges non-reserved config.args into spawn argv", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(validRawReview))));
    const cfgWithArgs: ReviewerConfig = {
      type: "cli",
      backend: "kimi",
      model: "kimi-k2",
      args: ["--temperature", "0.3", "--top-p=0.9"],
    };
    const reviewer = new KimiReviewer("kimi", cfgWithArgs);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).toContain("--temperature");
    expect(args[args.indexOf("--temperature") + 1]).toBe("0.3");
    expect(args).toContain("--top-p=0.9");
    expect(args.filter((a) => a === "-m")).toHaveLength(1);
    expect(args.filter((a) => a === "-p")).toHaveLength(1);
  });
});
