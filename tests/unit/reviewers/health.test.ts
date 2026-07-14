import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { checkClaudePlugin, checkReviewer } from "../../../src/reviewers/health.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const mockExecFileSync = vi.mocked(childProcess.execFileSync);
const mockSpawnSync = vi.mocked(childProcess.spawnSync);

function spawnSyncResult(status: number, stdout: string, stderr: string): ReturnType<typeof childProcess.spawnSync> {
  return { status, stdout, stderr } as never;
}

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

  describe("Codex CLI version compatibility", () => {
    beforeEach(() => {
      process.env["OPENAI_API_KEY"] = "sk-test";
    });

    it.each([
      ["codex-cli 0.99.0", "0.99.0"],
      ["codex-cli 0.144.0-alpha.4", "0.144.0-alpha.4"],
      ["codex 1.0.0", "1.0.0"],
      // 0.100.0 > 0.99.0 numerically but "0.100.0" < "0.99.0" lexicographically:
      // locks the per-component compare against a regression to a string compare.
      ["codex-cli 0.100.0", "0.100.0"],
      ["codex-cli 0.144.2\nUpdate available: 0.145.0", "0.144.2"],
      ["\u001b[32mcodex-cli 0.144.2\u001b[0m", "0.144.2"],
    ])("accepts %s and returns the parsed version", async (stdout, version) => {
      mockExecFileSync.mockReturnValue(stdout);
      await expect(checkReviewer("codex", { type: "cli", binary: "codex" })).resolves.toEqual({
        ok: true,
        version,
      });
    });

    it.each(["codex-cli 0.98.9", "codex-cli 0.99.0-alpha.1"])("rejects unsupported version %s", async (stdout) => {
      mockExecFileSync.mockReturnValue(stdout);
      const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
      expect(result).toMatchObject({
        ok: false,
        reason: expect.stringContaining("requires Codex CLI >= 0.99.0"),
        fix: "npm install -g @openai/codex@latest",
      });
    });

    it("enforces the minimum for a custom reviewer whose binary is Codex", async () => {
      mockExecFileSync.mockReturnValue("codex-cli 0.98.9");
      const result = await checkReviewer("peer", { type: "cli", binary: "codex" });
      expect(result).toMatchObject({
        ok: false,
        reason: expect.stringContaining("requires Codex CLI >= 0.99.0"),
      });
    });

    // Regression: an aliased Codex reviewer with no explicit `binary` used to probe
    // the reviewer id ("codex-high"), so doctor reported ENOENT and told the user to
    // reinstall a Codex that was installed and healthy. The review path in common.ts
    // spawns the backend binary ("codex"); health must probe the same one.
    it("probes the backend binary for an aliased Codex reviewer with no binary override", async () => {
      mockExecFileSync.mockReturnValue("codex-cli 0.144.2");
      const result = await checkReviewer("codex-high", { type: "cli", backend: "codex", effort: "high" });
      expect(mockExecFileSync).toHaveBeenCalledWith("codex", ["--version"], expect.any(Object));
      expect(result).toMatchObject({ ok: true, version: "0.144.2" });
    });

    it("rejects an unparseable Codex version", async () => {
      mockExecFileSync.mockReturnValue("codex development build");
      const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
      expect(result).toMatchObject({
        ok: false,
        reason: expect.stringContaining("could not parse Codex CLI version"),
        fix: "npm install -g @openai/codex@latest",
      });
    });

    it("treats a failing Codex version probe as incompatible", async () => {
      mockExecFileSync.mockImplementation(() => { throw new Error("exit code 1"); });
      const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
      expect(result).toMatchObject({
        ok: false,
        reason: expect.stringContaining("could not determine Codex CLI version"),
        fix: "npm install -g @openai/codex@latest",
      });
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

    it("fails when codex reports logged out with a non-zero status", async () => {
      mockExecFileSync.mockReturnValue("codex-cli 1.0.0" as unknown as Buffer);
      mockSpawnSync.mockReturnValue(spawnSyncResult(1, "", "Not logged in"));
      const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
      expect(result).toMatchObject({
        ok: false,
        version: "1.0.0",
        reason: "codex is not logged in",
      });
    });

    it("warns when the codex login probe errors", async () => {
      mockExecFileSync.mockReturnValue("codex-cli 1.0.0" as unknown as Buffer);
      mockSpawnSync.mockImplementation(() => { throw new Error("ETIMEDOUT"); });
      const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
      expect(result.ok).toBe(true);
      expect(result.version).toBe("1.0.0");
      expect(result.warning).toMatch(/OPENAI_API_KEY/);
    });

    it("does NOT warn when codex `login status` reports Logged in on stdout (codex ≤0.131)", async () => {
      mockExecFileSync.mockReturnValue("codex-cli 1.0.0" as unknown as Buffer);
      mockSpawnSync.mockReturnValue(spawnSyncResult(0, "Logged in using ChatGPT", ""));
      const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
      expect(result).toEqual({ ok: true, version: "1.0.0" });
    });

    it("does NOT warn when codex `login status` reports Logged in on stderr (codex 0.144+ regression)", async () => {
      mockExecFileSync.mockReturnValue("codex-cli 1.0.0" as unknown as Buffer);
      mockSpawnSync.mockReturnValue(spawnSyncResult(0, "", "Logged in using ChatGPT"));
      const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
      expect(result).toEqual({ ok: true, version: "1.0.0" });
    });

    it("fails when a zero-status codex login probe definitively reports logged out", async () => {
      mockExecFileSync.mockReturnValue("codex-cli 1.0.0" as unknown as Buffer);
      mockSpawnSync.mockReturnValue(spawnSyncResult(0, "Not logged in", ""));
      const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
      expect(result).toEqual({
        ok: false,
        reason: "codex is not logged in",
        fix: "Run `codex` and complete the ChatGPT sign-in, or set OPENAI_API_KEY",
        version: "1.0.0",
      });
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

describe("install fix hints", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("points codex installs at the npm package, not a download URL", async () => {
    const err = new Error("spawnSync codex ENOENT");
    mockExecFileSync.mockImplementation(() => { throw err; });
    const result = await checkReviewer("codex", { type: "cli", binary: "codex" });
    expect(result.ok).toBe(false);
    expect(result.fix).toBe("npm install -g @openai/codex@latest");
  });
});

describe("checkClaudePlugin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reports an enabled plugin and its version", () => {
    mockExecFileSync.mockReturnValue(JSON.stringify([
      { id: "inspectrum@inspectrum", version: "0.2.1", enabled: true, scope: "user" },
    ]));
    expect(checkClaudePlugin()).toEqual({ ok: true, version: "0.2.1" });
  });

  it("warns with an enable command when the plugin is disabled", () => {
    mockExecFileSync.mockReturnValue(JSON.stringify([
      { id: "inspectrum@inspectrum", version: "0.2.1", enabled: false },
    ]));
    expect(checkClaudePlugin()).toMatchObject({
      ok: true,
      version: "0.2.1",
      warning: expect.stringContaining("disabled"),
      fix: "claude plugin enable inspectrum@inspectrum",
    });
  });

  it("warns with install commands when the plugin is absent", () => {
    mockExecFileSync.mockReturnValue("[]");
    expect(checkClaudePlugin()).toMatchObject({
      ok: true,
      warning: expect.stringContaining("not installed"),
      fix: expect.stringContaining("claude plugin marketplace add yannmenec/inspectrum"),
    });
  });

  it.each(["not json", "{}"])("warns non-fatally for malformed plugin output: %s", (stdout) => {
    mockExecFileSync.mockReturnValue(stdout);
    expect(checkClaudePlugin()).toMatchObject({ ok: true, warning: expect.stringContaining("could not inspect") });
  });

  it("warns non-fatally when the Claude CLI probe fails", () => {
    mockExecFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    expect(checkClaudePlugin()).toMatchObject({ ok: true, warning: expect.stringContaining("could not inspect") });
  });
});
