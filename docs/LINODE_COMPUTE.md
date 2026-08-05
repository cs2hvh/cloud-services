# Compute / Virtual Servers — Linode Resell (Operator Runbook)

> Internal engineering documentation. The service is customer-facing, but this
> doc is not — it names the upstream provider (Linode/Akamai). **Never** surface
> the provider name in dashboard UI, toasts, errors, or emails. Supersedes
> [COMPUTE_SERVICE.md](./COMPUTE_SERVICE.md) (the Proxmox/OVH era, now legacy —
> Proxmox rows/code stay dormant behind the same routes).

---

## 1. Architecture summary

The Compute (VPS) service resells **Linode instances** on a single platform
account. Three seams keep it maintainable:

- **Provider seam** — `servers.provider` (`'proxmox' | 'linode'`) discriminates
  every row. Existing day-2 routes branch on the row's own provider; the
  create/options paths route on the `platform_settings.compute_provider`
  switch (default `linode`). Linode-specific logic lives in
  `lib/services/compute/providers/linode/{create,ops,options,lifecycle}.ts`;
  the raw API client in `lib/services/linode/client.ts` (auth, retries,
  pagination, error categorization).
- **Catalog sync** — regions, types (plans), images, and per-region
  availability are synced from the Linode API into the `linode_*` tables by
  `lib/services/linode/catalog-sync.ts`. The DB is the source of truth at
  request time (60 s in-process cache via `lib/pricing/linode-catalog.ts`).
  Sync auto-discovers new SKUs (pricing row at markup 1.0), never deletes
  (absent ids get `is_active=false`), and never re-enables an admin-disabled
  row.
- **Frozen-rate billing** — the customer's hourly rate is computed once and
  written to `servers.hourly_cost` at create/resize/backup-toggle time.
  Upstream price drift never re-prices a running server. The shared billing
  spine (`billing.active_compute` + credit cron) is unchanged from the Proxmox
  era.

```
dashboard → app/api/services/compute/vms/*  ──┐  (branch on servers.provider)
admin     → app/api/admin/linode/*           ├─→ lib/services/compute/providers/linode/*
cron      → app/api/internal/linode/*        │        │
                                             │        ▼
             Supabase (servers, linode_*, billing.*)   LinodeClient → api.linode.com/v4
```

## 2. Required environment

| Variable | Purpose |
|---|---|
| `LINODE_TOKEN` | Linode API v4 personal access token (read/write on Linodes; the whole fleet lives on this one account). |
| `CRON_SECRET` | Bearer secret for the `/api/internal/*` endpoints (sync + reconcile). |
| `LINODE_API_URL` | Optional override, defaults to `https://api.linode.com/v4`. |

