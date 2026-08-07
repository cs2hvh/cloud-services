#!/usr/bin/env bash
# Run data-runner locally for testing (connector syncs: S3 + web crawl).
# Mirrors workers/eval-runner/run-local.sh — sources credentials from the
# repo's .env, then asks for the one piece that usually isn't there: an
# inference gateway API key.
#
# Contains NO secrets: everything is read from .env or prompted for, so this
# file is safe to commit (unlike agent-runner's .run-local.sh, which is
# gitignored because it inlines values).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ── 1. Load base secrets from existing env files ──────────────────────────────
#
# Parsed line-by-line rather than `source`d. The repo's .env is not a valid
# shell script — line 1 is a stray PowerShell `Disable-BitLocker ...` and at
# least one assignment is indented — so `set -a; source .env` aborts the whole
# script under `set -e` with "command not found" (this is why
# eval-runner/run-local.sh fails today). Only real KEY=VALUE lines are taken,
# and an already-exported variable wins, so `FOO=bar bash run-local.sh`
# overrides the file.
load_env_file() {
  local file="$1" line key val
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"          # strip leading whitespace
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    val="${val%$'\r'}"                                # tolerate CRLF
    [[ "$val" == \"*\" ]] && val="${val:1:${#val}-2}" # strip matching quotes
    [[ "$val" == \'*\' ]] && val="${val:1:${#val}-2}"
    [[ -n "${!key:-}" ]] && continue                  # already set → keep it
    export "$key=$val"
  done < "$file"
}
load_env_file "$REPO_ROOT/.env"
load_env_file "$REPO_ROOT/.auto-claude/.env"

# The app names it NEXT_PUBLIC_SUPABASE_URL; runner-core wants SUPABASE_URL.
export SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"

# ── 2. Data-runner specific vars ──────────────────────────────────────────────
# Point at a local `wrangler dev` gateway by default — a local sync should not
# bill against production. Override for a real-gateway test.
export INFERENCE_BASE_URL="${INFERENCE_BASE_URL:-http://localhost:8787/v1}"

# INFERENCE_PLATFORM_KEY: any valid key from your inference.api_keys table.
# Get it from: Supabase dashboard → Table Editor → inference.api_keys → key_value
if [[ -z "${INFERENCE_PLATFORM_KEY:-}" ]]; then
  echo ""
  echo "INFERENCE_PLATFORM_KEY not set."
  echo "Paste a key from your inference.api_keys table (Supabase dashboard → inference schema → api_keys → key_value):"
  read -r -s INFERENCE_PLATFORM_KEY
  export INFERENCE_PLATFORM_KEY
  echo "(set)"
fi

# ── 3. Runner tunables ────────────────────────────────────────────────────────
export FETCH_CONCURRENCY="${FETCH_CONCURRENCY:-8}"
export EMBED_BATCH="${EMBED_BATCH:-96}"
export MAX_CONCURRENT_JOBS="${MAX_CONCURRENT_JOBS:-2}"
export CLAIM_POLL_INTERVAL_MS="${CLAIM_POLL_INTERVAL_MS:-2000}"
export HEALTH_PORT="${HEALTH_PORT:-8091}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

# OCR costs money per page — off by default locally, on in k8s.
export OCR_ENABLED="${OCR_ENABLED:-false}"

# DEV ONLY. Lets a crawl connector reach 127.0.0.1 so you can point one at a
# local test site. NEVER set in k8s — it disables the SSRF private-IP block.
export CRAWL_ALLOW_PRIVATE="${CRAWL_ALLOW_PRIVATE:-true}"
# Same, for a local MinIO/s3rver endpoint. Separate knob on purpose.
export S3_ENDPOINT_ALLOW_PRIVATE="${S3_ENDPOINT_ALLOW_PRIVATE:-false}"

# ── 3b. Keep a local run off the SHARED queue ────────────────────────────────
#
# The repo .env points REDIS_URL at the shared Redis. A runner started from a
# laptop against that queue joins the same BullMQ queue as any deployed
# data-runner and can CLAIM REAL CONNECTOR SYNCS (the claim is atomic, so it
# wins them outright and syncs a customer's bucket from a dev machine). Prefer
# a local Redis when one is listening; otherwise keep going but say so loudly.
if [[ "${REDIS_URL:-}" != *"localhost"* && "${REDIS_URL:-}" != *"127.0.0.1"* ]]; then
  if nc -z localhost 6379 >/dev/null 2>&1; then
    echo "NOTE: REDIS_URL from .env is remote — using local Redis instead."
    echo "      Override with REDIS_URL=... to force the shared queue."
    export REDIS_URL="redis://localhost:6379"
  else
    echo "WARNING: REDIS_URL is NOT local (${REDIS_URL%%@*}@…) — this runner will" >&2
    echo "         join the shared queue and may claim real connector syncs." >&2
    echo "         Start a local Redis (docker start agent-test-redis) to avoid this." >&2
  fi
fi

# ── 4. Verify required vars are present ──────────────────────────────────────
for var in REDIS_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY INFERENCE_PLATFORM_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is still empty — check $REPO_ROOT/.env" >&2
    exit 1
  fi
done
# BYOK_DEK is only needed to decrypt S3 credentials / webhook secrets; a
# crawl-only test runs fine without it, so warn rather than fail.
if [[ -z "${BYOK_DEK:-}" ]]; then
  echo "WARNING: BYOK_DEK is not set — S3 connectors and signed webhooks will fail closed." >&2
fi

echo ""
echo "Starting data-runner..."
echo "  INFERENCE_BASE_URL   = $INFERENCE_BASE_URL"
echo "  SUPABASE_URL         = $SUPABASE_URL"
echo "  REDIS_URL            = ${REDIS_URL:0:20}..."
echo "  CRAWL_ALLOW_PRIVATE  = $CRAWL_ALLOW_PRIVATE  (dev only)"
echo "  OCR_ENABLED          = $OCR_ENABLED"
echo "  HEALTH_PORT          = $HEALTH_PORT"
echo ""

cd "$(dirname "${BASH_SOURCE[0]}")"
npx tsx src/index.ts
