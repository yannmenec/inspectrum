# Contributing to inspectrum

## Prerequisites

- Node ≥ 20 (`node --version`)
- npm (bundled with Node)
- Optional (to test reviewers locally): `claude`, `codex`, `gemini` CLIs in your PATH

## Dev loop

```bash
npm install            # install all dependencies
npm run dev            # start MCP server with tsx hot-reload (no build step)
npm test               # run all tests once
npm run test:coverage  # tests + coverage report (gates: ≥ 90% lines/functions/branches)
npm run build          # compile TypeScript → dist/
npx tsc --noEmit       # type-check only
npx eslint src/        # lint
```

## Pre-commit (lefthook)

`lefthook` runs automatically on `git commit`:

1. `npx tsc --noEmit` — full type-check
2. `npx eslint src/` — lint
3. `npx vitest run --passWithNoTests --coverage` — tests + coverage gate

If a hook fails, fix the underlying issue and re-commit. Never bypass with
`--no-verify`.

To run hooks manually:

```bash
npx lefthook run pre-commit
```

## Adding a reviewer backend

Adding a backend (e.g. `kimi`) takes ≤ 4 hours and follows these five steps:

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

`runBackendJsonReview` (in `src/reviewers/common.ts`) takes a **single
options object** — not positional arguments. The required fields are
`backend`, `reviewerId`, `config`, `systemPrompt`, `userMessage`,
`timeoutMs`, and `label`. It spawns the CLI via `spawn` (not `execFileSync`),
collects stdout, and validates the JSON output against `RawReviewSchema`.

> **Note:** `execFileSync` appears **only** in `src/reviewers/health.ts` for
> lightweight `--version` checks. Reviewer wrappers always use `spawn` via
> the internal `spawnCollect` helper.
>
> If your backend uses a fundamentally different I/O (e.g. streaming JSONL
> like Codex, which writes to a temp file instead of stdout), study
> `src/reviewers/codex.ts` before calling `runBackendJsonReview`.

### Step 2 — Extend `src/reviewers/common.ts`

This file owns the `ReviewerBackend` union, the `backendFromName` resolver,
and the `runBackendJsonReview` dispatch. All three must be updated — skipping
any one will either fail typecheck or silently route your backend through the
wrong code path.

```typescript
// 1. Extend the union type:
export type ReviewerBackend = "claude" | "codex" | "gemini" | "kimi";

// 2. Register the binary name in backendFromName():
function backendFromName(name: string): ReviewerBackend | undefined {
  if (name === "claude" || name === "codex" || name === "gemini" || name === "kimi") return name;
  return undefined;
}

// 3. Update the error message in resolveReviewerBackend():
throw new ReviewerOperationalError(
  `Reviewer backend "${id}" is not supported. Supported backends: claude, codex, gemini, kimi.`
);

// 4. Add a dispatch branch in runBackendJsonReview():
if (opts.backend === "kimi") {
  return runKimiJsonReview(opts);   // implement analogously to runGeminiJsonReview
}
```

If your backend uses a non-standard I/O format (e.g. temp-file output like
Codex), implement a dedicated private `runKimiJsonReview` function in
`common.ts` rather than reusing `runGeminiJsonReview`.

### Step 3 — Register in the factory and schema

In `src/reviewers/index.ts`, add your backend to `createReviewer`:

```typescript
import { KimiReviewer } from "./kimi.js";

// inside createReviewer():
if (backend === "kimi") {
  return new KimiReviewer(id, config);
}
```

Also add `"kimi"` to the `backend` enum in `src/schemas.ts`:

```typescript
backend: z.enum(["claude", "codex", "gemini", "kimi"]).optional(),
```

### Step 4 — Add a fix hint in health.ts

In `src/reviewers/health.ts`, extend `installFix`:

```typescript
kimi: "Install Kimi CLI: npm install -g @moonshotai/kimi-cli",
```

This appears in `inspectrum doctor` output when the binary is missing.

### Step 5 — Write unit tests

Create `tests/unit/reviewers/kimi.test.ts` following the same pattern as
`claude.test.ts` or `codex.test.ts`:

```typescript
vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { KimiReviewer } from "../../../src/reviewers/kimi.js";

// Reviewer wrappers call spawn (not execFileSync — that's only for health checks)
const mockSpawn = vi.mocked(childProcess.spawn);

describe("KimiReviewer", () => {
  it("parses a valid JSON review", () => { ... });
  it("throws ReviewerOperationalError on timeout", () => { ... });
  it("throws ReviewerOperationalError on non-zero exit code", () => { ... });
});
```

All subprocess calls must be mocked — no real LLM in unit tests. Note the
mock target:
- **`spawn`** → mock this for reviewer wrappers (`KimiReviewer`, `ClaudeReviewer`, etc.)
- **`execFileSync`** → mock this for health checks (`checkReviewer` in `health.ts`) only

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

`vitest.config.ts` enforces on the critical paths
(`src/tool/**`, `src/reviewers/**`, `src/judge/**`, `src/config.ts`,
`src/doctor.ts`):

| Metric | Threshold |
|---|---|
| Lines | ≥ 90% |
| Functions | ≥ 90% |
| Branches | ≥ 90% |

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
  paths directly.
