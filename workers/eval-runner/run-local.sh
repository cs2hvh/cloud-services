#!/usr/bin/env bash
# Run eval-runner locally for testing.
# Sources credentials from the repo's .env and .auto-claude/.env, then asks
# for the one missing piece: an inference gateway API key.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ── 1. Load base secrets from existing env files ──────────────────────────────
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi
if [[ -f "$REPO_ROOT/.auto-claude/.env" ]]; then
  set -a; source "$REPO_ROOT/.auto-claude/.env"; set +a
fi

# ── 2. Eval-runner specific vars ──────────────────────────────────────────────
export INFERENCE_BASE_URL="${INFERENCE_BASE_URL:-https://api.ahurasense.com/v1}"

# INFERENCE_PLATFORM_KEY: any valid key from your inference.api_keys table.
# Get it from: Supabase dashboard → Table Editor → inference.api_keys → key_value
# Or paste it below / pass as env var: INFERENCE_PLATFORM_KEY=sk-... bash run-local.sh
if [[ -z "${INFERENCE_PLATFORM_KEY:-}" ]]; then
  echo ""
  echo "INFERENCE_PLATFORM_KEY not set."
  echo "Paste a key from your inference.api_keys table (Supabase dashboard → inference schema → api_keys → key_value):"
  read -r -s INFERENCE_PLATFORM_KEY
  export INFERENCE_PLATFORM_KEY
  echo "(set)"
fi

# ── 3. Runner tunables ────────────────────────────────────────────────────────
export CONCURRENT_CASES="${CONCURRENT_CASES:-2}"
export CASE_TIMEOUT_MS="${CASE_TIMEOUT_MS:-30000}"
export MAX_CONCURRENT_JOBS="${MAX_CONCURRENT_JOBS:-1}"
export CLAIM_POLL_INTERVAL_MS="${CLAIM_POLL_INTERVAL_MS:-3000}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

# ── 4. Verify required vars are present ──────────────────────────────────────
for var in REDIS_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY INFERENCE_PLATFORM_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is still empty — check $REPO_ROOT/.env or .auto-claude/.env" >&2
    exit 1
  fi
done

echo ""
echo "Starting eval-runner..."
echo "  INFERENCE_BASE_URL  = $INFERENCE_BASE_URL"
echo "  REDIS_URL           = ${REDIS_URL:0:20}..."
echo "  SUPABASE_URL        = $SUPABASE_URL"
echo "  CONCURRENT_CASES    = $CONCURRENT_CASES"
echo "  CLAIM_POLL_INTERVAL = ${CLAIM_POLL_INTERVAL_MS}ms"
echo ""

cd "$(dirname "${BASH_SOURCE[0]}")"
npx tsx src/index.ts
