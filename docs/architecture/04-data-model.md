# Data Model

**Verified against production on 2026-09-03.**

Seven schemas, 205 base tables, one Supabase Postgres instance
(`xafjjpgazdxhktpfeuri`) shared by the customer app and the admin panel.

---

## 1. Schemas

| Schema | Tables | RLS off | Purpose |
|---|---|---|---|
| `public` | 78 | **8** | services, plans, catalogues, hosts, profiles |
| `inference` | 67 | **9** | AI Labs — models, deployments, traces, vectors, usage |
| `billing` | 23 | **6** | wallet, price book, meters, charges, ledger |
| `paas` | 15 | 0 | platform-apps projects, deployments, domains |
| `audits` | 13 | 0 | append-only audit log, monthly partitions |
| `agentcore` | 6 | 0 | agent runs and steps |
| `support` | 3 | 0 | tickets, messages, attachments |

**RLS-off tables are not automatically a vulnerability** — most are
service-role-only and unreachable from the API. But the combination of RLS off
*and* a grant to `anon` or `authenticated` *and* the schema being exposed is,
and that combination has occurred here. See §6.

Only schemas on PostgREST's allow-list are reachable at all:

```
pgrst.db_schemas = public, paas, billing, inference, audits, support
```

`agentcore` is deliberately not exposed.

---

## 2. Billing tables

The spine. Full behaviour in [Pricing & Billing](03-pricing-and-billing.md).

| Table | Rows (03 Sep) | Meaning |
|---|---|---|
| `user_credits` | 14 with balance | the wallet. **Authoritative balance.** |
| `service_pricing` | 82 live | the price book. Append-only, `effective_to IS NULL` = live |
| `service_plans` (public) | — | plan *specs*, separate from price |
| `service_meters` | 6 open | one open row per billable running resource |
| `service_charges` | 306 | one row per (service, hour) actually charged |
| `transactions` | 73 | the ledger: top-ups, refunds, coupons, purchases, arrears |
| `promocodes` | 14 | wallet-credit codes |
| `discounts` / `discount_grants` | **0 / 0** | rate discounts — built, never used |
| `account_ledger` (view) | — | `transactions` ∪ daily-rolled `service_charges` |

### Key invariants

- **`user_credits.credit_balance` is the truth.** No total is derived by summing
  `transactions`; that was checked before arrears rows were introduced.
- **`service_charges` has a unique index on `(service_type, service_id,
  period_start)`.** This is what makes the sweep idempotent — the INSERT *claims*
  the hour before any money moves.
- **`service_pricing` is append-only.** A price change closes the old row
  (`effective_to`) and inserts a new one, always on an hour boundary. Prices are
  therefore never retroactive, which is deliberate and has surprised people:
  a price created at 15:00 does not apply to the 14:00 hour.
- **`transactions` has a partial unique index for arrears**
  (`status='failed' AND type='usage'`) so a customer who is insolvent for a day
  produces one arrears row per hour, not hundreds.

### Two lists that must agree and don't automatically

`service_meters` carries both `status` and `ended_at`. The sweep filters on
**both** (`ended_at IS NULL AND status = 'active'`). Nothing enforces that they
agree, so a row with `status='active'` and `ended_at` set is a resource that
stopped and might still be billed, or the reverse. As of 2026-09-03 all 8 rows
agree; the admin monitor board alerts on disagreement.

---

## 3. Guarded functions

All writes to money or prices go through `SECURITY DEFINER` functions. The
pattern exists because the rules must bind *every* caller — a route-level check
is opt-out by construction, and this platform has twice ended up with two
disconnected price books because "the only caller today" was assumed.

| Function | Guards |
|---|---|
| `set_price(...)` | plan must exist in `service_plans`; setup fee 0–500; rate model validated by `resolve_hourly_rate`; carries forward an omitted setup fee |
| `set_gpu_markup(...)` | markup ≥ 1.000 (below cost refused **in the database**); zero-rows-matched is a failure, not a quiet success; blanket edits need an explicit flag; returns a quote-vs-charge **drift block** |
| `charge_service_hour(...)` | claims the hour by INSERT before deducting; applies discounts; records `balance_after`; writes an **arrears** row when the wallet is short |
| `move_credit(...)` | moves a balance and writes its ledger row **in one transaction** |
| `billing_redeem_promocode_atomic(...)` | row lock, expiry, per-user, cap, auto-deactivate, and writes its own ledger row |
| `meter_coverage(...)` | read-only. hours elapsed vs hours billed per open meter, with a verdict |
| `resolve_hourly_rate(...)` | the single conversion; `IMMUTABLE`. Raises rather than defaulting a missing quantity or upstream cost to zero |
| `current_price(...)` | exact `plan_key` wins, falls back to the service's `'*'` row |
| `deduct_user_credit_atomic(...)` | `FOR UPDATE` lock, refuses overdraft |

`service_role` has **SELECT only** on `service_pricing`. Price writes must go
through `set_price`; the table cannot be written directly by the application.

