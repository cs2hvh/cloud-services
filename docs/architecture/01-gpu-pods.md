# GPU Pods — Architecture Reference

**Service:** GPU Cloud (on-demand GPU compute)
**Upstream provider:** RunPod
**Status:** Live in production
**Last verified against running system:** 2026-09-01; the billing sections (§4 teardown, §5, §7) re-read 2026-09-03

---

## 1. What this service is

A customer picks a GPU, a container image and a disk size, and gets a running
container on a machine with that GPU attached, reachable over SSH, with a public
HTTPS URL for any HTTP port the image exposes. They are billed per hour for as
long as it runs.

We do not own GPUs. Every pod runs on **RunPod**, and the platform is a
control plane over their API: catalogue, quoting, provisioning, lifecycle,
metering and teardown. The customer never sees RunPod named anywhere.

**Scale today:** 48 GPU models in the catalogue, 96 live (GPU × cloud-type)
inventory rows, 14 deploy templates, 15 pods created to date, 4 network volumes.

---

## 2. Component map

```
                    ┌──────────────────────────────────────┐
   Customer ───────▶│  Next.js app (ahura-web, Linode)     │
                    │  /dashboard/services/gpu/*           │
                    └───────────────┬──────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │  app/api/services/gpu/*  (10 routes) │
                    │  auth · rate limit · idempotency     │
                    └───────────────┬──────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │  lib/services/runpod/  (service layer)│
                    │  pod-lifecycle · pod-read · inventory │
                    │  templates · volumes · client         │
                    └──────┬────────────────────┬───────────┘
                           │                    │
              ┌────────────▼──────┐   ┌─────────▼──────────┐
              │  Supabase         │   │  RunPod            │
              │  (Postgres)       │   │  REST + GraphQL    │
              │  7 gpu_* tables   │   │                    │
              └───────────────────┘   └────────────────────┘
                           ▲
                           │  every minute / every 5 min
              ┌────────────┴──────────────────────────┐
              │  Cloudflare Worker (ahura-inference-  │
              │  edge) — inventory sync, reconcile    │
              └───────────────────────────────────────┘
                           ▲
              ┌────────────┴──────────────────────────┐
              │  systemd timer (Linode) — hourly      │
              │  billing sweep                        │
              └───────────────────────────────────────┘
```

---

## 3. Data model

Seven tables in `public`, plus two billing tables in `billing`.

### `gpu_catalog` — what GPUs exist (48 rows)

The curated list. `runpod_gpu_id` maps our slug to RunPod's identifier;
`is_active` governs what customers are offered.

| Column | Purpose |
|---|---|
| `id` | our slug, e.g. `h100-sxm-80` |
| `runpod_gpu_id` | provider's id |
| `display_name`, `memory_gb`, `tier`, `sort_order` | presentation |
| `is_active` | false hides it from customers |

**Auto-discovery:** the sync materialises a catalogue row for any GPU RunPod
offers that we do not know. See §6 for the deactivation trap this caused.

### `gpu_inventory_snapshots` — stock and price over time

Append-only. One row per (GPU, cloud type, datacentre) per sync run.

| Column | Purpose |
|---|---|
| `stock_status` | `high` / `medium` / `low` / `none` |
| `available_counts` | e.g. `[1,2,4,8]` — pod sizes RunPod can satisfy |
| `on_demand_per_hr`, `spot_per_hr` | RunPod's price **to us** |
| `observed_at` | when we looked |

Retention is **24 hours**, enforced by the sync itself. See §6.

### `gpu_inventory_latest` — the newest row per key (view, 96 rows)

What every read path actually uses. Implemented as a **loose index scan**, not
`DISTINCT ON`. See §6 — this one was an outage.

### `gpu_pricing` — markup over RunPod's price (192 rows)

Keyed `(gpu_catalog_id, cloud_type, interruptible)`. `markup_pct` is currently
**1.000 across every row** — GPU is resold at exactly what RunPod charges,
a product decision taken 2026-08-26. `floor_per_hour_usd` is 0.

> `computeResalePerHour()` refuses a markup below 1.0, and the table now carries
> a CHECK saying the same: the system can sell at cost but never under it.

### `gpu_pods` — the pods themselves (31 columns)

