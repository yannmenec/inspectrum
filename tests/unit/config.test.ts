import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadConfig, defaultConfig } from "../../src/config.js";
import * as fs from "node:fs";

vi.mock("node:fs");
const mockFs = vi.mocked(fs);

describe("loadConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns defaultConfig when config file does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    const config = loadConfig();
    expect(config).toEqual(defaultConfig);
  });

  it("merges a partial TOML config over defaults", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(`
[defaults]
reviewers = ["codex", "gemini"]
judge = "codex"
`);
    const config = loadConfig();
    expect(config.defaults.reviewers).toEqual(["codex", "gemini"]);
    expect(config.defaults.judge).toBe("codex");
    expect(config.limits).toEqual({ report_max_chars: 8000, timeout_seconds: 300 });
  });

  it("strips the legacy plan_max_chars key while preserving live limits", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(`
[limits]
plan_max_chars = 500
timeout_seconds = 10
`);
    const config = loadConfig();
    expect(config.limits).not.toHaveProperty("plan_max_chars");
    expect(config.limits.timeout_seconds).toBe(10);
  });

  it("throws on invalid TOML", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("this is not valid toml = = =");
    expect(() => loadConfig()).toThrow();
  });

  it("throws on unknown config version", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("version = 99\n");
    expect(() => loadConfig()).toThrow(/version/i);
  });
});

describe("loadConfig — v0.2 defaults and reviewer merge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("defaults to codex as the sole reviewer with a 300s timeout", () => {
    mockFs.existsSync.mockReturnValue(false);
    const config = loadConfig();
    expect(config.defaults.reviewers).toEqual(["codex"]);
    expect(config.limits.timeout_seconds).toBe(300);
    expect(config.reviewers["codex"]!.args).toEqual(["exec", "--ephemeral"]);
  });

  it("keeps built-in reviewers when the TOML declares a custom one", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(`
[reviewers.local]
type = "http"
backend = "ollama"
`);
    const config = loadConfig();
    expect(Object.keys(config.reviewers).sort()).toEqual(["claude", "codex", "gemini", "local"]);
  });

  it("lets a same-id user entry fully replace the built-in entry", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(`
[reviewers.codex]
model = "gpt-5.6-sol"
effort = "high"
timeout_seconds = 120
`);
    const config = loadConfig();
    expect(config.reviewers["codex"]).toEqual({
      type: "cli",
      model: "gpt-5.6-sol",
      effort: "high",
      timeout_seconds: 120,
    });
  });

  it("defaults reviewer type to cli so effort-only entries parse", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(`
[reviewers.codex]
effort = "ultra"
`);
    const config = loadConfig();
    expect(config.reviewers["codex"]!.type).toBe("cli");
    expect(config.reviewers["codex"]!.effort).toBe("ultra");
  });
});
