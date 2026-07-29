# Admin Platform for the AI Verticals — Inventory & Design

**Date:** 2026-07-28 · **Companion to:** [00-MASTER-PLAN.md](00-MASTER-PLAN.md) (the build roadmap this operates) · [16-phase0-billing-audit.md](16-phase0-billing-audit.md) (the billing gaps this surfaces) · **Status:** analysis, live-verified against the running database and the real admin code. Nothing here is built except where marked.

> **Why this doc exists:** we shipped ~25 customer-facing AI pages and 34 AI tables over several months and never built an operator surface for any of them. The existing admin — which is genuinely good — manages the IaaS business, plus one AI-labelled section pointed at a *retired* agents product nobody uses. Everything the AI roadmap actually produced is operated by hand-written SQL and one-off scripts. This doc inventories what exists, what an operator actually needs to do with it, and proposes the admin as a system rather than one screen at a time.

---

## 1. What we have, measured

### 1.1 The customer-facing AI product (what we sell)

25 dashboard pages under `app/dashboard/services/`:

| Area | Pages |
|---|---|
| Inference | models, playground, api-keys, byok-keys, usage, audit, settings, notifications, diagnostics |
| RAG | vectors, vectors/[id] *(collections, connectors, documents)* |
| Training | fine-tuning, deployments |
| Quality | evals, guardrails, prompts, presets, observe, traces |
| Batch/files | batches, files |
| Agents | agents, agents/[id], agents/new, agents/mcp-servers, agents/playground |

Backed by ~60 API route groups under `app/api/inference/*` plus the CF Worker gateway's `/v1/*` surface.

### 1.2 The data behind it

| Schema | Tables | Contents |
|---|---|---|
| `inference` | **28** | api_keys, audit_log, batches, byok_keys, connector_documents, connectors, deployments, eval_cases, eval_datasets, eval_results, eval_runs, files, finetunes, guardrail_policies, media_jobs, model_presets, models, notification_settings, org_members, orgs, prompt_versions, prompts, semantic_cache, trace_spans, usage, vector_collections, vector_rows, webhook_deliveries |
| `agentcore` | **6** | agents, agent_memories, mcp_servers, run_steps, runs, sandbox_sessions |
| ~~`agents`~~ *(retired)* | 10 | **Not in use.** Superseded by `agentcore`. Last write 2026-06-04. Still *shipped*, though — see §1.5. |
| `billing` | 17 | user_credits, transactions, active_* (incl. `active_inference_vector`), service_lifecycle, promocodes, … |

### 1.3 The admin that exists

24 pages / ~50 API routes, and it is well-built: `requireAdmin()` gate, `createWorkerClient()` service access, card-grid navigation in `components/admin/admin.tsx`, consistent GET-list / PUT-update route shape.

Covered: hosts, servers, users, databases, domains (deep — purchases, transfers, SSL, DNS), object storage, network/DDoS, Kubernetes, cluster monitor, GPU, platform-apps, coupons, pricing (categories, plans, promos, **gpu_pricing with `markup_pct` + `floor_per_hour_usd`**), support tickets, audit logs.

Plus one dead section: **AI Agents**, which reads the retired `agents` schema (§1.4).

### 1.4 The gap, stated precisely

```
admin routes touching `inference` schema  : 0   (before 2026-07-28)
admin routes touching `agentcore` schema  : 0
admin routes touching `billing`  schema   : 1   (a single user_credits read)
```

The `ai-agents` admin section is **not** coverage. It reads the retired `agents`
schema — `ai_agents`, `agent_usage`, `agent_messages`, `agent_conversations` —
which the live product replaced with `agentcore`. Measured 2026-07-28:

| | last write | volume | read by |
|---|---|---|---|
| `agents` (retired) | 2026-06-04 | 12 agents, 90 conversations | its own legacy UI + the admin page |
| `agentcore` (live) | 2026-07-25 | 26 agents, **328 runs, 966 run steps** | the customer product |

