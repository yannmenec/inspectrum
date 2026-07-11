import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  planHash,
  resolveSessionKey,
  freshGateState,
  loadGateState,
  saveGateState,
  pruneGateState,
} from "../../../src/hook/state.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "inspectrum-gate-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("planHash", () => {
  it("is stable across whitespace-only reformatting", () => {
    expect(planHash("# Plan\n\n  do a   thing\n")).toBe(planHash("# Plan do a thing"));
  });

  it("differs for different content", () => {
    expect(planHash("plan A")).not.toBe(planHash("plan B"));
  });
});

describe("resolveSessionKey", () => {
  it("uses a well-formed session_id directly", () => {
    expect(resolveSessionKey({ session_id: "abc-123_XY" })).toBe("abc-123_XY");
  });

  it("rejects a session_id with path characters and falls back to transcript hash", () => {
    const key = resolveSessionKey({ session_id: "../evil", transcript_path: "/tmp/t.jsonl" });
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });

  it("returns 'unknown' when nothing usable is provided", () => {
    expect(resolveSessionKey({})).toBe("unknown");
  });
});

describe("load/save round trip", () => {
  it("returns a fresh state when no file exists", () => {
    const state = loadGateState("sess1", dir);
    expect(state).toMatchObject({ session_key: "sess1", rounds_used: 0, approved_hashes: [], denied: [] });
  });

  it("persists and reloads state", async () => {
    const state = freshGateState("sess1");
    state.rounds_used = 1;
    state.approved_hashes.push(planHash("plan"));
    state.denied.push({ hash: "h1", reason: "r", at: new Date().toISOString() });
    await saveGateState(state, dir);
    expect(loadGateState("sess1", dir)).toEqual(state);
  });

  it("returns fresh state on corrupt JSON", async () => {
    await saveGateState(freshGateState("sess1"), dir);
    writeFileSync(join(dir, "plan-gate-sess1.json"), "{not json", "utf8");
    expect(loadGateState("sess1", dir).rounds_used).toBe(0);
  });

  it("returns fresh state on schema-invalid JSON", () => {
    writeFileSync(join(dir, "plan-gate-sess1.json"), JSON.stringify({ rounds_used: "three" }), "utf8");
    expect(loadGateState("sess1", dir)).toMatchObject({ session_key: "sess1", rounds_used: 0 });
  });

  it("ignores a state file whose embedded session_key does not match", async () => {
    const other = freshGateState("sessX");
    other.rounds_used = 2;
    writeFileSync(join(dir, "plan-gate-sess1.json"), JSON.stringify(other), "utf8");
    expect(loadGateState("sess1", dir).rounds_used).toBe(0);
  });

  it("rejects traversal in the session key", async () => {
    // load fails open (fresh in-memory state, no disk access outside dir)…
    expect(loadGateState("../evil", dir)).toMatchObject({ session_key: "../evil", rounds_used: 0 });
    // …but save refuses to write through a traversal key.
    await expect(saveGateState({ ...freshGateState("ok"), session_key: "../evil" }, dir)).rejects.toThrow(/invalid/i);
    expect(existsSync(join(dir, "..", "plan-gate-..", "evil.json"))).toBe(false);
  });

  it("writes the state file with 0600 permissions on POSIX", async () => {
    await saveGateState(freshGateState("sess1"), dir);
    if (process.platform !== "win32") {
      const mode = statSync(join(dir, "plan-gate-sess1.json")).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it("leaves no .tmp file behind", async () => {
    await saveGateState(freshGateState("sess1"), dir);
    expect(existsSync(join(dir, "plan-gate-sess1.json.tmp"))).toBe(false);
  });
});

describe("pruneGateState", () => {
  it("removes stale files and keeps recent ones", async () => {
    await saveGateState(freshGateState("old"), dir);
    await saveGateState(freshGateState("new"), dir);
    const oldPath = join(dir, "plan-gate-old.json");
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    utimesSync(oldPath, past, past);

    pruneGateState(dir);

    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(join(dir, "plan-gate-new.json"))).toBe(true);
  });

  it("ignores unrelated files and missing directories", async () => {
    const unrelated = join(dir, "keep.txt");
    writeFileSync(unrelated, "x", "utf8");
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    utimesSync(unrelated, past, past);

    pruneGateState(dir);
    expect(readFileSync(unrelated, "utf8")).toBe("x");

    expect(() => pruneGateState(join(dir, "does-not-exist"))).not.toThrow();
  });
});
