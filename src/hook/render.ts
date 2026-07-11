import { join } from "node:path";
import { TRUNCATION_MARKER } from "../reviewers/common.js";
import type { Finding } from "../schemas.js";

const RENDER_ORDER = [
  ["blocker", "Blockers"],
  ["major", "Majors"],
  ["minor", "Minors"],
] as const;

const FINDING_MAX_CHARS = 280;
const INSTRUCTION = "Revise the plan to address these findings, then finish the plan again.";

function capLine(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > FINDING_MAX_CHARS
    ? oneLine.slice(0, FINDING_MAX_CHARS - TRUNCATION_MARKER.trimStart().length) + TRUNCATION_MARKER.trimStart()
    : oneLine;
}

/**
 * Compact deny reason for the PreToolUse hook, kept under `budget` chars so a
 * long review never floods the model's context. Severity-first (nits dropped),
 * footer (instruction + full-report path) is always preserved.
 */
export function renderDenyReason(opts: {
  verdict: "revise" | "reject";
  findings: Finding[];
  round: number;
  maxRounds: number;
  sessionPath: string;
  budget: number;
}): string {
  const header = `inspectrum×codex: ${opts.verdict.toUpperCase()} (round ${opts.round}/${opts.maxRounds})`;
  const footer = `${INSTRUCTION}\nFull report: ${join(opts.sessionPath, "report.md")}`;

  const renderable = RENDER_ORDER.flatMap(([severity, title]) => {
    const lines = opts.findings
      .filter((f) => f.severity === severity)
      .map((f) => `- [${f.reviewer}] ${capLine(f.message)}${f.suggested_fix ? `\n  Fix: ${capLine(f.suggested_fix)}` : ""}`);
    return lines.length > 0 ? [`${title}:`, ...lines] : [];
  });

  const reserved = header.length + footer.length + 4; // section separators
  let remaining = Math.max(opts.budget - reserved, 0);
  const kept: string[] = [];
  let omitted = 0;
  for (const line of renderable) {
    if (line.length + 1 <= remaining) {
      kept.push(line);
      remaining -= line.length + 1;
    } else if (!line.endsWith(":")) {
      omitted += 1;
    }
  }
  // Drop dangling section headers whose findings were all omitted.
  while (kept.length > 0 && kept[kept.length - 1]!.endsWith(":")) {
    remaining += kept.pop()!.length + 1;
  }
  if (omitted > 0) {
    let marker = `(+${omitted} more findings — see full report)`;
    while (kept.length > 0 && marker.length + 1 > remaining) {
      const dropped = kept.pop()!;
      remaining += dropped.length + 1;
      if (!dropped.endsWith(":")) omitted += 1;
      marker = `(+${omitted} more findings — see full report)`;
    }
    kept.push(marker);
  }

  const body = kept.length > 0 ? `\n\n${kept.join("\n")}` : "";
  return `${header}${body}\n\n${footer}`;
}
