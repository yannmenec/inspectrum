# GEMINI.md

@./AGENTS.md

## Gemini-only addendum

- Default to Gemini 3 Pro for normal edits. Switch to Deep Think only for refactors touching > 5 files.
- Long-context prompts: put rules and instructions FIRST, put the diff / code block at the END (mitigates lost-in-the-middle).
- Return JSON via `responseSchema` structured output. Never parse JSON out of free-form text.
- Prefer `GEMINI_SANDBOX=docker` for any operation that writes outside the repo. Never `--yolo` outside a sandbox.
