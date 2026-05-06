import { spawn } from "node:child_process";
import { ClaudeEnvelopeSchema, RawReviewSchema } from "../schemas.js";
import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";
import type { Reviewer } from "./index.js";

const PLAN_MAX_CHARS = 16000;
const TRUNCATION_MARKER = "\n\n[...truncated]";

const RAW_REVIEW_JSON_SCHEMA = JSON.stringify({
  type: "object",
  required: ["verdict", "findings"],
  properties: {
    verdict: { type: "string", enum: ["approve", "revise", "reject"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "category", "reviewer", "message"],
        properties: {
          severity: { type: "string", enum: ["blocker", "major", "minor", "nit"] },
          category: { type: "string", enum: ["correctness", "completeness", "risk", "clarity"] },
          reviewer: { type: "string" },
          message: { type: "string" },
          suggested_fix: { type: "string" },
        },
      },
    },
    revised_plan: { type: "string" },
    summary: { type: "string" },
  },
});

export class ClaudeReviewer implements Reviewer {
  constructor(
    public readonly id: string,
    private readonly config: ReviewerConfig,
  ) {}

  async review(plan: string, focus: string, context?: string): Promise<RawReview> {
    const truncatedPlan =
      plan.length > PLAN_MAX_CHARS
        ? plan.slice(0, PLAN_MAX_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER
        : plan;

    const userMessage = buildUserMessage(this.id, truncatedPlan, focus, context);
    const binary = this.config.binary ?? "claude";
    const extraArgs = this.config.args ?? ["-p", "--output-format", "json", "--no-session-persistence"];

    // Remove -p / --print from extra args since we add it ourselves to avoid duplication
    const baseArgs = extraArgs.filter((a) => a !== "-p" && a !== "--print");

    const args = [
      ...baseArgs,
      "--append-system-prompt",
      REVIEWER_SYSTEM_PROMPT,
      "--json-schema",
      RAW_REVIEW_JSON_SCHEMA,
    ];

    const stdout = await spawnCollect(binary, args, userMessage, 60_000);
    return parseClaudeOutput(stdout, this.id);
  }
}

function buildUserMessage(reviewerId: string, plan: string, focus: string, context?: string): string {
  const lines = [
    `REVIEWER_ID: ${reviewerId}`,
    `FOCUS: ${focus}`,
    "",
    context ? `CODEBASE CONTEXT:\n${context}\n` : "",
    `PLAN TO REVIEW:\n${plan}`,
  ];
  return lines.filter((l) => l !== "").join("\n");
}

function spawnCollect(binary: string, args: string[], stdin: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Claude reviewer timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.stdin.write(stdin);
    proc.stdin.end();

    proc.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8").trim();
      if (!output) {
        const stderr = Buffer.concat(errChunks).toString("utf8").trim();
        reject(new Error(`Claude reviewer exited with code ${code}. stderr: ${stderr}`));
        return;
      }
      resolve(output);
    });
  });
}

function parseClaudeOutput(raw: string, reviewerId: string): RawReview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Claude reviewer returned non-JSON output: ${raw.slice(0, 200)}`);
  }

  const envelope = ClaudeEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new Error(`Claude output did not match expected envelope: ${raw.slice(0, 200)}`);
  }

  if (envelope.data.is_error) {
    throw new Error(`Claude reviewer failed: ${envelope.data.result}`);
  }

  let innerParsed: unknown;
  try {
    innerParsed = JSON.parse(envelope.data.result);
  } catch {
    throw new Error(`Claude reviewer result field is not valid JSON: ${envelope.data.result.slice(0, 200)}`);
  }

  const review = RawReviewSchema.safeParse(innerParsed);
  if (!review.success) {
    throw new Error(`Claude reviewer result failed schema validation: ${review.error.message}`);
  }

  return { ...review.data, reviewer: reviewerId };
}
