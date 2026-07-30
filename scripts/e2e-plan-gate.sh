#!/usr/bin/env bash
# End-to-end harness for the ExitPlanMode plan gate.
#
# Drives a REAL headless Claude Code session (cheap model, plan mode) with the
# plan-gate hook injected via --settings, and a stub `codex` on PATH that
# denies the first review (one major finding) and approves the second. Proves
# the full loop: plan -> gate deny -> Claude revises -> gate approve.
#
#   bash scripts/e2e-plan-gate.sh            # stub codex (default)
#   INSPECTRUM_E2E_CODEX=1 bash scripts/...  # real codex CLI (needs login)
#   INSPECTRUM_E2E_KEEP=1 bash scripts/...   # keep proof artifacts on success
#
# Uses your real Claude Code auth/config; only the hook comes from --settings.
# Gate state/sessions land in ~/.inspectrum/ keyed by the fresh session id.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
E2E_DIR="$(mktemp -d "${TMPDIR:-/tmp}/inspectrum-e2e.XXXXXX")"
CALLS_DIR="$E2E_DIR/calls"
PROOF_MARKER="$E2E_DIR/review-start.marker"
RUN_TOKEN="inspectrum-e2e-$(date +%s)-$$"
FAILED=1

cleanup() {
  if [ "$FAILED" -eq 0 ]; then
    if [ -n "${INSPECTRUM_E2E_KEEP:-}" ]; then
      echo "e2e artifacts kept at: $E2E_DIR"
    else
      rm -rf "$E2E_DIR"
    fi
  else
    echo "e2e artifacts kept for inspection: $E2E_DIR" >&2
  fi
}
trap cleanup EXIT

mkdir -p "$CALLS_DIR" "$E2E_DIR/bin" "$E2E_DIR/project"

echo "==> preflight: headless claude auth"
if ! claude -p "Reply with exactly: OK" --model haiku > "$E2E_DIR/preflight.json" 2>&1; then
  echo "SKIP: headless 'claude -p' cannot authenticate on this machine (see $E2E_DIR/preflight.json)." >&2
  echo "Run this harness from a terminal where 'claude -p' works (claude setup-token)." >&2
  FAILED=1
  exit 2
fi

echo "==> building dist/"
(cd "$REPO_DIR" && npm run build --silent)

echo "==> writing hook settings"
cat > "$E2E_DIR/settings.json" <<EOF
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          { "type": "command", "command": "node $REPO_DIR/dist/cli.js plan-gate", "timeout": 600 }
        ]
      }
    ]
  }
}
EOF

if [ -z "${INSPECTRUM_E2E_CODEX:-}" ]; then
  echo "==> installing stub codex (deny once, then approve)"
  cat > "$E2E_DIR/bin/codex" <<EOF
#!/usr/bin/env bash
set -euo pipefail
CALLS_DIR="$CALLS_DIR"
n=\$(find "\$CALLS_DIR" -name 'call-*.args' | wc -l | tr -d ' ')
n=\$((n + 1))
printf '%s\n' "\$@" > "\$CALLS_DIR/call-\$n.args"
cat > "\$CALLS_DIR/call-\$n.stdin" || true
out=""
prev=""
for a in "\$@"; do
  if [ "\$prev" = "--output-last-message" ]; then out="\$a"; fi
  prev="\$a"
done
if [ -z "\$out" ]; then echo "stub codex: no --output-last-message" >&2; exit 1; fi
if [ "\$n" -eq 1 ]; then
  cat > "\$out" <<'JSON'
{"verdict":"revise","findings":[{"severity":"major","category":"completeness","reviewer":"codex","message":"Plan lacks a test step for hello().","suggested_fix":"Add a unit test asserting hello() returns 'hello'."}],"revised_plan":null,"summary":"Needs a test step."}
JSON
else
  cat > "\$out" <<'JSON'
{"verdict":"approve","findings":[],"revised_plan":null,"summary":"Plan is sound."}
JSON
fi
EOF
  chmod 755 "$E2E_DIR/bin/codex"
  export PATH="$E2E_DIR/bin:$PATH"
else
  echo "==> INSPECTRUM_E2E_CODEX=1: using the real codex CLI"
  echo "==> validating the configured codex reviewer backend"
  CODEX_REVIEWERS_FILE="$E2E_DIR/codex-reviewer-ids.txt"
  if ! node --input-type=module - "$REPO_DIR" > "$CODEX_REVIEWERS_FILE" <<'NODE'
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const { loadConfig } = await import(pathToFileURL(`${root}/dist/config.js`));
const { resolveReviewerBackend } = await import(
  pathToFileURL(`${root}/dist/reviewers/common.js`)
);
const { findConfiguredCodexReviewerIds } = await import(
  pathToFileURL(`${root}/scripts/e2e-gate-proof.mjs`)
);
const config = loadConfig();
const reviewerIds = findConfiguredCodexReviewerIds(
  config,
  resolveReviewerBackend,
);
if (reviewerIds.length === 0) process.exit(1);
process.stdout.write(`${reviewerIds.join("\n")}\n`);
NODE
  then
    echo "ASSERTION FAILED: real mode requires a codex reviewer backed by the codex binary" >&2
    exit 1
  fi
  command -v codex > "$E2E_DIR/codex-path.txt"
  codex --version > "$E2E_DIR/codex-version.txt"
