import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { checkReviewer } from "../../../src/reviewers/health.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const mockExecFileSync = vi.mocked(childProcess.execFileSync);

// Env vars checked by health.ts for CLI auth detection. Cleared in beforeEach
// so tests are deterministic regardless of the developer's local environment.
const REVIEWER_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENAI_USE_VERTEXAI",
] as const;

describe("checkReviewer — CLI", () => {
  const prevEnv: Partial<Record<(typeof REVIEWER_ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    vi.resetAllMocks();
    for (const k of REVIEWER_ENV_KEYS) {
      prevEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of REVIEWER_ENV_KEYS) {
      if (prevEnv[k] === undefined) delete process.env[k];
      else process.env[k] = prevEnv[k];
    }
  });

  it("returns ok=true when binary responds to --version", () => {
    mockExecFileSync.mockReturnValue("claude 2.1.0");
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    return expect(checkReviewer("claude", { type: "cli", binary: "claude" })).resolves.toEqual({ ok: true });
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
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    return expect(checkReviewer("claude", { type: "cli", binary: "claude" })).resolves.toEqual({ ok: true });
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

  describe("auth env-var detection", () => {
    it("warns when claude binary found but ANTHROPIC_API_KEY unset", async () => {
      mockExecFileSync.mockReturnValue("claude 2.1.0");
      const result = await checkReviewer("claude", { type: "cli", binary: "claude" });
      expect(result.ok).toBe(true);
      expect(result.warning).toMatch(/ANTHROPIC_API_KEY/);
    });

    it("warns when claude binary found but ANTHROPIC_API_KEY is empty string", async () => {
      mockExecFileSync.mockReturnValue("claude 2.1.0");
      process.env["ANTHROPIC_API_KEY"] = "";
      const result = await checkReviewer("claude", { type: "cli", binary: "claude" });
      expect(result.ok).toBe(true);
      expect(result.warning).toMatch(/ANTHROPIC_API_KEY/);
    });

    it("does not warn when claude binary found and ANTHROPIC_API_KEY is set", async () => {
      mockExecFileSync.mockReturnValue("claude 2.1.0");
      process.env["ANTHROPIC_API_KEY"] = "sk-real-key";
      const result = await checkReviewer("claude", { type: "cli", binary: "claude" });
      expect(result).toEqual({ ok: true });
    });

    it("warns when codex binary found but OPENAI_API_KEY unset and `codex login status` fails", async () => {
      mockExecFileSync.mockImplementation((_bin: string, args: readonly string[]) => {
        if (args[0] === "--version") return "codex 1.0" as unknown as Buffer;
        // login status fails → not logged in
        throw new Error("login status: not authenticated");
      });
      const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
      expect(result.ok).toBe(true);
      expect(result.warning).toMatch(/OPENAI_API_KEY/);
    });

    it("does NOT warn when codex `login status` reports Logged in (OAuth via ChatGPT)", async () => {
      mockExecFileSync.mockImplementation((_bin: string, args: readonly string[]) => {
        if (args[0] === "--version") return "codex 1.0" as unknown as Buffer;
        if (args[0] === "login" && args[1] === "status") return "Logged in using ChatGPT" as unknown as Buffer;
        throw new Error("unexpected call");
      });
      const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
      expect(result).toEqual({ ok: true });
    });

    it("warns when gemini binary found and none of GEMINI_API_KEY/GOOGLE_API_KEY/GOOGLE_GENAI_USE_VERTEXAI is set", async () => {
      mockExecFileSync.mockReturnValue("gemini 1.0");
      const result = await checkReviewer("gemini", { type: "cli", binary: "gemini" });
      expect(result.ok).toBe(true);
      expect(result.warning).toMatch(/GEMINI_API_KEY/);
      expect(result.warning).toMatch(/GOOGLE_API_KEY/);
      expect(result.warning).toMatch(/GOOGLE_GENAI_USE_VERTEXAI/);
    });

    it("does not warn for gemini when GOOGLE_GENAI_USE_VERTEXAI is set (alternative auth)", async () => {
      mockExecFileSync.mockReturnValue("gemini 1.0");
      process.env["GOOGLE_GENAI_USE_VERTEXAI"] = "1";
      const result = await checkReviewer("gemini", { type: "cli", binary: "gemini" });
      expect(result).toEqual({ ok: true });
    });

    it("does not warn for backends not in the CLI_REVIEWER_ENV map (e.g. kimi)", async () => {
      mockExecFileSync.mockReturnValue("kimi 1.0");
      const result = await checkReviewer("kimi", { type: "cli", binary: "kimi" });
      expect(result).toEqual({ ok: true });
    });
  });
});

describe("checkReviewer — HTTP", () => {
  const prevApiKey = process.env["OPENROUTER_API_KEY"];

  beforeEach(() => {
    vi.unstubAllGlobals();
    // Default: assume an API key is set so existing http probes run. Per-test code
    // can delete it to exercise the missing-key path.
    process.env["OPENROUTER_API_KEY"] = "test-key";
  });

  afterEach(() => {
    if (prevApiKey === undefined) {
      delete process.env["OPENROUTER_API_KEY"];
    } else {
      process.env["OPENROUTER_API_KEY"] = prevApiKey;
    }
  });

  it("returns ok=false when no endpoint configured (ollama)", () => {
    return expect(checkReviewer("ollama", { type: "http" })).resolves.toMatchObject({
      ok: false,
      reason: expect.stringMatching(/endpoint/i),
    });
  });

  it("returns ok=false with specific reason when openrouter active and OPENROUTER_API_KEY missing", async () => {
    delete process.env["OPENROUTER_API_KEY"];
    const result = await checkReviewer("openrouter", { type: "http", backend: "openrouter" });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("OPENROUTER_API_KEY not set");
  });

  it("ollama health check uses default endpoint when backend is explicit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await checkReviewer("ollama", { type: "http", backend: "ollama" });
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("http://localhost:11434");
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
      fix: expect.stringContaining("uv tool install"),
    });
  });

  it("provides install hint for qwen when binary missing", () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    vi.mocked(childProcess.execFileSync).mockImplementation(() => { throw err; });
    return expect(checkReviewer("qwen", { type: "cli", binary: "qwen" })).resolves.toMatchObject({
      ok: false,
      fix: expect.stringContaining("@qwen-code/qwen-code"),
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
