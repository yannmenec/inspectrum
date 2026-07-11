import { z } from "zod";

export const FindingSchema = z.object({
  severity: z.enum(["blocker", "major", "minor", "nit"]),
  category: z.enum(["correctness", "completeness", "risk", "clarity"]),
  reviewer: z.string(),
  message: z.string(),
  suggested_fix: z.string().optional(),
});

/**
 * Raw Zod shape for the review_plan MCP tool input. Source of truth — server.ts
 * passes this directly to McpServer.registerTool's `inputSchema` (which accepts
 * a `ZodRawShapeCompat = Record<string, ZodTypeAny>`), and ReviewPlanInputSchema
 * is `z.object()` over the same shape. Keep .describe() and custom max-length
 * messages here, NOT in server.ts.
 */
export const ReviewPlanToolShape = {
  plan: z
    .string()
    .max(16000, "Plan exceeds 16 000 character limit")
    .describe("The plan to review, in Markdown. Max 16 000 characters."),
  reviewers: z
    .array(z.string())
    .optional()
    .describe("Reviewer IDs (from config). Defaults to config defaults.reviewers."),
  focus: z
    .enum(["correctness", "completeness", "risk", "clarity", "all"])
    .default("all")
    .describe("Review focus area."),
  judge: z
    .boolean()
    .default(true)
    .describe("Run judge agent to consolidate when >= 2 reviewers."),
  context: z
    .string()
    .max(8000, "Context exceeds 8 000 character limit")
    .optional()
    .describe("Optional codebase excerpts for context. Max 8 000 characters."),
} as const;

export const ReviewPlanInputSchema = z.object(ReviewPlanToolShape);

/**
 * Raw Zod shape for the review_plan MCP tool output. server.ts passes this as
 * `outputSchema`; the handler returns structuredContent that the SDK validates
 * against ReviewPlanOutputSchema = z.object(ReviewPlanToolOutputShape).
 */
export const ReviewPlanToolOutputShape = {
  verdict: z.enum(["approve", "revise", "reject"]),
  report_markdown: z.string(),
  findings: z.array(FindingSchema),
  revised_plan: z.string().optional(),
  session_id: z.string(),
  session_path: z.string(),
} as const;

export const ReviewPlanOutputSchema = z.object(ReviewPlanToolOutputShape);

// Schema for the structured JSON a reviewer CLI must produce
export const RawReviewSchema = z.object({
  verdict: z.enum(["approve", "revise", "reject"]),
  findings: z.array(FindingSchema),
  revised_plan: z.string().optional(),
  summary: z.string().optional(),
});

// Schema for the outer envelope claude --output-format json produces
export const ClaudeEnvelopeSchema = z.object({
  type: z.string(),
  is_error: z.boolean(),
  result: z.string(),
});

export const ReviewerConfigSchema = z.object({
  type: z.enum(["cli", "http"]).default("cli"),
  backend: z.enum(["claude", "codex", "gemini", "ollama", "openrouter", "kimi", "qwen"]).optional(),
  binary: z.string().optional(),
  args: z.array(z.string()).optional(),
  endpoint: z.string().optional(),
  model: z.string().optional(),
  // Reasoning effort, passed through verbatim (codex: -c model_reasoning_effort=<v>).
  // Deliberately not an enum: CLIs add levels (e.g. "ultra") faster than we release.
  effort: z.string().optional(),
  timeout_seconds: z.number().int().positive().optional(),
});

export const ConfigSchema = z.object({
  version: z.number().int().default(1),
  defaults: z
    .object({
      reviewers: z.array(z.string()).default(["codex"]),
      judge: z.string().default("claude"),
      focus: z.enum(["correctness", "completeness", "risk", "clarity", "all"]).default("all"),
    })
    .default({ reviewers: ["codex"], judge: "claude", focus: "all" }),
  reviewers: z
    .record(z.string(), ReviewerConfigSchema)
    .default({
      claude: { type: "cli", binary: "claude", args: ["-p", "--output-format", "json", "--no-session-persistence"] },
      codex: { type: "cli", binary: "codex", args: ["exec", "--ephemeral"] },
      gemini: { type: "cli", binary: "gemini", args: ["--prompt", "-"] },
    }),
  limits: z
    .object({
      plan_max_chars: z.number().int().default(16000),
      report_max_chars: z.number().int().default(8000),
      timeout_seconds: z.number().int().default(300),
    })
    .default({ plan_max_chars: 16000, report_max_chars: 8000, timeout_seconds: 300 }),
});

export type Config = z.infer<typeof ConfigSchema>;

export const OllamaResponseSchema = z.object({
  message: z.object({ content: z.string() }),
});

export const OpenRouterResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

export type OllamaResponse = z.infer<typeof OllamaResponseSchema>;
export type OpenRouterResponse = z.infer<typeof OpenRouterResponseSchema>;

export type Finding = z.infer<typeof FindingSchema>;
export type ReviewPlanInput = z.infer<typeof ReviewPlanInputSchema>;
export type ReviewPlanOutput = z.infer<typeof ReviewPlanOutputSchema>;
export type RawReview = z.infer<typeof RawReviewSchema> & { reviewer: string };
export type ReviewerConfig = z.infer<typeof ReviewerConfigSchema>;
