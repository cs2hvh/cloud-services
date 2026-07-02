# Agents v2 — Execution Stages & Task Board

**Date:** 2026-07-01 · **Companion to:** [11-agent-implementation-plan.md](11-agent-implementation-plan.md) (design) · **Scope:** turns the slice plan (§12 of file 11) into small, independently-testable tasks.

This doc exists so each unit of work becomes a **proper ticket** that can be built, tested, and demoed on its own, with minimal dependency on the others. File 11 = *what & why*. This file = *in what order, split how, tested how*.

> **AS-BUILT NOTE (2026-07-01) — where the pure core lives.** The task rows below say `lib/agent/…`, but the engine (Stage 0 + S1.1–S1.3) was built with the pure core in a workspace package **`workers/agent-core`** (`@ahura/agent-core`), not `lib/agent/`. This is a deliberate improvement for durable-only (a clean leaf package like `runner-core`, importable by the k8s runner with no Next coupling). Mapping when reading the tables:
> - `lib/agent/loop.ts` → `workers/agent-core/src/loop.ts` · `lib/agent/messages.ts` → `…/messages.ts` · `lib/agent/types.ts` → `…/types.ts` · `lib/agent/tools/types.ts` → `…/tools/types.ts`
> - Loop/message **unit tests** live in `workers/agent-core/src/__tests__/` (co-located), not under `tests/`.
> - **`lib/agent/` barrels** re-exporting the package are added at first Next-side use (S1.4/S1.5).
> - Tool **adapter implementations** (S2) are **runner-side** (`workers/agent-runner/src/tools/*`), since they do I/O; only the tool *interface* is in the pure package.
> **Status:** Stage 0 + S1.1 (agent-core) + S1.2 (gateway) + S1.3 (agent-runner incl. run-reaper cron) are ✅ built, typecheck-clean, and unit-tested. Remaining for S1 GA: Track C (S1.4 CRUD, S1.5 UI) + S1.6 wire-up/E2E + runner Dockerfile/k8s.

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