| Group | Columns |
|---|---|
| Identity | `id` (bigint), `billing_service_id` (uuid), `runpod_pod_id`, `owner_id` |
| Spec | `gpu_catalog_id`, `gpu_count`, `cloud_type`, `interruptible`, `image_name`, `template_id`, `container_disk_gb`, `volume_gb`, `network_volume_id` |
| Runtime | `status`, `public_ip`, `port_mappings`, `ssh_command`, `details` |
| Money | `hourly_cost_usd` (the all-in rate shown to the customer, GPU plus storage), `gpu_hourly_usd` (GPU-only, `gpu_count` included, storage excluded; added 2026-09-03 and what the sweep bills through the `gpu_pod` / `*` passthrough), `runpod_cost_per_hr` (per GPU, what RunPod charges us), `billing_start`, `billing_end` |
| Secrets | `env_blob` (AES-256-GCM), `terminal_key_blob` (AES-256-GCM) |

**Two ids on purpose.** `id` is a bigint for humans and URLs;
`billing_service_id` is a uuid because the billing spine is uuid-keyed
throughout. Every billing join uses the uuid; nothing addresses a pod by name.

### `gpu_templates` (14) and `gpu_network_volumes` (4)

Templates are the curated image list — the deploy wizard offers these, and a
non-custom deploy uses the **catalogue's** image, never a client-supplied
string. `env_hints` carries capability flags (`jupyter: "8888"`,
`password_auth: false`) that drive both the wizard's UI and provisioning.

Volumes are persistent network disks that outlive a pod. They carry their own
`billing_service_id` (added 2026-08-31 — see §7).

### `gpu_pod_events` (32) — an append-only audit of lifecycle actions.

---

## 4. Provisioning flow

`podLifecycleOperations.createPod()` — ten ordered steps, and the order is the
design.

```
 1  Validate            name charset/length, gpuCount 1–8, disk 10–2000 GB
 2  Quota               MAX_PODS_PER_USER = 5
 3  Resolve             gpu_catalog → gpu_pricing → gpu_inventory_latest
                        rate = max(observed × markup_pct, floor) × gpuCount
                             + storage (container_disk + volume, $0.10/GB/mo)
 4  Balance gate        atomically HOLD 1 hour of cost BEFORE provisioning
 5  Prepare env         SSH keys, Jupyter token, optional root password
 6  Reserve DB row      BEFORE calling RunPod — the rollback anchor
 7  Call RunPod         full rollback on failure (DELETE the pod, release hold)
 8  Persist             IP, port mappings, ssh command
 9  Wire billing        open the meter — no upfront charge, the sweep bills hourly
10  Audit               gpu_pod_events row
```

**Why the DB row comes before the API call (step 6 before 7).** If RunPod
succeeds and our insert then fails, we have a running pod nobody is billed for
and nothing knows about. Reserving first means the worst case is a DB row with
no pod, which reconcile cleans up. The expensive failure is made impossible; the
cheap one is made recoverable.

**Why a 1-hour hold rather than an upfront charge (step 4).** The customer must
be able to afford at least an hour before we spend money on their behalf, but
charging upfront then refunding on failure is two ledger movements for something
that may never run. The hold is released by `settleProvision` on success and
refunded exactly once in the `finally` on any non-settle exit.

**The rate is FROZEN at checkout.** `hourly_cost_usd` is written once. Upstream
price drift never re-prices a running pod — the customer pays what they were
quoted.

### Power actions

`start` / `stop` / `restart`. Stopping releases the GPU upstream but keeps the
disk, so the meter is **re-rated to storage-only** and restored on start. That
mirrors how RunPod charges us.

### Teardown

```
1  Destroy on RunPod   best-effort — DB cleanup must happen regardless
2  Close billing       close both meters; the partial final hour is not billed
3  Mark terminated     status + billing_end
```

Step 1 is best-effort on purpose: if RunPod is unreachable, refusing to close
billing would keep charging for a pod the customer asked to delete.

Step 2 deducts nothing since 2026-09-03. The v1 "final prorated charge" in
`closeActiveBilling` was `hourly_rate × (now − last_billed_at)`, and
`last_billed_at` was only ever advanced by the cron worker deleted on
2026-08-24, so at teardown it would have re-billed every hour the sweep had
already charged: a 30-day pod would have paid for 720 hours twice. Found by
reading the two paths side by side, before any post-relaunch teardown had run.
The v1 number is now logged for comparison and not deducted; under-charging by
up to an hour is the safe error while the sweep bills only whole completed
hours.

---

## 5. Scheduled work

| Job | Where | Cadence | What it does |
|---|---|---|---|
| **Inventory sync** | Cloudflare Worker | every minute | Two GraphQL queries (SECURE + COMMUNITY), probes pod sizes 1–10, writes ~94 snapshot rows, prunes past 24h |
| **GPU reconcile** | Cloudflare Worker | every 5 min | Fetches each live pod from RunPod; detects spot interruption (404), state drift, upstream deletion; **closes billing for pods that vanished** |
| **Billing sweep** | `ahura-billing-sweep.timer`, Linode; installed by every deploy since 2026-09-03 | hourly at `:10` | Charges one hour per open meter; records the run in `billing.sweep_runs` |

