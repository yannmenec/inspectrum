import { randomUUID } from "node:crypto";
import { ReviewPlanInputSchema } from "../schemas.js";
import { createReviewer } from "../reviewers/index.js";
import { writeSession } from "../session/store.js";
import type { Config } from "../config.js";
import type { Finding, RawReview, ReviewPlanOutput } from "../schemas.js";

const REPORT_MAX_CHARS = 8000;
const TRUNCATION_MARKER = "\n\n[...truncated]";

export async function reviewPlan(rawInput: unknown, config: Config): Promise<ReviewPlanOutput> {
  const input = ReviewPlanInputSchema.parse(rawInput);
  const startedAt = new Date().toISOString();
  const sessionId = randomUUID().replace(/-/g, "").slice(0, 8);

  const reviewerIds = input.reviewers ?? config.defaults.reviewers;
  if (reviewerIds.length === 0) throw new Error("No reviewers configured");

  // Run all reviewers in parallel
  const rawReviews = await Promise.all(
    reviewerIds.map((id) => {
      const reviewerConfig = config.reviewers[id] as NonNullable<(typeof config.reviewers)[string]> | undefined;
      if (!reviewerConfig) throw new Error(`Reviewer "${id}" not found in config`);
      const reviewer = createReviewer(id, reviewerConfig);
      return reviewer.review(input.plan, input.focus, input.context);
    }),
  );

  // Aggregate findings
  const allFindings: Finding[] = rawReviews.flatMap((r) => r.findings);

  // Determine verdict (most severe wins: reject > revise > approve)
  const verdict = aggregateVerdict(rawReviews);

  // Build report markdown
  const reportMd = buildReport(rawReviews, verdict, sessionId);
  const truncatedReport =
    reportMd.length > REPORT_MAX_CHARS
      ? reportMd.slice(0, REPORT_MAX_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER
      : reportMd;

  // Collect revised plan from first reviewer that produced one
  const revisedPlan = rawReviews.find((r) => r.revised_plan)?.revised_plan;

  // Write session
  const reviews: Record<string, string> = {};
  for (const r of rawReviews) {
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
  if (reviews.some((r) => r.verdict === "reject")) return "reject";
  if (reviews.some((r) => r.verdict === "revise")) return "revise";
  return "approve";
}

function buildReport(reviews: RawReview[], verdict: string, sessionId: string): string {
  const allFindings = reviews.flatMap((r) => r.findings);
  const reviewerList = reviews.map((r) => r.reviewer).join(", ");

  const verdictBadge = verdict === "approve" ? "✅ APPROVE" : verdict === "revise" ? "⚠️ REVISE" : "❌ REJECT";

  const lines = [
    `# inspectrum Review — session ${sessionId}`,
    "",
    `**Verdict: ${verdictBadge}**  ·  Reviewers: ${reviewerList}`,
    "",
  ];

  for (const sev of ["blocker", "major", "minor", "nit"] as const) {
    const group = allFindings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    const label = sev.charAt(0).toUpperCase() + sev.slice(1) + "s";
    lines.push(`## ${label} (${group.length})`);
    for (const f of group) {
      lines.push(`- **[${f.reviewer}]** ${f.message}`);
      if (f.suggested_fix) lines.push(`  *Fix: ${f.suggested_fix}*`);
    }
    lines.push("");
  }

  if (allFindings.length === 0) {
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
