import { execFileSync } from "node:child_process";
import type { ReviewerConfig } from "../schemas.js";

export interface HealthResult {
  ok: boolean;
  reason?: string;
  fix?: string;
}

export async function checkReviewer(id: string, config: ReviewerConfig): Promise<HealthResult> {
  if (config.type === "http") {
    return checkHttp(resolveHealthEndpoint(id, config));
  }
  return checkCli(id, config.binary ?? id);
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
  try {
    execFileSync(binary, ["--version"], { timeout: 5000, encoding: "utf8" });
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      return {
        ok: false,
        reason: `${binary} not found in PATH`,
        fix: installFix(id),
      };
    }
    // Binary present but version check failed (auth, permissions, etc.) — optimistic
    return { ok: true };
  }
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
    codex: "Install Codex: https://codex.com/download",
    gemini: "Install Gemini CLI: npm install -g @google/gemini-cli",
    kimi: "Install Kimi CLI: uv tool install --python 3.13 kimi-cli",
    qwen: "Install Qwen Code CLI: npm install -g @qwen-code/qwen-code@latest",
    ollama: "Start Ollama: brew install ollama && ollama serve",
    openrouter: "Set OPENROUTER_API_KEY env var: https://openrouter.ai/keys",
  };
  return fixes[id] ?? `Install the ${id} CLI and ensure it is in your PATH`;
}
