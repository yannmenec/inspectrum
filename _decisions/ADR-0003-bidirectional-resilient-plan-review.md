# ADR-0003: Bidirectional and resilient plan review

Date: 2026-07-30
Status: Proposed

## Context

Inspectrum 0.2.2 already has both plan-review directions, at different maturity:

- Claude Code automatically sends an `ExitPlanMode` plan to Codex through the fail-open
  `PreToolUse` gate.
- The Codex plugin explicitly sends a Codex plan to Claude through `review_plan`.

The server still exposes exactly one MCP tool. This decision preserves that boundary and the
product name **Inspectrum**.

The current resilience model is too weak for either direction:

- `reviewPlan()` starts all requested reviewers in parallel with `Promise.allSettled`.
- `ReviewerOperationalError` carries free text, so authentication, quota, timeout, transport
  and invalid-output failures cannot drive safe routing.
- A partial failure becomes a `major/risk` content finding while the verdict ignores it, so
  `approve` can describe incomplete reviewer coverage.
- If every reviewer fails, the tool returns an error and writes no session.
- Results and sessions do not distinguish requested, attempted and successful reviewers.
- The gate's whitespace-collapsed hash can conflate different Markdown and ignores context,
  reviewer, model, prompt and schema.
- MCP cancellation and the gate deadline do not reach children; CLI timeout does not await
  process-tree termination before cleanup.
- `doctor` can report success from a version check when a reviewer cannot authenticate or review.
- Claude lacks the isolation already applied to Codex.

Existing contracts enforce one stdio tool (`src/server.ts`), fail-open and human approval (ADR-0002
and `src/hook/plan-gate.ts`), centralized Zod schemas, the reviewer factory port, private atomic
flat-file state, and plan/context caps of 16,000/8,000 characters. No daemon, database or remote
Inspectrum service exists.

## Decision

### 1. Preserve the product and protocol boundaries

The product remains named **Inspectrum**. Existing lowercase package and protocol IDs stay unchanged.

Inspectrum continues to expose exactly one MCP tool, `review_plan`, over stdio. Reverse routing,
diagnostics and hooks reuse that tool or CLI/plugin surfaces. Code/change review remains out of scope.

The Claude gate remains fail-open. Operational, `unreviewed`, storage and control failures proceed
with warnings; only a valid verdict can cause bounded denial. `approve` never emits allow, and an
exhausted budget passes through with unresolved findings disclosed.

### 2. Separate review status from plan verdict

`verdict` remains the plan-content judgement `approve`, `revise` or `reject`.

`review_status` describes coverage:

- `reviewed`: every requested primary produced a live or exact-cached valid result and every
  applicable requested judge obligation succeeded.
- `degraded`: at least one valid model review exists, but a primary failed or was replaced,
  coverage is partial, the judge fell back/skipped, or evidence persistence failed.
- `unreviewed`: no model returned a valid review.

Operational failures move to structured `failures`; they never become content findings or alter
the content verdict.

`reviewed` and `degraded` contain a verdict derived only from valid model outputs and the existing
deterministic judge fallback. `unreviewed` contains no verdict, findings or revised plan; it returns
MCP `isError: true`, machine-readable status and a redacted summary.

The gate may use a valid configured fallback verdict, but names the actual reviewer and discloses
`degraded`. Failure records never become deny reasons; storage/control failure always fails open.

### 3. Use a finite failure taxonomy

Every adapter maps raw CLI, HTTP, parsing and policy errors to one of these
codes before orchestration sees them:

| Code | Meaning | Fallback |
|---|---|---|
| `not_installed` | Binary or configured endpoint is absent | Independent provider only |
| `not_authenticated` | Credentials are absent, expired or rejected | Independent provider only |
| `quota_exhausted` | Account or subscription allowance is exhausted | Independent provider only |
| `rate_limited` | Provider asks the client to wait | Independent provider; record `Retry-After` |
| `timeout` | Per-reviewer deadline expired | Independent provider only |
| `network` | DNS, connection or transport failure | Independent provider only |
| `invalid_output` | Non-JSON, schema-invalid or invariant-invalid response | Same domain last |
| `policy_denied` | Sandbox, permission or provider policy refused the review | Same domain last |
| `cancelled` | Caller or global deadline cancelled the operation | No; stop the whole request |
| `storage` | Private evidence could not be persisted | No; gate fails open |
| `unknown` | Bounded catch-all for an unclassified operational failure | Independent provider only |

Each failure records reviewer, backend, failure domain, code, retryability, redacted message,
timestamp and optional bounded `retry_after_ms`. Raw stderr, bodies, headers and credentials never
enter public output, reports, cache keys or normal sessions.

