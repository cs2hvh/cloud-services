#!/usr/bin/env bash
# Apply all manifests in the right order. Assumes:
#   - KUBECONFIG is exported and points at the LKE cluster
#   - All env vars listed below are exported (run from a shell where
#     they're set, OR source a local .env.lke file)
#
# Re-runnable. kubectl apply is idempotent on every resource we touch.

set -euo pipefail

# ── Sanity ───────────────────────────────────────────────────────────
if [[ -z "${KUBECONFIG:-}" ]]; then
  echo "ERROR: export KUBECONFIG first (the path printed by 01-create-cluster.sh)" >&2
  exit 1
fi

required=(
  REDIS_URL
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  RUNPOD_API_KEY
  CONTROL_PLANE_URL
  FT_WEBHOOK_SECRET
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_ENDPOINT
)
missing=()
for v in "${required[@]}"; do
  if [[ -z "${!v:-}" ]]; then missing+=("$v"); fi
done
if (( ${#missing[@]} > 0 )); then
  echo "ERROR: missing required env vars:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  echo "" >&2
  echo "Tip: keep these in ~/.ahura-lke.env (OUTSIDE the repo) and run:" >&2
  echo "  set -a; source ~/.ahura-lke.env; set +a" >&2
  exit 1
fi

# Optional vars (export as empty if not set so envsubst doesn't keep the literal $VAR)
export HF_TOKEN="${HF_TOKEN:-}"
export LORA_SERVING_ENDPOINT_ID="${LORA_SERVING_ENDPOINT_ID:-}"

cd "$(dirname "$0")/../../.."

# Pre-check connectivity
echo "→ Checking cluster reachability..."
kubectl get nodes

# ── 1. Namespace ─────────────────────────────────────────────────────
echo ""
echo "→ Applying namespace..."
kubectl apply -f infra/k8s/lke/02-namespace.yaml

# ── 2. Redis ─────────────────────────────────────────────────────────
echo ""
echo "→ Applying in-cluster Redis (Deployment + PVC + Service)..."
kubectl apply -f infra/k8s/lke/03-redis.yaml
echo "  waiting for redis to be Ready..."
kubectl -n ahura rollout status deployment/redis --timeout=180s

# ── 3. ft-runner ─────────────────────────────────────────────────────
echo ""
echo "→ Applying ft-runner Secret..."
envsubst < workers/ft-runner/k8s/secret.yaml.template | kubectl apply -f -
echo "→ Applying ft-runner Deployment..."
kubectl apply -f workers/ft-runner/k8s/deployment.yaml
echo "  waiting for ft-runner to be Ready..."
kubectl -n ahura rollout status deployment/ahura-ft-runner --timeout=180s

# ── 4. deploy-runner ─────────────────────────────────────────────────
echo ""
echo "→ Applying deploy-runner Secret..."
envsubst < workers/deploy-runner/k8s/secret.yaml.template | kubectl apply -f -
echo "→ Applying deploy-runner Deployment..."
kubectl apply -f workers/deploy-runner/k8s/deployment.yaml
echo "  waiting for deploy-runner to be Ready..."
kubectl -n ahura rollout status deployment/ahura-deploy-runner --timeout=180s

# ── 5. eval-runner ───────────────────────────────────────────────────
echo ""
for v in INFERENCE_PLATFORM_KEY INFERENCE_BASE_URL; do
  if [[ -z "${!v:-}" ]]; then
    echo "ERROR: $v is required for eval-runner — add it to ~/.ahura-lke.env" >&2
    exit 1
  fi
done
echo "→ Applying eval-runner Secret..."
envsubst < workers/eval-runner/k8s/secret.yaml.template | kubectl apply -f -
echo "→ Applying eval-runner Deployment..."
kubectl apply -f workers/eval-runner/k8s/deployment.yaml
echo "  waiting for eval-runner to be Ready..."
kubectl -n ahura rollout status deployment/ahura-eval-runner --timeout=180s

# ── 6. Final status ──────────────────────────────────────────────────
echo ""
echo "✅ All resources applied."
echo ""
echo "Final state:"
kubectl -n ahura get all
echo ""
echo "Tail logs with:"
echo "  kubectl -n ahura logs -f deploy/ahura-ft-runner"
echo "  kubectl -n ahura logs -f deploy/ahura-deploy-runner"
echo "  kubectl -n ahura logs -f deploy/ahura-eval-runner"
