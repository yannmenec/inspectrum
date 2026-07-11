import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";

vi.mock("node:fs");
vi.mock("node:os", () => ({ homedir: () => "/home/test" }));

vi.mock("../../src/reviewers/health.js", () => ({
  checkReviewer: vi.fn(),
}));

vi.mock("../../src/config.js", () => ({
  loadConfig: vi.fn(),
  getConfigPath: vi.fn().mockReturnValue("/home/test/.inspectrum/config.toml"),
  defaultConfig: {
    reviewers: {
      claude: { type: "cli", binary: "claude" },
    },
    defaults: { reviewers: ["claude"], judge: "claude", focus: "all" },
    limits: { plan_max_chars: 16000, report_max_chars: 8000, timeout_seconds: 60 },
    version: 1,
  },
}));

import { runDoctor, resolveCodexRuntime } from "../../src/doctor.js";
import { checkReviewer } from "../../src/reviewers/health.js";
import { loadConfig, defaultConfig } from "../../src/config.js";

const mockCheckReviewer = vi.mocked(checkReviewer);
const mockLoadConfig = vi.mocked(loadConfig);
const mockFs = vi.mocked(fs);

const HEALTHY_CONFIG = {
  reviewers: {
    claude: { type: "cli" as const, binary: "claude" },
  },
  defaults: { reviewers: ["claude"], judge: "claude", focus: "all" as const },
  limits: { plan_max_chars: 16000, report_max_chars: 8000, timeout_seconds: 60 },
  version: 1,
};

