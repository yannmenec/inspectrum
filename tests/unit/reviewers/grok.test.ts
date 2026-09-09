import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    mkdtempSync: vi.fn(() => "/tmp/inspectrum-grok-test"),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { GrokReviewer } from "../../../src/reviewers/grok.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const mockSpawn = vi.mocked(childProcess.spawn);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
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

const cfg: ReviewerConfig = { type: "cli", binary: "grok" };

const review = {
  verdict: "revise",
  findings: [
    {
      severity: "blocker",
      category: "completeness",
      reviewer: "grok",
      message: "No authentication specified.",
      suggested_fix: "Require a session.",
    },
  ],
  summary: "Needs work.",
};

/** Shape verified against the real CLI (camelCase, unlike claude/agy). */
const envelope = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    text: JSON.stringify(review),
    stopReason: "end_turn",
    sessionId: "s1",
    requestId: "r1",
    usage: { total_tokens: 100 },
    num_turns: 1,
    structuredOutput: review,
    ...over,
  });

const argsOf = (): string[] => mockSpawn.mock.calls[0]![1] as string[];
const promptFileContent = (): string => mockWriteFileSync.mock.calls[0]![1] as string;

describe("GrokReviewer — confinement", () => {
  beforeEach(() => vi.resetAllMocks());

  // Three mechanisms were tested against the real CLI:
  //   --sandbox read-only          -> did NOT block a write to /tmp
  //   --disallowed-tools <names>   -> ignored; grok still answered "yes" when asked
  //                                   whether run_terminal_command was available
  //   --tools read_file,grep,list_dir -> DID block it ("I don't have a local shell
  //                                   tool in this session"), even with 8 turns.
  // Only the allow-list actually confines, so that is what we pin.
  it("pins a read-only --tools allow-list", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("# Plan", "all");
    const args = argsOf();
    const tools = args[args.indexOf("--tools") + 1]!;
    expect(tools).not.toContain("run_terminal_command");
    expect(tools).not.toContain("write");
    expect(tools).toContain("read_file");
  });

  it("never passes --sandbox (verified not to block writes)", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("# Plan", "all");
    expect(argsOf()).not.toContain("--sandbox");
  });

  it("bounds the run with --max-turns", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("# Plan", "all");
    expect(argsOf()).toContain("--max-turns");
  });

  it("disables web search so plan text cannot drive outbound requests", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("# Plan", "all");
    expect(argsOf()).toContain("--disable-web-search");
  });

  it("disables subagents", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("# Plan", "all");
    expect(argsOf()).toContain("--no-subagents");
  });

  it("never passes --always-approve or bypassPermissions", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("# Plan", "all");
    const joined = argsOf().join(" ");
    expect(joined).not.toContain("--always-approve");
    expect(joined).not.toContain("bypassPermissions");
  });
});

describe("GrokReviewer — invocation contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it("constrains output with --json-schema", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("# Plan", "all");
    const args = argsOf();
    const schema = args[args.indexOf("--json-schema") + 1]!;
    expect(JSON.parse(schema)).toMatchObject({ type: "object" });
  });

  it("passes the prompt via --prompt-file, not argv", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("# Plan\nsecret content", "all");
    const args = argsOf();
    expect(args[args.indexOf("--prompt-file") + 1]).toContain("inspectrum-grok");
    expect(args.join(" ")).not.toContain("secret content");
  });

  it("writes the prompt file with owner-only permissions", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("# Plan", "all");
    expect(mockWriteFileSync.mock.calls[0]![2]).toMatchObject({ mode: 0o600 });
  });

  it("does not write the prompt to stdin", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("# Plan", "all");
    const stdin = mockSpawn.mock.results[0]!.value.stdin as { write: ReturnType<typeof vi.fn> };
    expect(stdin.write).not.toHaveBeenCalled();
  });

  it("truncates the plan at the 16000-char cap", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", cfg).review("x".repeat(20_000), "all");
    expect(promptFileContent()).toContain("[...truncated]");
  });

  it("cleans up the temp directory even when the run fails", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("", 1));
    await expect(new GrokReviewer("grok", cfg).review("# Plan", "all")).rejects.toThrow();
    expect(mockRmSync).toHaveBeenCalled();
  });

  it("passes -m when a model is configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", { ...cfg, model: "grok-4.6-build" }).review("# Plan", "all");
    const args = argsOf();
    expect(args[args.indexOf("-m") + 1]).toBe("grok-4.6-build");
  });

  it("omits -m when no model is configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", { type: "cli", backend: "grok" }).review("# Plan", "all");
    expect(argsOf()).not.toContain("-m");
  });

  it("passes --effort only when configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", { ...cfg, effort: "high" }).review("# Plan", "all");
    expect(argsOf()[argsOf().indexOf("--effort") + 1]).toBe("high");
  });
});

