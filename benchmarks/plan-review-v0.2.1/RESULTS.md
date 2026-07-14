# Synthetic evaluation results

Status: **synthetic evaluation**. Generated from 24 attempted calls across 3/3 complete blocks.

## Results

- Operational success: 24/24.
- Legacy-verdict agreement on semantic responses: 16/24 (66.7%).
- Acceptable-verdict agreement on semantic responses: 17/24 (70.8%).
- Expected-category micro recall: 28/33 (84.8%).
- Expected-category macro recall: 88.1%.
- Two-of-three expected-category detection: 10/11 (90.9%).
- Single correct fixture: 0/3 non-approvals and 1/3 approvals with a minor finding. This is not a general false-positive rate.
- Tool-call latency on full operational successes: median 27226 ms, nearest-rank p95 38809 ms (n=24); no failed-call durations.

Macro recall is the unweighted mean across the seven fixtures with at least one expected category. The two-of-three measure covers 11 fixture-category pairs and counts a pair only when the category appears in at least two of its three repetitions.

The conceptual always-approve baseline agrees with 1/8 historical verdict labels and recalls none of the expected issue categories. No latency or operational comparison is made.

## Per fixture

| Synthetic fixture | Verdicts | Historical agreement | Admissible agreement | Expected-category recall |
|---|---|---:|---:|---:|
| ambiguous | revise, revise, revise | 3/3 | 3/3 | 5/6 |
| missing-rollback | reject, reject, reject | 0/3 | 0/3 | 3/3 |
| missing-tests | revise, revise, revise | 3/3 | 3/3 | 3/3 |
| over-engineered | revise, revise, revise | 3/3 | 3/3 | 3/6 |
| perf-blind | reject, reject, reject | 0/3 | 0/3 | 6/6 |
| scope-creep | reject, revise, revise | 2/3 | 2/3 | 3/3 |
| security-flaw | reject, revise, reject | 2/3 | 3/3 | 5/6 |
| trivial-correct | approve, approve, approve | 3/3 | 3/3 | 0/0 |

The pre-registered admissible verdict is only `revise` for `missing-rollback` and `perf-blind`; each was returned as `reject` three times. That is a severity mismatch, not a quality win.

## Operational stages

- mcp started: 24/24.
- tool responded: 24/24.
- schema valid: 24/24.
- reviewer succeeded: 24/24.
- session complete: 24/24.

## Limits

- Eight synthetic fixtures are not representative of real-world plans.
- Three repetitions of each fixture are repeated observations, not independent samples.
- Expected categories are author-defined and non-exhaustive.
- One correct fixture cannot estimate a general false-positive rate.
- The recorded model alias may be mutable.

See [the three preselected cases](CASES.md), `summary.json`, `summary.csv`, `raw/run-001.public.jsonl`, `oracle.json` and `preregistration.json` for reproduction and raw evidence.
