import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ZodError } from "zod";
import { ConfigError, loadConfig, loadConfigOrExit, defaultConfig } from "../../src/config.js";
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

  // Regression guard, green before and after #67: the version check stays a plain
  // Error and must not be swallowed by the new ZodError handling.
  it("throws on unknown config version", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("version = 99\n");
    expect(() => loadConfig()).toThrow(/version/i);
  });
});

const PROBE_PATH = "/tmp/probe-home/.inspectrum/config.toml";

function loadError(toml: string): Error {
  mockFs.existsSync.mockReturnValue(true);
  mockFs.readFileSync.mockReturnValue(toml);
  try {
    loadConfig(PROBE_PATH);
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig — readable config errors (#67)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reports key path, bad value and accepted values instead of a raw ZodError crash (#67)", () => {
    const err = loadError('[reviewers.codex]\ntype = "nonsense"\n');

    expect(err).toBeInstanceOf(ConfigError);
    expect(err).not.toBeInstanceOf(ZodError);
    expect(err.message).toContain(PROBE_PATH);
    expect(err.message).toContain("reviewers.codex.type");
    expect(err.message).toContain('"nonsense"');
    expect(err.message).toContain('"cli"');
    expect(err.message).toContain('"http"');
    expect(err.message).not.toContain("ZodError");
  });

  it("reports one line per invalid key", () => {
    const err = loadError(
      '[reviewers.codex]\ntype = "nonsense"\n\n[limits]\ntimeout_seconds = "soon"\n',
    );

    const lines = err.message.split("\n").slice(1);
    expect(lines).toHaveLength(2);
    expect(err.message).toContain("reviewers.codex.type");
    expect(err.message).toContain("limits.timeout_seconds");
  });

  it("caps the issue list and marks it truncated", () => {
    const bad = Array.from(
      { length: 12 },
      (_, index) => `[reviewers.r${index}]\ntype = "nonsense"\n`,
    ).join("\n");
    const err = loadError(bad);

    const lines = err.message.split("\n").slice(1);
    expect(lines).toHaveLength(11);
    expect(lines.at(-1)).toContain("[...truncated]");
  });

  it("names the file and the parser reason on malformed TOML, without a stack trace", () => {
    const err = loadError("this is not valid toml = = =");

    expect(err).toBeInstanceOf(ConfigError);
    expect(err.message).toContain(PROBE_PATH);
    expect(err.message.split("\n").length).toBeGreaterThan(1);
    expect(err.message).not.toContain("    at ");
  });
});

describe("loadConfigOrExit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the config when it is valid", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(loadConfigOrExit()).toEqual(defaultConfig);
  });

  it("writes a readable message to stderr and exits 1 without continuing (#67)", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('[reviewers.codex]\ntype = "nonsense"\n');
    // Sentinel: the real process.exit never returns, so the mock must not either —
    // otherwise the caller would carry on with an unassigned config.
    const exited = new Error("process.exit");
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {
        throw exited;
      }) as unknown as (code?: number) => never);
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    expect(() => loadConfigOrExit()).toThrow(exited);
    expect(exit).toHaveBeenCalledWith(1);

    const output = write.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain("inspectrum:");
    expect(output).toContain("reviewers.codex.type");
    expect(output).not.toContain("ZodError");
    expect(output).not.toContain("    at ");
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
