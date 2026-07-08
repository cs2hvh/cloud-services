# Agents v2 — Execution Stages & Task Board

**Date:** 2026-07-01 · **Companion to:** [11-agent-implementation-plan.md](11-agent-implementation-plan.md) (design) · **Scope:** turns the slice plan (§12 of file 11) into small, independently-testable tasks.

This doc exists so each unit of work becomes a **proper ticket** that can be built, tested, and demoed on its own, with minimal dependency on the others. File 11 = *what & why*. This file = *in what order, split how, tested how*.

> **AS-BUILT NOTE (2026-07-01) — where the pure core lives.** The task rows below say `lib/agent/…`, but the engine (Stage 0 + S1.1–S1.3) was built with the pure core in a workspace package **`workers/agent-core`** (`@ahura/agent-core`), not `lib/agent/`. This is a deliberate improvement for durable-only (a clean leaf package like `runner-core`, importable by the k8s runner with no Next coupling). Mapping when reading the tables:
> - `lib/agent/loop.ts` → `workers/agent-core/src/loop.ts` · `lib/agent/messages.ts` → `…/messages.ts` · `lib/agent/types.ts` → `…/types.ts` · `lib/agent/tools/types.ts` → `…/tools/types.ts`
> - Loop/message **unit tests** live in `workers/agent-core/src/__tests__/` (co-located), not under `tests/`.
> - **`lib/agent/` barrels** re-exporting the package are added at first Next-side use (S1.4/S1.5).
> - Tool **adapter implementations** (S2) are **runner-side** (`workers/agent-runner/src/tools/*`), since they do I/O; only the tool *interface* is in the pure package.
> **BUILD STATUS (2026-07-03) — supersedes the per-task "Depends/Test" columns below, which are historical planning:**
> - **S1 (Durable Responses MVP) — ✅ SHIPPED** (commit `66cc22d8`). Schema (migrations 01–05, incl. the run-time fixes: 04 expose-schema, 05 sequence-grant), agent-core loop, agent-runner (claim/lifecycle/reaper), `/v1/responses` + run read/stream/cancel, `/api/agents` CRUD, dashboard list/create/edit + playground. **Verified live end-to-end** on staging (real run `queued→running→completed` with trace). Dockerfile + k8s manifests present.
> - **S2 (Hosted tools) — ✅ SHIPPED** (commit `93c6a518`). Registry (`spec.ts`) + dispatcher; `web_search` (Brave, brand-scrubbed), `file_search` (org-scoped RAG), inline `function` webhooks. **SSRF guard** (`tools/ssrf.ts`) blocks private/link-local/metadata targets before any webhook call. Agent builder UI has a tool selector.
> - **S3 (Code interpreter) — 🚧 BUILT (dev executor), HARD-GATED.** A real **stateful** sandbox: `sandbox/docker-pool.ts` runs a persistent Python kernel (variables/imports/files persist across `code` calls within a run, notebook auto-echo), one session per run reused via the dispatcher and disposed at run end; per-exec wall-clock timeout + all hardening (`--network none`, non-root, read-only, cap-drop, memory/pids caps); optional data image (`sandbox.Dockerfile` → `SANDBOX_IMAGE`). Still **disabled everywhere behind `SANDBOX_ENABLED=false`** — this is the *dev* Docker executor (shared kernel); the prod gVisor/Firecracker microVM + un-gating waits on **[13-agent-s3-sandbox-security-review.md](13-agent-s3-sandbox-security-review.md)**. UI shows Code interpreter as a **Beta** chip.
> - **Closed since (2026-07-06) — S3 session lifecycle, found missing by the 02/11/12/13 audit and now closed:** ✅ **`agentcore.sandbox_sessions` persistence** — every `code` tool session now writes a real row (`tools/sandbox/persisted-pool.ts`, `PersistedSandboxPool` decorator around any `SandboxPool`), one row per run, inserted lazily on first use so runs that never call `code` create no phantom row. ✅ **`settleSandboxSession`** (`tools/sandbox/settle.ts`) — atomic `provisioning|running → stopped` transition on `dispose()`, idempotent (a racing reaper can never double-settle), computes but deliberately does **not** charge (Phase-0 billing gate, see gap (2) below). ✅ **`session-reaper`** (`app/api/agents/internal/session-reaper/route.ts`) — mirrors `run-reaper`, wired into the 5-minute cron sweep in `workers/inference/src/index.ts`; reaps DB rows past `idle_deadline` from runner crashes, but **cannot** reach a leaked Docker container (documented limitation — true orphan-VM cleanup is a prod-microVM-pool requirement per doc 13, not a dev-executor one). ✅ **committed regression tests** — `workers/agent-runner/src/__tests__/sandbox-session.test.ts` (8 tests, fakes) + a one-off live run against the real Supabase project (real insert/settle/idempotent-no-double-charge/reaper-query-shape, all passed) replacing what had only been manual verification.
> - **Fixed (2026-07-06, scenario review) — `idle_deadline` was a session-age cutoff, not idle detection.** Doc 13's "idle reaper" requirement means time-since-LAST-activity; `persisted-pool.ts` set `idle_deadline` once at session creation and never refreshed it, so a run with several `code` calls spanning longer than the idle window (no single call hanging — just a long agentic loop) would have its still-live session falsely marked `'stopped'` by the reaper mid-run, silently no-op-ing the real end-of-session settle. Fixed: `start()` now bumps `idle_deadline` forward on every reuse, not just the first insert. 1 new test (bump-on-reuse); the fake Supabase double in the test file also gained a `.then()` so `await update().eq()...` with no terminal `.select()` actually executes (it previously silently no-opped, matching a real supabase-js gap the fake didn't reproduce).
> - **S5 (Agent memory) — ✅ BUILT, migration applied, live-verified.** A defined agent gets durable, embeddings-searchable memory: one `memory` tool with `write`/`search` actions (`tools/memory.ts`), scoped by (org_id, agent_id, scope_key). Migration `20260703000001_agentcore_agent_memory.sql` adds the table + cosine RPC + RLS (both **SELECT policy = is_org_member** and **RPC = SECURITY INVOKER**, so no cross-org read). **ZDR-gated** (writes refused for zero-data-retention orgs) + **purge API** (`DELETE /api/agents/:id/memories`, right-to-erasure, audited). UI has a Memory chip. Deferred: per-user vs agent-global scope UI.
> - **Closed since (2026-07-03):** ✅ **function builder UI** — "Custom functions" form (name + webhook URL + description + params JSON Schema + optional signing secret) now in both the new-agent builder and the Settings tab. ✅ **webhook HMAC signing** — `sha256(secret, "{ts}.{body}")` with `X-Ahura-Signature`/`X-Ahura-Timestamp` when a secret is set. ✅ **trace tool-I/O** — each step's `detail` now carries a brand-scrubbed, capped input/output preview, rendered expandable in the trace UI. ✅ **sandbox timeout** — the per-exec wall-clock cap was dead code (guard compared the wrong ref); fixed + covered by an opt-in Docker integration test (`sandbox.integration.test.ts`, `RUN_SANDBOX_IT=1`).
> - **Closed since (2026-07-06) — on-behalf-of billing attribution, found by the same audit as gap (2) below:** ✅ agent-runner's single static `ahu_...` platform key meant the gateway attributed EVERY agent run's model-turn cost to whichever org owns that key, never the customer — a live bug, not a future gap. ✅ tool costs (web_search/code/function) never reached `USAGE_EVENTS` at all. Fixed by migration `20260706000001` (`inference.api_keys.is_internal_service` flag + `inference.lookup_org_billing` RPC) + `authMiddleware`'s new on-behalf-of resolution (`workers/inference/src/middleware/auth.ts`) + a new `POST /v1/agent-tool-usage` ingress (`workers/inference/src/routes/agent-tool-usage.ts`) + `gateway.ts`/`persistStep` sending/reporting `X-Ahura-On-Behalf-Of-Org`. 22 new committed tests, full 4-package gate green (independently re-verified). **Live-verified end-to-end (2026-07-06)** against the real local stack after the migration was applied and the platform key flagged — see doc 11 §9 for the full account, including a real bug this live test caught (a UUID-column type mismatch on `apiKeyId` for on-behalf-of events) that all the fake-backed unit tests had missed entirely.
> - **Closed since (2026-07-06, same pass) — the remaining 3 of 6 agent tool types.** `file_search`/`memory_write`/`memory_search` had local cost-ceiling tracking (`TOOL_PRICE_KEY_TO_LABEL` in `lifecycle.ts`) since S2.1/S5, and their catalog rows already existed too (`agent/file-search` + one shared `agent/memory` row, from `20260703000002_agentcore_tool_pricing_gap_fill.sql`) — what was genuinely missing was `usage.ts`'s `computeUnitCost()`/`isPerUnitLabel` cases, so these 3 labels priced at 0 regardless. **Self-caught during a file-by-file SQL review:** an earlier pass wrote a redundant new migration duplicating `agent/file-search` and inventing `agent/memory-write`/`agent/memory-search` ids nothing referenced — caught via a live catalog query before it was applied, deleted, and the ingress route fixed to point both memory actions at the existing single `agent/memory` row instead. All 6 `agent/*` catalog rows now flow through the real pipeline once their rate is set — no new migration needed for this part. 6 more committed tests.
> - **Fixed (2026-07-06, found by the live sandbox re-test above) — `inference.usage.num_units` is INTEGER; `cpu_second` is fractional.** Re-testing the `code` tool live (real Docker execution, `SANDBOX_ENABLED=true`) after the ingress bridge landed surfaced a second real bug the fake-backed tests couldn't reach: a fast script reports `cpu_seconds` like `0.0002`, which failed the `inference.usage` row INSERT ("invalid input syntax for type integer") — and the queue **dropped the message entirely after 4 retries**, a real silent loss, not a delay. Fixed with `normalizeNumUnits()` in `workers/inference/src/consumers/usage.ts` (ceils a fractional `numUnits` before it touches either cost computation or the row, so `cost_cents` and the stored `num_units` stay consistent). 5 new tests; re-verified live afterward — `agent/code-interpreter` usage rows now land correctly. `file_search` and `code` were also both proven live end-to-end in this same pass (real Docker execution: `17! = 355,687,428,096,000`; real vector-search answer with citations) — not just the billing plumbing, the tools themselves.
> - **S4 (MCP) — ✅ SHIPPED as a CLIENT, not committed yet (2026-07-07).** §7's original "S4 MCP" below (and doc 11's original schema sketch) meant *hosting* — we run the customer's MCP server container. That's redefined and now a separate, still-deferred concern (doc 14 §11). What shipped instead is an MCP **client**: `tools/mcp-client.ts` (SDK wrapper) + `tools/mcp.ts` (adapter — connect, namespace `mcp__{label}__{tool}`, scrub, `flattenMcpResult` for the structured `content[]`/`isError` result shape) + `tools/mcp-attach.ts` (`attachMcpTools`, a pure **decorator** around `Dispatcher` — `dispatch.ts`/`spec.ts` needed **zero changes**, tighter than the §2b modularity contract even asked for). **M2 (metering):** `agent/mcp` catalog row + `mcp_call` wired through `TOOL_PRICE_KEY_TO_LABEL`, `REPORTABLE_UNIT_LABELS`, the gateway's `computeUnitCost`, and `/v1/agent-tool-usage`. **M3 (registry — the many-service layer):** `agentcore.mcp_servers` (control-plane only — no `deployment_id`/`hourly_cents`, no `billing.active_agent_mcp`; bills per-call, not always-on) + `/api/agents/mcp-servers` CRUD (encrypt-on-write/mask-on-read, mirrors `byok-keys`) + `mcp-registry.ts`/`mcp-crypto.ts` (registry-mode resolution + decrypt, kept out of the frozen adapter per §2b) + a builder-UI "saved servers" picker. **Live-verified end-to-end**: real agent, real local MCP server (Streamable HTTP), real trace (`step_type:"mcp"`, `tool_name:"mcp__test__add"`, `unit_label:"mcp_call"`), model actually used the real tool result. **Self-caught during this same pass:** `UNIQUE(org_id, slug)` doesn't protect curated-row slug uniqueness (Postgres never treats two NULLs as equal) — a duplicate curated slug would've silently resolved to "server not found" instead of erroring loudly; fixed with a partial unique index before the migration was ever applied. 40+ new committed tests (agent-runner: adapter, registry resolution, crypto round-trip; inference: usage consumer + ingress route), full gate green. **M4 (curated catalog + management screen) — ✅ SHIPPED (2026-07-07), built reactively after live UI testing surfaced the gap** (M3 had no way to *register* a server except the API, no nav entry, no status visibility): new `mcp-servers/page.tsx` (list, register dialog, status, delete — mirrors `byok-keys`) + a sidebar entry + curated-catalog migration seeding DeepWiki/Context7 (both already live-verified, not guessed endpoints). Two more real bugs caught and fixed live in this pass: registry-mode tool names were deriving their namespace from `display_name` instead of the already-clean `slug` (a punctuated display name produced a mangled tool name — fixed); and a React key collision (`key={t.type}`) in the agent Overview tab's tool-chip list, which registry mode's "bind several tools of the same type" makes a normal, everyday configuration, not an edge case. **Three migrations now staged, pending apply**: `20260707000001_agent_mcp_pricing.sql`, `20260707000002_agentcore_mcp_servers.sql`, `20260707000003_agentcore_mcp_curated_catalog.sql` (apply together with deleting the two pre-existing private `deepwiki`/`context7` test rows to avoid a slug collision). **Honest gaps:** `status`/`last_error` on a registered server are still write-once at creation — nothing yet flips a server to `'error'` on a live connect failure (needs M4's schema-refresh cron, not built). M6 (OAuth 2.1, pooling, hosting) remains. Full detail + BUILD STATUS banners: **[14-agent-mcp-implementation.md](14-agent-mcp-implementation.md)**.
> - **Honest gaps (still open):** (1) `web_search` now ships **both providers** (Brave default + Exa opt-in via `WEB_SEARCH_PROVIDER=exa`, one `WebSearchProvider` interface), but is **unit-tested only — not verified against a real upstream** (no key configured). (2) ~~Tool usage-emit deferred~~ — **closed above (2026-07-06)**: tool steps now emit real `UsageEvent`s via the new ingress bridge, in addition to the `run_steps` trace/ceiling record. (3) Prod sandbox = **dev Docker executor only** (shared kernel, but live-verified working correctly); gVisor/Firecracker + un-gating waits on doc 13 sign-off + the §15.3 infra decision. (4) A post-commit code-review pass (2026-07-06) found 8 real-but-non-blocking follow-ups. **2 fixed same-day**: `lookupOrgBilling` now shares the same KV-cache pattern (`org-billing:{orgId}`, 5-min TTL) as the normal-key lookup — live-verified, 478ms → 3ms on a repeat on-behalf-of call; `persistStep` no longer awaits `reportToolUsage` (it already swallows its own errors internally, so awaiting it was pure added per-tool-step latency with no correctness benefit). **6 still open, non-blocking**: the settle-charge formula duplicated verbatim between `settle.ts` and `session-reaper/route.ts`, a hand-rolled UUID regex where zod's validator was already available, an error-response helper that drops `request_id` unlike every other route, minor duplication in `persisted-pool.ts`'s two branches, the `keyId`/`usageApiKeyId` relationship being comment-enforced only, and unthrottled `idle_deadline` DB writes.

