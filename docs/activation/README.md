# Public activation evidence for Inspectrum 0.2.3

Captured on 2026-08-01 from an empty directory outside the repository, with a
fresh npm cache. The machine already had Node, Claude Code, Codex CLI, and both
reviewer logins. This proves the public package path on a prepared machine. It
does not prove that a newly recruited person can finish in under ten minutes;
the external protocol tracks that separately.

## Measured path

| Step | Command or action | Wall time | Result |
|---|---|---:|---|
| Cold package fetch and health check | `npx -y inspectrum@0.2.3 doctor` | 3.17 s | exited 0; operational, with warnings for optional backends |
| Claude project setup and connection check | `claude mcp add ...` then `claude mcp get inspectrum` | 1.58 s | connected to the pinned public package |
| Codex one-run config check | `codex -c ... mcp get inspectrum` | 0.07 s | enabled stdio server resolved |
| First real review | `review_plan`, reviewer `codex`, no judge | 50.80 s | `reject`, one blocker and four majors |

Measured executable time to the first result: **55.62 seconds**. This sum
excludes prerequisite installation, account sign-in, reading, typing, and
human approval time. The complete health-check transcript and the first report
are in [`assets/brand/terminal-doctor.txt`](../../assets/brand/terminal-doctor.txt).

Reproduce the package and host checks from any directory that is not an
Inspectrum checkout:

```bash
npx -y inspectrum@0.2.3 doctor
claude mcp add --transport stdio --scope project inspectrum -- npx -y inspectrum@0.2.3
claude mcp get inspectrum
codex -c 'mcp_servers.inspectrum.command="npx"' \
  -c 'mcp_servers.inspectrum.args=["-y","inspectrum@0.2.3"]' \
  mcp get inspectrum
```

The Codex project equivalent is a trusted-project `.codex/config.toml`:

```toml
[mcp_servers.inspectrum]
command = "npx"
args = ["-y", "inspectrum@0.2.3"]
tool_timeout_sec = 330
```

## One-time public status check

Checked once on 2026-08-01, with no publish or resubmission action:

- the repository release check passed for [npm 0.2.3](https://www.npmjs.com/package/inspectrum/v/0.2.3) and [GitHub v0.2.3](https://github.com/yannmenec/inspectrum/releases/tag/v0.2.3);
- the [Glama page](https://glama.ai/mcp/servers/yannmenec/inspectrum) and its API returned HTTP 200 with the Inspectrum repository;
- the public [Claude Community catalog](https://github.com/anthropics/claude-plugins-community) contained no `inspectrum` entry;
- PulseMCP returned HTTP 403 for both its search and candidate slug, so no current listing claim is made;
- the MCP Registry was deliberately not republished or rechecked for 0.2.3 and may still show 0.2.2.

## Three reproducible cases

These are single observations from 0.2.3, not accuracy statistics. The source
plans remain fixed so another run can disagree visibly.

### 1. Useful finding: destructive database migration

Plan: [`missing-rollback.md`](../../tests/fixtures/plans/missing-rollback.md),
an Inspectrum test fixture purpose-built to exercise the blocker/major path.
Its critical sequence deploys code that reads `handle`, adds and backfills that
column, drops `username`, then deploys code that stops using `username`.

Observed response, Codex reviewer, 50.80 s:

```text
REJECT: 1 blocker, 4 majors
Migration Steps 1-3 are not mutually compatible as written. Step 1 deploys
code that reads both username and handle before handle exists, while Step 2
drops username before Step 3 removes the application's dependency on it.
```

Ground truth: the planted unsafe ordering is visible in the plan itself. A
compatible sequence must add the new column before code reads it and retain the
old column until deployed code no longer needs it. Limit: success on a
purpose-built fixture does not predict performance on arbitrary user plans;
the run did not execute PostgreSQL or measure production locks.

Reproduce: submit the fixture to `review_plan` with `reviewers: ["codex"]`,
`focus: "all"`, and `judge: false`.

### 2. Null result: small health endpoint

Plan: [`trivial-correct.md`](../../tests/fixtures/plans/trivial-correct.md), an
Inspectrum test fixture purpose-built to exercise the approve path. It adds
`GET /healthz`, adds one unit test, updates the endpoint table, and requires
existing tests and continuous integration to stay green.

Observed response, Codex reviewer, 9.00 s:

```text
APPROVE
No issues found.
```

Ground truth: the response added no finding to triage. Limit: a null result on
a purpose-built fixture does not prove the plan correct or predict arbitrary
plans, and no Express repository was supplied or executed.

Reproduce with the same arguments as case 1 and the trivial fixture.

### 3. Visible degradation: reviewer unavailable

Plan:

```text
# Plan: destructive migration
1. Drop the production users table.
2. Recreate it with the new schema.
```

The public `plan-gate` command ran with a `PATH` containing Node and npx but no
Codex binary. Observed response, 0.67 s:

```text
inspectrum plan-gate skipped: All reviewers failed:
  - Reviewer codex failed: Codex reviewer failed to start: spawn codex ENOENT.
Plan proceeds unreviewed.
```

Ground truth: `codex` was deliberately absent from that process path and the
output contains no deny decision, so the Claude approval flow remains open.
Limit: this reproduces a missing binary, not token exhaustion or an outage.

## 75-second demo script

Purpose: show the checkpoint before an action that is difficult to undo, not a
general multi-model feature tour.

| Time | Screen | Voiceover |
|---:|---|---|
| 0-8 s | Production migration plan, with `DROP COLUMN username` highlighted | "This plan changes twelve million rows and drops the old column." |
| 8-16 s | Claude Code reaches `ExitPlanMode` | "The risky moment is plan exit, before execution begins." |
| 16-28 s | Inspectrum starts the pinned Codex review | "Inspectrum inserts one independent, read-only checkpoint. I do not need to remember a prompt." |
| 28-45 s | Real `REJECT` excerpt from case 1 | "Codex catches the incompatible order: new code reads a column before it exists, then the migration removes the fallback too early." |
| 45-57 s | Revised expand-and-contract steps | "The plan now adds first, dual-writes, validates, deploys handle-only code, and delays the destructive drop." |
| 57-68 s | Second `ExitPlanMode`, then normal approval dialog | "A clean review never approves for me. My normal human approval dialog still appears." |
| 68-75 s | End card: `npx inspectrum@0.2.3 doctor` and this evidence URL | "The public 0.2.3 path is reproducible; the report and its limits are linked." |

Recording rules: use the fixture and real output above, keep the session path
visible only if it contains no private path, and do not splice a fake approve
after the rejection. If the reviewer fails during recording, show the visible
fail-open warning from case 3 instead of hiding it.
