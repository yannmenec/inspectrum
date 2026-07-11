#!/bin/sh
# Claude Code PreToolUse(ExitPlanMode) hook -> `inspectrum plan-gate`.
#
# Prefer an installed binary; otherwise run npx from $HOME. Hooks run with
# cwd = the current project, and `npx inspectrum@<spec>` executed inside a
# checkout of inspectrum itself resolves the spec against the local package,
# whose own bin is never self-linked (see README > Troubleshooting).
if command -v inspectrum >/dev/null 2>&1; then
  exec inspectrum plan-gate
fi
cd "${HOME}" && exec npx -y inspectrum@latest plan-gate