Both worker jobs are single-flighted through a Redis NX lock, so a slow run
cannot overlap itself.

**Reconcile matters more than it looks.** A spot pod can be interrupted at any
moment. Without reconcile the pod is gone upstream while our meter keeps
running — which is exactly how phantom meters accumulate. It closes billing for
disappeared pods, keyed on `runpod_pod_id`, never on a name.

---

## 6. Incidents this design carries scars from

### The deploy page timed out intermittently (2026-09-01)

`gpu_inventory_latest` was `DISTINCT ON` over `gpu_inventory_snapshots`, which
made Postgres read **every** row to emit 96. The table had reached **1,022,889
rows** because the sync writes all 94 keys every minute regardless of change —
**152 of 153 consecutive snapshots were byte-identical** — and nothing reaped
them. It got slower daily until it crossed the statement timeout, which is why
it failed sometimes and not others.

Two fixes, both needed:

1. The index was subtly wrong: `(gpu_catalog_id, cloud_type, observed_at DESC)`
   omitted `coalesce(data_center_id,'')` from the **middle** of the sort key, so
   the plan carried an Incremental Sort over a million rows. Cost 135,555 →
   48,169.
2. That still walked all rows (5.2s). The view now uses a **loose index scan**:
   a recursive self-join walks the 96 distinct keys via "next key greater than
   this", then one seek each for the newest row. ~192 seeks regardless of size.

**5,258 ms → 3 ms.** Retention of 24h was added so the table cannot grow back,
but the read is now independent of it — pruning alone would have fixed the day
and reintroduced the problem in a fortnight.

### Deactivating a GPU did not work (2026-08-26)

`getKnownCatalog()` filtered on `is_active`, which made deactivated rows
invisible to the sync's "do we know this GPU?" check — so auto-discovery treated
each one as new and upserted it straight back with `is_active: true`, within 60
seconds. Three RTX PRO Blackwell SKUs that RunPod lists but refuses to deploy
kept being offered to customers whose create call always failed. The filter was
removed: `is_active` governs what customers see, not whether the sync believes
the row exists.

### Customers were shown provider errors (2026-09-01)

`ServiceResult.error` was set to raw `e.message` throughout the service layer,
and routes forwarded it as `error: result.error || "fallback"`. A customer saw a
raw provider schema-validation dump naming the upstream and its API path. Fixed
at the service layer — all catches log the raw error and return a generic
message — and `tests/unit/customer-facing-errors.test.ts` prevents regression.

### GPU pod creation was broken for a day (2026-08-31 → 09-01)

`gpu_pricing` was dropped while retiring the v1 pricing tables, on the reasoning
that `billing.service_pricing` replaces it. True for billing; **false for
provisioning** — `createPod` reads `gpu_pricing` to compute the frozen rate and
throws if the query fails.

It went unnoticed because the sync also touches that table but only when
auto-discovering an unseen GPU, and logs that failure non-fatally. Snapshots
kept landing every minute and every dashboard kept showing live stock while the
thing customers actually do was dead. **A busy-looking system is not a working
one.**

---

## 7. Billing integration

GPU is billed by **two meters per pod**, because it is two billable things on
different rules:

| Meter | Charged when | Rate model |
|---|---|---|
| `gpu_pod` | pod is **running** | `markup` — RunPod's price × `markup_pct` × GPU count |
| `gpu_pod_storage` | pod is **running or stopped** | `per_gb_hour` — `$0.10/GB/month` |

A stopped pod releases the GPU upstream but keeps its disk, and RunPod keeps
charging us for the disk. Splitting the meters is what lets a stopped pod bill
storage-only, and what puts GPU and storage on an invoice as separate lines.

`gpu_volume` is a third, independent meter at `$0.08/GB/month` (since
2026-09-02 12:00 UTC; `$0.0875` before) — network
volumes outlive pods, so they are metered on their own lifecycle. They had
**never been billed** before 2026-08-31, because they had no uuid key the
billing spine could reference.

Meters open in `settleProvision` and close in `closeActiveBilling`, both in
`config/billing-flow.ts`, so GPU inherits metering rather than implementing it.
`settleProvision` still writes the v1 `billing.active_*` row as well, as
metadata only; nothing bills from it. Full detail in the billing architecture
doc.

---

## 8. Security posture

