# ahura-deploy-runner

BullMQ-driven orchestrator for BYO Model Deploy. Claims rows from
`inference.deployments` based on status, calls RunPod Serverless, registers
the resulting model in `inference.models`.

## Architecture

```
Next.js POST /deployments ──INSERT──> Postgres (status=building)
Next.js DELETE /deployments/[id] ─UPDATE──> Postgres (status=paused)
                                          │
                                          │ (polled every 5s)
                                          ▼
                                       Claimer ───enqueue──>  BullMQ
                                                                │
                                                  (1..N workers)│
                                                                ▼
                            ┌────────────── Lifecycle ──────────────┐
                            │ action = 'create'  → RunPod template + │
                            │                      endpoint create, │
                            │                      poll until READY,│
                            │                      INSERT into models│
                            │                      status=active    │
                            │ action = 'scale'   → RunPod PATCH     │
                            │ action = 'delete'  → RunPod DELETE,   │
                            │                      models.is_active=false│
                            │                      status=deleted   │
                            └────────────────────────────────────────┘
```

## Lifecycle states

| Status      | Set by              | Runner action                  |
|-------------|---------------------|--------------------------------|
| `building`  | POST /deployments   | claim → `deploying`            |
| `deploying` | runner              | poll until READY → `active`    |
| `active`    | runner              | serve traffic; scale on update |
| `paused`    | DELETE /deployments | runner deletes endpoint → `deleted` |
| `deleted`   | runner              | terminal                       |
| `failed`    | runner              | terminal (operator inspects)   |

## v1 limitations

- **Only `source: "docker"` is implementable end-to-end.** HuggingFace and
  Truss sources require a build step (HF → vLLM image, Truss → OCI image)
  that ships in Phase 7. The API accepts them and the pre-flight validates
  them, but this runner will mark them `failed` at the resolveImageUri
  step.
- **No customer billing meter yet.** RunPod cost lives on the RunPod side;
  Phase 7 wires a cost ingestor.
- **Single replica.** Concurrency is per-process via `MAX_CONCURRENT_JOBS`
  (default 4). Sharding across replicas can come later — BullMQ
  deterministic jobIds make it safe.

## Dev

```bash
cd workers/deploy-runner
npm install
cp .env.example .env.local
npm run dev
```

## Build + push

GitHub Actions builds + pushes to `ghcr.io/hav0ky/ahura-deploy-runner` on
every push to `ai`/`master`/`dev` that touches `workers/deploy-runner/**`.

Or locally:

```bash
docker build -t ghcr.io/hav0ky/ahura-deploy-runner:dev .
docker push ghcr.io/hav0ky/ahura-deploy-runner:dev
```

## Deploy

```bash
envsubst < k8s/secret.yaml.template | kubectl apply -f -
kubectl apply -f k8s/deployment.yaml
kubectl -n ahura logs -f deploy/ahura-deploy-runner
```
