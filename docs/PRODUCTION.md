# AhuraCloud Production Runbook

Top-level guide for running the whole platform in production: what the moving
parts are, how they fit, and how to stand each one up. Per-subsystem deep-dives
exist and are cross-referenced in §15.

> Internal operator doc. It names upstream providers (Linode, Cloudflare,
> RunPod, DigitalOcean, OpenRouter, Proxmox, OVH, name.com, Jenkins, Stripe,
> Resend) on purpose. Those names must never appear on customer-facing surfaces.

**Last verified 2026-09-05.** Sections marked **[verified]** were checked against
the repository and the production database on that date. Sections marked
**[unverified]** describe the Linode host, Cloudflare, or LKE, none of which were
reachable from the session that wrote this. Treat those as the previous author's
account rather than confirmed fact, and correct them the first time you run them.

The previous revision of this file dated from 2026-07-01 and described a billing
system that has not existed since 2026-08-24. See §6.

---

## 0. Quick start [verified]

### Prerequisites
- **Node 22** in CI; workers pin `>=20.10`. The deploy workflow uses `node-version: '22'`.
- **Redis** reachable at `REDIS_URL` for BullMQ. Local: `docker run -p 6379:6379 redis:7`.
- A **Supabase** project with migrations applied. 228 migration files as of 2026-09-05.
- Root **`.env`** filled in (§11). There is no `.env.example` in the repo.

The app boots even if optional services are down. Redis being unreachable
degrades to build workers logging a warning.

### The web app
```bash
npm install
npm run dev          # local: custom server.ts (VNC proxy + in-proc build workers) on :3000
npm run dev:next     # Next-only, no custom server, no VNC
npm run build        # generate:openapi && next build
npm run start        # production: tsx server.ts  <- use this, see §3
```

### Inference gateway
```bash
cd workers/inference
npm install && npx wrangler login
npm run dev          # local edge on :8787
npm run deploy       # -> api.ahurasense.com/v1
```

### GPU/job workers
```bash
cd workers/ft-runner        # same scripts in workers/deploy-runner
npm install
npm run dev                # tsx watch; needs REDIS_URL, SUPABASE_*, RUNPOD_API_KEY
npm run build && npm start # in production these run on LKE, not by hand (§5)
```

### Billing
There is no separate cron process to start. The hourly sweep is a systemd timer
on the app host, installed by the deploy workflow. See §6 and §8.

```bash
node --experimental-strip-types --env-file=.env scripts/billing/sweep.ts
```

That is a dry run and moves no money. `--apply` is what charges.

### Tests and checks
```bash
npm run lint
npm test                     # vitest
npm run test:e2e             # playwright
npx tsc --noEmit             # this is what actually gates the deploy (§9)
```

---

## 1. Architecture at a glance

Four deployables on a shared data plane, plus a separate admin application.

| # | Deployable | Runtime | Home | Serves |
|---|---|---|---|---|
| ① | **Web app** (control plane) | Next.js, custom `server.ts` | Linode VM behind Cloudflare, apex `ahurasense.com` | marketing, dashboard, all `/api/*`, VNC console proxy, in-process build workers |
| ② | **Inference gateway** | Cloudflare Worker | CF edge, `api.ahurasense.com/v1` | OpenAI-compatible inference: auth, rate limit, spend caps, cache, proxy to OpenRouter |
| ③ | **GPU/job workers** | k8s Deployments | LKE, namespace `ahura` | `ft-runner`, `deploy-runner`, in-cluster Redis |
| ④ | **Billing timers** | systemd oneshot units | the app host | hourly sweep, domain renewals, game renewals |
| ⑤ | **Admin panel** | separate Next.js app | `control.ahurasense.com` | administration, **not in this repo** |

⑤ was split out of this app in `dcaa5b1c`, which removed 25 admin pages and 81
components from the customer bundle. Do not add admin surfaces here.

Shared data plane, all managed: **Supabase** Postgres (schemas `public`,
`billing`, `inference`, `agents`, `audits`), **Redis** (BullMQ), **Upstash** REST
(FT heartbeats), **R2**, **RunPod**, **OpenRouter**, **DigitalOcean**,
**Proxmox/OVH**, **name.com**, **Stripe** plus a crypto gateway, **Resend**.

---

## 2. External accounts required

[verified: the env var names exist in the codebase. Account status itself not checked]

