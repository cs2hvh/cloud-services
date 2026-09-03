# Data Model

**Verified against production on 2026-09-03, last re-read 17:06 UTC.**

Seven schemas, 206 base tables, one Supabase Postgres instance
(`xafjjpgazdxhktpfeuri`) shared by the customer app and the admin panel.

---

## 1. Schemas

| Schema | Tables | RLS off | Purpose |
|---|---|---|---|
| `public` | 78 | **0** | services, plans, catalogues, hosts, profiles |
| `inference` | 67 | **9** | AI Labs — models, deployments, traces, vectors, usage |
| `billing` | 24 | **6** | wallet, price book, meters, charges, ledger, sweep runs |
| `paas` | 15 | 0 | platform-apps projects, deployments, domains |
| `audits` | 13 | 0 | append-only audit log, monthly partitions |
| `agentcore` | 6 | 0 | agent runs and steps |
| `support` | 3 | 0 | tickets, messages, attachments |

**RLS-off tables are not automatically a vulnerability** — most are
service-role-only and unreachable from the API. But the combination of RLS off
*and* a grant to `anon` or `authenticated` *and* the schema being exposed is,
and that combination has occurred here. `public` was at 8 on the morning of
2026-09-03 and is at 0 since the afternoon's lock-down. See §6.

Only schemas on PostgREST's allow-list are reachable at all:

```
pgrst.db_schemas = public, paas, billing, inference, audits, support
```

`agentcore` is deliberately not exposed. The list is pinned by migration
`20260903165206` since 2026-09-03, so the next change is a reviewed diff rather
than a dashboard edit; a dashboard edit is what replaced the list on 2026-08-26
and silently dropped `audits` and `support`.

---

## 2. Billing tables

The spine. Full behaviour in [Pricing & Billing](03-pricing-and-billing.md).

| Table | Rows (03 Sep) | Meaning |
|---|---|---|
| `user_credits` | 15 (14 with balance) | the wallet. **Authoritative balance.** |
| `service_pricing` | 82 live | the price book. Append-only, `effective_to IS NULL` = live |
| `service_plans` (public) | — | plan *specs*, separate from price |
| `service_meters` | 6 open | one open row per billable running resource |
| `service_charges` | 318 | one row per (service, hour) actually charged |
| `sweep_runs` | 1 (a dry run) | one row per sweep invocation: `period_start`, `mode`, `meters`, `charged`, `problems`, `outcomes`, `problem_lines`, `host`. Added 2026-09-03 |
| `transactions` | 901 | the ledger: top-ups, refunds, coupons, purchases, usage, arrears. 823 rows are the 2026-09-03 PaaS backfill |
| `paas.project_charges` | 828 | the PaaS hourly spine. Every row is a wallet debit; since 2026-09-03 each also has a `transactions` row |
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
- **Every debit of `user_credits` should leave a `transactions` row.** True for
  the hourly spine, the PaaS spine (since 2026-09-03) and the seventeen
  `move_credit` callers. Not yet true for the provisioning hold and setup fee in
  `config/billing-flow.ts`, or for AI-agent usage, which calls `Billing.deduct`
  and writes nothing. See [Pricing & Billing](03-pricing-and-billing.md) §5.

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
| `meter_coverage(interval)` | read-only. hours elapsed vs hours billed per open meter, with a verdict. EXECUTE granted to `service_role` 2026-09-03 |
| `unbilled_resources()` | read-only. live rows in every truth table with no open meter, plus game servers past `ends_at`; a NULL `billing_service_id` is reported as its own reason. `service_role` only. Added 2026-09-03 |
| `revenue_daily(interval)` | read-only. revenue per day and `service_type` from `service_charges` and `paas.project_charges`, both `settled = true` since 2026-09-03 |
| `paas.charge_project_hour(...)` | claims the project-hour in `paas.project_charges`, then debits through `move_credit` in the same savepoint (2026-09-03; before that it deducted with no ledger row) |
| `resolve_hourly_rate(...)` | the single conversion; `IMMUTABLE`. Raises rather than defaulting a missing quantity or upstream cost to zero; since 2026-09-03 a zero upstream cost under `markup` raises too |
| `current_price(...)` | exact `plan_key` wins, falls back to the service's `'*'` row |
| `deduct_user_credit_atomic(...)` | `FOR UPDATE` lock, refuses overdraft |

`service_role` has **SELECT only** on `service_pricing`. Price writes must go
through `set_price`; the table cannot be written directly by the application.

