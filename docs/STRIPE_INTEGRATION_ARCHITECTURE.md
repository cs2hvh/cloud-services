# Stripe Payment Gateway Integration — Architecture Plan

## 1. Current State Analysis

### What Exists
```
app/dashboard/nav/billing/
├── page.tsx                          ← Server component (fetches credits + coupons)
└── BillingTabs.tsx                   ← Client component (3 tabs: Balance, Payment, Coupons)

app/api/billing/
├── topup/route.ts                   ← ⚠️ Adds credits directly — NO payment verification
├── payment-method/route.ts          ← ⚠️ Accepts raw card data — PCI non-compliant, does nothing
└── coupons/
    ├── route.ts                     ← GET available coupons (OK)
    └── redeem/route.ts              ← POST redeem coupon code (OK)

lib/supabase/queries/billing.ts      ← Billing.get_balance, topup, deduct, has_balance, etc.
config/billing-flow.ts               ← ensureBalance(), postProvisionBilling()
config/pricing.ts                    ← Service rate calculations
```

### Problems
| # | Issue | Risk |
|---|-------|------|
| 1 | `/api/billing/topup` adds money without collecting payment | Users get free credits |
| 2 | `PaymentMethod` form sends raw card number/CVV to your server | PCI violation — legal liability |
| 3 | No transaction history or audit trail | Cannot reconcile payments |
| 4 | No idempotency — webhook retry would double-credit | Data corruption |

---

## 2. Target Architecture

### Payment Flow (Stripe Checkout Sessions)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                   │
│                                                                         │
│  BillingTabs.tsx (Balance Tab)                                         │
│  ┌──────────────────────────────────────────────┐                      │
│  │  User enters amount → clicks "Top Up"         │                      │
│  │  ↓                                            │                      │
│  │  POST /api/billing/create-checkout-session    │                      │
│  │  { amount: 25 }                               │                      │
│  │  ↓                                            │                      │
│  │  Receives { url: "https://checkout.stripe.." }│                      │
│  │  ↓                                            │                      │
│  │  window.location.href = url (redirect)        │                      │
│  └──────────────────────────────────────────────┘                      │
│                                                                         │
│  User completes payment on Stripe's hosted page                        │
│  ↓                                                                      │
│  Stripe redirects → /dashboard/nav/billing?session_id=cs_xxx&status=ok │
│  ↓                                                                      │
│  Show success banner, refresh balance                                   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                    │
│                                                                         │
│  POST /api/billing/create-checkout-session                             │
│  ┌──────────────────────────────────────────────┐                      │
│  │  1. Authenticate user (supabase.auth.getUser) │                      │
│  │  2. Validate amount (> 0, ≤ max)              │                      │
│  │  3. Create Stripe Customer (if first time)    │                      │
│  │  4. Create Checkout Session:                  │                      │
│  │     - mode: 'payment'                         │                      │
│  │     - amount in cents                         │                      │
│  │     - metadata: { userId, amount }            │                      │
│  │     - success_url + cancel_url                │                      │
│  │  5. Return { url: session.url }               │                      │
│  └──────────────────────────────────────────────┘                      │
│                                                                         │
│  POST /api/billing/webhook  (Stripe Webhook)                           │
│  ┌──────────────────────────────────────────────┐                      │
│  │  1. Read raw body (NOT JSON parsed)           │                      │
│  │  2. Verify stripe-signature header            │                      │
│  │  3. Handle 'checkout.session.completed':      │                      │
│  │     a. Extract userId + amount from metadata  │                      │
│  │     b. Check idempotency (session_id unique)  │                      │
│  │     c. Billing.topup(userId, amount)          │                      │
│  │     d. Insert into billing.transactions       │                      │
│  │  4. Return 200                                │                      │
│  └──────────────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Changes

### New Table: `billing.transactions`
```sql
CREATE TABLE billing.transactions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  stripe_session_id TEXT UNIQUE NOT NULL,        -- idempotency key
  stripe_payment_intent TEXT,                     -- pi_xxx for reference
  amount          NUMERIC(10,2) NOT NULL,         -- dollar amount
  currency        TEXT DEFAULT 'usd',
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed
  type            TEXT NOT NULL DEFAULT 'topup',   -- topup | refund
  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- Index for fast lookups
CREATE INDEX idx_transactions_user_id ON billing.transactions(user_id);
CREATE INDEX idx_transactions_session_id ON billing.transactions(stripe_session_id);
```

