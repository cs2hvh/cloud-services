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

## BLOCKING — read docs/BILLING-HANDOFF.md before touching Pricing

As of 2026-08-31 `public.products`, `public.instance_plans` and
`public.gpu_pricing` are DROPPED. The main app's /dashboard/admin/pricing
deep-link that Pricing currently relies on is dead, and the platform has
zero prices until this panel ships a write surface over
`billing.service_pricing`. Schema, contract and gotchas are in
docs/BILLING-HANDOFF.md.
