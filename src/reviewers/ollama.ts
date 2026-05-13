import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import { buildUserMessage, runHttpJsonReview, truncatePlan, ReviewerOperationalError } from "./common.js";
import { OllamaResponseSchema } from "../schemas.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";
import type { Reviewer } from "./index.js";

const DEFAULT_MODEL = "qwen2.5:0.5b";
const DEFAULT_ENDPOINT = "http://localhost:11434";

export class OllamaReviewer implements Reviewer {
  constructor(
    public readonly id: string,
    private readonly config: ReviewerConfig,
    private readonly timeoutMs = 60_000,
  ) {}

  async review(plan: string, focus: string, context?: string): Promise<RawReview> {
    const model = this.config.model ?? DEFAULT_MODEL;
    const endpoint = (this.config.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, "") + "/api/chat";
    return runHttpJsonReview({
      reviewerId: this.id,
      endpoint,
      model,
      headers: {},
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      userMessage: buildUserMessage(this.id, truncatePlan(plan), focus, context),
      timeoutMs: this.timeoutMs,
      label: "Ollama",
      extraBodyFields: { format: "json" },
      parseResponse: (body) => {
        const parsed = OllamaResponseSchema.safeParse(body);
        if (!parsed.success) {
          throw new ReviewerOperationalError(
            `Ollama reviewer response missing expected shape: ${parsed.error.message}`,
          );
        }
        return parsed.data.message.content;
      },
    });
  }
}
