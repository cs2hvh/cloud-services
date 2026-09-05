#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — one-command deploy for the self-hosted web app on the Linode VM.
#
# Pulls a branch → installs deps (only if the lockfile changed) → builds →
# restarts the app → health-checks. If the build fails it does NOT restart, so
# the currently-live version keeps serving. The billing sweep and renewal
# timers are installed by .github/workflows/deploy.yml after this script runs.
#
# Recommended: copy this OUTSIDE the repo once so `git reset` can't touch it:
#     cp deploy/deploy.sh /root/deploy.sh && chmod +x /root/deploy.sh
#
# Usage:
#   /root/deploy.sh              # deploy the branch currently checked out (default)
#   /root/deploy.sh main         # deploy origin/main
#   /root/deploy.sh dev          # deploy origin/dev
#   /root/deploy.sh dev --no-cron   # skip restarting the billing cron
#   /root/deploy.sh dev --deps      # force `npm ci` even if the lockfile is unchanged
#
# Override paths/services via env if yours differ:
#   APP_DIR=/root/cloud-services WEB_SERVICE=ahura-web CRON_SERVICE=ahura-cron \
#     WORKER_SERVICE=ahura-build-worker PORT=3000  /root/deploy.sh dev
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/cloud-services}"
WEB_SERVICE="${WEB_SERVICE:-ahura-web}"
CRON_SERVICE="${CRON_SERVICE:-ahura-cron}"
WORKER_SERVICE="${WORKER_SERVICE:-ahura-build-worker}"
PORT="${PORT:-3000}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}}"

# ── parse args ───────────────────────────────────────────────────────────────
BRANCH=""; RESTART_CRON=1; FORCE_DEPS=0
for a in "$@"; do
  case "$a" in
    --no-cron) RESTART_CRON=0 ;;
    --deps)    FORCE_DEPS=1 ;;
    -*)        echo "unknown flag: $a" >&2; exit 2 ;;
    *)         BRANCH="$a" ;;
  esac
done

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# PIDs listening on $PORT, on any address, by whichever tool the host has.
# Empty when nothing does. Three sources because the first deploy with the
# stop-clear-start sequence (run 81) still found the OLD build answering after
# the start: the listener survived the stop and the ss parse alone did not
# name it.
port_pids() {
  {
    ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2
    fuser -n tcp "$PORT" 2>/dev/null | tr ' ' '\n'
    lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null
  } | grep -E '^[0-9]+$' | sort -u || true
}

# The build id the app on :$PORT is serving right now, or empty. Next puts it
# in every page as \"b\":\"<id>\" in the RSC payload.
served_build_id() {
  curl -s -m 10 "$HEALTH_URL/" 2>/dev/null | grep -o '\\"b\\":\\"[A-Za-z0-9_-]*' | head -1 | sed 's/.*"//' || true
}

# Whoever holds :$PORT must be inside this unit, and the unit must be active.
verify_port_owner() {
  local pid
  for pid in $(port_pids); do
    grep -q "$WEB_SERVICE.service" "/proc/$pid/cgroup" 2>/dev/null ||
      die "port $PORT is held by pid $pid outside $WEB_SERVICE — an unmanaged process is serving"
  done
  systemctl is-active --quiet "$WEB_SERVICE" || die "$WEB_SERVICE is not active after the restart"
}


cd "$APP_DIR" || die "APP_DIR not found: $APP_DIR"
[[ -z "$BRANCH" ]] && BRANCH="$(git rev-parse --abbrev-ref HEAD)"

step "Deploy: branch '$BRANCH' → $APP_DIR   (restart cron: $([[ $RESTART_CRON == 1 ]] && echo yes || echo no))"

# ── 1. sync to the remote branch (deterministic). .env is gitignored → untouched.
step "Fetching + resetting to origin/$BRANCH"
git fetch --prune origin "$BRANCH" || die "git fetch failed"
git checkout -f "$BRANCH" 2>/dev/null || git checkout -f -b "$BRANCH" "origin/$BRANCH" || die "checkout failed"
git reset --hard "origin/$BRANCH" || die "git reset failed"
echo "  → $(git rev-parse --short HEAD)  $(git log -1 --pretty=%s)"

# ── 2. deps — only reinstall when package-lock.json changed (or --deps)
HASH_FILE=".deploy-lock-hash"
NEW_HASH="$(sha1sum package-lock.json | awk '{print $1}')"
if [[ $FORCE_DEPS == 1 || ! -f "$HASH_FILE" || "$(cat "$HASH_FILE" 2>/dev/null)" != "$NEW_HASH" ]]; then
  step "Installing dependencies (npm ci)"
  npm ci || die "npm ci failed"
  echo "$NEW_HASH" > "$HASH_FILE"
else
  step "Dependencies unchanged — skipping npm ci"
fi

# ── 3. build (the live app keeps serving its in-memory build until we restart)
step "Building (generate:openapi + next build — the slow part)"
if ! npm run build; then
  die "build FAILED — service NOT restarted, previous version is still live. Fix and re-run."