---

## How to read this

- **Stage** = an ordered milestone that produces something demoable/testable on its own.
- **Task** = the smallest unit ≈ one PR (~0.5–2 days). Each has: **Deliverable · Files (indicative) · Test (how to verify in isolation) · Depends-on · Track**.
- **Track** = a parallel lane. After Stage 0, three tracks run at once (see the dependency map).
- **DoD (Definition of Done)** for every task: code + its test passes in CI + no upstream brand leak on any new write path + reviewed.

### The decoupling strategy (why tasks don't block each other)

1. **Contracts first (Stage 0).** Lock the DB schema, the API request/response shapes, the SSE event shapes, and the `AgentTool` interface *before* any feature code. Everything downstream codes against these fixed contracts.
2. **Stub the boundaries.** UI builds against a **mock API** (static JSON fixtures) until the real API lands. The runner builds against **seeded DB rows** + a **mock gateway**. Tool adapters build against **fake upstreams**. So Track A / B / C never wait on each other.
3. **Every task testable by one command** — a Vitest unit/route test, or a seeded-DB integration test, or a Playwright render test. No task requires the *whole* system to be up.
4. **Vertical demo at each stage boundary** so progress is visible.

---

## Dependency map (the whole picture on one screen)

```
STAGE 0 — CONTRACTS & SCAFFOLD  (unblocks everything; ~2–3 days, do first, together)
    │  migration SQL · shared types · AgentTool interface · usage unit-labels + prices
    │
    ├──────────────► TRACK A: Core + Runner        (the engine)
    │                   S1.1 agent-loop core (PURE)  ──►  S1.3 agent-runner
    │
    ├──────────────► TRACK B: Gateway API           (enqueue + read)
    │                   S1.2 /v1/responses + run reads   (works w/o runner via seeded rows)
    │
    └──────────────► TRACK C: Control-plane + UI     (management surface)
                        S1.4 /api/agents CRUD  ──►  S1.5 dashboard UI (vs mock API first)

               ▼ ALL TRACKS JOIN ▼
        S1.6 WIRE-UP + E2E  → "Durable Responses MVP" demo  ✅ end of S1

  then S2 (tools) and S3 (sandbox) follow the same 3-track shape.
```

