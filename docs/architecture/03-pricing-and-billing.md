# Pricing & Billing — Architecture Reference

**Scope:** every metered service — VPS, GPU pods, GPU volumes, object storage,
Spectrum, managed databases, Kubernetes, platform apps, custom images, vector
collections
**Model:** prepaid credit, charged hourly in arrears
**Status:** v2 spine live since 2026-08-31, running unattended
**Last verified against running system:** 2026-09-03 17:06 UTC

First written 2026-09-01 08:59 UTC and rewritten 2026-09-03 so that what changed
on 09-02 and 09-03 lives in the body rather than in an addendum contradicting
it. §1 is the incident history and is unchanged. Where a statement from the
09-01 version turned out to be false, the false version is quoted and corrected
in place rather than deleted.

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

### Found after the relaunch

Three more of the same family, found on 2026-09-03 by reading rather than by
alarm. None reached a customer.

| What it was | Cost | Where |
|---|---|---|
| The PaaS debited the wallet every hour from 2026-08-28 and wrote no ledger row; `revenue_daily` reported it as "accrual with no collector" | $8.31 across 828 project-hours, 823 of them with no record until the backfill | §5 |
| The v1 teardown "final prorated charge" resolved to the resource's whole lifetime, every hour of it already billed by the sweep | $0: no teardown had run since 08-31 | §4 |
| A hand-applied migration raced a code push and the compute meter went unbilled for eleven hours while the sweep wrote PROBLEM to a journal nobody read and systemd called exit 1 a success | 11 × $0.018, unrecoverable | §6 |

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
              │ billing.charge_service_hour()│  ← the hourly spine's
              │  claim + deduct, one savepoint│    debit path
              └──────────────┬───────────────┘
                             │
              ┌──────────────┴───────────────┐
              ▼                              ▼
   billing.service_charges          user_credits (balance)
   unique(type, id, period)         billing.transactions