| Provider | Used for | Key env |
|---|---|---|
| **Supabase** | Postgres, auth, pgvector | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*` |
| **Cloudflare** | DNS, the inference Worker (KV/Queues/DO), R2, Spectrum | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `R2_*`, `*_SPECTRUM` |
| **Linode** | the app VM and the LKE cluster | `LINODE_PAT`, `KUBE_CONFIG_STRING`, `KUBE_IP` |
| **RunPod** | GPU pods and Serverless | `RUNPOD_API_KEY` |
| **OpenRouter** | inference and embeddings upstream | `OPENROUTER_PLATFORM_KEY`, `OPENROUTER_API_KEY` |
| **DigitalOcean** | managed databases, Spaces | `DIGITAL_OCEAN_TOKEN`, `SPACES_ACCESS_KEY/SECRET` |
| **Proxmox / OVH** | VPS and public IPs | `PTERO_*`, `OVH_*`, `VNC_TOKEN_SECRET` |
| **name.com** | domain registrar | `NAMECOM_API_TOKEN`, `NAMECOM_USERNAME` |
| **Jenkins** | platform-app build pipeline, still in use | `JENKINS_URL`, `JENKINS_WEBHOOK_SECRET` |
| **Stripe** + ZX gateway | payments and top-ups | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ZXGATEWAY_*` |
| **Resend** | transactional email | `RESEND_API_KEY`, `RESEND_DOMAIN` |
| **GitLab / Bitbucket** | source OAuth for app deploys | `GITLAB_*`, `BITBUCKET_*` |

---

## 3. ① Web app [build verified, host config unverified]

Next.js App Router with a custom server and in-process BullMQ build workers.

### Run mode matters

| Start | Command | VNC console | In-proc build workers |
|---|---|---|---|
| **Custom server (use this)** | `npm run start`, which is `tsx server.ts` | yes | yes |
| Standalone | `node server.js`, which is what the Dockerfile CMD does | **no** | yes |

The VPS VNC console lives in `server.ts` as a WebSocket upgrade handler. Next's
standalone `server.js` does not include it, so the committed Dockerfile as-is
serves everything except the VNC console. Run the custom server under systemd or
pm2, or change the image entrypoint.

Build-time `NEXT_PUBLIC_*` ARGs are inlined into the browser bundle and must be
set at build, not only at run.

### Host configuration [unverified]

- DNS `A ahurasense.com` and `A www` to the VM, both proxied.
- SSL/TLS **Full (Strict)** with a Cloudflare Origin Certificate. Never Flexible.
- Firewall: 80/443 from Cloudflare ranges only, SSH from admin only.
- `REDIS_URL` must be the same Redis the LKE runners use.
- `PORT=3000`, `HOSTNAME=0.0.0.0`.

---

## 4. ② Inference gateway [unverified]

`workers/inference`, deployed with wrangler to `api.ahurasense.com/v1/*`.
Bindings: KV (`API_KEYS`, `SPEND`, `L1_CACHE`), Queues (`ahura-inference-audit`,
`ahura-inference-usage`), Durable Object (`RateLimiter`), and a `* * * * *` cron.

Requires **Workers Paid**. `BYOK_DEK` must be byte-identical across deploys or
stored BYOK keys brick. `BATCH_PROCESSOR_TOKEN` must equal the app's value or the
cron silently 401s.

Full procedure: [inference/migration-ahurasense.md](inference/migration-ahurasense.md).

---

## 5. ③ LKE workers [unverified]

Namespace `ahura`. Full runbook: [infra/k8s/lke/README.md](../infra/k8s/lke/README.md).

| Component | Does | Image |
|---|---|---|
| `redis` | in-cluster BullMQ broker | `redis:7-alpine` |
| `ft-runner` (x2) | claims fine-tuning jobs, drives RunPod training pods | `ghcr.io/cs2hvh/ahura-ft-runner:latest` |
| `deploy-runner` (x2) | claims BYO deployments, drives RunPod Serverless | `ghcr.io/cs2hvh/ahura-deploy-runner:latest` |

Images build in GitHub Actions on push to `dev`/`master`. There is **no
auto-rollout**, so after a new image:

```bash
kubectl -n ahura rollout restart deploy/ahura-ft-runner deploy/ahura-deploy-runner
```

---

## 6. ④ Billing [verified]

**This section replaces the previous revision's "Billing / domain cron", which
described a system that has been dead since 2026-08-24.**

### What went wrong, so nobody rebuilds it

Billing used to be `credit-system-cron/cron-worker.js`, a long-lived node-cron
process. That file was deleted from `dev` in `ef946da1`. Because the deploy pulls
`dev`, a restart on 2026-08-24 removed it from the host, and systemd restarted
the unit every ten seconds for six days while reporting "activating". Nothing on
the platform was billed for that period.

