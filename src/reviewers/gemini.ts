import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import {
  buildUserMessage,
  runBackendJsonReview,
  truncatePlan,
} from "./common.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";
import type { Reviewer } from "./index.js";

export class GeminiReviewer implements Reviewer {
  constructor(
    public readonly id: string,
    private readonly config: ReviewerConfig,
    private readonly timeoutMs = 60_000,
  ) {}

  async review(plan: string, focus: string, context?: string): Promise<RawReview> {
    return runBackendJsonReview({
      backend: "gemini",
      reviewerId: this.id,
      config: this.config,
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      userMessage: buildUserMessage(this.id, truncatePlan(plan), focus, context),
      timeoutMs: this.timeoutMs,
      label: "Gemini",
    });
  }
}
