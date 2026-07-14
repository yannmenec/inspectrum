import { execFileSync, spawnSync } from "node:child_process";
import { ClaudePluginListSchema, type ReviewerConfig } from "../schemas.js";

export interface HealthResult {
  ok: boolean;
  reason?: string;
  fix?: string;
  /** Non-fatal advisory (e.g. peer-LLM auth env var missing). Does NOT toggle allOk. */
  warning?: string;
  version?: string;
}

export const MIN_CODEX_VERSION = "0.99.0";

// Env vars each CLI backend will look for when actually invoked. Entries are
// alternatives — if any one is set to a truthy value, auth is presumed present.
// Backends not in this map (e.g. ollama, local CLIs) are not checked.
const CLI_REVIEWER_ENV: Record<string, readonly string[]> = {
  claude: ["ANTHROPIC_API_KEY"],
  codex: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_USE_VERTEXAI"],
};

export async function checkReviewer(id: string, config: ReviewerConfig): Promise<HealthResult> {
  if (config.type === "http") {
    if (config.backend === "openrouter" && !process.env["OPENROUTER_API_KEY"]) {
      return {
        ok: false,
        reason: "OPENROUTER_API_KEY not set",
        fix: installFix("openrouter"),
      };
    }
    return checkHttp(resolveHealthEndpoint(id, config));
  }
  return checkCli(config.backend ?? id, config.binary ?? id);
}

