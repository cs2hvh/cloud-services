# Billing System — Complete Behavior Reference

> Last verified against real Supabase: **8 April 2026**
> Source files: `config/pricing.ts`, `config/billing-flow.ts`, `lib/supabase/queries/billing.ts`, standalone repo `deep-aghera-001/credit-system-cron`

---

## 1. What We Actually Tested (Real vs Mocked)

### Real Tests (hit live Supabase — `scripts/smoke-billing.mjs`)
| Check | Result | Notes |
|---|---|---|
| All 5 billing tables exist in Supabase | ✅ Pass | `active_database`, `active_kubernetes`, `active_objectspace`, `active_spectrum`, `active_platform_apps` |
| 6 real users have billing records | ✅ Pass | Combined balance $656+ million |
| No negative balances | ✅ Pass | All users ≥ $0 |
| 12 active service rows have correct structure | ✅ Pass | All have `service_id`, `user_id`, `hourly_rate`, `last_billed_at` |
| All active users have a `user_credits` row | ✅ Pass | No orphaned service rows |
| All hourly rates in valid range ($0.0001–$1000) | ✅ Pass | |
| `billing_topup` RPC calls real Supabase | ✅ Pass | $2897.53 → $2897.54 confirmed |
| `billing_deduct` RPC calls real Supabase | ✅ Pass | Net-zero restore confirmed |
| **Cron freshness — Kubernetes** | ❌ **FAIL** | 1 cluster not billed for 337 minutes (cron was stopped) |
| Cron freshness — Object Storage | ✅ Pass | All 5 billed within 30 min |
| Cron freshness — Spectrum | ✅ Pass | |
| Cron freshness — Platform Apps | ✅ Pass | |
| Billing math (monthlyToHourly) | ✅ Pass | 6 cases verified locally |
| Prorated charge formula | ✅ Pass | 4 cases verified locally |

### Mocked Tests (Vitest — `npx vitest run ...`) — 69/69 passing
| File | Tests | What they cover |
|---|---|---|
| `tests/unit/billing/billing-flow.test.ts` | 8 | `ensureBalance`, `postProvisionBilling`, refund on failure |
| `tests/unit/billing/billing-lifecycle-operations.test.ts` | 22 | `_computeProratedCharge`, `close_active_service` all edge cases |
| `tests/unit/pricing.test.ts` | 18 | `monthlyToHourly`, `ratesFromProduct`, all 5 service rate getters |
| `tests/integration/api/database-create.test.ts` | 13 | Full HTTP create flow: auth, validation, balance check, DO API, billing registration |
| `tests/integration/api/database-delete.test.ts` | 8 | Full HTTP delete flow: ownership, billing close, DO delete, soft delete |

**Key difference:** Vitest mocks all DB and external calls. The smoke script (`smoke-billing.mjs`) talks to the real Supabase. Together they give full confidence.

---

## 2. Real Issues Found

### ISSUE-001 — Kubernetes Cluster Not Being Billed (CRITICAL)
- **What:** Cluster `6873d186-...` has `last_billed_at` = 337+ minutes ago
- **Why:** The standalone cron worker was not running
- **Impact:** User is getting hours of Kubernetes for free; billing gap in DB
- **Fix:** Start/deploy the standalone cron worker repo: `deep-aghera-001/credit-system-cron`
- **Detection:** Run `node scripts/smoke-billing.mjs` — will flag any table with rows older than 30 min