`credit-system-cron/` still exists in this repo but contains only
`package.json`, a lockfile and a workspace file. **There is no
`cron-worker.js`.** Any instruction to run `node cron-worker.js` is wrong. The
directory is a husk and should be deleted once someone confirms nothing
references it.

### What runs now

`scripts/billing/sweep.ts`, in this repo, driven by a systemd oneshot unit and
timer. Living in the repo is the actual fix: a deploy carries the script rather
than removing it.

```
ahura-billing-sweep.timer     OnCalendar=*:10:00     Persistent=true
```

The sweep bills the hour that has just **completed**. It takes `--apply` to move
money; without it it is a dry run, which is the default so that running it by
hand cannot charge anyone by accident.

The unit deliberately does **not** mask a non-zero exit. The sweep exits 1 when
it finds problems it did not bill, and listing that as a success status
previously hid an eleven-hour unbilled compute meter. A oneshot failing does not
stop its timer, so the next hour still runs.

Findings go to `billing.sweep_runs`, which the dead-man reads.

### The billing v2 spine

| Object | Role |
|---|---|
| `billing.service_pricing` | the price book, 72 live rows |
| `billing.current_price()` | resolves a price for a service and plan at a time |
| `billing.resolve_hourly_rate()` | converts a price row to an hourly rate |
| `billing.charge_service_hour()` | the idempotent per-hour charge, one row per (service, hour) |
| `billing.move_credit()` | every balance movement, with its ledger row |
| `billing.sweep_runs` | one row per sweep, with findings |
| `billing.meter_coverage()` | per-meter billed-versus-owed hours |
| `billing.unbilled_resources()` | live resources with no meter |
| `billing.revenue_daily()` | daily rollup, accrual reported separately from revenue |
| `billing.set_price()`, `billing.set_gpu_markup()` | guarded price writes. Never write the tables directly |

Price changes are **never retroactive**. Running resources keep the rate frozen
at create: `servers.hourly_cost` for compute, `gpu_pods.gpu_hourly_usd` for GPU
pods.

---

## 7. Database and migrations [verified]

Supabase Postgres. Schemas `public`, `billing`, `inference`, `agents`, `audits`.
**228 migration files** as of 2026-09-05. Baseline squash is
`20251115073901_remote_schema.sql`.

Rules that exist because they were broken:

1. Schema changes come from files in `supabase/migrations/`. Applying through the
   dashboard or an MCP tool without committing the file produces drift. That
   happened three times on 2026-09-03 alone, and forced eleven migrations to be
   reconstructed in late August.
2. The file's version must equal the version it was applied under. Rename the
   file, do not renumber the database.
3. Never edit an applied migration's SQL. Write a corrective migration.
   Comment-only corrections are fine; see `20260903200000` for precedent.
4. `.github/workflows/migration-drift.yml` runs on any push to `dev` touching
   `supabase/migrations/**` and compares files against
   `supabase_migrations.schema_migrations`.

Full procedure: [SUPABASE_MIGRATION_RUNBOOK.md](SUPABASE_MIGRATION_RUNBOOK.md).

---

## 8. Scheduled jobs [verified]

**A. systemd timers on the app host.** Installed by the deploy workflow since
2026-09-03. Before that they existed only because someone had once run the
commands in `deploy/systemd/README.md` by hand, which is part of why the billing
outage went unnoticed.

| Unit | Schedule | Does |
|---|---|---|
| `ahura-billing-sweep` | `*:10:00` | bills the completed hour |
| `ahura-domain-renewals` | `09:05 UTC` daily | charges domains expiring within 30 days |
| `ahura-game-renewals` | `*:00/15` | game server renewals |
| `ahura-build-worker` | service, not a timer | platform-app builds |

**B. GitHub Actions.**

| Workflow | Schedule | Does |
|---|---|---|
| `billing-deadman.yml` | `35 */2 * * *` | four-question check against a 3h threshold. Two-hourly against a 3h threshold so one skipped run cannot turn a real stoppage into a missed alert |
| `migration-drift.yml` | push to `dev` touching migrations | file-versus-database comparison |

**C. Inference Worker cron** [unverified], every minute, calling the app at
`CONTROL_PLANE_URL` with `BATCH_PROCESSOR_TOKEN`: serving-pod watchdog, finetune
watchdog, deployment meter, semantic cache GC.

---

## 9. CI/CD and what actually gates a deploy [verified]

`.github/workflows/deploy.yml`. Read this before trusting a green tick.

