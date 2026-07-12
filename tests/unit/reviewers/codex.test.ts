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

  it("omits -m flag when no model is configured", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const minimalCfg: ReviewerConfig = { type: "cli" };
    const reviewer = new CodexReviewer("codex", minimalCfg);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).not.toContain("-m");
  });

  it("always passes --skip-git-repo-check", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const minimalCfg: ReviewerConfig = { type: "cli" };
    await new CodexReviewer("codex", minimalCfg).review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).toContain("--skip-git-repo-check");
  });

  it("strips user-supplied sandbox, approval, hook-trust, and cwd overrides", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const maliciousCfg: ReviewerConfig = {
      type: "cli",
      args: [
        "--dangerously-bypass-approvals-and-sandbox",
        "--dangerously-bypass-approvals-and-sandbox=true",
        "--dangerously-bypass-hook-trust",
        "--dangerously-bypass-hook-trust=true",
        "-a",
        "never",
        "--ask-for-approval=never",
        "-C",
        process.cwd(),
        `--cd=${process.cwd()}`,
      ],
    };
    await new CodexReviewer("codex", maliciousCfg).review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox=true");
    expect(args).not.toContain("--dangerously-bypass-hook-trust");
    expect(args).not.toContain("--dangerously-bypass-hook-trust=true");
    expect(args).not.toContain("-a");
    expect(args).not.toContain("--ask-for-approval=never");
    expect(args).not.toContain("-C");
    expect(args).not.toContain(`--cd=${process.cwd()}`);
  });

  it("spawns codex in its private temp directory", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    await new CodexReviewer("codex", cfg).review("# Plan", "all");
    const spawnOptions = mockSpawn.mock.calls[0]![2];
    expect(spawnOptions).toMatchObject({ cwd: "/tmp/inspectrum-codex-private" });
    expect(spawnOptions?.cwd).not.toBe(process.cwd());
  });

  it("passes -m when config.model is set, even without args", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const cfgWithOnlyModel: ReviewerConfig = { type: "cli", model: "gpt-5" };
    await new CodexReviewer("codex", cfgWithOnlyModel).review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const mIdx = args.indexOf("-m");
    expect(mIdx).toBeGreaterThanOrEqual(0);
    expect(args[mIdx + 1]).toBe("gpt-5");
  });

  it("honors inline --model=<value> in config.args", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const cfgInline: ReviewerConfig = { type: "cli", args: ["--model=gpt-5"] };
    await new CodexReviewer("codex", cfgInline).review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const mIdx = args.indexOf("-m");
    expect(mIdx).toBeGreaterThanOrEqual(0);
    expect(args[mIdx + 1]).toBe("gpt-5");
  });

  it("writes a JSON schema satisfying OpenAI strict mode at every object level", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    await new CodexReviewer("codex", cfg).review("# Plan", "all");
    const schemaWritten = vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string;
    const parsed = JSON.parse(schemaWritten) as Record<string, unknown>;

    const visit = (node: unknown, path: string): void => {
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (obj["type"] === "object") {
        expect(obj["additionalProperties"], `${path}: additionalProperties must be false`).toBe(false);
        const props = obj["properties"] as Record<string, unknown> | undefined;
        const required = obj["required"] as string[] | undefined;
        expect(required, `${path}: required[] must exist`).toBeDefined();
        expect(new Set(required), `${path}: required[] must cover every key in properties`)
          .toEqual(new Set(Object.keys(props ?? {})));
      }
      for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
    };
    visit(parsed, "$");

    const nullable = ["string", "null"];
    const props = parsed["properties"] as Record<string, Record<string, unknown>>;
    expect(props["summary"]!["type"]).toEqual(nullable);
    expect(props["revised_plan"]!["type"]).toEqual(nullable);
    const findings = props["findings"] as { items: { properties: Record<string, Record<string, unknown>> } };
    expect(findings.items.properties["suggested_fix"]!["type"]).toEqual(nullable);
  });

  it("strips null optional fields from a strict-mode codex response", async () => {
    const strict = {
      verdict: "approve",
      findings: [{ severity: "minor", category: "clarity", reviewer: "codex", message: "ok", suggested_fix: null }],
      revised_plan: null,
      summary: null,
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(strict) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const result = await new CodexReviewer("codex", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("approve");
    expect(result.summary).toBeUndefined();
    expect(result.revised_plan).toBeUndefined();
    expect(result.findings[0]!.suggested_fix).toBeUndefined();
    expect(result.summary).not.toBeNull();
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
      args: ["--full-auto", "--skip-git-repo-check", "-m", "ignored-model"],
    };
    const reviewer = new CodexReviewer("codex", cfgWithArgs);
    await reviewer.review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).toContain("--full-auto");
    expect(args.filter((a) => a === "-m")).toHaveLength(1);
    expect(args).not.toContain("ignored-model");
    expect(args.filter((a) => a === "--skip-git-repo-check")).toHaveLength(1);
    // Positional system prompt must stay last
    expect(args[args.length - 1]).toContain("reviewer");
  });

  it("always passes -s read-only", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    await new CodexReviewer("codex", { type: "cli" }).review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const sIdx = args.indexOf("-s");
    expect(sIdx).toBeGreaterThanOrEqual(0);
    expect(args[sIdx + 1]).toBe("read-only");
  });

  it("strips a user-provided sandbox flag so read-only stays authoritative", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const cfgSandbox: ReviewerConfig = { type: "cli", args: ["--sandbox", "danger-full-access"] };
    await new CodexReviewer("codex", cfgSandbox).review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).not.toContain("--sandbox");
    expect(args).not.toContain("danger-full-access");
    expect(args[args.indexOf("-s") + 1]).toBe("read-only");
  });

  it("passes -c model_reasoning_effort=<effort> when effort is configured", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const cfgEffort: ReviewerConfig = { type: "cli", effort: "high" };
    await new CodexReviewer("codex", cfgEffort).review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const cIdx = args.indexOf("-c");
    expect(cIdx).toBeGreaterThanOrEqual(0);
    expect(args[cIdx + 1]).toBe("model_reasoning_effort=high");
  });

  it("passes unrecognized effort values through verbatim (no enum)", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    const cfgEffort: ReviewerConfig = { type: "cli", effort: "ultra" };
    await new CodexReviewer("codex", cfgEffort).review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args[args.indexOf("-c") + 1]).toBe("model_reasoning_effort=ultra");
  });

  it("omits -c model_reasoning_effort when effort is unset", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validRawReview) as never);
    mockSpawn.mockReturnValue(makeMockProcess(0));
    await new CodexReviewer("codex", { type: "cli" }).review("# Plan", "all");
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args.some((a) => a.startsWith("model_reasoning_effort="))).toBe(false);
  });
});
