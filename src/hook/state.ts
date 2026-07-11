import { createHash } from "node:crypto";
import { readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ensurePrivateDir } from "../session/store.js";
import { PlanGateStateSchema, type PlanGateState } from "../schemas.js";

const SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Hash of the plan text with whitespace collapsed, so trivial reformatting
 * (wrapping, trailing newlines) doesn't burn a review round.
 */
export function planHash(plan: string): string {
  return createHash("sha256").update(plan.replace(/\s+/g, " ").trim()).digest("hex");
}

/**
 * One gate state per Claude Code session. Prefers the hook's session_id;
 * falls back to a hash of transcript_path, then a shared "unknown" bucket —
 * degraded loop-protection beats no review.
 */
export function resolveSessionKey(input: { session_id?: string; transcript_path?: string }): string {
  if (input.session_id && SESSION_KEY_PATTERN.test(input.session_id)) return input.session_id;
  if (input.transcript_path) {
    return createHash("sha256").update(input.transcript_path).digest("hex").slice(0, 16);
  }
  return "unknown";
}

export function defaultStateDir(): string {
  return join(homedir(), ".inspectrum", "state");
}

export function freshGateState(sessionKey: string, now: Date = new Date()): PlanGateState {
  return {
    session_key: sessionKey,
    rounds_used: 0,
    approved_hashes: [],
    denied: [],
    updated_at: now.toISOString(),
  };
}

function statePath(sessionKey: string, baseDir?: string): string {
  if (!SESSION_KEY_PATTERN.test(sessionKey)) {
    throw new Error(`Invalid plan-gate session key: ${sessionKey}`);
  }
  return join(baseDir ?? defaultStateDir(), `plan-gate-${sessionKey}.json`);
}

/** Missing, unreadable, corrupt, or schema-invalid state files all yield a fresh state. */
export function loadGateState(sessionKey: string, baseDir?: string): PlanGateState {
  try {
    const raw = readFileSync(statePath(sessionKey, baseDir), "utf8");
    const parsed = PlanGateStateSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.session_key === sessionKey) return parsed.data;
  } catch {
    // Fall through to a fresh state.
  }
  return freshGateState(sessionKey);
}

export async function saveGateState(state: PlanGateState, baseDir?: string): Promise<void> {
  const dir = baseDir ?? defaultStateDir();
  await ensurePrivateDir(dir);
  const target = statePath(state.session_key, dir);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, target);
}

/** Best-effort cleanup of gate states older than maxAgeMs. Never throws. */
export function pruneGateState(baseDir?: string, maxAgeMs: number = DEFAULT_MAX_AGE_MS): void {
  const dir = baseDir ?? defaultStateDir();
  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.startsWith("plan-gate-")) continue;
      const path = join(dir, entry);
      try {
        if (Date.now() - statSync(path).mtimeMs > maxAgeMs) unlinkSync(path);
      } catch {
        // Skip entries we cannot stat or delete.
      }
    }
  } catch {
    // Missing dir — nothing to prune.
  }
}