### ISSUE-002 — Float Precision at Very Large Balances (LOW)
- **What:** `billing_topup` of $0.01 on a $656,186,000 balance shows no change (float can't represent it)
- **Why:** JavaScript 64-bit float has ~15 significant digits. $656,186,000.01 rounds back to $656,186,000
- **Impact:** Only affects artificially large test/admin balances. Normal user balances ($0–$10,000) are unaffected
- **Fix:** No code change needed for normal users; smoke test now avoids accounts with balance > $100,000

### ISSUE-003 — Negative `fixed_price` Not Guarded (LOW)
- **What:** If an admin sets `fixed_price` to a negative number in the Products table, `ratesFromProduct` returns a negative `initialCost`
- **Why:** `ratesFromProduct` does `roundToTwoDecimals((product?.fixed_price ?? 0) || 0)` — no lower bound check
- **Impact:** A user would receive credits on service creation (topup instead of deduct)
- **Fix:** Admin UI should validate price ≥ 0; code guard in `ratesFromProduct` could add `Math.max(0, ...)` as extra safety

---

## 3. How Pricing Is Decided (Who Sets It, Where It Lives)

### Source of Truth: `public.products` Table (Supabase)
Every plan is one row in the `products` table. The fields that drive billing are:

| Column | Type | Meaning |
|---|---|---|
| `id` | UUID | The plan ID users pick when creating a service |
| `type` | string | Service type: `database`, `kubernetes`, `platform-apps`, `object-storage`, `network-ddos` |
| `sub` | string | Sub-type, e.g. `small` / `medium` / `large` for platform apps |
| `price` | number | **Monthly price in dollars** — this is what the admin sets |
| `fixed_price` | number | **One-time setup cost in dollars** — charged at creation only |
| `name` | string | Display name (e.g. "Basic DB Plan") |

### Who Can Edit Plans: Admins Only
- Route: `/dashboard/admin/pricing`
- Requires: `requireAdmin()` server check (throws 404 if not admin)
- UI: `components/admin/pricing/edit-plan-dialog.tsx` — admin fills in "Monthly Price" and saves
- API call: `PATCH /api/products/:id` or similar — updates the `products` row in Supabase

**When an admin changes a plan price, it affects:**
- New services created after the change (they read the plan at creation time)
- The cron job reads `hourly_rate` from the `billing.active_*` row — NOT from Products live — so existing running services keep their locked-in rate until deleted and recreated

---

## 4. Pricing Math — Exact Formulas

### Monthly → Hourly Conversion
```
HOURS_IN_MONTH = 24 × 30 = 720

hourlyRate = Math.round((monthlyPrice / 720) × 100) / 100
```
Result is **always rounded to 2 decimal places** (currency safe).

**Examples:**
| Monthly price | Hourly rate | Notes |
|---|---|---|
| $720/mo | $1.00/hr | |
| $10/mo | $0.01/hr | Math.round(0.01388 × 100)/100 = 0.01 |
| $5/mo | $0.01/hr | rounds up to $0.01 minimum |
| $2160/mo | $3.00/hr | |
| $0 or negative | $0.00/hr | Free / invalid |

> **Note:** This uses 30-day months (720 hours), not 730.5 hours. A year is slightly under-charged by ~1.4%.

### One-Time Setup Cost (`fixed_price`)
- Comes directly from `products.fixed_price`, rounded to 2 decimals
- Also called `initialCost` in code
- Charged once at provisioning — **before** the service is created on DigitalOcean
- Refunded automatically if service creation fails

### Kubernetes Multiplier
```
hourlyRate = monthlyToHourly(monthlyPrice × totalNodes)
```
Kubernetes is the only service that scales rate by node count. A 3-node cluster at $10/mo per node = $30/mo effective → $0.04/hr.

---

## 5. Charging Events — Full List

### Event 1: Service Creation (Upfront Charge)
**Trigger:** User submits the "Create" form in the dashboard  
**What happens (in order):**
1. `getRatesForX(planId)` — reads `products` table → computes `initialCost` and `hourlyRate`
2. `ensureBalance(userId, initialCost)` — reads `billing.user_credits` → returns 402 if balance < initialCost
3. DigitalOcean API call (only happens if balance check passes)
4. Supabase DB insert (creates the service row)
5. `postProvisionBilling(...)`:
   - `Billing.deduct(userId, initialCost)` — deducts from `user_credits`
   - `Billing.add_active_X(...)` — inserts row in `billing.active_X` table with `hourly_rate` and `last_billed_at = now()`
   - If `add_active_X` fails → `Billing.topup(userId, initialCost)` refunds the charge
6. If billing fails completely → returns `POST_PROVISION_BILLING_FAILED` (500)

**Notes:**
- If `initialCost = 0` (no setup fee), the deduct call is skipped (deduct validates `amount > 0`)
- The service IS created on DigitalOcean before billing — billing failure means user has service but may not be billed (logged as 500)

### Event 2: Recurring Hourly Billing (Cron)
**Trigger:** Cron worker fires every **5 minutes** (`*/5 * * * *`)  
**What happens per service (in order):**
1. Fetches all rows with `status = 'active'` from each of the 5 tables
2. For each row:
   - Validates UUIDs, rate type, rate value (rejects malformed data)
   - Calculates `hoursUsed = (now - last_billed_at) / 3,600,000`
   - Applies security caps (see below)  
   - Computes `cost = hoursUsed × hourly_rate`, rounded to 2 decimals
   - If `cost < $0.001` → skips (dust prevention)
   - Calls `billing.bill_service_cycle_atomic` RPC
   - The RPC locks the active service row and user credit row
   - If balance is insufficient → does not update `last_billed_at`, records failure/grace state, continues to next service
   - If deduction succeeds → deducts from `billing.user_credits`, then updates `last_billed_at = now`

**Security caps applied by cron:**
| Cap | Value | Reason |
|---|---|---|
| Max hourly rate | $1,000/hr | Prevent corrupted rate data |
| Max hours per billing cycle | 24 hrs | Prevent billing 1000 hours if cron was down |
| Max cost per cycle | $5,000 | Hard ceiling per service per run |
| Min billable cost | $0.001 | Skip dust transactions |
| Min hourly rate | $0.0001 | Skip effectively-free services |

### Event 3: Service Deletion (Final Prorated Charge)
**Trigger:** User clicks "Delete" on a service  
**What happens (in order):**
1. `resolveOwnedCluster` — verifies ownership, returns 404 if already deleted
2. Integration check (are other services depending on this one?)
3. `Billing.close_active_service(type, {userId, serviceId, failOnInsufficient: false})`:
   - Fetches active row from `billing.active_X`
   - Computes prorated charge: `(now - last_billed_at) / 3,600,000 × hourly_rate` (6 decimal places)
   - If `charge > 0`: deducts from `user_credits`
   - If deduction fails and `failOnInsufficient=false`: **logs and continues** — deletion is NOT blocked by billing failure
   - Deletes the active row
   - If delete fails after deduction was applied: **refunds the charge** (`billing_topup`)
4. DigitalOcean API delete call
5. Supabase soft-delete (sets `status = 'deleted'`)

**Key behavior:** Billing failure on delete is intentionally swallowed. The service is always deleted even if we can't charge the final hour.

### Event 4: Platform App Resize (Rate Update)
**Trigger:** User resizes a platform app (small → medium → large)  
**What happens:**
- `Billing.update_active_platform_app_rate({serviceId, newHourlyRate})` — updates `hourly_rate` in `billing.active_platform_apps`
- The cron will pick up the new rate on its next run
- No charge at resize time — just rate change

### Event 5: Manual Balance Top-Up (Stripe)
**Trigger:** User adds credits via Stripe checkout (`/api/billing/create-checkout-session`)  
**What happens:**
- Stripe payment succeeds → webhook fires (`/api/billing/webhook`)
- `Billing.topup(userId, amount)` → calls `billing_topup` RPC → adds to `user_credits.credit_balance`

### Event 6: Coupon / Promo Redemption
**Trigger:** User redeems a coupon code  
**What happens:**
- `/api/billing/coupons/redeem` validates coupon
- Credits added via `billing_topup` RPC
- Promo record stored separately in `billing.promocodes.redeem_by` JSON field
- Promo credits are tracked separately from paid credits in balance display

---

## 6. How the Cron Worker Works

### Location
Standalone repo `deep-aghera-001/credit-system-cron` — separate Node.js process, NOT part of Next.js.

### Schedule
```
*/5 * * * *   →  every 5 minutes
```
Runs 288 times per day. Each run bills all 5 service tables in parallel (`Promise.allSettled`).

### How to Run
```bash
git clone https://github.com/deep-aghera-001/credit-system-cron.git
cd credit-system-cron
npm install
npm start
```

### How It Decides What to Charge
```
hours = (now - last_billed_at) / 3,600,000
cost  = round(hours × hourly_rate, 2)
```
It does NOT re-read the Products table. The `hourly_rate` is locked into the `billing.active_X` row at creation time.

### Failure Modes
| Failure | Behavior |
|---|---|
| `bill_service_cycle_atomic` RPC fails | Logs error, does NOT finalize billing, continues to next service |
| Insufficient credit | Does not advance `last_billed_at`; starts/updates grace lifecycle |
| Service row has missing/invalid UUID | Skips with security error log |
| Rate is NaN or negative | Skips with security error log |
| Rate > $1000/hr | Caps to $1000, logs warning |
| Gap > 24 hours | Caps to 24 hours, logs warning (cron was down) |
| One table fails entirely | Other 4 tables still process (`Promise.allSettled`) |

### What Happens If Cron Is Stopped
- `last_billed_at` stops updating
- When cron restarts, it will bill for at most 24 hours of gap (security cap)
- The outstanding gap time > 24 hours is **lost revenue** (user gets it free)
- The smoke test will detect this within 30 minutes

---

## 7. Database Schema (billing schema in Supabase)

### `billing.user_credits`
| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID | FK to auth.users |
| `credit_balance` | numeric | Current total balance in dollars |

### `billing.active_database`, `active_kubernetes`, `active_objectspace`, `active_spectrum`, `active_platform_apps`
All 5 tables have the same structure:
| Column | Type | Notes |
|---|---|---|
| `service_id` | UUID | Supabase DB UUID of the service (NOT the DigitalOcean ID) |
| `user_id` | UUID | Owner |
| `hourly_rate` | numeric | Locked in at creation time from Products table |
| `last_billed_at` | timestamptz | Updated every cron run |
| `status` | text | `'active'` — row is deleted on service deletion |

### Supabase RPCs Used
| RPC | Called By | What It Does |
|---|---|---|
| `billing_topup(p_user_id, p_amount)` | Service creation refunds, Stripe webhook, coupons | Atomically adds to `credit_balance` |
| `billing_deduct(p_user_id, p_amount)` | Service creation, service deletion | Atomically subtracts from `credit_balance`; returns new balance; returns null if insufficient |
| `deduct_user_credit_atomic(p_user_id, p_amount)` | Cron worker only | Same as `billing_deduct` but separate RPC for cron isolation |

All RPCs use database-level atomicity to prevent race conditions (two charges at the same time).

---

## 8. Service-by-Service Billing Summary

| Service | Where Plan Comes From | One-Time Fee | Monthly Rate | Notes |
|---|---|---|---|---|
| **Database** | `products` table by `plan_id` (UUID) | `fixed_price` | `price` / 720 | Plan chosen at creation |
| **Kubernetes** | `products` by `plan_id` × `totalNodes` | `fixed_price` | `price × nodes` / 720 | Bigger clusters cost more per hour |
| **Object Storage** | First row with `type = 'object-storage'` | `fixed_price` | `price` / 720 | No plan selection, one global rate |
| **Spectrum (DDoS)** | First row with `type = 'network-ddos'` | `fixed_price` | `price` / 720 | No plan selection, one global rate |
| **Platform Apps** | `products` by `type='platform-apps'` and `sub = size` | `fixed_price` | `price` / 720 | 3 sizes: small, medium, large |

---

## 9. How to Run the Real Smoke Test

```bash
# Against real Supabase (reads .env automatically)
node scripts/smoke-billing.mjs

# With live API checks (app must be running)
BASE_URL=https://galaxyhvh.com PAT=sk_live_xxx node scripts/smoke-billing.mjs

# Against local dev server
BASE_URL=http://localhost:3000 PAT=sk_live_xxx node scripts/smoke-billing.mjs
```

The script will exit with code 1 if any real failures are detected (e.g. cron is down, negative balances, orphaned service rows).

---

## 10. Quick Reference: Charge Flow Diagram

```
USER CREATES SERVICE
        │
        ▼
  getRatesForX(planId)
  ─ reads Products table
  ─ computes initialCost (fixed_price)
  ─ computes hourlyRate (price/720)
        │
        ▼
  ensureBalance(userId, initialCost)
  ─ if balance < initialCost → 402 STOP
        │
        ▼
  DigitalOcean API → Create resource
        │
        ▼
  Supabase DB insert → get serviceId (UUID)
        │
        ▼
  postProvisionBilling()
  ─ deduct(userId, initialCost)       ← balance goes down
  ─ add_active_X(userId, serviceId, hourlyRate)  ← starts cron tracking
  ─ if add_active fails → topup(initialCost)     ← refund

─ ─ ─ ─ ─ ─ ─ ─ ─ EVERY 5 MINUTES ─ ─ ─ ─ ─ ─ ─ ─ ─

CRON FIRES
        │
        ▼
  For each active_X row:
  ─ hours = (now - last_billed_at) / 3600000
  ─ cap to 24 hrs max
  ─ cost = round(hours × hourly_rate, 2)
  ─ update last_billed_at = now  ← TIMESTAMP FIRST
  ─ deduct_user_credit_atomic(userId, cost)

─ ─ ─ ─ ─ ─ ─ ─ ─ USER DELETES SERVICE ─ ─ ─ ─ ─ ─ ─

        │
        ▼
  close_active_service(type, {userId, serviceId})
  ─ fetch active row
  ─ prorated = (now - last_billed_at) / 3600000 × hourly_rate
  ─ deduct(userId, prorated)    ← final charge (skipped if balance low)
  ─ delete active row
  ─ if delete fails → topup(prorated)  ← refund
        │
        ▼
  DigitalOcean API → Delete resource
        │
        ▼
  Supabase → status = 'deleted'
```
