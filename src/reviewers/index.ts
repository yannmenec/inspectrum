import type { RawReview, ReviewerConfig } from "../schemas.js";
import { ClaudeReviewer } from "./claude.js";
import { CodexReviewer } from "./codex.js";
import { GeminiReviewer } from "./gemini.js";
import { OllamaReviewer } from "./ollama.js";
import { OpenRouterReviewer } from "./openrouter.js";
import { KimiReviewer } from "./kimi.js";
import { QwenReviewer } from "./qwen.js";
import { resolveReviewerBackend } from "./common.js";

export interface Reviewer {
  id: string;
  review(plan: string, focus: string, context?: string): Promise<RawReview>;
}

export function createReviewer(id: string, config: ReviewerConfig): Reviewer {
  const backend = resolveReviewerBackend(id, config);
  if (backend === "claude") return new ClaudeReviewer(id, config);
  if (backend === "codex") return new CodexReviewer(id, config);
  if (backend === "ollama") return new OllamaReviewer(id, config);
  if (backend === "openrouter") return new OpenRouterReviewer(id, config);
  if (backend === "kimi") return new KimiReviewer(id, config);
  if (backend === "qwen") return new QwenReviewer(id, config);
  return new GeminiReviewer(id, config);
}

export { ClaudeReviewer, CodexReviewer, GeminiReviewer, OllamaReviewer, OpenRouterReviewer, KimiReviewer, QwenReviewer };