### `HOURS_IN_MONTH = 720`

`billing.hours_in_month()` returns **720** (24 × 30), not 730. Every monthly
price divides by 720. `lib/pricing/price-book.ts` mirrors this deliberately —
the quote and the charge only agree if they do identical arithmetic. Changing it
would re-rate every service by 1.4% against what the sweep charges.

---

## 4. The audit log

`audits.audit_logs` is a **partitioned, append-only** table — one partition per
month, 13 currently, 3267 rows.

```sql
-- attempting to remove a row:
ERROR:  P0001: Audit logs are immutable. Modifications are not allowed.
CONTEXT:  PL/pgSQL function audits.prevent_audit_modification()
```

The trigger fires on UPDATE and DELETE and **the table owner cannot bypass it**.
Partitions additionally grant `service_role` only INSERT. This is the correct
design for an audit log; it also means a mistaken row is permanent.

> One such row exists: a test audit entry written at `2026-09-03 11:01:24`
> attributed to `deep.aghera@ahurasense.com` with `action='update'`,
> `service_type='auth'`. It was written while verifying that audit writes worked
> again after the schema was re-exposed, and it cannot be removed. It is not a
> real admin action.

### Vocabulary

Two CHECK constraints define what can be audited. Both were extended on
2026-09-03 because they silently rejected whole classes of row:

```
service_type   kubernetes, database, network_ddos, platform_apps, object_storage,
               auth, git_webhook, ai_agent, knowledge_base, domain, compute,
               billing, pricing, discount, gpu          ← last four added
action         create, update, delete, login, logout,
               access                                    ← added
```

Before that, **a price change could not be audited at all** — the row was
refused by the database. Combined with the schema being unexposed, the admin
panel's claim that price writes "are audited" was untrue in two independent
ways. The three price changes made on 2026-09-02 left no audit trail;
reconstructing who made them relied on `service_pricing.created_by`, which only
worked because that table is append-only.

---

## 5. Dropped tables and their replacements

The 2026-08-31 billing relaunch dropped the old pricing tables. Code that still
read them did not error — it received empty results and treated them as valid:

| Dropped | Replaced by | What reading it produced |
|---|---|---|
| `public.products` | `billing.service_pricing` | `{ initialCost: 0, hourlyRate: 0 }` — services quoted as free |
| `public.instance_plans` | `public.service_plans` + `service_pricing` | a caught error and hardcoded `DEFAULT_PLANS`, logged as "using code defaults" |
| `public.gpu_pricing` | *still live* | — GPU quotes still read this, separate from the charge book |

An archive schema `pricing_archive_20260831` holds the pre-relaunch rows and was
used to backfill setup fees.

**`public.gpu_pricing` is still the quote-side book for GPU** and is not
reconciled with `billing.service_pricing`. That is the last remaining
two-book service; see [Current State](07-current-state.md).

---

## 6. Security posture

Findings from 2026-09-03, all resolved unless noted:

- **`audits.audit_logs_2026_04` had RLS off** with 986 rows and a direct SELECT
  grant to `authenticated`. Policies on a partitioned parent govern queries
  *through* the parent; a partition accessed directly enforces its own. So those
  rows were readable by any logged-in user, admin or not. Only the schema being
  unexposed was hiding it — and the fix for the dead audit trail was to expose
  it. RLS enabled first, then re-exposed. **12 of 12 partitions now protected.**
- **`support` tables** are correctly scoped: RLS on, policies keyed
  `owner_id = auth.uid()`, attachments and messages scoped through the owning
  ticket.
- **`audit_logs` parent policy** allows SELECT to `authenticated` only where
  `user_profiles.roles` contains `'admin'`; `service_role` may INSERT.
- **"Automatically expose new tables" is ON** in the Data API settings. Any new
  table in an exposed schema joins the public API by default — which is how a
  partition ends up reachable without anyone deciding it should be. Supabase's
  own guidance is to disable it. **Not yet changed.**
- **Prior finding, unresolved:** six `public` tables were previously found with
  RLS off and `anon` SELECT/INSERT, including plaintext hypervisor passwords.
  Verify before assuming this is historical.

---

## 7. Migrations

`supabase/migrations/` — applied manually, not by CI.

The repo has drifted behind the live schema before: eleven migrations were
reconstructed from `supabase_migrations.schema_migrations.statements` in late
August after being applied without files. When applying a migration, commit the
file in the same pass. The drift is silent and only discovered when someone
tries to rebuild.

Recent, all applied and committed:

```
20260902140000  compute bills the frozen rate      (resold VMs billed nothing)
20260903040000  sold-out coupon message
20260903050000  move_credit — money with its record
20260903060000  coupon credit writes its own ledger row
20260903100000  audits: close the unprotected April partition
20260903120000  usage rows carry their balance
20260903140000  meter_coverage function
20260903150000  audit vocabulary for billing and access
20260903160000  sweep records arrears
20260903170000  coverage verdict requires proof
```