So the one admin screen that appears to cover AI was pointed at a system nobody
uses, while the agent platform that *is* running — sandboxes, runs, MCP servers,
delegation — had no operator surface at all.

**34 live AI tables and 25 customer pages have no admin. The AI-labelled admin
section had to be repointed, not extended** — done 2026-07-28, see §6.

### 1.5 The retired product is still deployed

Correcting an earlier claim in this doc: the old agents product is not merely a
dormant schema, it still **ships a full customer-facing surface**:

- `app/dashboard/services/ai-agents/*` — agent list, detail, new, settings, and a
  whole knowledge-bases section
- `app/api/ai-agents/*`, `app/api/knowledge-bases/*`, `app/api/ai-model-keys/*`,
  `app/api/v1/agents/{endpointId}/chat`
- `lib/supabase/queries/ai_agents.ts`

No traffic since 2026-06-04, but the routes are live and reachable. That is a
retirement decision — dead code that still exposes endpoints and confuses the
next person reading the tree — and it is deliberately **out of scope for the
admin work**: deleting a customer-facing product is a product call, not an
operator-tooling one. Flagged here so it is not lost.

---

## 2. What that cost us (observed, not hypothetical)

Every item below was found by inspection on 2026-07-28 and is a direct consequence of having no screen:

1. **20 of 29 priced active models were at or below cost**, carrying **91% of all priced traffic** (481 of 526 calls). `openai/gpt-oss-20b` sold output at 5¢/Mtok against a 13¢ cost — **−160%**. Prices were typed once into `models.pricing` and silently went underwater as upstream rates moved, because nothing displayed cost next to price.
2. **`upstream_pricing` was empty for all 86 models** for ~2 months after the code that reads it shipped ([16](16-phase0-billing-audit.md) §4.2). The fix was a script nobody had a reason to run. Margin reported exactly $0 platform-wide.
3. **Models with invalid `upstream_model_id` reached customers** — `openai/gpt-5.5-mini` returned *"not a valid model ID"* from upstream as a failed `/answer`. The remedy was writing a catalog health-check script (`13c0957f`) rather than an operator noticing a red row.
4. **`is_internal_service` is flagged by hand-written UPDATE** ([16](16-phase0-billing-audit.md) §3a). Only **2 of 62** keys carry it — and one of those two is **revoked**, leaving exactly one live internal key (`phase-5`, prefix `ahu_live_srFl`). *Partially resolved 2026-07-29:* the key the runners use locally **is** that one, so their embeds do bill the customer org. Whether the deployed k8s secret holds the same key is still unverified — it lives in the cluster, not the repo.
5. **The vector quota error tells customers "contact support to raise your limit"** — and support has no way to raise it. It is a hardcoded `1_000_000` in two files.
6. **A wedged connector sync** can only be cleared by a cron watchdog or `kubectl`.

---

## 3. The management model

Rather than "a page per table", the useful frame is: for each capability, which of these seven operations does an operator need?

**see · price · limit · override · unblock · kill · audit**

| Capability | Operations needed | Possible today |
|---|---|---|
| Model catalog | see, price, limit *(enable/disable)*, audit | SQL + 2 scripts |
| API keys | see, limit *(rate/cap)*, override *(internal flag)*, kill *(revoke)* | SQL |
| Orgs & members | see, limit *(quota/caps)*, override, audit | SQL |
| Credits & billing | see, override *(refund/comp)*, audit | SQL |
| Vector collections | see, limit *(quota)*, kill | none |
| Connectors / syncs | see, unblock *(retry)*, kill | cron only |
| Fine-tunes | see, unblock, kill, price | partial (customer UI only) |
| Deployments / serving | see, kill, price | partial |
| Evals | see, kill | none |
| Agentcore runs & sandboxes | see, kill *(runaway loop)*, audit | none |
| Guardrails / prompts | see, override | none |
| Usage & margin | see, audit | none |
| Platform safety | kill *(feature switches)* | one switch exists (`gpu_deploy_enabled`) |