function resolveHealthEndpoint(_id: string, config: ReviewerConfig): string {
  if (config.backend === "openrouter") {
    const base = (config.endpoint ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    return `${base}/models`;
  }
  if (config.backend === "ollama") {
    return (config.endpoint ?? "http://localhost:11434").replace(/\/$/, "");
  }
  return config.endpoint ?? "";
}

function checkCli(id: string, binary: string): HealthResult {
  let versionOutput = "";
  try {
    // stdio: ignore stderr — some CLIs (e.g. codex) print noise on --version
    versionOutput = String(execFileSync(binary, ["--version"], {
      timeout: 5000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      return {
        ok: false,
        reason: `${binary} not found in PATH`,
        fix: installFix(id),
      };
    }
    if (id === "codex") {
      return {
        ok: false,
        reason: "could not determine Codex CLI version",
        fix: installFix("codex"),
      };
    }
    // Binary present but version check failed (auth, permissions, etc.) — optimistic, fall through.
  }

  let version: string | undefined;
  if (id === "codex") {
    const parsed = parseCodexVersion(versionOutput);
    if (!parsed) {
      return {
        ok: false,
        reason: "could not parse Codex CLI version",
        fix: installFix("codex"),
      };
    }
    version = parsed.version;
    if (!isSupportedCodexVersion(parsed)) {
      return {
        ok: false,
        reason: `Codex CLI ${version} is incompatible; inspectrum requires Codex CLI >= ${MIN_CODEX_VERSION}`,
        fix: installFix("codex"),
        version,
      };
    }
  }

  const versionDetails = version ? { version } : {};
  // Binary appears to exist. Warn if the peer-LLM auth env var is missing AND we can't detect
  // an interactive OAuth login — Desktop MCP hosts often don't propagate API keys.
  const envs = CLI_REVIEWER_ENV[id];
  if (envs && !envs.some((k) => !!process.env[k])) {
    const oauthStatus = getOauthStatus(id, binary);
    if (oauthStatus === "logged-in") return { ok: true, ...versionDetails };
    if (id === "codex" && oauthStatus === "logged-out") {
      return {
        ok: false,
        reason: "codex is not logged in",
        fix: "Run `codex` and complete the ChatGPT sign-in, or set OPENAI_API_KEY",
        ...versionDetails,
      };
    }
    const envList = envs.length === 1 ? envs[0] : envs.join(" or ");
    return {
      ok: true,
      warning: `binary found but ${envList} not set — reviews will fail unless ${binary} has an OAuth login`,
      ...versionDetails,
    };
  }
  return { ok: true, ...versionDetails };
}

interface ParsedCodexVersion {
  version: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export function parseCodexVersion(output: string): ParsedCodexVersion | undefined {
  const match = output.trim().match(/^(?:codex|codex-cli)\s+v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/i);
  if (!match) return undefined;
  const prerelease = match[4];
  return {
    version: `${match[1]}.${match[2]}.${match[3]}${prerelease ? `-${prerelease}` : ""}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    ...(prerelease ? { prerelease } : {}),
  };
}

function isSupportedCodexVersion(version: ParsedCodexVersion): boolean {
  const current = [version.major, version.minor, version.patch];
  const minimum = [0, 99, 0];
  for (let i = 0; i < current.length; i += 1) {
    if (current[i]! > minimum[i]!) return true;
    if (current[i]! < minimum[i]!) return false;
  }
  return version.prerelease === undefined;
}

export function checkClaudePlugin(binary = "claude"): HealthResult {
  try {
    const output = String(execFileSync(binary, ["plugin", "list", "--json"], {
      timeout: 5000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }));
    const plugins = ClaudePluginListSchema.parse(JSON.parse(output));
    const plugin = plugins.find((entry) => entry.id === "inspectrum@inspectrum");
    if (!plugin) {
      return {
        ok: true,
        warning: "inspectrum@inspectrum is not installed (optional for MCP-only users)",
        fix: "claude plugin marketplace add yannmenec/inspectrum && claude plugin install inspectrum@inspectrum",
      };
    }
    if (!plugin.enabled) {
      return {
        ok: true,
        version: plugin.version,
        warning: "inspectrum@inspectrum is installed but disabled",
        fix: "claude plugin enable inspectrum@inspectrum",
      };
    }
    return { ok: true, version: plugin.version };
  } catch {
    return {
      ok: true,
      warning: "could not inspect the Claude Code plugin (optional for MCP-only users)",
    };
  }
}

type OauthStatus = "logged-in" | "logged-out" | "unknown";

// Detect when a CLI is authenticated via its own OAuth flow (no env var set). Only
// implemented per-backend where the CLI exposes a quick non-interactive probe.
function getOauthStatus(id: string, binary: string): OauthStatus {
  if (id === "codex") {
    try {
      // codex ≤0.131 printed the status to stdout; 0.144+ prints to stderr.
      // spawnSync (not execFileSync) because we need both streams on success.
      const out = spawnSync(binary, ["login", "status"], {
        timeout: 5000,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (out.status !== 0) return "unknown";
      const output = `${out.stdout ?? ""}${out.stderr ?? ""}`;
      if (/not logged in/i.test(output)) return "logged-out";
      return /logged in/i.test(output) ? "logged-in" : "logged-out";
    } catch {
      return "unknown";
    }
  }
  // claude has no equivalent `claude login status` CLI subcommand (state lives in the
  // macOS keychain). gemini auth state likewise requires a heavier probe. Skip both
  // here — the warning copy already covers OAuth-logged-in users.
  return "unknown";
}

async function checkHttp(endpoint: string): Promise<HealthResult> {
  if (!endpoint) {
    return { ok: false, reason: "No endpoint configured" };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(endpoint, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok || res.status === 405 ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` };
  } catch {
    return { ok: false, reason: `Cannot reach ${endpoint}` };
  }
}

function installFix(id: string): string {
  const fixes: Record<string, string> = {
    claude: "Install Claude Code: https://claude.ai/download",
    codex: "npm install -g @openai/codex@latest",
    gemini: "Install Gemini CLI: npm install -g @google/gemini-cli",
    kimi: "Install Kimi CLI: uv tool install --python 3.13 kimi-cli",
    qwen: "Install Qwen Code CLI: npm install -g @qwen-code/qwen-code@latest",
    ollama: "Start Ollama: brew install ollama && ollama serve",
    openrouter: "Set OPENROUTER_API_KEY env var: https://openrouter.ai/keys",
  };
  return fixes[id] ?? `Install the ${id} CLI and ensure it is in your PATH`;
}
