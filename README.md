<div align="center">

# inspectrum

### Catch the bad plan before your agent spends the tokens.

[![CI](https://github.com/yannmenec/inspectrum/actions/workflows/ci.yml/badge.svg)](https://github.com/yannmenec/inspectrum/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/inspectrum.svg)](https://www.npmjs.com/package/inspectrum)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen.svg)](https://nodejs.org/)

**Claude plans it. GPT reviews it. You approve it.**

</div>

---

Every AI coding disaster starts the same way: a plausible plan, approved in three seconds.

The problem isn't that your agent plans badly — it's that **nobody checks the plan**. You skim it, hit approve, and find out 40 minutes and 200k tokens later that step 2 was wrong. Asking the same model to review its own plan doesn't help: same model, same blind spots, same miss — twice.

**inspectrum wires a rival LLM into your agent's plan mode.** When Claude Code finishes a plan, Codex (GPT) reviews it *before* the approval dialog reaches you. Findings bounce the plan back to Claude for revision — so the plan you finally approve has already survived a second opinion. (And if the reviewer can't run, the plan passes through with a warning, never blocked.)

## ⚡ 60 seconds to your first gated plan

You need [Node 20+](https://nodejs.org), Claude Code, and the Codex CLI with a [ChatGPT subscription](https://chatgpt.com/pricing) (no API key):

```bash
claude plugin marketplace add yannmenec/inspectrum
claude plugin install inspectrum@inspectrum
```

That's the whole install. Next time you finish a plan in plan mode:

```text
⏺ ExitPlanMode
  ⎿  inspectrum×codex: REVISE (round 1/2)          # abridged — real output
     Majors:                                       # adds a full-report path
     - [codex] Migration drops the unique index before backfilling —
       concurrent writes can insert duplicates.
       Fix: backfill first, drop the index last.
     Revise the plan to address these findings, then finish the plan again.

⏺ ExitPlanMode
  ⎿  inspectrum: codex approved the plan (session 2026-07-12…).
     ┌ Ready to code? ────────────────
     │ Here is Claude's plan…        ← your normal approval dialog
```

No prompt to remember, no button, zero tokens spent on triggering. The gate is a deterministic hook — it fires on every plan, whether your session runs Fable, Sonnet, or Haiku. Two commands give you the automatic gate; the on-demand `/inspectrum:review` command needs one extra line (registering the MCP server — shown in the assisted setup below).

<details>
<summary>Prefer the agent to install and check everything for you? Paste this into Claude Code.</summary>

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

Built to be **boring and safe**:

- **Fails open.** Codex not installed, logged out, timed out, network down — the plan proceeds with a visible warning. Operational errors don't block your work; the gate degrades, it doesn't brick.
- **Never auto-approves.** A green review still lands on *your* approval dialog. The gate can delay it (while Claude revises) but can never click it — you keep the final call.
- **No wasted reviews.** Within a session, an unchanged plan is hash-cached and not re-reviewed; only real revisions spend a round.
- **Read-only reviewer.** Codex runs in a pinned read-only sandbox (`codex exec -s read-only --ephemeral`), and sandbox-weakening flags in your config are stripped. The reviewer reads; it doesn't write.
- **Kill switch.** `[plan_gate] enabled = false` in `~/.inspectrum/config.toml`, or disable the plugin per project.

## Why a rival model?

- **Plans are leverage.** A flaw caught at plan time costs a paragraph. The same flaw caught at PR time costs a rewrite.
- **Self-review is an echo chamber.** The model that wrote the plan is the least qualified to find its blind spots.
- **Claude and GPT disagree usefully.** Different training, different failure modes, different objections. That disagreement is the product.
- **You already pay for both.** The gate runs on your existing ChatGPT subscription — no API key, no per-token bill.

## What's in the box

| | |
|---|---|
| 🚦 **Plan gate** | Every Claude Code plan reviewed by Codex before it reaches you — automatic, max 2 revision rounds |
| 🔍 **On-demand review** | `/inspectrum:review` or "Review this plan with inspectrum" from any MCP host |
| 🧑‍⚖️ **Multi-reviewer + judge** | Run codex + gemini + claude in parallel; a judge consolidates into one verdict |
| 📋 **One verdict** | `approve / revise / reject` + findings by severity, with reviewer attribution |
| 🗂️ **Session logs** | Markdown record of every review — verdict, findings, revised plan — under `~/.inspectrum/sessions/` (0700 perms) |
| 🩺 **`inspectrum doctor`** | One command to check your reviewer is installed, authenticated, and resolving the right model — fails loudly if Codex is logged out |

## Works with

| Your agent | Your reviewer | Setup |
|------------|--------------|-------|
| **Claude Code** | Codex (GPT) | Plugin — 2 commands above |
| **Codex Desktop** | Claude | `codex mcp add inspectrum -- npx -y inspectrum@latest` + config below |
| **Claude Desktop** | Codex (GPT) | Download [`inspectrum.mcpb`](https://github.com/yannmenec/inspectrum/releases/latest/download/inspectrum.mcpb), open, confirm |
| **Cursor** | Codex (GPT) | [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.png)](https://cursor.com/en/install-mcp?name=inspectrum&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImluc3BlY3RydW1AbGF0ZXN0Il19) |

<details>
<summary><b>Codex Desktop setup</b> — use Claude as your reviewer</summary>

Paste this into Codex Desktop:

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

Needs a [Claude Pro/Max subscription](https://www.anthropic.com/pricing) — no API key.

</details>

## Tuning

**Which model reviews, at which effort?** On the Codex side, precedence is:

| Setting | 1st (wins) | 2nd | 3rd |
|---|---|---|---|
| model | `[reviewers.codex] model` in `~/.inspectrum/config.toml` | `model` in `~/.codex/config.toml` | codex built-in default |
| reasoning effort | `[reviewers.codex] effort` | `model_reasoning_effort` in `~/.codex/config.toml` | codex built-in default |

`inspectrum doctor` prints the resolved values. High effort gives the deepest reviews but can take minutes per plan — drop to `effort = "medium"` in `[reviewers.codex]` if the gate feels slow.

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

Without a config file, `reviewers = ["codex"]` is used. Free-tier-friendly: the Gemini CLI works with a personal Google account, no API key. Experimental backends: kimi, qwen, openrouter, ollama (local, zero egress).

Headless or CI host that can't run an interactive login? Pass the peer API key through the MCP host's `env` block instead — `OPENAI_API_KEY` (codex), `ANTHROPIC_API_KEY` (claude), `GEMINI_API_KEY` (gemini). Manual JSON/TOML examples live under [`examples/`](examples/).

```bash
# Register the MCP server without the plugin:
claude mcp add --transport stdio --scope user inspectrum -- npx -y inspectrum@latest   # Claude Code
codex mcp add inspectrum -- npx -y inspectrum@latest                                   # Codex

# Manual hook install (no plugin) — add to ~/.claude/settings.json:
#   "hooks": { "PreToolUse": [ { "matcher": "ExitPlanMode", "hooks":
#     [ { "type": "command", "command": "npx -y inspectrum@latest plan-gate", "timeout": 600 } ] } ] }

# Verify everything:
npx -y inspectrum@latest doctor
```

</details>

<details>
<summary><b>Privacy</b> — what leaves your machine, what stays</summary>

- Session logs live at `~/.inspectrum/sessions/<timestamp>__<id>/` and contain your full plan plus a Markdown record of each reviewer's verdict and findings. Directory perms are **0700 on POSIX**. Logs written by pre-0.1.0 versions keep their original perms — retrofit with `chmod -R 700 ~/.inspectrum/sessions/`.
- **Never paste secrets into a plan or context.** The plan is written to the local session log, and both the plan and context are sent to every active reviewer.
- Cloud routes: **claude** → Anthropic (OAuth keychain or `ANTHROPIC_API_KEY`); **codex** → OpenAI (ChatGPT login or `OPENAI_API_KEY`); **gemini** → Google (personal-account CLI login or `GEMINI_API_KEY`); **openrouter** → openrouter.ai; **ollama** → localhost only, zero egress unless you change `endpoint`.
- Codex is invoked as `codex exec --ephemeral --skip-git-repo-check -s read-only …` in a throwaway temp directory — the sandbox is pinned read-only, sandbox-weakening and cwd-override args from your config are stripped, and codex persists no session files.

</details>

## FAQ

**Does this slow me down?**
Only when it should. An approve verdict adds one review pass (seconds to a couple of minutes depending on effort); a bounced plan was a plan you *wanted* bounced. Within a session, an unchanged plan is cached and not re-reviewed.

**What if Codex is down / logged out / not installed?**
The gate fails open with a visible warning and your plan proceeds untouched. An operational error never blocks your work — that's an architecture invariant, not a best effort.

**Can it approve a plan behind my back?**
No. The gate can only *delay* the approval dialog (while Claude revises) — it can never click it. You see and approve every plan that ships.

**Do I need API keys?**
No. Codex reviews run on your ChatGPT Plus/Pro subscription; Claude reviews on your Claude Pro/Max subscription. API keys are supported for headless/CI setups.

**My prompt/plan is sensitive — where does it go?**
To the reviewer(s) you configured, and to a local session log under `~/.inspectrum/sessions/` (0700). Nothing else. Use ollama for a fully local, zero-egress reviewer.

## Troubleshooting

**`sh: inspectrum: command not found` / `claude mcp list` shows `✗ Failed to connect` — but only when your current directory is the inspectrum repo itself.** `npx inspectrum@<version>` resolves the spec against the *local* package when cwd is inside a package named `inspectrum` whose version matches, and a package's own bin is never self-linked into its `node_modules/.bin`. The published package is fine. Fixes: run from any other directory, or install the real binary once and register that instead:

```bash
npm install -g inspectrum
claude mcp add --transport stdio --scope user inspectrum -- inspectrum
```

**Gate feels slow?** Set `effort = "medium"` in `[reviewers.codex]` (see Tuning). **Something else?** `npx -y inspectrum@latest doctor` diagnoses install, login, and model resolution in one shot — [open an issue](https://github.com/yannmenec/inspectrum/issues) with its output.

---

<div align="center">

**If inspectrum caught a bad plan for you, [star the repo ⭐](https://github.com/yannmenec/inspectrum) — it's how other agent-wranglers find it.**

MIT — [Yann Menec](https://github.com/yannmenec). Contributions welcome: [CONTRIBUTING.md](CONTRIBUTING.md).

</div>
