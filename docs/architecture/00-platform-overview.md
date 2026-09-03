# Platform Overview

**Verified against production on 2026-09-03, last re-read 17:06 UTC.** Numbers in
this document were read from the running system on that date and are stated as
observed.

AhuraSense is a sovereign-cloud platform: customers rent compute, storage,
GPUs, managed databases, Kubernetes clusters, game servers, domains and an
OpenAI-compatible inference gateway, and are billed hourly from a prepaid
wallet.

This document is the map. Each subsystem has its own document; this one explains
how they fit together and where the seams are.

---

## 1. The two applications

| | Customer app | Admin panel |
|---|---|---|
| Repo | `C:\cloud-services` (this one) | `C:\cloud-admin-panel` |
| Branch | `dev` (auto-deploys) | `feat/separate-admin-panel` |
| Host | `ahurasense.com` | `control.ahurasense.com` |
| Audience | customers | operators |

They share **one database**. That is the integration surface, and it is the
source of most of the coupling problems this documentation set records: the two
apps agree on table shapes rather than on an API, so a schema change in one can
silently break the other.

The admin panel was split out of the customer app. The customer app's own admin
console (`app/dashboard/admin/`, 25 pages and 81 components) was removed on
2026-09-03 (`dcaa5b1c`). The 77 API routes under `app/api/admin/` remain and are
served from `ahurasense.com`, referred to throughout as **the old admin**. The
object-storage and DDoS create flows branch into them for admin users, so
retiring them is separate work. At least one of those routes was writing prices
without the guards the panel uses (fixed 2026-09-03, commit `81e8599d`), and
`app/api/admin/users` trusted a `roles` column that any signed-in user could set
on their own row until the same afternoon (see [Data Model](04-data-model.md) §6).

---

## 2. Services offered

Twelve customer-facing service surfaces under `app/dashboard/services/`:

```
ai-agents   apps   apps-v1   compute   database   firewall
game        gpu    inference kubernetes network-ddos object-storage
```

Eleven are priced in the billing book (`billing.service_pricing`,
82 live rows on 2026-09-03):

| service_type | What it is | Provider |
|---|---|---|
| `compute` | VPS / virtual machines | Linode (resold) + self-hosted Proxmox |
| `gpu_pod` | GPU containers | RunPod (resold) |
| `gpu_pod_storage` | disk attached to a pod | RunPod |
| `gpu_volume` | standalone network volumes | RunPod |
| `database` | managed Postgres / MySQL / Mongo | self-hosted |
| `kubernetes` | managed clusters | DigitalOcean / Linode LKE |
| `objectspace` | S3-compatible object storage | self-hosted / R2 |
| `spectrum` | DDoS-protected network | Cloudflare Spectrum |
| `platform_apps` | Vercel-like PaaS | self-hosted Kubernetes |
| `custom_image` | customer OS images | storage-metered |
| `inference_vector` | vector stores | self-hosted |

Also live but billed through their own paths: **game servers** (Pterodactyl,
prepaid monthly rather than hourly), **domains** (name.com, one-off purchase and
renewal), and **inference** (deployments, fine-tunes and managed serving, metered
per second of GPU time).

---

## 3. Request flow, provisioning to charge

The same six steps apply to every hourly-metered service. Getting one of them
wrong is how the platform has lost money, so each is named:

```
1  QUOTE      the deploy page asks lib/pricing/price-book for a rate
2  PROVISION  the provider API is called (Linode, RunPod, k8s, …)
3  FREEZE     the agreed rate is written onto the resource row
4  METER      billing.service_meters gets an open row (service_type, service_id, plan_key)
5  SWEEP      hourly, scripts/billing/sweep.ts walks open meters
6  CHARGE     billing.charge_service_hour claims the hour and deducts the wallet
```

**Where this has broken, historically:**

- **Step 1 read a dropped table.** `config/pricing.ts` queried `public.products`
  after it was dropped on 2026-08-31; the empty result became
  `{ hourlyRate: 0 }` and a service whose price could not be found was quoted
  and billed as free. Fixed 2026-09-02 (`1b88cab0`).
- **Step 4 and step 6 disagreed on the plan key.** A Linode VM opened a meter
  keyed `g6-standard-1`; the charge book only held `s-2`/`d-4` style keys, so
  `charge_service_hour` returned `no-price` every hour, forever. Fixed
  2026-09-02 (`a6098a2d`).
- **Step 6 could take money without recording it.** Seventeen call sites moved a
  balance and then wrote the ledger row as a separate, discardable step. Fixed
  2026-09-03 (`46dbdac1`).
- **Step 6 had a second spine that kept no ledger.** `paas.charge_project_hour`
  debited the wallet every hour from 2026-08-28 and never wrote
  `billing.transactions`, so the drain was invisible on the customer's billing
  page and reported as uncollected accrual. Fixed 2026-09-03 (migration
  `20260903165150`); 823 rows backfilled.
