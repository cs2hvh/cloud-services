# AhuraCloud — Production Runbook

Top-level guide for running the **whole platform** in production: what the moving
parts are, how they fit, and how to stand each one up. Per-subsystem deep-dives
already exist (billing, compute, inference, migrations) and are cross-referenced
at the bottom — this doc is the map that ties them together.

> Internal operator doc. It names upstream providers (Linode, Cloudflare, RunPod,
> DigitalOcean, OpenRouter, Proxmox, OVH, name.com, Jenkins, Stripe, Resend) on
> purpose — those names must never appear on **customer-facing** surfaces, but this
> runbook is for operators.

---

## 0. Quick start — prerequisites & commands

### Prerequisites
- **Node 20+** (workers pin `>=20.10`) and **npm**.
- A **Redis** reachable at `REDIS_URL` (BullMQ). Local: `docker run -p 6379:6379 redis:7` → `redis://localhost:6379`.
- A **Supabase** project (URL + service-role key) with migrations applied (`supabase db push`).
- Root **`.env`** filled in (see §10); each worker has its own env. For the CF worker: `npx wrangler login`.
- `npm install` in each package you intend to run (root, `workers/*`, `credit-system-cron`).

> The app boots even if optional services are down (e.g. Redis → build workers just log a warning).

### ① Web app — `c:\cloud-services`
```bash
npm install
npm run dev          # LOCAL: custom server.ts (VNC proxy + in-proc build workers), hot reload → http://localhost:3000
npm run dev:next     # alt: Next-only dev, no custom server / no VNC

npm run build        # PROD build: generate:openapi + next build
npm run start        # PROD run: tsx server.ts  ← USE THIS (start:next / node server.js skip the VNC console — see §3)
```

### ③ GPU/job workers — `workers/ft-runner` and `workers/deploy-runner`
```bash
cd workers/ft-runner          # (same scripts in workers/deploy-runner)
npm install
npm run dev                   # LOCAL: tsx watch src/index.ts (needs REDIS_URL + SUPABASE_* + RUNPOD_API_KEY)
npm run build && npm start    # PROD: tsc → node dist/index.js   (in prod these run on LKE — see §5, not by hand)
```

### ② Inference gateway — `workers/inference`
```bash
cd workers/inference
npm install
npx wrangler login
npm run dev          # local edge at http://localhost:8787
npm run deploy       # → api.ahurasense.com/v1   (npm run tail = live logs)
```

### ④ Billing/domain cron — `credit-system-cron`
```bash
cd credit-system-cron
npm install
node cron-worker.js  # always-on; needs DOMAIN, CRON_SECRET, SUPABASE_* in its .env
```

### Build workers (no separate command)
`app-build` / `quick-build` workers start **in-process** with the web app via
[instrumentation.ts](../instrumentation.ts) — running `npm run dev`/`start` is enough; they just need Redis.

### Tests & checks
```bash
npm run lint                 # next lint (root)
npm test                     # vitest (unit)
npm run test:e2e             # playwright
# in each worker dir:
npm run typecheck
```

### Minimal "just run the app locally" path
```bash
docker run -d -p 6379:6379 redis:7      # 1. Redis
#  2. ensure root .env has SUPABASE_*, REDIS_URL=redis://localhost:6379, etc. (no .env.example in repo — see §10)
npm install && npm run dev               # 3. → http://localhost:3000
```

---

## 1. Architecture at a glance

The platform is **four deployables** sitting on a shared **data plane**.

```
                       ┌─────────────────────────── customers ───────────────────────────┐
                       │                                                                  │
        ahurasense.com (apex, CF-proxied)                         api.ahurasense.com/v1 (CF edge)
                       │                                                                  │
            ┌──────────▼───────────┐                                   ┌──────────────────▼─────────────────┐
            │  ① WEB APP (control  │   internal HTTPS (BATCH_PROCESSOR  │  ② INFERENCE GATEWAY                │
            │  plane) — Next.js    │◀──TOKEN) cron every minute ────────│  Cloudflare Worker                  │
            │  custom server.ts    │                                   │  KV · Queues · Durable Object · cron │
            │  + in-proc build     │                                   └──────────────────┬─────────────────┘
            │    workers           │                                                      │ proxy
            │  + VNC WS proxy      │                                                  OpenRouter
            └───┬───────────┬──────┘
   enqueue (BullMQ)         │ HTTP API calls (provision/control)
                │           ▼
   ┌────────────▼───────┐  RunPod · DigitalOcean · Proxmox/OVH · name.com · Cloudflare · Jenkins · Stripe · Resend
   │ ③ LKE k8s WORKERS  │
   │  ft-runner         │  claim FT jobs  → RunPod training pods
   │  deploy-runner     │  claim deploys  → RunPod Serverless endpoints
   │  redis (BullMQ)    │
   └────────────────────┘

   ④ credit-system-cron (node-cron process) ──hourly/daily──▶ web app /api/internal/billing/* + /api/domains/*
```

