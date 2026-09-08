import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import { buildUserMessage, runBackendJsonReview, truncatePlan } from "./common.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";
import type { Reviewer } from "./index.js";

/**
 * opencode (`opencode run`) reviewer. Contract verified against the real CLI:
 *   opencode run --agent summary [-m <provider/model>] [--variant <effort>]
 *   prompt on stdin, bare JSON on stdout, banner on stderr.
 * Auth: the CLI's own stored provider credentials (`opencode providers login`).
 */
export class OpencodeReviewer implements Reviewer {
  constructor(
    public readonly id: string,
    private readonly config: ReviewerConfig,
    private readonly timeoutMs = 60_000,
  ) {}

  async review(plan: string, focus: string, context?: string): Promise<RawReview> {
    return runBackendJsonReview({
      backend: "opencode",
      reviewerId: this.id,
      config: this.config,
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      userMessage: buildUserMessage(this.id, truncatePlan(plan), focus, context),
      timeoutMs: this.timeoutMs,
      label: "Opencode",
    });
  }
}
