import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    mkdtempSync: vi.fn(() => "/tmp/inspectrum-opencode-private"),
    rmSync: vi.fn(),
  };
});

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { OpencodeReviewer } from "../../../src/reviewers/opencode.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const mockSpawn = vi.mocked(childProcess.spawn);
const mockRmSync = vi.mocked(fs.rmSync);

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

const cfg: ReviewerConfig = { type: "cli", binary: "opencode" };

const validRawReview = {
  verdict: "reject",
  findings: [
    {
      severity: "blocker",
      category: "correctness",
      reviewer: "SHOULD-BE-OVERWRITTEN",
      message: "No authentication on the delete endpoint.",
      suggested_fix: "Require an authenticated session.",
    },
  ],
  summary: "Unsafe as written.",
};

const argsOf = (): string[] => mockSpawn.mock.calls[0]![1] as string[];
const stdinOf = (): string =>
  (mockSpawn.mock.results[0]!.value.stdin.write as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;

describe("OpencodeReviewer — invocation contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it("invokes the run subcommand", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan", "all");
    expect(argsOf()[0]).toBe("run");
  });

  // Verified against the real CLI: `opencode run` with the default `build` agent
  // executed a shell command and created /tmp/opencode-should-not-exist.txt. The
  // `summary` agent's permission set ends in {"permission":"*","action":"deny"},
  // which blocked the same prompt while still returning a valid review.
  it("pins --agent summary so an untrusted plan cannot run tools", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan", "all");
    const args = argsOf();
    expect(args[args.indexOf("--agent") + 1]).toBe("summary");
  });

  it("never passes --format (its json mode is an event stream, not our object)", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan", "all");
    expect(argsOf()).not.toContain("--format");
  });

  it("never passes --auto (it broadens permissions)", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan", "all");
    expect(argsOf()).not.toContain("--auto");
  });
});

describe("OpencodeReviewer — prompt delivery", () => {
  beforeEach(() => vi.resetAllMocks());

  // Verified: opencode reads the prompt from stdin. Using stdin keeps the plan out
  // of argv (`ps aux`) and sidesteps ARG_MAX for large plans.
  it("sends the prompt on stdin, not argv", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan\nsecret content", "all");
    expect(stdinOf()).toContain("secret content");
    expect(argsOf().join(" ")).not.toContain("secret content");
  });

  it("includes the system prompt and JSON instruction on stdin", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan", "all");
    const sent = stdinOf();
    expect(sent).toContain("reviewer");
    expect(sent).toContain("JSON");
  });

  it("truncates the plan at the 16000-char cap", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("x".repeat(20_000), "all");
    const sent = stdinOf();
    expect(sent).toContain("[...truncated]");
    const planSegment = sent.slice(sent.indexOf("PLAN TO REVIEW:"));
    expect(planSegment.length).toBeLessThanOrEqual(16_100);
  });

  it("passes the focus through to the reviewer message", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan", "risk");
    expect(stdinOf()).toContain("risk");
  });

  it("includes optional context when supplied", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan", "all", "CONTEXT-MARKER");
    expect(stdinOf()).toContain("CONTEXT-MARKER");
  });
});

describe("OpencodeReviewer — model and effort", () => {
  beforeEach(() => vi.resetAllMocks());

  it("omits -m when no model is configured (opencode uses its own default)", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", { type: "cli", backend: "opencode" }).review("# Plan", "all");
    expect(argsOf()).not.toContain("-m");
  });

  it("passes -m with the provider/model form when configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", { ...cfg, model: "google/gemini-2.5-flash" }).review("# Plan", "all");
    const args = argsOf();
    expect(args[args.indexOf("-m") + 1]).toBe("google/gemini-2.5-flash");
  });

  it("omits --variant when no effort is configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan", "all");
    expect(argsOf()).not.toContain("--variant");
  });

  it("maps effort onto --variant when configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", { ...cfg, effort: "high" }).review("# Plan", "all");
    const args = argsOf();
    expect(args[args.indexOf("--variant") + 1]).toBe("high");
  });
});

describe("OpencodeReviewer — user args and reserved flags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps non-reserved user args", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", { ...cfg, args: ["--pure"] }).review("# Plan", "all");
    expect(argsOf()).toContain("--pure");
  });

  it("drops a user-supplied --agent so the confined agent stays authoritative", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", { ...cfg, args: ["--agent", "build"] }).review("# Plan", "all");
    const args = argsOf();
    expect(args).not.toContain("build");
    expect(args.filter((a) => a === "--agent")).toHaveLength(1);
  });

  it("drops a user-supplied --auto", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", { ...cfg, args: ["--auto"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--auto");
  });

  it("drops a user-supplied --format so the event stream cannot be reintroduced", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", { ...cfg, args: ["--format", "json"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--format");
  });

  it("drops a user-supplied --continue that would resume an unrelated session", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", { ...cfg, args: ["--continue"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--continue");
  });
});

describe("OpencodeReviewer — output parsing", () => {
  beforeEach(() => vi.resetAllMocks());

  it("parses bare JSON on stdout", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const result = await new OpencodeReviewer("opencode", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("reject");
    expect(result.findings).toHaveLength(1);
  });

  it("stamps the reviewer id onto the result and every finding", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const result = await new OpencodeReviewer("my-oc", cfg).review("# Plan", "all");
    expect(result.reviewer).toBe("my-oc");
    expect(result.findings[0]!.reviewer).toBe("my-oc");
  });

  it("strips a complete markdown code fence", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("```json\n" + JSON.stringify(validRawReview) + "\n```"));
    const result = await new OpencodeReviewer("opencode", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("reject");
  });

  // The `title` agent answered a review prompt with a plain sentence. Prose must
  // fail loudly rather than produce a fabricated verdict.
  it("rejects prose output instead of inventing a verdict", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("Prompt injection bash write attempt"));
    await expect(new OpencodeReviewer("opencode", cfg).review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("throws on a non-zero exit code", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("", 1));
    await expect(new OpencodeReviewer("opencode", cfg).review("# Plan", "all")).rejects.toThrow(/exited with code 1/i);
  });

  it("throws when stdout fails schema validation", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify({ verdict: "maybe", findings: [] })));
    await expect(new OpencodeReviewer("opencode", cfg).review("# Plan", "all")).rejects.toThrow(/schema validation/i);
  });
});

describe("OpencodeReviewer — cwd isolation", () => {
  beforeEach(() => vi.resetAllMocks());

  // Regression (review): opencode spawned with no cwd, so the child inherited
  // the MCP host's working directory — in practice the user's own repo. The
  // `summary` agent denies tool use, but the child must not start out inside
  // real code on the off-chance a permission ever slips through.
  it("spawns opencode in a throwaway temp directory, never the host cwd", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan", "all");
    const spawnOptions = mockSpawn.mock.calls[0]![2];
    expect(spawnOptions).toMatchObject({ cwd: "/tmp/inspectrum-opencode-private" });
    expect(spawnOptions?.cwd).not.toBe(process.cwd());
  });

  it("removes the temp directory after a successful run", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new OpencodeReviewer("opencode", cfg).review("# Plan", "all");
    expect(mockRmSync).toHaveBeenCalledWith("/tmp/inspectrum-opencode-private", { recursive: true, force: true });
  });

  it("removes the temp directory when the reviewer fails", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("", 1));
    await expect(new OpencodeReviewer("opencode", cfg).review("# Plan", "all")).rejects.toThrow(/exited with code 1/i);
    expect(mockRmSync).toHaveBeenCalledWith("/tmp/inspectrum-opencode-private", { recursive: true, force: true });
  });
});