### New Column (Optional): `billing.user_credits.stripe_customer_id`
```sql
ALTER TABLE billing.user_credits
  ADD COLUMN stripe_customer_id TEXT UNIQUE;
```
This maps each user to a Stripe Customer object so we can:
- Pre-fill email on checkout
- List past payments in Stripe Dashboard
- Enable saved payment methods in future

---

## 4. New Files to Create

```
lib/
└── stripe.ts                                    ← Stripe SDK singleton

app/api/billing/
├── create-checkout-session/
│   └── route.ts                                 ← Creates Stripe Checkout Session
└── webhook/
    └── route.ts                                 ← Handles Stripe webhook events

lib/supabase/queries/
└── billing.ts                                   ← Add: save_transaction, get_stripe_customer_id
```

---

## 5. Files to Modify

| File | Change |
|------|--------|
| `app/dashboard/nav/billing/BillingTabs.tsx` | Replace `onTopup` to call create-checkout-session → redirect to Stripe. Remove raw card form from `PaymentMethod`. Add success state detection from URL params. |
| `app/dashboard/nav/billing/page.tsx` | Pass `searchParams` to detect `?session_id` return from Stripe |
| `app/api/billing/topup/route.ts` | Either **delete** or restrict to internal/admin-only (webhook handles real top-ups now) |
| `app/api/billing/payment-method/route.ts` | **Delete** — Stripe handles payment methods, no raw card data on our server |
| `lib/supabase/queries/billing.ts` | Add `save_transaction()`, `get_transaction_by_session()`, `get_or_create_stripe_customer()` |
| `next.config.ts` | No change needed (webhook route excluded from body parsing via route segment config) |
| `.env.local` | Add 3 new env vars |

---

## 6. Environment Variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...           # Server-only (NEVER prefix with NEXT_PUBLIC_)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...  # Safe for client
STRIPE_WEBHOOK_SECRET=whsec_...         # For webhook signature verification
```

---

## 7. Packages to Install

```bash
npm install stripe         # Server-side Stripe SDK (creates sessions, verifies webhooks)
```

> **Note:** `@stripe/stripe-js` is NOT needed for the Checkout Session redirect flow.
> It's only needed if embedding Stripe Elements/Payment Element inline.
> For the redirect approach, a simple `window.location.href = url` is sufficient.

---

## 8. Implementation Steps (Ordered)

### Phase 1: Core Integration (Must-Have)

| Step | Task | Files |
|------|------|-------|
| 1 | Install `stripe` package | `package.json` |
| 2 | Add env vars to `.env.local` | `.env.local` |
| 3 | Create `lib/stripe.ts` — Stripe singleton | New file |
| 4 | Add `save_transaction` + `get_or_create_stripe_customer` to billing queries | `lib/supabase/queries/billing.ts` |
| 5 | Create `POST /api/billing/create-checkout-session` | New route |
| 6 | Create `POST /api/billing/webhook` with signature verification | New route |
| 7 | Update `BillingTabs.tsx` — new top-up flow + remove raw card form | Modify |
| 8 | Update `page.tsx` — handle success/cancel return params | Modify |
| 9 | Delete/deprecate old `topup/route.ts` and `payment-method/route.ts` | Remove/modify |
| 10 | Create `billing.transactions` table in Supabase | SQL migration |

### Phase 2: Enhancements (Nice-to-Have)

| Step | Task |
|------|------|
| 11 | Transaction history UI tab in BillingTabs |
| 12 | Stripe Customer Portal link (manage saved cards) |
| 13 | Low-balance email alerts |
| 14 | Auto-reload when balance < threshold |
| 15 | Refund endpoint (admin panel) |

---

## 9. File-by-File Specifications

### `lib/stripe.ts`
```ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",   // latest stable as of March 2026
  typescript: true,
});
```

### `app/api/billing/create-checkout-session/route.ts`
```
- Auth: supabase.auth.getUser() → userId
- Validate: amount is number, > 0, ≤ 10000
- Get or create Stripe Customer (store stripe_customer_id in user_credits)
- Create Checkout Session:
    mode: "payment"
    customer: stripeCustomerId
    line_items: [{ price_data: { currency: "usd", unit_amount: amount * 100, product_data: { name: "Account Top-Up" } }, quantity: 1 }]
    metadata: { userId, amount: String(amount) }
    success_url: {SITE_URL}/dashboard/nav/billing?session_id={CHECKOUT_SESSION_ID}&status=success
    cancel_url: {SITE_URL}/dashboard/nav/billing?status=cancelled
