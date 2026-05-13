import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");
vi.mock("node:fs");

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { CodexReviewer } from "../../../src/reviewers/codex.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const mockSpawn = vi.mocked(childProcess.spawn);

function makeMockProcess(exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as never;
  proc.stderr = new EventEmitter() as never;
  proc.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as never;
  proc.kill = vi.fn() as never;
  setTimeout(() => {
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

const cfg: ReviewerConfig = { type: "cli", binary: "codex", args: ["exec", "--ephemeral", "-m", "gpt-5"] };

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

describe("CodexReviewer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.mkdtempSync).mockReturnValue("/tmp/inspectrum-codex-private" as never);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.rmSync).mockImplementation(() => undefined);
  });

  it("returns a parsed RawReview on success", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("codex", cfg);
    const result = await reviewer.review("# Plan\ncontent", "all");
    expect(result.verdict).toBe("approve");
    expect(result.reviewer).toBe("codex");
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it("throws on non-zero exit code", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(1));
    const reviewer = new CodexReviewer("codex", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/exited with code 1/i);
    expect(vi.mocked(fs.readFileSync)).not.toHaveBeenCalled();
  });

  it("throws on non-JSON output file content", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("not valid json" as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("codex", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("throws on output failing Zod schema validation", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ verdict: "maybe", findings: "not an array" }) as never,
    );
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("codex", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/schema validation/i);
  });

  it("truncates plan at 16000 chars before sending via stdin", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("codex", cfg);
    const longPlan = "x".repeat(20_000);
    await reviewer.review(longPlan, "all");
    const writeCall = (
      mockSpawn.mock.results[0]!.value.stdin.write as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0] as string;
    expect(writeCall).toContain("[...truncated]");
    expect(writeCall.length).toBeLessThan(17_000);
  });

  it("cleans up the private tmpdir even when output parse fails", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue("bad json" as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("codex", cfg);
    await reviewer.review("# Plan", "all").catch(() => {});
    expect(vi.mocked(fs.rmSync)).toHaveBeenCalledWith("/tmp/inspectrum-codex-private", { recursive: true, force: true });
  });

  it("cleans up the private tmpdir on exit-code error", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(2));
    const reviewer = new CodexReviewer("codex", cfg);
    await reviewer.review("# Plan", "all").catch(() => {});
    expect(vi.mocked(fs.rmSync)).toHaveBeenCalledWith("/tmp/inspectrum-codex-private", { recursive: true, force: true });
  });

  it("creates a private tmpdir and writes the JSON schema with 0600 permissions", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("codex", cfg);
    await reviewer.review("# Plan", "all");
    expect(vi.mocked(fs.mkdtempSync)).toHaveBeenCalledWith(expect.stringContaining("inspectrum-codex-"));
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      "/tmp/inspectrum-codex-private/schema.json",
      expect.any(String),
      { encoding: "utf8", mode: 0o600 },
    );
  });

  it("passes --output-schema and --output-last-message flags to spawn", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("codex", cfg);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).toContain("--output-schema");
    expect(args).toContain("--output-last-message");
  });

  it("passes -m model extracted from config.args", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("codex", cfg);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const mIdx = args.indexOf("-m");
    expect(mIdx).toBeGreaterThanOrEqual(0);
    expect(args[mIdx + 1]).toBe("gpt-5");
  });

  it("prefers config.model over config.args -m value", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const cfgWithModel: ReviewerConfig = { ...cfg, model: "o3" };
    const reviewer = new CodexReviewer("codex", cfgWithModel);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const mIdx = args.indexOf("-m");
    expect(args[mIdx + 1]).toBe("o3");
  });

  it("rejects with 'failed to start' when spawn emits error event", async () => {
    const proc = new EventEmitter() as ChildProcess;
    proc.stdout = new EventEmitter() as never;
    proc.stderr = new EventEmitter() as never;
    proc.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as never;
    proc.kill = vi.fn() as never;
    setTimeout(() => proc.emit("error", new Error("spawn ENOENT /no/such")), 0);
    mockSpawn.mockReturnValue(proc);
    const reviewer = new CodexReviewer("codex", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/failed to start/i);
  });

  it("rejects on timeout", async () => {
    mockSpawn.mockReturnValue(makeNeverClosingProcess());
    const reviewer = new CodexReviewer("codex", cfg, 50);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/timed out/i);
  }, 2000);

  it("normalizes top-level reviewer field to wrapper id", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("my-codex", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.reviewer).toBe("my-codex");
  });

  it("normalizes findings[].reviewer to wrapper id", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReviewWithFinding) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("my-codex", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.findings[0]!.reviewer).toBe("my-codex");
  });

  it("falls back to default model when no model in config", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const minimalCfg: ReviewerConfig = { type: "cli" };
    const reviewer = new CodexReviewer("codex", minimalCfg);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const mIdx = args.indexOf("-m");
    expect(args[mIdx + 1]).toBe("gpt-5");
  });

  it("includes context in the stdin message when provided", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const reviewer = new CodexReviewer("codex", cfg);
    await reviewer.review("# Plan", "all", "some codebase context");
    const writeCall = (
      mockSpawn.mock.results[0]!.value.stdin.write as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0] as string;
    expect(writeCall).toContain("CODEBASE CONTEXT:");
    expect(writeCall).toContain("some codebase context");
  });

  it("merges non-reserved config.args into spawn argv between flags and positional prompt", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const cfgWithArgs: ReviewerConfig = {
      type: "cli",
      backend: "codex",
      model: "gpt-5",
      args: ["--full-auto", "-m", "ignored-model"],
    };
    const reviewer = new CodexReviewer("codex", cfgWithArgs);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).toContain("--full-auto");
    expect(args.filter((a) => a === "-m")).toHaveLength(1);
    expect(args).not.toContain("ignored-model");
    // Positional system prompt must stay last
    expect(args[args.length - 1]).toContain("reviewer");
  });
});
