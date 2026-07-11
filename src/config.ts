import * as fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import TOML from "@iarna/toml";
import { ConfigSchema, type Config } from "./schemas.js";

export type { Config };

const SUPPORTED_VERSIONS = [1];

export const defaultConfig: Config = ConfigSchema.parse({});

export function getConfigPath(): string {
  return join(homedir(), ".inspectrum", "config.toml");
}

export function loadConfig(configPath?: string): Config {
  const path = configPath ?? getConfigPath();

  if (!fs.existsSync(path)) {
    return defaultConfig;
  }

  const raw = fs.readFileSync(path, "utf8");
  const parsed = TOML.parse(raw);

  const version = typeof parsed["version"] === "number" ? parsed["version"] : 1;
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(`Unsupported config version ${version}. Supported: ${SUPPORTED_VERSIONS.join(", ")}`);
  }

  const config = ConfigSchema.parse(parsed);
  // A [reviewers] table in TOML replaces the whole default record (Zod defaults
  // only apply when the key is absent). Merge built-ins back under user entries
  // so declaring one custom reviewer doesn't silently drop claude/codex/gemini.
  // A user entry with the same id still fully replaces the built-in one.
  return { ...config, reviewers: { ...defaultConfig.reviewers, ...config.reviewers } };
}
