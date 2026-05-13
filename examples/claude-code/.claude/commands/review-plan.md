---
description: Review the current plan with peer LLMs via inspectrum
allowed-tools: ["mcp__inspectrum__review_plan"]
argument-hint: "[reviewers]"
---
Take the plan you just produced (the most recent ExitPlanMode argument or the
visible plan in this conversation) and call `mcp__inspectrum__review_plan` with:
- plan: <the full plan markdown>
- reviewers: if "$ARGUMENTS" is non-empty, split on commas, trim each item, and
  pass as a string array (e.g. "codex,gemini" → ["codex","gemini"]); otherwise
  omit the field to use config defaults.
- judge: true

Then render the returned `report_markdown` verbatim. If verdict is "revise" and
`revised_plan` is non-empty, ask the user: "Apply the revised plan?".
