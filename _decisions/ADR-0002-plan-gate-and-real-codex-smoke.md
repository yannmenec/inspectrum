# ADR-0002 — ExitPlanMode plan gate + opt-in real-codex smoke

Date: 2026-07-11
Status: Accepted (owner-approved v0.2.0 MVP plan, "Claude Code Plan + Codex review")

## Context

v0.1 exposed exactly one MCP tool (`review_plan`) and relied on the user
typing "review this plan with inspectrum" before Claude Code's plan-approval
modal appears — undiscoverable, and the modal blocks chat once shown. The
v0.2.0 MVP centers on one flow: a Claude Code plan-mode session whose plan is
automatically reviewed by the OpenAI Codex CLI *before* the user sees the
approval dialog.

Claude Code offers a deterministic interception point: a `PreToolUse` hook
matching the `ExitPlanMode` tool. The hook receives the plan on stdin
(`tool_input.plan`, `tool_input.planFilePath` fallback — verified empirically
on Claude Code 2.1.x) and can bounce it back to the model with
`permissionDecision: "deny"` + a reason.

## Decision

1. **New CLI surface, not a new MCP tool.** `inspectrum plan-gate` reads the
   hook JSON from stdin, reuses `reviewPlan()` with the codex reviewer
   (`judge: false`), and prints a `PreToolUseDecisionSchema`-shaped JSON
   decision. The "exactly one MCP tool" invariant stands.
2. **Hook decision contract.** verdict `revise`/`reject` → deny with a
   compact, budgeted reason (`plan_gate.reason_max_chars`, default 3000;
   blockers/majors first, nits dropped, full-report path appended). verdict
   `approve` → **no** `permissionDecision` (never "allow": the user's
   plan-approval dialog must still appear) + a short `systemMessage`.
3. **Loop protection.** Per-session state in
   `~/.inspectrum/state/plan-gate-<sessionKey>.json` (0600, atomic rename,
   7-day prune): plan hashes already approved pass immediately; identical
   re-submissions of a denied plan replay the cached deny without re-spending
   codex; `plan_gate.max_rounds` (default 2) denials, then pass-through with
   a warning.
4. **Fail-open.** Any operational error (codex missing/logged-out/timeout,
   malformed stdin, missing plan, state I/O failure) lets ExitPlanMode
   proceed with a visible `systemMessage` warning. The gate must never brick
   plan approval.
5. **Reviewer wallclock cap raised.** `limits.timeout_seconds` default is now
   300 (was 60, and was only wired to the judge). Reasoning-heavy codex runs
   (high/ultra effort) regularly need minutes; the hook itself runs under a
   600s Claude Code hook timeout with an internal 540s deadline.
6. **`tests/integration/` reintroduced as opt-in-only**, superseding the
   blanket deferral in ADR-0001: a real-codex smoke test
   (`INSPECTRUM_E2E_CODEX=1`) validates the actual `codex exec … -s read-only
   -c model_reasoning_effort=… --output-schema … --output-last-message …`
   invocation. It never runs in CI by default. ADR-0001's consequence — a
   backend promoted to default requires a real-CLI smoke — is honored here:
   codex becomes the default reviewer in the same release that ships its
   smoke.

## Consequences

- Distribution gains a Claude Code plugin (hook + `/inspectrum:review`
  command); the MCP server registration stays separate and unchanged.
- `src/hook/**` joins the ≥90% coverage gate.
- The gate reviews plans with whatever model/effort codex resolves
  (`~/.inspectrum/config.toml` reviewer overrides win over
  `~/.codex/config.toml`); `inspectrum doctor` prints the resolved values.
- Claude Code hook-input field names are a moving target; `HookInputSchema`
  is a `looseObject` and unknown shapes fail open by design.
