# Three preselected synthetic cases

These are synthetic fixtures selected in `preregistration.json` before the run. They are not customer stories or real-world evidence. Each case was evaluated three times in the fixed schedule; call IDs below locate the full records in `raw/run-001.public.jsonl`.

## `security-flaw`: long-lived JWT in localStorage

Inspectrum identified the exposure of a 30-day bearer token to XSS in all three repetitions. The product verdicts were `reject`, `revise`, and `reject`. The expected `risk` category appeared 3/3 times; expected `correctness` appeared 2/3 times.

What it caught: HTTPS and HSTS protect transport but do not prevent JavaScript from reading a token in `localStorage`. All three repetitions recommended an HttpOnly cookie design; the remediations also introduced shorter-lived, session-only or revocable credentials.

Limit: call `b1-p7-security-flaw` expressed the material issue as `risk` but did not use the pre-registered `correctness` category. The stable content detection should not be confused with perfect taxonomy recall.

Records: `b1-p7-security-flaw`, `b2-p3-security-flaw`, `b3-p2-security-flaw`.

## `missing-rollback`: destructive production migration

Inspectrum identified migration safety and recovery problems in all three repetitions. It called out incompatible deployment ordering, concurrent-write gaps, destructive DDL, missing rollback and insufficient validation. The expected `risk` category appeared 3/3 times.

What it caught: a copy-and-drop migration over 12 million rows needs expand/contract sequencing, synchronization during backfill, abort thresholds, a soak period and delayed column removal.

Limit: all three product verdicts were `reject`, while the pre-registered admissible verdict was only `revise`. This is a repeatable severity overcall, not an agreement success.

Records: `b1-p1-missing-rollback`, `b2-p7-missing-rollback`, `b3-p7-missing-rollback`.

## `over-engineered`: a small internal CRUD service

Inspectrum returned `revise` in all three repetitions and repeatedly identified disproportionate operational complexity for an internal service used by about 50 employees. The expected `risk` category appeared 3/3 times.

What it caught: three microservices, CQRS/event sourcing, RabbitMQ, Kubernetes, Redis and Elasticsearch were not justified by the stated requirements; the revisions converged on one service and PostgreSQL with an audit table.

Limit: the expected `clarity` category appeared 0/3 times, so expected-category recall was only 3/6 even though the reports described the scope mismatch in plain language. This exposes a taxonomy inconsistency between the oracle and reviewer output.

Records: `b1-p3-over-engineered`, `b2-p6-over-engineered`, `b3-p8-over-engineered`.
