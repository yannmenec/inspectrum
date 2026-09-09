import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import { buildUserMessage, runBackendJsonReview, truncatePlan } from "./common.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";
import type { Reviewer } from "./index.js";

/**
 * agy reviewer. Contract verified against the real CLI:
 *   agy -p <prompt> --disable-slash-commands --json-schema <schema>
 *       --output-format json [--model <m>] [--effort <e>]
 * Output is agy's own envelope; structured_output carries the review.
 * Auth: the CLI's own stored credentials.
 */
export class AgyReviewer implements Reviewer {
  constructor(
    public readonly id: string,
    private readonly config: ReviewerConfig,
    private readonly timeoutMs = 60_000,
  ) {}

  async review(plan: string, focus: string, context?: string): Promise<RawReview> {
    return runBackendJsonReview({
      backend: "agy",
      reviewerId: this.id,
      config: this.config,
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      userMessage: buildUserMessage(this.id, truncatePlan(plan), focus, context),
      timeoutMs: this.timeoutMs,
      label: "Agy",
    });
  }
}
