# ADR-0001 — Defer integration tests to v0.2

Date: 2026-05-14
Status: Accepted (owner-approved during J7b plan review)

## Context

`AGENTS.md` §Repo map originally listed `tests/{contract,unit,integration,e2e}/`.
Only `tests/contract/`, `tests/unit/`, and `tests/e2e/` ship in v0.1.0.

The integration layer was intended to run Ollama + `qwen2.5:0.5b` end-to-end
as a real-LLM smoke (no mocked subprocess), but Ollama is not a hard
runtime dependency of inspectrum, the binary cannot be reliably hosted
inside the GitHub Actions runner, and the model weights (~400 MB) would
inflate CI run-time.

## Decision

`tests/integration/` is deferred to v0.2. v0.1.0 ships:

- `tests/contract/` — Zod schema + MCP wiring contract (in-memory transport).
- `tests/unit/` — module-level tests with mocked subprocess and HTTP.
- `tests/e2e/` — minimal MCP stdio smoke against `dist/server.js`.

`AGENTS.md` line 43 is updated to enumerate `{contract,unit,e2e}/` and
footnote this ADR.

## Consequences

- Kimi and Qwen wrappers remain assumption-based (CLI flag shapes guessed,
  not verified). README and CONTRIBUTING mark them **experimental**.
- Promotion of any reviewer backend to "default" requires a real-CLI smoke
  test in `tests/integration/` once the directory is reintroduced post-v0.2.
- Users who want a real-LLM smoke today can run `inspectrum doctor` after
  configuring their reviewers; failures there give the same signal an
  integration test would.
