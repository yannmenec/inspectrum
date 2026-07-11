import { readFileSync } from "node:fs";
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
    plan = readFileSync(input.tool_input.planFilePath, "utf8").slice(0, PLAN_FILE_MAX_BYTES);
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
