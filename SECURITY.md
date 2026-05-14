# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | ✅ active          |
| < 0.1   | ❌ not maintained  |

## Reporting a vulnerability

Please **do not** open public GitHub issues for security reports.

Report privately via GitHub Security Advisory:
**https://github.com/yannmenec/inspectrum/security/advisories/new**

You'll receive an acknowledgement within 5 business days. After triage,
we'll work with you on a fix and a coordinated disclosure timeline.

## In scope

Reports that materially affect users of `inspectrum` itself:

- Subprocess argv injection or shell-escape in the reviewer CLI wrappers
  (`src/reviewers/`).
- Path traversal in MCP resource handlers (`inspectrum://sessions/...`).
- Secret-leak risks introduced by inspectrum's own code (e.g. unintended
  logging of API keys, world-readable session files, etc.).
- Unsafe handling of `plan` / `context` input that could trigger arbitrary
  file read/write outside `~/.inspectrum/`.

## Out of scope

- Vulnerabilities in upstream reviewer CLIs themselves (Claude Code, Codex,
  Gemini, Kimi, Qwen, Ollama). Please report those to their respective
  maintainers.
- Issues that require an attacker to already have local code execution as
  the user running inspectrum.
- Bugs in third-party MCP hosts (Claude Code Desktop, Cursor, etc.).
- Network-level attacks against `openrouter.ai` or any other upstream
  provider — those are the provider's responsibility.
- Anything in `_decisions/`, `AGENTS.md`, or test fixtures (these are not
  shipped in the npm tarball).

## Disclosure

Once a fix is released, the advisory will be made public on the same
GitHub Security Advisory page. Credit to reporters is given by default
unless you ask otherwise.
