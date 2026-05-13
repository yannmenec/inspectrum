import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSessions, findSessionById, readSessionFile } from "../../../src/session/store.js";
import { buildSessionsIndex } from "../../../src/session/resources.js";

function makeSessionDir(base: string, timestamp: string, id: string): string {
  const dir = join(base, `${timestamp}__${id}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plan-input.md"), `# Plan for ${id}`, "utf8");
  writeFileSync(join(dir, "report.md"), `# Report for ${id}`, "utf8");
  writeFileSync(
    join(dir, "session.json"),
    JSON.stringify({ id, verdict: "approve", reviewers: ["claude"] }),
    "utf8",
  );
  return dir;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "inspectrum-resources-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("listSessions", () => {
  it("returns empty array when directory does not exist", async () => {
    const result = await listSessions(join(tmpDir, "nonexistent"));
    expect(result).toEqual([]);
  });

  it("returns empty array for empty sessions directory", async () => {
    const result = await listSessions(tmpDir);
    expect(result).toEqual([]);
  });

  it("returns sessions sorted by startedAt descending", async () => {
    makeSessionDir(tmpDir, "2024-01-15T10-00-00", "aaaaaaaa");
    makeSessionDir(tmpDir, "2024-01-16T12-00-00", "bbbbbbbb");
    makeSessionDir(tmpDir, "2024-01-14T08-00-00", "cccccccc");

    const result = await listSessions(tmpDir);

    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe("bbbbbbbb");
    expect(result[1]!.id).toBe("aaaaaaaa");
    expect(result[2]!.id).toBe("cccccccc");
  });

  it("returns SessionEntry with id, path, and startedAt", async () => {
    makeSessionDir(tmpDir, "2024-03-10T09-30-00", "deadbeef");

    const result = await listSessions(tmpDir);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("deadbeef");
    expect(result[0]!.path).toContain("deadbeef");
    expect(result[0]!.startedAt).toBe("2024-03-10T09:30:00Z");
  });

  it("ignores non-directory entries and malformed names", async () => {
    makeSessionDir(tmpDir, "2024-01-15T10-00-00", "aaaaaaaa");
    writeFileSync(join(tmpDir, "not-a-session.txt"), "garbage");
    mkdirSync(join(tmpDir, "bad-format"));

    const result = await listSessions(tmpDir);
    expect(result).toHaveLength(1);
  });
});

describe("buildSessionsIndex", () => {
  it("returns a single JSON document with readable file resource URIs", async () => {
    makeSessionDir(tmpDir, "2024-03-10T09-30-00", "deadbeef");
    const sessions = await listSessions(tmpDir);

    const parsed = JSON.parse(buildSessionsIndex(sessions));

    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].resources).toContainEqual({
      file: "report.md",
      uri: "inspectrum://sessions/deadbeef/report.md",
      mimeType: "text/markdown",
    });
    expect(parsed.sessions[0].resources).toContainEqual({
      file: "session.json",
      uri: "inspectrum://sessions/deadbeef/session.json",
      mimeType: "application/json",
    });
  });
});

describe("findSessionById", () => {
  it("returns null when sessions directory does not exist", async () => {
    const result = await findSessionById("abc12345", join(tmpDir, "nonexistent"));
    expect(result).toBeNull();
  });

  it("returns null when session not found", async () => {
    const result = await findSessionById("ffffffff", tmpDir);
    expect(result).toBeNull();
  });

  it("finds session by id", async () => {
    const dir = makeSessionDir(tmpDir, "2024-01-15T10-00-00", "cafebabe");
    const result = await findSessionById("cafebabe", tmpDir);
    expect(result).toBe(dir);
  });

  it("finds session even with different timestamp prefixes", async () => {
    makeSessionDir(tmpDir, "2024-01-15T10-00-00", "aaaaaaaa");
    const dir2 = makeSessionDir(tmpDir, "2024-02-20T15-45-30", "bbbbbbbb");

    expect(await findSessionById("aaaaaaaa", tmpDir)).toContain("aaaaaaaa");
    expect(await findSessionById("bbbbbbbb", tmpDir)).toBe(dir2);
  });
});

describe("readSessionFile", () => {
  it("returns null for non-existent file", async () => {
    const dir = makeSessionDir(tmpDir, "2024-01-15T10-00-00", "aaaaaaaa");
    const result = await readSessionFile(dir, "judge.md");
    expect(result).toBeNull();
  });

  it("reads plan-input.md content", async () => {
    const dir = makeSessionDir(tmpDir, "2024-01-15T10-00-00", "aaaaaaaa");
    const result = await readSessionFile(dir, "plan-input.md");
    expect(result).toContain("# Plan for aaaaaaaa");
  });

  it("reads report.md content", async () => {
    const dir = makeSessionDir(tmpDir, "2024-01-15T10-00-00", "aaaaaaaa");
    const result = await readSessionFile(dir, "report.md");
    expect(result).toContain("# Report for aaaaaaaa");
  });

  it("reads session.json content as valid JSON", async () => {
    const dir = makeSessionDir(tmpDir, "2024-01-15T10-00-00", "aaaaaaaa");
    const result = await readSessionFile(dir, "session.json");
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.id).toBe("aaaaaaaa");
    expect(parsed.verdict).toBe("approve");
  });
});
