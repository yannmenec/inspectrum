#!/bin/sh
# Claude Code PreToolUse(ExitPlanMode) hook -> `inspectrum plan-gate`.
#
# Run only the exact package version paired with this plugin. Never trust a
# global binary or a mutable npm tag on the ExitPlanMode critical path.

fail_open() {
  printf '%s' '{"systemMessage":"inspectrum plan-gate skipped: pinned reviewer unavailable or incompatible. Plan proceeds unreviewed."}'
  exit 0
}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || fail_open
PLUGIN_ROOT=$(dirname -- "$SCRIPT_DIR")

[ -n "${HOME:-}" ] && [ -d "$HOME" ] || fail_open
command -v node >/dev/null 2>&1 || fail_open
command -v npx >/dev/null 2>&1 || fail_open

VERSION=$(node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (typeof pkg.version !== "string" || !pkg.version) process.exit(1);
  process.stdout.write(pkg.version);
' "$PLUGIN_ROOT/package.json" 2>/dev/null) || fail_open

case "$VERSION" in
  *[!0-9A-Za-z.+-]*|'') fail_open ;;
esac

run_pinned() {
  node -e '
    const { spawnSync } = require("child_process");
    const [home, version, ...args] = process.argv.slice(1);
    const ceiling = args[0] === "--version" ? 30000 : 550000;
    const requested = Number(process.env.INSPECTRUM_NPX_TIMEOUT_MS);
    const timeout = Number.isFinite(requested) && requested > 0
      ? Math.min(requested, ceiling)
      : ceiling;
    const result = spawnSync("npx", ["-y", `inspectrum@${version}`, ...args], {
      cwd: home,
      env: {
        ...process.env,
        npm_config_fetch_retries: "0",
        npm_config_fetch_timeout: "15000",
        npm_config_fetch_retry_mintimeout: "1000",
      },
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
      timeout,
      maxBuffer: 64 * 1024,
    });
    if (result.error || result.status !== 0) process.exit(1);
    process.stdout.write(result.stdout ?? "");
  ' "$HOME" "$VERSION" "$@"
}

RESOLVED_VERSION=$(run_pinned --version 2>/dev/null) || fail_open
[ "$RESOLVED_VERSION" = "$VERSION" ] || fail_open

OUTPUT=$(run_pinned plan-gate 2>/dev/null) || fail_open
[ -n "$OUTPUT" ] || exit 0

printf '%s' "$OUTPUT" | node -e '
  const fs = require("fs");
  const value = JSON.parse(fs.readFileSync(0, "utf8"));
  if (value === null || Array.isArray(value) || typeof value !== "object") process.exit(1);
' >/dev/null 2>&1 || fail_open

printf '%s' "$OUTPUT"
exit 0
