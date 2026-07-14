import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { reviewPlan } from "../tool/review-plan.js";
import { truncatePlan } from "../reviewers/common.js";
import { HookInputSchema, type Config, type PreToolUseDecision } from "../schemas.js";
import { planHash, resolveSessionKey, loadGateState, saveGateState, pruneGateState } from "./state.js";
import { renderDenyReason } from "./render.js";

/** Claude Code's hook timeout is 600s; bail before it kills us so we can fail open. */
const DEFAULT_DEADLINE_MS = 540_000;
const PLAN_FILE_MAX_BYTES = 64_000;

export interface PlanGateDeps {
  reviewPlanFn?: typeof reviewPlan;
  stateDir?: string;
  now?: () => Date;
  deadlineMs?: number;
  plansDir?: string;
  planFileUid?: number;
}

/**
 * `inspectrum plan-gate`: deterministic PreToolUse gate on ExitPlanMode.
 * Reads the Claude Code hook JSON, reviews the plan with the configured
 * reviewer(s), and prints a PreToolUseDecision. Every operational failure
 * fails OPEN (plan proceeds, visible warning) — the gate must never brick
 * plan approval. Returns the exact stdout payload ("" = no-op).
 */
export async function runPlanGate(rawStdin: string, config: Config, deps: PlanGateDeps = {}): Promise<string> {
  try {
    return await gate(rawStdin, config, deps);
  } catch (err) {
    return failOpen(errText(err));
  }
}

async function gate(rawStdin: string, config: Config, deps: PlanGateDeps): Promise<string> {
  const input = HookInputSchema.parse(JSON.parse(rawStdin));

  // The hook matcher already filters on ExitPlanMode; only an explicit
  // mismatch (hook misconfigured on another tool) turns us into a no-op.
  if (input.tool_name !== undefined && input.tool_name !== "ExitPlanMode") return "";
  if (!config.plan_gate.enabled) return "";

  let plan = input.tool_input?.plan ?? "";
  if (!plan && input.tool_input?.planFilePath) {
    plan = readPlanFile(input.tool_input.planFilePath, deps);
  }
  if (!plan.trim()) return failOpen("no plan found in hook input");
  plan = truncatePlan(plan);

  const sessionKey = resolveSessionKey(input);
  const state = loadGateState(sessionKey, deps.stateDir);
  pruneGateState(deps.stateDir);
  const hash = planHash(plan);
  const now = deps.now ?? (() => new Date());

  if (state.approved_hashes.includes(hash)) {
    return allow("inspectrum: plan already approved by codex (unchanged).");
  }
  if (state.rounds_used >= config.plan_gate.max_rounds) {
    return allow(
      `inspectrum: review budget exhausted (${config.plan_gate.max_rounds} rounds) — ` +
        "plan proceeds to your approval with unresolved findings.",
    );
  }

  const cached = state.denied.find((d) => d.hash === hash);
  if (cached) {
    state.rounds_used += 1;
    state.updated_at = now().toISOString();
    await trySave(state, deps.stateDir);
    return deny(cached.reason);
  }

  const reviewPlanFn = deps.reviewPlanFn ?? reviewPlan;
  const review = await withDeadline(
    reviewPlanFn(
      {
        plan,
        reviewers: config.plan_gate.reviewers,
        judge: false,
        focus: config.defaults.focus,
      },
      config,
    ),
    deps.deadlineMs ?? DEFAULT_DEADLINE_MS,
  );

  if (review.verdict === "approve") {
    state.approved_hashes.push(hash);
    state.rounds_used = 0;
    state.updated_at = now().toISOString();
    await trySave(state, deps.stateDir);
    return allow(`inspectrum: codex approved the plan (session ${review.session_id}).`);
  }

  const round = state.rounds_used + 1;
  const reason = renderDenyReason({
    verdict: review.verdict,
    findings: review.findings,
    round,
    maxRounds: config.plan_gate.max_rounds,
    sessionPath: review.session_path,
    budget: config.plan_gate.reason_max_chars,
  });
  state.denied.push({ hash, reason, at: now().toISOString() });
  state.rounds_used = round;
  state.updated_at = now().toISOString();
  await trySave(state, deps.stateDir);
  return deny(reason);
}

function readPlanFile(planFilePath: string, deps: PlanGateDeps): string {
  const plansDir = resolve(deps.plansDir ?? defaultPlansDir());
  const candidate = resolve(planFilePath);
  assertContained(plansDir, candidate);
  if (extname(candidate).toLowerCase() !== ".md") throw new Error("plan file must have a .md extension");

  const before = lstatSync(candidate);
  if (before.isSymbolicLink() || !before.isFile()) throw new Error("plan path is not a regular file");
  if (before.size > PLAN_FILE_MAX_BYTES) throw new Error(`plan file exceeds ${PLAN_FILE_MAX_BYTES} byte limit`);

  const realPlansDir = realpathSync(plansDir);
  const realCandidate = realpathSync(candidate);
  assertContained(realPlansDir, realCandidate);

  const fd = openSync(
    candidate,
    constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
  );
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile()) throw new Error("plan path is not a regular file");
    if (opened.dev !== before.dev || opened.ino !== before.ino) throw new Error("plan file changed while opening");
    if (opened.size > PLAN_FILE_MAX_BYTES) throw new Error(`plan file exceeds ${PLAN_FILE_MAX_BYTES} byte limit`);

    const expectedUid = deps.planFileUid ?? process.getuid?.();
    if (expectedUid !== undefined && opened.uid !== expectedUid) throw new Error("plan file has an unexpected owner");

    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const remaining = PLAN_FILE_MAX_BYTES - total;
      const chunk = Buffer.allocUnsafe(Math.min(16 * 1024, remaining + 1));
      const bytesRead = readSync(fd, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > PLAN_FILE_MAX_BYTES) throw new Error(`plan file exceeds ${PLAN_FILE_MAX_BYTES} byte limit`);
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function defaultPlansDir(): string {
  if (process.env["CLAUDE_CONFIG_DIR"]) return resolve(process.env["CLAUDE_CONFIG_DIR"], "plans");
  if (!process.env["HOME"]) throw new Error("HOME is not set");
  return resolve(process.env["HOME"], ".claude", "plans");
}

function assertContained(parent: string, child: string): void {
  const rel = relative(parent, child);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("plan file is outside the Claude plans directory");
  }
}

function allow(systemMessage: string): string {
  return serialize({ systemMessage });
}

function deny(reason: string): string {
  return serialize({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
    suppressOutput: true,
  });
}

function failOpen(reason: string): string {
  return serialize({ systemMessage: `inspectrum plan-gate skipped: ${reason}. Plan proceeds unreviewed.` });
}

function serialize(decision: PreToolUseDecision): string {
  return JSON.stringify(decision);
}

/** Loop protection degrades gracefully when the state dir is unwritable. */
async function trySave(state: Parameters<typeof saveGateState>[0], stateDir?: string): Promise<void> {
  try {
    await saveGateState(state, stateDir);
  } catch {
    // Review still ran; only replay/round accounting is lost.
  }
}

async function withDeadline<T>(work: Promise<T>, deadlineMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`review exceeded ${Math.round(deadlineMs / 1000)}s deadline`)), deadlineMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
