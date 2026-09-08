import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { spawnCollect } from "../../../src/reviewers/common.js";

const mockSpawn = vi.mocked(childProcess.spawn);

function makeMockProcess(stdout: string, exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as never;
  proc.stderr = new EventEmitter() as never;
  proc.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as never;
  proc.kill = vi.fn() as never;
  setTimeout(() => {
    (proc.stdout as EventEmitter).emit("data", Buffer.from(stdout));
    proc.emit("close", exitCode);
  }, 0);
  return proc;
}

/**
 * spawnCollect used to ALWAYS write to the child's stdin. Backends that pass the
 * prompt by file (muse --prompt-file, grok --prompt-file) must leave stdin alone:
 * muse exec also supports --api-key-stdin, so writing an unrelated payload there
 * can corrupt key reading or hang the process waiting on a stream we never close
 * correctly. Omitting `stdin` must close the stream without writing to it.
 */
describe("spawnCollect stdin handling", () => {
  beforeEach(() => vi.resetAllMocks());

  it("writes to stdin when a stdin payload is supplied", async () => {
    const proc = makeMockProcess("out");
    mockSpawn.mockReturnValue(proc);
    await spawnCollect({ binary: "x", args: [], stdin: "payload", timeoutMs: 5000, label: "X" });
    const stdin = proc.stdin as unknown as { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    expect(stdin.write).toHaveBeenCalledWith("payload");
    expect(stdin.end).toHaveBeenCalled();
  });

  it("does NOT write to stdin when no stdin payload is supplied", async () => {
    const proc = makeMockProcess("out");
    mockSpawn.mockReturnValue(proc);
    await spawnCollect({ binary: "x", args: [], timeoutMs: 5000, label: "X" });
    const stdin = proc.stdin as unknown as { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    expect(stdin.write).not.toHaveBeenCalled();
  });

  it("still closes stdin when no payload is supplied, so the child does not block", async () => {
    const proc = makeMockProcess("out");
    mockSpawn.mockReturnValue(proc);
    await spawnCollect({ binary: "x", args: [], timeoutMs: 5000, label: "X" });
    const stdin = proc.stdin as unknown as { end: ReturnType<typeof vi.fn> };
    expect(stdin.end).toHaveBeenCalled();
  });

  it("writes an empty-string stdin payload rather than skipping it", async () => {
    const proc = makeMockProcess("out");
    mockSpawn.mockReturnValue(proc);
    await spawnCollect({ binary: "x", args: [], stdin: "", timeoutMs: 5000, label: "X" });
    const stdin = proc.stdin as unknown as { write: ReturnType<typeof vi.fn> };
    expect(stdin.write).toHaveBeenCalledWith("");
  });
});
