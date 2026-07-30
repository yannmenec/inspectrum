# Codex plugin: review a plan with Claude

This repository contains a Codex plugin named `inspectrum`. It adds one
workflow: send the current Codex development plan to Claude through
Inspectrum's existing `review_plan` MCP tool.

The plugin does not add a tool or change the server architecture. Its bundled
MCP configuration starts the candidate package with:

```text
npx -y inspectrum@0.2.2
```

The package selector must match `package.json`; the contract test fails if the
two versions drift.

## Public installation

The public installation smoke test is currently **blocked**. npm and the public
GitHub release still expose `0.2.1`, while this plugin belongs to the `0.2.2`
candidate. Do not install the older public package as a silent fallback.

After `0.2.2` is published to npm and this marketplace is merged into `main`,
verify the exact package first:

```bash
npm view inspectrum@0.2.2 version
npx -y inspectrum@0.2.2 doctor
```

Both commands must resolve `0.2.2`. Then install the repository marketplace
and plugin:

```bash
codex plugin marketplace add yannmenec/inspectrum --ref main
codex plugin add inspectrum@inspectrum
```

Restart Codex and use a new task so the skill and MCP server are loaded. Ask:

```text
Review this plan with Claude using Inspectrum.
```

## Validation before publication

Before the npm package exists, validate the local candidate rather than
claiming a public end-to-end success:

```bash
npm ci
npm run build
npx tsc --noEmit
npx eslint src/
npm test
npm run test:coverage
python3 /path/to/plugin-creator/scripts/validate_plugin.py \
  plugins/inspectrum
```

The repository build and tests run the local `0.2.2` source. The committed
plugin launcher itself cannot complete its public npm smoke test until
`inspectrum@0.2.2` is published.

## Failure and privacy

The skill always calls `review_plan` with `reviewers: ["claude"]` and
`judge: false`. If Claude is missing, unauthenticated, or fails, the MCP result
is an error with no successful structured review. The skill reports that the
Claude review did not complete; it must not turn that failure into an approval.

The full plan is sent to Claude. Successful reviews are stored as plaintext
under `~/.inspectrum/sessions/`. Remove secrets from the plan before requesting
a review.
