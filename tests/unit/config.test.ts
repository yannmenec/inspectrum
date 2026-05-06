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
    expect(config.limits.plan_max_chars).toBe(16000);
  });

  it("respects hard limits when overridden in TOML", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(`
[limits]
plan_max_chars = 500
timeout_seconds = 10
`);
    const config = loadConfig();
    expect(config.limits.plan_max_chars).toBe(500);
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
