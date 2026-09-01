# Tasks

## Inference / Wokey migration

### Deferred — do soon
- [ ] **Admin model-pricing panel.** Set per-model sell price from the dashboard.
      Foundation is already in place: every active chat model now carries both
      `inference.models.pricing` (sell) and `upstream_pricing` (Wokey's real
      cost), so the panel can show true margin per model. Current sell prices
      are placeholders at vendor list price — margins run 1.67x (gpt-5.6-luna)
      to 10x (gpt-5.6-sol) and need a deliberate policy.
- [ ] **Wokey price sync.** `GET /api/models/pricing?output_modalities=text,image`
      returns per-SKU `price_usd` + `reference_price_usd`; `GET /api/models`
      returns contextWindow/maxOutputTokens. Both are Wokey's *internal* site
      API, not the documented `/v1` surface — the sync must fail loudly rather
      than write nulls if the shape changes.

### api.ahurasense.com — SHIPPED 2026-08-26

Deployed from **`dev`** (`workers/inference`), version
`24e66f78-518b-4c8e-aa2f-78aa800ffddd`, 04:51 UTC. Verified in production with
two live completions on `zhipu/glm-5.3` — a model absent from OpenRouter's
entire 417-model catalogue, so it can only have been served by Wokey. Usage
rows recorded the PUBLIC id (`zhipu/glm-5.3`), not the upstream one, confirming
the translation seam works as designed.

Rollback if ever needed: `npx wrangler rollback c1cea429-b6c0-4dca-8b98-22f2870853f6`

**Two beliefs held during this work turned out to be WRONG — recorded so nobody
re-derives them:**

1. *"The deployed worker is the ai7 build."* It was not. Cloudflare showed the
   live worker was deployed **2026-06-02** from the pre-divergence trunk, with
   5 routes and dev's exact binding set (3 KV, 2 queues, 1 DO — no
   TRACE_EVENTS, no PAYLOAD_BUCKET, no PROMPTS/GUARDRAILS). It was inferred
   from ai7-only job names in `inference.cron_runs`; that inference was wrong,
   and the deployed build writes no cron_runs rows at all. Something else
   writes them — still unidentified.
2. *"Deploying dev would delete 16 endpoints."* False, for the same reason —
   those 16 ai7 routes have never been deployed. Route set was identical
   before and after.

Consequently the **ai7 port was unnecessary work**. It is complete and green
(branch `feat/wokey-upstream-ai7`, 21 files, 302 tests) and stays useful if ai7
is ever deployed, but it is not on the shipping path.

Verify Cloudflare state before reasoning about deployments — `wrangler
deployments status`, `versions view`, `kv namespace list`. The repo does not
tell you what is running.

**Left over from the deploy:**
- [x] Delete the now-unused OpenRouter credential from the worker — done
      2026-08-26 05:08 UTC (live version `3b637869`, source "Secret Change";
      `wrangler secret list` now shows only WOKEY_PLATFORM_KEY, BYOK_DEK,
      SUPABASE_SERVICE_ROLE_KEY, BATCH_PROCESSOR_TOKEN)
- [ ] ai7's `wrangler.toml` still has 4 placeholder KV ids
      (`REPLACE_WITH_PROMPTS_KV_ID` etc.) and those namespaces do not exist in
      the account. Blocks any future ai7 deploy; create them first.
- [ ] `zhipu/*` and `bytedance/doubao-*` only work post-deploy (they 404 on
      OpenRouter) — do not roll back without also delisting those 4 models.

Note: ai7 has `lib/brand-scrub.ts`, which handles upstream-name leakage more
thoroughly than dev's `sanitizeUpstreamError` (every JSON response and SSE
chunk, not just error bodies). Worth porting TO dev. ai7 also had 9 worker test
files; dev had none before this work.

### Testing — what is and isn't covered
Done:
- [x] All 29 catalog `upstream_model_id`s verified HTTP 200 against live Wokey.
- [x] Streaming verified, incl. usage in the final SSE chunk.
- [x] First worker tests exist: 19 passing over the billing/leak-critical pure
      logic (`src/lib/wokey.test.ts`). Needed a `vitest.config.ts` — without
      one, vitest inherited the repo-root Next config and found no tests,
      which is why the gateway had none.
- [x] Security review of the migration; 3 issues found and fixed (see git log).

