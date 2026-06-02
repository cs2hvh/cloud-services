#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-workers.sh — build + push the runner images and deploy
# ft-runner + deploy-runner (+ in-cluster Redis) to an EXISTING LKE cluster.
#
# Use this when the cluster already exists (you do NOT need 01-create-cluster.sh).
# It builds both worker images, pushes them, applies the manifests
# (namespace → redis → secrets → deployments) via 02-apply-all.sh, then rolls the
# runners so they pull the freshly-pushed image.
#
# ── Prereqs ──────────────────────────────────────────────────────────────────
#   - kubectl, docker, envsubst, base64 on PATH
#   - KUBECONFIG pointing at your existing cluster
#   - ~/.ahura-lke.env filled in (cp from infra/k8s/lke/.env.lke.template)
#   - You can push to the image registry (GHCR): either already `docker login`ed,
#     or export GHCR_PAT (+ GHCR_USER) and the script will log in for you.
#
# ── Usage ────────────────────────────────────────────────────────────────────
#   export KUBECONFIG=$HOME/.kube/lke-ahura.yaml        # your existing cluster
#   export GHCR_PAT=<github PAT with write:packages>    # (or be pre-logged-in)
#   bash infra/k8s/lke/deploy-workers.sh
#
#   # deploy the already-published image without rebuilding:
#   SKIP_BUILD=1 bash infra/k8s/lke/deploy-workers.sh
#
#   # custom registry / tag:
#   IMAGE_REGISTRY=ghcr.io/youracct IMAGE_TAG=v1 bash infra/k8s/lke/deploy-workers.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"

# ── Config (override via env) ────────────────────────────────────────────────
ENV_FILE="${ENV_FILE:-$HOME/.ahura-lke.env}"
REGISTRY="${IMAGE_REGISTRY:-ghcr.io/cs2hvh}"   # matches the image: in the deployment.yamls
TAG="${IMAGE_TAG:-latest}"
SKIP_BUILD="${SKIP_BUILD:-0}"                  # =1 to deploy the already-published image
GHCR_USER="${GHCR_USER:-cs2hvh}"               # only used if GHCR_PAT is set

FT_IMAGE="$REGISTRY/ahura-ft-runner:$TAG"
DEPLOY_IMAGE="$REGISTRY/ahura-deploy-runner:$TAG"
DEFAULT_FT="ghcr.io/cs2hvh/ahura-ft-runner:latest"          # what the manifests hardcode
DEFAULT_DEPLOY="ghcr.io/cs2hvh/ahura-deploy-runner:latest"

say() { printf '\n▸ %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

say "deploy-workers — registry=$REGISTRY tag=$TAG skip_build=$SKIP_BUILD"

# ── 1. Load secrets from ~/.ahura-lke.env ────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  say "sourcing $ENV_FILE"
  set -a; source "$ENV_FILE"; set +a
else
  echo "WARN: $ENV_FILE not found — assuming the required vars are already exported" >&2
fi

# ── 2. Preflight ─────────────────────────────────────────────────────────────
command -v kubectl  >/dev/null || die "kubectl not found on PATH"
command -v envsubst >/dev/null || die "envsubst not found (install gettext)"
[[ -n "${KUBECONFIG:-}" ]] || die "export KUBECONFIG to your existing cluster first (e.g. \$HOME/.kube/lke-ahura.yaml)"

say "target cluster:"
kubectl get nodes || die "kubectl can't reach the cluster — check KUBECONFIG"

# ── 3. Build + push the runner images ────────────────────────────────────────
if [[ "$SKIP_BUILD" != "1" ]]; then
  command -v docker >/dev/null || die "docker not found (or re-run with SKIP_BUILD=1 to use the published image)"

  if [[ -n "${GHCR_PAT:-}" ]]; then
    say "docker login ghcr.io as $GHCR_USER"
    echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
  else
    echo "WARN: GHCR_PAT not set — assuming you're already logged in to the registry" >&2
  fi

  say "building $FT_IMAGE"
  docker build -t "$FT_IMAGE" "$REPO_ROOT/workers/ft-runner"
  say "building $DEPLOY_IMAGE"
  docker build -t "$DEPLOY_IMAGE" "$REPO_ROOT/workers/deploy-runner"

  say "pushing images"
  docker push "$FT_IMAGE"
  docker push "$DEPLOY_IMAGE"
else
  say "SKIP_BUILD=1 — deploying already-published $FT_IMAGE / $DEPLOY_IMAGE"
fi

# ── 4. Apply manifests (namespace → redis → secrets → deployments) ───────────
# 02-apply-all.sh validates the required env vars, applies everything, and waits
# for Redis + both runners to be Ready.
say "applying manifests via 02-apply-all.sh"
bash "$HERE/02-apply-all.sh"

# ── 5. Point deployments at a custom image, if one was used ──────────────────
if [[ "$FT_IMAGE" != "$DEFAULT_FT" ]]; then
  say "overriding image refs → $FT_IMAGE / $DEPLOY_IMAGE"
  kubectl -n ahura set image deploy/ahura-ft-runner     runner="$FT_IMAGE"
  kubectl -n ahura set image deploy/ahura-deploy-runner runner="$DEPLOY_IMAGE"
fi

# ── 6. Roll so the pods pull the freshly-pushed tag ──────────────────────────
# (apply of an unchanged :latest spec won't re-pull on its own — force it.)
say "rolling runners to pull the new image"
kubectl -n ahura rollout restart deploy/ahura-ft-runner deploy/ahura-deploy-runner
kubectl -n ahura rollout status  deploy/ahura-ft-runner     --timeout=180s
kubectl -n ahura rollout status  deploy/ahura-deploy-runner --timeout=180s

# ── 7. Verify ────────────────────────────────────────────────────────────────
say "deployed. namespace state:"
kubectl -n ahura get pods -o wide

cat <<EOF

✅ Workers deployed to the existing cluster.

Tail logs (expect: "<runner> booting" → "claimer started" intervalMs:5000 → "<runner> ready"):
  kubectl -n ahura logs -f deploy/ahura-ft-runner
  kubectl -n ahura logs -f deploy/ahura-deploy-runner

Smoke test from the prod dashboard: Fine-Tuning → New job (tiny dataset) →
within ~5s the ft-runner logs show "queued jobs found" → "claimed", and a
ahura-ft-<id> pod appears in the RunPod console.

Reminder: FT_WEBHOOK_SECRET here must equal the app's, and CONTROL_PLANE_URL
must point at the live web app, or webhooks 401 and jobs hang.
EOF