describe("runDoctor", () => {
  let output: string;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      output += String(s);
      return true;
    });
    // Default: config file present, sessions dir writable, all reviewers ok
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.accessSync.mockReturnValue(undefined);
    mockCheckReviewer.mockResolvedValue({ ok: true });
  });

  it("returns true when config valid, sessions writable, all reviewers ok", async () => {
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);
    mockCheckReviewer.mockResolvedValue({ ok: true });

    const result = await runDoctor();

    expect(result).toBe(true);
    expect(mockCheckReviewer).toHaveBeenCalledWith("claude", HEALTHY_CONFIG.reviewers.claude);
  });

  it("returns false when config file is invalid (loadConfig throws)", async () => {
    mockLoadConfig.mockImplementation(() => { throw new Error("invalid TOML"); });

    const result = await runDoctor();

    expect(result).toBe(false);
    expect(output).toContain("invalid TOML");
  });

  it("skips reviewer checks when config is present but invalid", async () => {
    mockLoadConfig.mockImplementation(() => { throw new Error("bad config"); });

    await runDoctor();

    // Reviewer section skipped — user must fix config first
    expect(mockCheckReviewer).not.toHaveBeenCalled();
    expect(output).toContain("skipped");
  });

  it("returns false when sessions dir is not writable", async () => {
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);
    mockFs.accessSync.mockImplementation(() => { throw new Error("EACCES"); });
    mockCheckReviewer.mockResolvedValue({ ok: true });

    const result = await runDoctor();

    expect(result).toBe(false);
    expect(output).toContain("sessions");
  });

  it("returns false when a reviewer CLI is missing, and shows reason + fix", async () => {
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);
    mockCheckReviewer.mockResolvedValue({
      ok: false,
      reason: "claude not found in PATH",
      fix: "Install Claude Code: https://claude.ai/download",
    });

    const result = await runDoctor();

    expect(result).toBe(false);
    expect(output).toContain("claude not found in PATH");
    expect(output).toContain("https://claude.ai/download");
  });

  it("returns false when reviewer has no fix hint, still shows reason", async () => {
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);
    mockCheckReviewer.mockResolvedValue({ ok: false, reason: "connection refused" });

    const result = await runDoctor();

    expect(result).toBe(false);
    expect(output).toContain("connection refused");
  });

  it("prints Config, Sessions, and Reviewers section headers", async () => {
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);
    mockCheckReviewer.mockResolvedValue({ ok: true });

    await runDoctor();

    expect(output).toContain("Config");
    expect(output).toContain("Sessions");
    expect(output).toContain("Reviewers");
  });

  it("handles multiple reviewers — partial failure returns false", async () => {
    mockLoadConfig.mockReturnValue({
      ...HEALTHY_CONFIG,
      defaults: { reviewers: ["claude", "codex"], judge: "claude", focus: "all" as const },
      reviewers: {
        claude: { type: "cli" as const, binary: "claude" },
        codex: { type: "cli" as const, binary: "codex" },
      },
    });
    mockCheckReviewer
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "codex not found" });

    const result = await runDoctor();

    expect(result).toBe(false);
    expect(mockCheckReviewer).toHaveBeenCalledTimes(2);
  });

  it("scopes failure to active reviewers only — optional reviewer missing does not toggle allOk", async () => {
    // defaults.reviewers = ["claude"] (single, no judge requirement);
    // codex/gemini are configured but inactive.
    mockLoadConfig.mockReturnValue({
      ...HEALTHY_CONFIG,
      defaults: { reviewers: ["claude"], judge: "claude", focus: "all" as const },
      reviewers: {
        claude: { type: "cli" as const, binary: "claude" },
        codex: { type: "cli" as const, binary: "codex" },
        gemini: { type: "cli" as const, binary: "gemini" },
      },
    });
    mockCheckReviewer.mockImplementation(async (id: string) => {
      if (id === "claude") return { ok: true };
      return { ok: false, reason: `${id} not found` };
    });

    const result = await runDoctor();

    expect(result).toBe(true);
    expect(output).toContain("Optional reviewers");
    expect(output).toContain("codex not found");
    expect(output).toContain("gemini not found");
  });

  it("requires judge as active when defaults.reviewers >= 2", async () => {
    // defaults.reviewers has 2 entries; judge is "claude" which is also one of them.
    // But if judge is a different id that's missing, it should fail.
    mockLoadConfig.mockReturnValue({
      ...HEALTHY_CONFIG,
      defaults: { reviewers: ["codex", "gemini"], judge: "claude", focus: "all" as const },
      reviewers: {
        claude: { type: "cli" as const, binary: "claude" },
        codex: { type: "cli" as const, binary: "codex" },
        gemini: { type: "cli" as const, binary: "gemini" },
      },
    });
    mockCheckReviewer.mockImplementation(async (id: string) => {
      if (id === "claude") return { ok: false, reason: "claude missing" };
      return { ok: true };
    });

    const result = await runDoctor();

    // claude is active (as judge) and missing → allOk false
    expect(result).toBe(false);
    expect(output).toContain("claude missing");
  });

  it("does NOT require judge when defaults.reviewers has only 1 entry", async () => {
    mockLoadConfig.mockReturnValue({
      ...HEALTHY_CONFIG,
      defaults: { reviewers: ["codex"], judge: "claude", focus: "all" as const },
      reviewers: {
        claude: { type: "cli" as const, binary: "claude" },
        codex: { type: "cli" as const, binary: "codex" },
      },
    });
    mockCheckReviewer.mockImplementation(async (id: string) => {
      if (id === "codex") return { ok: true };
      // claude (judge) is missing but inactive when reviewer count == 1
      return { ok: false, reason: `${id} missing` };
    });

    const result = await runDoctor();

    expect(result).toBe(true);
  });

  it("prints 'no config file (defaults applied)' when config file absent", async () => {
    mockFs.existsSync.mockReturnValue(false);
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);

    const result = await runDoctor();

    expect(result).toBe(true);
    expect(output).toContain("no config file");
    expect(output).toContain("defaults applied");
  });

  it("fails when defaults.reviewers references an id with no config entry", async () => {
    mockLoadConfig.mockReturnValue({
      ...HEALTHY_CONFIG,
      defaults: { reviewers: ["mystery-reviewer"], judge: "claude", focus: "all" as const },
      reviewers: {
        claude: { type: "cli" as const, binary: "claude" },
      },
    });

    const result = await runDoctor();

    expect(result).toBe(false);
    expect(output).toContain("no active reviewer config");
  });

  it("passes custom configPath to loadConfig", async () => {
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);
    mockCheckReviewer.mockResolvedValue({ ok: true });

    await runDoctor("/custom/path/config.toml");

    expect(mockLoadConfig).toHaveBeenCalledWith("/custom/path/config.toml");
  });

  it("prints Runtime section with current Node version", async () => {
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);

    await runDoctor();

    expect(output).toContain("Runtime");
    expect(output).toContain(process.versions.node);
  });

  it("returns false when Node version is below 20", async () => {
    const prevDescriptor = Object.getOwnPropertyDescriptor(process, "versions");
    Object.defineProperty(process, "versions", {
      value: { ...process.versions, node: "18.0.0" },
      configurable: true,
    });
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);

    try {
      const result = await runDoctor();
      expect(result).toBe(false);
      expect(output).toContain("18.0.0");
      expect(output).toContain("≥ 20");
    } finally {
      if (prevDescriptor) {
        Object.defineProperty(process, "versions", prevDescriptor);
      }
    }
  });

  it("converts non-Error thrown values to string when loadConfig throws", async () => {
    mockLoadConfig.mockImplementation(() => { throw "bare string error"; });

    const result = await runDoctor();

    expect(result).toBe(false);
    expect(output).toContain("bare string error");
  });

  it("renders warning (⚠) for active reviewer but does NOT toggle allOk", async () => {
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);
    mockCheckReviewer.mockResolvedValue({
      ok: true,
      warning: "binary found but ANTHROPIC_API_KEY not set — reviews will fail unless claude has an OAuth login",
    });

    const result = await runDoctor();

    expect(result).toBe(true);
    expect(output).toContain("⚠");
    expect(output).toContain("ANTHROPIC_API_KEY");
  });

  it("renders warning (⚠) for optional reviewer without toggling allOk", async () => {
    mockLoadConfig.mockReturnValue({
      ...HEALTHY_CONFIG,
      defaults: { reviewers: ["claude"], judge: "claude", focus: "all" as const },
      reviewers: {
        claude: { type: "cli" as const, binary: "claude" },
        codex: { type: "cli" as const, binary: "codex" },
      },
    });
    mockCheckReviewer.mockImplementation(async (id: string) => {
      if (id === "claude") return { ok: true };
      return { ok: true, warning: "binary found but OPENAI_API_KEY not set — reviews will fail unless codex has an OAuth login" };
    });

    const result = await runDoctor();

    expect(result).toBe(true);
    expect(output).toContain("Optional reviewers");
    expect(output).toContain("⚠");
    expect(output).toContain("OPENAI_API_KEY");
  });

  it("produces colored output when isTTY is true and NO_COLOR is unset", async () => {
    const prevIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    const prevNoColor = process.env["NO_COLOR"];
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    delete process.env["NO_COLOR"];
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);

    try {
      const result = await runDoctor();
      expect(result).toBe(true);
      expect(output).toContain("\x1b["); // at least one ANSI sequence present
    } finally {
      if (prevIsTTYDescriptor) {
        Object.defineProperty(process.stdout, "isTTY", prevIsTTYDescriptor);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (process.stdout as Record<string, unknown>)["isTTY"];
      }
      if (prevNoColor === undefined) {
        delete process.env["NO_COLOR"];
      } else {
        process.env["NO_COLOR"] = prevNoColor;
      }
    }
  });
});

