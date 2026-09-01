# Pricing & Billing — Architecture Reference

**Scope:** every metered service — VPS, GPU pods, GPU volumes, object storage,
Spectrum, managed databases, Kubernetes, platform apps, custom images, vector
collections
**Model:** prepaid credit, charged hourly in arrears
**Status:** v2 spine live since 2026-08-31, running unattended
**Last verified against running system:** 2026-09-01 08:59 UTC

---

## 1. Why this was rebuilt

On 2026-08-30 an audit of live billing found a paying customer charged
**$4,629.91 for an empty, already-deleted object storage bucket**. The correct
figure was about $6.43.

The error was exactly **720×**, and 720 is `HOURS_IN_MONTH` in
`config/pricing.ts`. That is not arithmetic drift. It is a **monthly** price
written into a column that means **dollars per hour** — and nothing in the old
schema could tell the difference, because `active_*.hourly_rate` was a bare
`numeric`. `$60/month` and `$60/hour` are the same eight bytes.

Two more instances of the same shape were live at audit time: a compute meter at
$120.00/hr ($87,600/mo) and a second objectspace meter at $60.00/hr.

Simultaneously, billing had **stopped entirely on 2026-08-24 10:50**. The cron
worker file was deleted from `dev` in commit `ef946da1`; the deploy wiped it
from the box; systemd crash-looped ~100,000 times restarting a file that no
longer existed. Nothing alerted. Six days of revenue were lost silently.

So: three failures, one rebuild.

| Failure | Structural cause | Fix in v2 |
|---|---|---|
| 720× overcharge | unit not represented in the schema | no hourly-rate column exists; `unit` is NOT NULL and constrained |
| billing silently stopped | nothing checked that it ran | dead-man watchdog asks the database, not the process |
| deleted resources still billed | meter close not wired to teardown | liveness re-checked at charge time, on an allowlist |

---

## 2. Design in one page

```
   Admin panel (separate app)          Service provisioning
   the ONLY price writer               config/billing-flow.ts
            │                                   │
            ▼                                   ▼
  ┌──────────────────────┐          ┌────────────────────────┐
  │ billing.             │          │ billing.               │
  │   service_pricing    │◄─────────│   service_meters       │
  │                      │  plan_key│                        │
  │ append-only          │          │ one open per service   │
  │ hour-aligned windows │          │ NO rate column         │
  └──────────┬───────────┘          └───────────┬────────────┘
             │                                  │
             └──────────────┬───────────────────┘
                            ▼
              ┌──────────────────────────────┐
              │ billing.charge_service_hour()│  ← the only thing that
              │  claim + deduct, one savepoint│    moves money
              └──────────────┬───────────────┘
                             │
              ┌──────────────┴───────────────┐
              ▼                              ▼
   billing.service_charges          user_credits (balance)
   unique(type, id, period)         billing.transactions
```

Driven hourly by `scripts/billing/sweep.ts` under a systemd timer, and watched
by `scripts/billing/deadman.ts` from GitHub Actions.

Three invariants carry the design:

1. **A price is never stored without its unit.**
2. **A charge is addressed by `(service_type, service_id, period_start)`**, so
   re-running is free and double-billing is a unique-violation, not a judgement
   call.
3. **The claim and the payment share one savepoint.** Either both happen or
   neither does.

---

## 3. The price book — `billing.service_pricing`

### There is no hourly rate column

A price is stored **in the unit it was quoted in**. Exactly one function
(`billing.resolve_hourly_rate`) converts. You cannot write a monthly number into
an hourly field, because no such field exists.

| Column | Meaning |
|---|---|
| `service_type` | `compute`, `gpu_pod`, `objectspace`, … (matches `billing.transactions` so history stays joinable) |
| `plan_key` | plan slug / `gpu_catalog_id` / app size — `'*'` where the service has one price |
| `rate_model` | `fixed_hourly` \| `markup` \| `per_gb_hour` |
| `amount` | `numeric(18,8)` |
| `unit` | **NOT NULL**, constrained against `rate_model` |
| `floor_usd_per_hour` | never sell below this; 0 = no floor |
| `effective_from` / `effective_to` | version window; `effective_to IS NULL` = live |
| `created_by`, `note` | who changed it and why |

