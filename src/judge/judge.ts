import { JUDGE_SYSTEM_PROMPT } from "../prompts/index.js";
import {
  ReviewerOperationalError,
  resolveReviewerBackend,
  runBackendJsonReview,
} from "../reviewers/common.js";
import type { RawReview, Finding } from "../schemas.js";
import type { Config } from "../config.js";

export interface JudgeResult {
  review: RawReview;
  status: "success" | "fallback";
  error?: string;
}

const SEVERITY_RANK: Record<Finding["severity"], number> = {
  nit: 0,
  minor: 1,
  major: 2,
  blocker: 3,
};

export async function runJudge(
  rawReviews: RawReview[],
  plan: string,
  judgeReviewerId: string,
  config: Config,
): Promise<JudgeResult> {
  try {
    const reviewerConfig = config.reviewers[judgeReviewerId];
    if (!reviewerConfig) throw new ReviewerOperationalError(`Judge reviewer "${judgeReviewerId}" not found in config`);

    const backend = resolveReviewerBackend(judgeReviewerId, reviewerConfig);
    const review = await runBackendJsonReview({
      backend,
      reviewerId: "judge",
      config: reviewerConfig,
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      userMessage: buildJudgeMessage(plan, rawReviews),
      timeoutMs: config.limits.timeout_seconds * 1000,
      label: "Judge",
    });
    validateJudgeInvariants(review);
    return { review, status: "success" };
  } catch (err) {
    if (!(err instanceof ReviewerOperationalError)) throw err;
    return {
      review: buildFallback(rawReviews, err.message),
      status: "fallback",
      error: err.message,
    };
  }
}

function buildJudgeMessage(plan: string, rawReviews: RawReview[]): string {
  return [
    "PLAN TO REVIEW:",
    plan,
    "",
    "INDEPENDENT REVIEWS (JSON array):",
    JSON.stringify(rawReviews, null, 2),
  ].join("\n");
}

function validateJudgeInvariants(review: RawReview): void {
  const hasBlocker = review.findings.some((f) => f.severity === "blocker");
  const hasMajorOrBlocker = review.findings.some((f) => f.severity === "major" || f.severity === "blocker");

  if (review.verdict === "reject" && !hasBlocker) {
    throw new ReviewerOperationalError("Judge returned reject without a blocker finding");
  }
  if (review.verdict === "approve" && hasMajorOrBlocker) {
    throw new ReviewerOperationalError("Judge returned approve with major or blocker findings");
  }
}

function buildFallback(rawReviews: RawReview[], reason: string): RawReview {
  const byMessage = new Map<string, Finding>();
  for (const f of rawReviews.flatMap((r) => r.findings)) {
    const key = normalizeMessage(f.message);
    const normalized = { ...f, reviewer: "judge" };
    const existing = byMessage.get(key);
    if (!existing || SEVERITY_RANK[normalized.severity] > SEVERITY_RANK[existing.severity]) {
      byMessage.set(key, normalized);
    }
  }

  return {
    reviewer: "judge",
    verdict: aggregateVerdict(rawReviews),
    findings: [...byMessage.values()],
    summary: `Judge failed; fallback: ${reason}. Raw reviews concatenated.`,
  };
}

function normalizeMessage(message: string): string {
  return message.trim().replace(/\s+/g, " ").toLowerCase();
}

function aggregateVerdict(reviews: RawReview[]): "approve" | "revise" | "reject" {
  if (reviews.some((r) => r.verdict === "reject")) return "reject";
  if (reviews.some((r) => r.verdict === "revise")) return "revise";
  return "approve";
}
