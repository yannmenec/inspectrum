import * as fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import TOML from "@iarna/toml";
import { z } from "zod";
import { ReviewerConfigSchema } from "./schemas.js";

const SUPPORTED_VERSIONS = [1];

const ConfigSchema = z.object({
  version: z.number().int().default(1),
  defaults: z
    .object({
      reviewers: z.array(z.string()).default(["claude"]),
      judge: z.string().default("claude"),
      focus: z.enum(["correctness", "completeness", "risk", "clarity", "all"]).default("all"),
    })
    .default({ reviewers: ["claude"], judge: "claude", focus: "all" }),
  reviewers: z
    .record(z.string(), ReviewerConfigSchema)
    .default({
      claude: { type: "cli", binary: "claude", args: ["-p", "--output-format", "json", "--no-session-persistence"] },
      codex: { type: "cli", binary: "codex", args: ["exec", "--ephemeral", "--json"] },
      gemini: { type: "cli", binary: "gemini", args: ["--prompt", "-"] },
    }),
  limits: z
    .object({
      plan_max_chars: z.number().int().default(16000),
      report_max_chars: z.number().int().default(8000),
      timeout_seconds: z.number().int().default(60),
    })
    .default({ plan_max_chars: 16000, report_max_chars: 8000, timeout_seconds: 60 }),
});

export type Config = z.infer<typeof ConfigSchema>;

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

  return ConfigSchema.parse(parsed);
}