fi
[[ -f .next/BUILD_ID ]] || die "build produced no .next/BUILD_ID — aborting before restart"
echo "  build OK (BUILD_ID $(cat .next/BUILD_ID))"

# ── 4. restart services (brief downtime on a single instance)
#
# STOP, CLEAR THE PORT, START — not `systemctl restart`. A restart returns 0
# even when the new instance then dies because something outside the unit
# still holds :$PORT, and in that state the old process keeps answering the
# health check (see verify_served_build). Nothing but this unit may own the
# port; anything else found on it after the stop is named in the log and
# killed.
step "Restarting $WEB_SERVICE"
echo "  before stop: $(systemctl show -p KillMode -p MainPID -p ActiveState "$WEB_SERVICE" 2>/dev/null | tr '\n' ' ') port owners: $(port_pids | tr '\n' ' ')"
systemctl stop "$WEB_SERVICE" || true
# Wait for the port to be free, naming and killing whatever still holds it.
# A stop that returns while a child keeps listening (KillMode=process, or a
# process that was never in the unit) is exactly the case that left the old
# build live in run 78 and again in run 81.
for i in $(seq 1 15); do
  held="$(port_pids)"
  [[ -z "$held" ]] && break
  for pid in $held; do
    echo "  port $PORT still held by pid $pid after stop ($i): $(ps -o etime=,cmd= -p "$pid" 2>/dev/null | head -c 160)"
    if (( i < 5 )); then kill "$pid" 2>/dev/null || true; else kill -9 "$pid" 2>/dev/null || true; fi
  done
  sleep 1
done
held="$(port_pids)"
[[ -z "$held" ]] || die "port $PORT is still held by pid(s) $held after stop and kill — the old build would keep serving; inspect by hand"
systemctl start "$WEB_SERVICE" || die "failed to start $WEB_SERVICE"

# The old billing cron ($CRON_SERVICE) must NEVER run again. It billed from
# billing.active_* with rates that include monthly figures written into an
# hourly column, and it caps a billing window at 24h and charges the cap.
# Until 2026-09-03 this script restarted it on every deploy; it only failed to
# bill because its script file no longer exists. Masking makes that permanent.
# (--no-cron is still accepted so old invocations keep working; it is a no-op.)
if [[ $RESTART_CRON == 1 ]]; then :; fi
step "Masking $CRON_SERVICE (the retired v1 biller)"
systemctl disable --now "$CRON_SERVICE" 2>/dev/null || true
systemctl mask "$CRON_SERVICE" 2>/dev/null || true

# The build worker runs the code in THIS repo and is not part of the web app, so
# a deploy that skips it ships build-path changes that never execute. That is
# not hypothetical: detection, Dockerfile generation and error wording all sat
# unrun for five days while the app deployed green, and it was a customer's
# failed build that surfaced it.
#
# Tolerated rather than fatal, because the unit is newer than some hosts: a box
# that has not installed it yet should still finish deploying the web app. The
# warning is deliberately loud — a silent skip here is the original bug.
step "Restarting $WORKER_SERVICE"
if systemctl list-unit-files "$WORKER_SERVICE.service" >/dev/null 2>&1 &&
   systemctl cat "$WORKER_SERVICE" >/dev/null 2>&1; then
  systemctl restart "$WORKER_SERVICE" ||
    echo "  (WARNING: $WORKER_SERVICE restart FAILED — builds are running OLD code until it does)"
else
  echo "  (WARNING: $WORKER_SERVICE is not installed — builds run whatever was started by hand."
  echo "   Install: cp deploy/systemd/$WORKER_SERVICE.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now $WORKER_SERVICE)"
fi

# ── 5. health check
# ── 5. health check: the app must answer AND serve the build we just made.
# Up to three minutes: tsx plus a Next start of this size can take over a
# minute, and a 200 from the previous build during that window is not health.
want="$(cat .next/BUILD_ID)"
got=""
step "Waiting for the app to answer on $HEALTH_URL with BUILD_ID $want"
for i in $(seq 1 90); do
  code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || true)"
  case "$code" in
    200|301|302|307|308)
      got="$(served_build_id)"
      if [[ -z "$got" ]]; then
        echo "  (no build id readable from $HEALTH_URL/ — cannot prove which build is serving)"
        verify_port_owner
        ok "Deployed: $BRANCH @ $(git rev-parse --short HEAD) — app healthy (HTTP $code)"
        exit 0
      fi
      if [[ "$got" == "$want" ]]; then
        verify_port_owner
        ok "Deployed: $BRANCH @ $(git rev-parse --short HEAD) — app healthy (HTTP $code), serving BUILD_ID $want"
        exit 0
      fi
      if (( i % 10 == 0 )); then echo "  serving $got, want $want — still waiting for the new instance ($i)"; fi
      ;;
  esac
  sleep 2
done
systemctl status "$WEB_SERVICE" --no-pager || true
journalctl -u "$WEB_SERVICE" -n 40 --no-pager || true
if [[ -n "$got" ]]; then
  die "the app on :$PORT serves build $got but this deploy built $want — the OLD build is still live"
fi
die "app not responding after restart — check: journalctl -u $WEB_SERVICE -n 60"
