import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    mkdtempSync: vi.fn(() => "/tmp/inspectrum-muse-test"),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { MuseReviewer } from "../../../src/reviewers/muse.js";
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

const cfg: ReviewerConfig = { type: "cli", binary: "muse" };

const validRawReview = {
  verdict: "revise",
  findings: [
    {
      severity: "major",
      category: "risk",
      reviewer: "SHOULD-BE-OVERWRITTEN",
      message: "No rollback path.",
      suggested_fix: "Document a rollback.",
    },
  ],
  summary: "Needs a rollback path.",
};

const argsOf = (): string[] => mockSpawn.mock.calls[0]![1] as string[];
const promptFileContent = (): string => mockWriteFileSync.mock.calls[0]![1] as string;

describe("MuseReviewer — invocation contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it("invokes the exec subcommand", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan", "all");
    expect(argsOf()[0]).toBe("exec");
  });

  // The user's shell aliases `muse` to `muse --disable-approval`; a Node spawn
  // does NOT apply shell aliases, so the flag must be passed explicitly or the
  // headless run blocks on an approval prompt.
  it("passes --disable-approval explicitly (shell aliases do not apply to spawn)", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan", "all");
    expect(argsOf()).toContain("--disable-approval");
  });

  // Verified against the real CLI: `muse exec --disable-approval` alone DID run a
  // shell command and wrote /tmp/muse-should-not-exist.txt. Adding --disable-shell
  // and --disable-write blocked it. A plan under review is untrusted input, so the
  // reviewer must not be able to execute or write anything.
  it("pins --disable-shell so an untrusted plan cannot execute commands", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan", "all");
    expect(argsOf()).toContain("--disable-shell");
  });

  it("pins --disable-write so an untrusted plan cannot write files", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan", "all");
    expect(argsOf()).toContain("--disable-write");
  });

  it("never passes --json (it emits a JSONL event stream, not our object)", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan", "all");
    expect(argsOf()).not.toContain("--json");
  });
});

describe("MuseReviewer — prompt delivery", () => {
  beforeEach(() => vi.resetAllMocks());

  it("passes the prompt via --prompt-file, not argv", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan\nsecret content", "all");
    const args = argsOf();
    const idx = args.indexOf("--prompt-file");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toContain("inspectrum-muse");
    // The plan must not leak into argv (visible in `ps aux`).
    expect(args.join(" ")).not.toContain("secret content");
  });

  it("writes the prompt file with owner-only permissions", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan", "all");
    expect(mockWriteFileSync.mock.calls[0]![2]).toMatchObject({ mode: 0o600 });
  });

  it("includes both the system prompt and the plan in the prompt file", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan\nDEADBEEF", "all");
    const content = promptFileContent();
    expect(content).toContain("reviewer");
    expect(content).toContain("JSON");
    expect(content).toContain("DEADBEEF");
  });

  // muse exec also reads --api-key-stdin from stdin; writing an unrelated payload
  // there can corrupt key reading or hang the child.
  it("does not write the prompt to stdin", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan", "all");
    const stdin = mockSpawn.mock.results[0]!.value.stdin as { write: ReturnType<typeof vi.fn> };
    expect(stdin.write).not.toHaveBeenCalled();
  });

  it("truncates the plan at the 16000-char cap before writing it", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("x".repeat(20_000), "all");
    const content = promptFileContent();
    expect(content).toContain("[...truncated]");
    // The file also carries the system prompt and JSON instruction, so assert on
    // the plan segment rather than total length: the 20k plan must be capped.
    const planSegment = content.slice(content.indexOf("PLAN TO REVIEW:"));
    expect(planSegment.length).toBeLessThanOrEqual(16_100);
  });

  it("removes the temp directory after a successful run", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan", "all");
    expect(mockRmSync).toHaveBeenCalled();
  });

  it("removes the temp directory even when the run fails", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("", 1));
    await expect(new MuseReviewer("muse", cfg).review("# Plan", "all")).rejects.toThrow();
    expect(mockRmSync).toHaveBeenCalled();
  });
});

