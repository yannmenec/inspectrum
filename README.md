# inspectrum

> Cross-LLM plan review — catch the bad plan before you spend the tokens.

[![CI](https://github.com/yannmenec/inspectrum/actions/workflows/ci.yml/badge.svg)](https://github.com/yannmenec/inspectrum/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/inspectrum.svg)](https://www.npmjs.com/package/inspectrum)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org/)

## Why

Plan Mode is where the agent decides what to build before it writes a line of
code. A bad plan wastes tokens, produces thrown-out PRs, and lowers code
quality. One LLM reviewing its own plan misses the same blind spots.
inspectrum sends the plan to other LLMs in parallel, a judge LLM consolidates
the findings, and you get one verdict: **approve / revise / reject**. It works
with 1 LLM (no judge); 2 or more unlocks the judge.

## Get started

```bash
npx inspectrum@latest doctor
```

That's it. `doctor` checks Node, your config, your sessions directory, and
each active reviewer CLI. Plug it into your host with one of the configs
below.

### Claude Code

Copy [`examples/claude-code/mcp.json`](examples/claude-code/mcp.json) to
`.mcp.json` at your project root. Reload the window — the `review_plan` tool
appears under **MCP → inspectrum**.

```json
{
  "mcpServers": {
    "inspectrum": { "type": "stdio", "command": "npx", "args": ["-y", "inspectrum@latest"] }
  }
}
```

Optionally also copy
[`examples/claude-code/.claude/commands/review-plan.md`](examples/claude-code/.claude/commands/review-plan.md)
to install the `/review-plan` slash command.

### Codex Desktop

Add to `~/.codex/config.toml` (the only path read by Codex 0.130+):

```toml
[mcp_servers.inspectrum]
command = "npx"
args    = ["-y", "inspectrum@latest"]
```

### Cursor (v1.6+)

Copy [`examples/cursor/.cursor/mcp.json`](examples/cursor/.cursor/mcp.json)
to `.cursor/mcp.json` (project scope) or `~/.cursor/mcp.json` (global). Same
JSON as Claude Code.

## How to use it

Once Claude Code or Codex shows the **Accept / Revise / Reject** (or
**Implement this plan? Yes / No**) prompt, you can't chat. So either trigger
the review *before* the modal appears, or set it up to run automatically.

**On-demand (default).** In normal chat — before or during plan construction
— say:

```
review this plan with inspectrum (codex, gemini)
```

`review_plan` is a read-only MCP tool, so the agent can call it from inside
Plan Mode. The Accept / Revise / Reject modal then shows a plan that has
already been peer-reviewed. With the slash command installed, the shortcut is
`/review-plan codex,gemini`.

**Opt-in auto-run.** Paste this paragraph into your own project's
`CLAUDE.md` (or `~/.codex/AGENTS.md`):

```
Before finalizing any plan (Plan Mode or otherwise), call the
`review_plan` MCP tool (inspectrum) with reviewers of your choice.
Skip this step only if the user explicitly says "no review".
```

You pick the reviewers; you can override per-plan by saying "no review" or
"review with codex only".

**Heads up.** The **Revise** input box in Claude Code Desktop, and the
**"tell Codex what to do differently"** box, are *not* verified entry points
for v0.1.0. If you're already in the plan modal, hit Reject and ask in
normal chat.

## What you get

A consolidated Markdown report — exactly one `verdict`, findings grouped by
severity, each tagged with the reviewer that surfaced it:

```
# inspectrum Review — session a3f1

**Verdict: ⚠️ REVISE**  ·  Reviewers: codex, gemini  ·  Judge: success  ·  18.4s

## Blockers (1)
- **[codex+gemini]** No retry/fallback if Redis is down — the endpoint will 500.
  *Fix: wrap with try/catch, fail-open with an in-memory LRU after N failures.*

## Majors (2)
- **[codex]** Missing 429 response body shape (clients expect {retryAfter, limit}).
- **[gemini]** X-Forwarded-For trust: must call app.set('trust proxy', …).

## Minors (1)
- **[codex]** Test path inconsistent with repo convention (__tests__/ vs tests/).
```

If `verdict = revise`, the agent typically asks: *"Apply the revised plan?"*

## How it works

- **Plan → fan-out.** Your plan goes to every active reviewer in parallel
  (`child_process` for CLI reviewers, plain HTTP for Ollama / OpenRouter).
- **Judge consolidates.** When ≥ 2 reviewers run, a third LLM deduplicates
  findings, escalates severity, and produces the final verdict.
- **Flat-file session log.** Every run is written to
  `~/.inspectrum/sessions/<timestamp>__<id>/` as readable Markdown. Grep it,
  diff it, share it. Hosts can also read it as an MCP resource at
  `inspectrum://sessions/{id}/{file}`.

## Config

<details>
<summary>Override the defaults via <code>~/.inspectrum/config.toml</code></summary>

```toml
[defaults]
reviewers = ["codex", "gemini"]   # called in parallel
judge     = "claude"              # consolidates when >= 2 reviewers
focus     = "all"                 # correctness | completeness | risk | clarity | all

[reviewers.claude]
type   = "cli"
binary = "claude"

[reviewers.codex]
type   = "cli"
binary = "codex"
model  = "gpt-5"

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
plan_max_chars   = 16000
report_max_chars = 8000
timeout_seconds  = 60
```

Without a config file, `reviewers = ["claude"]` is used (no judge, since
judge requires ≥ 2 reviewers). The `defaults.reviewers` list controls which
backends are *required* to be healthy — `inspectrum doctor` only fails on
those.

</details>

## Requirements

- Node ≥ 20.
- At least one reviewer CLI installed and authenticated:
  - `claude` ≥ 2.1 — `npm install -g @anthropic-ai/claude-code`
  - `codex` ≥ 0.128 — Codex Desktop or `brew install codex`
  - `gemini` ≥ 0.41 — `npm install -g @google/gemini-cli`
- Kimi and Qwen are **experimental** in v0.1.0 (CLI shapes assumed, not
  smoke-tested). See [CONTRIBUTING.md](CONTRIBUTING.md#experimental-reviewers).

## Privacy

- Session logs live at `~/.inspectrum/sessions/<timestamp>__<id>/` and
  contain your full plan + each reviewer's transcript. v0.1.0 sets the
  directory permissions to **0700 on POSIX** so other users on the same
  machine can't read them. Sessions written by older versions stay on their
  original perms — retrofit with `chmod -R 700 ~/.inspectrum/sessions/`.
- **Never paste secrets into the plan or context.** They get written to disk
  and sent to every active reviewer.
- Cloud routes (what gets sent where):
  - **claude** → Anthropic, via Claude Code OAuth keychain (local auth).
  - **codex** → OpenAI, via `OPENAI_API_KEY` or Codex Desktop's ChatGPT login.
  - **gemini** → Google, via `GEMINI_API_KEY`.
  - **kimi** → Moonshot, via `MOONSHOT_API_KEY` *(experimental)*.
  - **qwen** → Alibaba DashScope, via `DASHSCOPE_API_KEY` *(experimental)*.
  - **openrouter** → openrouter.ai → upstream provider chosen by `model`,
    via `OPENROUTER_API_KEY`.
  - **ollama** → localhost only. No network egress unless you reconfigure
    `endpoint`.

## License

MIT — [Yann Menec](https://github.com/yannmenec). Contributions welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md).