### The unit column is load-bearing, not decorative

```sql
constraint service_pricing_unit_matches_model check (
  (rate_model = 'fixed_hourly' and unit in ('usd_per_hour','usd_per_month'))
  or (rate_model = 'markup'      and unit = 'multiplier')
  or (rate_model = 'per_gb_hour' and unit in ('usd_per_gb_month','usd_per_gb_hour'))
)
```

A `markup` row cannot claim to be dollars. A `per_gb_hour` row cannot claim to be
a bare hourly rate. The unit travels with the number everywhere it goes.

### Other constraints, each one a bug that actually happened

| Constraint | Prevents |
|---|---|
| `markup_at_least_cost` (`amount >= 1.0`) | selling GPU below what RunPod charges us |
| `hourly_sane` (`usd_per_hour <= 1000`) | blast radius of a mistyped rate |
| `monthly_sane` | the 720× value re-entering through the monthly unit |
| hour-boundary CHECK on `effective_from`/`effective_to` | a price created at 10:30 not covering the 10:00 hour → silent `no-price` |
| `one_live_per_plan` (partial unique) | two live prices making the charged rate depend on row order |

### Prices are versioned, never updated

A change **closes** the current row and **inserts** a new one. Two reasons:

- `service_charges.pricing_id` records which price produced a charge. *"Why was
  I billed this?"* stays answerable years later. With UPDATE-in-place that
  question becomes unanswerable the moment anyone edits a price.
- A price edit is the highest-privilege write in the system — it is the one that
  turned $6.43 into $4,629.91. Append-only makes a bad edit visible and
  reversible rather than silent and destructive.

### The three rate models

```
fixed_hourly   hourly = amount            (usd_per_hour)
               hourly = amount / 720      (usd_per_month)

markup         hourly = upstream_cost × amount
               ↑ upstream_cost is REQUIRED. A markup with no cost is
                 UNKNOWN, not free — it raises rather than returning 0.

per_gb_hour    hourly = amount × gb       (usd_per_gb_hour)
               hourly = amount × gb / 720 (usd_per_gb_month)
               ↑ quantity is REQUIRED. A missing measurement is not
                 zero GB. An empty bucket is a measured 0, passed
                 explicitly.
```

**Missing values raise; they never default to zero.** The entire audit was a
catalogue of empty values silently read as zero.

`HOURS_IN_MONTH = 720` (24 × 30), deliberately **not** 730 — the existing
catalogue was priced against 720, and changing the divisor would silently
re-rate every service by 1.4%. If it ever moves, it moves as a product
decision, not a tidy-up.

### The live price book

| Service | Model | Unit | Plans | Range |
|---|---|---|---|---|
| `compute` | fixed_hourly | usd_per_hour | 13 | $0.01 – $0.857/hr |
| `database` | fixed_hourly | usd_per_month | 48 | $14.99 – $2,999.99/mo |
| `kubernetes` | fixed_hourly | usd_per_month | 8 | $60 – $150/mo |
| `platform_apps` | fixed_hourly | usd_per_month | 5 | $5 – $299/mo |
| `objectspace` | fixed_hourly | usd_per_month | 1 | $5/mo |
| `spectrum` | fixed_hourly | usd_per_month | 1 | $300/mo |
| `inference_vector` | fixed_hourly | usd_per_month | 1 | $8/mo |
| `gpu_pod` | **markup** | multiplier | 1 | **1.00× — at cost** |
| `gpu_pod_storage` | per_gb_hour | usd_per_gb_month | 1 | $0.10/GB-mo |
| `gpu_volume` | per_gb_hour | usd_per_gb_month | 1 | $0.0875/GB-mo |
| `custom_image` | per_gb_hour | usd_per_gb_month | 1 | $0.05/GB-mo |

**GPU is currently sold at cost (1.00× markup) — an open product decision, not
an oversight.** The constraint permits raising it; nothing else needs to change.

---

## 4. Meters — `billing.service_meters`

