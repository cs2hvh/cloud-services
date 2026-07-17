# Phase 0 — Billing Completeness Audit (live, code-grounded)

**Date:** 2026-07-15 · **Companion to:** [00-MASTER-PLAN.md](00-MASTER-PLAN.md) §2 (Phase 0 definition) · [09-critique-and-sequencing.md](09-critique-and-sequencing.md) (§3, "nothing else should start before this") · **Status:** Phase 0 is **not** done. 2 real, live financial-exposure bugs found and fixed this session; 4 of 6 Phase-0 items remain partial or not done.

> **Why this doc exists:** docs 00–10 are a single planning pass from 2026-06-25, "Status: Proposed," never updated since. Docs 11–15 (agentcore) earned a live "BUILD STATUS, not just planning" convention as they were built and re-verified. Phase 0 — the doc's own stated prerequisite, *"nothing else should start before this lands"* — never got that treatment, and the team built two months of agent/eval/multimodal work on top of it regardless. This doc is that missing status check, done by reading the actual code and, where practical, proving it live — not re-reading the plan.

---

## 1. What Phase 0 required (doc 00 §2, verbatim scope)

1. Billing completeness + markup (charge FT/serving/vector compute; billing-vuln remediations applied in prod; one markup layer; one migration unifying `service_type`/grace allowlists)
2. `lib/runner-core` extraction (Postgres claimer → BullMQ → heartbeat → health server, shared across workers)
3. Unified usage-event pipeline (one `UsageEvent` shape, one `computeUnitCost()`, no forked billing paths)
4. One `inference.dedicated_endpoints` + reservation schema
5. Brand-scrub for binary/log/stream surfaces (beyond `customerSafeErrorMessage()`)
6. Shared media/blob helper (R2 signed URLs, ZDR-aware)

**Exit criteria (doc 00):** *"all existing SKUs metering correctly ... markup toggle live ... runner-core running the ft + deploy workloads unchanged ... the unified consumer pricing a synthetic per-unit event end-to-end."*

## 2. Status per item, verified against the running code

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Billing completeness + markup | **PARTIAL** — metering exists per-SKU; markup layer is structurally broken, not just unwired (see §3) | `workers/inference/src/consumers/usage.ts` never reads `inference.models.upstream_pricing`; writes `upstream_cost_cents = cost_cents` unconditionally → margin always reports **exactly $0**, on every request, forever |
| 2 | `lib/runner-core` extraction | **DONE** | `workers/{agent,ft,deploy,eval}-runner/package.json` all depend on `@ahura/runner-core`; `workers/runner-core/src/{boot,claimer,env,health,logger,supabase}.ts` real and shared |
| 3 | Unified usage-event pipeline | **PARTIAL** — token/multimodal/agent-tool calls go through one `UsageEvent`/`computeUnitCost()`; FT, GPU-serving, and vector billing each still fork their own path (`lib/inference/finetune-billing.ts`, `lib/inference/deployment-billing.ts`, `billing.bill_service_cycle_atomic`) | 4 independent metering mechanisms coexist for the inference vertical alone |
| 4 | `inference.dedicated_endpoints` + reservation schema | **NOT DONE** | zero hits for `dedicated_endpoints`/`reservation` across `supabase/migrations/*.sql`; only `inference.deployments` exists (BYO/self-hosted autoscaling, a different concern) |
| 5 | Brand-scrub for binary/log/stream surfaces | **PARTIAL** — citation envelopes scrubbed correctly; sandbox stdout reuses the wrong scrubber (only strips search-provider names, not RunPod/K8s/hostname leakage); FT training logs go to customers completely unscrubbed; no image EXIF/watermark stripping exists at all | `workers/agent-runner/src/tools/code.ts:17` imports `scrubUpstream` from `web-search.ts`, not a sandbox-specific scrubber; `app/api/inference/fine-tuning/jobs/[id]/log-url/route.ts` hands back the raw `training.log` verbatim |
| 6 | Shared media/blob helper | **NOT DONE** | none of `images.ts`/`video-generations.ts`/`audio-speech.ts`/`music-generations.ts`/`audio-transcriptions.ts` call R2 at all — 3 different ad hoc patterns (always-inline-base64, live-proxy-upstream-URL) instead of one shared, ZDR-aware helper |

**Also confirmed real and merged (not a Phase-0 item, but load-bearing):** the pre-Phase-0 billing-vuln remediation (`a3447e0d`, balance-before-meter-advance, atomic reservations, `service_type` allowlist) is genuinely on `dev`'s ancestry — that hardening held.

## 3. Two real bugs found and fixed this session

