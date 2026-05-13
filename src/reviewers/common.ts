import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { RawReviewSchema, ClaudeEnvelopeSchema } from "../schemas.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";

export type ReviewerBackend = "claude" | "codex" | "gemini" | "ollama" | "openrouter" | "kimi" | "qwen";

const PLAN_MAX_CHARS = 16000;
const TRUNCATION_MARKER = "\n\n[...truncated]";

export const RAW_REVIEW_JSON_SCHEMA = JSON.stringify({
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

const JSON_INSTRUCTION =
  "\n\nOutput ONLY valid JSON (no prose, no markdown fences) matching this exact schema:\n" +
  RAW_REVIEW_JSON_SCHEMA;

export class ReviewerOperationalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewerOperationalError";
  }
}

export function truncatePlan(plan: string): string {
  return plan.length > PLAN_MAX_CHARS
    ? plan.slice(0, PLAN_MAX_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER
    : plan;
}

export function buildUserMessage(reviewerId: string, plan: string, focus: string, context?: string): string {
  const lines = [
    `REVIEWER_ID: ${reviewerId}`,
    `FOCUS: ${focus}`,
    "",
    context ? `CODEBASE CONTEXT:\n${context}\n` : "",
    `PLAN TO REVIEW:\n${plan}`,
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export function resolveReviewerBackend(id: string, config: ReviewerConfig): ReviewerBackend {
  if (config.type === "http") {
    if (config.backend === "ollama" || config.backend === "openrouter") return config.backend;
    throw new ReviewerOperationalError(
      `HTTP reviewers require an explicit backend of "ollama" or "openrouter". Got: ${id}`,
    );
  }

  if (config.backend) return config.backend;

  const binaryBackend = config.binary ? backendFromName(basename(config.binary)) : undefined;
  if (binaryBackend) return binaryBackend;

  const idBackend = backendFromName(id);
  if (idBackend) return idBackend;

  throw new ReviewerOperationalError(
    `Reviewer backend "${id}" is not supported. Supported backends: claude, codex, gemini, kimi, qwen.`,
  );
}

function backendFromName(name: string): ReviewerBackend | undefined {
  const known = ["claude", "codex", "gemini", "kimi", "qwen"] as const;
  return (known as readonly string[]).includes(name) ? (name as ReviewerBackend) : undefined;
}

export async function runBackendJsonReview(opts: {
  backend: ReviewerBackend;
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  if (opts.backend === "ollama" || opts.backend === "openrouter") {
    throw new ReviewerOperationalError(
      `HTTP backend "${opts.backend}" must use runHttpJsonReview, not runBackendJsonReview`,
    );
  }
  if (opts.backend === "claude") return runClaudeJsonReview(opts);
  if (opts.backend === "codex") return runCodexJsonReview(opts);
  if (opts.backend === "kimi") return runKimiJsonReview(opts);
  if (opts.backend === "qwen") return runQwenJsonReview(opts);
  return runGeminiJsonReview(opts);
}

export async function runHttpJsonReview(opts: {
  reviewerId: string;
  endpoint: string;
  model: string;
  headers: Record<string, string>;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
  parseResponse: (body: unknown) => string;
  extraBodyFields?: Record<string, unknown>;
}): Promise<RawReview> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  let res: Response;
  try {
    res = await fetch(opts.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...opts.headers },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: opts.systemPrompt + JSON_INSTRUCTION },
          { role: "user", content: opts.userMessage },
        ],
        stream: false,
        ...opts.extraBodyFields,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new ReviewerOperationalError(`${opts.label} reviewer request failed: ${errorMessage(err)}`);
  }
  clearTimeout(timer);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ReviewerOperationalError(
      `${opts.label} reviewer returned HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ReviewerOperationalError(`${opts.label} reviewer returned non-JSON response`);
  }
  const raw = opts.parseResponse(json);
  return parseRawReview(stripJsonPayload(raw), opts.reviewerId, opts.label);
}

async function runClaudeJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  const binary = opts.config.binary ?? "claude";
  const extraArgs = opts.config.args ?? ["-p", "--output-format", "json", "--no-session-persistence"];
  const baseArgs = extraArgs.filter((a) => a !== "-p" && a !== "--print");
  const args = [
    "-p",
    ...baseArgs,
    "--append-system-prompt",
    opts.systemPrompt,
    "--json-schema",
    RAW_REVIEW_JSON_SCHEMA,
  ];
  const { stdout } = await spawnCollect({ binary, args, stdin: opts.userMessage, timeoutMs: opts.timeoutMs, label: opts.label });
  return parseClaudeOutput(stdout, opts.reviewerId, opts.label);
}

async function runCodexJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  const binary = opts.config.binary ?? "codex";
  const model = extractModel(opts.config, "gpt-5");
  const tempDir = mkdtempSync(join(tmpdir(), "inspectrum-codex-"));
  const schemaFile = join(tempDir, "schema.json");
  const outputFile = join(tempDir, "output.json");

  try {
    writeFileSync(schemaFile, RAW_REVIEW_JSON_SCHEMA, { encoding: "utf8", mode: 0o600 });
    const args = [
      "exec",
      "--ephemeral",
      "-m",
      model,
      "--output-schema",
      schemaFile,
      "--output-last-message",
      outputFile,
      opts.systemPrompt,
    ];
    await spawnCollect({ binary, args, stdin: opts.userMessage, timeoutMs: opts.timeoutMs, label: opts.label });
    return parseRawReview(readFileSync(outputFile, "utf8"), opts.reviewerId, opts.label);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runGeminiJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  const binary = opts.config.binary ?? "gemini";
  const model = extractModel(opts.config, "gemini-2.5-pro");
  const args = ["-m", model, "-p", opts.systemPrompt + JSON_INSTRUCTION];
  const { stdout } = await spawnCollect({ binary, args, stdin: opts.userMessage, timeoutMs: opts.timeoutMs, label: opts.label });
  return parseRawReview(stripJsonPayload(stdout), opts.reviewerId, opts.label);
}

async function runKimiJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  // ASSUMPTION: kimi CLI (npm install -g @moonshotai/kimi-cli) uses:
  //   kimi -m <model> -p <systemPrompt>
  //   stdin = userMessage, stdout = JSON or markdown-fenced JSON
  // Auth: MOONSHOT_API_KEY env var (CLI reads automatically)
  // If actual CLI flags differ, update the args array below.
  const binary = opts.config.binary ?? "kimi";
  const model = extractModel(opts.config, "kimi-k2");
  const args = ["-m", model, "-p", opts.systemPrompt + JSON_INSTRUCTION];
  const { stdout } = await spawnCollect({ binary, args, stdin: opts.userMessage, timeoutMs: opts.timeoutMs, label: opts.label });
  return parseRawReview(stripJsonPayload(stdout), opts.reviewerId, opts.label);
}

async function runQwenJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  // ASSUMPTION: qwen CLI (npm install -g @qwenlm/qwen-code) uses:
  //   qwen -m <model> -p <systemPrompt>
  //   stdin = userMessage, stdout = JSON or markdown-fenced JSON
  // Auth: DASHSCOPE_API_KEY env var (CLI reads automatically)
  // If actual CLI flags differ, update the args array below.
  const binary = opts.config.binary ?? "qwen";
  const model = extractModel(opts.config, "qwen3-235b-a22b");
  const args = ["-m", model, "-p", opts.systemPrompt + JSON_INSTRUCTION];
  const { stdout } = await spawnCollect({ binary, args, stdin: opts.userMessage, timeoutMs: opts.timeoutMs, label: opts.label });
  return parseRawReview(stripJsonPayload(stdout), opts.reviewerId, opts.label);
}

function extractModel(config: ReviewerConfig, defaultModel: string): string {
  if (config.model) return config.model;
  const args = config.args ?? [];
  const idx = args.findIndex((a) => a === "-m" || a === "--model");
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]!;
  return defaultModel;
}

function spawnCollect(opts: {
  binary: string;
  args: string[];
  stdin: string;
  timeoutMs: number;
  label: string;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };

    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(opts.binary, opts.args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      reject(new ReviewerOperationalError(`${opts.label} reviewer failed to start: ${errorMessage(err)}`));
      return;
    }

    timer = setTimeout(() => {
      proc.kill();
      finish(() => reject(new ReviewerOperationalError(`${opts.label} reviewer timed out after ${opts.timeoutMs / 1000}s`)));
    }, opts.timeoutMs);

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));
    proc.stdin.on?.("error", () => {
      // EPIPE is expected when a CLI exits before consuming stdin; close/error carries the operational failure.
    });

    proc.on("error", (err: Error) => {
      finish(() => reject(new ReviewerOperationalError(`${opts.label} reviewer failed to start: ${err.message}`)));
    });

    proc.on("close", (code) => {
      finish(() => {
        const stdout = Buffer.concat(chunks).toString("utf8").trim();
        const stderr = Buffer.concat(errChunks).toString("utf8").trim();
        if (code !== 0) {
          reject(new ReviewerOperationalError(`${opts.label} reviewer exited with code ${code}. stderr: ${stderr}`));
          return;
        }
        resolve({ stdout, stderr });
      });
    });

    proc.stdin.write(opts.stdin);
    proc.stdin.end();
  });
}

function parseClaudeOutput(raw: string, reviewerId: string, label: string): RawReview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ReviewerOperationalError(`${label} reviewer returned non-JSON output: ${raw.slice(0, 200)}`);
  }

  const envelope = ClaudeEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new ReviewerOperationalError(`${label} output did not match expected envelope: ${raw.slice(0, 200)}`);
  }

  if (envelope.data.is_error) {
    throw new ReviewerOperationalError(`${label} reviewer failed: ${envelope.data.result}`);
  }

  return parseRawReview(envelope.data.result, reviewerId, label);
}

function parseRawReview(raw: string, reviewerId: string, label: string): RawReview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ReviewerOperationalError(`${label} reviewer returned non-JSON output: ${raw.slice(0, 200)}`);
  }

  const review = RawReviewSchema.safeParse(parsed);
  if (!review.success) {
    throw new ReviewerOperationalError(`${label} reviewer result failed schema validation: ${review.error.message}`);
  }

  const normalizedFindings = review.data.findings.map((f) => ({ ...f, reviewer: reviewerId }));
  return { ...review.data, findings: normalizedFindings, reviewer: reviewerId };
}

function stripJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Try a complete markdown code fence only; prose around the fence remains invalid.
  }

  const fenced = trimmed.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
