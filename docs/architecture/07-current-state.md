# Current State

**Read on 2026-09-03, re-read 17:06 UTC after the afternoon's work.** This is
the "is it working right now?" document. It goes stale fast — check the dates
and re-run the queries rather than trusting it.

Two states coexist this evening and this document says which is which: the
afternoon's **migrations are applied** to production, while the afternoon's
**code is in the working tree, uncommitted and undeployed**. The host runs the
morning's commits.

---

## 1. Platform snapshot (17:06 UTC)

```
live price rows           82  across 11 service types
open meters                6  compute 1, gpu_volume 3, objectspace 2
service_charges          318  rows, 80 distinct hours, $9.34, 3 users
paas.project_charges     828  rows, $8.31; each with a ledger row since the 16:51 migration
transactions             901  rows, 823 of them the PaaS backfill
arrears rows               0  (mechanism live since 2026-09-03, nothing owed yet)
sweep_runs                 1  a dry run from a workstation; no --apply row until the next deploy
unbilled_resources()      11  8 vector collections, 3 game servers past ends_at
servers                    1  a Nanode test VM, billing correctly
gpu_pods                  15  all terminated
support tickets           18  creation working again since 2026-09-03
audit rows              3276  writes working again since 2026-09-03
user_credits rows         15  14 with balance; several are seeded test values
promocodes                14  one redeemable (TRIAL5, expires 2026-09-04)
discounts / grants       0/0  never used
RLS off                    0  in public (8 this morning); 9 inference, 6 billing
```

---

## 2. What is verified working

Each of these was exercised against production on 2026-09-03, not inferred.

| | Evidence |
|---|---|
| **Compute quote → charge** | VM `sdsd-9y20u`: quoted `$0.0180/hr`, frozen `$0.0180`, charged `$0.0180`, balance moved exactly `−0.018`, ledger row rendered, re-run returned `already-charged` |
| **Price change reaches the dashboard** | set `s-2` to `$0.0999` → deploy page read `$0.0999` / `$71.93/mo`; reverted |
| **Frozen-at-create holds** | markup on `g6-standard-1` doubled while a VM ran; `hourly_cost` unchanged, sweep still charged `$0.0180`, a new VM would quote `$0.0360` |
| **Coupon redemption** | A redeems `+$1.000000` with ledger row; A again refused; B redeems and trips the cap; C refused; auto-deactivate fired |
| **Coupon kill switch** | `WELCOME1` created via the real form (`one-time` **with** `max_redemptions=1`), deactivated, redemption refused |
| **Support tickets** | `#SUP-2026-000018` created through the real code path, then deleted |
| **Audit writes** | first successful write since 2026-08-26; `update/pricing` and `access/billing` both accepted |
| **Money is atomic with its record** | a debit whose ledger row could not be written left the balance untouched — $50 did not vanish; overdraft threw instead of no-opping |
| **Arrears** | insolvent `gpu_volume` charge wrote one arrears row; retry wrote none |
| **Coverage RPC** | six rows matching an independent SQL check; surfaced the 08-31 07:00–08:00 gap, since explained (§4) |
| **The sweep timer** | `service_charges` rows land at `:10`–`:11` every hour, 79 consecutive fires 2026-08-31 10:10 → 09-03 16:10, last period 15:00 |
| **PaaS debits are ledgered** | `ved@samatva.com`: +100.000000 top-up +5.000000 coupon −5.000000 setup −6.833681 `service_charges` −0.498628 `project_charges` = 92.667691, the live balance to the cent at verification; 823 rows backfilled; by 17:06 the balance had moved by exactly one more project-hour (92.658102), the new function charging on schedule |
| **Roles are not self-service** | in a rolled-back transaction: self-promotion to `admin` refused, a bio edit allowed |
| **The eight open tables are closed** | 17:06 UTC: no `anon`/`authenticated` grant on `proxmox_hosts`, `proxmox_templates`, `public_ip_pools`, `public_ip_pool_ips`, `platform_resource_mutation_locks`; SELECT only for `authenticated` on `database_types`, `service_plans`, `gpu_pricing`; `public` RLS-off count 0 |
| **Unbilled resources are listed** | `billing.unbilled_resources()` returns 11 rows: 8 `inference_vector`, 3 `game_server` |

---

## 3. Open decisions

Things waiting on a human, not on work.