Two structural observations fall out of this table:

- **`kill` is missing almost everywhere.** There is no way to stop a runaway agent loop, a runaway sync, or a specific feature platform-wide. `platform_settings` already proves the pattern with `gpu_deploy_enabled` — it just has exactly one key.
- **`audit` exists as data but not as a surface.** `inference.audit_log` is written faithfully by the CRUD routes and nobody can read it outside SQL.

---

## 4. Proposed admin sections

Six sections, each mapping to a cluster of the table above. Names follow the existing `/dashboard/admin/<section>` convention.

**A1 · Catalog & pricing** — `inference.models`
Price vs upstream cost vs margin; activate/deactivate; fix `upstream_model_id`; bulk reprice to a target margin; a **floor** refusing below-cost saves. *Partially built 2026-07-28 — see §6.*

**A2 · Orgs & customers** — `inference.orgs`, `org_members`, `api_keys`, `byok_keys`
Find an org, see its members and roles, its keys (revoke, rate limit, hard cap, `is_internal_service`), its quotas. This is the section support will live in.

**A3 · Billing & credits** — `billing.*` joined to `inference.usage`
Balance, transactions, manual adjustment with a reason, grace state, spend-cap override, and a usage explorer by org/model/day to answer "why is my bill this much".

**A4 · Jobs & runners** — `inference.finetunes`, `deployments`, `eval_runs`, `connectors`, `agentcore.runs`, `run_steps`, `sandbox_sessions`
One operational view of everything long-running: state, age, heartbeat, error; retry, cancel, force-reap. Replaces `kubectl` for day-to-day recovery.

Agent operations mean **`agentcore` only** — 328 runs and 966 steps of live traffic, plus sandbox sessions that can be left running and MCP servers that can hang. The retired `agents` schema is out of scope for this work.

**Decision (2026-07-29): the existing AI Agents section stays.** An earlier draft of this doc argued for deleting it, and that was acted on and then reverted. Removing a working screen is a product call, not an operator-tooling one, and this programme is additive: we are building the inference AI admin, not replacing what exists. The new view therefore lives at its own route (`/dashboard/admin/inference-agents`) alongside the untouched `/dashboard/admin/ai-agents`. The retirement question from §1.5 remains open and separate.

**A5 · Safety & switches** — `platform_settings`, `guardrail_policies`
Per-feature kill switches (inference, agents, connector syncs, fine-tuning) on the proven `gpu_deploy_enabled` pattern; guardrail policy visibility.

**A6 · Audit & observability** — `inference.audit_log`, `trace_spans`, `webhook_deliveries`
Read the audit trail that is already being written; webhook delivery failures; trace sampling.

### Suggested order

`A1 → A2 → A3 → A4 → A5 → A6`

A1 first because it is actively costing money on every request. A2 next because it unblocks support. A3 because it is where money disputes land. A4 is operational relief rather than revenue. A5 and A6 are cheap once the shell exists.

---

## 5. Cross-cutting decisions to make first

1. **Identity model — DECIDED 2026-07-29: org-scoped, joined to users for names.**
   The AI platform is unambiguously org-scoped and the join is clean, so this was
   settled by reading the schema rather than by preference:

   ```
   inference.orgs         owner_user_id, billing_user_id, hard_cap_cents,
                          monthly_budget_cents, zdr_default, region_pin, deleted_at
   inference.org_members  org_id, user_id, role, status, invited_by
   public.user_profiles   id (= auth user id), username, roles
   ```

   Every AI resource (keys, collections, runs, usage) hangs off `org_id`, never
   `user_id`, so an org is the only unit that can carry a quota, a spend cap or a
   bill. AI admin screens therefore list **orgs**, and resolve people through
   `org_members.user_id → user_profiles` for display. The legacy user-scoped admin
   is left alone; the two meet at `owner_user_id` / `billing_user_id`.
