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
# checkout, installs the systemd unit, and (nginx add-only, test-gated) writes
# the control.ahurasense.com origin vhost. The GitHub workflow scp's this
# script to /root/deploy-admin.sh on EVERY deploy, so the VM copy can never
# go stale — and no human ever needs a terminal on the box to deploy.
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

# ── ensure required env (NEXT_PUBLIC_* are inlined at BUILD time) ───────────
# The .env is a first-run copy of the main app's and the main app does not
# carry this var, so it must be written here BEFORE the build, idempotently.
# An absent var plus a source fallback is how the live panel shipped four
# dead links pointing at a domain with no DNS — the var being explicit means
# the fallback is never the thing in play.
if ! grep -q '^NEXT_PUBLIC_MAIN_APP_URL=' .env 2>/dev/null; then
  echo 'NEXT_PUBLIC_MAIN_APP_URL=https://ahurasense.com' >> .env
  ok "wrote NEXT_PUBLIC_MAIN_APP_URL=https://ahurasense.com to .env"
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
HEALTHY=0
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "$HEALTH_URL"; then
    ok "panel is serving on :$PORT"
    HEALTHY=1
    break
  fi
  sleep 2
done
if [[ $HEALTHY != 1 ]]; then
  systemctl status "$SERVICE" --no-pager -l | tail -20 || true
  die "health check failed after 60s"
fi

# ── origin vhost for control.ahurasense.com ─────────────────────────────────
# Cloudflare 526 taught us this layer exists: DNS + a running service still
# 526s until whatever terminates :443 has a server block for the hostname.
# Add-only (never edits existing sites), nginx -t gated, non-fatal — the
# service being healthy matters more than the vhost, and failures print
# loudly in the Actions log instead of being discovered at the end.
HOSTNAME_FQDN="${HOSTNAME_FQDN:-control.ahurasense.com}"
step "Origin vhost: $HOSTNAME_FQDN → 127.0.0.1:$PORT"
if command -v nginx >/dev/null 2>&1; then
  VHOST="/etc/nginx/conf.d/control-admin.conf"
    # Pick a certificate that PROVABLY covers the hostname, not the first one
    # nginx serves — "a cert was found" and "a cert covering this name was
    # found" look identical from outside, and the difference was a 526 that
    # cost a diagnosis round trip. Walk every cert/key pair in nginx -T and
    # check the SAN for the exact name or the parent wildcard.
    PARENT_DOMAIN="${HOSTNAME_FQDN#*.}"
    CERT=""; KEY=""
    while IFS='|' read -r c k; do
      [[ -f "$c" && -f "$k" ]] || continue
      SAN="$(openssl x509 -in "$c" -noout -ext subjectAltName 2>/dev/null | tr -d ' ')"
      if grep -qiE "DNS:\*\.${PARENT_DOMAIN//./\\.}|DNS:${HOSTNAME_FQDN//./\\.}" <<<"$SAN"; then
        CERT="$c"; KEY="$k"
        ok "cert covers $HOSTNAME_FQDN: $c ($(grep -oiE 'DNS:[^,]+' <<<"$SAN" | tr '\n' ' '))"
        break
      fi
    done < <(nginx -T 2>/dev/null | awk '
      /^[[:space:]]*ssl_certificate[[:space:]]/    { c=$2; sub(/;$/,"",c) }
      /^[[:space:]]*ssl_certificate_key[[:space:]]/{ k=$2; sub(/;$/,"",k); if (c!="") { print c "|" k; c="" } }' | sort -u)

    if [[ -n "$CERT" && -n "$KEY" ]]; then
      TMP_VHOST="$(mktemp)"
      cat > "$TMP_VHOST" <<VHOSTEOF
# control.ahurasense.com → admin panel (:$PORT). Written by deploy-admin.sh;
# add-only and safe to delete — the next deploy recreates it.
server {
    listen 443 ssl;
    server_name $HOSTNAME_FQDN;
    ssl_certificate     $CERT;
    ssl_certificate_key $KEY;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
server {
    listen 80;
    server_name $HOSTNAME_FQDN;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
VHOSTEOF
      if cmp -s "$TMP_VHOST" "$VHOST" 2>/dev/null; then
        ok "vhost already correct ($VHOST)"
        rm -f "$TMP_VHOST"
      else
        # Replace (this also heals a previously-installed vhost that carried a
        # non-covering cert), test-gated with restore of the prior state.
        [[ -f "$VHOST" ]] && cp "$VHOST" "$VHOST.bak"
        mv "$TMP_VHOST" "$VHOST"
        if nginx -t 2>&1; then
          systemctl reload nginx && ok "vhost installed/updated, nginx reloaded — cert: $CERT"
          rm -f "$VHOST.bak"
        else
          if [[ -f "$VHOST.bak" ]]; then mv "$VHOST.bak" "$VHOST"; else rm -f "$VHOST"; fi
          echo "WARN: nginx -t rejected the new vhost — previous state restored, existing sites untouched. Output above."
        fi
      fi
    else
      echo "WARN: no certificate on this box covers $HOSTNAME_FQDN. Candidates and their SANs:"
      nginx -T 2>/dev/null | awk '/^[[:space:]]*ssl_certificate[[:space:]]/ { c=$2; sub(/;$/,"",c); print c }' | sort -u | while read -r c; do
        echo "  $c: $(openssl x509 -in "$c" -noout -ext subjectAltName 2>/dev/null | tail -1 | tr -d ' ')"
      done
      echo "Durable fix: a Cloudflare Origin CA certificate for *.${PARENT_DOMAIN}."
    fi
else
  echo "WARN: nginx not found — whatever terminates :443 needs a $HOSTNAME_FQDN server block proxying to 127.0.0.1:$PORT. Listeners:"
  ss -tlnp | grep -E ':(443|80)\s' || true
fi
exit 0