A meter says *"this resource, owned by this user, on this plan, is running."*
It does **not** say what it costs.

**No rate column, deliberately.** In v1 the rate was copied onto the meter at
provisioning time, so correcting a price required finding and editing every
meter row that carried the wrong copy — which is how the 720× values survived.
Here the price is resolved from the book at charge time, so fixing a price fixes
the next charge.

| Column | Note |
|---|---|
| `service_type`, `service_id`, `user_id` | the payer is resolved by the caller |
| `plan_key` | selects the price row |
| `units` | multiplier for services billed per unit of themselves — node count, GPU count. **Storage GB is not this**; it is measured at charge time |
| `status` | `active` \| `suspended` \| `closed` |
| `started_at` / `ended_at` | |

Guards:

- `service_meters_one_open_per_service` — a second open meter would double-bill
  the same resource.
- `service_meters_closed_has_end` — a closed meter must say *when*. Without it,
  "closed" and "still running" become indistinguishable after the fact, which is
  how the deleted-bucket meters stayed invisible.

### Meters are opened and closed centrally

`config/billing-flow.ts` is the single wiring point:

| Function | Does |
|---|---|
| `settleProvision` | opens the v2 meter |
| `postProvisionBilling` | opens the v2 meter |
| `closeActiveBilling` | closes it |

An earlier attempt wired each service separately and covered **2 of 10** — it
missed the Proxmox compute path entirely. Central wiring means a new service
inherits metering by using the existing provisioning flow, rather than by
remembering to.

`lib/billing/meters.ts` provides `openMeter`, `closeMeter`, `openGpuPodMeters`
(a pod opens *two* — compute and storage) and `normalizePlanKey` (strips the
`linode:` prefix so plan keys match the price book).

---

## 5. Charging — `billing.charge_service_hour()`

The only thing in the system that moves money.

```
charge_service_hour(service_type, service_id, user_id, period_start,
                    plan_key, upstream_cost, quantity, units) → text
```

Returns one of: `charged` · `already-charged` · `insufficient` · `no-price` ·
`zero-cost` · `invalid-amount`.

**Every outcome is a named string, not an exception.** The sweep can count them,
and "already charged" is a normal result rather than an error to be swallowed.

### The savepoint, which is the whole point

```sql
begin
  insert into billing.service_charges (...)
  on conflict (service_type, service_id, period_start) do nothing;

  if not found then
    return 'already-charged';
  end if;

  perform billing.deduct_user_credit_atomic(p_user_id, v_amount);
exception
  when others then
    if sqlerrm like '%Insufficient credit balance%'
       or sqlerrm like '%User credit record not found%' then
      return 'insufficient';
    end if;
    raise;
end;
```

The insert and the deduction are inside **one** `BEGIN…EXCEPTION` block.

This was wrong in the first draft: the `INSERT` sat *before* the block. PL/pgSQL
`BEGIN…EXCEPTION` only rolls back what happens **inside** it, so a failed
deduction left a charge row behind claiming payment that never occurred — a
phantom ledger entry. The same defect existed in `paas.charge_project_hour` and
was fixed there too.

`billing.service_charges` is unique on `(service_type, service_id, period_start)`
— so the sweep is **idempotent by construction**. Re-running a period cannot
double-charge; the second attempt gets `already-charged`.

### Discounts

Two tables, applied inside the charge:

- **`billing.discounts`** — the offer. `kind` is `percent` (0–100, CHECKed),
  `amount_off_hour` (USD off each hour, floored at 0) or `free_hours` (an
  allowance consumed one per billable hour). A null `code` means automatic (a
  free tier, a negotiated rate, an outage make-good); a non-null code is
  redeemable and unique.
- **`billing.discount_grants`** — who holds it and how much is left. Separate
  because one offer is held by many customers, each with their own clock
  ("3 months from *your* signup") and their own remaining allowance.

Rules, each one a failure mode seen elsewhere in this system:

- **A discount can never take an amount below zero.** A negative charge is a
  refund — `deduct(-X)` silently *adds* credit. Reachable through a 150%
  discount, so the floor is in the database.
