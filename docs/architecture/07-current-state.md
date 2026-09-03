# Current State

**Read on 2026-09-03.** This is the "is it working right now?" document. It goes
stale fast — check the dates and re-run the queries rather than trusting it.

---

## 1. Platform snapshot

```
live price rows           82  across 11 service types
open meters                6  compute 1, gpu_volume 3, objectspace 2
service_charges          306  rows
transactions              73  rows
arrears rows               0  (mechanism live since 2026-09-03, nothing owed yet)
servers                    1  a Nanode test VM, billing correctly
gpu_pods                  15  all terminated
support tickets           18  creation working again since 2026-09-03
audit rows              3267  writes working again since 2026-09-03
users with balance        14  several are seeded test values
promocodes                14  one redeemable (TRIAL5, expires 2026-09-04)
discounts / grants       0/0  never used
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
| **Coverage RPC** | six rows matching an independent SQL check; surfaced a previously-unknown outage |

---

## 3. Open decisions

Things waiting on a human, not on work.

| | Decision |
|---|---|
| **GPU pod test** | The last untested surface, ~$0.50. Also the only place quote and charge still read separate books. |
| **Retire the old admin** | It is de-coupled and duplicated by the panel. It remains a second door onto the same data with its own guard history. |
| **Settle arrears on top-up** | Arrears rows now record unpaid hours. Nothing collects them. Whether a broke customer accrues a debt or gets free hours is a product call. |
| **Unify the GPU books** | `gpu_pricing` (quote) vs `service_pricing.gpu_pod` (charge). Compute is done; GPU is not. Direction agreed: markup-primary. |
| **"Automatically expose new tables"** | ON in the Data API settings. Any new table in an exposed schema joins the public API by default. Supabase advises disabling. |
| **Marketing `/pricing`** | Still reads the dropped `products` table and returns zero tiers. Deliberately deferred — dashboard first. |
| **Test suite** | 72 of 196 files failing; `dev` auto-deploys with no gate. A red suite currently carries no signal. |
| **129 dependabot vulnerabilities** | 3 critical, 60 high, on the default branch. Nobody is looking at them. |
| **Twitter handle / OG image** | A 2.85 MB OG image, and the real handle is unconfirmed. |

---

## 4. Known gaps

Things that are understood and not yet fixed.

### The sweep's schedule is not accounted for

It billed every hour from 03:00 to 11:00 on 2026-09-03, and **nothing** between
16:00 on 09-02 and 02:00 on 09-03. No in-repo scheduler explains either
behaviour. `scripts/billing/sweep.ts` is dry-run by default and requires
`--apply`; the historical `credit-system-cron` worker was deleted from `dev` and
wiped off the host by a restart on 2026-08-24.

**Before trusting hourly billing, establish what actually runs it.**

### Two confirmed billing gaps, both surfaced by coverage

```sql
select * from billing.meter_coverage();
```

| meters | window | verdict |
|---|---|---|
| 2 (2 customers) | 2026-08-31 07:00–08:00 | `stall` — a **platform-wide two-hour outage** nobody had noticed |
| 2 (`ved@samatva.com`) | 2026-08-31 07:00 → 09-01 10:00 | `unexplained`; almost certainly insufficient balance — 28 contiguous hours, resumed at the next sweep after a $100 top-up |
| 1 (`harshit.hv@outlook.com`) | 2026-09-02 16:00 → 09-03 02:00 | `unexplained` — 11 hours; the deployed sweep could not price compute at the time |

None of these are recoverable: the sweep only bills the hour in front of it and
there is no backfill.

### Arrears are recorded but never collected

The rows make the debt visible. Nothing settles it on a later top-up.

### `balance_after` is blank on older usage rows

Usage charges only started recording the resulting balance on 2026-09-03. Older
rows show nothing in the billing UI. This is deliberate — the balance was not
recorded, and deriving it backwards from today's balance would silently absorb
every missing ledger row into a wrong number. An honest gap beats a confident
fabrication.

### One permanent test row in the audit log

`2026-09-03 11:01:24`, attributed to `deep.aghera@ahurasense.com`,
`action='update'`, `service_type='auth'`. Written while verifying that audit
writes worked after the schema was re-exposed. The table is immutable by
trigger and **the row cannot be removed**. It is not a real admin action.

### Discounts have never run

`billing.discounts` and `discount_grants` are empty, so the entire discount
branch in `charge_service_hour` has never executed against real data. It is
well-built code of unknown behaviour.

### Prior security findings not re-verified

Six `public` tables were previously reported with RLS off and `anon`
SELECT/INSERT, including plaintext hypervisor passwords, and six leaked keys
were reported as readable in git history and never rotated. **Neither was
re-checked on 2026-09-03.** Do not assume they are historical.

---

## 5. Fixed on 2026-09-03

Fifteen commits on `dev`. Grouped by what they were actually about:

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

---

## 6. The pattern worth keeping

Almost every defect above was **a signal that read healthy while being wrong**:

- a dropped table returning no rows became "free"
- a dead audit log became "no activity"
- an unexposed schema became "no tickets"
- a sweep with an eleven-hour hole reported "last ran: minutes ago"
- an empty editor holding `<p></p>` passed a length check as content
- and the tool built to catch that class, on its first run, accused a customer
  holding $656M of not paying

Every one was fixed the same way: **make the empty case say something** instead
of resolving to a plausible zero. A missing price now throws. An unreachable
table renders grey. A count carries its denominator. A verdict that accuses
requires a receipt.

That is the design rule this platform has paid for, repeatedly, and it is worth
more than any individual fix in this document.
