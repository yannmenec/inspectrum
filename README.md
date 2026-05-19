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

Paste this into a fresh Claude Code chat. It installs the Codex CLI, wires inspectrum into your MCP config, and tells you whether you still need to finish a one-time Codex login.

````text
Set up inspectrum so I can review my plans with Codex. Use normal
approvals only — do not switch to Bypass Permissions or Full Access.

Steps:
1. Run `node --version`. If < 20, stop and tell me to install Node 20+
   from https://nodejs.org first.
2. Run `codex --version`. If "command not found", run
   `npm install -g @openai/codex` and verify again.
3. If `~/.inspectrum/config.toml` does not exist, create it with:

   [defaults]
   reviewers = ["codex"]

4. Run `claude mcp add --transport stdio --scope user inspectrum -- npx -y inspectrum@latest`
5. Run `npx -y inspectrum@latest doctor` and show me the output.
6. Run `codex login status`.
   - If it prints "Logged in", tell me: "✅ Setup complete. Just ask
     me to 'Review this plan with inspectrum' on any plan." Done.
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

Before approving a plan, ask:

```text
Review this plan with inspectrum.
```

Or make it automatic by adding one paragraph to your project's `CLAUDE.md` / `AGENTS.md`:

```text
Before finalizing any implementation plan, call the `review_plan` MCP
tool (inspectrum) with the available reviewers. Skip only if I explicitly
say "no review".
```

**Modal caveat.** Once Claude Desktop or the Codex app shows the Accept / Revise / Reject prompt, free chat is blocked — trigger the review before the modal, or rely on the auto-run paragraph above.

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

Without a config file, `reviewers = ["claude"]` is used. The `defaults.reviewers` list controls which backends are required to be healthy — `inspectrum doctor` only fails on those.

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
- **Codex flags inspectrum passes.** `codex exec --skip-git-repo-check --ephemeral …`. `--skip-git-repo-check` bypasses codex 0.131's per-project trust prompt so plan review works from any cwd without first adding the directory to `~/.codex/config.toml`. `--ephemeral` keeps codex from persisting session files — it does *not* control the sandbox. inspectrum does **not** pass `--dangerously-bypass-approvals-and-sandbox`; whatever sandbox/approval defaults you have in `~/.codex/config.toml` still apply.

</details>

## License + author

MIT — [Yann Menec](https://github.com/yannmenec). Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