```

Driven hourly by `scripts/billing/sweep.ts` under `ahura-billing-sweep.timer`,
installed by every deploy since 2026-09-03, and watched by
`scripts/billing/deadman.ts` from GitHub Actions. The PaaS runs a second,
parallel spine (`paas.project_charges`, `paas.charge_project_hour`, a Kubernetes
CronJob at `:04`); since 2026-09-03 it debits through the same `move_credit`
and lands in the same ledger. Those two are not the only things that move
wallet money; §5 lists every path.

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
| `setup_fee_usd` | one-off fee at provisioning, 0–500. Added 2026-09-02; 14 live fees, all $5 |
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

### `billing.set_price()` is the only way in

The rule below used to be a convention every client had to remember. It is now
enforced: `service_role` holds only `SELECT` on `billing.service_pricing`, and
all writes go through `billing.set_price()` (SECURITY DEFINER, so it still
works). A client that forgets the discipline and `UPDATE`s in place cannot —
the grant table refuses it.

`set_price` validates the plan exists in `public.service_plans`, dry-runs the
model/unit pairing through `resolve_hourly_rate` before writing, takes
`FOR UPDATE` on the live row, then closes it and inserts the replacement
atomically at an hour boundary. An omitted setup fee is carried forward from
the row being closed.

The fiddly case is a price corrected **within the same hour it was created**.
Closing it at `date_trunc('hour', now())` would set `effective_to =
effective_from` — a zero-length window the `window_ordered` CHECK refuses. That
case is a correction, not a change: the sweep bills the hour that has
*completed*, so a price set at 10:15 and revised at 10:45 never priced anything.
It updates in place and returns `corrected`. Any earlier price is closed, never
edited, because it may have priced real charges.

### `public.service_plans` — the catalog

What plans exist, separate from what they cost: slug, display name, specs,
provider size mapping. **It carries no price columns.**

This exists because dropping `products` and `instance_plans` as "pricing tables"
also destroyed the plan *definitions* that `plan_key` references — leaving
`plan_key` pointing at identifiers nothing defined. Caught by the admin-panel
lane, not by me.

It lives in `public`, not `billing`, deliberately: provisioning needs to know
which sizes exist and shouldn't have to reach into the billing schema to find
out. The price book prices the catalog; the catalog knows nothing about money.

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
               ↑ upstream_cost is REQUIRED and must be > 0. A markup with
                 no cost, or a cost of 0, is UNKNOWN, not free — it raises
                 rather than returning 0. (NULL was refused from the start;
                 0 since 2026-09-03, migration 20260903165202: a resold
                 resource that costs us nothing does not exist, so a 0 is a
                 rate that was never written.)

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

82 live rows on 2026-09-03.

| Service | Model | Unit | Plans | Range |
|---|---|---|---|---|
| `compute` | fixed_hourly | usd_per_hour | 13 | $0.01 – $0.857/hr (self-hosted sizes) |
| `compute` / `*` | **markup** | multiplier | 1 | 1.00× passthrough for resold VMs: plumbing, not a price (below) |
| `database` | fixed_hourly | usd_per_month | 48 | $14.99 – $2,999.99/mo |
| `kubernetes` | fixed_hourly | usd_per_month | 8 | $60 – $150/mo |
| `platform_apps` | fixed_hourly | usd_per_month | 5 | $5 – $299/mo |
| `objectspace` | fixed_hourly | usd_per_month | 1 | $5/mo |
| `spectrum` | fixed_hourly | usd_per_month | 1 | $300/mo |
| `inference_vector` | fixed_hourly | usd_per_month | 1 | $8/mo |
| `gpu_pod` | **markup** | multiplier | 1 | **1.00× — at cost** |
| `gpu_pod_storage` | per_gb_hour | usd_per_gb_month | 1 | $0.10/GB-mo |
| `gpu_volume` | per_gb_hour | usd_per_gb_month | 1 | $0.08/GB-mo since 2026-09-02 12:00 UTC ($0.0875 before) |
| `custom_image` | per_gb_hour | usd_per_gb_month | 1 | $0.05/GB-mo |

**GPU is currently sold at cost (1.00× markup) — an open product decision, not
an oversight.** The constraint permits raising it; nothing else needs to change.

### Who reads the book

Until 2026-09-02 **nothing customer-facing read `billing.service_pricing`.**
Three separate paths quoted instead, and two of them failed silently:

| Path | Read | State |
|---|---|---|
| `config/pricing.ts` | `public.products` | dropped 2026-08-31 |
| `lib/pricing/plan-catalog.ts` | `public.instance_plans` | dropped 2026-08-31 |
| `createPod` | `public.gpu_pricing` | live, separate book |

`products` returning nothing became `{ initialCost: 0, hourlyRate: 0 }` — a
service whose price could not be found was quoted **and billed** as free, on the
provisioning path. `plan-catalog` was worse: it caught its own failure, logged
*"using code defaults"*, and served hardcoded `DEFAULT_PLANS`, so the VPS picker
kept working, looked correct, and ignored the admin panel entirely.

`lib/pricing/price-book.ts` is now the single place the app asks what something
costs. `resolveHourly()` deliberately mirrors `billing.resolve_hourly_rate()`,
720 h/month included — quote and charge agree only if they do identical
arithmetic. **A missing price throws.** Every path this replaced preferred a
plausible zero to an honest error. The same correction reached
`lib/pricing/game-plan-catalog.ts` on 2026-09-03: a database failure throws
instead of serving hardcoded `DEFAULT_GAME_PLANS`, and a NULL price throws.

Two things this turned up:

- **Setup fees would have been silently zeroed.** The old catalogue carried
  `fixed_price` alongside `price`; the book modelled only the recurring half.
  `service_pricing` gained `setup_fee_usd`, backfilled from the archive — 14
  live fees, all $5 (8 Kubernetes plans, 3 app sizes, object storage, 2 database
  plans). `set_price` carries an omitted fee forward.
- **The test suite was pinning the bug.** `tests/unit/pricing.test.ts` asserted
  twice that a missing price returns `hourlyRate: 0`. A defect written down as
  the specification, which converts every attempt to fix it into a broken build.
  Inverted.

### Resold compute bills the rate frozen at create

`charge_service_hour` resolves the price live by `(service_type, plan_key)` and
returns `no-price` before writing anything if it misses. Compute had two
disjoint key spaces:

```
billing.service_pricing   a-1, s-2…s-9, d-2…d-32     self-hosted   13 rows
public.linode_types       g6-standard-N, g1-*         resold        75 rows
```

Not one key appeared in both. A Linode VM opened a meter keyed
`g6-standard-1`, found nothing, and was **quoted at markup and billed nothing,
forever**. Confirmed on a real VM created through the customer UI: the quote was
right, the rate froze onto the server row correctly, the meter opened with the
right key, and the charge never happened.

`lib/billing/meters.ts:64` documents this exact failure in order to prevent it,
then strips the `linode:` prefix and stops — `linode:g6-standard-1` becomes
`g6-standard-1`, which is still not `s-3`. The guard names two key spaces and
only removes a prefix.

Resold compute now bills `servers.hourly_cost`, written at create by both create
paths. A `compute` / `*` passthrough row (`markup`, `1.0`) plus a `'*'` fallback
in `current_price` makes the lookup resolve. Quote and charge are the same number
by construction. The passthrough row is plumbing: at `2.0` every resold VM bills
double, so the panel hides it and its set-price route refuses `compute`/`*`.

The fix shipped in two halves on two days, and the gap between them is the
eleven-hour compute hole described in §6.

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
| `settleProvision` | opens the v2 meter; still writes the v1 `billing.active_*` row, as metadata |
| `postProvisionBilling` | opens the v2 meter; same v1 row |
| `closeActiveBilling` | closes the v2 meter, deletes the v1 row, **deducts nothing** (below) |

An earlier attempt wired each service separately and covered **2 of 10** — it
missed the Proxmox compute path entirely. Central wiring means a new service
inherits metering by using the existing provisioning flow, rather than by
remembering to.

`lib/billing/meters.ts` provides `openMeter`, `closeMeter`, `openGpuPodMeters`
(a pod opens *two* — compute and storage) and `normalizePlanKey` (strips the
`linode:` prefix so plan keys match the price book).

### The v1 tables are still written

The 09-01 version of this document read as though `billing.active_*` had been
retired with the rebuild. They were not. `settleProvision` and
`postProvisionBilling` still insert the v1 row, and a few provisioning paths
read its presence as an idempotence latch ("already billed"); without it they
would re-charge the setup fee on every status poll. Nothing bills from those
rows: `hourly_rate` on them is never read by the sweep, and `last_billed_at` on
them has not been advanced by anything since the cron worker was deleted on
2026-08-24. That last fact is what made teardown dangerous.

### Teardown

Two paths close billing: `closeActiveBilling` in `config/billing-flow.ts`
(compute, GPU, custom images, inference vectors, and anything going through
the central flow) and `Billing.close_active_service` in
`lib/supabase/queries/billing.ts` (objectspace, spectrum, database, kubernetes,
platform apps). Until 2026-09-03 both computed a "final prorated charge" as
`active_*.hourly_rate × (now − last_billed_at)` and deducted it. Because
`last_billed_at` was frozen at provision time, the charge resolved to the
resource's **entire lifetime**, every hour of which the v2 sweep had already
billed. A 30-day pod would have paid for 720 hours twice. No teardown had run
since the 08-31 relaunch, so no customer was hit; the next one would have been.

`close_active_service` had a second defect: it never closed the v2 meter, so the
five services it handles leaked their meters on delete and the sweep would have
reported `PROBLEM-no-resource` every hour until someone noticed. That is the
deleted-bucket failure from §1 in a new coat.

Both paths now: close the v2 meter first, whatever the v1 row says; delete the
v1 row (the idempotence latch above); log what v1 would have charged, so the
two models can be compared; and deduct nothing. **The partial final hour is
deliberately unbilled.** Under-charging by up to an hour is the safe error
while the sweep bills only whole completed hours, and a teardown that could
throw on a deduction would keep a meter open on a resource the customer asked
to delete.

---

## 5. Charging — `billing.charge_service_hour()`

The hourly spine's debit path. The 09-01 version of this document called it
"the only thing in the system that moves money". It was not, and the list of
what does is below.

```
charge_service_hour(service_type, service_id, user_id, period_start,
                    plan_key, upstream_cost, quantity, units) → text