- **An expired or exhausted grant charges full price.** It never errors and
  never charges zero: *"the discount ran out"* and *"this hour is free"* must
  not be the same outcome.
- **Every discounted charge records which discount applied and how much it took
  off, alongside the gross.** An invoice line that cannot explain its own number
  is the defect this rebuild exists to remove.

Existing `billing.promocodes` are untouched — those are **credit grants** (add
money to a wallet), a different thing from changing what an hour costs. Both
remain.

Live: 0 discounts, 0 grants. The machinery is in place, unused.

---

## 6. The sweep — `scripts/billing/sweep.ts`

~500 lines. Runs hourly, bills the previous complete hour.

```
node --experimental-strip-types --env-file=/root/cloud-services/.env \
     scripts/billing/sweep.ts --apply
```

| Flag | Effect |
|---|---|
| *(none)* | **dry run** — reports what it would charge, moves nothing |
| `--apply` | actually charge |
| `--period` | bill a specific hour (backfill, replay) |
| `--service` | restrict to one service type |

**Dry-run is the default.** Running the money script by accident should print a
report, not spend a customer's balance.

### Liveness is re-checked before charging

Each service in the registry declares where its truth lives:

```ts
compute: {
  schema: "public", table: "servers",
  idColumn: "billing_service_id",
  billableStatuses:    ["running", "active", "provisioning", "stopped"],
  nonBillableStatuses: ["deleted", "destroyed", "terminated", "failed", "error"],
}
```

**`billableStatuses` is an allowlist, not a denylist.** A status nobody
anticipated does not silently become billable — it is reported and skipped. The
deleted-bucket overcharge is precisely what a denylist misses.

Eleven services are registered: `compute`, `gpu_pod`, `gpu_pod_storage`,
`gpu_volume`, `objectspace`, `spectrum`, `database`, `kubernetes`,
`platform_apps`, `custom_image`, `inference_vector`.

Note the `idColumn` indirection. Several tables key on a bigint (`servers.id`),
so a dedicated `billing_service_id uuid` column was added — including to
`gpu_network_volumes` in its own migration. Joining `servers.id` against a uuid
is a mistake I made once during this work and it produced a confidently wrong
report.

### Scheduling

`deploy/systemd/ahura-billing-sweep.{service,timer}`:

```ini
OnCalendar=*:10:00        # ten past every hour — bills the hour that just closed
Persistent=true           # a missed run while the box was down is caught up
RandomizedDelaySec=60
SuccessExitStatus=0 1
```

`Persistent=true` is what makes a reboot cost nothing. `SuccessExitStatus=0 1`
keeps systemd from marking the unit failed when the sweep exits 1 for a
non-fatal condition.

**This replaced the old `cron-worker.js`**, a node-cron process whose source
lived in a *different repository* — which is why deleting the deployed file from
`dev` broke billing with no visible cause in this repo.

---

## 7. The dead-man watchdog

`scripts/billing/deadman.ts`, run from `.github/workflows/billing-deadman.yml`
on `35 */2 * * *`.

It asks **the database** one question: `max(period_start)` in
`billing.service_charges`. If that is more than `BILLING_STALE_AFTER_HOURS`
(default 3) behind the current hour, it fails.

**It does not ask systemd whether the service is running.** The 2026-08-24
outage had a *running* unit — restarting a deleted file, 100,000 times. Process
health said fine; no money moved. The only trustworthy signal is whether charges
exist.

Exit codes are deliberately distinct:

| Code | Meaning |
|---|---|
| 0 | billing is current |
| 1 | **billing is stale — money is not being collected** |
| 2 | the watchdog itself could not run (bad credentials, network) |

1 ≠ 2 on purpose: "billing is broken" and "the alarm is broken" need different
responses, and collapsing them means a credential expiry looks like an outage
(or worse, an outage looks like a credential expiry and gets ignored).

> ⚠️ **Not yet armed.** The workflow needs repo secrets `SUPABASE_URL` and
> `SUPABASE_SERVICE_ROLE_KEY`. Until those are set, the sweep is running
> unwatched.

