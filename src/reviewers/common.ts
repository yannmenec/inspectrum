import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  RawReviewSchema,
  ClaudeEnvelopeSchema,
  AgyEnvelopeSchema,
  GrokEnvelopeSchema,
  OllamaResponseSchema,
  OpenRouterResponseSchema,
} from "../schemas.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";

export type ReviewerBackend =
  | "claude"
  | "codex"
  | "gemini"
  | "ollama"
  | "openrouter"
  | "kimi"
  | "qwen"
  | "muse"
  | "opencode"
  | "agy"
  | "grok";

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
    `Reviewer backend "${id}" is not supported. Supported backends: claude, codex, gemini, kimi, qwen, muse, opencode, agy, grok, ollama (http), openrouter (http).`,
  );
}

function backendFromName(name: string): ReviewerBackend | undefined {
  const known = ["claude", "codex", "gemini", "kimi", "qwen", "muse", "opencode", "agy", "grok"] as const;
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
  if (opts.backend === "gemini") return runGeminiJsonReview(opts);
  if (opts.backend === "muse") return runMuseJsonReview(opts);
  if (opts.backend === "opencode") return runOpencodeJsonReview(opts);
  if (opts.backend === "agy") return runAgyJsonReview(opts);
  if (opts.backend === "grok") return runGrokJsonReview(opts);
  return assertUnhandledBackend(opts.backend);
}

/**
 * Exhaustiveness guard for backend dispatch. The `never` parameter makes a
 * forgotten branch a COMPILE error; the throw covers the runtime case where a
 * value reaches us from outside the type system (a hand-edited config.toml, or
 * a stale build). Both dispatch sites previously ended in a bare Gemini return,
 * which silently ran Gemini for any unhandled backend instead of failing.
 */
