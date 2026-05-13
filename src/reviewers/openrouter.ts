import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import { buildUserMessage, runHttpJsonReview, truncatePlan, ReviewerOperationalError } from "./common.js";
import { OpenRouterResponseSchema } from "../schemas.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";
import type { Reviewer } from "./index.js";

// OpenAI-compatible chat completions API via openrouter.ai
// Auth: OPENROUTER_API_KEY env var
// Response shape: { choices: [{ message: { content: string } }] }
const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";
const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1";

export class OpenRouterReviewer implements Reviewer {
  constructor(
    public readonly id: string,
    private readonly config: ReviewerConfig,
    private readonly timeoutMs = 60_000,
  ) {}

  async review(plan: string, focus: string, context?: string): Promise<RawReview> {
    const model = this.config.model ?? DEFAULT_MODEL;
    const endpoint = (this.config.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, "") + "/chat/completions";
    const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
    return runHttpJsonReview({
      reviewerId: this.id,
      endpoint,
      model,
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        "HTTP-Referer": "https://github.com/yannmenec/inspectrum",
        "X-Title": "inspectrum",
      },
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      userMessage: buildUserMessage(this.id, truncatePlan(plan), focus, context),
      timeoutMs: this.timeoutMs,
      label: "OpenRouter",
      parseResponse: (body) => {
        const parsed = OpenRouterResponseSchema.safeParse(body);
        if (!parsed.success) {
          throw new ReviewerOperationalError(
            `OpenRouter reviewer response missing expected shape: ${parsed.error.message}`,
          );
        }
        return parsed.data.choices[0]!.message.content;
      },
    });
  }
}
