# Contributing to inspectrum

## Prerequisites

- Node ≥ 20 (`node --version`)
- npm (bundled with Node)
- Optional (to test reviewers locally): `claude`, `codex`, `gemini` CLIs in your PATH

## Dev loop

```bash
npm install            # install all dependencies
npm run dev            # start MCP server with tsx hot-reload (no build step)
npm test               # run unit + contract tests once
npm run test:e2e       # build, then run the e2e MCP stdio suite
npm run test:coverage  # tests + coverage report (gate: ≥ 90% on the scopes in vitest.config.ts)
npm run build          # compile TypeScript → dist/
npx tsc --noEmit       # type-check only
npx eslint src/        # lint
```

## Be kind

Be respectful. Bad-faith behavior gets you blocked. Flag conduct problems
by opening a GitHub issue prefixed `[conduct]`. A formal Code of Conduct
may be added once contributor traffic warrants one.

## Privacy

Session logs (`~/.inspectrum/sessions/<timestamp>__<id>/`) contain user
plans and full reviewer transcripts. v0.1.0 chmods each session directory
and the parent `~/.inspectrum/sessions/` to **0700 on POSIX** so only the
owning user can read them. Existing session dirs created by older
inspectrum runs are **not** auto-migrated; users can retrofit with
`chmod -R 700 ~/.inspectrum/sessions/`. Never commit session content to
this repo, and never paste secrets into a plan when reproducing an issue.

## Release runbook

inspectrum is published to npm as a public unscoped package. The owner
runs the publish steps; CI and `prepack` are the safety nets.

### Pre-release checks (always run)

```bash
git diff --check                # clean working tree
npx tsc --noEmit                # 0 errors
npx eslint src/                 # 0 errors
npm run build                   # 0 errors
npm run test:coverage           # green, ≥ 90/90/90 on the gated scopes
npm run test:e2e                # green
npm pack --dry-run --json       # tarball entry list looks right
npm view inspectrum name version --json    # confirm the name is still available
```

### Tagging + publishing

```bash
git checkout main && git pull --ff-only
git tag -a v0.1.0 -m "v0.1.0 — first public release"
git push origin main --tags
npm publish --access public
```

### Post-publish smoke (60 s)

```bash
cd $(mktemp -d) && npx -y inspectrum@0.1.0 doctor
```

Expect 4 sections (Runtime / Config / Sessions / Reviewers) and a non-zero
exit if no reviewer CLI is installed — that's the correct behavior on a
clean machine.

### Why `npm publish --dry-run` is not a safety net

npm 11's `--dry-run` prints "would publish" output regardless of whether
the real call would have succeeded or failed (and it never makes network
calls). Treat the flag as documentation of what *would* ship, not as a
gate. The actual safety nets are `prepack`, the `files` allowlist, and
manual review of `npm pack --dry-run --json` output before tagging.

## Pre-commit (lefthook)

`lefthook` runs automatically on `git commit`:

1. `npx tsc --noEmit` — full type-check
2. `npx eslint src/` — lint
3. `npx vitest run --passWithNoTests --coverage` — tests + coverage gate

Manual rehearsal works even with nothing staged:

```bash
npx lefthook run pre-commit
```

If a hook fails, fix the underlying issue and re-commit. Never bypass with
`--no-verify`.

## From-source install (for contributors)

Public users install with `npx inspectrum@latest`. Contributors usually
clone:

```bash
git clone https://github.com/yannmenec/inspectrum.git
cd inspectrum
npm install
npm run build
node dist/cli.js doctor
```

Then point your MCP host at the local build. For Claude Code, copy
[`examples/claude-code/mcp.source.jsonc`](examples/claude-code/mcp.source.jsonc)
to `.mcp.json` and edit the absolute path. Cursor's `.cursor/mcp.json`
doesn't accept JSONC comments — copy the JSON shape from
[`examples/cursor/.cursor/mcp.json`](examples/cursor/.cursor/mcp.json) and
swap `command/args` to `node` + `["<abs path>/dist/server.js"]` by hand.