export function assertUnhandledBackend(backend: never): never {
  throw new ReviewerOperationalError(
    `Unhandled reviewer backend: ${String(backend)}. This is a bug in inspectrum's backend dispatch.`,
  );
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

const MUSE_RESERVED: ReservedFlags = {
  // `exec` is the subcommand we always inject. The confinement flags are pinned
  // by the canonical invocation: a plan under review is untrusted input, and a
  // real run of `muse exec --disable-approval` alone DID execute a shell command
  // and write outside the repo. --yolo / --disable-sandbox / --enable-shell-tool
  // would undo that, and --json switches stdout to a JSONL event stream.
  bool: [
    "exec",
    "--disable-approval",
    "--disable-shell",
    "--disable-write",
    "--yolo",
    "--disable-sandbox",
    "--enable-shell-tool",
    "--json",
    "--trust-workspace",
  ],
  paired: ["--model", "--reasoning-effort", "--prompt-file", "--provider", "--preset"],
};

/**
 * muse takes its prompt positionally or via --prompt-file, and does NOT read the
 * user message from stdin. We use --prompt-file (0600, in a temp dir) so the plan
 * never lands in argv where `ps aux` would expose it, and so long plans cannot hit
 * ARG_MAX. stdin is deliberately left unwritten: `muse exec` also supports
 * --api-key-stdin on that stream.
 *
 * Verified against muse 0.x: exit 0, bare JSON on stdout, diagnostics on stderr.
 */
async function runMuseJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  const binary = opts.config.binary ?? "muse";
  const model = extractModel(opts.config);
  const tempDir = mkdtempSync(join(tmpdir(), "inspectrum-muse-"));
  const promptFile = join(tempDir, "prompt.txt");

  try {
    writeFileSync(promptFile, `${opts.systemPrompt}${JSON_INSTRUCTION}\n\n${opts.userMessage}`, {
      encoding: "utf8",
      mode: 0o600,
    });
    const userArgs = mergeReviewerArgs(opts.config.args, MUSE_RESERVED);
    const args = [
      "exec",
      "--disable-approval",
      "--disable-shell",
      "--disable-write",
      ...(model ? ["--model", model] : []),
      ...(opts.config.effort ? ["--reasoning-effort", opts.config.effort] : []),
      ...userArgs,
      "--prompt-file",
      promptFile,
    ];
    const { stdout } = await spawnCollect({ binary, args, timeoutMs: opts.timeoutMs, label: opts.label, cwd: tempDir });
    return parseRawReview(stripJsonPayload(stdout), opts.reviewerId, opts.label);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const OPENCODE_RESERVED: ReservedFlags = {
  // `run` is the subcommand we always inject. --auto broadens permissions, and
  // --format json switches stdout to a raw event stream instead of our object.
  bool: ["run", "--auto", "-c", "--continue", "--share", "-i", "--interactive"],
  // --agent carries the confinement (see below) and must not be overridden.
  paired: ["--agent", "-m", "--model", "--variant", "--format", "-s", "--session", "--command"],
};

/**
 * opencode (`opencode run`) reviewer.
 *
 * Confinement: `--agent summary` is pinned. Verified against the real CLI — the
 * default `build` agent ran a shell command from prompt text and wrote outside
 * the repo, while `summary` (whose permission set ends in
 * {"permission":"*","action":"deny"}) refused the same prompt and still returned
 * a well-formed review. The plan under review is untrusted input, so the
 * reviewer must not be able to run tools.
 *
 * Verified: opencode reads the prompt from stdin, prints bare JSON on stdout and
 * keeps its decorative banner on stderr. `--format json` is NOT used: it emits a
 * stream of raw events rather than the review object.
 */
async function runOpencodeJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  const binary = opts.config.binary ?? "opencode";
  const model = extractModel(opts.config);
  const userArgs = mergeReviewerArgs(opts.config.args, OPENCODE_RESERVED);
  const args = [
    "run",
    "--agent",
    "summary",
    ...(model ? ["-m", model] : []),
    ...(opts.config.effort ? ["--variant", opts.config.effort] : []),
    ...userArgs,
  ];
  const stdin = `${opts.systemPrompt}${JSON_INSTRUCTION}\n\n${opts.userMessage}`;
  const { stdout } = await spawnCollect({ binary, args, stdin, timeoutMs: opts.timeoutMs, label: opts.label });
  return parseRawReview(stripJsonPayload(stdout), opts.reviewerId, opts.label);
}

const AGY_RESERVED: ReservedFlags = {
  bool: ["-p", "--print", "--prompt", "--disable-slash-commands", "--dangerously-skip-permissions"],
  paired: ["--output-format", "--json-schema", "--model", "--effort", "--input-format", "--mode"],
};

/**
 * agy reviewer. Verified contract:
 *   agy -p <prompt> --disable-slash-commands --json-schema <schema>
 *       --output-format json [--model <m>] [--effort <e>]
 *
 * `--effort` is passed ONLY when configured: a real run of `agy --effort high`
 * with no model failed with "--effort is not supported for the current model".
 *
 * Output is a proprietary envelope — {conversation_id, status, response,
 * structured_output, ...} — sharing no field names with Claude's, hence its own
 * AgyEnvelopeSchema. `structured_output` is preferred because --json-schema fills
 * it deterministically; `response` is a STRINGIFIED JSON fallback that has been
 * observed carrying a markdown fence, so it goes through stripJsonPayload.
 */
async function runAgyJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  const binary = opts.config.binary ?? "agy";
  const model = extractModel(opts.config);
  const userArgs = mergeReviewerArgs(opts.config.args, AGY_RESERVED);
  const args = [
    "-p",
    `${opts.systemPrompt}\n\n${opts.userMessage}`,
    "--disable-slash-commands",
    ...(model ? ["--model", model] : []),
    ...(opts.config.effort ? ["--effort", opts.config.effort] : []),
    ...userArgs,
    "--json-schema",
    RAW_REVIEW_JSON_SCHEMA,
    "--output-format",
    "json",
  ];
  const { stdout } = await spawnCollect({ binary, args, timeoutMs: opts.timeoutMs, label: opts.label });
  return parseAgyOutput(stdout, opts.reviewerId, opts.label);
}

function parseAgyOutput(raw: string, reviewerId: string, label: string): RawReview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new ReviewerOperationalError(`${label} reviewer returned non-JSON output: ${raw.slice(0, 200)}`);
  }

  const envelope = AgyEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new ReviewerOperationalError(`${label} output did not match expected envelope: ${raw.slice(0, 200)}`);
  }
  if (envelope.data.status !== "SUCCESS") {
    const detail = envelope.data.error ?? envelope.data.response ?? envelope.data.status;
    throw new ReviewerOperationalError(`${label} reviewer failed: ${detail}`);
  }

  const payload =
    envelope.data.structured_output == null
      ? stripJsonPayload(envelope.data.response ?? "")
      : JSON.stringify(envelope.data.structured_output);
  return parseRawReview(payload, reviewerId, label);
}