Shared **data plane** (managed services, not "deployed" by us): **Supabase**
Postgres (schemas `public` / `billing` / `inference` / `agents` / `audits`),
**Redis** (BullMQ), **Upstash** REST (FT heartbeats), **R2** (datasets/adapters/
images), **RunPod** (GPU), **OpenRouter** (inference upstream), **DigitalOcean**
(managed DBs + Spaces), **Proxmox/OVH** (VPS), **name.com** (domains), **Stripe**
+ crypto gateway (payments), **Resend** (email).

| # | Deployable | Runtime | Home | Serves |
|---|---|---|---|---|
| ① | **Web app** (control plane) | Next.js, custom `server.ts` | self-hosted **Linode VM + Cloudflare**, apex `ahurasense.com` | marketing + dashboard + all `/api/*` + VNC console proxy + in-process build workers |
| ② | **Inference gateway** | Cloudflare Worker | CF edge, `api.ahurasense.com/v1` | OpenAI-compatible inference: auth, rate-limit, spend caps, cache, audit/usage, proxy to OpenRouter |
| ③ | **GPU/job workers** | k8s Deployments | **LKE** (Linode k8s), namespace `ahura` | `ft-runner` (fine-tuning), `deploy-runner` (BYO deployments), in-cluster Redis |
| ④ | **Billing/domain cron** | Node `node-cron` process | alongside the app (VM / small container) | hourly billing, grace lifecycle, domain sync/transfer/renewal, log cleanup |

---

## 2. External accounts required

| Provider | Used for | Key env |
|---|---|---|
| **Supabase** | Postgres + auth + pgvector | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*` |
| **Cloudflare** | DNS, the inference Worker (KV/Queues/DO), R2, Spectrum (DDoS) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `R2_*`, `*_SPECTRUM` |
| **Linode** | the app VM + the LKE k8s cluster | `LINODE_PAT` (provisioning), `KUBE_CONFIG_STRING`, `KUBE_IP` |
| **RunPod** | GPU pods (fine-tuning + serving) + Serverless (BYO deploy) | `RUNPOD_API_KEY` |
| **OpenRouter** | all inference + embeddings upstream | `OPENROUTER_PLATFORM_KEY` (gateway), `OPENROUTER_API_KEY` (app) |
| **DigitalOcean** | managed databases + Spaces (S3) | `DIGITAL_OCEAN_TOKEN`, `SPACES_ACCESS_KEY/SECRET` |
| **Proxmox / OVH** | VPS (KVM) + public IPs | `PTERO_*`(panel), `OVH_*`, `VNC_TOKEN_SECRET` |
| **name.com** | domain registrar (reseller) | `NAMECOM_API_TOKEN`, `NAMECOM_USERNAME` |
| **Jenkins** | platform-app build/deploy pipeline | `JENKINS_URL`, `JENKINS_WEBHOOK_SECRET` |
| **Stripe** (+ crypto gateway) | payments / credit top-ups | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRGATEWAY_*` |
| **Resend** | transactional email | `RESEND_API_KEY`, `RESEND_DOMAIN` |
| **HuggingFace** | gated model pulls (optional) | `HF_TOKEN` |
| **GitLab / Bitbucket** | source OAuth for app deploys | `GITLAB_*`, `BITBUCKET_*` |

---

## 3. ① Web app (control plane)

Next.js App Router with a **custom server** and **in-process BullMQ build
workers**. Marketing (`app/(marketing)/*`) and dashboard (`app/dashboard/*`) are
one app served from the apex.

