# inspectrum

> Catch the bad plan before your agent spends the tokens.

[![CI](https://github.com/yannmenec/inspectrum/actions/workflows/ci.yml/badge.svg)](https://github.com/yannmenec/inspectrum/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/inspectrum.svg)](https://www.npmjs.com/package/inspectrum)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org/)

Plan Mode changed AI coding because it moved the important decision earlier: before files are edited, tests are rewritten, or a PR exists. But one model reviewing its own plan misses the same blind spots.

inspectrum sends the plan to other LLMs, merges the findings, and returns one verdict: **approve / revise / reject**.

## Why plans need review

- **Plans are leverage.** Fixing a bad plan is cheaper than fixing bad code.
- **Single-model review is biased.** The same model often misses the same flaw twice.
- **Cross-LLM review catches different risks.** Claude, Codex, Gemini, and local models disagree usefully.
- **You keep the final call.** Inspectrum is read-only: it reviews, logs, and reports.

## Install

### Before you install

You need **Node.js 20+** and at least one reviewer CLI signed in. Your host runs Inspectrum; a reviewer CLI does the review. Common reviewers: `claude`, `codex`, `gemini` (advanced reviewers are listed in the config block below). Run `npx -y inspectrum@latest doctor` any time to see which ones are healthy.

> **"No Terminal" only if Node + a reviewer CLI are already there.** Installing Inspectrum is one click for Claude Desktop and Cursor, and form-fill for the Codex app. Installing Node or a reviewer CLI for the first time may require their own one-time setup - see [nodejs.org](https://nodejs.org/) and the reviewer-CLI install page you choose.

### Install in your host

| Host | Install |
|------|---------|
| **Claude Desktop** (macOS, Windows) | Download [`inspectrum.mcpb`](https://github.com/yannmenec/inspectrum/releases/latest/download/inspectrum.mcpb), open it, confirm install. |
| **Cursor** | [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.png)](https://cursor.com/en/install-mcp?name=inspectrum&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImluc3BlY3RydW1AbGF0ZXN0Il19) |
| **Codex app** | Settings -> MCP servers -> Add server. Choose `STDIO`, then use the fields below. |
| **ChatGPT Desktop / OpenCode** | Not yet supported via a click-only install. ChatGPT Desktop accepts remote HTTPS custom connectors; Inspectrum is local stdio. OpenCode users should use Terminal below. |

First run downloads npm dependencies through [`npx`](https://docs.npmjs.com/cli/v11/commands/npx/); wait up to 30 seconds on the first invocation.

**First test prompt (paste in chat after install, any host).** If at least one reviewer CLI is installed, Inspectrum returns a report and mentions any reviewers that were missing.

```text
Review this plan with inspectrum using claude, codex, and gemini. It is
okay if unavailable reviewers fail - tell me which reviewer worked and
which ones need setup.
```

**Codex app fields** (paste each value into the matching field):

```text
Name: inspectrum
Command to launch: npx
Arguments:
-y
inspectrum@latest
```

If all three reviewers fail, none of `claude` / `codex` / `gemini` are on PATH yet. Run `npx -y inspectrum@latest doctor` to see what's missing.

### Let Claude Code or Codex install it

Already using one of the agent CLIs? Paste this into your agent. Keep normal approvals on; do not switch to [Full Access](https://developers.openai.com/codex/cli/features) or [Bypass Permissions](https://code.claude.com/docs/en/permission-modes) for this install unless you are in a disposable VM/container.

```text
Install inspectrum for me as a local MCP server.
Use normal approvals. Do not use Full Access or Bypass Permissions
unless I explicitly confirm I am in a disposable VM/container.
Scope:
- Configure one MCP server named "inspectrum".
- Command: "npx"
- Args: ["-y", "inspectrum@latest"]
- Do not change other MCP servers.
- Do not read .env files, credentials, SSH keys, browser data, or unrelated files.
- Do not use sudo, install global packages, edit shell profiles, publish packages, push git changes, or delete files.
Steps:
1. Check `node --version` and `npx --version`.
2. If this is Claude Code, run:
   `claude mcp add --transport stdio --scope user inspectrum -- npx -y inspectrum@latest`
3. If this is Codex, run:
   `codex mcp add inspectrum -- npx -y inspectrum@latest`
4. Run: `npx -y inspectrum@latest doctor`
5. Tell me whether the MCP server and at least one reviewer are healthy.
```

### Terminal

```bash
npx -y inspectrum@latest doctor
# Claude Code, user-wide
claude mcp add --transport stdio --scope user inspectrum -- npx -y inspectrum@latest
# Claude Code, project-shared (commits .mcp.json)
claude mcp add --transport stdio --scope project inspectrum -- npx -y inspectrum@latest
# Codex
codex mcp add inspectrum -- npx -y inspectrum@latest
```

Manual JSON/TOML examples live under [`examples/`](examples/). See the [Claude Code MCP docs](https://code.claude.com/docs/en/mcp), [Codex MCP docs](https://developers.openai.com/codex/mcp), [Codex CLI](https://developers.openai.com/codex/cli), and [Cursor install links](https://cursor.com/docs/mcp/install-links) for host docs.

## Cross-LLM setup

inspectrum is designed for **cross-LLM** review: a Claude Code user reviews with `codex` + `gemini`, a Codex user reviews with `claude` + `gemini`, and so on. Same-vendor review shares the same blind spots, *and* Desktop MCP hosts don't forward their OAuth/API keys into the inspectrum subprocess - reviewing with your host's own vendor will fail authentication regardless.

| Your host | Recommended reviewers | Keys to forward |
|-----------|----------------------|------------------|
| Claude Desktop / Claude Code | `codex`, `gemini` | `OPENAI_API_KEY`, `GEMINI_API_KEY` |
| Codex app | `claude`, `gemini` | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` |
| Gemini CLI | `claude`, `codex` | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` |

Pass peer API keys through your host's MCP `env` block:

```jsonc
// .mcp.json (Claude Code, Cursor)
{
  "mcpServers": {
    "inspectrum": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "inspectrum@latest"],
      "env": {
        "OPENAI_API_KEY": "<your OpenAI key>",
        "GEMINI_API_KEY": "<your Gemini key>"
      }
    }
  }
}
```

```toml
# ~/.codex/config.toml (Codex app)
[mcp_servers.inspectrum]
command = "npx"
args    = ["-y", "inspectrum@latest"]

[mcp_servers.inspectrum.env]
ANTHROPIC_API_KEY = "<your Anthropic key>"
GEMINI_API_KEY    = "<your Gemini key>"
```

Then pin the reviewers in `~/.inspectrum/config.toml`:

```toml
[defaults]
reviewers = ["codex", "gemini"]   # for a Claude Code user
```

Without this file, inspectrum defaults to `reviewers = ["claude"]` - wrong from a Claude-based host.

**Heads up.** Don't commit `.mcp.json` with real keys (the repo's `.gitignore` excludes `/.mcp.json`). If `inspectrum doctor` shows ✅ but `review_plan` still fails, your host isn't forwarding the keys - `inspectrum doctor` only sees the inspectrum subprocess env, which is what the doctor's `⚠` warnings flag.

## Use

Before approving a plan, ask:

```text
Review this plan with inspectrum using codex and gemini.
```

Or make it automatic by adding one paragraph to your project's `CLAUDE.md` / `AGENTS.md`:

```text
Before finalizing any implementation plan, call the `review_plan` MCP
tool (inspectrum) with the available reviewers. Skip only if I explicitly
say "no review".
```

**Modal caveat.** Once Claude Desktop or the Codex app shows the Accept / Revise / Reject prompt, free chat is blocked - trigger the review before the modal, or rely on the auto-run paragraph above.

## What you get

inspectrum writes a Markdown report with a verdict (`approve`, `revise`, or `reject`), findings grouped by severity, reviewer attribution, an optional revised plan, and a local session log under `~/.inspectrum/sessions/` (chmod 0700 on POSIX).

<details>
<summary>Reviewer config (TOML)</summary>

Override the defaults via `~/.inspectrum/config.toml`:

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

Without a config file, `reviewers = ["claude"]` is used (no judge, since judge requires >= 2 reviewers). The `defaults.reviewers` list controls which backends are required to be healthy - `inspectrum doctor` only fails on those.

</details>

<details>
<summary>Privacy</summary>

- Session logs live at `~/.inspectrum/sessions/<timestamp>__<id>/` and contain your full plan + each reviewer's transcript. v0.1.0 sets the directory permissions to **0700 on POSIX** so other users on the same machine can't read them. Sessions written by older versions stay on their original perms - retrofit with `chmod -R 700 ~/.inspectrum/sessions/`.
- **Never paste secrets into the plan or context.** They get written to disk and sent to every active reviewer.
- Cloud routes (what gets sent where): **claude** -> Anthropic via Claude Code OAuth keychain (local auth); **codex** -> OpenAI via `OPENAI_API_KEY` or Codex Desktop's ChatGPT login; **gemini** -> Google via `GEMINI_API_KEY`; **kimi** -> Moonshot via `MOONSHOT_API_KEY` *(experimental)*; **qwen** -> Alibaba DashScope via `DASHSCOPE_API_KEY` *(experimental)*; **openrouter** -> openrouter.ai -> upstream provider chosen by `model`, via `OPENROUTER_API_KEY`; **ollama** -> localhost only, with no network egress unless you reconfigure `endpoint`.

</details>

## License + author

MIT - [Yann Menec](https://github.com/yannmenec). Contributions welcome - see [CONTRIBUTING.md](CONTRIBUTING.md).
