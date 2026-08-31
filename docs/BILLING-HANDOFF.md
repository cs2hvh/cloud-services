# Billing v2 — what the admin panel needs to build

Written 2026-08-31 by the billing lane (`cloud-services-f0`) for whoever picks
up the separate admin panel (`C:\cloud-admin-panel`, `apps/admin`, branch
`feat/separate-admin-panel`).

The previous admin-panel session and I agreed a split: **this lane owns the
schema, the panel owns the single write surface on top of it.** That session
ended before I could hand this over, so it is written down instead.

---

## URGENT — this invalidates the previous plan

The prior session's plan was to leave Pricing unmigrated, so there was exactly
one write path: the main app's `/dashboard/admin/pricing` deep-link.

**That surface is dead.** As of 2026-08-31 these are dropped:

```
public.products        public.instance_plans        public.gpu_pricing
```

Anything linking to that page, or reading those tables, will 500.

Everything is archived in schema `pricing_archive_20260831` — products 63,
gpu_pricing 192, instance_plans 14, pricing_categories 7, pricing_promos 2,
game_server_plans 12 (290 rows). Restore with
`create table public.X as select * from pricing_archive_20260831.X`, but note
constraints and indexes are **not** carried by that copy.

They were DROPPED rather than emptied deliberately: `ratesFromProduct()` in
`config/pricing.ts` returns `hourlyRate: 0` for a missing row, so emptying them
would have silently made every service **free**, with provisions succeeding and
metering nothing. Dropping makes those paths throw. Loud beats silent when the
alternative is giving the product away.

**Net effect: the platform has zero prices. Nothing can be priced, provisioned
or billed until the panel's write surface exists.** The panel is the critical
path.

Still present if you need them: `pricing_categories` (marketing copy),
`pricing_promos` (marketing display only — badge/title/price_old, no billing
logic), `game_server_plans`.

---

## Surface 1 — the price book

`billing.service_pricing`, canonical and append-only.

| column | notes |
|---|---|
| `service_type` | `compute` `gpu_pod` `gpu_pod_storage` `gpu_volume` `objectspace` `spectrum` `database` `kubernetes` `platform_apps` `custom_image` `inference_vector` |
| `plan_key` | instance-plan slug, `products.id`, app size, or `'*'` for a flat-priced service |
| `rate_model` | `fixed_hourly` \| `markup` \| `per_gb_hour` |
| `unit` | fixed_hourly → `usd_per_hour`/`usd_per_month`; markup → `multiplier`; per_gb_hour → `usd_per_gb_month`/`usd_per_gb_hour` |
| `amount` | the number, **in that unit** |
| `floor_usd_per_hour`, `effective_from`, `effective_to`, `created_by`, `note` | |

### The contract — four rules

**1. There is no hourly-rate column, on purpose.** Store the price in the unit
it was quoted in; `billing.resolve_hourly_rate()` is the only converter. This is
the structural fix for the defect behind this whole rebuild: a MONTHLY figure
written into a column meaning dollars-per-hour, wrong by exactly 720
(`HOURS_IN_MONTH`), which charged a real paying customer **$4,629.91** for an
empty, already-deleted bucket that should have cost about $6.43.

**2. `effective_from` / `effective_to` must be hour-truncated** —
`date_trunc('hour', now())`. There is a CHECK. Billing is per whole hour, so a
price changing mid-hour is unrepresentable. Found by test: a price inserted with
a raw `now()` did not cover the hour it was created in, and the service silently
billed nothing.

**3. Never UPDATE a price — close it and insert a new row.** A partial unique
index allows only one live row (`effective_to IS NULL`) per
`(service_type, plan_key)`. Charges FK-reference the pricing row that produced
them, so "why was I charged this?" stays answerable after a price change.

**4. Backdating `effective_from` is a business act, not a data fix.** It asserts
that price was in force then, and the sweep will bill historical hours at it.

