---
name: review-plan-with-claude
description: Review a development plan produced in Codex with Claude through Inspectrum. Use when the user asks for a Claude second opinion, wants Claude to review a plan, or requests a cross-model plan check from Codex.
---

# Review a Codex plan with Claude

Use the most recent complete development plan visible in the conversation. If
there is no complete plan, ask the user for it instead of inventing missing
steps.

Call only `mcp__inspectrum__review_plan`, once, with:

```yaml
plan: <the full plan in Markdown>
reviewers: ["claude"]
focus: all
judge: false
```

Keep an explicitly requested focus (`correctness`, `completeness`, `risk`, or
`clarity`) instead of `all`. Do not add another reviewer, invoke a judge, call a
second tool, or substitute Codex's own analysis for Claude's review.

## Successful result

Treat the review as successful only when the tool response does not have
`isError: true` and includes `structuredContent` with `verdict` and
`report_markdown`.

Render `report_markdown`, identify the verdict as Claude's review, and include
the session path. If a `revised_plan` is present, offer it to the user without
executing it or silently replacing the original plan.

## Claude or tool unavailable

If the call fails, returns `isError: true`, or has no valid
`structuredContent`, say:

> The Claude review did not complete.

Show the concise, non-sensitive error text when available. Suggest checking
`claude --version`, completing Claude's interactive authentication, and then
retrying the review. Never present this failure as `approve`, as a successful
review, or as an opinion actually produced by Claude.
