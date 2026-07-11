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
  plan_gate: z
    .object({
      enabled: z.boolean().default(true),
      max_rounds: z.number().int().positive().default(2),
      reviewers: z.array(z.string()).optional(),
      reason_max_chars: z.number().int().positive().default(3000),
    })
    .default({ enabled: true, max_rounds: 2, reason_max_chars: 3000 }),
});

export type Config = z.infer<typeof ConfigSchema>;

// --- Plan gate (Claude Code PreToolUse hook on ExitPlanMode) ---

/**
 * Stdin payload Claude Code sends to PreToolUse hooks. Loose on purpose:
 * unknown fields from future Claude Code versions must never fail the gate.
 * tool_input.plan holds the plan markdown; planFilePath is the on-disk
 * fallback some versions write instead.
 */
export const HookInputSchema = z.looseObject({
  session_id: z.string().optional(),
  transcript_path: z.string().optional(),
  cwd: z.string().optional(),
  hook_event_name: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z
    .looseObject({
      plan: z.string().optional(),
      planFilePath: z.string().optional(),
    })
    .optional(),
});

export type HookInput = z.infer<typeof HookInputSchema>;

export const PlanGateStateSchema = z.object({
  session_key: z.string(),
  rounds_used: z.number().int().nonnegative().default(0),
  approved_hashes: z.array(z.string()).default([]),
  denied: z
    .array(z.object({ hash: z.string(), reason: z.string(), at: z.string() }))
    .default([]),
  updated_at: z.string(),
});

export type PlanGateState = z.infer<typeof PlanGateStateSchema>;

/**
 * Locks the stdout contract of `inspectrum plan-gate`. permissionDecision is
 * only ever "deny" — an approve outcome omits hookSpecificOutput entirely so
 * Claude Code's normal plan-approval dialog still reaches the user.
 */
export const PreToolUseDecisionSchema = z.object({
  hookSpecificOutput: z
    .object({
      hookEventName: z.literal("PreToolUse"),
      permissionDecision: z.literal("deny"),
      permissionDecisionReason: z.string(),
    })
    .optional(),
  systemMessage: z.string().optional(),
  suppressOutput: z.boolean().optional(),
});

export type PreToolUseDecision = z.infer<typeof PreToolUseDecisionSchema>;

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