**Parallelism:** one engineer can do Track A while another does B and a third does C+UI. Solo, do them in the order A → B → C, but each is still shippable/testable alone.

---

# SLICE 1 — Durable Responses MVP

**Goal:** a customer defines an agent, calls `POST /v1/responses`, the runner executes a durable model-only loop, steps stream back, run completes and is billed. No tools, no sandbox yet.

## Stage 0 — Contracts & scaffold  *(do first, blocks all tracks)*

| Task | Deliverable | Files (indicative) | Test (isolated) | Depends |
|---|---|---|---|---|
| **T0.1 — Migration** | `agentcore` schema: `agents`, `runs`, `run_steps`, `sandbox_sessions` (defined now, used in S3), enums, indexes, RLS. **Write SQL, stop — user applies it.** | `supabase/migrations/2026XXXX_agentcore_schema.sql` | Apply to a staging-branch DB; assert tables + RLS policies exist; `is_org_member` gate works. | — |
| **T0.2 — Shared types** | TS types: `AgentConfig`, `Run`, `RunStep`, `ResponsesRequest`, `ResponsesResponse`, SSE event union (`response.created`/`response.step.added`/`response.output_text.delta`/`response.completed`). | `lib/agent/types.ts` | `tsc --noEmit` compiles; a type-level test file. | — |
| **T0.3 — Tool interface + loop signature** | `AgentTool { type; run(args,ctx) → {output,metering} }`, `RunCtx`, and the *signature only* of `runAgentLoop(...)`. No impl. | `lib/agent/tools/types.ts`, `lib/agent/loop.ts` (stub) | Type-only compile check. | T0.2 |
| **T0.4 — Metering contract** | Add agent `unitLabel`s (`web_search`, `cpu_second`, `function_call`) to the `USAGE_EVENTS` consumer switch + catalog price rows (migration). Model steps reuse the chat path. | `workers/inference/src/consumers/usage.ts`, price migration | Unit test: a synthetic agent `UsageEvent` prices correctly end-to-end. | — |

