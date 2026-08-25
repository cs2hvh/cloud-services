# Billing Unification — Plan (not yet implemented)

**Date:** 2026-07-17 · **Companion to:** [16-phase0-billing-audit.md](16-phase0-billing-audit.md) (§4 item 4, "four still-forked billing mechanisms") · **Status:** PLANNING ONLY. No code changed by this doc. Written after tracing all four mechanisms against the running code and the live database, not assumed from the earlier audit's framing.

> **This doc supersedes doc 16 §4 item 4's framing.** "Four forked billing mechanisms" undersold one problem and mischaracterized another. Read §1 before anything else here — it changes what "unification" should actually mean.

---

## 1. The real, most urgent finding: one mechanism's source code is missing from this branch

While tracing where `active_*` service billing (GPU pods, Kubernetes, databases, object storage, DDoS protection, platform apps, vector collections, generic compute, custom images — 9 SKUs via `billing.bill_service_cycle_atomic`) is actually driven from, I found **no code on this branch calls that RPC at all.**

**What happened, reconstructed from git history:**
- `credit-system-cron/cron-worker.js` (a standalone Node process, 1640 lines) was the original driver.
- On a branch called `feature/cron-job-update` (May 26–28), it was properly rewritten as `cron-worker.ts` with real tests (`tests/unit/billing/cron-worker.test.ts`, 13 cases — SQL-injection-safe table allowlisting, atomic RPC usage, proration, security caps, grace-lifecycle triggering). The branch's *final* commit then deleted the whole `credit-system-cron/` directory in favor of migrating to an internal Next.js API route (matching the `session-reaper`/`finetune-watchdog` pattern) — but that replacement route was never written, or was written somewhere I couldn't find. **That branch was never merged to `master`, `dev`, or this branch.**
- Separately, on *this* branch's own lineage, commit `ef946da1` (June 3) independently deleted the same file with no replacement at all.
- A third, still-separate copy (1530 lines, `.js`, independently patched) exists in an unrelated worktree (`glory-gasosaurus`), also never merged anywhere.
- Today, `credit-system-cron/` on this branch contains only `package.json` — no source.

**What this is NOT**: an active revenue leak. I queried `last_billed_at` directly across all 9 live tables — most rows show timestamps from **today, within seconds of each other** (`2026-07-17T06:20:0X`), proving something is alive in production and billing correctly on a real schedule right now.

**What this IS**: nobody working on this branch can currently see, diff, audit, or safely redeploy whatever that running process actually is. Two stale outlier rows (`active_kubernetes` and `active_objectspace`, last billed June 2/June 8) suggest it may also be silently failing on specific rows — impossible to investigate without the source.

**Verified today, safely — 13/13 tests pass on the recovered code.** I pulled `cron-worker.ts` and its matching test file from the last commit before `feature/cron-job-update` deleted them (`b23e5b1f`), installed `node-cron`/`pg` locally, and ran the real test suite against it. All 13 cases passed. The recovered code is functionally sound — this is a lost-in-an-unmerged-branch problem, not a broken-code problem. Everything used for this check was removed afterward; the repo has zero net changes from this investigation. A copy of the recovered file is not committed anywhere — ask if you want it placed back in the tree.

