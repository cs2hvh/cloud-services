#!/usr/bin/env bash
# One-command local bring-up for the agentcore stack.
#
#   ./dev-up.sh
#
# Ensures Redis is up, starts the worker (:8787) and Next (:3000) in the
# background (logs in $TMPDIR/ahura-dev-logs), waits for them, then runs the
# agent-runner in the FOREGROUND. Ctrl-C stops only the runner; the worker/Next
# keep running so a re-run is instant. Idempotent — anything already up is reused.
#
# The runner itself still gets its env/secrets from ./.run-local.sh (gitignored).
set -uo pipefail

RUNNER_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$RUNNER_DIR/../.." && pwd)"
LOGDIR="${TMPDIR:-/tmp}/ahura-dev-logs"; mkdir -p "$LOGDIR"

up()       { nc -z localhost "$1" >/dev/null 2>&1; }
wait_for() { for _ in $(seq 1 40); do up "$1" && return 0; sleep 1; done; return 1; }

# ── 1. Redis (:6379) ──────────────────────────────────────────────────────────
if up 6379; then
  echo "✓ Redis :6379 already up"
else
  echo "→ starting Redis…"
  if command -v redis-server >/dev/null 2>&1; then
    redis-server --daemonize yes >/dev/null 2>&1
  elif docker info >/dev/null 2>&1; then
    docker start agent-test-redis >/dev/null 2>&1 \
      || docker run -d --name agent-test-redis -p 6379:6379 redis:7-alpine >/dev/null
  else
    echo "✗ No Redis and no way to start one."
    echo "  Install a local Redis:  brew install redis  (then re-run)"
    echo "  …or start OrbStack so Docker can run one."
    exit 1
  fi
  wait_for 6379 && echo "  ✓ Redis up" || { echo "✗ Redis didn't come up"; exit 1; }
fi

# ── 2. Worker gateway (:8787) — model turns + embeddings ──────────────────────
if up 8787; then
  echo "✓ Worker :8787 already up"
else
  echo "→ starting worker (:8787)  ·  log: $LOGDIR/worker.log"
  ( cd "$ROOT/workers/inference" && nohup npm run dev >"$LOGDIR/worker.log" 2>&1 & )
  wait_for 8787 && echo "  ✓ worker up" || echo "  ⚠ worker slow to bind — see $LOGDIR/worker.log"
fi

# ── 3. Next control-plane + UI (:3000) ────────────────────────────────────────
if up 3000; then
  echo "✓ Next :3000 already up"
else
  echo "→ starting Next (:3000)  ·  log: $LOGDIR/next.log"
  ( cd "$ROOT" && nohup npm run dev >"$LOGDIR/next.log" 2>&1 & )
  wait_for 3000 && echo "  ✓ Next up" || echo "  ⚠ Next slow to bind — see $LOGDIR/next.log"
fi

# ── 4. Agent-runner (foreground) ──────────────────────────────────────────────
# Guard against a second runner: it binds the same HEALTH_PORT (8090, set in
# .run-local.sh) as any already-running instance, so starting one blindly
# crashes both with EADDRINUSE. Detect it the same idempotent way as 1–3.
HEALTH_PORT="${HEALTH_PORT:-8090}"
if up "$HEALTH_PORT"; then
  echo "✓ agent-runner already up (health :$HEALTH_PORT) — not starting a second one"
  echo ""
  echo "Stack ready. Open  http://localhost:3000/dashboard/services/agents"
  exit 0
fi

echo ""
echo "Stack ready. Open  http://localhost:3000/dashboard/services/agents"
echo "Starting agent-runner (Ctrl-C stops the runner; worker/Next keep running)…"
echo "Tip: for the code interpreter, run with  SANDBOX_ENABLED=true ./dev-up.sh  (needs Docker)."
echo ""
exec "$RUNNER_DIR/.run-local.sh"
