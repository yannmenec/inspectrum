import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { RawReviewSchema, ClaudeEnvelopeSchema, OllamaResponseSchema, OpenRouterResponseSchema } from "../schemas.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";

export type ReviewerBackend = "claude" | "codex" | "gemini" | "ollama" | "openrouter" | "kimi" | "qwen";

const PLAN_MAX_CHARS = 16000;
export const TRUNCATION_MARKER = "\n\n[...truncated]";

/**
 * Per-flag arity declaration for reserved flags owned by the canonical reviewer
 * invocation. `bool` flags consume no value (e.g. `-p`, `--ephemeral`). `paired`
 * flags consume the next argv token as their value (e.g. `-m gpt-5`), regardless
 * of whether that token starts with `-` (model names that begin with `-` are
 * unusual but legal and must not leak through).
 */
export interface ReservedFlags {
  readonly bool: readonly string[];
  readonly paired: readonly string[];
}

/**
 * Filters user-provided CLI args (from ~/.inspectrum/config.toml) against the
 * reserved flag set owned by the canonical reviewer invocation. Reserved flags
 * are dropped so the canonical invocation stays authoritative:
 *   - `bool` reserved → drop just the flag token.
 *   - `paired` reserved → drop the flag token AND the next token (its value),
 *     including values that start with `-`.
 *   - inline form (`--flag=value`) → drop the single token if `--flag` appears
 *     in either set.
 * Non-reserved args are preserved in original order.
 */
export function mergeReviewerArgs(
  configArgs: string[] | undefined,
  reserved: ReservedFlags,
): string[] {
  if (!configArgs || configArgs.length === 0) return [];
  const boolSet = new Set(reserved.bool);
  const pairedSet = new Set(reserved.paired);
  const out: string[] = [];
  for (let i = 0; i < configArgs.length; i++) {
    const arg = configArgs[i]!;
    const eqIdx = arg.indexOf("=");
    if (eqIdx > 0 && arg.startsWith("-")) {
      const flagName = arg.slice(0, eqIdx);
      if (boolSet.has(flagName) || pairedSet.has(flagName)) continue;
    }
    if (pairedSet.has(arg)) {
      // Always consume the next token as the value, even if it starts with "-".
      if (i + 1 < configArgs.length) i += 1;
      continue;
    }
    if (boolSet.has(arg)) continue;
    out.push(arg);
  }
  return out;
}