Both were unconditional, no-malicious-actor-required leaks — not edge cases, not theoretical.

### 3a. eval-runner: every eval run billed the platform, never the customer — fixed, `e4f57da8` + `35bccd15`

Every target-model call and every `llm_judge` call authenticated with the static `INFERENCE_PLATFORM_KEY` but never sent `X-Ahura-On-Behalf-Of-Org` — the exact misattribution bug agent-runner had and fixed on 2026-07-06 (`workers/agent-runner/src/gateway.ts`), never backported to eval-runner. `eval_results.cost_cents` was hardcoded to `0` regardless. Fixed: both calls now carry the header; `cost_cents` on both `eval_results` and `eval_runs` is computed from real token usage × catalog pricing.

**Live-verified**: a real eval run produced two `inference.usage` rows keyed with the on-behalf-of sentinel `api_key_id` (`00000000-0000-0000-0000-0000000000a9`), proving the attribution path actually fired for both calls, not a same-org coincidence.

**⚠️ Open risk, unresolved:** this fix only takes effect in production if eval-runner's deployed `INFERENCE_PLATFORM_KEY` is flagged `is_internal_service` in `inference.api_keys` — the same flag agent-runner's key needed (migration `20260706000001`, applied via a manual `UPDATE` since the migration can't know the key id itself). eval-runner has its own, independently-authored k8s secret template — **not confirmed** whether it's the same already-flagged key or a different, unflagged one. If unflagged, this entire fix is a silent no-op in production. Someone with access to the real prod secret needs to check `SELECT is_internal_service FROM inference.api_keys WHERE key_hash = sha256(<eval-runner's actual INFERENCE_PLATFORM_KEY>)` and flag it if false.

Follow-up refinement (`35bccd15`): fixed a silent-$0 gap on a pricing-catalog miss (now logs a warning), fixed a catch-path bug where a case that failed *after* a successful (already-billed) target-model call lost that cost from the aggregate, and parallelized the target/judge pricing fetch.

### 3b. Cancelling a fine-tune job was free — fixed, `ddf837b9`

A customer could start an H100 fine-tune, let it run, and cancel at will — RunPod billed us for every second the pod was up; the customer paid $0. The webhook's failure path and the watchdog's reaper path both already charged for GPU time regardless of outcome; the user-initiated cancel path was the one gap left. Fixed: mirrors the webhook's atomic-win-transition + charge pattern. Also unified 3 independent copies of the same hourly-rate-to-cost-cents formula into one `computeFinetuneCostCents()` export.

**Caught in review before it shipped** (not live-tested — the route needs a real browser session, not a bearer token): elapsed seconds was an unrounded float being written into an `INTEGER training_seconds` column, which would have failed the UPDATE on nearly every real cancel; and the atomic-win transition only checked the returned row, never the query's `error`, so a genuine DB failure was indistinguishable from a legitimately-lost race and silently returned a misleading 409 with no log. Both fixed before commit.

## 4. Still open, in priority order

1. **eval-runner `is_internal_service` flag** (§3a) — a 30-second DB check away from confirming whether the eval-runner billing fix is live-effective at all. Highest priority precisely because it's cheap to resolve and blocks knowing whether §3a actually closed anything in production.
2. **Markup/margin metric is structurally broken** — not a leak, but means nobody would ever notice an underpriced/loss-making model, since the metric that's supposed to catch that always reads $0.
3. **Sandbox brand-scrub gaps** — wrong scrubber on sandbox stdout, unscrubbed FT training logs, no image EXIF/watermark stripping. Highest-leakage-area-per-doc-00's-own-risk-list, still open.
4. **Four still-forked billing mechanisms** (unified pipeline / FT / GPU-serving / vector) — bigger structural work, not a quick fix.
5. **No shared media/blob helper** — three ad hoc storage patterns instead of one ZDR-aware helper.
6. **No `dedicated_endpoints` schema** — lowest urgency, only blocks Phase 8 enterprise work.

## 5. How to re-verify any of this

- **Billing attribution**: query `inference.usage` for rows with `api_key_id = '00000000-0000-0000-0000-0000000000a9'` (the on-behalf-of sentinel) after a real run — presence proves the header path fired, not just that a request succeeded.
- **Margin metric**: `SELECT cost_cents, upstream_cost_cents FROM inference.usage ORDER BY created_at DESC LIMIT 20` — if every row has `upstream_cost_cents = cost_cents` exactly, the bug in §2 item 1 is still live.
- **FT-cancel charge**: cancel a real running job, then check `inference.finetunes.cost_cents` and `billing.credit_transactions` for a matching `service_type = 'inference_finetune'` row with `description` referencing the job name.