Still open:
- [ ] **No load or concurrency testing.** Only a 5-request sequential latency
      sample (~1.2–1.4s per minimal call). No sustained rate, no parallelism,
      no error behaviour under pressure, no rate-limit headroom check.
- [x] End-to-end through our own gateway — done 2026-08-26, two live
      completions on `zhipu/glm-5.3` via api.ahurasense.com.
- [ ] Cached-token handling is UNPROVEN on Wokey. Correction to an earlier
      note: `prompt_tokens_details.cached_tokens` was never broken — OpenRouter
      sends it, and pre-deploy rows recorded real hits (6,604 cached tokens on
      one haiku call). The new tolerant reader guards against a Wokey-specific
      regression, but no post-deploy request has yet produced a cache hit to
      confirm it reads `cache_read_tokens` correctly. Send a repeated long
      prompt and check `inference.usage.cached_tokens > 0`.
- [ ] Untested paths: BYOK decryption with a real encrypted key, spend caps,
      rate limiting, streaming cancel propagation, tool calling, guardrails
      under the new upstream.
- [ ] `@cloudflare/vitest-pool-workers` conflicts with the pinned vitest 4
      (wants 2.0.x–3.2.x). Must be resolved before tests needing real Workers
      bindings (KV / Durable Objects / Queues) can be written.
- [ ] Worker `npm install` fails on that same peer conflict; use
      `--no-save --legacy-peer-deps` meanwhile.

## Other known issues
- [ ] `R2_ACCESS_KEY_ID` missing from prod `.env` — breaks compute images,
      inference batches, fine-tuning adapter/log downloads.
- [ ] `ahura-cron` crash-looping on the prod VM; `cron-worker.js` was deleted
      from `dev` in `ef946da1` (2026-06-03) and exists in 33 other branches.
      Use `origin/production`'s copy — it is newer than `origin/cron-worker`.
- [ ] Off-box billing worker holds a leaked, never-rotated `service_role` key.
- [ ] Rotate the leaked secrets (6 still live in git history) and the prod
      root SSH password; move the box to key-only auth.

## Pricing — the panel owns the write surface (see docs/BILLING-HANDOFF.md)

As of 2026-08-31 the legacy pricing tables are dropped and
`billing.service_pricing` is canonical. The panel's /pricing price book and
/pricing/seed are the only write path (via `billing.set_price()`); 81 prices
were seeded through it and verified. Contract and gotchas:
docs/BILLING-HANDOFF.md (updated in place by the billing lane).

## Billing v2 — built 2026-08-30/31, NOT cut over

New spine in the `billing` schema. Nothing charges yet: the v2 sweep only
charges with `--apply`, and it has never been run that way.

- `billing.service_pricing` — canonical price book. No hourly-rate column: a
  price is stored in its own unit and `billing.resolve_hourly_rate()` is the
  only converter. This is what makes the 720x bug unwritable.
- `billing.service_meters` — what runs + who pays, carries no price.
- `billing.service_charges` + `billing.charge_service_hour()` — idempotent per
  (service, hour), with an addressable period so a missed hour can be backfilled
  at the price that was live then.
- `scripts/billing/sweep.ts` — dry-run default, `--apply`, `--period`.
- `scripts/billing/deadman.ts` — asks the DATABASE whether billing has stopped.
  Must run OUTSIDE the sweep's host. This is the check whose absence cost six
  days.

### Remediation already applied to prod
- [x] 7 orphaned meters closed (5 compute + 2 objectspace) — stopped $4,329.57
      per 24h of charges against deleted resources. Snapshot kept in
      `billing._meter_snapshot_20260831` so it is reversible.
- [x] Live objectspace meter `jhk` corrected from $60/hr to $0.006944/hr.

### Still open
- [ ] **Cutover.** Run the v2 sweep in dry-run beside the old one, compare, then
      switch. Nothing should charge until that comparison is clean.
- [ ] **`ubuntu-8c-85g` has a NULL `plan_slug`** so no price resolves. The old
      system billed it $1.025/hr from a frozen rate with no plan behind it.
      Needs a real plan assigned.
- [ ] **Commit `cron-worker.js` into `dev`** or retire the old cron entirely.
      Until then any redeploy re-breaks v1 billing. DO NOT restart the old cron.
- [x] Meter wiring is CENTRAL: settleProvision + postProvisionBilling open the
      v2 meter, closeActiveBilling closes it. Every service inherits it — the
      per-service attempt covered 2 of 10 and missed the Proxmox compute path
      and the GPU reconcile-close entirely. GPU additionally opens/closes its
      own `gpu_pod_storage` meter, which no other service has.
