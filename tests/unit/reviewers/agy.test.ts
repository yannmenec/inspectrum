import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { AgyReviewer } from "../../../src/reviewers/agy.js";
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

const cfg: ReviewerConfig = { type: "cli", binary: "agy" };

const review = {
  verdict: "revise",
  findings: [
    {
      severity: "blocker",
      category: "correctness",
      // agy fabricates this field (observed: "Security"); it must be rewritten.
      reviewer: "Security",
      message: "No authentication check.",
      suggested_fix: "Require a valid session.",
    },
  ],
  summary: "Needs auth.",
};

/** Shape verified against the real CLI. */
const envelope = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    conversation_id: "abc",
    status: "SUCCESS",
    response: JSON.stringify(review),
    duration_seconds: 3.2,
    num_turns: 1,
    structured_output: review,
    usage: { total_tokens: 100 },
    ...over,
  });

const argsOf = (): string[] => mockSpawn.mock.calls[0]![1] as string[];

describe("AgyReviewer — invocation contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it("passes --output-format json", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", cfg).review("# Plan", "all");
    const args = argsOf();
    expect(args[args.indexOf("--output-format") + 1]).toBe("json");
  });

  it("constrains the output with --json-schema", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", cfg).review("# Plan", "all");
    const args = argsOf();
    const schema = args[args.indexOf("--json-schema") + 1]!;
    expect(JSON.parse(schema)).toMatchObject({ type: "object" });
    expect(schema).toContain("verdict");
    expect(schema).toContain("findings");
  });

  it("passes the prompt via -p", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", cfg).review("# Plan\nDEADBEEF", "all");
    const args = argsOf();
    expect(args[args.indexOf("-p") + 1]).toContain("DEADBEEF");
  });

  it("disables slash-command expansion so plan text is not interpreted", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", cfg).review("# Plan", "all");
    expect(argsOf()).toContain("--disable-slash-commands");
  });

  it("never passes --dangerously-skip-permissions", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", cfg).review("# Plan", "all");
    expect(argsOf()).not.toContain("--dangerously-skip-permissions");
  });

  it("truncates the plan at the 16000-char cap", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", cfg).review("x".repeat(20_000), "all");
    const args = argsOf();
    const prompt = args[args.indexOf("-p") + 1]!;
    expect(prompt).toContain("[...truncated]");
  });
});

describe("AgyReviewer — model and effort", () => {
  beforeEach(() => vi.resetAllMocks());

  it("omits --model when none is configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", { type: "cli", backend: "agy" }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--model");
  });

  it("passes --model when configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", { ...cfg, model: "some-model" }).review("# Plan", "all");
    const args = argsOf();
    expect(args[args.indexOf("--model") + 1]).toBe("some-model");
  });

  // Verified: `agy --effort high` with no model fails outright with
  // "--effort is not supported for the current model". So effort must be opt-in.
  it("omits --effort when none is configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", cfg).review("# Plan", "all");
    expect(argsOf()).not.toContain("--effort");
  });

  it("passes --effort only when explicitly configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", { ...cfg, effort: "high" }).review("# Plan", "all");
    const args = argsOf();
    expect(args[args.indexOf("--effort") + 1]).toBe("high");
  });
});

describe("AgyReviewer — envelope parsing", () => {
  beforeEach(() => vi.resetAllMocks());

  it("prefers structured_output over response", async () => {
    // response carries a DIFFERENT verdict; structured_output must win.
    const out = envelope({ response: JSON.stringify({ ...review, verdict: "approve" }) });
    mockSpawn.mockReturnValue(makeMockProcess(out));
    const result = await new AgyReviewer("agy", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("falls back to parsing the response string when structured_output is absent", async () => {
    const out = envelope({ structured_output: undefined });
    mockSpawn.mockReturnValue(makeMockProcess(out));
    const result = await new AgyReviewer("agy", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  // Observed for real: without --json-schema agy wraps its answer in a fence.
  it("strips a markdown fence from the response fallback", async () => {
    const out = envelope({
      structured_output: undefined,
      response: "```json\n" + JSON.stringify(review) + "\n```",
    });
    mockSpawn.mockReturnValue(makeMockProcess(out));
    const result = await new AgyReviewer("agy", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("rewrites the fabricated reviewer field with the real reviewer id", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    const result = await new AgyReviewer("my-agy", cfg).review("# Plan", "all");
    expect(result.reviewer).toBe("my-agy");
    expect(result.findings[0]!.reviewer).toBe("my-agy");
  });

  it("throws when status is not SUCCESS", async () => {
    const out = envelope({ status: "ERROR", error: "invalid model selection", structured_output: undefined, response: "" });
    mockSpawn.mockReturnValue(makeMockProcess(out));
    await expect(new AgyReviewer("agy", cfg).review("# Plan", "all")).rejects.toThrow(/invalid model selection/i);
  });

  it("reports the agy error message when status is ERROR", async () => {
    const out = envelope({ status: "ERROR", error: "--effort is not supported", structured_output: undefined, response: "" });
    mockSpawn.mockReturnValue(makeMockProcess(out));
    await expect(new AgyReviewer("agy", cfg).review("# Plan", "all")).rejects.toThrow(/effort is not supported/i);
  });

  it("throws when the envelope itself is not JSON", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("not json at all"));
    await expect(new AgyReviewer("agy", cfg).review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("throws when the envelope lacks the expected shape", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify({ unexpected: true })));
    await expect(new AgyReviewer("agy", cfg).review("# Plan", "all")).rejects.toThrow(/envelope/i);
  });

  it("throws when the inner payload fails schema validation", async () => {
    const out = envelope({ structured_output: { verdict: "maybe", findings: [] } });
    mockSpawn.mockReturnValue(makeMockProcess(out));
    await expect(new AgyReviewer("agy", cfg).review("# Plan", "all")).rejects.toThrow(/schema validation/i);
  });

  it("throws on a non-zero exit code", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("", 1));
    await expect(new AgyReviewer("agy", cfg).review("# Plan", "all")).rejects.toThrow(/exited with code 1/i);
  });
});

describe("AgyReviewer — reserved flags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps non-reserved user args", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", { ...cfg, args: ["--new-project"] }).review("# Plan", "all");
    expect(argsOf()).toContain("--new-project");
  });

  it("drops a user-supplied --dangerously-skip-permissions", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", { ...cfg, args: ["--dangerously-skip-permissions"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--dangerously-skip-permissions");
  });

  it("drops a user-supplied --output-format so the envelope stays parseable", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", { ...cfg, args: ["--output-format", "text"] }).review("# Plan", "all");
    const args = argsOf();
    expect(args.filter((a) => a === "--output-format")).toHaveLength(1);
    expect(args).not.toContain("text");
  });

  it("drops a user-supplied --json-schema", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new AgyReviewer("agy", { ...cfg, args: ["--json-schema", "{}"] }).review("# Plan", "all");
    expect(argsOf().filter((a) => a === "--json-schema")).toHaveLength(1);
  });
});
