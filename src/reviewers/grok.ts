import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import { buildUserMessage, runBackendJsonReview, truncatePlan } from "./common.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";
import type { Reviewer } from "./index.js";

/**
 * grok reviewer. Contract verified against the real CLI:
 *   grok --prompt-file <file> --json-schema <schema> --tools read_file,grep,list_dir
 *        --max-turns 8 --disable-web-search --no-subagents [-m <model>] [--effort <e>]
 * Output is grok's own camelCase envelope; structuredOutput carries the review.
 * Auth: the CLI's own login (Grok Build balance).
 */
export class GrokReviewer implements Reviewer {
  constructor(
    public readonly id: string,
    private readonly config: ReviewerConfig,
    private readonly timeoutMs = 60_000,
  ) {}

  async review(plan: string, focus: string, context?: string): Promise<RawReview> {
    return runBackendJsonReview({
      backend: "grok",
      reviewerId: this.id,
      config: this.config,
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      userMessage: buildUserMessage(this.id, truncatePlan(plan), focus, context),
      timeoutMs: this.timeoutMs,
      label: "Grok",
    });
  }
}