describe("MuseReviewer — model and effort", () => {
  beforeEach(() => vi.resetAllMocks());

  it("omits --model when none is configured (muse uses its own default)", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", { type: "cli", backend: "muse" }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--model");
  });

  it("passes --model when configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", { ...cfg, model: "some-model" }).review("# Plan", "all");
    const args = argsOf();
    expect(args[args.indexOf("--model") + 1]).toBe("some-model");
  });

  it("omits --reasoning-effort when no effort is configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", cfg).review("# Plan", "all");
    expect(argsOf()).not.toContain("--reasoning-effort");
  });

  it("passes --reasoning-effort when effort is configured", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", { ...cfg, effort: "high" }).review("# Plan", "all");
    const args = argsOf();
    expect(args[args.indexOf("--reasoning-effort") + 1]).toBe("high");
  });
});

describe("MuseReviewer — user args and reserved flags", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps non-reserved user args", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", { ...cfg, args: ["--no-session-log"] }).review("# Plan", "all");
    expect(argsOf()).toContain("--no-session-log");
  });

  // --yolo disables approval AND the sandbox; letting a user re-enable shell or
  // writes through config.toml would defeat the pinned confinement flags.
  it("drops a user-supplied --yolo", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", { ...cfg, args: ["--yolo"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--yolo");
  });

  it("drops a user-supplied --disable-sandbox", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", { ...cfg, args: ["--disable-sandbox"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--disable-sandbox");
  });

  it("drops a user-supplied --enable-shell-tool", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", { ...cfg, args: ["--enable-shell-tool"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--enable-shell-tool");
  });

  it("drops a user-supplied --json so the event stream cannot be reintroduced", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", { ...cfg, args: ["--json"] }).review("# Plan", "all");
    expect(argsOf()).not.toContain("--json");
  });

  it("drops a user-supplied --prompt-file and keeps the canonical one", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    await new MuseReviewer("muse", { ...cfg, args: ["--prompt-file", "/etc/passwd"] }).review("# Plan", "all");
    const args = argsOf();
    expect(args).not.toContain("/etc/passwd");
    expect(args.filter((a) => a === "--prompt-file")).toHaveLength(1);
  });
});

describe("MuseReviewer — output parsing", () => {
  beforeEach(() => vi.resetAllMocks());

  it("parses bare JSON on stdout", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const result = await new MuseReviewer("muse", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("revise");
    expect(result.findings).toHaveLength(1);
  });

  it("stamps the reviewer id onto the result and every finding", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(validRawReview)));
    const result = await new MuseReviewer("my-muse", cfg).review("# Plan", "all");
    expect(result.reviewer).toBe("my-muse");
    expect(result.findings[0]!.reviewer).toBe("my-muse");
  });

  it("strips a complete markdown code fence", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("```json\n" + JSON.stringify(validRawReview) + "\n```"));
    const result = await new MuseReviewer("muse", cfg).review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  // Observed for real when muse refused a sandboxed action: it answered in prose
  // with a JSON-ish blob inline and an out-of-enum verdict. That must fail loudly
  // rather than yield a fabricated verdict.
  it("rejects prose wrapped around JSON rather than inventing a verdict", async () => {
    const prose = "Shell execution is disabled per policy.\n\nAccurate result: " + JSON.stringify(validRawReview);
    mockSpawn.mockReturnValue(makeMockProcess(prose));
    await expect(new MuseReviewer("muse", cfg).review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("throws on a non-zero exit code", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("", 1));
    await expect(new MuseReviewer("muse", cfg).review("# Plan", "all")).rejects.toThrow(/exited with code 1/i);
  });

  it("throws when stdout fails schema validation", async () => {
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify({ verdict: "blocked", findings: [] })));
    await expect(new MuseReviewer("muse", cfg).review("# Plan", "all")).rejects.toThrow(/schema validation/i);
  });
});