If you're reviewing plans from a Desktop host (Claude Code, Codex app,
Cursor), see the [Cross-LLM setup](README.md#cross-llm-setup) section in
README for how to pass peer-LLM API keys through the host's MCP `env` block.
Without that, `review_plan` will fail with auth errors even though
`inspectrum doctor` reports ✅ for binary presence.

## Experimental reviewers

Kimi and Qwen wrappers ship in v0.1.0 but are **experimental**:

- The CLI flag shapes (`-m <model> -p <systemPrompt>` over stdin) are
  *assumed* based on similar gemini-family CLIs.
- They have not been smoke-tested against real Moonshot or DashScope CLIs.
- Per [ADR-0001](_decisions/ADR-0001-defer-integration-tests.md), promoting
  any reviewer backend to "default" requires a real-CLI smoke test in
  `tests/integration/` (reintroduced post-v0.2).

Don't put `kimi` or `qwen` in `defaults.reviewers` of a config you ship to
end users. If the assumed flags turn out to be wrong, open an issue and
patch `src/reviewers/common.ts`.

## Adding a reviewer backend

Adding a backend (e.g. `kimi`) takes ≤ 4 hours and follows these five steps.

### Step 1 — Implement the `Reviewer` interface

Create `src/reviewers/kimi.ts`:

```typescript
import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import { buildUserMessage, runBackendJsonReview, truncatePlan } from "./common.js";
import type { RawReview, ReviewerConfig } from "../schemas.js";
import type { Reviewer } from "./index.js";

export class KimiReviewer implements Reviewer {
  constructor(
    public readonly id: string,
    private readonly config: ReviewerConfig,
    private readonly timeoutMs = 60_000,
  ) {}

  async review(plan: string, focus: string, context?: string): Promise<RawReview> {
    return runBackendJsonReview({
      backend: "kimi",
      reviewerId: this.id,
      config: this.config,
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      userMessage: buildUserMessage(this.id, truncatePlan(plan), focus, context),
      timeoutMs: this.timeoutMs,
      label: "Kimi",
    });
  }
}
```

For HTTP backends (e.g. `ollama`, `openrouter`), call
`runHttpBackendJsonReview` instead of `runBackendJsonReview`.

### Step 2 — Extend `src/reviewers/common.ts`

This file owns the `ReviewerBackend` union, the `backendFromName` resolver,
the `mergeReviewerArgs` helper's reserved-flag sets, and the
`runBackendJsonReview` dispatch. All must be updated:

```typescript
// 1. Extend the union type:
export type ReviewerBackend = "claude" | "codex" | "gemini" | "ollama" | "openrouter" | "kimi" | "qwen";

// 2. Register the binary name in backendFromName():
const known = ["claude", "codex", "gemini", "kimi", "qwen"] as const;

// 3. Update the error message in resolveReviewerBackend():
throw new ReviewerOperationalError(
  `Reviewer backend "${id}" is not supported. Supported backends: claude, codex, gemini, kimi, qwen, ollama (http), openrouter (http).`
);

// 4. Add a dispatch branch in runBackendJsonReview():
if (opts.backend === "kimi") return runKimiJsonReview(opts);
```

If your backend uses a non-standard I/O format (e.g. temp-file output like
Codex), implement a dedicated private `runKimiJsonReview` function rather
than reusing `runGeminiJsonReview`. Always pass `opts.config.args` through
`mergeReviewerArgs(opts.config.args, RESERVED)` so user-provided args land
in the spawn argv without duplicating reserved canonical flags.

### Step 3 — Register in the factory and schema

In `src/reviewers/index.ts`, add your backend to `createReviewer`:

```typescript
import { KimiReviewer } from "./kimi.js";
// inside createReviewer():
if (backend === "kimi") return new KimiReviewer(id, config);
```

Also add your backend to the `backend` enum in
[src/schemas.ts](src/schemas.ts) `ReviewerConfigSchema`. Both `cli` and
`http` backends share the enum.

### Step 4 — Add a fix hint in health.ts

In `src/reviewers/health.ts`, extend `installFix`:

```typescript
kimi: "Install Kimi CLI: uv tool install --python 3.13 kimi-cli",
```

This appears in `inspectrum doctor` output when the binary is missing.

### Step 5 — Write unit tests

Create `tests/unit/reviewers/kimi.test.ts` following the pattern in
`gemini.test.ts` or `claude.test.ts`. All subprocess calls must be mocked
— no real LLM in unit tests:

- **`spawn`** → mock for reviewer wrappers (any CLI backend).
- **`execFileSync`** → mock for health checks only (`checkReviewer` in
  `health.ts`).
- **`fetch`** → mock via `vi.stubGlobal("fetch", ...)` for HTTP backends
  (ollama, openrouter).

### Step 6 — Add a fixture + snapshot

Add a canonical plan to `tests/fixtures/plans/` and wire up a snapshot test
in the relevant suite. Regenerate snapshots after intentional prompt changes:

```bash
npx vitest run --update-snapshots
```

Review the diff carefully before committing — a snapshot change is a
contract change.

## Fixtures and snapshots

Canonical plans live in `tests/fixtures/plans/`. Each file has a
corresponding `expected-verdict.json` and optionally a `report.md.snap`.

Rules:

- Never commit a snapshot update without reading the diff.
- If the judge prompt changes, regenerate all snapshots with
  `vitest --update-snapshots` and review each one.
- Fixture names encode the expected verdict: `trivial-correct.md` → approve,
  `security-flaw.md` → reject/revise.

## Coverage gate

`vitest.config.ts` enforces ≥ 90 % statements / functions / lines / branches
across the aggregate of:

- `src/tool/**`
- `src/reviewers/**`
- `src/judge/**`
- `src/config.ts`
- `src/doctor.ts`
- `src/server/**`
- `src/session/**`

Do not lower these thresholds without explicit discussion. If a new module
brings coverage below the gate, write additional tests before merging.

## Architecture invariants

See [AGENTS.md](./AGENTS.md) §Architecture invariants for the full list.
The most critical ones for contributors:

- Exactly one MCP tool: `review_plan`. A second tool requires an ADR under
  `_decisions/ADR-NNNN-*.md`.
- Every Zod schema lives in `src/schemas.ts`. No scattered `z.object({})`.
- Every reviewer backend implements the `Reviewer` interface and is wired
  through `createReviewer` in `src/reviewers/index.ts`. `review-plan.ts`
  never imports a concrete reviewer directly.
- Prompts are TS strings in `src/prompts/index.ts`. No `fs.readFile` of
  prompt `.md` files at runtime.
- Session writes are atomic (write to tmp, then rename). Use `writeSession`
  and `readSessionFile` from `src/session/store.ts` — never write to session
  paths directly. Per-session directories chmod to 0700 on POSIX via
  `ensurePrivateDir`.
