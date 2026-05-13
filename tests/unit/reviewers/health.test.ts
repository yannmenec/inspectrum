import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { checkReviewer } from "../../../src/reviewers/health.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const mockExecFileSync = vi.mocked(childProcess.execFileSync);

describe("checkReviewer — CLI", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns ok=true when binary responds to --version", () => {
    mockExecFileSync.mockReturnValue("claude 2.1.0");
    return expect(checkReviewer("claude", { type: "cli", binary: "claude" })).resolves.toMatchObject({ ok: true });
  });

  it("returns ok=false with fix hint when binary not found (ENOENT)", () => {
    const err = Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
    mockExecFileSync.mockImplementation(() => { throw err; });
    return expect(checkReviewer("claude", { type: "cli", binary: "claude" })).resolves.toMatchObject({
      ok: false,
      fix: expect.stringContaining("claude.ai"),
    });
  });

  it("returns ok=true (optimistic) for other errors (auth, permissions)", () => {
    mockExecFileSync.mockImplementation(() => { throw new Error("exit code 1"); });
    return expect(checkReviewer("claude", { type: "cli", binary: "claude" })).resolves.toMatchObject({ ok: true });
  });

  it("uses binary field from config", () => {
    mockExecFileSync.mockReturnValue("v1.0");
    checkReviewer("myreviewer", { type: "cli", binary: "my-custom-binary" });
    expect(mockExecFileSync).toHaveBeenCalledWith("my-custom-binary", ["--version"], expect.any(Object));
  });

  it("falls back to id as binary when binary not set in config", () => {
    mockExecFileSync.mockReturnValue("v1.0");
    checkReviewer("gemini", { type: "cli" });
    expect(mockExecFileSync).toHaveBeenCalledWith("gemini", ["--version"], expect.any(Object));
  });

  it("provides generic fix message for unknown reviewer ids", () => {
    const err = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    mockExecFileSync.mockImplementation(() => { throw err; });
    return expect(checkReviewer("unknown-llm", { type: "cli", binary: "unknown-llm" })).resolves.toMatchObject({
      ok: false,
      fix: expect.stringContaining("unknown-llm"),
    });
  });
});

describe("checkReviewer — HTTP", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok=false when no endpoint configured (ollama)", () => {
    return expect(checkReviewer("ollama", { type: "http" })).resolves.toMatchObject({
      ok: false,
      reason: expect.stringMatching(/endpoint/i),
    });
  });

  it("provides install hint for ollama when binary missing", () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    // CLI ollama would use checkCli — test via installFix indirectly through a CLI config
    vi.mocked(childProcess.execFileSync).mockImplementation(() => { throw err; });
    return expect(checkReviewer("ollama", { type: "cli", binary: "ollama" })).resolves.toMatchObject({
      ok: false,
      fix: expect.stringContaining("brew install ollama"),
    });
  });

  it("provides install hint for kimi when binary missing", () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    vi.mocked(childProcess.execFileSync).mockImplementation(() => { throw err; });
    return expect(checkReviewer("kimi", { type: "cli", binary: "kimi" })).resolves.toMatchObject({
      ok: false,
      fix: expect.stringContaining("@moonshotai/kimi-cli"),
    });
  });

  it("provides install hint for qwen when binary missing", () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    vi.mocked(childProcess.execFileSync).mockImplementation(() => { throw err; });
    return expect(checkReviewer("qwen", { type: "cli", binary: "qwen" })).resolves.toMatchObject({
      ok: false,
      fix: expect.stringContaining("@qwenlm/qwen-code"),
    });
  });

  it("provides fix hint for openrouter (API key URL)", () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    vi.mocked(childProcess.execFileSync).mockImplementation(() => { throw err; });
    return expect(checkReviewer("openrouter", { type: "cli", binary: "openrouter" })).resolves.toMatchObject({
      ok: false,
      fix: expect.stringContaining("openrouter.ai/keys"),
    });
  });

  it("openrouter health check hits {endpoint}/models (explicit endpoint)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await checkReviewer("openrouter", {
      type: "http",
      backend: "openrouter",
      endpoint: "https://openrouter.ai/api/v1",
    });
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("https://openrouter.ai/api/v1/models");
  });

  it("openrouter health check hits default /api/v1/models when endpoint absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await checkReviewer("openrouter", { type: "http", backend: "openrouter" });
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("https://openrouter.ai/api/v1/models");
  });

  it("openrouter strips trailing slash before appending /models", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await checkReviewer("openrouter", {
      type: "http",
      backend: "openrouter",
      endpoint: "https://openrouter.ai/api/v1/",
    });
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("https://openrouter.ai/api/v1/models");
  });

  it("returns ok=true when endpoint responds 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await checkReviewer("ollama", { type: "http", endpoint: "http://localhost:11434" });
    expect(result.ok).toBe(true);
  });

  it("returns ok=true when endpoint responds 405 (HEAD not allowed but alive)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 405 }));
    const result = await checkReviewer("ollama", { type: "http", endpoint: "http://localhost:11434" });
    expect(result.ok).toBe(true);
  });

  it("returns ok=false when fetch throws (connection refused)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await checkReviewer("ollama", { type: "http", endpoint: "http://localhost:11434" });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("localhost:11434");
  });

  it("returns ok=false for non-200/405 status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const result = await checkReviewer("ollama", { type: "http", endpoint: "http://localhost:11434" });
    expect(result.ok).toBe(false);
  });
});