- **Teardown would have billed the lifetime twice.** The v1 "final prorated
  charge" was `hourly_rate × (now − last_billed_at)`, and nothing had advanced
  `last_billed_at` since 2026-08-24, so it resolved to every hour the sweep had
  already billed. Found 2026-09-03 before any post-relaunch teardown ran; the
  deduction is gone.

See [Pricing & Billing](03-pricing-and-billing.md) for the full spine.

---

## 4. External dependencies

| Provider | Used for | Failure mode observed |
|---|---|---|
| **Linode** | VMs, LKE clusters | — |
| **RunPod** | GPU pods, volumes, fine-tune runners | inventory drifts; sync every 60s |
| **Cloudflare** | DNS, Spectrum, Workers (inference gateway) | — |
| **name.com** | domain registration | — |
| **Pterodactyl** | game server panel | — |
| **Stripe** | card payments, recurring top-ups | — |
| **storage.zxgateway.cc** | crypto currency glyphs | **does not resolve at all** — every crypto icon was broken until assets were brought in-repo on 2026-09-03 |
| **Supabase** | Postgres, auth, storage | see §5 |

The zxgateway entry is worth keeping in the table as a reminder: a third-party
asset host with no fallback is a single point of failure for something that can
be served from `public/` in 500 bytes.

---

## 5. Supabase / PostgREST

All database access is through Supabase. Two configuration facts have caused
outages and are easy to miss because neither produces an error the application
surfaces:

**Exposed schemas.** PostgREST will only serve schemas on an allow-list stored
as a role setting:

```sql
select unnest(setconfig) from pg_db_role_setting s
  join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator';
-- pgrst.db_schemas=public,paas,billing,inference,audits,support
```

On 2026-08-26 `billing` and `inference` were added and the list was **replaced
rather than appended**, dropping `audits` and `support`. Effects, none of which
looked like a configuration problem:

- support ticket creation returned "Failed to create support ticket" — **no
  ticket was created platform-wide between 12 Aug and 3 Sep**
- the audit trail silently stopped recording — **zero rows for 8 days**
- the activity feed rendered empty, which reads as "no activity"

Both schemas were restored on 2026-09-03. The dashboard's own Save did not
commit the change; it was applied directly to the role setting.

**Max rows.** The project caps every PostgREST response at **1000 rows**
regardless of the limit a client requests (verified: asked 3000, got 1000). Any
client-side aggregation over a table that can exceed 1000 rows will silently
under-count. This bit the admin monitor board before it shipped, and the sweep's
meter load and `lib/supabase/select-all.ts` paginate for the same reason
(2026-09-03).

---

## 6. Data model

Seven schemas, 206 base tables:

| Schema | Tables | RLS off | Contents |
|---|---|---|---|
| `public` | 78 | 0 | services, plans, catalogues, hosts, users |
| `inference` | 67 | 9 | AI Labs: models, deployments, traces, vectors |
| `billing` | 24 | 6 | wallet, prices, meters, charges, ledger, sweep runs |
| `paas` | 15 | 0 | platform-apps projects, deployments, domains |
| `audits` | 13 | 0 | append-only audit log, monthly partitions |
| `agentcore` | 6 | 0 | agent runs |
| `support` | 3 | 0 | tickets, messages, attachments |

`public` was at 8 until the afternoon of 2026-09-03, when the eight tables that
had been reachable with the anon key were locked down (migration
`20260903195000`; [Data Model](04-data-model.md) §6).

`audits` is **immutable by trigger** — `audits.prevent_audit_modification()`
raises on UPDATE and DELETE, and even the table owner cannot remove a row. This
is correct for an audit log and worth knowing before you try.

See [Data Model](04-data-model.md) for tables, keys and the guarded functions.

---

## 7. Deployment

```
push to dev  →  GitHub Actions (.github/workflows/deploy.yml)  →  ssh  →  Linode 172.236.172.246
```

- **`dev` auto-deploys to production.** There is no staging environment.
- **No test gate has run yet.** The working-tree `deploy.yml` (uncommitted on
  2026-09-03) makes the deploy wait on a `tsc --noEmit` job and runs vitest
  alongside without gating, so the failure count is at least visible; neither
  has executed. The suite is red (72 of 196 files failing as of 2026-09-03), and
  has been for long enough that a red suite carries no signal.
- Services are managed by systemd: `ahura-web`, `ahura-build-worker`, and three
  timers (`ahura-billing-sweep`, `ahura-game-renewals`,
  `ahura-domain-renewals`) that `deploy.yml` copies from `deploy/systemd/`,
  enables, and asserts active on every deploy, failing the deploy if one is not.
  `ahura-cron`, the v1 biller whose script was deleted in August, is disabled
  and masked by both `deploy.sh` and the workflow; until 2026-09-03 `deploy.sh`
  restarted it on every deploy.