- Return { url: session.url }
```

### `app/api/billing/webhook/route.ts`
```
- Export: const dynamic = "force-dynamic"
- CRITICAL: Read raw body as text (not JSON) for signature verification
- Verify: stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
- Handle event types:
    "checkout.session.completed":
        1. Extract metadata.userId + metadata.amount
        2. Check billing.transactions for existing stripe_session_id (idempotency)
        3. If not exists:
           a. Billing.topup(userId, amount)
           b. Insert into billing.transactions (status: 'completed')
        4. Return 200
    Default: return 200 (acknowledge unknown events)
- Return 400 on signature failure
```

### `BillingTabs.tsx` Changes
```
Balance Tab:
  - onTopup: POST /api/billing/create-checkout-session → redirect to url
  - On mount: check URL searchParams for ?status=success → show success toast
  - On mount: check ?status=cancelled → show info toast

Payment Tab:
  - Remove raw card form entirely
  - Show message: "Payment methods are securely managed by Stripe during checkout"
  - (Phase 2: Add Stripe Customer Portal link)

Coupons Tab:
  - No changes needed
```

---

## 10. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| **PCI Compliance** | No card data touches our server — Stripe Checkout handles it entirely |
| **Webhook Authenticity** | `stripe.webhooks.constructEvent()` verifies signature with `STRIPE_WEBHOOK_SECRET` |
| **Double Crediting** | `stripe_session_id` UNIQUE constraint + check-before-insert in webhook |
| **Amount Tampering** | Amount stored in Stripe session metadata (set server-side), webhook reads from Stripe, not client |
| **CSRF on Checkout** | Session created server-side with authenticated user; Stripe handles payment page |
| **Secret Key Exposure** | `STRIPE_SECRET_KEY` is server-only (no `NEXT_PUBLIC_` prefix), only used in API routes |
| **Raw Body Parsing** | Webhook route uses `request.text()` not `request.json()` to preserve signature integrity |
| **Rate Limiting** | Reuse existing `limitByUser` middleware for create-checkout-session route |

---

## 11. Sequence Diagram

```
User          BillingTabs       /api/create-session    Stripe         /api/webhook        Supabase
 │                │                    │                  │                │                  │
 │─ Enter $25 ───►│                    │                  │                │                  │
 │                │─── POST {25} ─────►│                  │                │                  │
 │                │                    │── getUser() ────►│                │                  │
 │                │                    │◄── userId ───────│                │                  │
 │                │                    │                  │                │                  │
 │                │                    │─ checkout.create ►│                │                  │
 │                │                    │◄─ { url } ───────│                │                  │
 │                │◄── { url } ───────│                  │                │                  │
 │◄─ redirect ────│                    │                  │                │                  │
 │                                     │                  │                │                  │
 │─── pay on stripe.com ─────────────────────────────────►│                │                  │
 │                                     │                  │                │                  │
 │◄── redirect to /billing?status=ok ──│──────────────────│                │                  │
 │                                     │                  │                │                  │
 │                                     │                  │─ webhook POST ►│                  │
 │                                     │                  │                │── verify sig     │
 │                                     │                  │                │── check idempotency
 │                                     │                  │                │── topup() ──────►│
 │                                     │                  │                │◄─ balance ───────│
 │                                     │                  │                │── save txn ─────►│
 │                                     │                  │◄── 200 ────────│                  │
 │                                     │                  │                │                  │
 │─ refresh page ►│                    │                  │                │                  │
 │                │                    │                  │                │ new balance shown │
```

---

## 12. Testing Checklist

- [ ] Stripe test mode keys work end-to-end
- [ ] Checkout session creates successfully with correct amount
- [ ] Redirect lands back on billing page with success params
- [ ] Webhook receives event and credits user exactly once
- [ ] Duplicate webhook calls don't double-credit (idempotency)
- [ ] Invalid webhook signatures return 400
- [ ] Unauthenticated requests to create-checkout-session return 401
- [ ] Amount validation rejects 0, negative, and absurdly large values
- [ ] Old topup route no longer accessible to regular users
- [ ] Stripe Dashboard shows correct payment records

---

## 13. Stripe Dashboard Setup Required

1. **Create account** at [dashboard.stripe.com](https://dashboard.stripe.com)
2. **Get API keys** → Developers → API Keys → copy `sk_test_` and `pk_test_`
3. **Add webhook endpoint** → Developers → Webhooks → Add endpoint:
   - URL: `https://galaxyhvh.com/api/billing/webhook`
   - Events: `checkout.session.completed`
   - Copy `whsec_...` signing secret
4. **For local dev**: Use `stripe listen --forward-to localhost:3000/api/billing/webhook` (Stripe CLI)
