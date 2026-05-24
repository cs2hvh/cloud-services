# LKE bootstrap

End-to-end playbook for standing up the production cluster on Linode
Kubernetes Engine (LKE) that runs `ahura-ft-runner` + `ahura-deploy-runner`
(plus their Redis).

## What this provisions

| Resource | Purpose | Cost |
|---|---|---|
| 1× LKE cluster (Mumbai, k8s 1.32, standard control plane) | Hosts the runners | Free control plane |
| 2× g6-standard-2 worker nodes (2 vCPU / 4GB each) | Compute for runners + Redis | $48/mo |
| 1× 10GB Block Volume | Redis PVC | $1/mo |
| 0× NodeBalancer | Not needed — runners are outbound-only | $0 |
| **Total ongoing** | | **~$49/mo** |

GPU work happens on **RunPod**, not in this cluster. These nodes just
orchestrate.

## Prerequisites on your machine

- `kubectl` ([install](https://kubernetes.io/docs/tasks/tools/))
- `curl`, `base64`, `envsubst` (standard on Linux/macOS/WSL)
- `openssl` (for generating the webhook secret)
- A Linode account with an API PAT

## Order of operations

### 0. Create env file with real secrets (one time)

```bash
cp ~/.ahura-lke.env.template ~/.ahura-lke.env
# edit ~/.ahura-lke.env and fill in real values
# (.env.lke is gitignored, never commit it)
```

You'll also need to **set `FT_WEBHOOK_SECRET` in your Next.js production
env** (Vercel/Render/wherever) — same exact value. If they don't match,
every webhook from training pods gets rejected with "Invalid signature"
and jobs hang forever.

### 1. Provision the cluster

```bash
export LINODE_PAT=...   # your PAT
bash infra/k8s/lke/01-create-cluster.sh
```

The script:
- verifies the PAT
- creates the cluster (or reuses if `ahura-prod` already exists)
- waits for all nodes to be Ready (3-5 min)
- fetches + saves the kubeconfig to `~/.kube/lke-ahura.yaml`
- prints the kubectl `get nodes` output

When it's done, **revoke the PAT** at <https://cloud.linode.com/profile/tokens>
— we don't need it again unless you scale the cluster.

### 2. Point kubectl at the new cluster

```bash
export KUBECONFIG=$HOME/.kube/lke-ahura.yaml
kubectl get nodes   # confirm: 2 nodes, status Ready
```

### 3. Apply manifests

```bash
# Load env from .env.lke into the current shell
set -a; source ~/.ahura-lke.env; set +a

bash infra/k8s/lke/02-apply-all.sh
```

This:
- creates the `ahura` namespace
- deploys Redis (with 10GB PVC) and waits for it Ready
- creates both runner Secrets (envsubst from `.template` files in
  `workers/*/k8s/`)
- deploys both runners and waits for them Ready
- prints the final `get all` state

### 4. Verify

```bash
# Should see 4 pods: redis-*, ahura-ft-runner-*, ahura-deploy-runner-*
kubectl -n ahura get pods

# Tail runner logs
kubectl -n ahura logs -f deploy/ahura-ft-runner
kubectl -n ahura logs -f deploy/ahura-deploy-runner

# Expected boot lines (for each runner):
#   "msg":"<runner> booting"
#   "msg":"health server listening","port":8080
#   "msg":"claimer started","intervalMs":5000
#   "msg":"<runner> ready"
```

### 5. Smoke test

From the dashboard:
- **Fine-Tuning** → "New job" with a small base + tiny dataset. Within
  ~5s you'll see `"msg":"queued jobs found"` then `"msg":"claimed"` in
  the ft-runner logs. RunPod console shows a `ahura-ft-<8chars>` pod
  spin up.
- **Deployments** → "New deployment", source=Docker, ref=a public
  inference image. Same shape: queued → deploying → READY → active in
  catalog.

## Common ops

```bash
# See everything in the namespace
kubectl -n ahura get all,pvc,secret

# Restart a runner (re-pull image)
kubectl -n ahura rollout restart deploy/ahura-ft-runner

# Update an env value in the Secret (after editing .env.lke)
set -a; source ~/.ahura-lke.env; set +a
envsubst < workers/ft-runner/k8s/secret.yaml.template | kubectl apply -f -
kubectl -n ahura rollout restart deploy/ahura-ft-runner

# Port-forward to hit the health endpoint locally
kubectl -n ahura port-forward deploy/ahura-ft-runner 8080:8080
curl localhost:8080/health
```

## Disaster recovery

```bash
# Re-run cluster create — idempotent, picks up existing cluster + re-saves kubeconfig
export LINODE_PAT=...
bash infra/k8s/lke/01-create-cluster.sh

# Re-apply everything
export KUBECONFIG=$HOME/.kube/lke-ahura.yaml
set -a; source ~/.ahura-lke.env; set +a
bash infra/k8s/lke/02-apply-all.sh
```

Redis data persists on the Block Volume across pod restarts. If you
delete the PVC, BullMQ jobs in-flight at that moment are lost (but new
jobs will be re-claimed by the runner's Postgres poll within 5s).

## Tear down

```bash
# Delete everything in-cluster (keeps the cluster + Block Volume)
kubectl delete namespace ahura

# OR delete the entire LKE cluster (also reclaims the Block Volume)
# DESTRUCTIVE — use the Linode console at cloud.linode.com/kubernetes/clusters
```

## When to graduate from this setup

| Signal | Move to |
|---|---|
| >50 concurrent FT jobs | Bump `MAX_CONCURRENT_JOBS` in the Secret; if that's not enough, run 2nd ft-runner replica (BullMQ dedupes via jobId) |
| Redis hitting 512MB | Bump `--maxmemory` in `03-redis.yaml` + the PVC size |
| Need HA control plane | Linode console → cluster settings → enable HA (+$60/mo) |
| Production multi-region | Add 2nd LKE cluster in a different region, sharded by org_id hash |
