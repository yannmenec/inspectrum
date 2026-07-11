---
description: Review the current plan with peer LLMs via inspectrum
allowed-tools: ["mcp__inspectrum__review_plan"]
argument-hint: "[reviewers]"
---
Take the plan under discussion (the most recent ExitPlanMode argument, the
current plan file, or the visible plan in this conversation) and call the
`review_plan` MCP tool (inspectrum) with:

- `plan`: the full plan markdown
- `reviewers`: if `$ARGUMENTS` is non-empty, split on commas, trim each item,
  and pass as a string array (e.g. `codex,gemini` → `["codex","gemini"]`);
  otherwise omit the field to use the user's `~/.inspectrum/config.toml`
  defaults
- `judge`: `true`

The tool returns `structuredContent` with the typed result (verdict,
report_markdown, findings, optional revised_plan, session_id, session_path).
Render `report_markdown` verbatim. If `verdict === "revise"` and
`revised_plan` is non-empty, ask: *"Apply the revised plan?"*.

If the tool is not available, tell the user to register the MCP server:
`claude mcp add --transport stdio --scope user inspectrum -- npx -y inspectrum@latest`

Also recognize the natural-language trigger when the user types something
like *"review this plan with inspectrum"* (with or without a reviewer
list). Treat that as the same invocation as the slash command.
