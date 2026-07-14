import { afterEach, describe, expect, it } from "vitest";
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOOK_STDIN_MAX_BYTES, readHookStdin } from "../../../src/hook/stdin.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function readFixture(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "inspectrum-stdin-"));
  tempDirs.push(dir);
  const path = join(dir, "stdin");
  writeFileSync(path, contents);
  const fd = openSync(path, "r");
  try {
    return readHookStdin(fd);
  } finally {
    closeSync(fd);
  }
}

describe("readHookStdin", () => {
  it("accepts input exactly at the byte cap", () => {
    const input = "x".repeat(HOOK_STDIN_MAX_BYTES);
    expect(readFixture(input)).toBe(input);
  });

  it("rejects on the first byte above the cap", () => {
    expect(() => readFixture("x".repeat(HOOK_STDIN_MAX_BYTES + 1))).toThrow(/stdin exceeds/);
  });

  it("decodes UTF-8 only after reassembling read chunks", () => {
    const input = `${"a".repeat(16_383)}é`;
    expect(readFixture(input)).toBe(input);
  });
});
