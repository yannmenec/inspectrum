#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreRecords } from "./lib.mjs";

const benchmarkDir = dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2);
if (!files.length) throw new Error("provide one or more run JSONL files");
const oracle = JSON.parse(await readFile(join(benchmarkDir, "oracle.json"), "utf8"));
const records = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const line of text.split("\n").filter(Boolean)) records.push(JSON.parse(line));
}
const summary = {
  generated_at: new Date().toISOString(),
  status: scoreRecords(records, oracle).completed_blocks === 3 ? "synthetic evaluation" : "pilot",
  source_files: files,
  ...scoreRecords(records, oracle),
  caveats: [
    "Eight synthetic fixtures are not representative of real-world plans.",
    "Three repetitions of each fixture are repeated observations, not independent samples.",
    "Expected categories are author-defined and non-exhaustive.",
    "One correct fixture cannot estimate a general false-positive rate.",
    "The recorded model alias may be mutable.",
  ],
};
await writeFile(join(benchmarkDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(join(benchmarkDir, "summary.csv"), toCsv(summary));
await writeFile(join(benchmarkDir, "RESULTS.md"), toMarkdown(summary));
console.log(JSON.stringify(summary, null, 2));

function toCsv(value) {
  const rows = [["fixture", "attempts", "semantic_calls", "legacy_agreements", "acceptable_agreements", "verdicts", "expected_category_hits", "expected_category_total"]];
  for (const [fixture, result] of Object.entries(value.per_fixture)) {
    rows.push([
      fixture,
      result.attempts,
      result.semantic_calls,
      result.legacy_agreements,
      result.acceptable_agreements,
      result.verdicts.join("|"),
      result.category_recall.hits,
      result.category_recall.total,
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function toMarkdown(value) {
  return `# Synthetic evaluation results\n\nStatus: **${value.status}**. Generated from ${value.attempts} attempted calls across ${value.completed_blocks}/3 complete blocks.\n\n## Results\n\n- Operational success: ${value.operations.full_success}/${value.attempts}.\n- Legacy-verdict agreement on semantic responses: ${displayRatio(value.verdict_agreement.legacy)}.\n- Acceptable-verdict agreement on semantic responses: ${displayRatio(value.verdict_agreement.acceptable)}.\n- Expected-category micro recall: ${displayRatio(value.category_recall.micro)}.\n- Expected-category macro recall: ${displayNumber(value.category_recall.macro_ratio)}.\n- Two-of-three expected-category detection: ${displayRatio(value.category_recall.majority)}.\n- Single correct fixture: ${value.correct_fixture.non_approvals}/${value.correct_fixture.attempts} non-approvals; this is not a general false-positive rate.\n- Tool-call latency on full operational successes: median ${displayMs(value.latency.median_ms)}, nearest-rank p95 ${displayMs(value.latency.p95_ms)} (n=${value.latency.success_count}).\n\nThe conceptual always-approve baseline agrees with 1/8 historical verdict labels and recalls none of the expected issue categories. No latency or operational comparison is made.\n\n## Limits\n\n${value.caveats.map((item) => `- ${item}`).join("\n")}\n\nSee \`summary.json\`, \`summary.csv\`, the public JSONL records, \`oracle.json\` and \`preregistration.json\` for reproduction and raw evidence.\n`;
}

function displayRatio(value) {
  return value.total ? `${value.hits}/${value.total} (${(value.ratio * 100).toFixed(1)}%)` : "n/a";
}

function displayNumber(value) {
  return value == null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function displayMs(value) {
  return value == null ? "n/a" : `${Math.round(value)} ms`;
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