- [ ] `sharma11aniket@gmail.com` overcharge (~$4,623) unresolved. Account
      deletion was requested and declined — permanent deletion of a paying
      customer's records is not something to do from here.
- [ ] GPU margin decision: `markup_pct` is 1.000 (at cost) by the 2026-08-26
      decision; network volumes still carry 1.25x.
- [ ] `config/pricing.ts` uses 720 h/month, runpod/helpers.ts uses 730 for GPU
      disk. v2 standardises on 720 — GPU disk therefore prices 1.4% higher.

### 2026-08-31 — v2 is LIVE and charging
- [x] `--apply` run against real meters. 3 charges written, $0.046097 total.
      Second run on the same hour: 3x `already-charged`, $0 moved. Idempotency
      proven on live data, not just in a rolled-back transaction.
- [x] Dead-man flipped from "BILLING HAS STOPPED" to OK the moment charges
      landed. It is a real signal, not decoration.
- [x] `ubuntu-8c-85g` destroyed through the platform's own teardown path. Its
      Proxmox host (`ns5028607.ip-148-113-49.net`) is NXDOMAIN and the VM IP
      does not answer — the host is decommissioned and the server had not
      existed for some time. v1 charged $168.85 as a final prorated lump for
      that phantom; v2's close-meter wiring closed correctly.
- [x] database (48) + kubernetes (2) prices seeded.

### FOUND 2026-08-31 — the 720x bug is still in the product catalogue
Six `products` rows of type `kubernetes` are priced **$43,200.00/month**.
43200 / 720 = exactly $60.00/hour — the same figure, same factor, as the two
poisoned objectspace meters. The two correct kubernetes plans are $60 and $150
per month, so the intent was $60/MONTH.
- [ ] **Fix those six product rows.** They are excluded from the v2 price book
      (the new `service_pricing_monthly_sane` constraint refuses them), so v2
      will report `no-price` rather than overcharge — but v1 still reads
      `products` directly and WOULD bill $60/hr if a cluster were provisioned.
      Affected ids: s-2vcpu-4gb, c2-2vcpu-4gb, s-2vcpu-4gb-intel,
      s-2vcpu-2gb-amd, s-2vcpu-2gb-Basic, s-2vcpu-2gb-Intel.

### Known limitation — the six dead days cannot be auto-recovered
Prices carry `effective_from = 2026-08-31 06:00`, so backfilling any hour before
that returns `no-price`. This is correct by design: the system refuses to invent
price history. Recovering 24–31 Aug means deliberately backdating
`effective_from`, which asserts those prices were in force then. That is a
business decision, not a migration.

### app v2 (PaaS) is NOT on this spine
`paas.charge_project_hour` + `paas.project_charges` remain separate, owned by
the cloud-app-v2 lane. They share the wallet (`billing.user_credits`) but keep
their own ledger, and nothing in `lib/paas` writes `billing.transactions` — so
v2 app spend is invisible on the dashboard billing page. Convergence is agreed
in principle; not done.

### 2026-08-31 — legacy pricing retired, price book reset to empty
- [x] Fixed the six poisoned kubernetes products ($43,200/mo -> $60/mo) BEFORE
      archiving, so the archive holds correct data.
- [x] Archived all six v1 pricing tables to schema `pricing_archive_20260831`
      (products 63, gpu_pricing 192, instance_plans 14, pricing_categories 7,
      pricing_promos 2, game_server_plans 12 = 290 rows).
- [x] DROPPED public.products, public.instance_plans, public.gpu_pricing.
      DROP not DELETE on purpose: ratesFromProduct() returns hourlyRate 0 for a
      missing row, so EMPTYING them would have silently made every service FREE.
      Dropping makes those paths throw instead.
      `game_servers` (3 rows) is intact; only its FK to products was cascaded.
- [x] v2 price book cleared: 72 unreferenced prices deleted, 3 that produced
      charges CLOSED rather than deleted so the ledger stays explainable.
      Live prices now: 0.
- [x] Verified fail-safe: sweep --apply on an unpriced hour returns `no-price`
      for every meter, charges nothing, exits 1. It refuses rather than billing
      zero.

