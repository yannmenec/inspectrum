# Inspectrum

Universal MCP server for multi-LLM **plan** review today, **plan + code-change** review
tomorrow. One tool, many reviewers, flat-Markdown session log.

Stack: TypeScript strict (ES2022, Node16 modules), Node ≥ 20, ESM, MCP SDK 1.29+,
Zod v4. Distribution: `npx inspectrum`. License: MIT.

Target user: a solo dev or small team running multiple coding agents (Claude Code,
Codex, Cursor, Gemini CLI) who wants to stop copy-pasting plans between them.

## What this repo is

- A single MCP server (`src/server.ts`) exposing one tool: `review_plan`.
- Wraps peer LLM backends via `child_process` or HTTP (Claude / Codex / Gemini /
  Kimi / Qwen / Ollama / OpenRouter), aggregates their findings, optionally runs
  a judge agent for consolidation, writes a flat-Markdown session log to
  `~/.inspectrum/sessions/<ts>__<id>/`.
- v0.1 = plan-only review. v0.2+ extends to code/PR review. Stay inside the
  current scope unless an ADR or PR explicitly opens a new surface.

## Setup & dev loop

- Install: `npm install`
- Build: `npm run build`           (tsc → `dist/`)
- Dev: `npm run dev`               (tsx loader, no build step)
- Tests: `npm test`                (Vitest)
- Coverage: `npm run test:coverage`
- Lint: `npx eslint src/`          (flat config, `eslint.config.js`)
- Typecheck: `npx tsc --noEmit`
- Pre-commit (lefthook): typecheck + lint + tests-with-coverage run automatically.

## Repo map

- `src/server.ts` — MCP entrypoint, stdio transport, registers `review_plan`.
- `src/schemas.ts` — central Zod v4 schemas. All schemas live here, not per module.
- `src/config.ts` — `~/.inspectrum/config.toml` loader (`@iarna/toml` + Zod).
- `src/tool/review-plan.ts` — orchestration, parallel reviewers, verdict aggregation, report assembly, session write.
- `src/reviewers/` — `index.ts` (factory) + `claude.ts`, `codex.ts`, `gemini.ts`, `kimi.ts`, `qwen.ts`, `ollama.ts`, `openrouter.ts` (backends) + `health.ts` (doctor) + `common.ts` (shared helpers).
- `src/judge/judge.ts` — consolidation pass with `validateJudgeInvariants`.
- `src/prompts/index.ts` — `REVIEWER_SYSTEM_PROMPT`, `JUDGE_SYSTEM_PROMPT` as inline TS strings, NOT loaded from `.md`.
- `src/session/{store,resources}.ts` — flat-file persistence + MCP resource exposure.
- `tests/{contract,unit,e2e}/` — Vitest. Fixtures under `tests/fixtures/`. (`integration/` deferred — see `_decisions/ADR-0001-defer-integration-tests.md`.)

## Testing

- TDD for new modules: red → green → refactor.
- Contract tests in `tests/contract/` lock the MCP tool I/O shape — do not relax their assertions to make a change land.
- Unit tests mock `node:child_process` (vitest mocks) and HTTP via `nock`.
- Canonical plans live in `tests/fixtures/plans/`. Snapshot reports under `tests/fixtures/reports/`.
- Coverage gate (`vitest.config.ts`): ≥ 90 % lines, ≥ 90 % functions, ≥ 90 % branches on `src/tool/**`, `src/reviewers/**`, `src/judge/**`, `src/config.ts`, `src/doctor.ts`, `src/server/**`, `src/session/**`. Do not lower these.
- Never commit failing tests; the pre-commit hook will block.

## Architecture invariants

- Exactly one MCP tool: `review_plan`. A second tool requires an ADR.
- Every Zod schema lives in `src/schemas.ts`. No scattered `z.object({...})` per file.
- Reviewer factory: every backend implements the `Reviewer` interface in `src/reviewers/index.ts`. `src/tool/review-plan.ts` never imports a concrete reviewer module directly.
- Prompts are TS strings in `src/prompts/index.ts`. No `fs.readFile` of prompt `.md` at runtime.
- Persistence is flat files under `~/.inspectrum/sessions/<ISO-timestamp>__<id>/`. No SQLite, no daemon, no remote sync.
- Stdio transport only for now. SSE/HTTP transports require an ADR.

## Project-specific gotchas

- **Zod v4, not v3.**
  - `z.record(keySchema, valueSchema)` needs *two* arguments — the single-arg form was removed.
  - `.default({})` on a sub-object does NOT propagate nested defaults. When validating config, always provide the fully shaped default object explicitly.
- **Session writes are atomic and path-traversal-guarded** (J3 hardening). `src/session/store.ts` writes to a tmp path then renames; session IDs are validated to reject `..`. Never bypass these helpers — call `writeSession` / `readSessionFile`.
- **Truncation marker.** Any text trimmed to fit caps ends with the literal `[...truncated]`. Hard caps: `plan ≤ 16000` chars, `context ≤ 8000` chars, reviewer wallclock `≤ 60s`. These caps are encoded in `src/schemas.ts` — do not silently raise them.
- **Health checks** in `src/reviewers/health.ts` use `execFileSync` on purpose (simpler to mock than `promisify(exec)`). Keep this pattern when adding a backend.

## Security & safety

- Never read or commit `.env*`, `**/secrets/**`, `**/credentials*`.
- Reviewer CLIs are spawned via `child_process` with arguments as an **array**, never a shell string. No `shell: true`.
- Treat `plan` and `context` inputs as untrusted: truncate to caps before piping to subprocesses or to disk.
- Never run `rm -rf`, `git push --force`, `git reset --hard`, `git branch -D`, or `npm publish` without explicit user confirmation.
- Sessions are world-readable on the local FS — do not embed user secrets in plans.

## Git & PR workflow

- Branches: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`. Never work directly on `main`.
- Conventional Commits. One logical change per commit.
- PRs ≤ ~400 lines diff. Include a "Test plan" section. CI (typecheck + lint + tests + coverage) must pass.
- Squash-merge only. Delete branch after merge.

## Engineering principles

- TDD for new modules; regression test for every bug fix, referencing the issue or symptom in the test name.
- Hexagonal ports/adapters for every external integration (CLI reviewer, HTTP reviewer, filesystem).
- Trunk-based dev; short-lived branches (< 48 h).
- Any change to an architecture invariant requires an ADR under `_decisions/ADR-NNNN-*.md`.

## Agent execution

- Default: single-agent ReAct with `maxTurns ≈ 8`.
- Spawn sub-agents only for: (a) parallel read-only review (security / tests / perf) while the main agent edits, or (b) isolated-context exploration over many files.
- Never run autonomous loops without a hard turn or token budget.
- Use a Plan or Explore subagent for any change touching > 3 files before editing.

## Self-improvement constraints

- NEVER edit `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or `_decisions/*` directly without explicit user approval.
- To propose updates: open a PR on `agent/propose-<topic>` with a single commit and a one-paragraph rationale.
- Auto-memory may live outside the repo (e.g. `~/.claude/projects/**`); never inside it.

## When in doubt

- If a change touches an architecture invariant, draft an ADR before coding.

## Out of scope (today)

- Code/PR review (planned for v0.2+).
- Execution of the plan being reviewed.
- Git operations from inside the tool.
- UI, SaaS, DB, cloud sync.
- Windows support before v0.5.

## Reporting contract

At the end of any non-trivial task, report:
- Files changed.
- Commands run (build / test / lint / coverage).
- Validation status (pass / fail per check).
- Unresolved risks.
- Assumptions that remain unverified.