### Build
3-stage [Dockerfile](../Dockerfile) (node:20-alpine → `npm ci` → `npm run build`
→ standalone runner). `npm run build` = `generate:openapi && next build`.
Build-time **ARGs** (inlined into the browser bundle, so they must be set at
build): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (and the `NEXT_PUBLIC_INFERENCE_API_*` /
`NEXT_PUBLIC_DASHBOARD_URL` / `NEXT_PUBLIC_SUPPORT_EMAIL` if overriding the
ahurasense defaults). Node heap is raised (`--max-old-space-size`) for both build
and run.

### ⚠️ Run mode matters — custom server vs standalone
There are **two** ways to start the app, and they are **not** equivalent:

| Start | Command | VNC console (`/ws/vnc`) | In-proc build workers |
|---|---|---|---|
| **Custom server** (✅ use this) | `npm run start` → `tsx server.ts` | ✅ yes | ✅ yes |
| Standalone | `node server.js` (what the [Dockerfile](../Dockerfile#L79) CMD does) | ❌ **no** | ✅ yes |

The VPS **VNC console** (noVNC → Proxmox) lives in [server.ts](../server.ts) as a
WebSocket upgrade handler. Next's standalone `server.js` does **not** include it.
**So the committed Dockerfile, as-is, serves everything except the VNC console.**
For the Linode deployment, run the **custom server**:

- **VM (simplest):** `npm ci && npm run build && npm run start` under **systemd**
  or **pm2** (auto-restart). This runs `tsx server.ts` → VNC + build workers + Next.
- **Container:** change the image entrypoint to the custom server (ship `server.ts`
  + `tsx` and run `npm run start`) instead of `node server.js`.

(The in-process build workers come from [instrumentation.ts](../instrumentation.ts)
`startBuildWorkers()` and run under **either** mode — they need `REDIS_URL`.)

### Run (Linode VM behind Cloudflare)
- Inject runtime env (see §10) — do **not** bake secrets into the image.
- DNS: `A ahurasense.com → <VM IP>` + `A www → <VM IP>`, both **proxied** (orange cloud).
- **SSL/TLS = Full (Strict)** with a Cloudflare **Origin Certificate** on the VM
  (never "Flexible" — redirect loops + plaintext origin).
- Firewall: allow 80/443 **only from Cloudflare IP ranges**; SSH from admin only.
  This also gives Proxmox/DO a single stable egress IP to allowlist for the app's
  outbound SSH/API calls.
- WebSocket `/ws/vnc` passes through CF proxied records automatically once Full(Strict) is set.
- `REDIS_URL` must be reachable from the VM and must be the **same Redis** the LKE
  runners use, or jobs won't be shared. `PORT=3000`, `HOSTNAME=0.0.0.0`.

Health: container `HEALTHCHECK` probes `GET /` (2xx/3xx = healthy). App-level
status endpoints exist under `/api/services/platform-apps/health` (authenticated).

---

## 4. ② Inference gateway (Cloudflare Worker)

Lives in [workers/inference](../workers/inference); deploys with `wrangler`.
Serves `api.ahurasense.com/v1/*`. Bindings: KV (`API_KEYS`, `SPEND`, `L1_CACHE`),
Queues (`ahura-inference-audit`, `ahura-inference-usage` — producers **and**
consumers), Durable Object (`RateLimiter`), `[vars]`, and a `* * * * *` cron.

**Full deploy + account-migration steps:** [docs/inference/migration-ahurasense.md](inference/migration-ahurasense.md).
Short version (from `workers/inference/`):

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "<account-id>"   # account_id is also pinned in wrangler.toml
# create KV namespaces + queues (queues need --message-retention-period-secs 86400), paste KV IDs into wrangler.toml
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # + OPENROUTER_PLATFORM_KEY, BYOK_DEK, BATCH_PROCESSOR_TOKEN
npx wrangler deploy
```

⚠️ **Requires Workers Paid** ($5/mo) — Queues, Durable Objects, and CPU limits are
Paid-only. `BYOK_DEK` must be byte-identical across deploys or stored BYOK keys
brick. `BATCH_PROCESSOR_TOKEN` must equal the app's value or the cron silently 401s.

The cron hits the **app** at `CONTROL_PLANE_URL` (= `https://ahurasense.com`) every
minute — so the gateway's watchdogs/metering only work once the app is live at the apex.

---

## 5. ③ LKE workers (fine-tuning + deployments)

Linode Kubernetes (LKE), namespace `ahura`. Full runbook:
[infra/k8s/lke/README.md](../infra/k8s/lke/README.md).

| Component | What it does | Image |
|---|---|---|
| `redis` | in-cluster BullMQ broker (10GB PVC, `noeviction`) | `redis:7-alpine` |
| `ft-runner` (×2) | claims queued fine-tuning jobs → RunPod training pods, monitors heartbeats | `ghcr.io/cs2hvh/ahura-ft-runner:latest` |
| `deploy-runner` (×2) | claims BYO deployments → RunPod Serverless endpoints | `ghcr.io/cs2hvh/ahura-deploy-runner:latest` |

Both runners use a **DB-poll + BullMQ hybrid**: Postgres is the source of truth
(claimer polls every ~5s); BullMQ just removes the poll latency.

### Bring-up
```bash
export LINODE_PAT=<token>
bash infra/k8s/lke/01-create-cluster.sh           # provisions cluster → ~/.kube/lke-ahura.yaml
export KUBECONFIG=$HOME/.kube/lke-ahura.yaml
cp infra/k8s/lke/.env.lke.template ~/.ahura-lke.env   # fill in real values (lives OUTSIDE the repo)
set -a; source ~/.ahura-lke.env; set +a
bash infra/k8s/lke/02-apply-all.sh                # namespace → redis → runner secrets (envsubst) → runner deployments
kubectl -n ahura get pods                          # redis-*, ahura-ft-runner-*, ahura-deploy-runner-*
```
`CONTROL_PLANE_URL` in `~/.ahura-lke.env` must be `https://ahurasense.com` so the
runners' completion webhooks reach the app.

### Images (CI)
Built by **GitHub Actions** (`.github/workflows/*-image.yml`) on push to
`dev`/`master` and pushed to `ghcr.io/cs2hvh/*`. Deployments pull `:latest`
(`imagePullPolicy: Always`) — there is **no auto-rollout**, so after a new image:
```bash
kubectl -n ahura rollout restart deploy/ahura-ft-runner deploy/ahura-deploy-runner
```
GPU pod OS images + the Axolotl training / vLLM serving images are also built here
(see [infra/runpod/os-images/README.md](../infra/runpod/os-images/README.md)).

---

## 6. ④ Billing / domain cron

[credit-system-cron/](../credit-system-cron) is a **standalone Node `node-cron`
process** (own `package.json`) — not part of the Next app. It calls the app's
internal endpoints on a schedule, authenticated with `CRON_SECRET`. Run it as an
always-on process next to the app (systemd/pm2/small container):

```bash
cd credit-system-cron && npm ci && node cron-worker.js   # needs DOMAIN, CRON_SECRET, SUPABASE_*
```
Point `DOMAIN` at `https://ahurasense.com`. Jobs are listed in §8.

---

## 7. Database & migrations

Supabase Postgres. Schemas: `public`, `billing`, `inference`, `agents`, `audits`.
~127 timestamped migrations in [supabase/migrations/](../supabase/migrations);
baseline squash = `20251115073901_remote_schema.sql` (older files squashed into it
— the "deleted migration" noise in git is that cleanup). Apply with the Supabase
CLI; full procedure + rollback in [docs/SUPABASE_MIGRATION_RUNBOOK.md](SUPABASE_MIGRATION_RUNBOOK.md):

```bash
supabase db push        # apply pending migrations (service role)
```

---

## 8. Scheduled jobs

Two independent cron systems:

**A · `credit-system-cron` (node-cron → app internal endpoints)**
| Job | Cadence | Does |
|---|---|---|
| Hourly billing cycle | `0 * * * *` | charge all active services (k8s, db, object storage, spectrum, apps, compute, custom images) via `billing.bill_service_cycle_atomic()` |
| Grace reminders / deletion / outbox | hourly (within billing job) | reminders at 3d/1d/6h, auto-delete expired, flush notifications |
| Domain contact sync | `0 * * * *` | retry ICANN registrant setup |
| Domain transfer poll | `*/30 * * * *` | poll name.com transfer status |
| Domain renewal billing | `0 9 * * *` | charge domains expiring ≤30d |
| Build-log cleanup | `20 3 * * *` | delete archived build logs from object storage |

**B · Inference Worker cron (`* * * * *`)** → app `/api/inference/internal/*` (Bearer `BATCH_PROCESSOR_TOKEN`)
| Job | Cadence | Does |
|---|---|---|
| Serving-pod watchdog | every min | reap idle hosted-serving pods past `auto_stop_at` |
| Finetune watchdog | every 5 min | reap orphaned FT jobs + zombie GPU pods |
| Deployment meter | every 5 min | meter BYO deployment GPU worker-seconds |
| Semantic cache GC | hourly | `inference.gc_semantic_cache()` |

---

## 9. Async queues (BullMQ on Redis)

| Queue | Enqueued by | Consumed by |
|---|---|---|
| `app-build-queue` | app build routes | in-app build worker ([instrumentation.ts](../instrumentation.ts)) |
| `quick-build-queue` | hotfix flow | in-app build worker (higher concurrency) |
| `ahura-inference-ft-runner` | `enqueueFinetuneJob()` | `ft-runner` (LKE) |
| `ahura-inference-deploy-runner` | `enqueueDeploymentJob()` | `deploy-runner` (LKE) |

⚠️ The app's in-process build workers and the LKE runners must share the **same
Redis** instance.

---

## 10. Environment variables

Source of truth: the app's runtime env (root `.env`), plus per-component templates
(`infra/k8s/lke/.env.lke.template`, `workers/*/k8s/secret.yaml.template`,
`workers/inference` secrets). Grouped by subsystem; **🔑 = secret**. "Where" =
which deployable consumes it (app ①, gateway ②, runners ③, cron ④).

| Group | Vars | Where |
|---|---|---|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`🔑, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`🔑 | ①②③④ |
| **Redis / Upstash** | `REDIS_URL`🔑, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`🔑 | ①③ |
| **R2** | `R2_ACCESS_KEY_ID`🔑, `R2_SECRET_ACCESS_KEY`🔑, `R2_ENDPOINT`, `R2_CUSTOM_IMAGES_BUCKET` | ①③ |
| **RunPod** | `RUNPOD_API_KEY`🔑, `RUNPOD_TEMPLATE_ID`, `LORA_SERVING_ENDPOINT_ID` | ①③ |
| **Inference upstream** | `OPENROUTER_PLATFORM_KEY`🔑, `OPENROUTER_API_KEY`🔑, `OPENROUTER_BASE_URL`, `OPENAI_API_KEY`🔑, `HF_TOKEN`🔑 | ①② |
| **App URLs** | `DOMAIN`, `APP_DOMAIN`, `NEXT_PUBLIC_INFERENCE_API_BASE`, `NEXT_PUBLIC_INFERENCE_API_ORIGIN`, `NEXT_PUBLIC_DASHBOARD_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `CONTROL_PLANE_URL`, `WEBHOOK_BASE_URL` | ①②③④ |
| **Encryption / tokens** | `BYOK_DEK`🔑, `ENCRYPTION_KEY`🔑, `VNC_TOKEN_SECRET`🔑, `BATCH_PROCESSOR_TOKEN`🔑, `CRON_SECRET`🔑, `FT_WEBHOOK_SECRET`🔑 | ①②③④ |
| **DigitalOcean** | `DIGITAL_OCEAN_TOKEN`🔑, `SPACES_ACCESS_KEY`🔑, `SPACES_SECRET_KEY`🔑 | ① |
| **Cloudflare DNS / Spectrum** | `CLOUDFLARE_API_TOKEN`🔑, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN_SPECTRUM`🔑, `CLOUDFLARE_ZONE_ID_SPECTRUM`, `PARENT_DOMAIN_SPECTRUM` | ① |
| **Proxmox / OVH** | `PTERO_DOMAIN`, `PTERO_API_KEY`🔑, `OVH_APPLICATION_KEY`🔑, `OVH_APPLICATION_SECRET`🔑, `OVH_CONSUMER_KEY`🔑, `OVH_API_ENDPOINT` | ① |
| **name.com** | `NAMECOM_API_TOKEN`🔑, `NAMECOM_USERNAME`, `NAMECOM_API_BASE_URL` | ① |
| **Jenkins** | `JENKINS_URL`🔑, `JENKINS_WEBHOOK_SECRET`🔑, `JENKINS_DEPLOYMENT_RECORD_SECRET`🔑 | ① |
| **Kubernetes (control)** | `KUBE_IP`, `KUBE_CONFIG_STRING`🔑 | ① |
| **Payments** | `STRIPE_SECRET_KEY`🔑, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`🔑, `CRGATEWAY_API_KEY`🔑, `CRGATEWAY_API_SECRET`🔑, `CRGATEWAY_URL` | ① |
| **Email** | `RESEND_API_KEY`🔑, `RESEND_DOMAIN`, `RESEND_FROM_EMAIL` | ① |
| **Source OAuth** | `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`🔑, `BITBUCKET_CLIENT_ID`, `BITBUCKET_CLIENT_SECRET`🔑 | ① |
| **Runtime** | `NODE_ENV`, `PORT`, `HOSTNAME`, `NODE_OPTIONS`, `MAX_CONCURRENT_JOBS`, `LOG_LEVEL`, `ADMIN_EMAILS`, `INFERENCE_OPERATOR_EMAILS` | ①③ |

---

## 11. First-time bring-up order

1. **Provision the data plane:** Supabase project + `supabase db push` migrations; Redis (shared); R2 buckets; the SaaS accounts in §2.
2. **LKE workers** (§5): create cluster, apply manifests, set runner secrets.
3. **Inference gateway** (§4): Workers Paid, KV/Queues/secrets, `wrangler deploy`.
4. **Web app** (§3): build, set env, deploy on the Linode VM (custom server), Cloudflare DNS + Full(Strict) origin cert.
5. **Cron** (§6): start `credit-system-cron` pointed at the app.
6. **Wire the loop:** `CONTROL_PLANE_URL` (gateway + runners) = `https://ahurasense.com`; `BATCH_PROCESSOR_TOKEN` identical on app + gateway; `FT_WEBHOOK_SECRET` identical on app + ft-runner.
7. **Verify** (§13).

---

## 12. Routine operations

```bash
# Workers: pick up a new image
kubectl -n ahura rollout restart deploy/ahura-ft-runner deploy/ahura-deploy-runner
kubectl -n ahura logs -f deploy/ahura-ft-runner

# Gateway: redeploy after a code/config change
cd workers/inference && npx wrangler deploy
npx wrangler tail                         # live logs

# App: rebuild + restart (systemd example)
npm run build && sudo systemctl restart ahura-app

# DB: apply a new migration
supabase db push
```

---

## 13. Verify

- `curl https://api.ahurasense.com/v1/health` → 200 (gateway).
- `curl https://ahurasense.com/` → 200 (app via CF, Full-Strict).
- A dashboard login + one inference call from the Playground (proves app→gateway + CSP `connect-src`).
- `kubectl -n ahura get pods` all `Running`; submit a tiny fine-tune → reaches `ft-runner`.
- A pod past its idle deadline auto-stops (proves gateway cron → app `CONTROL_PLANE_URL` + `BATCH_PROCESSOR_TOKEN`).
- Open a VPS **console** (proves the custom server's `/ws/vnc` proxy is live — the run-mode gotcha in §3).
- Stripe/crypto top-up credits an org; the hourly cron bills an active service.

---

## 14. Cross-references

| Topic | Doc |
|---|---|
| Domain migration (cs2hvh → ahurasense) | [inference/migration-ahurasense.md](inference/migration-ahurasense.md) |
| Inference: fine-tuning + deployments architecture | [inference/fine-tuning-and-deployments.md](inference/fine-tuning-and-deployments.md) |
| LKE cluster provisioning + ops | [../infra/k8s/lke/README.md](../infra/k8s/lke/README.md) |
| GPU OS / training / serving images | [../infra/runpod/os-images/README.md](../infra/runpod/os-images/README.md) |
| Compute (VPS) service | [COMPUTE_SERVICE.md](COMPUTE_SERVICE.md) |
| Billing behavior + grace lifecycle | [BILLING_BEHAVIOR.md](BILLING_BEHAVIOR.md), [BILLING_GRACE_AUTO_DELETE_PLAN.md](BILLING_GRACE_AUTO_DELETE_PLAN.md) |
| Platform-app deploy pipeline | [DEPLOYMENT_COMPLETE_GUIDE.md](DEPLOYMENT_COMPLETE_GUIDE.md) |
| Supabase migrations | [SUPABASE_MIGRATION_RUNBOOK.md](SUPABASE_MIGRATION_RUNBOOK.md) |
| Secrets / data-exposure checklist | [SENSITIVE_DATA_EXPOSURE_CHECKLIST.md](SENSITIVE_DATA_EXPOSURE_CHECKLIST.md) |