---

## 8. Current live state

| Metric | Value |
|---|---|
| Charge rows | 72 |
| Distinct hours billed | 24 (continuous) |
| First period | 2026-08-31 06:00 UTC |
| Last period | 2026-09-01 07:00 UTC |
| Hours behind | 1.0 — correct (the `:10` run bills the hour just closed) |
| Total billed | $1.1063 |
| Users billed | 2 |
| Open meters | 5 (of 6 ever created) |

The timer fired unattended for the first time at 10:10:27 on 2026-08-31 and has
run every hour since. $1.11 over 24 hours is real but tiny — the platform has
very little running on it right now, which is the honest reading.

### The relaunch reset (2026-08-31)

At the user's instruction, historical billing data was wiped for a clean start.
**441,000 rows deleted**, archived first.

Deliberately **kept**:

- 64 Stripe transaction rows ($24,529.09) — money that actually moved through a
  payment processor; deleting it would desynchronise us from Stripe's own
  records.
- 13 wallet balances ($6,290.37) — credit customers had paid for.

Corrected during the archive: six `products` rows of type `kubernetes` at
**$43,200/month** — which is `60 × 720`, the same bug at a different layer.
Fixed in the archive; the live price book carries the correct $60–$150.

---

## 9. Open items

| Item | Status |
|---|---|
| Dead-man watchdog secrets | **not set** — sweep runs unwatched |
| `sharma11aniket@gmail.com` ~$4,623 overcharge | refund / write-off decision outstanding |
| Six unbillable days (24–31 Aug) | recoverable only by deliberately backdating `effective_from`; not done |
| GPU margin | 1.00× — sold at cost, product decision pending |
| `ved@samatva.com` | no `user_credits` row → 2 GPU volumes return `insufficient` every hour |
| Two GPU price books | `public.gpu_pricing` (192 rows, restored) vs `billing.service_pricing`. `createPod` still reads the former; it should read the price book |
| Corrected `products` rows | fixed in archive, not live |

The `gpu_pricing` duplication deserves a note. That table was dropped during
cleanup because it looked like dead v1 pricing. It was not — `createPod` reads
it and throws without it. The breakage stayed hidden for a day because the
inventory sync only touches it during auto-discovery and logs failures
non-fatally. Restored via `20260901000002_restore_gpu_pricing.sql` (192 rows,
PK and CHECK constraints re-added by hand). **The lesson is the general one:
"unused" needs to be proven by reading the callers, not inferred from the name.**

---

## Appendix — file map

| Path | Role |
|---|---|
| `supabase/migrations/20260830000001_billing_v2_canonical_pricing.sql` | price book, `resolve_hourly_rate`, `current_price` |
| `…20260830000002_billing_v2_meters_and_charges.sql` | meters, charges, `charge_service_hour` |
| `…20260830000003_..._prices_change_on_hour_boundaries.sql` | hour-alignment CHECKs |
| `…20260831000001_billing_v2_gpu_volume_billing_key.sql` | `billing_service_id` on `gpu_network_volumes` |
| `…20260831000002_billing_v2_seed_price_book.sql` | the live catalogue |
| `…20260831000003_billing_v2_discounts.sql` | discounts + grants |
| `scripts/billing/sweep.ts` | the hourly sweep |
| `scripts/billing/deadman.ts` | staleness watchdog |
| `lib/billing/meters.ts` | open/close helpers, `normalizePlanKey` |
| `config/billing-flow.ts` | the single meter wiring point |
| `deploy/systemd/ahura-billing-sweep.*` | timer + unit + README |
| `.github/workflows/billing-deadman.yml` | watchdog schedule |
| `docs/billing/ADMIN-PANEL-HANDOFF.md` | contract with the admin-panel lane |

### Permissions

`charge_service_hour` had `REVOKE ALL … FROM public` applied, which also
stripped `service_role` — it inherits EXECUTE from PUBLIC rather than holding it
directly. EXECUTE is now granted explicitly. Worth recording that it failed
**safely**: the sweep reported a permission error and charged nothing, rather
than charging wrongly.
