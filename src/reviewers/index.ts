import type { RawReview, ReviewerConfig } from "../schemas.js";
import { ClaudeReviewer } from "./claude.js";

export interface Reviewer {
  id: string;
  review(plan: string, focus: string, context?: string): Promise<RawReview>;
}

export function createReviewer(id: string, config: ReviewerConfig): Reviewer {
  if (config.type === "cli" && (config.binary === "claude" || id === "claude")) {
    return new ClaudeReviewer(id, config);
  }
  // Stub for codex/gemini (J2)
  throw new Error(`Reviewer backend "${id}" not yet implemented (coming in J2)`);
}

export { ClaudeReviewer };
