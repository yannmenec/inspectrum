# CLAUDE.md

@AGENTS.md

## Claude-only addendum

- Use the `Explore` subagent for cross-file searches that span > 3 directories.
- After edits to `src/tool/**`, `src/reviewers/**`, `src/judge/**`, `src/server/**`, `src/session/**`, `src/config.ts`, or `src/doctor.ts`, run `npm run test:coverage` — `vitest.config.ts` gates those paths at ≥ 90 % lines / functions / branches.
- Pre-commit (lefthook) runs typecheck + lint + tests-with-coverage. Do not bypass with `--no-verify`.
- Never edit `_decisions/*` without explicit user request.
