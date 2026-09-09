import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { KimiReviewer } from "../../../src/reviewers/kimi.js";
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

const cfg: ReviewerConfig = { type: "cli", binary: "kimi" };

const review = {
  verdict: "revise",
  findings: [
    {
      severity: "major",
      category: "risk",
      reviewer: "kimi",
      message: "No rollback.",
      suggested_fix: "Add one.",
    },
  ],
  summary: "Needs a rollback.",
};

/** Verified real output: 3 JSONL lines, the review on the single assistant line. */
const streamJson = (content: string): string =>
  [
    JSON.stringify({ role: "meta", type: "system.version", version: "0.41.0" }),
    JSON.stringify({ role: "assistant", content }),
    JSON.stringify({ role: "meta", type: "session.resume_hint", session_id: "s1" }),
  ].join("\n");

const argsOf = (): string[] => mockSpawn.mock.calls[0]![1] as string[];

/**
 * Regression: the kimi adapter carried an `// ASSUMPTION:` comment stating its
 * flags were guessed. Probing the real CLI showed the guess was wrong on the two
 * points that matter.
 *
 * 1. kimi does NOT read stdin. The old invocation passed the system prompt to -p
 *    and relied on stdin for the plan, so the plan never reached the model: asked
 *    to echo a secret word supplied only on stdin, kimi answered "NOSTDIN" and
 *    explained it had received no input. Reviews were being returned for a plan
 *    the model had never seen.
 * 2. Default text output is prefixed with "• " (U+2022 + space), which is neither
 *    bare JSON nor a complete markdown fence, so stripJsonPayload could not
 *    recover it. --output-format stream-json yields clean JSONL instead.
 */
describe("kimi regression: the plan never reached the model via stdin", () => {
  beforeEach(() => vi.resetAllMocks());

  it("puts the plan in the -p prompt, because kimi ignores stdin", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(review))));
    await new KimiReviewer("kimi", cfg).review("# Plan\nDEADBEEF", "all");
    const args = argsOf();
    const prompt = args[args.indexOf("-p") + 1]!;
    expect(prompt).toContain("DEADBEEF");
  });

  it("keeps the system prompt in the same -p argument", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(review))));
    await new KimiReviewer("kimi", cfg).review("# Plan", "all");
    const args = argsOf();
    const prompt = args[args.indexOf("-p") + 1]!;
    expect(prompt).toContain("reviewer");
    expect(prompt).toContain("JSON");
  });

  it("does not rely on stdin for the plan", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(review))));
    await new KimiReviewer("kimi", cfg).review("# Plan\nDEADBEEF", "all");
    const stdin = mockSpawn.mock.results[0]!.value.stdin as { write: ReturnType<typeof vi.fn> };
    const written = stdin.write.mock.calls.map((c) => String(c[0])).join("");
    expect(written).not.toContain("DEADBEEF");
  });
});

describe("kimi regression: the bullet prefix broke JSON parsing", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requests --output-format stream-json", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(review))));
    await new KimiReviewer("kimi", cfg).review("# Plan", "all");
    const args = argsOf();
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
  });

  it("parses the review out of the assistant line", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(review))));
    const result = await new KimiReviewer("kimi", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("revise");
    expect(result.findings).toHaveLength(1);
  });

  it("ignores the surrounding meta lines", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(review))));
    const result = await new KimiReviewer("kimi", cfg).review("# Plan", "all");
    expect(result.summary).toBe("Needs a rollback.");
  });

  it("stamps the reviewer id onto the result and every finding", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify(review))));
    const result = await new KimiReviewer("my-kimi", cfg).review("# Plan", "all");
    expect(result.reviewer).toBe("my-kimi");
    expect(result.findings[0]!.reviewer).toBe("my-kimi");
  });

  it("strips a markdown fence inside the assistant content", async () => {
    const fenced = "```json\n" + JSON.stringify(review) + "\n```";
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(fenced)));
    const result = await new KimiReviewer("kimi", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("throws when the stream contains no assistant line", async () => {
    const onlyMeta = JSON.stringify({ role: "meta", type: "system.version" });
    mockSpawn.mockReturnValue(makeMockProcess(onlyMeta));
    await expect(new KimiReviewer("kimi", cfg).review("# Plan", "all")).rejects.toThrow(/assistant/i);
  });

  it("throws when stdout is not JSONL at all", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("• {\"verdict\":\"revise\"}"));
    await expect(new KimiReviewer("kimi", cfg).review("# Plan", "all")).rejects.toThrow();
  });

  it("throws when the assistant payload fails schema validation", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(streamJson(JSON.stringify({ verdict: "maybe", findings: [] }))));
    await expect(new KimiReviewer("kimi", cfg).review("# Plan", "all")).rejects.toThrow(/schema validation/i);
  });

  it("throws on a non-zero exit code", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("", 1));
    await expect(new KimiReviewer("kimi", cfg).review("# Plan", "all")).rejects.toThrow(/exited with code 1/i);
  });
});