### Sanity bounds already in the database

Backstops only — the panel's median check is the friendlier guard:

```
usd_per_hour <= 1000     usd_per_month <= 10000
per-GB rates <= 10       markup >= 1.0 (never below cost)
```

The monthly bound exists because the 720× bug turned up **again** during
seeding: six `products` rows of type `kubernetes` priced **$43,200.00/month**,
which is `60 × 720` = exactly **$60.00/hour** — the identical figure and factor
as the poisoned objectspace meters, while the two correct kubernetes plans sat
at $60 and $150/month. That rules out a one-off hand-edit; it is a repeating
data-entry defect. Those six were corrected to $60 before archiving.

---

## Surface 2 — discounts, coupons, offers

Three distinct things. They are **not** interchangeable.

| table | what it does | status |
|---|---|---|
| `billing.promocodes` | **credit grant** — "redeem CODE, get $50 balance" | pre-existing, works well, untouched |
| `billing.discounts` | **rate discount** / **free allowance** | new |
| `billing.discount_grants` | who holds it, own expiry, own remaining hours | new |

`discounts`: `code` (null = automatic, nothing to type), `name`, `kind`
(`percent` \| `amount_off_hour` \| `free_hours`), `value`, `service_type`,
`plan_key`, `starts_at`, `ends_at`, `max_grants`, `priority`, `is_active`.

**Scope gotcha:** `NULL` means "any". Deliberately **not** `'*'`, because `'*'`
is a real `plan_key` value in `service_pricing` and reusing it would make "the
flat-priced plan" and "any plan" indistinguishable.

Functions:
- `billing.redeem_discount_code(code, user_id)` → jsonb `{success, error?}`.
  Uses `FOR UPDATE` like the promo path so `max_grants` cannot be overshot
  concurrently. Grants an entitlement; moves no money.
- `billing.best_discount(...)` picks exactly **one** applicable discount,
  deterministically: priority → scope specificity → age. Never row order.

Stacking is deliberately unsupported. It needs a policy decision ("does 20% off
GPU combine with 10% off everything?") before it is safe, and guessing produces
bills nobody can explain.

Every discounted charge records `gross_usd`, `discount_usd` and `discount_id`,
so a discounted invoice line explains itself.

### Data problem the UI will surface as nonsense

In `billing.promocodes`, `coupon_type` and `max_redemptions` contradict each
other (`WELCOME24` is `one-time` with `max_redemptions: 5`), and **every** row is
`is_active = true` despite `valid_till` being months past — so "active" does not
mean usable. Reconcile before building a screen on it.

---

## Agreed requirements still outstanding

- **Audit every price write** through `AuditLogService` with actor and old → new.
  Pricing routes do not do this today. The `deduction personally from db by
  admin` transaction of **-$680,140** against a live customer on 2026-04-17 is
  what an unaudited write path looks like after the fact.
- **`ADMIN_EMAILS` is unset in prod**, so the `user_profiles.roles` fallback is
  the live auth path. Needs setting before the panel can set prices.
- **Keep the monthly-equivalent preview** on hourly rates. It would have caught
  the $120/hr compute meter ($87,600/mo) at entry.
- **Reject or confirm rates >10× the category median** — the prior session's
  proposal, still the right guard.

---

## Where the rest of billing got to

The v2 spine is live and charging. `billing.service_meters` records what runs
and who pays (and carries **no** price); `billing.service_charges` +
`billing.charge_service_hour()` claim one hour at a time, idempotently, with an
addressable period so a missed hour can be backfilled at the price live *then*.
Meters open and close centrally in `settleProvision` / `postProvisionBilling` /
`closeActiveBilling`, so every service inherits it.

Verified with a real `--apply` run: 3 charges written; a second run on the same
hour charged nothing; an unpriced hour returns `no-price` and **refuses** rather
than billing zero.

Full history and open items: `TASKS.md` in `C:\cloud-services`.