Twelve other `SECURITY DEFINER` functions were executable by `anon` and
`authenticated` until 2026-09-03, one of which inserted ledger rows. See §6.

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
- **Eight `public` tables were reachable and writable with the anon key.**
  Re-verified 2026-09-03: RLS off, with `anon` and `authenticated` holding
  SELECT, INSERT, UPDATE, DELETE and TRUNCATE on `proxmox_hosts` (`password`
  and `token_secret` columns), `proxmox_templates`, `public_ip_pools`,
  `public_ip_pool_ips`, `platform_resource_mutation_locks`, `database_types`,
  `service_plans` and `gpu_pricing`; a HEAD request with the anon key returned
  a row count for the hypervisor table. The last two joined the list through
  "automatically expose new tables". **Resolved** by `20260903195000`: RLS on
  and every grant revoked from `anon`/`authenticated` on the first five
  (sequences included); RLS on with one policy,
  `for select to authenticated using (true)`, on the three catalogue tables,
  because the database create wizard reads `database_types` under the user's
  session. Verified 17:06 UTC: no `anon`/`authenticated` grant remains on the
  five, and `authenticated` holds SELECT only on the three. **The Proxmox
  credentials in those rows have been readable since at least 2026-08-23 and
  are not rotated**; Proxmox work was deferred by the owner.
- **Any signed-in user could make themselves an admin.** The update policy on
  `user_profiles` was `for update using (auth.uid() = id)` with no
  `WITH CHECK`, and `authenticated` holds UPDATE on every column, so one PATCH
  through PostgREST set `roles = ['admin']` on the caller's own row. Everything
  downstream trusted it: `app/api/admin/users`, `lib/supabase/auth.ts` when
  `ADMIN_EMAILS` is empty, and every policy written as
  `'admin' = ANY(roles)` (the audit log SELECT policy, the game admin policies,
  the proxmox and IP-pool policies). Found by reading `pg_policies`, not
  exercised. **Resolved** by `20260903165135`; the policy now reads

  ```sql
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and roles   is not distinct from (select p.roles   from public.user_profiles p where p.id = auth.uid())
    and suspend is not distinct from (select p.suspend from public.user_profiles p where p.id = auth.uid())
  );
  ```

  The subselects read the row as it was before the statement, so "unchanged"
  compares new against old. Verified in a rolled-back transaction:
  self-promotion refused, a bio edit allowed. `service_role` bypasses RLS and
  keeps writing these columns from the admin routes.
- **Twelve `SECURITY DEFINER` functions were executable by `anon` and
  `authenticated`**, including `public.create_deposit_transaction`, which let
  any signed-in user insert a pending top-up of any amount into the ledger.
  **Resolved** by `20260903195000`: EXECUTE revoked from `public`, `anon` and
  `authenticated` and granted to `service_role` explicitly, because revoking
  from PUBLIC strips the grant `service_role` inherits (what stopped
  `charge_service_hour` on 2026-08-31). `public.is_admin` is deliberately
  untouched: five policies call it as the querying role.
- **Six leaked keys reported as readable in git history** were not re-checked
  on 2026-09-03 and are not known to be rotated.

---

## 7. Migrations

`supabase/migrations/` — applied manually, not by CI.

The repo has drifted behind the live schema before: eleven migrations were
reconstructed from `supabase_migrations.schema_migrations.statements` in late
August after being applied without files. When applying a migration, commit the
file in the same pass. The drift is silent and only discovered when someone
tries to rebuild. Since 2026-09-03 `.github/workflows/migration-drift.yml`
(`scripts/ci/migration-drift.ts`; every 6 hours and on any push touching the
folder) compares the folder with `schema_migrations`. It is uncommitted, needs
the `SUPABASE_DB_URL` secret, and exits 2 without it, which is a visible red
rather than a quiet pass. The other half of the problem, a hand-applied
migration racing a code push, is what left a compute meter unbilled for eleven
hours on 09-02/03; a check cannot prevent that, only report it.

Recent, all applied. The morning's are committed; the seven marked `wt` were
applied on the afternoon of 2026-09-03 and are in the working tree, not yet
committed. Version order does not match application order because the
morning's `170000` and `180000` carry invented times:

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
20260903165135  user_profiles: roles and suspend are not self-service   wt
20260903165150  paas.charge_project_hour writes its ledger row           wt
20260903165154  PaaS ledger backfill, 823 rows                           wt
20260903165202  markup needs a positive upstream cost                    wt
20260903165206  pgrst.db_schemas pinned in a file                        wt
20260903165251  billing.sweep_runs and unbilled_resources()              wt
20260903170000  coverage verdict requires proof
20260903180000  revenue_daily
20260903195000  lock down the eight open tables and dead functions       wt
```
