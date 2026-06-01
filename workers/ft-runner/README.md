# ahura-ft-runner

BullMQ-driven orchestrator that turns `inference.finetunes` rows in
`status='queued'` into running RunPod pods, watches their heartbeats, and
cleans up on failure.

## Architecture

```
Next.js POST /jobs ──INSERT──> Postgres (inference.finetunes, status=queued)
                                          │
                                          │ (polled every 5s)
                                          ▼
                                       Claimer  ───enqueue──>  BullMQ
                                                                │
                                                  (1..N workers)│
                                                                ▼
                                       Lifecycle: provision pod, monitor
                                                                │
   training container ──HMAC POST──> /api/inference/fine-tuning/jobs/[id]/webhook
                                                                │
                              (DB status flips to completed/failed)
                                                                │
                                       Lifecycle observes terminal state, exits
```

Two responsibilities run inside the same process:

1. **Claimer** (`src/claimer.ts`) polls `inference.finetunes` every
   `CLAIM_POLL_INTERVAL_MS` (default 5s) and pushes new queued jobs into
   the BullMQ queue `ahura-inference-ft-runner`. Uses the finetune row's
   UUID as the BullMQ jobId, so a restart never double-enqueues.

2. **Worker** (`src/lifecycle.ts`) processes each enqueued job:
   - atomic claim (`UPDATE ... WHERE status='queued'`)
   - provision a RunPod pod with the Axolotl training image
   - flip the row to `status='running'` with `runpod_job_id`
   - poll loop:
     - watch DB for external cancellation or webhook-driven completion
     - watch heartbeat key in Upstash (TTL'd by the heartbeat receiver)
     - watch RunPod pod status for crashes
   - on stall (no heartbeat for `HEARTBEAT_STALL_MS × CONSECUTIVE_STALLS_TO_KILL`):
     terminate pod, mark `status='failed'`
   - on pod dead without webhook: mark `status='failed'`

Completion itself flows through the webhook handler in the Next.js app
(`app/api/inference/fine-tuning/jobs/[id]/webhook/route.ts`) — this runner
never marks a job `completed`, only `preparing` → `running` → `failed`.

## Dev

```bash
cd workers/ft-runner
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

You'll need:
- A reachable Postgres (Supabase) with the `inference` schema migrated
- A standard Redis (NOT Upstash REST) for BullMQ
- An Upstash REST Redis for heartbeat reads (can be the same physical Redis
  if you have one with both interfaces)
- A `RUNPOD_API_KEY` with pod-create permission
- The `ghcr.io/hav0ky/ahura-ft-axolotl` image published (see
  `infra/runpod/training-images/axolotl/` and
  `.github/workflows/ft-axolotl-image.yml`)

## Build + push image

Locally:

```bash
docker build -t ghcr.io/hav0ky/ahura-ft-runner:dev .
docker push ghcr.io/hav0ky/ahura-ft-runner:dev
```

Via GitHub Actions: pushes to `ai`, `master`, or `dev` trigger
`.github/workflows/ft-runner-image.yml`, which publishes
`ghcr.io/hav0ky/ahura-ft-runner:<branch>` + `:sha-<shortsha>`.

## Deploy

```bash
# 1. Fill secret.yaml.template with real values and apply
envsubst < k8s/secret.yaml.template | kubectl apply -f -

# 2. Apply Deployment
kubectl apply -f k8s/deployment.yaml

# 3. Verify
kubectl -n ahura logs -f deploy/ahura-ft-runner
kubectl -n ahura get pods -l app=ahura-ft-runner
```

Pulls from a private GHCR image require an `imagePullSecret`:

```bash
kubectl -n ahura create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=<gh-user> \
  --docker-password=<github-pat-with-read-packages>
```

## Tunables

| Env var | Default | Purpose |
|---|---|---|
| `MAX_CONCURRENT_JOBS` | `4` | BullMQ Worker concurrency. Per-replica. |
| `CLAIM_POLL_INTERVAL_MS` | `5000` | How often the Postgres claimer scans for queued rows. |
| `MONITOR_POLL_INTERVAL_MS` | `15000` | How often each running job's lifecycle polls DB + heartbeat + pod status. |
| `HEARTBEAT_STALL_MS` | `90000` | Heartbeat older than this counts as stale (training container POSTs every 30s; this is 3× cadence). |
| `CONSECUTIVE_STALLS_TO_KILL` | `3` | Consecutive stale checks before we terminate the pod. With defaults: ~45s of monitor ticks. |
| `JOB_LOCK_DURATION_MS` | `60000` | BullMQ job lock. Lifecycle extends in-flight implicitly via polling, not explicit `extendLock`. Bump if you see "missing lock" errors. |
| `HEALTH_PORT` | `8080` | k8s liveness/readiness HTTP port. |

## What this runner is NOT responsible for

- Marking jobs `completed` (the webhook receiver does that — it has the
  adapter URL + eval gate + model registration logic).
- Customer-facing webhooks (Phase 7, via Svix from inside the webhook
  receiver, not here).
- Cost accounting (Phase 7).
- Anything that needs to read user secrets (BYOK keys etc.) — those never
  leave the Next.js app.