**Stage-0 exit:** schema applies clean; all contracts compile; a fake per-step usage event prices correctly. Now Track A/B/C start.

---

## Stage S1.1 — Agent-loop core (PURE, no infra)  ·  Track A

The testable heart. Zero network, zero DB — everything injected.

| Task | Deliverable | Files | Test (isolated) | Depends |
|---|---|---|---|---|
| **T1.1a — Loop skeleton** | `runAgentLoop({ messages, agent, callModel, dispatchTool })` → runs turns until no tool calls or `max_steps`. | `lib/agent/loop.ts` | Vitest: fake `callModel` returns a fixed sequence → assert the loop stops correctly, returns final text. | T0.3 |
| **T1.1b — Tool-call fan-out** | On `tool_calls`, call `dispatchTool` per call, append tool results, continue. | `lib/agent/loop.ts` | Vitest: fake model emits 1 tool call → fake `dispatchTool` returns output → assert next turn sees the tool message. | T1.1a |
| **T1.1c — Cost/step guards** | Accumulate `cost_cents`; stop on `max_steps` and on `cost_cents ≥ max_cost_cents`; emit a per-step record via an injected `onStep`. | `lib/agent/loop.ts` | Vitest: runaway fake model → assert loop halts at ceiling and reports reason. | T1.1b |
| **T1.1d — Message mapping** | `toMessages(input)`, `toToolMessage(call,output)` helpers. | `lib/agent/messages.ts` | Vitest: pure input/output assertions. | T0.2 |

