# inspectrum

> inspect the full spectrum — multi-LLM plan review, one MCP tool.

Stop copy-pasting plans between Claude, Codex, and Gemini.
`inspectrum` is a single MCP server that sends your plan to all of them in parallel,
runs a judge agent to consolidate the findings, and returns one verdict.

- **One tool, any host** — works from Claude Code, Codex Desktop, Cursor, Cline, VS Code Copilot, and any MCP client.
- **Judge agent by default** — when ≥ 2 reviewers run, a third LLM deduplicates findings and escalates severity, so you see signal, not noise.
- **Flat-file session log** — every review is persisted to `~/.inspectrum/sessions/` as readable Markdown. Grep it, diff it, share it.

---

## Install (< 2 min)

> **Pre-publish note:** `inspectrum` is not yet on npm (ships at v0.1.0, J7).
> All configs below use a local build. Run `npm run build` in this repo first,
> then replace `/absolute/path/to/inspectrum` with the actual path.
> After publication, swap `command/args` for `"command": "npx", "args": ["-y", "inspectrum@latest"]`.

### Claude Code Desktop

1. Build: `npm run build` in this repo.

2. Copy [`examples/claude-code/mcp.json`](examples/claude-code/mcp.json) as **`.mcp.json`**
   at your project root (Claude Code 2.1 reads `.mcp.json`, not `~/.claude/mcp.json`).
   Edit the `args` path to match your local clone.

   Alternative — register globally via CLI:
   ```bash
   claude mcp add-json --scope user inspectrum \
     '{"type":"stdio","command":"node","args":["/absolute/path/to/inspectrum/dist/server.js"]}'
   ```

3. Copy [`examples/claude-code/.claude/commands/review-plan.md`](examples/claude-code/.claude/commands/review-plan.md)
   to `.claude/commands/review-plan.md` in your project root.
   This installs the `/review-plan` slash command.

4. Reload the Claude Code window. The `review_plan` tool appears under **MCP > inspectrum**.

### Codex Desktop

1. Build: `npm run build` in this repo.

2. Add to `~/.codex/config.toml` (global — the only path read by Codex 0.130+):

   ```toml
   [mcp_servers.inspectrum]
   command = "node"
   args    = ["/absolute/path/to/inspectrum/dist/server.js"]
   ```

   Alternative via CLI (no file edit):
   ```bash
   codex mcp add inspectrum -- node /absolute/path/to/inspectrum/dist/server.js
   ```

3. Restart Codex Desktop. In the chat, ask Codex to call `review_plan` with your plan text.

### Cursor (v1.6+)

1. Build: `npm run build` in this repo.

2. Copy [`examples/cursor/.cursor/mcp.json`](examples/cursor/.cursor/mcp.json) to
   `.cursor/mcp.json` at your project root (project scope) or `~/.cursor/mcp.json`
   (global scope). Edit the `args` path.

   ```json
   {
     "mcpServers": {
       "inspectrum": {
         "type": "stdio",
         "command": "node",
         "args": ["/absolute/path/to/inspectrum/dist/server.js"]
       }
     }
   }
   ```

3. Reload the Cursor window. Type `@inspectrum` in the chat to autocomplete `review_plan`.

---

## Usage

### Claude Code — slash command

In Plan Mode (Shift+Tab × 2), after Claude produces a plan:

```
/review-plan codex,gemini
```

inspectrum calls Codex and Gemini in parallel, runs Claude as judge, and renders the report:

```
# inspectrum Review — session a3f1

**Verdict: REVISE**  •  Reviewers: codex, gemini  •  Judge: claude  •  18.4s

## Blockers (1)
- **[codex+gemini]** No retry/fallback if Redis is down — endpoint will 500.
  Fix: wrap with try/catch, fail-open with in-memory LRU after N failures.

## Majors (2)
- **[codex]** Missing 429 response body shape (clients expect {retryAfter, limit}).
- **[gemini]** X-Forwarded-For trust: must call app.set('trust proxy', …).

## Minors (1)
- **[codex]** Test path inconsistent with repo convention (__tests__/ vs tests/).
```

If verdict is `revise`, Claude asks: *"Apply the revised plan?"*

### Any host — direct MCP call

Call `review_plan` with:

| Parameter   | Type     | Default          | Description |
|-------------|----------|------------------|-------------|
| `plan`      | string   | — (required)     | Plan to review, in Markdown. Max 16 000 chars. |
| `reviewers` | string[] | config defaults  | Reviewer IDs, e.g. `["codex", "gemini"]`. |
| `focus`     | string   | `"all"`          | `correctness` \| `completeness` \| `risk` \| `clarity` \| `all` |
| `judge`     | boolean  | `true`           | Run judge agent when ≥ 2 reviewers. |
| `context`   | string   | —                | Optional codebase excerpts. Max 8 000 chars. |

Returns `verdict` (`approve` / `revise` / `reject`), `report_markdown`, `findings[]`,
optional `revised_plan`, `session_id`, `session_path`.

---

## Configuration

Create `~/.inspectrum/config.toml` to override defaults:

```toml
[defaults]
reviewers = ["codex", "gemini"]   # called in parallel
judge     = "claude"              # consolidates when >= 2 reviewers
focus     = "all"

[reviewers.claude]
type   = "cli"
binary = "claude"
args   = ["-p", "--output-format", "json", "--no-session-persistence"]

[reviewers.codex]
type   = "cli"
binary = "codex"
args   = ["exec", "--ephemeral", "-m", "gpt-5"]

[reviewers.gemini]
type   = "cli"
binary = "gemini"
args   = ["-m", "gemini-2.5-pro"]

[limits]
plan_max_chars   = 16000
report_max_chars = 8000
timeout_seconds  = 60
```

Without a config file, `reviewers = ["claude"]` and `judge = "claude"` are used.

**Auth:**
- Claude — OAuth keychain (macOS). Run inspectrum from an authenticated terminal.
- Codex — ChatGPT account or `OPENAI_API_KEY`. Run `codex login` first.
- Gemini — `GEMINI_API_KEY` environment variable.

---

## Session logs

Every review is written to `~/.inspectrum/sessions/<timestamp>__<id>/`:

```
~/.inspectrum/sessions/2026-05-05T14-22-09__a3f1/
├── plan-input.md      # the plan as submitted
├── report.md          # consolidated findings
├── session.json       # metadata (verdict, counts, duration)
├── review-claude.md   # raw output per reviewer
├── review-codex.md
├── review-gemini.md
├── judge.md           # judge consolidation (if judge ran)
└── revised-plan.md    # rewritten plan (if verdict=revise)
```

Sessions are exposed as MCP resources (`inspectrum://sessions/{id}/{file}`) — any MCP host
can read them directly.

---

## Requirements

- Node.js ≥ 20
- At least one reviewer CLI installed and authenticated:
  - `claude` ≥ 2.1 (`npm install -g @anthropic-ai/claude-code`)
  - `codex` ≥ 0.128 (Codex Desktop App, symlinked to `/opt/homebrew/bin/codex`)
  - `gemini` ≥ 0.41 (`npm install -g @google/gemini-cli`)

---

## License

MIT — [Yann Menec](https://github.com/yannmenec)
