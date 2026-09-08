import type { Config, RawReview, ReviewerConfig } from "../schemas.js";
import { ClaudeReviewer } from "./claude.js";
import { CodexReviewer } from "./codex.js";
import { GeminiReviewer } from "./gemini.js";
import { OllamaReviewer } from "./ollama.js";
import { OpenRouterReviewer } from "./openrouter.js";
import { KimiReviewer } from "./kimi.js";
import { QwenReviewer } from "./qwen.js";
import { MuseReviewer } from "./muse.js";
import { OpencodeReviewer } from "./opencode.js";
import { assertUnhandledBackend, resolveReviewerBackend } from "./common.js";

export interface Reviewer {
  id: string;
  review(plan: string, focus: string, context?: string): Promise<RawReview>;
}

export function createReviewer(id: string, config: ReviewerConfig, limits?: Config["limits"]): Reviewer {
  const backend = resolveReviewerBackend(id, config);
  const timeoutMs = (config.timeout_seconds ?? limits?.timeout_seconds ?? 300) * 1000;
  if (backend === "claude") return new ClaudeReviewer(id, config, timeoutMs);
  if (backend === "codex") return new CodexReviewer(id, config, timeoutMs);
  if (backend === "ollama") return new OllamaReviewer(id, config, timeoutMs);
  if (backend === "openrouter") return new OpenRouterReviewer(id, config, timeoutMs);
  if (backend === "kimi") return new KimiReviewer(id, config, timeoutMs);
  if (backend === "qwen") return new QwenReviewer(id, config, timeoutMs);
  if (backend === "gemini") return new GeminiReviewer(id, config, timeoutMs);
  if (backend === "muse") return new MuseReviewer(id, config, timeoutMs);
  if (backend === "opencode") return new OpencodeReviewer(id, config, timeoutMs);
  return assertUnhandledBackend(backend);
}

export {
  ClaudeReviewer,
  CodexReviewer,
  GeminiReviewer,
  OllamaReviewer,
  OpenRouterReviewer,
  KimiReviewer,
  QwenReviewer,
  MuseReviewer,
  OpencodeReviewer,
};
