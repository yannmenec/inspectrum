import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import { buildUserMessage, runHttpBackendJsonReview, truncatePlan } from "./common.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";
import type { Reviewer } from "./index.js";

// OpenAI-compatible chat completions API via openrouter.ai
// Auth: OPENROUTER_API_KEY env var (read at call time, not constructor)
// Default model: anthropic/claude-sonnet-4-6
// Default endpoint: https://openrouter.ai/api/v1
export class OpenRouterReviewer implements Reviewer {
  constructor(
    public readonly id: string,
    private readonly config: ReviewerConfig,
    private readonly timeoutMs = 60_000,
  ) {}

  async review(plan: string, focus: string, context?: string): Promise<RawReview> {
    return runHttpBackendJsonReview({
      backend: "openrouter",
      reviewerId: this.id,
      config: this.config,
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      userMessage: buildUserMessage(this.id, truncatePlan(plan), focus, context),
      timeoutMs: this.timeoutMs,
      label: "OpenRouter",
    });
  }
}
