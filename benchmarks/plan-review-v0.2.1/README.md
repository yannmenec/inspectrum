# Inspectrum v0.2.1 synthetic plan-review evaluation

Status: **pre-registered; results not yet run**.

This is a small synthetic conformance evaluation of the published `inspectrum@0.2.1` package. It is not a real-world benchmark and does not measure developer outcomes.

## Fixed method

- Corpus: the eight synthetic plans under `tests/fixtures/plans/`.
- Condition: one Codex reviewer, `focus=all`, no judge, model `gpt-5.6-sol`, effort `high`.
- Isolation: empty working directory, read-only Codex sandbox, ignored user config/rules, and an isolated Inspectrum home. Existing Codex auth is referenced through `CODEX_HOME` but never copied or published.
- Repetitions: three deterministic blocks of eight calls. The orders and fixture hashes are frozen in `orders.json` and `preregistration.json`.
- Stop rule: no selective retries and no quality-based early stop. Fewer than three blocks is labelled a pilot; zero blocks prevents promotion.

The model name is the runtime-resolved alias on 2026-07-14 and may change availability later. Reproduction therefore requires recording the date and actual resolved runtime, not assuming this alias is permanent.

## Labels and metrics

`oracle.json` contains non-exhaustive author expectations and is never opened by the runner. The historical `security-flaw` verdict is `reject`, while the evaluation admits `revise` or `reject` because the flaw is severe but repairable. Results report agreement with both definitions rather than claiming general accuracy.

Reported metrics are verdict agreement, expected-category recall, `k/n` non-approvals on the single correct fixture, decomposed operational success, median latency and nearest-rank p95. There is no precision, F1, statistical independence claim or competitor benchmark.

## Reproduction

Prerequisites: Node 20+, npm, a working Codex CLI login, and a clone with `npm install` completed.

```bash
node benchmarks/plan-review-v0.2.1/run.mjs --dry-run
node benchmarks/plan-review-v0.2.1/run.mjs \
  --execute \
  --run-id run-001 \
  --private-root /tmp/inspectrum-growth-2026-07-14/benchmark-raw
node benchmarks/plan-review-v0.2.1/score.mjs \
  benchmarks/plan-review-v0.2.1/raw/run-001.jsonl
```

The runner refuses to overwrite a run. A systemic retry must use a new run ID and retain the failed artifact.

## Raw evidence

Each JSONL line will include the exact synthetic request, raw MCP response, captured Codex final message, server stderr, session files, versions, timestamps, duration, error and hashes. The public copy replaces only machine-specific paths with documented tokens. Unsanitized originals remain outside the repository and are never required to interpret the result.

The three preselected editorial fixtures are `security-flaw`, `missing-rollback` and `over-engineered`; successes and misses will both be published.