Plus the platform-wide basics already in place: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`/`_TOKEN` (locks),
`ADMIN_EMAILS`.

## 3. Setup steps (new environment)

1. **Apply migrations** — `supabase db push` (or apply in order):
   - `20260711000001_linode_provider.sql` — `servers.provider` + `linode_id`,
     `user_ssh_keys` table (RLS).
   - `20260711000002_linode_catalog.sql` — `linode_regions/types/images/
     region_availability/pricing` tables.
   - `20260711000003_audit_compute_service_type.sql` — allows
     `service_type='compute'` in the audit-log constraint.
2. **Set `LINODE_TOKEN`** (and `CRON_SECRET` if not already set) in the
   deployment environment; restart the app.
3. **Run the first catalog sync** — admin dashboard → Linode panel → *Sync
   catalog*, or `POST /api/admin/linode/sync` as an admin. Expect a summary
   with non-zero `regions/types/images`.
4. **Verify the status card** — `GET /api/admin/linode/status` (rendered as
   the admin Linode status card): token probe `valid: true` with the account
   email, non-zero catalog counts, and a fresh `lastSyncedAt`.
5. **Configure pricing** — review `linode_pricing` markups/floors (every type
   auto-discovered at markup 1.000 = resell at list). Set your margin before
   enabling deploys.
6. **Enable deploys** — flip the kill-switch (`platform_settings.
   linode_deploy_enabled`) per the rollout checklist in §10.

## 4. Sync + reconcile cadence

Both endpoints require `Authorization: Bearer $CRON_SECRET` and single-flight
via Redis NX locks, so overlapping cron fire is harmless (`skipped: true`).

| Job | Endpoint | Cadence | Lock |
|---|---|---|---|
| Catalog sync (regions/types/images/availability) | `POST /api/internal/linode/sync` | hourly (availability is the only fast-moving dataset) | `lock:linode-catalog-sync` |
| Fleet reconcile (drift detection, see §8) | `POST /api/internal/linode/reconcile` | every 6 h | `lock:linode-reconcile` |

Example crontab:

```cron
0 * * * *   curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/internal/linode/sync
15 */6 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/internal/linode/reconcile
```

Admin-triggered equivalents (no cron token needed, audited):
`POST /api/admin/linode/sync`, `POST /api/admin/linode/reconcile`.

## 5. Pricing / markup rules

Resale price per plan per region (`lib/pricing/linode-catalog.ts`):

```
listHourly   = region_prices override for the region, else the base list price
resaleHourly = max(listHourly × markup_pct, floor_per_hour_usd)   (5 dp)
resaleMonthly = resaleHourly × 720                                (2 dp)
backupsHourly = backups list price × markup_pct  (add-on; floor does NOT apply)
```

- `markup_pct` / `floor_per_hour_usd` are admin-managed per type in
  `linode_pricing` (markup ≥ 1.000 enforced by a DB check).
- **Frozen at**: create, resize (re-rate via `rerateActiveCompute`), and
  backup enable/cancel. `servers.hourly_cost` is what the meter charges —
  catalog changes only affect future operations.
- Monthly figures everywhere are display sugar: `hourly × 720`.
- GPU/`accelerated` classes are excluded from resale at read time
  (`EXCLUDED_LINODE_CLASSES`) — GPUs are sold via the RunPod-backed service.
- Availability fails closed: a missing `linode_region_availability` key means
  "not deployable in that region".

## 6. Billing lifecycle

1. **Create** — `reserveProvision` atomically debits (setup + 1 h) *before*
   the instance is created (concurrency gate = the deduction). Non-settle
   exits refund via `releaseProvision`.
2. **Provision** — `POST /linode/instances` → `servers` row
   (`status=provisioning`) → respond; a background `after()` polls to
   `running`.
3. **Settle** — `settleProvision` registers the meter
   (`billing.active_compute` keyed by `servers.billing_service_id`) and
   refunds the transient 1 h hold. If meter registration fails the instance is
   torn down — nothing runs unmetered.
4. **Meter** — the credit cron (`credit-system-cron/cron-worker.js`) charges
   `hourly_rate × elapsed` against `active_compute` every run.
5. **Grace** — on empty balance the shared grace flow applies (7-day
   non-payment window), after which…
6. **Destroy** — `destroyServer` (user delete or grace expiry): delete the
   Linode instance (404 = already gone = success), `closeActiveBilling`
   prorates the final sliver and removes the meter, row deleted.

## 7. Day-2 op mapping

| Dashboard action | Route (existing compute API) | Linode endpoint |
|---|---|---|
| Start / Stop / Reboot | `POST /api/services/compute/vms/power` | `POST /linode/instances/{id}/boot` / `.../shutdown` / `.../reboot` |
| Metrics tab | `GET /api/services/compute/vms/{id}/metrics` | `GET /linode/instances/{id}` + `GET .../stats` (60 s Redis cache) |
| Console | `GET /api/services/compute/vms/{id}/console` | `POST /linode/instances/{id}/lish` (weblish URL) |
| Resize (list + apply) | `GET/POST /api/services/compute/vms/{id}/resize` | `POST /linode/instances/{id}/resize` (`allow_auto_disk_resize: true`) |
| Reset root password | `POST /api/services/compute/vms/{id}/reset-password` | shutdown → `POST .../password` → boot (orchestrated) |
| Rebuild (reinstall OS) | `POST /api/services/compute/vms/{id}/rebuild` | `POST /linode/instances/{id}/rebuild` |
| Rename | `PATCH /api/services/compute/vms/{id}` | `PUT /linode/instances/{id}` (best-effort; DB row is display truth) |
| Backups (list/enable/cancel/snapshot/restore) | `/api/services/compute/vms/{id}/backups` | `GET .../backups`, `POST .../backups/enable`, `.../backups/cancel`, `POST .../backups` (snapshot), `POST .../backups/{bid}/restore` |
| Delete | `DELETE /api/services/compute/vms/{id}` | `DELETE /linode/instances/{id}` (via `destroyServer`) |

## 8. Reconcile job (drift detection)

`lib/services/linode/reconcile.ts` — compares the live account against the
`servers` table. Every instance the panel creates is tagged `panel` (plus
`owner:<user_id>`).

- **Untracked** — `panel`-tagged instances older than 15 minutes with no
  `servers.linode_id` match. These bill the *platform* with no customer meter.
  **Reported only, never auto-deleted** — inspect in the Linode console
  (`owner:` tag identifies the intended customer) and delete/adopt manually.
- **Foreign** — instances *without* the `panel` tag: counted, never touched
  (the account may host manually created machines).
- **Orphaned rows** — `servers` rows whose instance is gone upstream: flagged
  `status='error'` and the `active_compute` meter is closed (prorated final
  charge) so customers never pay for a deleted instance. Idempotent across
  runs; per-row failures are counted in `orphanedRowErrors` and logged.
- A 15-minute grace window on both sides absorbs in-flight creates between the
  two snapshots.

The report (counts, untracked list, orphaned ids, duration) is returned by
both routes and written to the audit log by the admin route
(`metadata.operation = 'admin.linode.reconcile'`).

**Operator response**: non-empty `untracked` → investigate within the day
(platform money leak); non-zero `orphanedRowErrors` → check logs and re-run.

## 9. Known limitations

- **No memory metric** — the Linode stats API exposes CPU/IO/network only.
  The monitoring tab reports `mem_used/mem_pct = 0`; disk write is folded into
  the combined IO series.
- **No uptime** — not exposed by the API; reported as `0`.
- **Console is weblish only** — Lish over HTTPS (serial console). No
  VNC/glish surface in the dashboard.
- **Transfer pool is account-wide** — customer plans include a per-instance
  transfer quota, but overage bills the *platform* account, not the customer.
  Watch account transfer in the Linode console; heavy egress abusers must be
  handled operationally.
- **Label suffix** — Linode labels are unique per account, so every customer
  label gets a random 5-char suffix (`myserver-ab12x`). Customers see their
  chosen name in the dashboard; the suffixed label appears only upstream.
- **The web console discloses the provider — accepted exception.** The
  terminal is a direct browser→provider WebSocket, so `next.config.ts` must
  list `wss://*.webconsole.linode.com` in the CSP `connect-src`, and the
  connection itself appears in any customer's network tab. The Lish banner
  also prints `Linode Shell (lish)` and the instance id. Nothing in our code
  can hide this: it is inherent to not proxying the socket. The rest of the
  no-provider-naming rule still holds everywhere else (plan labels, error
  copy, the v1 API, the catalog tables). Closing this gap would mean
  terminating the WebSocket on our own domain and relaying it — real work,
  and a deliberate decision rather than an oversight.
- **Single shared token** — all customers ride one Linode account; a
  compromised `LINODE_TOKEN` exposes the whole fleet. Rotate on staff churn.

## 10. Rollout checklist

1. Migrations applied, `LINODE_TOKEN` + `CRON_SECRET` set (§3).
2. **Kill-switch OFF** — `platform_settings.linode_deploy_enabled = false`
   (blocks CREATE only; day-2 ops on existing rows keep working). Note the
   switch fails *open* when the row is missing — set it explicitly before
   announcing.
3. Catalog synced; status card green; markups/floors reviewed (§5).
4. Cron entries installed (§4) and observed to run (check `skipped`/summary).
5. **Staff test** with the switch off (admins can flip it briefly in a
   maintenance window, or test in staging): create → poll to running → SSH in
   (key + password) → metrics → resize → backups on → snapshot → reset
   password → rebuild → delete. Verify `active_compute` rows open/close and
   the final prorated charge lands.
6. Run a manual reconcile (`POST /api/admin/linode/reconcile`) — expect zero
   untracked/orphaned.
7. **Enable** — flip `linode_deploy_enabled = true`; watch the first organic
   creates and the next reconcile report.
