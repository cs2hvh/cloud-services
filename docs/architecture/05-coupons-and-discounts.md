# Coupons & Discounts

**Verified against production on 2026-09-03.**

Two separate systems share the word "discount" in conversation and almost
nothing in implementation. Confusing them wastes time, so start here:

| | Promocodes | Discounts |
|---|---|---|
| Effect | **adds balance** to the wallet | **reduces the hourly rate** |
| Table | `billing.promocodes` | `billing.discounts` + `discount_grants` |
| Redeemed by | customer, entering a code | granted, then applied automatically |
| Applied | once, at redemption | on every charge, by `charge_service_hour` |
| Rows live | 14 codes | **0 and 0** |
| Status | working, in use | built, never used |

A promocode is a gift card. A discount is a price adjustment. Only the first has
ever been used.

---

## 1. Promocodes

### Schema

```
billing.promocodes
  code             text     unique-by-case (enforced in the create route)
  amount           numeric  dollars added to the wallet
  coupon_type      text     'one-time' | 'limited' | 'multi-use'
  max_redemptions  integer  nullable
  redeem_by        jsonb    [{ userId, email, redeemedAt }, …]
  valid_till       timestamptz  NOT NULL
  is_active        boolean  operator kill switch
```

Redemptions are recorded **inside the row** as a JSONB array rather than in a
join table. That works at this scale and makes the per-user check a JSONB scan.

### Redemption

`billing.billing_redeem_promocode_atomic(p_code, p_user_id, p_email)`.

`SELECT … FOR UPDATE` on the code, then, in order:

```
1  code empty                     → "Promo code is required"
2  user or email missing           → "Unauthorized"
3  code not found                  → "You have entered an invalid promo code"
4  valid_till < now                → "Promo code has expired"
5  already redeemed by this user    → "You have already redeemed this promo code"
6  redemption cap reached           → "Promo code redemption limit reached"
7  is_active false                  → "This promo code is not active"
```

Then it appends the redemption, auto-deactivates a `limited` code that has hit
its cap, credits the wallet (creating the `user_credits` row if absent, with a
`unique_violation` fallback for the concurrent-insert race), **and writes its own
ledger row** — all in one transaction.

### Why that order

Steps 6 and 7 were originally reversed, and it mattered. The auto-deactivate
sets `is_active = false` the moment a `limited` code hits its cap, so the next
person to try was told *"This promo code is not active"* — indistinguishable
from an operator having switched the code off deliberately. A customer who just
missed the last redemption was effectively told the company had withdrawn the
offer, which invites a support ticket that the truth answers by itself.

Refusals now run **most-specific first**: expired → already-redeemed →
limit-reached → not-active. `already-redeemed` deliberately stays ahead of the
cap check: a user who has already redeemed should hear that, not "limit
reached", even when both are true.

Fixed 2026-09-03, commit `b135b5cd`.

### `coupon_type` used to be decorative

The function only ever read `coupon_type` in the auto-deactivate branch, so
`one-time` and `multi-use` behaved **identically**: unlimited distinct users,
once each. Live evidence sits in the registry — `WELCOME67` is marked
`one-time` with `max_redemptions = null` and has **three** redemptions by three
different people.

An operator creating a "one-time" coupon would reasonably expect one redemption
in total, and would have been wrong. This is now fixed **at the write path**: the
admin panel's create route forces `max_redemptions = 1` for `one-time`, so the
label means what it says. Verified end to end on 2026-09-03 with `WELCOME1`,
created through the real form:

```
coupon_type      one-time
max_redemptions  1          ← the constraint the label always implied
valid_till       2026-12-12 23:59:59+00   (expiry now mandatory)
created_by       ccf391ef-… (actor stamped)
```

`WELCOME67` is deliberately left in the registry as the counter-example.

### The ledger write used to be discardable

The API route credited the wallet through the RPC and then wrote
`billing.transactions` in a `try/catch` whose comment read:

```ts
// Don't fail the redemption — credits are already added
```