/**
 * Built-in grok tools the reviewer is allowed to use. This is an ALLOW-LIST and it
 * is the only mechanism that actually confines grok — all three were tested
 * against the real CLI:
 *   --sandbox read-only        did NOT stop a write to /tmp
 *   --disallowed-tools <names> was ignored (grok still reported
 *                              run_terminal_command as available)
 *   --tools <allow-list>       DID stop it: "I don't have a local shell tool in
 *                              this session", with the write never happening.
 * Reviewing a plan needs no shell, no writes and no subagents.
 */
const GROK_ALLOWED_TOOLS = "read_file,grep,list_dir";

const GROK_MAX_TURNS = "8";

const GROK_RESERVED: ReservedFlags = {
  bool: ["--disable-web-search", "--no-subagents", "--always-approve", "-p", "--single"],
  paired: [
    "--tools",
    "--disallowed-tools",
    "--max-turns",
    "--permission-mode",
    "--sandbox",
    "--json-schema",
    "--output-format",
    "--prompt-file",
    "--system-prompt-override",
  ],
};

/**
 * grok reviewer. Verified contract:
 *   grok --prompt-file <file> --json-schema <schema> --tools <allow-list>
 *        --max-turns N --disable-web-search --no-subagents [-m <model>] [--effort <e>]
 *
 * Output is a THIRD distinct envelope: {text, stopReason, structuredOutput} —
 * camelCase, unlike Claude's structured_output and agy's response. A valid
 * structuredOutput is accepted regardless of stopReason (the schema was
 * satisfied; a trailing thought may simply have hit a token cap); without one,
 * anything other than end_turn is an operational failure.
 */
async function runGrokJsonReview(opts: {
  reviewerId: string;
  config: ReviewerConfig;
  systemPrompt: string;
  userMessage: string;
  timeoutMs: number;
  label: string;
}): Promise<RawReview> {
  const binary = opts.config.binary ?? "grok";
  const model = extractModel(opts.config);
  const tempDir = mkdtempSync(join(tmpdir(), "inspectrum-grok-"));
  const promptFile = join(tempDir, "prompt.txt");

  try {
    writeFileSync(promptFile, `${opts.systemPrompt}\n\n${opts.userMessage}`, {
      encoding: "utf8",
      mode: 0o600,
    });
    const userArgs = mergeReviewerArgs(opts.config.args, GROK_RESERVED);
    const args = [
      "--prompt-file",
      promptFile,
      "--tools",
      GROK_ALLOWED_TOOLS,
      "--max-turns",
      GROK_MAX_TURNS,
      "--disable-web-search",
      "--no-subagents",
      ...(model ? ["-m", model] : []),
      ...(opts.config.effort ? ["--effort", opts.config.effort] : []),
      ...userArgs,
      "--json-schema",
      RAW_REVIEW_JSON_SCHEMA,
    ];
    const { stdout } = await spawnCollect({ binary, args, timeoutMs: opts.timeoutMs, label: opts.label, cwd: tempDir });
    return parseGrokOutput(stdout, opts.reviewerId, opts.label);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function parseGrokOutput(raw: string, reviewerId: string, label: string): RawReview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new ReviewerOperationalError(`${label} reviewer returned non-JSON output: ${raw.slice(0, 200)}`);
  }

  const envelope = GrokEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new ReviewerOperationalError(`${label} output did not match expected envelope: ${raw.slice(0, 200)}`);
  }
  // A failing run prints {"type":"error","message":"..."} (e.g. HTTP 402).
  if (envelope.data.type === "error") {
    throw new ReviewerOperationalError(`${label} reviewer failed: ${envelope.data.message ?? "unknown error"}`);
  }

  if (envelope.data.structuredOutput != null) {
    return parseRawReview(JSON.stringify(envelope.data.structuredOutput), reviewerId, label);
  }
  if (envelope.data.stopReason !== "end_turn") {
    throw new ReviewerOperationalError(
      `${label} reviewer stopped early (stopReason: ${envelope.data.stopReason ?? "unknown"}) without structured output`,
    );
  }
  return parseRawReview(stripJsonPayload(envelope.data.text ?? ""), reviewerId, label);
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

/**
 * Spawns a reviewer CLI and collects stdout/stderr.
 *
 * `stdin` is OPTIONAL: backends that hand the prompt over by file (muse and grok
 * `--prompt-file`) must not have an unrelated payload written to their stdin —
 * `muse exec` also reads `--api-key-stdin` from that stream. When `stdin` is
 * omitted the stream is closed immediately without a write, so the child never
 * blocks waiting on input. An empty string is a payload and IS written.
 */
export function spawnCollect(opts: {
  binary: string;
  args: string[];
  stdin?: string;
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

    if (opts.stdin !== undefined) proc.stdin.write(opts.stdin);
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
