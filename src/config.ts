import * as fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import TOML from "@iarna/toml";
import type { ZodError } from "zod";
import { ConfigSchema, type Config } from "./schemas.js";

export type { Config };

const SUPPORTED_VERSIONS = [1];
// An MCP host may relay nothing but "Server disconnected", so the whole diagnosis has
// to fit in a log line the user will actually read. Cap the issue list (#67).
const MAX_REPORTED_ISSUES = 10;

export const defaultConfig: Config = ConfigSchema.parse({});

/**
 * A config file that exists but cannot be used. Its message is written verbatim to
 * stderr, so it must stay legible on its own: no stack trace, no ZodError dump (#67).
 */
export class ConfigError extends Error {
  readonly configPath: string;

  constructor(configPath: string, detail: string) {
    super(`invalid configuration in ${configPath}\n${detail}`);
    this.name = "ConfigError";
    this.configPath = configPath;
  }
}

export function getConfigPath(): string {
  return join(homedir(), ".inspectrum", "config.toml");
}

function valueAtPath(root: unknown, path: readonly PropertyKey[]): unknown {
  let current = root;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

function formatIssues(issues: ZodError["issues"], parsed: unknown): string {
  const lines = issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => {
    const key = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    const value = valueAtPath(parsed, issue.path);
    const rendered = value === undefined ? "(missing)" : JSON.stringify(value);
    // Zod's own enum message escapes the options as "a"|"b"; spell them out instead.
    const expected =
      "values" in issue && Array.isArray(issue.values)
        ? `expected one of ${issue.values.map((option) => JSON.stringify(option)).join(", ")}`
        : issue.message;
    return `  ${key} = ${rendered} — ${expected}`;
  });
  if (issues.length > MAX_REPORTED_ISSUES) lines.push("  [...truncated]");
  return lines.join("\n");
}

export function loadConfig(configPath?: string): Config {
  const path = configPath ?? getConfigPath();

  if (!fs.existsSync(path)) {
    return defaultConfig;
  }

  const raw = fs.readFileSync(path, "utf8");

  // Each failure kind is handled on its own so none of them can swallow the others:
  // a malformed file, a rejected version, and a schema violation stay distinct, and
  // an unexpected error propagates untouched rather than posing as a config error.
  let parsed: Record<string, unknown>;
  try {
    parsed = TOML.parse(raw);
  } catch (err) {
    throw new ConfigError(path, `  ${err instanceof Error ? err.message : String(err)}`);
  }

  const version = typeof parsed["version"] === "number" ? parsed["version"] : 1;
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(`Unsupported config version ${version}. Supported: ${SUPPORTED_VERSIONS.join(", ")}`);
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(path, formatIssues(result.error.issues, parsed));
  }

  const config = result.data;
  // A [reviewers] table in TOML replaces the whole default record (Zod defaults
  // only apply when the key is absent). Merge built-ins back under user entries
  // so declaring one custom reviewer doesn't silently drop claude/codex/gemini.
  // A user entry with the same id still fully replaces the built-in one.
  return { ...config, reviewers: { ...defaultConfig.reviewers, ...config.reviewers } };
}

/**
 * Startup boundary for the MCP server: fail closed on a bad config, but with a message
 * a human can act on. Silently falling back to defaults would run reviews with a
 * reviewer set and timeouts the user never configured (#67).
 */
export function loadConfigOrExit(): Config {
  try {
    return loadConfig();
  } catch (err) {
    process.stderr.write(`inspectrum: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