Adapters classify their own CLI/HTTP contracts. Orchestration never searches combined prose errors;
unclassified failures stay `unknown` and are not reported as availability.

### 4. Preserve multi-reviewer semantics with sequential fallback lanes

`reviewers` keeps its current meaning: independent opinions, not a cascade.

Each requested reviewer creates a primary lane. Primaries may run in parallel; after failure only
that lane walks its fallback list:

1. try the primary;
2. try configured independent failure domains in order;
3. try an explicitly configured local reviewer;
4. try an alternate from the same failure domain only as the final resort.

Lane fallbacks are sequential and stop at the first valid review. Inspectrum never races fallbacks.

An alternate in the same failure domain:

- does not count as an independent opinion;
- is allowed only as the final attempt after `invalid_output` or `policy_denied`;
- is never attempted after any other code, including unclassified `unknown`;
- always makes the result `degraded`.

Reviewer configuration gains `failure_domain` for shared quota/authentication. Defaults derive from
the backend; OpenRouter and custom endpoints declare it when broker identity misleads. An optional
non-secret `credential_scope` separates accounts; no secret or secret hash identifies them.

Fallback graphs are acyclic, reference configured reviewers and require local opt-in. No remote
fallback exists by default.

The judge runs after lanes settle and still requires two valid reviews. Its deterministic fallback
preserves the worst valid verdict and de-duplicates findings, with status `degraded`.

### 5. Add a short persistent circuit breaker

A circuit breaker prevents a fresh `npx` gate process from repeatedly calling
a known-broken failure domain:

- auth/quota/rate-limit opens the failure domain immediately;
- `not_installed` opens that reviewer immediately;
- two consecutive `timeout`, `network`, `invalid_output`, `policy_denied` or `unknown` failures
  open that reviewer;
- a live success closes it;
- `Retry-After` is honored up to 15 minutes;
- absent `Retry-After`, immediate circuits cool down after 5 minutes and transient circuits after
  60 seconds.

Open-circuit reviewers are skipped, not attempted. Cache lookup precedes circuit evaluation.

Circuit state is a versioned atomic mode-0600 file under `~/.inspectrum/state/`. Auth/quota keys use
domain plus optional scope; other keys use reviewer ID, so the two eligible same-domain fallbacks
remain possible. Corrupt/unwritable state disables the breaker and never blocks review or gate.

### 6. Record requested, attempted and successful reviewers

Every result and session records ordered, de-duplicated arrays:

- `requested_reviewers`: primaries resolved from input/defaults;
- `attempted_reviewers`: processes or HTTP requests actually started;
- `successful_reviewers`: validated outputs contributing to the verdict;
- `cached_reviewers`: successful reviewer IDs served from cache;
- `skipped_reviewers`: IDs skipped with a structured reason.

Derived counts are `requested`, `attempted`, `succeeded`, `cached` and `skipped`. Cache hits succeed
without an attempt; judge activity stays separate. Per-lane provenance maps each primary to its
actual reviewer/source/outcome, and one successful output can satisfy only one lane.

Progress says `attempted`, `succeeded`, `failed`, `cached` or `skipped`. Reports lead with status,
optional verdict, actual provenance and coverage; degraded approval renders `DEGRADED / APPROVE`.

### 7. Cache validated reviews by an exact composite hash

The reviewer-result cache is separate from gate loop state. Its SHA-256 key covers:

- exact bounded plan and context bytes, normalizing only CRLF to LF;
- focus;
- requested reviewer ID and effective backend, failure domain, endpoint,
  model and effort;
- reviewer prompt, output schema and routing-policy versions.

Other Markdown whitespace is preserved. Legacy gate hashes are never reused.

Only schema- and invariant-valid reviews are cached, never failures, unreviewed results or raw
output. TTL defaults to 24 hours. Exact primary hits preserve status; fallback hits are `degraded`.

Entries are versioned, atomic private files under `~/.inspectrum/cache/reviews/`. Per-key atomic
claims with stale recovery prevent concurrent duplicate spend. Bad entries are ignored; cache
failure never blocks live review.

Gate denial/replay behavior remains, but exact-content hashes use a new schema. Unchanged input
must not trigger another model call.

### 8. Propagate cancellation to every external operation

`reviewPlan`, `Reviewer`, judge, HTTP and CLI layers accept `AbortSignal`.

- The MCP handler links `extra.signal` to the review controller.
- The gate owns a controller and aborts it before returning from its global
  deadline.
