import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSession, readSessionFile, type SessionData } from "../../../src/session/store.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "inspectrum-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const sampleSession: SessionData = {
  id: "test1234",
  started_at: "2026-05-06T00:00:00Z",
  duration_ms: 1234,
  reviewers: ["claude"],
  judge: "claude",
  verdict: "approve",
  counts: { blocker: 0, major: 0, minor: 0, nit: 0 },
  plan_chars: 100,
  report_chars: 50,
};

describe("writeSession", () => {
  it("creates the session directory", async () => {
    const { sessionPath } = await writeSession({
      session: sampleSession,
      planInput: "# Plan",
      reviews: { claude: "## Review\nApprove." },
      report: "# Report\nApprove.",
      baseDir: tmpDir,
    });
    const { existsSync } = await import("node:fs");
    expect(existsSync(sessionPath)).toBe(true);
  });

  it("writes plan-input.md", async () => {
    const { sessionPath } = await writeSession({
      session: sampleSession,
      planInput: "# My Plan",
      reviews: { claude: "OK" },
      report: "# Report",
      baseDir: tmpDir,
    });
    const content = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(sessionPath, "plan-input.md"), "utf8")
    );
    expect(content).toBe("# My Plan");
  });

  it("writes session.json with correct structure", async () => {
    const { sessionPath } = await writeSession({
      session: sampleSession,
      planInput: "# Plan",
      reviews: { claude: "OK" },
      report: "# Report",
      baseDir: tmpDir,
    });
    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(sessionPath, "session.json"), "utf8")
    );
    const parsed = JSON.parse(raw);
    expect(parsed.id).toBe("test1234");
    expect(parsed.verdict).toBe("approve");
  });

  it("writes one review file per reviewer", async () => {
    const { sessionPath } = await writeSession({
      session: { ...sampleSession, reviewers: ["claude", "gemini"] },
      planInput: "# Plan",
      reviews: { claude: "Claude review", gemini: "Gemini review" },
      report: "# Report",
      baseDir: tmpDir,
    });
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(sessionPath, "review-claude.md"))).toBe(true);
    expect(existsSync(join(sessionPath, "review-gemini.md"))).toBe(true);
  });
});

describe("readSessionFile", () => {
  it("reads a file that was written", async () => {
    const { sessionPath } = await writeSession({
      session: sampleSession,
      planInput: "# The Plan",
      reviews: { claude: "review content" },
      report: "# Report\nDone.",
      baseDir: tmpDir,
    });
    const content = await readSessionFile(sessionPath, "plan-input.md");
    expect(content).toBe("# The Plan");
  });

  it("returns null for non-existent file", async () => {
    const content = await readSessionFile("/nonexistent/path", "file.md");
    expect(content).toBeNull();
  });
});