**Secrets at rest.** `env_blob` and `terminal_key_blob` are AES-256-GCM with
per-record salt and pbkdf2 (100,000 iterations). Neither is ever returned to a
client.

**Web terminal.** Browser → WebSocket → SSH into the pod as root:

- The client supplies **only a signed ticket naming a pod id** — never a host,
  port, user or key. There is no request shape that can aim the SSH client at an
  arbitrary address.
- The ticket is HMAC-signed with a 60-second TTL.
- **Ownership is re-checked against the database**, not trusted from the ticket.
  A ticket minted before a pod changed hands is useless.
- The private key is decrypted into memory for the connection only, and is never
  sent to the client, logged, or placed in the pod's environment.
- `readyTimeout` bounds the handshake so a black-holed pod cannot pin a socket.

This deliberately differs from the older VNC proxy, which embeds credentials in
a URL query string.

**Jupyter.** Where a template declares `jupyter: "8888"`, provisioning injects a
generated token and password. Before this, Jupyter images were reachable
unauthenticated as root.

**Image trust.** A deploy naming a `templateId` uses the **catalogue's** image,
never the client's string, so a known template cannot be used to smuggle in an
arbitrary image. A custom deploy (no template) still accepts any public image —
that is the customer's own container.

**Pod naming.** `ahura-cloud-<podId>-<name>`, with the id **before** the
user-supplied part because RunPod truncates at 191 characters. Anything that must
survive truncation comes first, so every pod is traceable to a row even when two
customers pick the same name. Nothing matches on this prefix — every lifecycle
call keys off `runpod_pod_id`.

---

## 9. Upstream client

`lib/services/runpod/client.ts` centralises auth, timeouts, retry and error
categorisation across **two different RunPod APIs**:

| API | Base | Used for |
|---|---|---|
| REST | `https://rest.runpod.io/v1` | pod create/read/delete, power actions |
| GraphQL | `https://api.runpod.io/graphql` | inventory (stock + price probes) |

> **They expose different GPU lists.** The GraphQL inventory query and the REST
> create-pod enum do not agree. A GPU can be listed as available and still be
> rejected at create time — the reason three SKUs had to be deactivated.

HTTP status maps to a typed error with a retry decision:

```
timeout → TIMEOUT   retryable      429 → RATE_LIMIT  retryable
401/403 → AUTH      terminal       5xx → SERVER      retryable
404     → NOT_FOUND terminal       4xx → INVALID     terminal
409     → CAPACITY  terminal
```

Only retryable codes are retried; a terminal error fails fast rather than
burning the customer's request budget.

---

## 10. Known gaps

- **Two price books.** `gpu_pricing` and `billing.service_pricing` both hold a
  GPU markup. `createPod` reads the former, the billing sweep the latter. They
  agree today (both 1.000) but nothing enforces that. The fix is for `createPod`
  to read the price book, after which `gpu_pricing` retires.
- **Pods created before 2026-08-26** predate `terminal_key_blob` and Jupyter
  token injection — the web terminal will not work for them.
- **Custom `ghcr.io/cs2hvh/*` images are CUDA ≤12.6**, so they are not
  Blackwell-compatible.
- **No vendor filtering** in the wizard between ROCm and CUDA templates.
- **The web terminal has not been exercised against a live pod** — no pod has
  been running since it shipped.

---

## Appendix — file map

| Path | Lines | Role |
|---|---|---|
| `lib/services/runpod/client.ts` | 193 | REST + GraphQL, retry, error categorisation |
| `lib/services/runpod/helpers.ts` | 227 | `computeResalePerHour`, `storagePerHour`, probe queries |
| `lib/services/runpod/operations/pod-lifecycle-operations.ts` | 872 | create / power / destroy |
| `lib/services/runpod/operations/pod-read-operations.ts` | 467 | list, detail, reconcile |
| `lib/services/runpod/operations/inventory-operations.ts` | 446 | sync, retention, `listLatest` |
| `lib/services/runpod/operations/volume-operations.ts` | 290 | network volumes |
| `lib/services/runpod/operations/template-operations.ts` | 82 | curated images |
| `lib/gpu-terminal-token.ts` / `lib/gpu-terminal-proxy.ts` | 104 / 223 | HMAC ticket, WS⇄SSH bridge |
| `components/dashboard/gpu/deploy-wizard.tsx` | 1,684 | the deploy UI |
| `app/api/services/gpu/**` | 10 routes | customer-facing API |
| `app/api/admin/gpu/**`, `app/api/internal/gpu/**` | 5 routes | operator + cron-triggered |