### BLOCKING — nothing can be priced until this is done
The platform currently has NO prices at all. Until the admin panel writes rows
into `billing.service_pricing`:
- [ ] VPS deploy is broken (instance_plans is gone)
- [ ] /pricing and marketing pages that read `products` are broken
- [ ] GPU quoting is broken (gpu_pricing is gone — computeResalePerHour has no
      markup source)
- [ ] v1 rate lookups in config/pricing.ts throw for every service
- [ ] The v2 sweep bills nothing (correctly) and reports `no-price`

Restore if needed:
  create table public.products as select * from pricing_archive_20260831.products;
(and likewise for the others; constraints/indexes must be re-added by hand).

## Discounts / coupons / offers — built 2026-08-31

Three distinct things, only one of which existed before:

| Kind | Where | Status |
|---|---|---|
| Credit grant ("redeem CODE, get $50") | `billing.promocodes` | already worked, untouched |
| Rate discount ("20% off GPU") | `billing.discounts` | NEW |
| Free allowance ("first 100 hours free") | `billing.discounts` kind=free_hours | NEW |

- `billing.discounts` — offer definition. kind ∈ percent | amount_off_hour |
  free_hours. Scope by service_type/plan_key (NULL = any, deliberately not '*'
  since '*' is a real plan_key). Windowed, priority-ordered, CHECK-bounded.
- `billing.discount_grants` — who holds it, own expiry, own remaining hours.
- `billing.best_discount()` — picks ONE deterministically: priority, then scope
  specificity, then age. Never row order.
- `billing.redeem_discount_code()` — code → grant. FOR UPDATE like the promo
  path so max_grants cannot be overshot concurrently. Moves no money.
- `charge_service_hour` applies it and records `gross_usd`, `discount_usd`,
  `discount_id` on every charge, so a discounted line explains itself.

Tested (all rolled back): 25% off $1.00 → $0.75; $0.40 off → $0.60; a $5.00
"amount off" on a $1.00 hour → zero-cost with NO ledger row and never negative;
free hour → `charged-free`, no money moved, allowance 2→1; **replaying the same
hour returned already-charged and did NOT burn a second free hour**.

### Still to do
- [ ] Admin UI to create offers and grant them — belongs to the admin-panel lane.
- [ ] Customer-facing redeem box calling `redeem_discount_code`.
- [ ] Stacking is deliberately NOT supported: exactly one discount applies per
      hour. If two-for-one stacking is ever wanted it needs a real policy first.
- [ ] `billing.promocodes` inconsistencies, pre-existing: `coupon_type` and
      `max_redemptions` contradict each other (WELCOME24 is 'one-time' with
      max_redemptions 5), and every row is `is_active=true` despite long-past
      `valid_till` — so "active" does not mean usable. The admin UI will show
      nonsense unless this is reconciled.

### 2026-08-31 — catalog restored + set_price(), after admin-panel review
The admin-panel lane caught a gap I created: `products` and `instance_plans`
carried the plan DEFINITIONS as well as prices, so dropping them left
`service_pricing.plan_key` pointing at identifiers nothing defined.

- [x] `public.service_plans` — spec-only catalog, NO price columns, repopulated
      FROM THE ARCHIVE (82 rows: compute 14 with typed specs, database 48,
      kubernetes 8, platform_apps 5, plus one '*' row for each of the 7 flat
      services). Put in `public`, not `billing`: provisioning must not have to
      reach into the billing schema to learn which sizes exist.
- [x] `billing.set_price(...)` — the only sanctioned way to change a price.
      Closes-then-inserts atomically so "never UPDATE a price" is enforced
      rather than remembered. Refuses: unknown plan, model/unit mismatch,
      amounts past the sanity bounds — all as {success:false,error}, not raises.
      Same-hour edits UPDATE in place (action='corrected') because a
      zero-length effective window is unrepresentable and that hour was never
      billed; earlier rows are closed, never touched.
- [x] Bug found while writing it: `resolve_hourly_rate` never validated `unit`
      on the markup branch (the unit does not enter the arithmetic), so a
      markup declared in usd_per_hour resolved fine and only the table CHECK
      stopped it. Unit column was decorative for exactly one rate model. Fixed.

- [ ] No `set_discount()` wrapper yet — discounts/grants are written directly.
- [ ] database/kubernetes/platform_apps plans carry specs only in `metadata`
      jsonb; only compute has typed vcpu/memory_mb/disk_gb. Promote if the UI
      wants them typed.