**Exit:** `vitest run lib/agent` green — full multi-step loop, ceilings, and mapping proven with fakes. **No infra touched.**

---

## Stage S1.2 — Gateway API: enqueue + read  ·  Track B  *(does NOT need the runner)*

Build and test the whole customer API surface against **seeded DB rows** — you can manually insert a `completed` run to test the read/stream endpoints before the runner exists.

| Task | Deliverable | Files | Test (isolated) | Depends |
|---|---|---|---|---|
| **T1.2a — POST /v1/responses** | Zod validate → existing `auth/spend/ratelimit` chain → pre-flight balance guard (`hasSufficientBalance`) → insert `runs` row `queued` → `202 {run_id}`. | `workers/inference/src/routes/responses.ts`, register in `index.ts` | Route test: valid → 202 + row inserted; invalid → 400; low balance → 402 (fires *before* insert). | T0.1, T0.2 |
| **T1.2b — GET /v1/agents/runs/{id}** | Return status + full `run_steps` trace, org-scoped. | `.../routes/agent-runs.ts` | Seed a run + steps → assert response shape + org isolation (other org → 404). | T0.1 |
| **T1.2c — GET .../stream (SSE)** | Replay/tail `run_steps` as SSE events until terminal status. | same | Seed steps → assert ordered SSE events + terminal close. | T1.2b |
| **T1.2d — POST .../cancel** | Atomic transition to `cancelled` if not terminal. | same | Seed running run → cancel → assert state; cancel terminal → no-op. | T1.2b |