- Database migrations are **not** applied by the pipeline. They are applied
  manually, which is why `supabase/migrations` has historically drifted behind
  the live schema — eleven migrations had to be reconstructed from
  `schema_migrations.statements` in late August. A `migration-drift.yml`
  workflow (uncommitted 2026-09-03; every 6 hours and on any push touching
  `supabase/migrations/`) compares the folder with `schema_migrations`; it needs
  the `SUPABASE_DB_URL` secret and exits 2 without it.

Other workflows build images (`ft-runner`, `ft-serving`, `deploy-runner`,
`gpu-os-images`) and run the billing watchdog (`billing-deadman.yml`, every 2
hours; [Pricing & Billing](03-pricing-and-billing.md) §7 lists the four
questions it asks).

---

## 8. Scheduled work

| Job | Where | Cadence | Notes |
|---|---|---|---|
| Hourly billing sweep | `ahura-billing-sweep.timer` → `scripts/billing/sweep.ts --apply` | `*:10:00`, up to 60s jitter | bills the hour just closed; **dry-run without `--apply`**; every run writes `billing.sweep_runs` |
| Game renewals | `ahura-game-renewals.timer` → `POST /api/internal/game/renewals` | every 15 min | prepaid monthly; had no caller 2026-08-24 → 09-03 |
| Domain renewals | `ahura-domain-renewals.timer` → `POST /api/domains/renewal/poll` | daily 09:05 UTC | had no caller 2026-08-24 → 09-03 |
| PaaS meter | Kubernetes CronJob `sweep-meter-apps` → `paas.charge_project_hour` | hourly at `:04` | `--apply` since 2026-08-28; its own spine, ledgered since 09-03 |
| Billing dead-man | `.github/workflows/billing-deadman.yml` | every 2h | four questions to the DB; exit 0 / 1 / 2 |
| Migration drift | `.github/workflows/migration-drift.yml` | every 6h, and on push | needs `SUPABASE_DB_URL` |
| RunPod inventory sync / reconcile | Cloudflare Worker | 60s / 5 min | GPU availability and pricing; closes meters for vanished pods |

The two renewal timers call their routes through
`scripts/ops/call-internal-route.ts`. All three unit files live in
`deploy/systemd/` and are installed by the deploy workflow. Before 2026-09-03
the sweep timer existed on the host only because someone had once run the
commands in `deploy/systemd/README.md` by hand, and the two renewal routes had
had no caller since the cron worker was deleted on 2026-08-24: three game
servers ran 29 days past `ends_at` with `auto_renew` on, $26/mo between them,
and nobody was charged, suspended or told. The workflow that guarantees the
timers was not yet pushed at 17:06 UTC on 2026-09-03; whether the two renewal
timers were already on the host by hand was not checked from this session.

**The sweep's schedule is accounted for.** `billing.service_charges` rows land
between `:10:00` and `:11:01` past every hour from 2026-08-31 10:10 to
2026-09-03 16:10, 79 consecutive fires without a miss; that is the timer above
(`OnCalendar=*:10:00`, `RandomizedDelaySec=60`). The two holes coverage had
surfaced were not scheduling failures. 08-31 07:00–08:00 is the window between
a manual run at 07:38 (which billed 06:00) and the timer's first fire at 10:10
(which billed 09:00); the timer was not installed yet. 09-02 16:00 → 09-03
02:00 had four charges every hour; only the compute meter was skipped, because
migration `20260902140000` (the `compute/*` markup row) was applied by hand at
about 15:00 on 09-02 while the sweep code that passes `servers.hourly_cost` as
the upstream cost (`a6098a2d`) was not pushed until 03:16 on 09-03, so
`resolve_hourly_rate` raised "markup requires upstream cost" every hour and the
sweep wrote PROBLEM to the journal. Detail in
[Pricing & Billing](03-pricing-and-billing.md) §6.

Deliberately still unscheduled: the grace-delete, grace-events and
bandwidth-sync routes. They are v1 machinery that reads `billing.active_*` and
`billing.service_lifecycle`, nothing writes `service_lifecycle` rows any more,
and the deletion executor treated a failed read as "already deleted".

---

## 9. Reading order

| # | Document | Read it when |
|---|---|---|
| 00 | this file | orienting |
| 01 | [GPU Pods](01-gpu-pods.md) | RunPod, pods, volumes, terminal proxy |
| 02 | [Inference & AI Labs](02-inference-ai.md) | the gateway, models, fine-tuning |
| 03 | [Pricing & Billing](03-pricing-and-billing.md) | anything about money |
| 04 | [Data Model](04-data-model.md) | schema, RLS, guarded functions |
| 05 | [Coupons & Discounts](05-coupons-and-discounts.md) | promo codes, rate discounts |
| 06 | [Admin Panel](06-admin-panel.md) | the operator surface and its split |
| 07 | [Current State](07-current-state.md) | "is this working right now?" |