**Recommended immediate action (not done here — your call, not mine to make unilaterally):**
1. Find out what's actually deployed (k8s image tag / manual check of whatever runs `credit-system-cron` in production).
2. If it matches (or is close to) the recovered `feature/cron-job-update` version: recover that branch's history properly (`git cherry-pick` or a real merge, not a blind overwrite) rather than losing the tests and the SQL-injection-hardening work a second time.
3. If production is running something else entirely (e.g. the `glory-gasosaurus` worktree's version, or an even older build): reconcile which one is authoritative before touching any of this further.

This should happen **before** any of the unification work below — you can't safely unify a mechanism whose real, currently-running implementation you can't see.

---

## 2. The actual shape of the fragmentation (reframing doc 16 §4 item 4)

Doc 16 called this "four forked billing mechanisms" as if they're four copies of the same thing. They're not — three are genuinely different *shapes* of billing problem, and conflating them would be a mistake. The real fragmentation is narrower and more specific than "unify everything."

| Shape | Mechanism | What it bills | Cadence |
|---|---|---|---|
| **A — per-event** | `workers/inference/src/consumers/usage.ts` (`UsageEvent` → `computeUnitCost`/`computeCost`) | Chat, embeddings, images, TTS/STT, video, music, OCR, rerank, moderation, agent tool calls | Once per request/call |
| **B — recurring active-service** | `billing.bill_service_cycle_atomic` + the 9 `active_*` tables (§1) | GPU pods, K8s, databases, object storage, DDoS protection, platform apps, vector collections, generic compute, custom images | Periodic sweep (hourly-ish), bills elapsed wall-clock time per active row |
| **C — terminal one-shot** | `lib/inference/finetune-billing.ts` (`chargeFinetuneUsage`/`computeFinetuneCostCents`, already consolidated 2026-07-15 across its 3 call sites: webhook success/failure, watchdog reaper, user-cancel) | Fine-tune jobs | Once, when a job reaches a terminal state |
| **The actual outlier** | `lib/inference/deployment-billing.ts` (`meterDeployment`) | BYO/serving deployment GPU-worker-seconds | Periodic sweep, its own bespoke cron |

**A, B, and C are not duplicates of each other** — they solve genuinely different problems (a per-request charge, a recurring elapsed-time charge, a one-shot terminal charge) and forcing them into one code path would make each one worse, not better. **B already has 9 different service types sharing one atomic primitive** — that's not fragmentation, that's the platform's actual unification success story, and doc 16 undersold it.

**The one real, actionable unification target: `meterDeployment` duplicates Shape B's own pattern instead of using it.** A BYO/serving deployment is exactly the same kind of thing as a GPU pod or a Kubernetes cluster — an always-on resource that bills by elapsed wall-clock time via a periodic sweep. It should be a 10th `active_*` table row consumed by the *same* `bill_service_cycle_atomic` RPC and (once §1 is resolved) the *same* cron, not its own separate `last_metered_at`-on-the-deployments-table, its own inline rate math, and its own direct `Billing.deduct()`/`save_transaction()` calls.

---

## 3. Proposed plan, in order

**Phase 0 (blocking, not this doc's to execute): resolve §1.** Recover or rewrite the `active_*` cron driver with a known, tracked, mergeable source. Until this lands, don't touch Shape B at all — there's nothing safe to refactor toward.

**Phase 1: fold `meterDeployment` into the `active_*` pattern.**
- Add `active_deployments` (or reuse `active_compute` if its shape already fits — needs checking against what `active_compute`'s columns actually are, not assumed) to the `bill_service_cycle_atomic` allowlist.
- Migrate `inference.deployments.last_metered_at`-based sampling to a real `billing.active_deployments` row per live deployment (`status`, `last_billed_at`, `hourly_rate` — the RPC's existing generic shape).
- Delete `lib/inference/deployment-billing.ts`'s bespoke `meterDeployment` once the cron sweep covers it — one less hand-rolled `Billing.deduct()` call site to keep correct.
- **Test plan**: mirror this session's discipline — real unit tests for the migration logic, then a live-verified test against a throwaway deployment row (not a real customer's), confirming one billing cycle produces the same charge the old `meterDeployment` formula would have, before cutting over.

**Phase 2 (optional, lower priority): standardize Shape A/C's cost-computation pattern.** Not a merge — Shape A (per-event) and Shape C (terminal) are correctly separate. But both now compute `cost = rate × usage` with a `Math.ceil` micro-amount guard (`computeUnitCost`/`computeCost` in `usage.ts`, `computeFinetuneCostCents` in `finetune-billing.ts`) — two independently-written, structurally-identical formulas. Not urgent, but worth a shared `centsFromRate(rate, quantity)` helper if a third one ever appears, so a future case doesn't reinvent `Math.ceil` rounding discipline a fourth time.

**Explicitly NOT proposed**: merging Shape A (per-event) or Shape C (terminal) into Shape B's cron-sweep model, or vice versa. They bill fundamentally different things on fundamentally different schedules — forcing one shape to imitate another would be unification for its own sake, not a real improvement.

---

## 4. Why this wasn't implemented today

Phase 0 requires a decision only you can make (which version, if any, matches what's actually deployed) and access I don't have (the k8s deployment's actual running image). Phase 1 depends on Phase 0 landing first. Writing code against a cron mechanism whose current real-world behavior is unknown would be guessing, not engineering — this doc exists so the next session (or you) can pick this up with full context instead of re-discovering §1 from scratch.