- Cancellation is terminal for the request and starts no fallback.
- HTTP adapters combine caller cancellation with their local timeout.
- CLI adapters start a POSIX process group, send `SIGTERM`, then bounded `SIGKILL` if needed.
- CLI completion waits for `close` before deleting temporary files.
- Cancellation and cleanup are idempotent.

The fail-open gate triggers bounded cancellation before warning. Windows remains out of scope.

### 9. Keep local models and deterministic controls honest

Ollama is an explicit fallback and counts as local only for a loopback endpoint with operator
confirmation. Otherwise it is an HTTP provider with unknown egress. It is never silently installed,
downloaded or enabled. A local fallback is `degraded` unless requested as primary.

Deterministic controls remain separate from model judgement:

- input caps, schemas and output invariants;
- fallback-graph and provider-domain validation;
- cache-key, provenance and status invariants;
- repository typecheck, lint, tests and continuous integration.

Controls may reject malformed data or surface failures, but never count as reviewers or create
`approve`. Model review does not replace repository checks.

### 10. Harden the Claude reviewer

Claude must match the isolation intent already applied to Codex:

- run in a fresh mode-0700 temporary directory, never the project;
- disable tools, MCP, hooks, project instructions and prompts with capability-verified CLI flags;
- enforce print mode, structured JSON output and no session persistence;
- pass the configured model explicitly;
- strip arguments that restore tools, change cwd, persist/resume, weaken permissions or redirect;
- pass the plan as untrusted user data, separate from the system policy;
- bound/redact stdout and stderr, using bounded stdout only when stderr is empty;
- expose only documented runtime, auth, proxy and certificate environment;
- terminate the whole process group on timeout or cancellation.

If the CLI cannot prove required isolation, return `policy_denied`; never run broader. Real-CLI
smoke tests lock the supported flags before release.

### 11. Make both host integrations explicit about maturity

Claude Code to Codex stays the stable automatic direction:

- `PreToolUse(ExitPlanMode)` is the deterministic interception point;
- the exact Inspectrum package version remains pinned by the fail-open shim;
- findings are bounded and enclosed as untrusted data;
- approved, denied, degraded and unreviewed paths name the actual reviewer.

Codex to Claude stays a stable explicit action:

- the Codex plugin skill calls only `review_plan`;
- it requests `reviewers: ["claude"]` and `judge: false`;
- it requires a complete visible plan and a successful structured result;
- it never converts tool or Claude failure into approval;
- its MCP package selector remains pinned to the plugin version.

A Codex `Stop` hook is experimental, opt-in and disabled by default because Stop can confuse a
final plan with an intermediate answer. It requires:

- an explicit user opt-in and preview label;
- exact-content hash replay protection and a bounded one-denial budget;
- a marker preventing recursive review of review feedback;
- bounded findings and no plan execution;
- fail-open for missing/ambiguous plan, timeout, cancellation or operational failure;
- stub coverage and a sanitized real transcript before automatic-parity claims.

The stable plugin manifest must not enable this hook by default.

### 12. Make `doctor` report evidence, uncertainty and availability

`doctor` inspects defaults, gate reviewers, judges and fallbacks, with roles separated.

Static checks cover config/graph, runtime versions/settings/isolation, package/plugin alignment,
private storage and open circuits.

Authentication is `available`, `unavailable` or `unknown`. Version, credential presence and a
positive native status remain `unknown`; an explicit native failure may prove `unavailable`. Only a
recent successful real probe proves `available`.

`doctor --probe` performs a minimal synthetic structured review for selected active reviewers. It
warns before network/quota use and sends no user plan. For Claude, even this minimal prompt can have
non-trivial context and prompt-cache cost.

Text and machine summaries list only reviewers proven usable. `unknown` warns and cannot yield
“all checks passed.” Plugins are required only for the selected host; MCP-only use needs none.

### 13. Tighten confidentiality and evidence handling

Fallback to a new remote domain requires user configuration. Reports and `doctor` label routes
remote, brokered, local or unknown.

Reviewers get no arbitrary project access. Commands use argument arrays without a shell. Caps apply
before allocation, transport, cache and disk.

Diagnostics are structured, redacted and bounded. Bodies, raw stderr, credentials, auth headers and
environment values never enter normal reports. Future detailed diagnostics require opt-in,
separate permissions and bounded retention.

POSIX directories use 0700 and files 0600, with atomic writes and safe IDs. Plaintext/provider
retention disclosures remain; Inspectrum has no first-party telemetry.

### 14. Evolve schemas and configuration compatibly

All new schemas remain in `src/schemas.ts`.

Successful results keep current fields and add status, provenance, counts and failures. Verdict
values do not change. The output becomes status-discriminated:

