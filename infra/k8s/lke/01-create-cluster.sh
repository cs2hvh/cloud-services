#!/usr/bin/env bash
# Provisions an LKE cluster, waits for it to be ready, fetches the kubeconfig.
#
# Why a script instead of letting the agent call the Linode API:
#   The agent's auto-classifier blocks sending credentials to external APIs
#   (correct behavior). This script keeps the PAT on YOUR machine: you export
#   it, run the script, the kubeconfig lands locally — no agent involvement.
#
# Usage:
#   export LINODE_PAT=...
#   bash infra/k8s/lke/01-create-cluster.sh
#
# Re-runnable: if a cluster already exists with the same label, the script
# skips creation and just re-fetches the kubeconfig. Safe to re-run after
# a kubeconfig file got lost or a node pool was modified out-of-band.

set -euo pipefail

# ── Config (override via env vars before running) ────────────────────
LABEL="${LKE_LABEL:-ahura-prod}"
REGION="${LKE_REGION:-ap-west}"          # Mumbai
NODE_TYPE="${LKE_NODE_TYPE:-g6-standard-2}"
NODE_COUNT="${LKE_NODE_COUNT:-2}"
K8S_VERSION="${LKE_K8S_VERSION:-}"        # auto-pick latest stable if empty
KUBECONFIG_OUT="${KUBECONFIG_OUT:-$HOME/.kube/lke-ahura.yaml}"

# ── Sanity ───────────────────────────────────────────────────────────
if [[ -z "${LINODE_PAT:-}" ]]; then
  echo "ERROR: set LINODE_PAT first (export LINODE_PAT=...)" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: 'node' is required for JSON parsing in this script — install Node.js first" >&2
  exit 1
fi

api() {
  local method="$1" path="$2"
  shift 2
  curl -sS \
    -H "Authorization: Bearer $LINODE_PAT" \
    -H "Content-Type: application/json" \
    -X "$method" \
    "https://api.linode.com/v4${path}" \
    "$@"
}

# Eval a JS expression against stdin JSON. The expression sees `d` as the
# parsed root. Prints the value (or empty if undefined/null/error).
#   echo "$resp" | nj "d.username"
#   echo "$resp" | nj "(d.data || []).find(c => c.label === 'ahura-prod')?.id"
nj() {
  node -e "
let buf = '';
process.stdin.on('data', c => buf += c);
process.stdin.on('end', () => {
  try {
    const d = JSON.parse(buf);
    const v = ($1);
    if (v !== undefined && v !== null) {
      console.log(typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
  } catch (e) {
    // swallow — caller treats empty stdout as 'not found'
  }
});
"
}

# ── Verify PAT + scopes ──────────────────────────────────────────────
echo "→ Verifying PAT..."
me=$(api GET /profile)
username=$(echo "$me" | nj "d.username")
if [[ -z "$username" ]]; then
  echo "ERROR: PAT didn't return a profile. Check the token's scopes." >&2
  echo "Response was: $me" >&2
  exit 1
fi
echo "  authenticated as: $username"

# ── Pick a k8s version if not provided ───────────────────────────────
if [[ -z "$K8S_VERSION" ]]; then
  K8S_VERSION=$(api GET /lke/versions | nj "
    (d.data || [])
      .map(v => v.id)
      .sort((a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
        }
        return 0;
      })[0]
  ")
  if [[ -z "$K8S_VERSION" ]]; then
    echo "ERROR: couldn't fetch LKE versions" >&2
    exit 1
  fi
  echo "→ Using latest LKE version: $K8S_VERSION"
fi

# ── Idempotency: skip create if cluster with this label exists ───────
existing_id=$(api GET "/lke/clusters" | nj "(d.data || []).find(c => c.label === '$LABEL')?.id")

if [[ -n "$existing_id" ]]; then
  echo "→ Cluster '$LABEL' already exists (id=$existing_id) — reusing"
  cluster_id="$existing_id"
else
  echo "→ Creating cluster '$LABEL' ($NODE_COUNT× $NODE_TYPE in $REGION, k8s $K8S_VERSION)..."
  body=$(cat <<EOF
{
  "label": "$LABEL",
  "region": "$REGION",
  "k8s_version": "$K8S_VERSION",
  "tags": ["ahura", "production"],
  "node_pools": [
    {
      "type": "$NODE_TYPE",
      "count": $NODE_COUNT,
      "autoscaler": {"enabled": false, "min": $NODE_COUNT, "max": $NODE_COUNT}
    }
  ],
  "control_plane": {"high_availability": false}
}
EOF
  )
  resp=$(api POST /lke/clusters -d "$body")
  cluster_id=$(echo "$resp" | nj "d.id")
  if [[ -z "$cluster_id" ]]; then
    echo "ERROR: cluster creation failed. Response:" >&2
    echo "$resp" >&2
    exit 1
  fi
  echo "  cluster id: $cluster_id"
fi

# ── Wait for nodes to be ready ───────────────────────────────────────
echo "→ Waiting for nodes to become Ready (typically 3-5 min)..."
deadline=$(( $(date +%s) + 600 ))
while true; do
  if (( $(date +%s) > deadline )); then
    echo "ERROR: nodes not ready after 10 min — check cloud.linode.com/kubernetes/clusters/$cluster_id" >&2
    exit 1
  fi
  pools=$(api GET "/lke/clusters/$cluster_id/pools")
  counts=$(echo "$pools" | nj "
    (() => {
      let total = 0, ready = 0;
      for (const p of (d.data || [])) {
        for (const n of (p.nodes || [])) {
          total++;
          if (n.status === 'ready') ready++;
        }
      }
      return ready + ' ' + total;
    })()
  ")
  read -r ready total <<<"$counts"
  echo "  nodes: $ready/$total ready"
  if [[ "$ready" == "$total" && "$total" -gt 0 ]]; then
    break
  fi
  sleep 15
done

# ── Fetch kubeconfig ─────────────────────────────────────────────────
echo "→ Fetching kubeconfig..."
mkdir -p "$(dirname "$KUBECONFIG_OUT")"
kc_b64=$(api GET "/lke/clusters/$cluster_id/kubeconfig" | nj "d.kubeconfig")
if [[ -z "$kc_b64" ]]; then
  echo "ERROR: kubeconfig fetch returned empty — cluster may still be provisioning" >&2
  exit 1
fi
echo "$kc_b64" | base64 -d > "$KUBECONFIG_OUT"
chmod 600 "$KUBECONFIG_OUT"
echo "  saved to: $KUBECONFIG_OUT"

# ── Quick verify ─────────────────────────────────────────────────────
echo "→ Verifying kubectl access..."
KUBECONFIG="$KUBECONFIG_OUT" kubectl get nodes

echo ""
echo "✅ Cluster ready."
echo ""
echo "Next steps:"
echo "  export KUBECONFIG=$KUBECONFIG_OUT"
echo "  bash infra/k8s/lke/02-apply-all.sh"
echo ""
echo "Cluster id (save this): $cluster_id"
