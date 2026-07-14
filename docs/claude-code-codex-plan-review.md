# Claude Code + Codex plan review with Inspectrum

By [Yann Menec](https://github.com/yannmenec). Installation evidence and the benchmark configuration were last tested on 2026-07-14.

Inspectrum adds a Codex review to Claude Code plan mode before the normal human approval dialog. It can also expose the same plan-review workflow as one local stdio MCP tool, `review_plan`.

This guide pins Inspectrum `0.2.1`. It is for solo developers and small teams who already use Claude Code and Codex and want a review checkpoint before implementation. It does not claim that a second model makes a plan correct.

## What the workflow does

When the Claude Code plugin is enabled:

1. Claude prepares a plan and calls `ExitPlanMode`.
2. A `PreToolUse` hook sends the plan to the configured reviewer, Codex by default.
3. `approve` lets Claude Code continue to its normal approval dialog.
4. `revise` or `reject` denies that `ExitPlanMode` call and returns bounded findings to Claude.
5. Claude can revise the plan and try again.

The default budget is two denial rounds before pass-through. Approval resets the counter; cached denials consume a round without another model call. Operational failures fail open with a visible warning. None of these paths clicks the final approval dialog for you.

## Prerequisites

- Node.js 20 or newer.
- Claude Code.
- Codex CLI 0.99.0 or newer, authenticated with a supported ChatGPT or API login.

Check the local tools first:

```bash
node --version
claude --version
codex --version
codex login status
```

Reviews consume the quota or billing of the reviewer you configure. Inspectrum has no separate paid service.

## Install the Claude Code plan gate

```bash
claude plugin marketplace add yannmenec/inspectrum
claude plugin install inspectrum@inspectrum
```

Restart Claude Code so the hook is loaded. Then verify the installed version:

```bash
claude plugin list --json
```

The `inspectrum@inspectrum` entry should be enabled and report version `0.2.1` for this guide.

### Upgrade an installed `0.2.0` plugin

The plugin cache is versioned. Update it explicitly, verify the result, and restart Claude Code:

```bash
claude plugin update inspectrum@inspectrum --scope user
claude plugin list --json
```

If the entry still reports `0.2.0`, remove and reinstall it from the marketplace rather than copying files from a local checkout.

## Get a green doctor

Run the published package from a directory other than the Inspectrum repository:

```bash
npx -y inspectrum@0.2.1 doctor
```

A ready default setup reports green checks for the runtime, config, session storage, Codex reviewer and Claude Code plugin, ending with `All checks passed`. `doctor` also prints the resolved Codex model and reasoning effort. Treat those values as runtime state, not permanent defaults.

Some reviewer CLIs do not expose a reliable authentication-status command. For Codex, confirm separately when needed:

```bash
codex login status
```

![Actual Inspectrum 0.2.1 doctor output excerpt showing Node, default config, Codex 0.144.2, plugin 0.2.1 and all checks passed.](https://raw.githubusercontent.com/yannmenec/inspectrum/main/assets/brand/terminal-doctor.png)

The image is rendered from the [full accessible transcript](https://github.com/yannmenec/inspectrum/blob/main/assets/brand/terminal-doctor.txt), with the temporary home path normalized. It is installation evidence, not a model-quality or real-gate demonstration.

## Run the first real gate

Start a new Claude Code session after the plugin restart. Ask Claude to enter plan mode for a task, inspect the proposed plan, and finish plan mode normally.

- On `approve`, Inspectrum emits the review session ID and Claude Code shows its normal approval dialog.
- On `revise` or `reject`, Claude receives the highest-severity findings, a full local report path and an instruction to revise.
- If Codex is unavailable, the plan proceeds unreviewed with a visible `plan-gate skipped` message.
- After two denials by default, the plan proceeds to your approval dialog with an unresolved-findings warning.

Inspect the evidence after the call:

```text
~/.inspectrum/sessions/<timestamp>__<session-id>/
├── plan-input.md
├── report.md
├── session.json
├── review-<id>.md
└── revised-plan.md       # only when a reviewer returned one
```

The deterministic E2E harness in [`scripts/e2e-plan-gate.sh`](https://github.com/yannmenec/inspectrum/blob/main/scripts/e2e-plan-gate.sh) verifies deny → revision → approve with a reviewer stub. Contract and unit tests cover fail-open behavior and the two-round denial budget. These tests prove hook behavior, not model quality.

## Use it a second time

An approved plan resets the denial counter, so a later distinct plan can be reviewed in the same session. You can also register the MCP server for an on-demand review:

```bash
claude mcp add --transport stdio --scope user inspectrum -- npx -y inspectrum@0.2.1
```

Then use `/inspectrum:review` or ask Claude to review the current plan with Inspectrum. MCP hosts that support local stdio servers can call `review_plan` directly. The server intentionally exposes exactly one tool.

## Costs, data and permissions

- The full plan and optional context go to every configured reviewer.
- With two or more successful reviewers and `judge=true`, the judge receives the plan and their outputs.
- Inspectrum writes plaintext sessions and gate state under `~/.inspectrum/`.
- Codex review runs in a temporary working directory with its project sandbox pinned read-only, but reviewer CLIs and providers retain their own network, account, quota and data policies.
- Inspectrum has no first-party telemetry.

Read the complete [privacy and data-flow disclosure](https://github.com/yannmenec/inspectrum/blob/main/PRIVACY.md). Never put secrets in a plan or context.

## What the synthetic evaluation showed

Inspectrum `0.2.1` completed 24/24 calls over eight synthetic fixtures repeated three times with one Codex configuration. Expected-category micro recall was 28/33. The one correct fixture was approved 3/3 times, with one minor finding. Median latency was 27.2 seconds and nearest-rank p95 was 38.8 seconds.

Two fixtures were consistently assigned a stricter verdict than the pre-registered oracle, and the `over-engineered` case missed one expected taxonomy category in all three repetitions. These results are not a real-world accuracy estimate. The [method, raw records, per-case results and limitations](https://github.com/yannmenec/inspectrum/blob/main/benchmarks/plan-review-v0.2.1/README.md) are published together.

## How it differs from adjacent tools

This is a feature comparison, not a quality ranking or benchmark.

| Workflow | Documented primary surface | Useful when |
|---|---|---|
| Inspectrum | `ExitPlanMode` gate plus one typed MCP plan-review tool, local session evidence, optional multiple reviewers and judge | You want a bounded fail-open plan checkpoint and reusable structured review output |
| [OpenAI Codex plugin for Claude Code](https://github.com/openai/codex-plugin-cc/blob/db52e28f4d9ded852ab3942cea316258ae4ef346/README.md) | Commands for Codex code/adversarial review, delegation and background jobs; an optional `Stop` review gate | Code review or delegating implementation and investigation to Codex is the main job |
| [claude-plan-reviewer](https://github.com/yuuichieguchi/claude-plan-reviewer/blob/fedacf90a1a88dc648bf9fe39d9033cdc8ebc376/README.md) | Direct `PreToolUse`/`ExitPlanMode` hook using a selected Codex or Gemini adapter and a configurable maximum | You want a focused single-adapter plan hook installed as a global npm CLI |
| Manual workflow | Copy or send a plan to another model when you choose | You want no persistent hook or MCP setup and accept manual transfer and record keeping |

The linked competitor descriptions are pinned to the commits reviewed on 2026-07-14. Features may change after those commits.

## Troubleshooting

### The plugin still shows `0.2.0`

Run the update command above, verify with `claude plugin list --json`, and restart Claude Code. Do not infer the active version from the repository checkout.

### The hook does not run

Confirm the plugin is enabled, restart Claude Code, and ensure `[plan_gate] enabled` is not `false` in `~/.inspectrum/config.toml`. The hook is scoped to `ExitPlanMode`; it does not run on an ordinary chat response.

### Codex is installed but reviews fail

Run `codex login status`, then `npx -y inspectrum@0.2.1 doctor`. Do not share authentication output or credentials in an issue.

### `npx` fails only inside the Inspectrum checkout

Run the published package from another directory. npm can resolve a matching package name against the current local package without self-linking its binary.

### A review looks wrong

Keep the final human approval decision. If the plan is safe to disclose, use the [consented, anonymized case template](https://github.com/yannmenec/inspectrum/blob/main/docs/real-case-submission-template.md) or open an issue with a minimal synthetic reproduction.
