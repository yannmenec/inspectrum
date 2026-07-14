<div align="center">

# inspectrum

### Add a second model's review before a coding plan reaches execution.

[![CI](https://github.com/yannmenec/inspectrum/actions/workflows/ci.yml/badge.svg)](https://github.com/yannmenec/inspectrum/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/inspectrum.svg)](https://www.npmjs.com/package/inspectrum) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![Node >= 20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org/)

**Claude plans it. Codex reviews it. You keep the final approval.**

</div>

---

Inspectrum is a local MCP server plus a Claude Code plugin for reviewing development plans with configured LLM CLIs. When the plugin is enabled, its `PreToolUse` hook reviews `ExitPlanMode` input before Claude Code shows the normal approval dialog. A `revise` or `reject` verdict returns findings to Claude; an operational failure passes the plan through with a visible warning.

Review output can be wrong or incomplete. Inspectrum keeps the human approval step and records the evidence so you can inspect what happened.

## Quick start

You need [Node 20+](https://nodejs.org), Claude Code, and Codex CLI >= 0.99.0 authenticated with a [ChatGPT subscription](https://openai.com/chatgpt/pricing/) (no API key):

```bash
claude plugin marketplace add yannmenec/inspectrum
claude plugin install inspectrum@inspectrum
```

Restart Claude Code after installation. There is no extra review prompt to remember: the enabled hook runs on `ExitPlanMode`, subject to its unchanged-plan cache and review budget, and every actual review consumes the configured reviewer's allowance. The on-demand `/inspectrum:review` command also requires registering the MCP server, as shown in the assisted setup below.

The repository publishes a real `doctor` transcript and deterministic hook-wiring tests. It does not yet publish a live Claude gate transcript: the single launch-evidence retest on 2026-07-14 failed authentication with HTTP 401, so no model-driven terminal sequence is presented as proof.

## What Inspectrum caught

The published `0.2.1` package was run against eight synthetic plan fixtures, three times each, with one Codex reviewer. All 24 MCP calls completed. In the three cases selected before the run:

- a 30-day JWT stored in `localStorage` was identified as an XSS token-theft risk in 3/3 repetitions;
- migration safety and rollback problems were identified in 3/3 repetitions, but all three verdicts were a stricter `reject` instead of the pre-registered `revise`;
- disproportionate architecture for a small internal service was identified in 3/3 repetitions, while one expected taxonomy category was missed in all three.

Across this small corpus, expected-category micro recall was 28/33. The single correct fixture was approved 3/3 times; one approval still contained a minor finding. Median tool-call latency was 27.2 seconds and nearest-rank p95 was 38.8 seconds for this dated configuration.

These are repeated synthetic fixtures, not independent real-world cases or a general accuracy estimate. Read the [method, raw JSONL, complete results and misses](https://github.com/yannmenec/inspectrum/blob/main/benchmarks/plan-review-v0.2.1/README.md).

For installation updates, a green `doctor`, first-gate behavior, costs, comparisons and troubleshooting, use the [Claude Code + Codex plan-review guide](https://github.com/yannmenec/inspectrum/blob/main/docs/claude-code-codex-plan-review.md).

<details>
<summary>Prefer the agent to install and check everything for you? Paste this into Claude Code.</summary>

````text
Set up inspectrum's Codex plan gate. Use normal approvals only — do not
switch to Bypass Permissions or Full Access.

Steps:
1. Run `node --version`. If < 20, stop and tell me to install Node 20+
   from https://nodejs.org first.
2. Run `codex --version`. If it is missing or older than 0.99.0, run
   `npm install -g @openai/codex@latest` and verify again.
3. Run `claude plugin marketplace add yannmenec/inspectrum`, then
   `claude plugin install inspectrum@inspectrum`.
4. Run `claude mcp add --transport stdio --scope user inspectrum -- npx -y inspectrum@latest`
   (this powers the on-demand /inspectrum:review command).
5. Run `npx -y inspectrum@latest doctor` and show me the output,
   including the resolved codex model/effort lines.
6. Run `codex login status`.
   - If it prints "Logged in", tell me: "✅ Setup complete. Your next
     plan-mode plan gets a Codex review automatically." Done.
   - Otherwise (not logged in), pop open a Terminal window with codex
     already running by executing:
       `osascript -e 'tell application "Terminal" to do script "codex"'`
     Then tell me: "A Terminal window opened with codex running.
     Inside that window, click 'Sign in with ChatGPT', complete the
     login in my browser, then close the Terminal window. inspectrum
     is then ready."

Do NOT use sudo, edit shell profiles, push git changes, read .env or
credentials, or publish packages. Report back: Node version, codex
install status, doctor verdict, and whether login was needed.
````

</details>

## How it works

```
you ──▶ Claude Code ──▶ plan ready ──▶ ExitPlanMode
                                          │
                              inspectrum plan-gate (hook)
                                          │
                              Codex reviews the plan
                              (read-only sandbox, your ChatGPT sub)
                                          │
                    ┌─────────────────────┴──────────────────────┐
              APPROVE ✅                                REVISE / REJECT ❌
                    │                                             │
        your approval dialog                    findings go back to Claude,
        appears as usual                        it revises, gate runs again
                                                       (max 2 rounds)
```

The gate has five explicit guardrails:

- **Fails open.** Codex not installed, logged out, timed out, network down — the plan proceeds with a visible warning. Operational errors don't block your work; the gate degrades, it doesn't brick.
- **Never auto-approves.** A green review still lands on *your* approval dialog. The gate can delay it (while Claude revises) but can never click it — you keep the final call.
- **Bounded cache reuse.** An unchanged plan does not trigger another model call. A cached denial reuses the prior reason but still consumes a denial round; an unchanged approved plan proceeds without another call.
- **Project-read-only Codex invocation.** Codex runs in a temporary working directory with `codex exec -s read-only --ephemeral`; sandbox-weakening and cwd-override flags are stripped. Inspectrum still writes its own local session and gate-state files.
- **Kill switch.** `[plan_gate] enabled = false` in `~/.inspectrum/config.toml`, or disable the plugin per project.

## Design rationale

- **Review before execution.** Plan review can expose assumptions before implementation starts; it does not replace code review or tests.
- **A different reviewer is another signal.** Inspectrum makes it easy to route a plan to a separately configured model. Whether that improves a specific plan remains a hypothesis to verify from the findings.
- **Disagreement stays visible.** Findings retain reviewer attribution, and an optional judge can consolidate multiple successful reviews.
- **Use an existing subscription.** No separate API bill when using your ChatGPT subscription; reviews consume your existing Codex subscription allowance. API-key backends are billed by their provider.

## What's in the box

| | |
|---|---|
| 🚦 **Plan gate** | Reviews distinct Claude Code plans while enabled, with a configurable budget (default: 2 denials) and fail-open behavior |
| 🔍 **On-demand review** | `/inspectrum:review` or `review_plan` from hosts that support local stdio MCP servers |
| 🧑‍⚖️ **Multi-reviewer + judge** | Run codex + gemini + claude in parallel; a judge consolidates into one verdict |
| 📋 **One verdict** | `approve / revise / reject` + findings by severity, with reviewer attribution |
| 🗂️ **Session logs** | Plaintext record of successful review sessions under `~/.inspectrum/sessions/`; a revised plan is stored only when returned |
| 🩺 **`inspectrum doctor`** | Checks runtime, config, storage and reviewer availability; Codex login is checked directly, while some CLIs expose only a warning |

## Verified distribution paths

| Host | Reviewer | Installation and evidence |
|------|----------|---------------------------|
| **Claude Code** | Codex | Plugin commands above; fresh public `0.2.1` install and deterministic hook wiring verified. A live gate transcript is not yet published because of the dated 401 noted above. |
| **Claude Desktop** (macOS) | Codex | Download [`inspectrum-0.2.1.mcpb`](https://github.com/yannmenec/inspectrum/releases/download/v0.2.1/inspectrum-0.2.1.mcpb), open, confirm. The v0.2.1 asset's contents and MCP smoke test were verified; the earlier v0.2.0 bundle was incomplete. |

## Tuning

**Which model reviews, at which effort?** On the Codex side, precedence is:

| Setting | 1st (wins) | 2nd | 3rd |
|---|---|---|---|
| model | `[reviewers.codex] model` in `~/.inspectrum/config.toml` | `model` in `~/.codex/config.toml` | codex built-in default |
| reasoning effort | `[reviewers.codex] effort` | `model_reasoning_effort` in `~/.codex/config.toml` | codex built-in default |

`inspectrum doctor` prints the resolved values. Higher effort can use more time and allowance; no review-quality improvement is guaranteed. Drop to `effort = "medium"` in `[reviewers.codex]` if the tradeoff does not suit your workflow.

<details>
<summary><b>Full config</b> — more reviewers, judge, limits (~/.inspectrum/config.toml)</summary>

```toml
[defaults]
reviewers = ["codex", "gemini"]   # called in parallel
judge     = "codex"               # consolidates when >= 2 reviewers
focus     = "all"                 # correctness | completeness | risk | clarity | all

[plan_gate]                       # ExitPlanMode hook behavior
enabled          = true
max_rounds       = 2              # denials before the plan passes through
reason_max_chars = 3000           # budget for findings fed back to Claude
# reviewers      = ["codex"]      # gate-specific override of defaults.reviewers

[reviewers.codex]
effort          = "high"          # passed as -c model_reasoning_effort=high
timeout_seconds = 300             # per-reviewer override of limits.timeout_seconds
# model         = "gpt-5.6-sol"   # passed as -m; omit to inherit ~/.codex/config.toml

[reviewers.gemini]
type   = "cli"
binary = "gemini"
model  = "gemini-2.5-pro"

[reviewers.local]
type     = "http"
backend  = "ollama"
endpoint = "http://localhost:11434"
model    = "qwen2.5:0.5b"

[limits]
report_max_chars = 8000           # caps the stored report
timeout_seconds  = 300            # default reviewer wallclock
```

Without a config file, `reviewers = ["codex"]` is used. Additional adapters include Gemini, Claude, OpenRouter, Ollama, and experimental Kimi/Qwen CLI integrations. Their availability, routing, billing and permissions depend on the installed CLI or configured endpoint.

Headless or CI host that can't run an interactive login? Pass the peer API key through the MCP host's `env` block instead — `OPENAI_API_KEY` (codex), `ANTHROPIC_API_KEY` (claude), `GEMINI_API_KEY` (gemini). Manual JSON/TOML examples live under [`examples/`](examples/).

```bash
# Register the MCP server without the plugin:
claude mcp add --transport stdio --scope user inspectrum -- npx -y inspectrum@latest   # Claude Code
codex mcp add inspectrum -- npx -y inspectrum@latest                                   # Codex

# The automatic plan gate must use the plugin's pinned fail-open shim; do not
# register plan-gate through a mutable npm tag.

# Verify everything:
npx -y inspectrum@latest doctor
```

</details>

## Privacy and data flow

The full plan and optional context are sent to every configured reviewer. A judge, when enabled with at least two successful reviewers, receives the plan and their outputs. Inspectrum writes plaintext session files locally and has no first-party telemetry. Reviewer CLIs and configured HTTP endpoints have their own network, retention, quota and billing behavior.

Do not include secrets in plans or context. Read [PRIVACY.md](https://github.com/yannmenec/inspectrum/blob/main/PRIVACY.md) before using cloud reviewers.

## FAQ

**Does this slow me down?**
Each uncached review adds a model call. In the dated 24-call synthetic run above, median latency was 27.2 seconds and p95 was 38.8 seconds; other models, plans, quotas and networks can differ substantially. Within a session, an unchanged approved plan is not re-reviewed.

**What if Codex is down / logged out / not installed?**
The gate fails open with a visible warning and your plan proceeds untouched. An operational error never blocks your work — that's an architecture invariant, not a best effort.

**Can it approve a plan behind my back?**
No. The gate can only *delay* the approval dialog while Claude revises; it cannot click it. After the configured denial budget is exhausted, the plan reaches your approval dialog with an unresolved-findings warning.

**Do I need API keys?**
Not for subscription-backed Codex or Claude CLI logins. Reviews consume the allowance of the existing subscription. API keys are supported for headless/CI setups and are billed by their provider.

**My prompt/plan is sensitive — where does it go?**
To the reviewer(s) you configured and to a plaintext local session log under `~/.inspectrum/sessions/`. An Ollama endpoint is local only when you configure and operate it that way. See [PRIVACY.md](PRIVACY.md) for the complete data flow.

## Troubleshooting

**`sh: inspectrum: command not found` / `claude mcp list` shows `✗ Failed to connect` — but only when your current directory is the inspectrum repo itself.** `npx inspectrum@<version>` resolves the spec against the *local* package when cwd is inside a package named `inspectrum` whose version matches, and a package's own bin is never self-linked into its `node_modules/.bin`. The published package is fine. Fixes: run from any other directory, or install the real binary once and register that instead:

```bash
npm install -g inspectrum
claude mcp add --transport stdio --scope user inspectrum -- inspectrum
```

**Gate feels slow?** Set `effort = "medium"` in `[reviewers.codex]` (see Tuning). **Something else?** `npx -y inspectrum@latest doctor` checks runtime, configuration, storage and reviewer availability; authentication diagnostics depend on what each reviewer CLI exposes. [Open an issue](https://github.com/yannmenec/inspectrum/issues) with sanitized output, never credentials.

---

<div align="center">

Found a miss or have a plan you can share safely? [Open an issue](https://github.com/yannmenec/inspectrum/issues) or use the [consented case-submission template](https://github.com/yannmenec/inspectrum/blob/main/docs/real-case-submission-template.md).

MIT — [Yann Menec](https://github.com/yannmenec). Contributions welcome: [CONTRIBUTING.md](CONTRIBUTING.md).

</div>
