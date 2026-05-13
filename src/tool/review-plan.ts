import { randomUUID } from "node:crypto";
import { ReviewPlanInputSchema } from "../schemas.js";
import { createReviewer } from "../reviewers/index.js";
import { writeSession } from "../session/store.js";
import { runJudge } from "../judge/judge.js";
import type { Config } from "../config.js";
import type { Finding, RawReview, ReviewPlanOutput } from "../schemas.js";
import type { JudgeResult } from "../judge/judge.js";

const TRUNCATION_MARKER = "\n\n[...truncated]";

export type OnProgress = (progress: number, total: number, message: string) => Promise<void>;

export async function reviewPlan(
  rawInput: unknown,
  config: Config,
  onProgress?: OnProgress,
): Promise<ReviewPlanOutput> {
  const input = ReviewPlanInputSchema.parse(rawInput);
  const startedAt = new Date().toISOString();
  const sessionId = randomUUID().replace(/-/g, "").slice(0, 8);

  const reviewerIds = input.reviewers ?? config.defaults.reviewers;
  if (reviewerIds.length === 0) throw new Error("No reviewers configured");

  const useJudge = input.judge && reviewerIds.length >= 2;

  // Run all reviewers in parallel, collecting successes and failures
  let completedReviewers = 0;
  const settledResults = await Promise.allSettled(
    reviewerIds.map(async (id) => {
      try {
        const reviewerConfig = config.reviewers[id] as NonNullable<(typeof config.reviewers)[string]> | undefined;
        if (!reviewerConfig) throw new Error(`Reviewer "${id}" not found in config`);
        const reviewer = createReviewer(id, reviewerConfig);
        return await reviewer.review(input.plan, input.focus, input.context);
      } finally {
        completedReviewers += 1;
        await onProgress?.(completedReviewers, reviewerIds.length, `${id} done`);
      }
    }),
  );

  const successfulReviews: RawReview[] = [];
  const operationalFindings: Finding[] = [];
  for (const [i, r] of settledResults.entries()) {
    if (r.status === "fulfilled") {
      successfulReviews.push(r.value);
    } else {
      const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      operationalFindings.push({
        severity: "major",
        category: "risk",
        reviewer: reviewerIds[i]!,
        message: `Reviewer ${reviewerIds[i]} failed: ${errMsg}`,
      });
    }
  }

  if (successfulReviews.length === 0) throw new Error("All reviewers failed");

  // Run judge to consolidate if enabled and we have ≥ 2 successful reviews
  let finalReviews = successfulReviews;
  let judgeResult: JudgeResult | undefined;
  if (useJudge && successfulReviews.length >= 2) {
    judgeResult = await runJudge(successfulReviews, input.plan, config.defaults.judge, config);
    finalReviews = [judgeResult.review];
    await onProgress?.(reviewerIds.length + 1, reviewerIds.length + 1, "judge done");
  }

  const allFindings: Finding[] = [...operationalFindings, ...finalReviews.flatMap((r) => r.findings)];

  // Determine verdict from successful reviews only — operational failures surface in the report
  const verdict = aggregateVerdict(finalReviews);

  // Build report markdown
  const reportMd = buildReport(successfulReviews, judgeResult, operationalFindings, verdict, sessionId);
  const truncatedReport =
    reportMd.length > config.limits.report_max_chars
      ? reportMd.slice(0, config.limits.report_max_chars - TRUNCATION_MARKER.length) + TRUNCATION_MARKER
      : reportMd;

  // Collect revised plan from judge or first reviewer that produced one
  const revisedPlan = (judgeResult?.review ?? successfulReviews.find((r) => r.revised_plan))?.revised_plan;

  // Write session
  const reviews: Record<string, string> = {};
  for (const r of successfulReviews) {
    reviews[r.reviewer] = formatRawReview(r);
  }

  const counts = {
    blocker: allFindings.filter((f) => f.severity === "blocker").length,
    major: allFindings.filter((f) => f.severity === "major").length,
    minor: allFindings.filter((f) => f.severity === "minor").length,
    nit: allFindings.filter((f) => f.severity === "nit").length,
  };

  const sessionData = {
    id: sessionId,
    started_at: startedAt,
    duration_ms: Date.now() - new Date(startedAt).getTime(),
    reviewers: reviewerIds,
    judge: config.defaults.judge,
    judge_status: judgeResult?.status ?? (useJudge ? ("skipped" as const) : undefined),
    judge_error: judgeResult?.error,
    verdict,
    counts,
    plan_chars: input.plan.length,
    report_chars: truncatedReport.length,
  };

  const { sessionPath } = await writeSession({
    session: sessionData,
    planInput: input.plan,
    reviews,
    report: truncatedReport,
    revisedPlan,
    judgeReview: judgeResult?.review,
  });

  return {
    verdict,
    report_markdown: truncatedReport,
    findings: allFindings,
    revised_plan: revisedPlan,
    session_id: sessionId,
    session_path: sessionPath,
  };
}

function aggregateVerdict(reviews: RawReview[]): "approve" | "revise" | "reject" {
  const findings = reviews.flatMap((r) => r.findings);
  if (reviews.some((r) => r.verdict === "reject") || findings.some((f) => f.severity === "blocker")) return "reject";
  if (reviews.some((r) => r.verdict === "revise") || findings.some((f) => f.severity === "major")) return "revise";
  return "approve";
}

function buildReport(
  rawReviews: RawReview[],
  judgeResult: JudgeResult | undefined,
  operationalFindings: Finding[],
  verdict: string,
  sessionId: string,
): string {
  const reviewFindings = judgeResult ? judgeResult.review.findings : rawReviews.flatMap((r) => r.findings);
  const reviewerList = rawReviews.map((r) => r.reviewer).join(", ");
  const judgeLabel = judgeResult
    ? `  ·  Judge: ${judgeResult.status}${judgeResult.error ? ` (${judgeResult.error})` : ""}`
    : "";

  const verdictBadge = verdict === "approve" ? "✅ APPROVE" : verdict === "revise" ? "⚠️ REVISE" : "❌ REJECT";

  const lines = [
    `# inspectrum Review — session ${sessionId}`,
    "",
    `**Verdict: ${verdictBadge}**  ·  Reviewers: ${reviewerList}${judgeLabel}`,
    "",
  ];

  if (operationalFindings.length > 0) {
    lines.push(`## Operational Findings (${operationalFindings.length})`);
    for (const f of operationalFindings) {
      lines.push(`- **[${f.reviewer}]** ${f.message}`);
    }
    lines.push("");
  }

  for (const sev of ["blocker", "major", "minor", "nit"] as const) {
    const group = reviewFindings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    const label = sev.charAt(0).toUpperCase() + sev.slice(1) + "s";
    lines.push(`## ${label} (${group.length})`);
    for (const f of group) {
      lines.push(`- **[${f.reviewer}]** ${f.message}`);
      if (f.suggested_fix) lines.push(`  *Fix: ${f.suggested_fix}*`);
    }
    lines.push("");
  }

  if (operationalFindings.length + reviewFindings.length === 0) {
    lines.push("No issues found.");
    lines.push("");
  }

  return lines.join("\n");
}

function formatRawReview(r: RawReview): string {
  const lines = [
    `# Review by ${r.reviewer}`,
    "",
    `**Verdict:** ${r.verdict}`,
    "",
  ];
  if (r.summary) lines.push(r.summary, "");
  for (const f of r.findings) {
    lines.push(`- [${f.severity}/${f.category}] ${f.message}`);
    if (f.suggested_fix) lines.push(`  Fix: ${f.suggested_fix}`);
  }
  return lines.join("\n");
}
