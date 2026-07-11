---
description: Review the current plan with peer LLMs via inspectrum
allowed-tools: ["mcp__inspectrum__review_plan"]
argument-hint: "[reviewers]"
---
Take the plan you just produced (the most recent ExitPlanMode argument, or
the visible plan in this conversation) and call
`mcp__inspectrum__review_plan` with:

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

Also recognize the natural-language trigger when the user types something
like *"review this plan with inspectrum"* (with or without a reviewer
list). Treat that as the same invocation as the slash command.

Prefer the inspectrum plugin for automatic plan-mode review (hook +
`/inspectrum:review`):
`claude plugin marketplace add yannmenec/inspectrum && claude plugin install inspectrum@inspectrum`

---

### Auto-run snippet (optional)

Paste into your project's `CLAUDE.md` to call `review_plan` on every plan
without asking:

```
Before finalizing any plan (Plan Mode or otherwise), call the
`review_plan` MCP tool (inspectrum) with reviewers of your choice.
Skip this step only if the user explicitly says "no review".
```
