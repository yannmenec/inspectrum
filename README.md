# inspectrum

> Catch the bad plan before your agent spends the tokens.

[![CI](https://github.com/yannmenec/inspectrum/actions/workflows/ci.yml/badge.svg)](https://github.com/yannmenec/inspectrum/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/inspectrum.svg)](https://www.npmjs.com/package/inspectrum)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org/)

Plan Mode changed AI coding because it moved the important decision earlier: before files are edited, tests are rewritten, or a PR exists. But one model reviewing its own plan misses the same blind spots.

inspectrum sends the plan to a peer LLM, merges the findings, and returns one verdict: **approve / revise / reject**.

## Why plans need review

- **Plans are leverage.** Fixing a bad plan is cheaper than fixing bad code.
- **Single-model review is biased.** The same model often misses the same flaw twice.
- **Cross-LLM review catches different risks.** Claude and Codex disagree usefully.
- **You keep the final call.** Inspectrum is read-only: it reviews, logs, and reports.

## Setup

You need **Node.js 20+** ([nodejs.org](https://nodejs.org/)) and one of the two main coding agents:

- **Claude Code** users → use **Codex** as your reviewer. Needs a [ChatGPT Plus/Pro/Business subscription](https://chatgpt.com/pricing) (no API key).
- **Codex Desktop** users → use **Claude** as your reviewer. Needs a [Claude Pro/Max subscription](https://www.anthropic.com/pricing) (no API key).

No JSON editing, no API keys. Paste one prompt; you're done.

### If you use Claude Code

**The plan gate (recommended).** Two commands install a plugin that reviews every plan with Codex *before* the approval dialog appears — Codex findings bounce the plan back to Claude for revision (max 2 rounds), and only reviewed plans reach you:

```bash
claude plugin marketplace add yannmenec/inspectrum
claude plugin install inspectrum@inspectrum
```

You also need the Codex CLI (`npm install -g @openai/codex`, then run `codex` once to sign in with your ChatGPT account) — paste this into a Claude Code chat if you'd rather have the agent check everything:

````text
Set up inspectrum's Codex plan gate. Use normal approvals only — do not
switch to Bypass Permissions or Full Access.

Steps:
1. Run `node --version`. If < 20, stop and tell me to install Node 20+
   from https://nodejs.org first.
2. Run `codex --version`. If "command not found", run
   `npm install -g @openai/codex` and verify again.
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

**How the gate behaves.** When Claude finishes a plan in plan mode, the hook runs `inspectrum plan-gate`: verdict `approve` → your normal approval dialog appears (plus a one-line confirmation); `revise`/`reject` → Claude receives the findings and revises before you ever see the plan (max 2 rounds, then it passes through with a warning). Identical plans are never reviewed twice (hash cache), and *any* failure — Codex not installed, logged out, timeout — fails open: your plan proceeds, with a visible warning. Kill switch: `[plan_gate] enabled = false` in `~/.inspectrum/config.toml`, or disable the plugin per project.

<details>
<summary>Manual hook install (no plugin)</summary>

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          { "type": "command", "command": "npx -y inspectrum@latest plan-gate", "timeout": 600 }
        ]
      }
    ]
  }
}
```

If you hack on inspectrum itself, prefer `npm install -g inspectrum` and `"command": "inspectrum plan-gate"` — see Troubleshooting.

</details>

### If you use Codex Desktop

Paste this into Codex Desktop. It installs the Claude Code CLI as your peer reviewer.

````text
Set up inspectrum so I can review my plans with Claude. Use normal
approvals only.

Steps:
1. Run `node --version`. If < 20, stop and tell me to install Node 20+
   from https://nodejs.org first.
2. Run `claude --version`. If "command not found", run
   `npm install -g @anthropic-ai/claude-code` and verify again.
3. If `~/.inspectrum/config.toml` does not exist, create it with:

   [defaults]
   reviewers = ["claude"]

4. Run `codex mcp add inspectrum -- npx -y inspectrum@latest`
5. Run `npx -y inspectrum@latest doctor` and show me the output.
6. Pop open a Terminal window with claude already running so I can
   confirm or complete login, by executing:
     `osascript -e 'tell application "Terminal" to do script "claude"'`
   Then tell me:
   - "If claude shows its chat prompt, you're already logged in —
     close the Terminal window. inspectrum is ready."
   - "If claude shows /login or opens a browser, complete the sign-in
     with your Claude account, then close the Terminal window.
     inspectrum is then ready."
   (The ⚠ claude line in the doctor stays even after login because
   claude doesn't expose a status command we can detect — harmless.)

Do NOT use sudo, edit shell profiles, push git changes, read .env or
credentials, or publish packages. Report back: Node version, claude
install status, doctor verdict, and whether login was needed.
````

After the one-time login (if needed), you're set.

## Use

With the plugin installed, **plan mode is the workflow** — every plan is reviewed automatically before you see it. No prompt, no button, no tokens spent on triggering.

On demand (any host with the MCP server registered), use `/inspectrum:review [reviewers]` or just ask:

```text
Review this plan with inspectrum.
```

**Which model reviews, at which effort?** Nobody "asks" for the review — the hook is deterministic code, so it works the same whether your session runs Fable 5, Sonnet or Haiku. On the Codex side, precedence is:

| Setting | 1st (wins) | 2nd | 3rd |
|---|---|---|---|
| model | `[reviewers.codex] model` in `~/.inspectrum/config.toml` | `model` in `~/.codex/config.toml` | codex built-in default |
| reasoning effort | `[reviewers.codex] effort` | `model_reasoning_effort` in `~/.codex/config.toml` | codex built-in default |

`inspectrum doctor` prints the resolved values. High/ultra effort gives the deepest reviews but can take minutes per plan — set `effort = "high"` (or `"medium"`) in `[reviewers.codex]` if the gate feels slow.

## What you get

inspectrum writes a Markdown report with a verdict (`approve`, `revise`, or `reject`), findings grouped by severity, reviewer attribution, an optional revised plan, and a local session log under `~/.inspectrum/sessions/` (chmod 0700 on POSIX).

<details>
<summary>Advanced setup (other hosts, more reviewers, API keys)</summary>

#### Other hosts

| Host | Install |
|------|---------|
| **Claude Desktop** (macOS, Windows) | Download [`inspectrum.mcpb`](https://github.com/yannmenec/inspectrum/releases/latest/download/inspectrum.mcpb), open it, confirm install. |
| **Cursor** | [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.png)](https://cursor.com/en/install-mcp?name=inspectrum&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImluc3BlY3RydW1AbGF0ZXN0Il19) |
| **Codex app form fields** | Settings → MCP servers → Add server. STDIO. Name `inspectrum`, Command `npx`, Arguments `-y inspectrum@latest`. |

Manual JSON/TOML examples live under [`examples/`](examples/). See the [Claude Code MCP docs](https://code.claude.com/docs/en/mcp), [Codex MCP docs](https://developers.openai.com/codex/mcp), and [Cursor install links](https://cursor.com/docs/mcp/install-links) for host docs.

#### More reviewers

Override `~/.inspectrum/config.toml` to add Gemini, local Ollama, OpenRouter, etc.:

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
effort          = "high"          # passed as -c model_reasoning_effort=high (any string codex accepts)
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
plan_max_chars   = 16000
report_max_chars = 8000
timeout_seconds  = 300
```

Without a config file, `reviewers = ["codex"]` is used. Built-in reviewer entries (claude/codex/gemini) survive user `[reviewers.*]` additions — a same-id entry replaces the built-in one. The `defaults.reviewers` list controls which backends are required to be healthy — `inspectrum doctor` only fails on those.

Free-tier-friendly: `gemini auth` lets you use the Gemini CLI with a personal Google account, no API key.

#### Cross-LLM setup

Headless or CI agent that can't run an interactive OAuth login? Pass the peer API key through the MCP host's `env` block instead.

```jsonc
// .mcp.json (Claude Code, Cursor) — uses Codex via OPENAI_API_KEY
{
  "mcpServers": {
    "inspectrum": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "inspectrum@latest"],
      "env": {
        "OPENAI_API_KEY": "<your OpenAI key>"
      }
    }
  }
}
```

```toml
# ~/.codex/config.toml (Codex app) — uses Claude via ANTHROPIC_API_KEY
[mcp_servers.inspectrum]
command = "npx"
args    = ["-y", "inspectrum@latest"]

[mcp_servers.inspectrum.env]
ANTHROPIC_API_KEY = "<your Anthropic key>"
```

Env-var lookup per reviewer: `claude` → `ANTHROPIC_API_KEY`; `codex` → `OPENAI_API_KEY`; `gemini` → `GEMINI_API_KEY` (or `GOOGLE_API_KEY` / `GOOGLE_GENAI_USE_VERTEXAI`). Don't commit `.mcp.json` with real keys; the repo's `.gitignore` excludes `/.mcp.json`.

#### Terminal install (skip the agent prompt)

```bash
# Claude Code, user-wide
claude mcp add --transport stdio --scope user inspectrum -- npx -y inspectrum@latest

# Claude Code, project-shared (commits .mcp.json)
claude mcp add --transport stdio --scope project inspectrum -- npx -y inspectrum@latest

# Codex
codex mcp add inspectrum -- npx -y inspectrum@latest

# Verify
npx -y inspectrum@latest doctor
```

</details>

<details>
<summary>Privacy</summary>

- Session logs live at `~/.inspectrum/sessions/<timestamp>__<id>/` and contain your full plan + each reviewer's transcript. v0.1.0 sets the directory permissions to **0700 on POSIX** so other users on the same machine can't read them. Sessions written by older versions stay on their original perms — retrofit with `chmod -R 700 ~/.inspectrum/sessions/`.
- **Never paste secrets into the plan or context.** They get written to disk and sent to every active reviewer.
- Cloud routes (what gets sent where): **claude** → Anthropic via Claude Code OAuth keychain or `ANTHROPIC_API_KEY`; **codex** → OpenAI via ChatGPT login or `OPENAI_API_KEY`; **gemini** → Google via `gemini auth` or `GEMINI_API_KEY`; **kimi** → Moonshot via `MOONSHOT_API_KEY` *(experimental)*; **qwen** → Alibaba DashScope via `DASHSCOPE_API_KEY` *(experimental)*; **openrouter** → openrouter.ai → upstream provider chosen by `model`, via `OPENROUTER_API_KEY`; **ollama** → localhost only, with no network egress unless you reconfigure `endpoint`.
- **Codex flags inspectrum passes.** `codex exec --ephemeral --skip-git-repo-check -s read-only …` plus `-m <model>` / `-c model_reasoning_effort=<effort>` when configured. `--skip-git-repo-check` bypasses the per-project trust prompt so plan review works from any cwd. `--ephemeral` keeps codex from persisting session files. `-s read-only` pins the sandbox explicitly — review must never write; user-supplied `-s`/`--sandbox` args are stripped.

</details>

## Troubleshooting

**`sh: inspectrum: command not found` / `claude mcp list` shows `✗ Failed to connect` — but only when your current directory is the inspectrum repo itself.** `npx inspectrum@<version>` resolves the spec against the *local* package when cwd is inside a package named `inspectrum` whose version matches, and a package's own bin is never self-linked into its `node_modules/.bin`. The published package is fine. Fixes: run from any other directory, or install the real binary once and register that instead:

```bash
npm install -g inspectrum
claude mcp add --transport stdio --scope user inspectrum -- inspectrum
```

## License + author

MIT — [Yann Menec](https://github.com/yannmenec). Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
