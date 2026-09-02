#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-admin.sh — one-command deploy for the ADMIN PANEL on the Linode VM.
#
# The panel lives on the standing branch `feat/separate-admin-panel` in its
# OWN checkout (/root/cloud-admin-panel) so the main app's checkout and deploy
# are never touched. Pull → deps if lockfile changed → `npm run admin:build`
# → restart ahura-admin → health-check. A failed build does NOT restart, so
# the live panel keeps serving.
#
# FIRST RUN bootstraps everything: clones the repo, copies .env from the main
# checkout, installs the systemd unit. So setup on the VM is:
#     cp /root/cloud-admin-panel/deploy/deploy-admin.sh /root/deploy-admin.sh 2>/dev/null \
#       || curl -fsSL <raw url> -o /root/deploy-admin.sh   # or scp it once
#     chmod +x /root/deploy-admin.sh && /root/deploy-admin.sh
#
# Copy it OUTSIDE the repo so `git reset` can't touch it (the ahura-cron
# lesson: a service whose script a deploy can delete restarts forever doing
# nothing).
#
# Env overrides:
#   APP_DIR=/root/cloud-admin-panel  SERVICE=ahura-admin  PORT=3001
#   MAIN_DIR=/root/cloud-services    REPO_URL=https://github.com/cs2hvh/cloud-services.git
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/cloud-admin-panel}"
MAIN_DIR="${MAIN_DIR:-/root/cloud-services}"
REPO_URL="${REPO_URL:-https://github.com/cs2hvh/cloud-services.git}"
SERVICE="${SERVICE:-ahura-admin}"
PORT="${PORT:-3001}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/signin}"
DEFAULT_BRANCH="feat/separate-admin-panel"

BRANCH="${1:-$DEFAULT_BRANCH}"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── bootstrap on first run ───────────────────────────────────────────────────
if [[ ! -d "$APP_DIR/.git" ]]; then
  step "First run — cloning $REPO_URL into $APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR" || die "clone failed"
  if [[ -f "$MAIN_DIR/.env" && ! -f "$APP_DIR/.env" ]]; then
    cp "$MAIN_DIR/.env" "$APP_DIR/.env"
    ok "copied .env from $MAIN_DIR"
  fi
fi

cd "$APP_DIR" || die "APP_DIR not found: $APP_DIR"

step "Fetching origin/$BRANCH"
git fetch origin "$BRANCH" || die "fetch failed"
OLD_LOCK_HASH="$(git hash-object package-lock.json 2>/dev/null || echo none)"
git reset --hard "origin/$BRANCH" || die "reset failed"
NEW_LOCK_HASH="$(git hash-object package-lock.json 2>/dev/null || echo none)"
ok "at $(git rev-parse --short HEAD)"

if [[ "$OLD_LOCK_HASH" != "$NEW_LOCK_HASH" || ! -d node_modules ]]; then
  step "Lockfile changed (or first run) — npm ci"
  npm ci --no-audit --no-fund || die "npm ci failed"
else
  ok "lockfile unchanged — skipping npm ci"
fi

step "Building the admin app"
npm run admin:build || die "build failed — live panel untouched"

# ── systemd unit (installed/refreshed from the repo, ahura-cron lesson) ─────
if ! cmp -s deploy/systemd/ahura-admin.service /etc/systemd/system/ahura-admin.service 2>/dev/null; then
  step "Installing/refreshing systemd unit"
  cp deploy/systemd/ahura-admin.service /etc/systemd/system/ahura-admin.service
  systemctl daemon-reload
  systemctl enable "$SERVICE" >/dev/null 2>&1 || true
fi

step "Restarting $SERVICE"
systemctl restart "$SERVICE" || die "restart failed"

step "Health check: $HEALTH_URL"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "$HEALTH_URL"; then
    ok "panel is serving"
    exit 0
  fi
  sleep 2
done
systemctl status "$SERVICE" --no-pager -l | tail -20 || true
die "health check failed after 60s"