fi

echo "==> scaffolding scratch project"
echo "// scratch" > "$E2E_DIR/project/util.js"

PROMPT="Produce a short implementation plan (under 15 lines) to add a hello() \
function returning the string 'hello' to util.js. When the plan is ready, \
include the exact marker '$RUN_TOKEN' in its heading and finish planning. \
If plan review feedback arrives, address it and finish again."

echo "==> running headless Claude Code (plan mode, haiku)"
touch "$PROOF_MARKER"
set +e
(cd "$E2E_DIR/project" && claude -p "$PROMPT" \
  --settings "$E2E_DIR/settings.json" \
  --permission-mode plan \
  --model haiku \
  --max-turns 12 \
  --output-format json > "$E2E_DIR/claude-result.json" 2> "$E2E_DIR/claude-stderr.log")
CLAUDE_EXIT=$?
set -e

echo "==> asserting"
fail() { echo "ASSERTION FAILED: $1" >&2; exit 1; }

[ "$CLAUDE_EXIT" -eq 0 ] || fail "claude exited $CLAUDE_EXIT (see $E2E_DIR/claude-stderr.log)"

if [ -z "${INSPECTRUM_E2E_CODEX:-}" ]; then
  CALLS=$(find "$CALLS_DIR" -name 'call-*.args' | wc -l | tr -d ' ')
  [ "$CALLS" -eq 2 ] || fail "expected exactly 2 codex reviews (deny then approve), saw $CALLS"
  grep -q "PLAN TO REVIEW:" "$CALLS_DIR/call-1.stdin" || fail "review stdin missing PLAN TO REVIEW"
  grep -q -- "--output-schema" "$CALLS_DIR/call-1.args" || fail "codex argv missing --output-schema"
  grep -q "read-only" "$CALLS_DIR/call-1.args" || fail "codex argv missing read-only sandbox"
  ! diff -q "$CALLS_DIR/call-1.stdin" "$CALLS_DIR/call-2.stdin" >/dev/null || fail "revised plan was not re-sent after feedback"

  SESSION_ID=$(node -e 'const result = require(process.argv[1]); if (typeof result.session_id !== "string") process.exit(1); process.stdout.write(result.session_id)' "$E2E_DIR/claude-result.json") || fail "claude result missing session_id"
  STATE_FILE="${HOME}/.inspectrum/state/plan-gate-${SESSION_ID}.json"
  [ -f "$STATE_FILE" ] || fail "plan-gate state file missing: $STATE_FILE"
  node -e '
const state = require(process.argv[1]);
if (!Array.isArray(state.approved_hashes) || state.approved_hashes.length === 0) process.exit(1);
if (!Number.isInteger(state.rounds_used) || state.rounds_used !== 0) process.exit(1);
if (!Array.isArray(state.denied) || state.denied.length === 0) process.exit(1);
' "$STATE_FILE" || fail "plan-gate state does not record the deny/approve loop"
else
  SESSIONS_DIR="${HOME}/.inspectrum/sessions"
  REAL_PROOFS_FILE="$E2E_DIR/real-codex-proofs.txt"
  node "$REPO_DIR/scripts/e2e-gate-proof.mjs" \
    "$SESSIONS_DIR" "$PROOF_MARKER" "$RUN_TOKEN" "$CODEX_REVIEWERS_FILE" \
    > "$REAL_PROOFS_FILE" \
    || fail "unable to inspect real Codex review sessions"
  REAL_CODEX_PROOFS=$(wc -l < "$REAL_PROOFS_FILE" | tr -d ' ')
  [ "$REAL_CODEX_PROOFS" -gt 0 ] || fail \
    "real Codex produced no attributable review session; the gate may only have failed open"
fi

grep -q '"result"' "$E2E_DIR/claude-result.json" || fail "claude produced no result JSON"

FAILED=0
if [ -z "${INSPECTRUM_E2E_CODEX:-}" ]; then
  echo "==> e2e plan-gate: PASS (bounce + approve loop verified)"
else
  echo "==> e2e plan-gate: PASS (real Codex review session verified: $REAL_CODEX_PROOFS)"
fi