| | Decision |
|---|---|
| **GPU pod test** | The last untested surface, ~$0.50. Also the only place quote and charge still read separate books. |
| **Gateway token billing** | Nothing bills `inference.usage` to a wallet: 2,083 rows, last 2026-08-26, 39 active keys, a per-key hard cap and no balance. The 09-01 docs said the sweep was authoritative here; it never was. Bill it, or state that the gateway is free. |
| **Meter the 8 vector collections** | `$8/mo` in the price book, never a meter, and the sweep's registry entry could not have billed them before 09-03 anyway. `unbilled_resources()` and the dead-man will fail on them until they are metered or the price row is withdrawn. |
| **Decide the 3 game servers** | 29 days past `ends_at` with `auto_renew` on, $26/mo between them, because nothing called the renewal sweep after 2026-08-24. The timer now runs it every 15 minutes; whether the 29 days are charged, forgiven, or the servers suspended is a product call, and `renewals.ts` now refuses a NULL price rather than renewing for free. |
| **`sharma11aniket@gmail.com`** | The ~$4,623 overcharge from the 720× bug. No refund row exists; balance $3.02 against $3,561 of completed top-ups. Refund or write-off is undecided. |
| **Retire the old admin API routes** | The console is gone (`dcaa5b1c`); 77 routes under `app/api/admin/` remain, and the object-storage and DDoS create flows branch into them. A second door onto the same data with its own guard history. |
| **Settle arrears on top-up** | Arrears rows now record unpaid hours. Nothing collects them. Whether a broke customer accrues a debt or gets free hours is a product call. |
| **Unify the GPU books** | `gpu_pricing` (quote) vs `service_pricing.gpu_pod` (charge). Compute is done; GPU is not. Direction agreed: markup-primary. |
| **Admin repo migration sync** | The panel repo shares the database and reads with `service_role`, so today's RLS changes do not bind it; whether it needs copies of today's migrations, and which repo owns `supabase/migrations`, is undecided. |
| **"Automatically expose new tables"** | ON in the Data API settings. It is how `service_plans` and `gpu_pricing` joined the anon-readable list. Supabase advises disabling. |
| **Proxmox credential rotation** | `proxmox_hosts.password` and `token_secret` were anon-readable from at least 2026-08-23 until this afternoon. The door is closed; the credentials are the same. Deferred by the owner. |
| **Marketing `/pricing`** | Still reads the dropped `products` table and returns zero tiers. Deliberately deferred — dashboard first. |
| **Test suite** | 72 of 196 files failing; `dev` auto-deploys with no gate that has run. The working-tree `deploy.yml` adds a typecheck gate and a non-gating vitest run; neither has executed. |
| **129 dependabot vulnerabilities** | 3 critical, 60 high, on the default branch. Nobody is looking at them. |
| **Twitter handle / OG image** | A 2.85 MB OG image, and the real handle is unconfirmed. |

---

## 4. Known gaps

Things that are understood and not yet fixed.

### The working tree is not deployed

At 17:06 UTC the afternoon's seven migrations are applied and its code is
uncommitted: `deploy.yml` and the three timers, `sweep.ts`, `deadman.ts`, the
teardown paths, the renewal and game-plan fixes, the PaaS meter, the deployment
meter, the audit and balance reads, `select-all.ts`, the admin users guard, and
two worker files. Until pushed, the host runs the morning's commits: the sweep
still treats exit 1 as success and writes no `sweep_runs` row, and the renewal
timers are not guaranteed by CI. The worker changes additionally need
`wrangler deploy`.

### The two coverage holes are explained and unrecoverable

```sql
select * from billing.meter_coverage();
```

| meters | window | what it was |
|---|---|---|
| 2 (2 customers) | 2026-08-31 07:00–08:00 | the gap between a manual run at 07:38 (billed 06:00) and the timer's first fire at 10:10 (billed 09:00); the timer was not installed yet. Not an outage: nothing was scheduled |
| 2 (`ved@samatva.com`) | 2026-08-31 07:00 → 09-01 10:00 | no `user_credits` row until the $100 top-up; 28 contiguous unpaid hours, resumed at the next sweep. `arrears` did not exist yet, so no row |
| 1 (`harshit.hv@outlook.com`) | 2026-09-02 16:00 → 09-03 02:00 | compute only; four other meters billed every hour. A hand-applied migration (`20260902140000`, ~15:00) raced the code push that made it work (`a6098a2d`, 03:16); `resolve_hourly_rate` raised every hour and the sweep wrote PROBLEM to a journal nobody read |

None of these are recoverable: the sweep only bills the hour in front of it and
there is no backfill. Detail in [Pricing & Billing](03-pricing-and-billing.md) §6.

### Gateway usage is not billed

No meter, no debit, no ledger row for any of the 2,083 `inference.usage` rows.
The KV counter is a hard cap. See [Inference](02-inference-ai.md) §3.

### Eleven resources with no meter