export const RAW_REVIEW_JSON_SCHEMA = JSON.stringify({
  type: "object",
  additionalProperties: false,
  required: ["verdict", "findings", "revised_plan", "summary"],
  properties: {
    verdict: { type: "string", enum: ["approve", "revise", "reject"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "category", "reviewer", "message", "suggested_fix"],
        properties: {
          severity: { type: "string", enum: ["blocker", "major", "minor", "nit"] },
          category: { type: "string", enum: ["correctness", "completeness", "risk", "clarity"] },
          reviewer: { type: "string" },
          message: { type: "string" },
          suggested_fix: { type: ["string", "null"] },
        },
      },
    },
    revised_plan: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
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

  if (config.backend === "ollama" || config.backend === "openrouter") {
    throw new ReviewerOperationalError(
      `Backend "${config.backend}" requires type "http", but type "cli" was configured for: ${id}`,
    );
  }
  if (config.backend) return config.backend;

  const binaryBackend = config.binary ? backendFromName(basename(config.binary)) : undefined;
  if (binaryBackend) return binaryBackend;

  const idBackend = backendFromName(id);
  if (idBackend) return idBackend;

  throw new ReviewerOperationalError(
    `Reviewer backend "${id}" is not supported. Supported backends: claude, codex, gemini, kimi, qwen, ollama (http), openrouter (http).`,
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
  try {
    let res: Response;
    try {
      res = await fetch(opts.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...opts.headers },
        body: JSON.stringify({
          ...opts.extraBodyFields,
          model: opts.model,
          messages: [
            { role: "system", content: opts.systemPrompt + JSON_INSTRUCTION },
            { role: "user", content: opts.userMessage },
          ],
          stream: false,
        }),
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new ReviewerOperationalError(`${opts.label} reviewer request failed: ${errorMessage(err)}`);
    }
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
  } finally {
    clearTimeout(timer);
  }
}

/**
 * High-level HTTP dispatch: routes ollama/openrouter to runHttpJsonReview
 * with backend-specific endpoint, headers, and response parsing.
 * Used by both Reviewer classes and runJudge.
 */
export async function runHttpBackendJsonReview(opts: {
  backend: "ollama" | "openrouter";
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  if (opts.backend === "ollama") {
    const endpoint = (opts.config.endpoint ?? "http://localhost:11434").replace(/\/$/, "") + "/api/chat";
    const model = opts.config.model ?? "qwen2.5:0.5b";
    return runHttpJsonReview({
      reviewerId: opts.reviewerId,
      endpoint,
      model,
      headers: {},
      systemPrompt: opts.systemPrompt,
      userMessage: opts.userMessage,
      timeoutMs: opts.timeoutMs,
      label: opts.label,
      extraBodyFields: { format: "json" },
      parseResponse: (body) => {
        const parsed = OllamaResponseSchema.safeParse(body);
        if (!parsed.success) {
          throw new ReviewerOperationalError(
            `${opts.label} reviewer response missing expected shape: ${parsed.error.message}`,
          );
        }
        return parsed.data.message.content;
      },
    });
  }

  // openrouter
  const base = (opts.config.endpoint ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const endpoint = `${base}/chat/completions`;
  const model = opts.config.model ?? "anthropic/claude-sonnet-4-6";
  const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
  return runHttpJsonReview({
    reviewerId: opts.reviewerId,
    endpoint,
    model,
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "HTTP-Referer": "https://github.com/yannmenec/inspectrum",
      "X-Title": "inspectrum",
    },
    systemPrompt: opts.systemPrompt,
    userMessage: opts.userMessage,
    timeoutMs: opts.timeoutMs,
    label: opts.label,
    parseResponse: (body) => {
      const parsed = OpenRouterResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ReviewerOperationalError(
          `${opts.label} reviewer response missing expected shape: ${parsed.error.message}`,
        );
      }
      return parsed.data.choices[0]!.message.content;
    },
  });
}

const CLAUDE_RESERVED: ReservedFlags = {
  bool: ["-p", "--print"],
  paired: ["--append-system-prompt", "--json-schema", "--output-format"],
};

async function runClaudeJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  const binary = opts.config.binary ?? "claude";
  const userArgs = mergeReviewerArgs(opts.config.args ?? ["--no-session-persistence"], CLAUDE_RESERVED);
  const args = [
    "-p",
    "--output-format",
    "json",
    ...userArgs,
    "--append-system-prompt",
    opts.systemPrompt,
    "--json-schema",
    RAW_REVIEW_JSON_SCHEMA,
  ];
  const { stdout } = await spawnCollect({ binary, args, stdin: opts.userMessage, timeoutMs: opts.timeoutMs, label: opts.label });
  return parseClaudeOutput(stdout, opts.reviewerId, opts.label);
}

const CODEX_RESERVED: ReservedFlags = {
  // `exec` is the codex subcommand we always inject; if a user re-passes it,
  // drop the duplicate. `--ephemeral` is a bool flag.
  bool: [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "--dangerously-bypass-hook-trust",
  ],
  paired: [
    "-m",
    "--model",
    "-s",
    "--sandbox",
    "-a",
    "--ask-for-approval",
    "-C",
    "--cd",
    "--add-dir",
    "--output-schema",
    "--output-last-message",
  ],
};

async function runCodexJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  const binary = opts.config.binary ?? "codex";
  const model = extractModel(opts.config);
  const tempDir = mkdtempSync(join(tmpdir(), "inspectrum-codex-"));
  const schemaFile = join(tempDir, "schema.json");
  const outputFile = join(tempDir, "output.json");

  try {
    writeFileSync(schemaFile, RAW_REVIEW_JSON_SCHEMA, { encoding: "utf8", mode: 0o600 });
    const userArgs = mergeReviewerArgs(opts.config.args, CODEX_RESERVED);
    const args = [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "-s",
      "read-only",
      ...(model ? ["-m", model] : []),
      // Bare value on purpose: codex -c parses values as TOML and falls back to
      // a raw string when that fails; quoting here would embed literal quotes.
      ...(opts.config.effort ? ["-c", `model_reasoning_effort=${opts.config.effort}`] : []),
      "--output-schema",
      schemaFile,
      "--output-last-message",
      outputFile,
      ...userArgs,
      opts.systemPrompt,
    ];
    await spawnCollect({ binary, args, stdin: opts.userMessage, timeoutMs: opts.timeoutMs, label: opts.label, cwd: tempDir });
    return parseRawReview(readFileSync(outputFile, "utf8"), opts.reviewerId, opts.label);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const GEMINI_FAMILY_RESERVED: ReservedFlags = {
  bool: [],
  paired: ["-m", "--model", "-p", "--prompt"],
};

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
  const userArgs = mergeReviewerArgs(opts.config.args, GEMINI_FAMILY_RESERVED);
  const args = ["-m", model, ...userArgs, "-p", opts.systemPrompt + JSON_INSTRUCTION];
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
  // ASSUMPTION: kimi CLI (uv tool install --python 3.13 kimi-cli) uses:
  //   kimi -m <model> -p <systemPrompt>
  //   stdin = userMessage, stdout = JSON or markdown-fenced JSON
  // Auth: MOONSHOT_API_KEY env var (CLI reads automatically)
  // If actual CLI flags differ, update the args array below.
  const binary = opts.config.binary ?? "kimi";
  const model = extractModel(opts.config, "kimi-k2");
  const userArgs = mergeReviewerArgs(opts.config.args, GEMINI_FAMILY_RESERVED);
  const args = ["-m", model, ...userArgs, "-p", opts.systemPrompt + JSON_INSTRUCTION];
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
  // ASSUMPTION: qwen CLI (npm install -g @qwen-code/qwen-code@latest) uses:
  //   qwen -m <model> -p <systemPrompt>
  //   stdin = userMessage, stdout = JSON or markdown-fenced JSON
  // Auth: DASHSCOPE_API_KEY env var (CLI reads automatically)
  // If actual CLI flags differ, update the args array below.
  const binary = opts.config.binary ?? "qwen";
  const model = extractModel(opts.config, "qwen3-235b-a22b");
  const userArgs = mergeReviewerArgs(opts.config.args, GEMINI_FAMILY_RESERVED);
  const args = ["-m", model, ...userArgs, "-p", opts.systemPrompt + JSON_INSTRUCTION];
  const { stdout } = await spawnCollect({ binary, args, stdin: opts.userMessage, timeoutMs: opts.timeoutMs, label: opts.label });
  return parseRawReview(stripJsonPayload(stdout), opts.reviewerId, opts.label);
}

function extractModel(config: ReviewerConfig, defaultModel: string): string;
function extractModel(config: ReviewerConfig, defaultModel?: undefined): string | undefined;
function extractModel(config: ReviewerConfig, defaultModel?: string): string | undefined {
  if (config.model) return config.model;
  const args = config.args ?? [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if ((a === "-m" || a === "--model") && i + 1 < args.length) return args[i + 1]!;
    if (a.startsWith("--model=")) return a.slice("--model=".length);
    if (a.startsWith("-m=")) return a.slice("-m=".length);
  }
  return defaultModel;
}

function spawnCollect(opts: {
  binary: string;
  args: string[];
  stdin: string;
  timeoutMs: number;
  label: string;
  cwd?: string;
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
      proc = spawn(opts.binary, opts.args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
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

  const rawReview = envelope.data.structured_output == null
    ? envelope.data.result
    : JSON.stringify(envelope.data.structured_output);
  return parseRawReview(rawReview, reviewerId, label);
}

function dropNullKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNullKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null) continue;
      out[k] = dropNullKeys(v);
    }
    return out;
  }
  return value;
}

function parseRawReview(raw: string, reviewerId: string, label: string): RawReview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ReviewerOperationalError(`${label} reviewer returned non-JSON output: ${raw.slice(0, 200)}`);
  }

  const cleaned = dropNullKeys(parsed);
  const review = RawReviewSchema.safeParse(cleaned);
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
