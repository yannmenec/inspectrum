# Privacy and data flow

Inspectrum runs locally. It has no hosted Inspectrum service and no first-party telemetry. It does, however, send plan content to the reviewer CLIs or HTTP endpoints you configure and writes plaintext evidence to your filesystem.

This document describes Inspectrum `0.2.3`. Provider and CLI behavior can change independently.

## Data you provide

The `review_plan` tool accepts:

- the full plan, up to 16,000 characters;
- optional codebase context, up to 8,000 characters;
- reviewer IDs, focus and judge settings.

Do not include passwords, tokens, private keys, personal data or other secrets. Truncation limits reduce size; they do not redact content.

## Where the data goes

Every active reviewer receives the plan and optional context in its prompt. If at least two reviewers succeed and `judge=true`, the configured judge receives the plan plus those reviewer outputs.

| Adapter | Destination and control boundary |
|---|---|
| Codex CLI | The locally installed Codex CLI and the OpenAI account or API configuration behind it. See [OpenAI's privacy policy](https://openai.com/policies/privacy-policy/). |
| Claude CLI | The locally installed Claude CLI and the Anthropic account or API configuration behind it. See [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy). |
| Gemini CLI | The locally installed Gemini CLI and the Google account or API configuration behind it. See [Google's privacy policy](https://policies.google.com/privacy). |
| OpenRouter HTTP | The endpoint and credentials in your Inspectrum configuration. See [OpenRouter's privacy policy](https://openrouter.ai/privacy). |
| Ollama HTTP | The endpoint in your configuration. It is local only when that endpoint and its model are operated locally; Inspectrum does not prove zero egress. |
| Experimental Kimi/Qwen CLI adapters | Routing, retention and credentials depend on the binary and configuration you install. Inspect that software before use; Inspectrum does not assert a fixed provider route. |

Provider terms, training controls, retention, regional processing, quotas and billing are outside Inspectrum's control.

## Local processes and permissions

Reviewer CLIs run as child processes under your user account and inherit the process environment. They can therefore see environment variables made available to them. Their filesystem and network capabilities depend on the CLI, account and local configuration.

For Codex reviews, Inspectrum enforces `codex exec --ephemeral --skip-git-repo-check -s read-only` in a temporary working directory and strips sandbox-weakening, cwd-override and output-path flags supplied through reviewer arguments. This limits project writes by that invocation; it does not make the provider call local or prevent Inspectrum from writing its own evidence.

Claude, Gemini and experimental CLI adapters do not receive the same Codex-specific sandbox enforcement. Review their permissions separately.

## Files written locally

Successful reviews create a directory under:

```text
~/.inspectrum/sessions/<timestamp>__<session-id>/
```

It can contain the original plan, report, structured session metadata, one file per successful reviewer, an optional judge output and an optional revised plan. The MCP response also returns the local session path.

The Claude Code gate stores plan hashes, denial counters and cached denial reasons under `~/.inspectrum/state/`. It does not use those files as product telemetry.

On POSIX systems, Inspectrum creates and repairs session/state directories to mode `0700`, and gate state files are written with mode `0600`. The content is still plaintext, not encrypted. File modes, backups, sync tools, copied files and non-POSIX platforms can change who can read it. Treat `~/.inspectrum/` as sensitive local data.

Inspectrum applies no automatic retention period. Delete individual session directories or the entire local history with your operating system's file manager when you no longer need them. A provider may retain its own copy under its separate policy.

## Network behavior

Inspectrum itself has no analytics or update beacon. Network traffic occurs when a configured cloud reviewer CLI or HTTP adapter performs a review. `doctor` may invoke installed CLI status/version commands but does not send plan content.

## User controls

- Disable the automatic gate with `[plan_gate] enabled = false` in `~/.inspectrum/config.toml` or disable the plugin.
- Choose only reviewers and endpoints whose policies fit the plan's sensitivity.
- Use synthetic or redacted context when full repository context is unnecessary.
- Keep the human approval step; reviewer output can be inaccurate or manipulated by untrusted plan text.

## Support and security

Use [GitHub Issues](https://github.com/yannmenec/inspectrum/issues) for non-sensitive support. Follow the repository [security policy](https://github.com/yannmenec/inspectrum/blob/main/SECURITY.md) for private vulnerability reporting. Never attach credentials or an unredacted private plan.