`billing.unbilled_resources()`: 8 `inference_vector` collections and 3 game
servers past `ends_at`. Both are open decisions (§3); until then the dead-man's
third question fails on every run.

### Three wallet paths without a ledger row

The provisioning hold and the setup fee in `config/billing-flow.ts` move money
and write their row afterwards, discardably; AI-agent usage calls
`Billing.deduct` and writes nothing. None of the three is exercised often. See
[Pricing & Billing](03-pricing-and-billing.md) §5.

### The dead-man's armed status is unknown

Its two secrets could not be verified from this session. If the workflow's run
history shows exit 2, the sweep is unwatched. Once it runs, expect question 1
to fail until the new `sweep.ts` has fired once and question 3 to fail until
the eleven resources above are decided.

### Arrears are recorded but never collected

The rows make the debt visible. Nothing settles it on a later top-up. Zero rows
exist.

### `balance_after` is blank on older usage rows

Usage charges only started recording the resulting balance on 2026-09-03. Older
rows show nothing in the billing UI, and so do the 823 backfilled PaaS rows.
This is deliberate — the balance was not recorded, and deriving it backwards
from today's balance would silently absorb every missing ledger row into a
wrong number. An honest gap beats a confident fabrication.

### One permanent test row in the audit log

`2026-09-03 11:01:24`, attributed to `deep.aghera@ahurasense.com`,
`action='update'`, `service_type='auth'`. Written while verifying that audit
writes worked after the schema was re-exposed. The table is immutable by
trigger and **the row cannot be removed**. It is not a real admin action.

### Discounts have never run

`billing.discounts` and `discount_grants` are empty, so the entire discount
branch in `charge_service_hour` has never executed against real data. It is
well-built code of unknown behaviour.

### v1 machinery is still written, and some of it still unscheduled

`settleProvision` and `postProvisionBilling` still insert `billing.active_*`
rows; a few provisioning paths read their presence as "already billed", and
nothing bills from them. The grace-delete, grace-events and bandwidth-sync
routes are deliberately not on any timer: they read `billing.active_*` and
`billing.service_lifecycle`, nothing writes `service_lifecycle` any more, and
the deletion executor treated a failed read as "already deleted".

### Security items still open

- Proxmox hypervisor credentials were anon-readable from at least 2026-08-23
  until this afternoon and have not been rotated (deferred by the owner).
- Six leaked keys reported as readable in git history were not re-checked on
  2026-09-03 and are not known to be rotated.
- "Automatically expose new tables" is still ON.
- `authenticated` still holds UPDATE on every column of `user_profiles`; the
  policy's `WITH CHECK` is what now stops a roles edit, not the grant.

---

## 5. Fixed on 2026-09-03

### Morning: fifteen commits on `dev`

Grouped by what they were actually about:

**Money moving without a record**
- `46dbdac1` — `billing.move_credit`: money and its ledger row commit together;
  17 call sites converted. Domain purchases/refunds/renewals, game provisioning
  and renewals, platform-app bandwidth, inference deployment/fine-tune/serving,
  kubernetes refunds, coupons, teardown.
- `0a4c9cbb` / `20260903060000` — coupon credit writes its own ledger row inside
  the redemption transaction.
- `20260903160000` — the sweep records arrears instead of writing off unpaid
  hours.

**Prices that could not be resolved**
- `a6098a2d` — resold VMs were quoted at markup and billed nothing, forever.
- `81e8599d` — GPU price writes go through the guarded function, so the drift
  detector actually runs.
- `52c6d12e` — the GPU pricing screen surfaces the reasons it is given, and
  warns when quote and charge disagree.

**Signals that read healthy while being wrong**
- `20260903100000` — the one audit partition with RLS off, closed *before*
  re-exposing the schema.
- Exposed-schemas restored — repaired ticket creation, the activity feed and the
  audit trail in one change.
- `20260903140000` / `170000` / `c5cf2bf1` — `meter_coverage()`, its verdict
  correction, and its units.

**Customer-facing**
- `b135b5cd` — a sold-out coupon no longer claims it was switched off.
- `7b4df63e` — crypto icons render; usage rows carry their balance.
- `181725e5` — a username cannot be changed after it is set.
- `20e9445b` — 28 em-dash asides rewritten; the 100 `"—"` empty-value
  placeholders left alone.
- `c35fc579` — the ticket thread reads as a conversation.
- `0a4c9cbb` — replies use the same rich text editor the ticket was written in.

### Midday: three more commits

- `eca17c0c` / `20260903180000` — `billing.revenue_daily`, reporting accrual
  separately from revenue (its PaaS half was corrected in the afternoon).
