# Inspectrum v0.2.1 synthetic plan-review evaluation

Status: **complete synthetic evaluation** — 24/24 scheduled calls completed on 2026-07-14.

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
  --run-id reproduction-001 \
  --private-root /tmp/inspectrum-benchmark-private
node benchmarks/plan-review-v0.2.1/publication.mjs \
  benchmarks/plan-review-v0.2.1/raw/reproduction-001.jsonl \
  benchmarks/plan-review-v0.2.1/raw/reproduction-001.public.jsonl \
  benchmarks/plan-review-v0.2.1/raw/reproduction-001.publication.json
node benchmarks/plan-review-v0.2.1/score.mjs \
  benchmarks/plan-review-v0.2.1/raw/reproduction-001.public.jsonl
```

The runner refuses to overwrite a run. A systemic retry must use a new run ID and retain the failed artifact.

## Raw evidence

Each JSONL line includes the exact synthetic request, raw MCP response, captured Codex final message, server stderr, session files, versions, timestamps, duration, error and hashes. The public copy replaces only machine-specific paths with documented tokens. Unsanitized originals remain outside the repository and are never required to interpret the result.

The direct runner output missed Codex-created macOS temporary paths. This was found after the run, before commit. `publication.mjs` adds a path-only post-process; `raw/run-001.publication.json` records the pre/post hashes and transformation IDs. Its `source_sha256` attests the private original but cannot be recomputed from the repository; `output_sha256` is verifiable here. Model requests, responses, scores and order are unchanged.

Read [the complete results](RESULTS.md), [the three preselected synthetic cases](CASES.md), and the [public raw JSONL](raw/run-001.public.jsonl). Successes, severity mismatches and missed categories are all reported.
