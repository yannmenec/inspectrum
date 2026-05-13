import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");
vi.mock("node:fs");

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { runJudge } from "../../../src/judge/judge.js";
import type { RawReview } from "../../../src/schemas.js";
import { defaultConfig } from "../../../src/config.js";

const mockSpawn = vi.mocked(childProcess.spawn);

function makeMockProcess(stdout: string, stderr = "", exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as never;
  proc.stderr = new EventEmitter() as never;
  proc.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as never;
  proc.kill = vi.fn() as never;

  setTimeout(() => {
    (proc.stdout as EventEmitter).emit("data", Buffer.from(stdout));
    (proc.stderr as EventEmitter).emit("data", Buffer.from(stderr));
    proc.emit("close", exitCode);
  }, 0);

  return proc;
}

const validEnvelope = (innerJson: object) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, result: JSON.stringify(innerJson) });

const blockerfinding = (reviewer: string, msg: string) => ({
  severity: "blocker" as const,
  category: "risk" as const,
  reviewer,
  message: msg,
});

const majorFinding = (reviewer: string, msg: string) => ({
  severity: "major" as const,
  category: "risk" as const,
  reviewer,
  message: msg,
});

const minorFinding = (reviewer: string, msg: string) => ({
  severity: "minor" as const,
  category: "clarity" as const,
  reviewer,
  message: msg,
});

const PLAN = "# My Plan\nDo some stuff.";