- `9f1a633c` — object storage and DDoS deploy pages showed $0.
- `dcaa5b1c` — the admin console removed from the customer app; the 77 API
  routes stay.

### Afternoon: seven migrations applied, code in the working tree

**Money moving without a record**
- `20260903165150` / `20260903165154` — `paas.charge_project_hour` debits
  through `move_credit`; 823 historical project-hours backfilled;
  `revenue_daily` reports PaaS as settled. Proved by the wallet arithmetic in
  §2.
- `config/billing-flow.ts`, `lib/supabase/queries/billing.ts` — the v1 teardown
  "final prorated charge", which resolved to the resource's whole lifetime, is
  logged and not deducted; five teardown paths that never closed their v2 meter
  now do. No customer was hit.

**Schedules**
- `.github/workflows/deploy.yml` installs `ahura-billing-sweep`,
  `ahura-game-renewals` (every 15 min) and `ahura-domain-renewals` (daily 09:05
  UTC), asserts each timer active, and masks `ahura-cron`; `deploy/deploy.sh`
  masks it instead of restarting it. The two renewal routes had had no caller
  since 2026-08-24.

**Signals that read healthy while being wrong**
- `20260903165251` — `billing.sweep_runs` and `unbilled_resources()`;
  `sweep.ts` records every run including "no open meters";
  `ahura-billing-sweep.service` no longer lists exit 1 as success;
  `deadman.ts` asks four questions instead of one.
- `20260903165202` — a zero upstream cost under `markup` raises; the sweep
  counts `zero-cost` as a PROBLEM; three registry entries corrected
  (`inference_vector` had no `status` column to read, `platform_apps` listed
  statuses its CHECK cannot hold, `custom_image` joined on the wrong column);
  meter loading paginates past the 1000-row cap.
- `.github/workflows/migration-drift.yml` — the folder is compared with
  `schema_migrations` every six hours.
- The "empty reads as valid" family, in code: `lib/services/game/renewals.ts`
  (a NULL `monthly_price` is an error, not a free renewal; silent skips count
  as errors; an `unhandledExpired` count), `lib/pricing/game-plan-catalog.ts`
  (a DB failure throws instead of serving hardcoded plans), `app/api/v2/_lib/afford.ts`
  (no `user_credits` row refuses a deploy), `scripts/v3/meter-apps.ts` (a 404
  or malformed pod list is "cluster unreadable, billed nothing", not "idle"),
  the inference deployment meter (unknown SKU / no payer / failed inventory read
  do not advance `last_metered_at`), the inference usage consumer (an unknown
  model inserts a row with `error_code='unpriced'`), the spend middleware (a
  stored cap of 0 blocks; only NULL means no cap), `lib/audit/service.ts`
  (reads throw instead of returning "no activity"), `get_balance` (throws
  instead of returning 0), and `lib/supabase/select-all.ts` where totals were
  summed over at most 1000 rows.

**Security**
- `20260903165135` — any signed-in user could set `roles=['admin']` on their
  own row; the update policy now pins `roles` and `suspend`.
- `20260903195000` — eight `public` tables that were readable and writable
  with the anon key (including the Proxmox host credentials) locked down;
  twelve `SECURITY DEFINER` functions, including one that let any user insert a
  pending top-up of any amount, taken away from `anon` and `authenticated`.
- `20260903165206` — `pgrst.db_schemas` is a migration, not a dashboard field.
- `app/api/admin/users` uses the shared `requireAdmin()`.

---

## 6. The pattern worth keeping

Almost every defect above was **a signal that read healthy while being wrong**:

- a dropped table returning no rows became "free"
- a dead audit log became "no activity"
- an unexposed schema became "no tickets"
- a sweep with an eleven-hour hole reported "last ran: minutes ago"
- an empty editor holding `<p></p>` passed a length check as content
- the tool built to catch that class, on its first run, accused a customer
  holding $656M of not paying
- and then, the same afternoon: a sweep that wrote PROBLEM every hour to a
  journal nobody read while its unit declared exit 1 a success; a NULL monthly
  price that became a free renewal; a 404 from the cluster that became "idle";
  a stored cap of 0 that became "no cap"; and a PaaS that had been debiting
  every hour without a ledger row and was therefore read, from the outside, as
  money nobody had collected

Every one was fixed the same way: **make the empty case say something** instead
of resolving to a plausible zero. A missing price now throws. An unreachable
table renders grey. A count carries its denominator. A verdict that accuses
requires a receipt. A run that finds nothing still writes a row saying so.

That is the design rule this platform has paid for, repeatedly, and it is worth
more than any individual fix in this document.
