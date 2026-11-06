#!/usr/bin/env bash
# E2E wrapper: tee output, and on failure emit ::error:: annotations for the failing checks.
set -o pipefail
LOG="${TMPDIR:-/tmp}/woodex-e2e.log"
node e2e/smoke.mjs 2>&1 | tee "$LOG"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  node e2e/annotate.mjs "$LOG" || true
fi
exit "$code"