describe("runJudge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.mkdtempSync).mockReturnValue("/tmp/inspectrum-judge-codex" as never);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    vi.mocked(fs.rmSync).mockImplementation(() => undefined);
  });

  it("returns consolidated RawReview with reviewer='judge' on success", async () => {
    const consolidated = {
      verdict: "reject",
      findings: [{ severity: "blocker", category: "risk", reviewer: "judge", message: "No backup before migration" }],
      summary: "Both reviewers agree on blocker.",
    };
    mockSpawn.mockReturnValue(makeMockProcess(validEnvelope(consolidated)));

    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "reject", findings: [blockerfinding("claude", "No backup before migration")] },
      { reviewer: "codex", verdict: "reject", findings: [blockerfinding("codex", "No backup before migration")] },
    ];

    const { review: result, status } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);

    expect(status).toBe("success");
    expect(result.reviewer).toBe("judge");
    expect(result.verdict).toBe("reject");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toBe("No backup before migration");
  });

  it("2 reviewers disagree → preserves both findings in fallback", async () => {
    mockSpawn.mockImplementation(() => {
      throw new Error("spawn failed");
    });

    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [majorFinding("claude", "No rollback plan")] },
      { reviewer: "codex", verdict: "revise", findings: [majorFinding("codex", "Missing index on FK column")] },
    ];

    const { review: result, status, error } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);

    expect(status).toBe("fallback");
    expect(error).toMatch(/spawn failed/i);
    expect(result.reviewer).toBe("judge");
    expect(result.findings).toHaveLength(2);
    const messages = result.findings.map((f) => f.message);
    expect(messages).toContain("No rollback plan");
    expect(messages).toContain("Missing index on FK column");
  });

  it("3 identical minor findings → deduplicated to 1 in fallback", async () => {
    mockSpawn.mockImplementation(() => {
      throw new Error("spawn failed");
    });

    const msg = "Variable names mix camelCase and snake_case inconsistently";
    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [minorFinding("claude", msg)] },
      { reviewer: "codex", verdict: "revise", findings: [minorFinding("codex", msg)] },
      { reviewer: "gemini", verdict: "revise", findings: [minorFinding("gemini", msg)] },
    ];

    const { review: result } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);

    expect(result.reviewer).toBe("judge");
    const matching = result.findings.filter((f) => f.message === msg);
    expect(matching).toHaveLength(1);
  });

  it("judge returns Zod-invalid output → falls back to concat", async () => {
    const invalidInner = {
      verdict: "approve",
      findings: [{ severity: "critical", category: "risk", reviewer: "judge", message: "Bad" }],
    };
    mockSpawn.mockReturnValue(makeMockProcess(validEnvelope(invalidInner)));

    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [majorFinding("claude", "Missing tests")] },
      { reviewer: "codex", verdict: "approve", findings: [] },
    ];

    const { review: result } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);

    expect(result.reviewer).toBe("judge");
    expect(result.summary).toMatch(/failed/i);
    expect(result.findings.some((f) => f.message === "Missing tests")).toBe(true);
  });

  it("judge spawn throws → falls back to concat with aggregated verdict", async () => {
    mockSpawn.mockImplementation(() => {
      throw new Error("binary not found");
    });

    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "reject", findings: [blockerfinding("claude", "Blocker A")] },
      { reviewer: "codex", verdict: "revise", findings: [majorFinding("codex", "Major B")] },
    ];

    const { review: result } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);

    expect(result.reviewer).toBe("judge");
    expect(result.verdict).toBe("reject"); // reject wins
    expect(result.findings).toHaveLength(2);
  });

  it("invalid envelope (non-JSON object) → falls back to concat", async () => {
    mockSpawn.mockReturnValue(makeMockProcess("this is not json at all"));

    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [majorFinding("claude", "Missing tests")] },
    ];

    const { review: result } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);
    expect(result.reviewer).toBe("judge");
    expect(result.summary).toMatch(/failed/i);
  });

  it("valid JSON but wrong envelope shape → falls back to concat", async () => {
    const wrongShape = JSON.stringify({ foo: "bar", baz: 42 });
    mockSpawn.mockReturnValue(makeMockProcess(wrongShape));

    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "approve", findings: [] },
    ];

    const { review: result } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);
    expect(result.reviewer).toBe("judge");
    expect(result.summary).toMatch(/failed/i);
  });

  it("is_error=true in envelope → falls back to concat", async () => {
    const errorEnvelope = JSON.stringify({ type: "result", subtype: "error", is_error: true, result: "API error" });
    mockSpawn.mockReturnValue(makeMockProcess(errorEnvelope));

    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "approve", findings: [] },
    ];

    const { review: result } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);
    expect(result.reviewer).toBe("judge");
    expect(result.summary).toMatch(/failed/i);
  });

  it("envelope result field contains non-JSON string → falls back", async () => {
    const envelope = JSON.stringify({ type: "result", is_error: false, result: "not json" });
    mockSpawn.mockReturnValue(makeMockProcess(envelope));

    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [minorFinding("claude", "Something")] },
    ];

    const { review: result } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);
    expect(result.reviewer).toBe("judge");
    expect(result.summary).toMatch(/failed/i);
  });

  it("fallback verdict is 'approve' when all reviewers approve", async () => {
    mockSpawn.mockImplementation(() => {
      throw new Error("spawn failed");
    });

    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "approve", findings: [] },
      { reviewer: "codex", verdict: "approve", findings: [] },
    ];

    const { review: result } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);
    expect(result.verdict).toBe("approve");
  });

  it("runs a Gemini-backed judge without expecting a Claude envelope", async () => {
    const consolidated = {
      verdict: "revise",
      findings: [majorFinding("model", "No rollback")],
      summary: "Consolidated.",
    };
    mockSpawn.mockReturnValue(makeMockProcess(JSON.stringify(consolidated)));
    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [majorFinding("claude", "No rollback")] },
      { reviewer: "codex", verdict: "approve", findings: [] },
    ];
    const config = {
      ...defaultConfig,
      defaults: { ...defaultConfig.defaults, judge: "gemini-judge" },
      reviewers: {
        ...defaultConfig.reviewers,
        "gemini-judge": { type: "cli" as const, backend: "gemini" as const, binary: "gemini" },
      },
    };

    const { review: result, status } = await runJudge(rawReviews, PLAN, "gemini-judge", config);

    expect(status).toBe("success");
    expect(result.reviewer).toBe("judge");
    expect(result.findings[0]!.reviewer).toBe("judge");
  });

  it("runs a Codex-backed judge via the output file protocol", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ verdict: "approve", findings: [], summary: "Consolidated." }) as never,
    );
    mockSpawn.mockReturnValue(makeMockProcess(""));
    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "approve", findings: [] },
      { reviewer: "gemini", verdict: "approve", findings: [] },
    ];
    const config = {
      ...defaultConfig,
      defaults: { ...defaultConfig.defaults, judge: "codex-judge" },
      reviewers: {
        ...defaultConfig.reviewers,
        "codex-judge": { type: "cli" as const, backend: "codex" as const, binary: "codex" },
      },
    };

    const { review: result, status } = await runJudge(rawReviews, PLAN, "codex-judge", config);

    expect(status).toBe("success");
    expect(result.verdict).toBe("approve");
    expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith("/tmp/inspectrum-judge-codex/output.json", "utf8");
  });

  it("falls back explicitly when judge config is missing", async () => {
    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [majorFinding("claude", "Missing tests")] },
      { reviewer: "codex", verdict: "approve", findings: [] },
    ];

    const { review: result, status, error } = await runJudge(rawReviews, PLAN, "missing", defaultConfig);

    expect(status).toBe("fallback");
    expect(error).toMatch(/not found/i);
    expect(result.findings.some((f) => f.message === "Missing tests")).toBe(true);
  });

  it("propagates non-ReviewerOperationalError (programming errors)", async () => {
    // mkdtempSync is called before spawnCollect in the codex backend path;
    // a TypeError here is not a ReviewerOperationalError and must propagate.
    vi.mocked(fs.mkdtempSync).mockImplementation(() => {
      throw new TypeError("intentional programming error — not an operational failure");
    });
    const config = {
      ...defaultConfig,
      defaults: { ...defaultConfig.defaults, judge: "codex-judge" },
      reviewers: {
        ...defaultConfig.reviewers,
        "codex-judge": { type: "cli" as const, backend: "codex" as const, binary: "codex" },
      },
    };
    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [majorFinding("claude", "No rollback")] },
      { reviewer: "codex", verdict: "approve", findings: [] },
    ];

    await expect(runJudge(rawReviews, PLAN, "codex-judge", config)).rejects.toThrow(TypeError);
  });

  it("falls back explicitly when judge config is http", async () => {
    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "approve", findings: [] },
      { reviewer: "codex", verdict: "approve", findings: [] },
    ];
    const config = {
      ...defaultConfig,
      reviewers: {
        ...defaultConfig.reviewers,
        "http-judge": { type: "http" as const, backend: "claude" as const, endpoint: "http://localhost:11434" },
      },
    };

    const { status, error } = await runJudge(rawReviews, PLAN, "http-judge", config);

    expect(status).toBe("fallback");
    expect(error).toMatch(/explicit backend/i);
  });

  it("fallback dedup keeps the highest severity for duplicate messages", async () => {
    mockSpawn.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    const msg = "No rollback";
    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [minorFinding("claude", msg)] },
      { reviewer: "codex", verdict: "revise", findings: [majorFinding("codex", msg)] },
    ];

    const { review: result } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("major");
  });

  it("falls back when the judge returns reject without a blocker", async () => {
    const invalidVerdict = {
      verdict: "reject",
      findings: [majorFinding("judge", "No rollback")],
    };
    mockSpawn.mockReturnValue(makeMockProcess(validEnvelope(invalidVerdict)));
    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [majorFinding("claude", "No rollback")] },
      { reviewer: "codex", verdict: "approve", findings: [] },
    ];

    const { review: result, status, error } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);

    expect(status).toBe("fallback");
    expect(error).toMatch(/reject.*blocker/i);
    expect(result.verdict).toBe("revise");
  });

  it("falls back when the judge returns approve with major findings", async () => {
    const invalidVerdict = {
      verdict: "approve",
      findings: [majorFinding("judge", "No rollback")],
    };
    mockSpawn.mockReturnValue(makeMockProcess(validEnvelope(invalidVerdict)));
    const rawReviews: RawReview[] = [
      { reviewer: "claude", verdict: "revise", findings: [majorFinding("claude", "No rollback")] },
      { reviewer: "codex", verdict: "approve", findings: [] },
    ];

    const { review: result, status, error } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);

    expect(status).toBe("fallback");
    expect(error).toMatch(/approve.*major/i);
    expect(result.verdict).toBe("revise");
  });

  it("ratio of consolidated/raw findings ≤ 0.6 when judge successfully deduplicates", async () => {
    const rawReviews: RawReview[] = [
      {
        reviewer: "claude",
        verdict: "revise",
        findings: [
          majorFinding("claude", "No rollback"),
          minorFinding("claude", "Bad naming"),
          minorFinding("claude", "Missing docs"),
        ],
      },
      {
        reviewer: "codex",
        verdict: "revise",
        findings: [
          majorFinding("codex", "No rollback"),
          minorFinding("codex", "Bad naming"),
          minorFinding("codex", "Unused imports"),
        ],
      },
    ];
    const totalRaw = rawReviews.reduce((n, r) => n + r.findings.length, 0); // 6

    const consolidated = {
      verdict: "revise",
      findings: [
        { severity: "major", category: "risk", reviewer: "judge", message: "No rollback" },
        { severity: "minor", category: "clarity", reviewer: "judge", message: "Bad naming" },
        { severity: "minor", category: "clarity", reviewer: "judge", message: "Unused imports" },
      ],
      summary: "Consolidated.",
    };
    mockSpawn.mockReturnValue(makeMockProcess(validEnvelope(consolidated)));

    const { review: result } = await runJudge(rawReviews, PLAN, "claude", defaultConfig);
    const ratio = result.findings.length / totalRaw;
    expect(ratio).toBeLessThanOrEqual(0.6);
  });
});