So a failed ledger write left a balance that had gone up with nothing
explaining why. That is how the August audit found **$110** of coupon credit
sitting in a wallet with no matching row. The ledger insert now lives *inside*
`billing_redeem_promocode_atomic`, in the same transaction as the credit: if the
row cannot be written, the credit and the redemption both roll back and the
customer simply tries again.

Fixed 2026-09-03, migrations `20260903060000` (function) and commit `0a4c9cbb`
(route).

### Creating codes

There was **no way to create a promocode** from the admin panel until
2026-09-03 — its coupons section was a read-only legacy registry, and its only
create dialog built rows for the (unused) discounts system. Codes could only be
issued via the old admin on `dev` or by raw SQL. That is why every code was
expired: nobody could easily make one.

The panel now has `POST /api/admin/coupons` (create, with mandatory expiry, a
$1,000 amount cap, case-insensitive duplicate refusal, and semantics fixed at
write) and `PATCH` (the `is_active` kill switch).

### Current state

14 codes; **one redeemable**:

```
TRIAL5   $5   limited   2/5 redeemed   valid till 2026-09-04
```

The other 13 are expired or exhausted. `TESTCOUPON1`, `TESTCOUPON2` and
`WELCOME1` are deliberately-kept test fixtures — an exhausted row that renders
correctly is better documentation than a deleted one.

---

## 2. Discounts — built, never used

`charge_service_hour` calls `billing.best_discount(user, service_type, plan_key,
hour)` on **every single charge** and applies whichever grant wins:

| kind | Effect |
|---|---|
| `percent` | `gross × value/100` off |
| `amount_off_hour` | flat amount off, capped at the hour's value (an "amount off" larger than the charge is a discount to zero, never a payment to the customer) |
| `free_hours` | the whole hour, and decrements `hours_remaining`; the grant flips to `exhausted` at zero |

A fully-covered hour still writes a `service_charges` row and returns
`charged-free`, so the customer can see the hour was used and what it would have
cost. The allowance is spent **only after** the hour is definitively claimed by
the INSERT, so a retry cannot burn two free hours for one hour of usage.

`redeem_discount_code(p_code, p_user_id)` exists for self-service grants.

**`billing.discounts` and `billing.discount_grants` both hold zero rows.** The
entire branch has therefore never executed in production. There is currently no
way to give a customer a discounted *rate* — only to hand them balance.

Whether that is "never launched" or "wiped in the relaunch" is not established.
Before trusting the discount path, exercise it once: it is well-built code that
has never run against real data, which is a different risk profile from code
that is known-good.

---

## 3. Arrears — the other half of "the customer didn't pay"

Added 2026-09-03 (migration `20260903160000`) and worth reading alongside
coupons, because it is the same subject from the opposite side.

When `charge_service_hour` cannot deduct, the PL/pgSQL exception block rolls the
savepoint back — taking the `service_charges` row with it — and returns
`'insufficient'`. Previously **nothing was written**, and the sweep never
revisits an hour. So a customer who ran out of balance got their usage free, and
the evidence erased itself the moment they topped up: coverage went green again
and the gap behind it looked like history.

`ved@samatva.com` ran two GPU volumes for **28 contiguous unpaid hours** on
2026-08-31, topped up $100, and billing resumed at the next sweep. 56
meter-hours, $3.59, no record anywhere.

The sweep now writes a `status='failed'`, `type='usage'` transaction for the
unpaid hour — the same treatment `close_active_service` already gave an
unaffordable final charge at teardown. Deduped by a partial unique index so an
insolvent day produces one row per hour rather than hundreds.

**Widening `transactions_service_type_check` was not optional.** It predated
`gpu_volume` and `gpu_pod_storage`, both live metered types, and the arrears
INSERT sits *inside* the exception handler — so without it the write would have
raised and turned a clean `'insufficient'` return into a hard sweep error, on
precisely the meters that most need arrears. ved's two volumes are `gpu_volume`.

Verified in a rolled-back transaction: an insolvent `gpu_volume` charge writes
one arrears row; retrying the same hour writes none.

**Nothing settles arrears yet.** The rows make the debt visible; collecting it
on a later top-up is not implemented.
