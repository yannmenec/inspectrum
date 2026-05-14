## Summary

What changed and why. 1–3 bullets is plenty.

## Test plan

- [ ] `npx tsc --noEmit` — clean
- [ ] `npx eslint src/` — clean
- [ ] `npm test` — green
- [ ] `npm run test:coverage` — ≥ 90/90/90 on the gated scopes
- [ ] `npm run test:e2e` — green (if your change touches the MCP server or
  resource handlers)
- [ ] Manually walked through any new user-facing flow (slash command,
  doctor output, etc.)

## Breaking changes

If anything in the public surface changed (MCP tool I/O, config schema, CLI
flags, exported types), note it here. Otherwise: "None".

## Notes for reviewer

Anything else worth flagging.
