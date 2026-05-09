#!/bin/bash
# use-cluster.sh — Switch active kubeconfig AND update .env in one step
#
# Usage:
#   ./scripts/use-cluster.sh <path-to-kubeconfig.yaml>
#
# What it does:
#   1. Copies kubeconfig to ~/.kube/config (local kubectl)
#   2. Verifies cluster connection
#   3. Detects NGINX Ingress node IP for KUBE_IP
#   4. Generates KUBE_CONFIG_STRING (base64)
#   5. Updates .env in-place (no copy-paste needed)
#   6. Verifies .env was updated correctly

set -e

# ── Args ──────────────────────────────────────────────────────────────────────
KUBEFILE="$1"

if [ -z "$KUBEFILE" ]; then
  echo "❌  Usage: ./scripts/use-cluster.sh <path-to-kubeconfig.yaml>"
  exit 1
fi

if [ ! -f "$KUBEFILE" ]; then
  echo "❌  File not found: $KUBEFILE"
  exit 1
fi

# ── Resolve .env path (always relative to this script's repo root) ────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
echo ""
echo "═══════════════════════════════════════════"
echo " Step 1 — Switch local kubectl"
echo "═══════════════════════════════════════════"

mkdir -p ~/.kube
cp "$KUBEFILE" ~/.kube/config
chmod 600 ~/.kube/config
echo "✅  Copied to ~/.kube/config"

echo ""
echo "═══════════════════════════════════════════"
echo " Step 2 — Verify cluster connection"
echo "═══════════════════════════════════════════"

if ! kubectl cluster-info --request-timeout=10s 2>/dev/null | head -2; then
  echo "❌  Cannot reach cluster API server — check firewall / node status"
  echo "    Make sure port 6443 is open on the control plane node."
  exit 1
fi

echo ""
kubectl get nodes -o wide
echo ""

echo "═══════════════════════════════════════════"
echo " Step 3 — Detect NGINX Ingress node (KUBE_IP)"
echo "═══════════════════════════════════════════"

NGINX_NODE=$(kubectl get pods -n ingress-nginx \
  -l app.kubernetes.io/component=controller \
  -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null)

if [ -z "$NGINX_NODE" ]; then
  echo "⚠️   NGINX Ingress not found — falling back to first worker node"
  NGINX_NODE=$(kubectl get nodes \
    --selector='!node-role.kubernetes.io/control-plane' \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
fi

echo "NGINX node: $NGINX_NODE"

KUBE_IP=$(kubectl get node "$NGINX_NODE" \
  -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)

if [ -z "$KUBE_IP" ]; then
  KUBE_IP=$(kubectl get node "$NGINX_NODE" \
    -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}' 2>/dev/null)
fi

if [ -z "$KUBE_IP" ]; then
  echo "❌  Could not determine node IP"
  exit 1
fi

echo "KUBE_IP: $KUBE_IP"

# Warn if hostNetwork is not enabled
HOST_NETWORK=$(kubectl get pods -n ingress-nginx \
  -l app.kubernetes.io/component=controller \
  -o jsonpath='{.items[0].spec.hostNetwork}' 2>/dev/null)

if [ "$HOST_NETWORK" != "true" ]; then
  echo ""
  echo "⚠️   WARNING: NGINX Ingress hostNetwork is NOT enabled."
  echo "    Port 80/443 traffic will NOT reach NGINX on this IP."
  echo ""
fi

echo ""
echo "═══════════════════════════════════════════"
echo " Step 4 — Generate KUBE_CONFIG_STRING"
echo "═══════════════════════════════════════════"

KUBE_CONFIG_STRING=$(kubectl config view --minify --flatten -o yaml | base64 | tr -d '\n')
echo "Generated (${#KUBE_CONFIG_STRING} chars)"

echo ""
echo "═══════════════════════════════════════════"
echo " Step 5 — Update all .env files"
echo "═══════════════════════════════════════════"

# All env files to update (skip if they don't exist or lack the keys)
ENV_FILES=("$REPO_ROOT/.env" "$REPO_ROOT/.env.dev" "$REPO_ROOT/.env.prod")
UPDATED=()
SKIPPED=()

for F in "${ENV_FILES[@]}"; do
  if [ ! -f "$F" ]; then
    SKIPPED+=("$(basename "$F") (not found)")
    continue
  fi
  HAS_IP=$(grep -c "^KUBE_IP=" "$F" 2>/dev/null || true)
  HAS_CFG=$(grep -c "^KUBE_CONFIG_STRING=" "$F" 2>/dev/null || true)
  if [ "$HAS_IP" -eq 0 ] || [ "$HAS_CFG" -eq 0 ]; then
    SKIPPED+=("$(basename "$F") (missing KUBE_IP or KUBE_CONFIG_STRING key)")
    continue
  fi
  sed -i '' "s|^KUBE_IP=.*|KUBE_IP=${KUBE_IP}|" "$F"
  sed -i '' "s|^KUBE_CONFIG_STRING=.*|KUBE_CONFIG_STRING=${KUBE_CONFIG_STRING}|" "$F"
  UPDATED+=("$(basename "$F")")
done

for F in "${UPDATED[@]}"; do echo "✅  $F updated"; done
for F in "${SKIPPED[@]}"; do echo "⏭️   $F skipped"; done

if [ ${#UPDATED[@]} -eq 0 ]; then
  echo "❌  No .env files were updated"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════"
echo " Step 6 — Verify .env files"
echo "═══════════════════════════════════════════"

ALL_OK=true
for F in "${UPDATED[@]}"; do
  FILE="$REPO_ROOT/$F"
  STORED_IP=$(grep "^KUBE_IP=" "$FILE" | cut -d= -f2)
  STORED_LEN=$(grep "^KUBE_CONFIG_STRING=" "$FILE" | cut -d= -f2- | wc -c | tr -d ' ')
  if [ "$STORED_IP" != "$KUBE_IP" ]; then
    echo "❌  $F — KUBE_IP mismatch (got: $STORED_IP)"
    ALL_OK=false
  elif [ "$STORED_LEN" -lt 100 ]; then
    echo "❌  $F — KUBE_CONFIG_STRING too short ($STORED_LEN chars)"
    ALL_OK=false
  else
    echo "$F → KUBE_IP=$STORED_IP, KUBE_CONFIG_STRING length=${STORED_LEN} ✅"
  fi
done

if [ "$ALL_OK" = false ]; then exit 1; fi

echo ""
echo "═══════════════════════════════════════════"
echo " ✅  All done!"
echo "    kubectl → uses $KUBEFILE"
echo "    KUBE_IP=$KUBE_IP"
echo "    Updated: ${UPDATED[*]}"
echo "═══════════════════════════════════════════"
echo ""