2. **Audit every admin mutation.** `inference.audit_log` already exists with an actor concept. Admin writes should append to it from day one, or the audit section in A6 ships with a hole in it.
3. **Dry-run discipline for anything bulk.** `scripts/sync-or-model-pricing.ts` requires `--apply`; bulk repricing should too. Preview → confirm → write.
4. **Read/write separation.** Most of what support needs is read-only. Consider whether a `support` role short of full `admin` is worth having before the sections proliferate.
5. **Quotas belong in data, not constants.** `MAX_VECTORS_PER_ORG` must become a per-org column before A2 can honestly offer "raise this org's limit".

---

## 6. Already built (2026-07-28)

Everything below is **additive** — no existing file was removed. An intermediate
attempt did delete the legacy AI Agents admin; that was reverted in full, and the
new view now lives at its own route.

**A4 (agents) — a new section for the live platform**, at
`/dashboard/admin/inference-agents`, alongside the untouched
`/dashboard/admin/ai-agents`:

- `lib/admin/agentcore-ops.ts` — pure operator derivations: run health (failure
  rate over *settled* runs only), stuck-run detection by heartbeat staleness,
  leaked-sandbox detection past `idle_deadline`, per-tool reliability, MCP health
- `app/api/admin/agentcore/overview/route.ts` — bounded composed read
- `components/admin/agentcore/*` — health cards, and tabs for agents (with their
  tools), runs, tools, MCP servers, sandboxes
- 24 unit tests

**A1 (catalog & pricing)** at `/dashboard/admin/inference-pricing`:

- `lib/admin/inference-pricing.ts` — margin by billing basis (output for chat, **input for embeddings**), the below-cost floor, merge-don't-replace, the reprice planner
- `app/api/admin/inference/pricing/route.ts` — list with margin; edit one model (409 + explicit `force` for a deliberate loss-leader); enable/disable
- `.../pricing/bulk/route.ts` — reprice to a target margin, dry-run by default
- `components/admin/inference-pricing/*` — table, summary cards, filter bar, per-model edit dialog (price beside cost beside margin), bulk dialog
- 47 unit tests

**Used in anger 2026-07-28:** the bulk action took **20 models at or below cost → 0**, including `gpt-oss-20b` from −160% to +50%. Two models remain under policy at 11% and 19%; lifting those needs a run with *only-at-or-below-cost* disabled.

Verified: typechecks; all routes 401 unauthenticated; pages 307 to login; 75 tests green. **Not** verified by me: the rendered UI — `requireAdmin()` is cookie-based, so shell checks stop at the redirect.

Two live findings worth keeping:

- Per-unit SKUs and token-billed models are **different shapes**. The sync writes token-shaped upstream costs onto per-unit models (`image-gen` carries `output_cents_per_mtok: 250` while charging 3¢/image), so a naive bulk rule would have invented token prices for models not sold by the token. `isTokenBilled()` now guards this.
- The summary once reported **22 "margin unknowable"** when only **8** were: the other 14 are per-unit SKUs with real prices. Now counted separately.

Also completed: `scripts/sync-or-model-pricing.ts --apply` was run, populating `upstream_pricing` for **36 of 51 active models** (was 0), which is what makes a margin column possible at all. 15 active models still have no cost basis — every embedding model, the `agent/*` internal SKUs, and the `ahura/*` aliases — because they are not OpenRouter-served. They need a separate cost source before A1 can be complete.

---

## 7. Verification discipline

Per the repo standard, each admin slice ships with: `requireAdmin()` on every route (assert 401 unauthenticated) · a live read against the real schema · a write path exercised once end-to-end with an audit row to prove it · dry-run proven to write nothing · and no hardcoded limit that the screen claims to control.