**Exit:** all four endpoints pass route tests against seeded data. The API is demoable with hand-inserted runs — **runner not required**.

---

## Stage S1.3 — agent-runner (durable execution)  ·  Track A  *(needs S1.1)*

Clone the proven [eval-runner](../workers/eval-runner) shape exactly.

| Task | Deliverable | Files | Test (isolated) | Depends |
|---|---|---|---|---|
| **T1.3a — Scaffold** | `bootRunner()` wiring (index/env/logger/supabase), health server. Boots with no jobs. | `workers/agent-runner/src/{index,env,logger,supabase}.ts` | Boot the process → `/health` returns ready; no crash. | T0.1 |
| **T1.3b — scan.ts** | Claim query over `runs WHERE status='queued'`, `jobId=run.id` (dedupe). | `workers/agent-runner/src/scan.ts` | Seed a queued row → `scanRuns()` returns one `EnqueueRequest`. | T1.3a |
| **T1.3c — gateway client** | HTTP `callModel` to `/v1/chat/completions` (same as eval-runner's gateway calls). | `workers/agent-runner/src/gateway.ts` | Unit test vs a mock HTTP server → returns parsed turn. | T1.3a |
| **T1.3d — lifecycle.ts** | Atomic claim `queued→running` → `runAgentLoop` (model-only, `dispatchTool` = throw for now) → write `run_steps` per turn → `completed`/`failed` + heartbeat. | `workers/agent-runner/src/lifecycle.ts` | Integration: seed run + mock gateway → run reaches `completed`, steps persisted, second claim is a no-op. | T1.1, T1.3b, T1.3c |
| **T1.3e — usage emit** | Emit a `UsageEvent` per model step. | `lifecycle.ts` | Assert one event/step with correct tokens. | T1.3d, T0.4 |
| **T1.3f — reapers** | Cron sweep endpoint: expire runs past `expires_at` / stale heartbeat (mirror serving-pod-watchdog). | `app/api/agents/internal/run-reaper/route.ts` + cron wire | Seed a stale run → sweep marks it `expired`. | T1.3d |

**Exit:** enqueue a run (or hit T1.2a) → runner picks it up → executes → steps + usage written → `completed`. **Track A + B now form a working headless loop.**

---

## Stage S1.4 — Control-plane CRUD API  ·  Track C  *(independent; needs only schema)*

| Task | Deliverable | Files | Test (isolated) | Depends |
|---|---|---|---|---|
| **T1.4a — queries layer** | `AgentcoreAgents.{list,get,create,update,delete}` (service-role). | `lib/supabase/queries/agentcore.ts` | Unit test vs test DB: CRUD round-trips, org scoping. | T0.1 |
| **T1.4b — /api/agents routes** | `POST/GET/PATCH/DELETE /api/agents` with auth + RBAC (developer+ to write) + audit + notification (mirror existing `ai-agents` route). | `app/api/agents/route.ts`, `app/api/agents/[id]/route.ts` | Route tests: RBAC denials, validation (Zod), audit row written. | T1.4a |

**Exit:** agent CRUD works via API, fully testable without runner or UI.

---

## Stage S1.5 — Dashboard UI  ·  Track C  *(builds against a MOCK API first)*

Ship each screen against static fixtures, then flip to the real API when S1.2/S1.4 land.

| Task | Deliverable | Files | Test (isolated) | Depends |
|---|---|---|---|---|
| **T1.5a — Mock API layer** | A typed client with a `MOCK=true` mode returning fixtures for agents/runs. | `lib/agent/client.ts`, `__fixtures__/` | Client returns fixtures; swap flag → hits real API. | T0.2 |
| **T1.5b — Agents list** | List/empty/loading states + "New agent" CTA. | `app/dashboard/services/agents/page.tsx` | Playwright render test vs mock: rows, empty state. | T1.5a |
| **T1.5c — Create/edit form** | Name, model picker, system prompt, `max_steps`, `max_cost_cents`, tools (checkboxes, disabled until S2). | `.../agents/new/page.tsx`, `.../agents/[id]/page.tsx` | Render + validation test vs mock; submit calls client. | T1.5a |
| **T1.5d — Run trace viewer** | Step waterfall (type, tokens, cost, latency, status) for a run. | `.../agents/runs/[id]/page.tsx` | Render vs a fixture run with mixed steps. | T1.5a |
| **T1.5e — Playground** | Input box → `POST /v1/responses` → live SSE step stream → final output. | `.../agents/[id]/playground/page.tsx` | Render vs mock SSE stream; asserts events render in order. | T1.5a |

**Exit:** the full UI is clickable against mocks; flipping `MOCK=false` talks to the real API. **UI never blocked on backend.**

---

## Stage S1.6 — Wire-up + E2E  ·  joins all tracks

| Task | Deliverable | Test | Depends |
|---|---|---|---|
| **T1.6a — Real wiring** | UI client `MOCK=false`; runner deployed to staging. | Manual smoke on staging. | S1.2, S1.3, S1.5 |
| **T1.6b — E2E happy path** | Create agent (UI) → run in playground → runner executes → steps stream → completes → bill settled. | Playwright e2e against staging. | T1.6a |
| **T1.6c — Guard tests** | Spend-cap 402 before work; `max_cost_cents` cuts a runaway loop mid-run; brand-scrub grep over `run_steps.detail` + citations. | Automated + checklist. | T1.6a |

**✅ S1 DONE = "Durable Responses MVP" — demoable end to end, billed, guarded.**

---

# SLICE 2 — Hosted retrieval + web tools  *(same 3-track shape)*

Depends on S1. Each tool is one `AgentTool` adapter behind the fixed interface — add-one-file, no loop/runner change.

| Stage | Track | Tasks (one PR each) | Test (isolated) |
|---|---|---|---|
| **S2.1 — file_search** | A (runner) | (a) adapter wrapping `lib/ai/rag.ts`; (b) wire into `dispatchTool`; (c) usage emit (per query + embed tokens) | Unit: fake KB → adapter returns chunks + citations; loop test with the tool |
| **S2.2 — web_search** | A | (a) `WebSearchProvider` interface; (b) Brave adapter; (c) citation envelope + **brand-scrub**; (d) usage emit | Unit vs mock Brave; scrub test asserts no upstream name leaks |
| **S2.3 — function webhooks** | A | (a) inline `function` tool: POST to customer `webhook_url` with signed payload; (b) timeout + error handling; (c) usage emit | Unit vs mock webhook; timeout path; malformed response path |
| **S2.4 — UI** | C | tool toggles enabled in the agent form; citations + tool steps render in the trace viewer | Render vs fixtures with tool steps |
| **S2.5 — E2E** | join | agent with web_search + file_search answers a grounded question with citations | Playwright e2e |

**✅ S2 DONE = "Agents GA" (durable + retrieval/web/function tools).** This is the v1 cut line.

---

# SLICE 3 — Code interpreter (sandbox)  ·  gated on security review

Depends on S1; **hard gate: one shared sandbox security review before any customer code runs.**

| Stage | Track | Tasks | Test (isolated) |
|---|---|---|---|
| **S3.1 — sandbox-pool** | A | (a) microVM (Firecracker/gVisor) session API: `start/exec/stop`, hard caps; (b) `sandbox_sessions` rows | Integration: start→exec `print(2+2)`→stop; caps enforced (timeout/mem) |
| **S3.2 — code tool** | A | (a) `code` `AgentTool` calling the pool; (b) `settleSandboxSession` per-second billing; (c) idle reaper | Unit vs mock pool; billing settle idempotency (double-stop → single charge) |
| **S3.3 — isolation review** | — | egress allowlist, no metadata endpoint, net namespace, stdout brand-scrub | Security checklist sign-off (blocking) |
| **S3.4 — UI + E2E** | C/join | code steps render (stdout/artifacts); e2e "make a table from CSV" | Playwright e2e |

**✅ S3 DONE = code interpreter GA.** MCP (S4) and memory (S5) follow, optional.

---

## Ticket-writing cheat sheet

Copy per task into your tracker:

```
Title:      [Agents S1.3d] agent-runner lifecycle — durable model-only loop
Deliverable: atomic claim → runAgentLoop → persist run_steps → complete/fail + heartbeat
Files:       workers/agent-runner/src/lifecycle.ts
Test:        integration — seed queued run + mock gateway → run completes, steps written,
             re-claim is a no-op
Depends on:  T1.1 (loop core), T1.3b (scan), T1.3c (gateway client)
Track:       A (core+runner)
DoD:         test green in CI · brand-scrub on run_steps.detail · reviewed
```

**Suggested WIP order (solo):** T0.1–0.4 → T1.1a–d → T1.2a–d → T1.3a–f → T1.4a–b → T1.5a–e → T1.6. **Team:** Stage 0 together, then A / B / C in parallel, join at S1.6.