| Job | Gates the deploy? |
|---|---|
| `typecheck` (`tsc --noEmit`) | **Yes.** `deploy` needs it |
| `unit-tests` (`vitest run`) | **No.** `continue-on-error: true`, absent from `needs`, and the step is labelled "not gating yet" |
| `skip_checks: true` workflow input | bypasses even the typecheck |

So a push to `dev` with failing unit tests deploys to production. That is
deliberate and documented in the workflow itself, but it means the test suite is
informational until someone flips it.

Deployment is an SSH action to `secrets.DEPLOY_HOST` using password auth. `dev`
auto-deploys and there is no staging environment.

---

## 10. Async queues (BullMQ on Redis)

| Queue | Enqueued by | Consumed by |
|---|---|---|
| `app-build-queue` | app build routes | in-app build worker (`instrumentation.ts`) |
| `quick-build-queue` | hotfix flow | in-app build worker |
| `ahura-inference-ft-runner` | `enqueueFinetuneJob()` | `ft-runner` on LKE |
| `ahura-inference-deploy-runner` | `enqueueDeploymentJob()` | `deploy-runner` on LKE |

The app's in-process build workers and the LKE runners must share the same Redis.

---

## 11. Environment variables

Source of truth is the app's runtime `.env` plus per-component templates
(`infra/k8s/lke/.env.lke.template`, `workers/*/k8s/secret.yaml.template`, wrangler
secrets). There is no `.env.example`. Consumers: app ①, gateway ②, runners ③,
timers ④.

| Group | Vars | Where |
|---|---|---|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ①②③④ |
| **Redis / Upstash** | `REDIS_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | ①③ |
| **R2** | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_CUSTOM_IMAGES_BUCKET` | ①③ |
| **RunPod** | `RUNPOD_API_KEY`, `RUNPOD_TEMPLATE_ID`, `LORA_SERVING_ENDPOINT_ID` | ①③ |
| **Inference upstream** | `OPENROUTER_PLATFORM_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENAI_API_KEY`, `HF_TOKEN` | ①② |
| **App URLs** | `DOMAIN`, `APP_DOMAIN`, `NEXT_PUBLIC_INFERENCE_API_BASE`, `NEXT_PUBLIC_INFERENCE_API_ORIGIN`, `NEXT_PUBLIC_DASHBOARD_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `CONTROL_PLANE_URL`, `WEBHOOK_BASE_URL` | ①②③④ |
| **Encryption / tokens** | `BYOK_DEK`, `ENCRYPTION_KEY`, `VNC_TOKEN_SECRET`, `BATCH_PROCESSOR_TOKEN`, `CRON_SECRET`, `FT_WEBHOOK_SECRET` | ①②③④ |
| **DigitalOcean** | `DIGITAL_OCEAN_TOKEN`, `SPACES_ACCESS_KEY`, `SPACES_SECRET_KEY` | ① |
| **Cloudflare** | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN_SPECTRUM`, `CLOUDFLARE_ZONE_ID_SPECTRUM`, `PARENT_DOMAIN_SPECTRUM` | ① |
| **Proxmox / OVH** | `PTERO_DOMAIN`, `PTERO_API_KEY`, `OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET`, `OVH_CONSUMER_KEY`, `OVH_API_ENDPOINT` | ① |
| **name.com** | `NAMECOM_API_TOKEN`, `NAMECOM_USERNAME`, `NAMECOM_API_BASE_URL` | ① |
| **Jenkins** | `JENKINS_URL`, `JENKINS_WEBHOOK_SECRET`, `JENKINS_DEPLOYMENT_RECORD_SECRET` | ① |
| **Kubernetes** | `KUBE_IP`, `KUBE_CONFIG_STRING` | ① |
| **Payments** | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `ZXGATEWAY_API_KEY`, `ZXGATEWAY_API_SECRET`, `ZXGATEWAY_URL`, `ZXGATEWAY_PAYMENT_URL`, `NEXT_PUBLIC_ZXGATEWAY_STORAGE_URL` | ① |
| **Email** | `RESEND_API_KEY`, `RESEND_DOMAIN`, `RESEND_FROM_EMAIL` | ① |
| **Source OAuth** | `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`, `BITBUCKET_CLIENT_ID`, `BITBUCKET_CLIENT_SECRET` | ① |
| **Runtime** | `NODE_ENV`, `PORT`, `HOSTNAME`, `NODE_OPTIONS`, `MAX_CONCURRENT_JOBS`, `LOG_LEVEL`, `ADMIN_EMAILS`, `INFERENCE_OPERATOR_EMAILS` | ①③ |

