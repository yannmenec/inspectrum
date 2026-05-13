import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import { buildUserMessage, runBackendJsonReview, truncatePlan } from "./common.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";
import type { Reviewer } from "./index.js";

// ASSUMPTION: qwen CLI (npm install -g @qwenlm/qwen-code) uses:
//   qwen -m <model> -p <systemPrompt>
//   stdin = userMessage, stdout = JSON or markdown-fenced JSON
// Auth: DASHSCOPE_API_KEY env var (CLI reads automatically)
// If actual CLI flags differ, update runQwenJsonReview in common.ts.
export class QwenReviewer implements Reviewer {
  constructor(
    public readonly id: string,
    private readonly config: ReviewerConfig,
    private readonly timeoutMs = 60_000,
  ) {}

  async review(plan: string, focus: string, context?: string): Promise<RawReview> {
    return runBackendJsonReview({
      backend: "qwen",
      reviewerId: this.id,
      config: this.config,
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      userMessage: buildUserMessage(this.id, truncatePlan(plan), focus, context),
      timeoutMs: this.timeoutMs,
      label: "Qwen",
    });
  }
}
