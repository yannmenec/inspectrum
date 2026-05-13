import type { RawReview, ReviewerConfig } from "../schemas.js";
import { ClaudeReviewer } from "./claude.js";
import { CodexReviewer } from "./codex.js";
import { GeminiReviewer } from "./gemini.js";
import { resolveReviewerBackend } from "./common.js";

export interface Reviewer {
  id: string;
  review(plan: string, focus: string, context?: string): Promise<RawReview>;
}

export function createReviewer(id: string, config: ReviewerConfig): Reviewer {
  const backend = resolveReviewerBackend(id, config);
  if (backend === "claude") {
    return new ClaudeReviewer(id, config);
  }
  if (backend === "codex") {
    return new CodexReviewer(id, config);
  }
  return new GeminiReviewer(id, config);
}

export { ClaudeReviewer, CodexReviewer, GeminiReviewer };