describe("resolveCodexRuntime", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("prefers inspectrum reviewer config over the codex config file", () => {
    mockFs.readFileSync.mockReturnValue('model = "gpt-other"\nmodel_reasoning_effort = "low"\n' as never);
    const runtime = resolveCodexRuntime({ type: "cli", model: "gpt-5.6-sol", effort: "high" });
    expect(runtime.model).toEqual({ value: "gpt-5.6-sol", source: "~/.inspectrum/config.toml" });
    expect(runtime.effort).toEqual({ value: "high", source: "~/.inspectrum/config.toml" });
  });

  it("falls back to ~/.codex/config.toml when inspectrum leaves model/effort unset", () => {
    mockFs.readFileSync.mockReturnValue('model = "gpt-5.6-sol"\nmodel_reasoning_effort = "ultra"\n' as never);
    const runtime = resolveCodexRuntime({ type: "cli" });
    expect(runtime.model).toEqual({ value: "gpt-5.6-sol", source: "~/.codex/config.toml" });
    expect(runtime.effort).toEqual({ value: "ultra", source: "~/.codex/config.toml" });
  });

  it("reports codex defaults when neither config sets anything", () => {
    mockFs.readFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    const runtime = resolveCodexRuntime({ type: "cli" });
    expect(runtime.model).toEqual({ value: "unset", source: "codex default" });
    expect(runtime.effort).toEqual({ value: "unset", source: "codex default" });
  });

  it("survives an unparseable codex config file", () => {
    mockFs.readFileSync.mockReturnValue("not = = valid toml" as never);
    const runtime = resolveCodexRuntime({ type: "cli", effort: "medium" });
    expect(runtime.model).toEqual({ value: "unset", source: "codex default" });
    expect(runtime.effort).toEqual({ value: "medium", source: "~/.inspectrum/config.toml" });
  });
});

describe("runDoctor codex runtime display", () => {
  let output: string;

  beforeEach(() => {
    vi.resetAllMocks();
    output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      output += String(s);
      return true;
    });
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.accessSync.mockReturnValue(undefined);
    mockFs.readFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    mockCheckReviewer.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints resolved model/effort for an active codex reviewer", async () => {
    mockLoadConfig.mockReturnValue({
      ...HEALTHY_CONFIG,
      reviewers: { codex: { type: "cli" as const, binary: "codex", model: "gpt-5.6-sol", effort: "high" } },
      defaults: { reviewers: ["codex"], judge: "claude", focus: "all" as const },
    });
    const result = await runDoctor();
    expect(result).toBe(true);
    expect(output).toContain("model:  gpt-5.6-sol (~/.inspectrum/config.toml)");
    expect(output).toContain("effort: high (~/.inspectrum/config.toml)");
  });

  it("prints no codex runtime lines for non-codex reviewers", async () => {
    mockLoadConfig.mockReturnValue(HEALTHY_CONFIG);
    await runDoctor();
    expect(output).not.toContain("effort:");
  });
});
