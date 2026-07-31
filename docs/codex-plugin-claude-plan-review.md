# Codex plugin: review a plan with Claude

This repository contains a Codex plugin named `inspectrum`. It adds one
workflow: send the current Codex development plan to Claude through
Inspectrum's existing `review_plan` MCP tool.

The plugin does not add a tool or change the server architecture. Its bundled
MCP configuration starts the public package with:

```text
npx -y inspectrum@0.2.2
```

The package selector must match `package.json`; the contract test fails if the
two versions drift. Codex allows the MCP call 330 seconds: Inspectrum's default
reviewer limit is 300 seconds, leaving 30 seconds for aggregation, session
writing, and result delivery. The MCP server startup has a separate timeout.

## Public installation

Version `0.2.2` is public on npm and GitHub. Verify the exact package:

```bash
npm view inspectrum@0.2.2 version
npx -y inspectrum@0.2.2 doctor
```

Both commands must resolve `0.2.2`. If an older manual MCP registration already
uses the name `inspectrum`, remove it before installing the plugin; otherwise
the duplicate name can hide the plugin's bundled server:

```bash
codex mcp remove inspectrum
codex plugin marketplace add yannmenec/inspectrum --ref main
codex plugin add inspectrum@inspectrum
```

Restart Codex and use a new task so the skill and MCP server are loaded. Ask:

```text
Review this plan with Claude using Inspectrum.
```

On the first call, Codex asks whether the `inspectrum` MCP server may run
`review_plan`. Choose **Allow for this session** to continue without granting a
permanent permission. This interactive authorization is expected; a first call
from non-interactive `codex exec` can be cancelled because nobody can answer
the prompt.

The public end-to-end smoke test completed successfully on 0.2.2: Codex invoked
`review_plan`, Claude returned a structured `revise` verdict in 46.3 seconds,
and Inspectrum wrote the local session. The user remained in control of the
review and no repository file was changed by the smoke task.

## Validation

Validate repository changes with:

```bash
npm ci
npm run build
npx tsc --noEmit
npx eslint src/
npm run test:coverage
npm test -- tests/contract/codex-plugin.contract.test.ts
```

The targeted contract validates the Codex manifest, marketplace entry, pinned
MCP package, reviewer direction, activation guidance, and failure semantics.

## Failure and privacy

The skill always calls `review_plan` with `reviewers: ["claude"]` and
`judge: false`. If Claude is missing, unauthenticated, or fails, the MCP result
is an error with no successful structured review. The skill reports that the
Claude review did not complete; it must not turn that failure into an approval.

The full plan is sent to Claude. Successful reviews are stored as plaintext
under `~/.inspectrum/sessions/`. Remove secrets from the plan before requesting
a review.
