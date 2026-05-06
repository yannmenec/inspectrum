import { z } from "zod";

export const FindingSchema = z.object({
  severity: z.enum(["blocker", "major", "minor", "nit"]),
  category: z.enum(["correctness", "completeness", "risk", "clarity"]),
  reviewer: z.string(),
  message: z.string(),
  suggested_fix: z.string().optional(),
});

export const ReviewPlanInputSchema = z.object({
  plan: z.string().max(16000, "Plan exceeds 16 000 character limit"),
  reviewers: z.array(z.string()).optional(),
  focus: z.enum(["correctness", "completeness", "risk", "clarity", "all"]).default("all"),
  judge: z.boolean().default(true),
  context: z.string().max(8000, "Context exceeds 8 000 character limit").optional(),
});

export const ReviewPlanOutputSchema = z.object({
  verdict: z.enum(["approve", "revise", "reject"]),
  report_markdown: z.string(),
  findings: z.array(FindingSchema),
  revised_plan: z.string().optional(),
  session_id: z.string(),
  session_path: z.string(),
});

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
  type: z.enum(["cli", "http"]),
  binary: z.string().optional(),
  args: z.array(z.string()).optional(),
  endpoint: z.string().optional(),
  model: z.string().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;
export type ReviewPlanInput = z.infer<typeof ReviewPlanInputSchema>;
export type ReviewPlanOutput = z.infer<typeof ReviewPlanOutputSchema>;
export type RawReview = z.infer<typeof RawReviewSchema> & { reviewer: string };
export type ReviewerConfig = z.infer<typeof ReviewerConfigSchema>;