- `reviewed` requires verdict, findings, report and session path;
- `degraded` requires verdict, findings and report; session path may be absent only after `storage`;
- `unreviewed` forbids verdict and revised plan, has no content findings, and
  returns `isError: true`; session path is present only if failure evidence was
  written.

This is additive on normal success and preserves all-failed error behavior. Skills check `isError`
before reading verdict.

Configuration version 1 remains readable without rewriting. Defaults add no fallback route, enable
the breaker and 24-hour cache, and preserve parallel reviewer semantics, gate budget and fail-open.

Implementation writes new versioned circuit/cache/gate files and ignores legacy hashes. Old
sessions stay readable; new session fields are additive. Package and plugin versions move together.

## Acceptance criteria

The decision is implemented only when all of the following are true:

1. `review_plan` remains the only MCP tool; stdio remains the only transport.
2. Both directions pass real opt-in smoke tests.
3. `reviewed` requires every requested primary and applicable judge obligation.
4. Partial/fallback coverage is `degraded`; no valid model is `unreviewed`, without verdict.
5. Results/sessions accurately list and count requested, attempted, successful, cached and skipped.
6. Lane fallbacks run in order, one at a time, stopping after first success.
7. Same-domain fallback occurs only after `invalid_output` or `policy_denied`, and always last.
8. Circuit state survives gate processes and cannot block when corrupt or unwritable.
9. Exact unchanged input causes no call within TTL, including concurrent calls.
10. Cancellation/deadline leave no descendants and start no fallback.
11. Claude cannot access the project, tools or persistence; unsupported isolation is `policy_denied`.
12. Local routing is labelled; deterministic controls never count as model approval.
13. `doctor` proves availability only with a recent real probe and covers every route.
14. The gate passes through unreviewed, storage and control failures; approval remains human.
15. Codex Stop stays outside the default path, opt-in, bounded, replay-protected and fail-open.
16. Public parity needs a sanitized transcript and exact published package/plugin versions.

## Test strategy

### Unit and property tests

- Table-test adapter taxonomy, retryability, domain, redaction and caps.
- Test parallel primaries, sequential/short-circuit fallback, cycles and same-domain rules.
- Lock status, verdict, provenance and count invariants for partial, cache, judge, storage and all-failed.
- Test exact keys, CRLF, invalidation, TTL, corruption, permissions, atomic writes and single-flight.
- Propagate cancellation through MCP, gate, judge, fetch and CLI; use a child ignoring `SIGTERM` to
  verify group `SIGKILL`, `close` and cleanup.
- Lock Claude argv, cwd, model, tool/persistence disabling, environment and redacted errors.
- Test `doctor` evidence states, route union, version drift and circuits.
- Preserve plan-file confinement, stdin cap, untrusted findings and denial budget.

### Contract and end-to-end tests

- Preserve one-tool and input contracts; add status-discriminated outputs and forbidden verdicts.
- Preserve gate fail-open/no-allow and explicit pinned Codex-plugin/no-false-approval contracts.
- Prove the stable Codex plugin does not enable Stop.
- Stub both directions, deny/revise/approve, quota fallback, all unavailable, cache and cancellation.
- Keep real Claude, Codex and loopback Ollama smokes opt-in and outside default CI.
- Publish parity evidence only after sanitization against the exact candidate.

Coverage stays at or above 90 percent lines, functions and branches. Tests validate routing and
contracts, not model quality.

## Consequences

- Bidirectional review becomes honest without claiming identical automatic hooks.
- A content verdict can no longer hide missing reviewer coverage.
- Sequential fallback/cache reduce quota use at the cost of configuration and state.
- Provider diversity is explicit; aliases sharing credentials no longer
  masquerade as independent resilience.
- Cancellation, Claude isolation and redaction reduce process/confidentiality risk.
- Clients retain success fields but must learn status and never expect verdict on error.
- Stop can be removed without protocol change if plan detection is unreliable.

## Alternatives rejected

- **Second MCP tool:** host direction is orchestration; both plugins can call `review_plan`.
- **Turn `reviewers` into a cascade:** this removes independent opinions and changes judge behavior.
- **Race all fallbacks:** this increases cost, disclosure and correlated quota use.
- **Failures as major findings:** provider outage is not plan-quality evidence.
- **Same-provider model first:** correlated failures make it last-resort only after invalid output
  or policy denial.
- **Deterministic approval:** schemas, lint and tests cannot replace judgement; use `unreviewed`.
- **Enable Codex Stop by default:** Stop is not `ExitPlanMode` and may intercept intermediate output.
- **Daemon, database or hosted router:** private flat files suffice without expanding product risk.