describe("GrokReviewer — envelope parsing", () => {
  beforeEach(() => vi.resetAllMocks());

  it("prefers structuredOutput (camelCase) over text", async () => {
    const out = envelope({ text: JSON.stringify({ ...review, verdict: "approve" }) });
    mockSpawn.mockReturnValue(makeMockProcess(out));
    const result = await new GrokReviewer("grok", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("falls back to the text field when structuredOutput is absent", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope({ structuredOutput: undefined })));
    const result = await new GrokReviewer("grok", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("stamps the reviewer id onto the result and every finding", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    const result = await new GrokReviewer("my-grok", cfg).review("# Plan", "all");
    expect(result.reviewer).toBe("my-grok");
    expect(result.findings[0]!.reviewer).toBe("my-grok");
  });

  // Verified: a failing grok run prints {"type":"error","message":"..."} — e.g.
  // the HTTP 402 "usage balance exhausted" seen before the account was topped up.
  it("surfaces a {type:error} payload as an operational error", async () => {
    const out = JSON.stringify({ type: "error", message: "API error (status 402): balance exhausted" });
    mockSpawn.mockReturnValue(makeMockProcess(out));
    await expect(new GrokReviewer("grok", cfg).review("# Plan", "all")).rejects.toThrow(/balance exhausted/i);
  });

  // A valid structuredOutput means the schema was satisfied, so a truncated
  // trailing thought must not discard an otherwise complete review.
  it("accepts a valid structuredOutput even when stopReason is not end_turn", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope({ stopReason: "max_tokens" })));
    const result = await new GrokReviewer("grok", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("rejects a failing stopReason when there is no structuredOutput", async () => {
    const out = envelope({ structuredOutput: undefined, stopReason: "refusal", text: "" });
    mockSpawn.mockReturnValue(makeMockProcess(out));
    await expect(new GrokReviewer("grok", cfg).review("# Plan", "all")).rejects.toThrow(/refusal/i);
  });

  it("throws when the envelope is not JSON", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("not json"));
    await expect(new GrokReviewer("grok", cfg).review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("throws when the inner payload fails schema validation", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope({ structuredOutput: { verdict: "maybe", findings: [] } })));
    await expect(new GrokReviewer("grok", cfg).review("# Plan", "all")).rejects.toThrow(/schema validation/i);
  });
});

describe("GrokReviewer — reserved flags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps non-reserved user args", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", { ...cfg, args: ["--minimal"] }).review("# Plan", "all");
    expect(argsOf()).toContain("--minimal");
  });

  it("drops a user-supplied --tools so the allow-list stays authoritative", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", { ...cfg, args: ["--tools", "run_terminal_command"] }).review("# Plan", "all");
    const args = argsOf();
    expect(args.filter((a) => a === "--tools")).toHaveLength(1);
    expect(args[args.indexOf("--tools") + 1]).not.toContain("run_terminal_command");
  });

  it("drops a user-supplied --always-approve", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", { ...cfg, args: ["--always-approve"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--always-approve");
  });

  it("drops a user-supplied --permission-mode", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", { ...cfg, args: ["--permission-mode", "bypassPermissions"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("bypassPermissions");
  });

  it("drops a user-supplied --output-format", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(envelope()));
    await new GrokReviewer("grok", { ...cfg, args: ["--output-format", "plain"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("plain");
  });
});