```

Returns one of: `charged` · `charged-free` · `already-charged` · `insufficient` ·
`no-price` · `zero-cost` · `invalid-amount`.

**Every outcome the function can decide is a named string, not an exception**,
so the sweep can count them and "already charged" is a normal result rather
than an error to be swallowed. One case raises instead: a `markup` price whose
upstream cost is `NULL` or, since 2026-09-03, `0` raises from
`resolve_hourly_rate`, and the sweep records it as `PROBLEM-error`. That is
deliberate. A missing cost is not an outcome of the hour, it is a broken price,
and it must not be countable as anything benign. It is what the compute meter
did for eleven hours on 09-02/03 (§6).

`charged-free` is the hour a free-hours allowance covered: claimed and recorded,
but no money moved. It is deliberately distinct from `zero-cost` (nothing to
bill) and from `charged` (money moved), because collapsing them would report a
working free tier as either a fault or as revenue.

`zero-cost` is also no longer benign from the sweep's side. A live resource
whose price resolved to nothing is a price that was never written, not a free
resource; since 2026-09-03 the sweep counts it as a PROBLEM.

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
was fixed there too; since 2026-09-03 that function's deduction goes through
`move_credit`, so its claim, its money and its ledger row share the savepoint.

`billing.service_charges` is unique on `(service_type, service_id, period_start)`
— so the sweep is **idempotent by construction**. Re-running a period cannot
double-charge; the second attempt gets `already-charged`.

### Every path that moves wallet money

`user_credits.credit_balance` is touched by all of the following. Verified by
reading the callers on 2026-09-03, not from memory.

| Path | Mechanism | Ledger row |
|---|---|---|
| `charge_service_hour` (hourly sweep) | claim + `deduct_user_credit_atomic`, one savepoint | `service_charges` row, unioned into `account_ledger`; an arrears row on `insufficient` |
| `paas.charge_project_hour` (Kubernetes CronJob `sweep-meter-apps`, `:04`) | claim in `paas.project_charges` + `move_credit`, one savepoint | `transactions`, `type='usage'`, `service_type='platform_apps'`, one per project-hour. Since 2026-09-03; 823 earlier hours backfilled with `metadata.backfilled=true` and `balance_after` NULL on purpose |
| the seventeen `move_credit` callers (converted 2026-09-03, `46dbdac1`) | debit or credit and its row in one transaction | yes: domain purchase, refund and renewal; game provisioning and renewals; coupons (`billing_redeem_promocode_atomic`); kubernetes and teardown refunds; inference deployment, fine-tune and serving-pod billing; platform-app bandwidth overage |
| Stripe top-ups (`app/api/billing/webhook`) | a `pending` row claimed before the money moves, completed after | yes |
| the provisioning hold (`reserveProvision` / `releaseProvision` / `settleProvision`, `config/billing-flow.ts`) | `Billing.deduct` of setup + one hour before the provider call, `Billing.topup` back on failure or settle | **none for the hold itself** |
| the setup fee (`postProvisionBilling`, `settleProvision`) | `Billing.deduct`, then `save_transaction` in a `try/catch` | **written as a separate, discardable step**: the pattern `46dbdac1` removed elsewhere |
| AI-agent usage (`app/api/ai-agents/[id]/test`, `app/api/v1/agents/[endpointId]/chat`) | `Billing.deduct` per completion, failure logged and ignored | **none**; usage goes to the agents' own analytics table |

The last three are the remaining places money can move without a matching row.
They were not among the seventeen converted on 2026-09-03 and are listed here
so that nobody re-derives "`move_credit` covers everything". None of them is
exercised often: no provisioning has settled since the relaunch, and the AI
agents lane has near-zero traffic. That is a reason to fix them before they
are, not a reason to leave them.

### Money and its ledger row commit together

Seventeen call sites moved a balance and then wrote `billing.transactions` as a
separate, discardable step — either a floating `.catch(console.warn)` or a
try/catch that logged and continued. The money had already moved; a failed write
was simply lost, with no retry, queue or reconciliation.

`billing.move_credit(...)` does both in one transaction, so a constraint
violation rolls the money back rather than leaving it unexplained. That is the
property `charge_service_hour` already had and nothing else did.

Five `save_transaction` sites remain. The two Stripe webhook paths are correct
(they claim a `pending` row *before* the money moves and complete it after, so
the record cannot be lost). The three in `config/billing-flow.ts` around the
setup fee are the pattern the seventeen were converted away from, and are in
the table above. The 09-01 version of this section counted an arrears write in
`close_active_service` among the correct ones; it is gone with the final charge
it recorded (§4).

The PaaS was the eighteenth site, and it was found by arithmetic rather than by
reading. `ved@samatva.com` on 2026-09-03: +100.000000 top-up, +5.000000 coupon,
−5.000000 objectspace setup, −6.833681 `service_charges`, −0.498628
`paas.project_charges` = 92.667691, which was the live `credit_balance` to the
cent. Leave the PaaS line out and the books do not balance. By 17:06 UTC the
balance had moved by exactly one more project-hour (92.658102), which is the new
function charging on schedule.

### Usage rows carry their balance

`account_ledger` hardcoded `NULL` for `balance_after` on the whole usage half of
the union, so the rows a customer most wants explained — the hourly charges that
quietly drain a wallet — were the only ones with no running balance.
`charge_service_hour` now records the balance its own deduction produced, and
the daily rollup reports the balance left by the last charge of that day.

Deriving it backwards from the current balance would have fixed history too, and
would have been a lie: ledger completeness was exactly what was broken, and a
derived balance silently absorbs every missing row into a wrong number. Rows
charged before this keep a NULL the UI renders as nothing. The 823 backfilled
PaaS rows carry the same NULL for the same reason.

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

### Arrears

An hour the wallet cannot cover is recorded as owed rather than forgotten, as a
`status='failed'`, `type='usage'` transaction, deduplicated per hour. Nothing
settles it yet. Zero rows exist as of 17:06 UTC. See
[Coupons & Discounts](05-coupons-and-discounts.md) §3.

---

## 6. The sweep — `scripts/billing/sweep.ts`

~600 lines. Runs hourly, bills the previous complete hour.

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

Three registry entries were wrong until 2026-09-03, and each read as healthy:

- `inference_vector` selected a `status` column the table does not have, so
  PostgREST would have refused the query and every vector meter would have been
  `PROBLEM-error` forever. No vector meter had ever been opened, which is the
  only reason it never fired. The entry now declares `statusColumn: null`:
  existing is the billable state, and a deleted collection is a missing row.
- `platform_apps` listed `active` and `deployed`, which the table's CHECK
  cannot hold, and omitted `pending` and `building`, so every mid-build app was
  reported as an unknown status. Now `running` bills and the CHECK's other five
  (`pending`, `building`, `failed`, `stopped`, `deleting`) do not. This is the
  v1 apps table; the v2 PaaS bills on its own spine and never opens a meter
  here.
- `custom_image` joined on the wrong column; it is `billing_service_id`.

`loadOpenMeters` also paginates. PostgREST on this project caps every response
at 1000 rows regardless of the limit asked for; an unpaginated read would have
billed the first thousand meters every hour and reported "charged 1000 of
1000".

### What counts as a problem

`PROBLEM-*` outcomes (no resource, unknown status, error), `insufficient`,
`no-price`, and since 2026-09-03 `zero-cost`. Any problem makes the run exit 1.

### Every run is recorded

Since 2026-09-03 every run, including "no open meters", writes one row to
`billing.sweep_runs`: `period_start`, `mode` (`apply` or `dry-run`), `meters`,
`charged`, `problems`, an `outcomes` tally, the exact `problem_lines`, and the
`host`. Until then the only record of a problem was this script's stdout in the
systemd journal on the host. A failure to record is logged and does not change
the exit code; the dead-man treats a missing run row as "the sweep did not
run", which is the right alarm for a sweep that ran and could not say so.

At 17:06 UTC on 2026-09-03 the table holds one row, a dry run from a
workstation. The host still runs the committed `sweep.ts`, which does not
record; the first `--apply` row appears after the next deploy fires at `:10`.

### Scheduling

`deploy/systemd/ahura-billing-sweep.{service,timer}`, copied into place,
enabled and asserted active by `.github/workflows/deploy.yml` on every deploy
since 2026-09-03. Before that the timer existed on the host only because
someone had once run the commands in `deploy/systemd/README.md` by hand; a
rebuilt host would have billed nothing and said nothing, the 2026-08-24 failure
with a different file name.

```ini
OnCalendar=*:10:00        # ten past every hour — bills the hour that just closed
Persistent=true           # a missed run while the box was down is caught up
RandomizedDelaySec=60
SuccessExitStatus=0       # was "0 1" until 2026-09-03
TimeoutStartSec=600
```

`Persistent=true` is what makes a reboot cost nothing.

`SuccessExitStatus=0 1` was there so the unit would not show "failed" when the
sweep exited 1 for a non-fatal condition. That is exactly the wrong trade: the
sweep said PROBLEM every hour for eleven hours, systemd said success, and nobody
reads the journal. A oneshot unit failing does not stop its timer, so it is now
allowed to fail; the findings go to `sweep_runs`, which the dead-man reads.

**This replaced the old `cron-worker.js`**, a node-cron process whose source
lived in a *different repository* — which is why deleting the deployed file from
`dev` broke billing with no visible cause in this repo. Its unit, `ahura-cron`,
is now disabled and masked by both `deploy/deploy.sh` and the workflow. Until
2026-09-03 `deploy.sh` restarted it on every deploy, and it only failed to bill
because its script no longer existed: it billed from `billing.active_*` rates
that include monthly figures in an hourly column, and it capped a window at 24
hours and charged the cap.

### How the timer's history reads

`service_charges` rows land between `:10:00` and `:11:01` past every hour from
2026-08-31 10:10 to 2026-09-03 16:10: 79 consecutive fires, no miss, exactly
the `OnCalendar` plus jitter above. Two windows looked like scheduling failures
under `meter_coverage()` and were not:

- **2026-08-31 07:00–08:00.** A manual run at 07:38 billed the 06:00 hour; the
  timer's first fire at 10:10 billed 09:00. The timer was not installed yet, so
  07:00 and 08:00 were never anyone's job. The 09-01 version of this document
  called it a "platform-wide outage"; it was the gap between hand and timer.
- **2026-09-02 16:00 → 2026-09-03 02:00.** Four charges every hour (three
  `gpu_volume`, one `objectspace`); only the compute meter was skipped.
  Migration `20260902140000`, which added the `compute/*` markup row, was
  applied by hand at about 15:00 on 09-02. The sweep code that passes
  `servers.hourly_cost` as the upstream cost (`a6098a2d`) was not pushed until
  03:16 on 09-03. In between, the deployed sweep hit a markup row with no cost,
  `resolve_hourly_rate` raised "markup requires upstream cost", the meter was
  written down as `PROBLEM-error` in the journal every hour, and systemd
  reported each run a success. The 04:10 fire billed 03:00 and everything since.

Neither window is recoverable: the sweep bills the hour in front of it, and
there is no backfill. The pair is the reason for `sweep_runs`, the
`SuccessExitStatus` change, the four-question dead-man, and
`migration-drift.yml`.

---

## 7. The dead-man watchdog

`scripts/billing/deadman.ts`, run from `.github/workflows/billing-deadman.yml`
on `35 */2 * * *`, from GitHub's infrastructure and not from the host, so that
the observer does not share a failure domain with the thing it observes.

Until 2026-09-03 it asked one question: how old is `max(period_start)` in
`billing.service_charges`? On 09-02/03 a compute meter went unbilled for eleven
hours while five other meters kept that timestamp fresh, and the check stayed
green throughout. Recency cannot see a hole behind it. It now asks four:

| | Question | Source | Fails when |
|---|---|---|---|
| 1 | Did an `--apply` sweep run? | `billing.sweep_runs`, newest `mode='apply'` row | none exists, or it is older than `BILLING_STALE_AFTER_HOURS` (3) while meters are open |
| 2 | Did it bill every meter? | `sweep_runs.problems`, and `billing.meter_coverage('6 hours')` | the last run reported problems, or any meter has a hole with verdict `stall` or `unexplained`. `arrears` is informational: the biller worked, the customer owes |
| 3 | Is anything running with no meter? | `billing.unbilled_resources()` | any row. On 2026-09-03 that is 8 `inference_vector` collections and 3 game servers past `ends_at`, so the first run will fail until those are decided (§9) |
| 4 | Backstop: is `max(period_start)` fresh at all? | `billing.service_charges` | older than the threshold with meters open |

The just-completed hour is exempt from question 2 before `:15`, because the
sweep has not had its turn yet.

**It does not ask systemd whether the service is running.** The 2026-08-24
outage had a *running* unit — restarting a deleted file, 100,000 times. Process
health said fine; no money moved. The only trustworthy signal is what the
database has been paid, and now also what the sweep itself wrote down from the
inside.

Exit codes are deliberately distinct and unchanged:

| Code | Meaning |
|---|---|
| 0 | everything that should be billed is being billed |
| 1 | **something is not being billed — the output says exactly what** |
| 2 | the watchdog itself could not run (bad credentials, network) |

1 ≠ 2 on purpose: "billing is broken" and "the alarm is broken" need different
responses, and collapsing them means a credential expiry looks like an outage
(or worse, an outage looks like a credential expiry and gets ignored).

> ⚠️ **Armed status unknown.** The workflow needs repo secrets `SUPABASE_URL`
> and `SUPABASE_SERVICE_ROLE_KEY`. They could not be verified from this session
> on 2026-09-03; if the workflow's run history shows exit 2, it is unarmed and
> the sweep is running unwatched. Two failures to expect once it does run:
> question 1 fails until the working-tree `sweep.ts` (the version that writes
> `sweep_runs`) is deployed and has fired once, and question 3 fails until the
> eleven unbilled resources are metered or decided.

---

## 8. Current live state

Read 2026-09-03 17:06 UTC.

| Metric | Value |
|---|---|
| Charge rows | 318 |
| Distinct hours billed | 80: 2026-08-31 06:00 from a manual run, then 09:00 → 2026-09-03 15:00 contiguous, one per timer fire |
| First period | 2026-08-31 06:00 UTC |
| Last period | 2026-09-03 15:00 UTC, billed by the 16:10 fire; the 16:00 hour is due at 17:10 |
| Total billed | $9.34 |
| Users billed | 3 |
| Open meters | 6 of 8 ever created: compute 1, gpu_volume 3, objectspace 2 |
| PaaS spine | 828 project-hours, $8.31, every one with a ledger row |
| Arrears rows | 0 |
| `sweep_runs` | 1 row, a dry run from a workstation at 17:04; the host records nothing until the working tree is deployed |
| `unbilled_resources()` | 11 rows: 8 `inference_vector`, 3 `game_server` |
| `ved@samatva.com` | now holds a `user_credits` row, $92.66; the 09-01 note that two of their volumes returned `insufficient` every hour is history |

The timer fired unattended for the first time at 10:10:27 on 2026-08-31 and has
fired every hour since. $9.34 over 80 hours is real but tiny — the platform has
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
| Dead-man secrets | **unverified** from this session; exit 2 in the workflow's history means unarmed |
| Working tree not deployed | everything marked "2026-09-03" in §4–§7 is applied in the database, but the code is uncommitted at 17:06 UTC. Until pushed, the host runs the committed sweep: exit 1 is still a success, nothing writes `sweep_runs`, the renewal timers are not installed by CI |
| Gateway token billing | nothing bills `inference.usage` to a wallet: 2,083 rows, last 2026-08-26, 39 active keys. [Inference](02-inference-ai.md) §3; decision in [Current State](07-current-state.md) §3 |
| Eleven resources with no meter | 8 vector collections priced at $8/mo that never got a meter (the registry entry could not have billed them anyway before 09-03), 3 game servers 29 days past `ends_at`. Decision in [Current State](07-current-state.md) §3 |
| Three wallet paths without a ledger row | provisioning hold, setup fee, AI-agent usage (§5) |
| `sharma11aniket@gmail.com` ~$4,623 overcharge | refund / write-off still undecided: no refund row, balance $3.02 against $3,561 of completed top-ups. Tracked in [Current State](07-current-state.md) §3 |
| Six unbillable days (24–31 Aug) | recoverable only by deliberately backdating `effective_from`; not done |
| Two coverage holes | 08-31 07:00–08:00 and 09-02 16:00 → 09-03 02:00 (compute only), both explained in §6, neither recoverable |
| GPU margin | 1.00× — sold at cost, product decision pending |
| Two GPU price books | `public.gpu_pricing` (192 rows, restored) vs `billing.service_pricing`. `createPod` still reads the former; it should read the price book |
| Corrected `products` rows | fixed in archive, not live |
| v1 machinery still present | `billing.active_*` rows written as metadata (§4); grace-delete, grace-events and bandwidth-sync routes deliberately unscheduled ([Platform Overview](00-platform-overview.md) §8) |

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
| `…20260831063455_billing_v2_fix_phantom_ledger_row.sql` | the savepoint fix |
| `…20260831073236_billing_v2_monthly_sanity_bound.sql` | the $10,000/mo and $10/GB ceilings |
| `…20260831073727_billing_v2_grant_charge_to_service_role.sql` | the EXECUTE grant the REVOKE stripped |
| `…20260831075245_billing_v2_drop_legacy_pricing_tables.sql` | retires v1 pricing (and drops `gpu_pricing` in error) |
| `…20260831081120_billing_v2_charge_applies_discounts.sql` | discounts inside the charge; adds `charged-free` |
| `…20260831081330_billing_v2_redeem_discount_code.sql` | code → grant |
| `…20260831083039_billing_v2_service_plan_catalog.sql` | `public.service_plans` |
| `…20260831083128_billing_v2_set_price_function.sql` | `set_price` |
| `…20260831083229_billing_v2_markup_unit_validated.sql` | markup unit check; `set_price` error shape |
| `…20260831084114_billing_v2_price_seed_candidates.sql` | archive → candidate rows, no arithmetic |
| `…20260831084156_billing_v2_price_writes_only_via_set_price.sql` | revokes direct writes on the price book |
| `…20260902140000` | `compute/*` passthrough, `current_price` `'*'` fallback |
| `…20260903050000` | `move_credit` |
| `…20260903120000` | usage rows carry `balance_after` |
| `…20260903140000` / `…170000` | `meter_coverage()` and its verdict correction |
| `…20260903160000` | arrears rows from the sweep |
| `…20260903165150_paas_charge_writes_its_ledger_row.sql` | `paas.charge_project_hour` through `move_credit`; `revenue_daily` reports PaaS as settled |
| `…20260903165154_paas_backfill_ledger_rows.sql` | 823 historical PaaS rows |
| `…20260903165202_billing_markup_needs_a_positive_upstream_cost.sql` | `resolve_hourly_rate` refuses 0 |
| `…20260903165251_billing_sweep_runs_and_unbilled_resources.sql` | `sweep_runs`, `unbilled_resources()` |
| `…20260903180000` | `revenue_daily()` |
| `scripts/billing/sweep.ts` | the hourly sweep |
| `scripts/billing/deadman.ts` | the four-question watchdog |
| `scripts/ops/call-internal-route.ts` | what the renewal timers run |
| `scripts/ci/migration-drift.ts` | folder vs `schema_migrations` |
| `lib/billing/meters.ts` | open/close helpers, `normalizePlanKey` |
| `lib/pricing/price-book.ts` | the app's single quote path |
| `lib/supabase/select-all.ts` | pagination past the 1000-row cap |
| `config/billing-flow.ts` | the single meter wiring point; teardown |
| `lib/supabase/queries/billing.ts` | `Billing.*`, `close_active_service` |
| `deploy/systemd/ahura-billing-sweep.*` | timer + unit + README |
| `deploy/systemd/ahura-game-renewals.*`, `ahura-domain-renewals.*` | renewal timers |
| `.github/workflows/deploy.yml` | installs and asserts the timers, masks `ahura-cron` |
| `.github/workflows/billing-deadman.yml` | watchdog schedule |
| `.github/workflows/migration-drift.yml` | drift check schedule |
| `docs/billing/ADMIN-PANEL-HANDOFF.md` | contract with the admin-panel lane |

### Migration drift, and how it was found

On 2026-09-01 the database held **20 applied migrations and the repo held 9
files**. Eleven migrations existed only in production — including the phantom-
ledger fix, `set_price`, `service_plans`, the discount application inside
`charge_service_hour`, and the `service_role` grant that makes the sweep work
at all. A rebuild from the repo would have produced a billing system that was
subtly and dangerously different from the live one.

Cause: `apply_migration` writes to the database and to
`supabase_migrations.schema_migrations`, but not to `supabase/migrations/`.
Applying eleven of them without writing the files was my own omission, spread
across a day's work where each individual skip looked harmless.

All eleven were recovered from `schema_migrations.statements` and written back,
using their real applied version numbers so `supabase db push` treats them as
already applied. The check that catches this is one query:

```sql
select version, name from supabase_migrations.schema_migrations
where version >= '20260830' order by version;
```

Compare it against `ls supabase/migrations/`. They should be the same length.
`.github/workflows/migration-drift.yml` runs that comparison every six hours
since 2026-09-03, given the `SUPABASE_DB_URL` secret. The afternoon's seven
migrations are applied and their files are in the working tree, uncommitted;
that is not drift, but it is one `git stash` away from it.

> Note: the six earliest files carry invented version numbers
> (`20260830000001`…) that do not match their applied versions
> (`20260831063017`…). Their *content* is correct and their sort order replays
> correctly; only the filenames differ. Renaming them would be tidier, but they
> are committed and other lanes pull this branch, so they are left as they are.

### Permissions

`charge_service_hour` had `REVOKE ALL … FROM public` applied, which also
stripped `service_role` — it inherits EXECUTE from PUBLIC rather than holding it
directly. EXECUTE is now granted explicitly. Worth recording that it failed
**safely**: the sweep reported a permission error and charged nothing, rather
than charging wrongly. The same trap was avoided on 2026-09-03 when twelve
`SECURITY DEFINER` functions were taken away from `anon` and `authenticated`:
each got an explicit `service_role` grant in the same statement
([Data Model](04-data-model.md) §6).