Six keys were committed to git history and, as of 2026-09-05, have **not** been
rotated. They include `SUPABASE_SERVICE_ROLE_KEY` and `ENCRYPTION_KEY`. Rotating
them is outstanding work, not a completed step. See
[SENSITIVE_DATA_EXPOSURE_CHECKLIST.md](SENSITIVE_DATA_EXPOSURE_CHECKLIST.md).

---

## 12. First-time bring-up order

1. Data plane: Supabase project, apply migrations, Redis, R2 buckets, the accounts in §2.
2. LKE workers (§5).
3. Inference gateway (§4): Workers Paid, KV, Queues, secrets, deploy.
4. Web app (§3): build, env, Linode VM with the custom server, Cloudflare DNS and Full (Strict).
5. Billing (§6): the deploy workflow installs the timers. Confirm with `systemctl list-timers`.
6. Wire the loop: `CONTROL_PLANE_URL` on gateway and runners, `BATCH_PROCESSOR_TOKEN` identical on app and gateway, `FT_WEBHOOK_SECRET` identical on app and ft-runner.
7. Verify (§14).

---

## 13. Routine operations

```bash
# Billing: dry run, moves no money
node --experimental-strip-types --env-file=.env scripts/billing/sweep.ts

# Billing: what the timer runs
systemctl status ahura-billing-sweep.timer
journalctl -u ahura-billing-sweep -n 100

# Workers: pick up a new image
kubectl -n ahura rollout restart deploy/ahura-ft-runner deploy/ahura-deploy-runner

# Gateway: redeploy
cd workers/inference && npx wrangler deploy && npx wrangler tail

# App: rebuild and restart
npm run build && sudo systemctl restart ahura-app
```

---

## 14. Verify

Platform:
- `curl https://api.ahurasense.com/v1/health` returns 200.
- `curl https://ahurasense.com/` returns 200 through Cloudflare.
- Dashboard login plus one Playground inference call, which proves app to gateway and the CSP `connect-src`.
- `kubectl -n ahura get pods` all Running.
- Open a VPS console, which proves the custom server's `/ws/vnc` proxy is live.

Billing, the checks that would have caught the 2026-08-24 outage:

```sql
select max(period_start) from billing.service_charges;   -- the last completed hour
select * from billing.sweep_runs order by id desc limit 5;
select * from billing.meter_coverage(interval '24 hours');
select * from billing.unbilled_resources();
```

`meter_coverage` waits 75 minutes before considering an hour owed (60 for the
hour to close, 10 for the sweep, 5 of slack), so a stall it reports is real
rather than an artifact of looking too early.

---

## 15. Cross-references

| Topic | Doc |
|---|---|
| Architecture set, eight documents | [architecture/README.md](architecture/README.md) |
| Current platform state and known gaps | [architecture/07-current-state.md](architecture/07-current-state.md) |
| Pricing and billing internals | [architecture/03-pricing-and-billing.md](architecture/03-pricing-and-billing.md) |
| Data model, RLS posture, guarded functions | [architecture/04-data-model.md](architecture/04-data-model.md) |
| Admin panel split | [architecture/06-admin-panel.md](architecture/06-admin-panel.md) |
| Day logs | [worklog/](worklog/) |
| Supabase migrations | [SUPABASE_MIGRATION_RUNBOOK.md](SUPABASE_MIGRATION_RUNBOOK.md) |
| systemd units | [../deploy/systemd/README.md](../deploy/systemd/README.md) |
| Inference deep-dives | [inference/](inference/) |
| LKE cluster ops | [../infra/k8s/lke/README.md](../infra/k8s/lke/README.md) |
| Compute (VPS) service | [COMPUTE_SERVICE.md](COMPUTE_SERVICE.md) |
| Secrets checklist | [SENSITIVE_DATA_EXPOSURE_CHECKLIST.md](SENSITIVE_DATA_EXPOSURE_CHECKLIST.md) |

---

## 16. Known-stale neighbours

Do not trust these without checking:

- **`README.md`** (root), last touched 2026-03-23. Describes "Jenkins-driven
  Kubernetes deployment pipelines" as the deployment model. Jenkins is still used
  for platform-app builds, but the platform itself deploys over SSH from
  `.github/workflows/deploy.yml`.
- **`docs/DEPLOYMENT_COMPLETE_GUIDE.md`**, dated May 2026, is a roadmap document
  rather than a runbook, despite the name.
- **`credit-system-cron/`**, a husk with no worker source. See §6.
