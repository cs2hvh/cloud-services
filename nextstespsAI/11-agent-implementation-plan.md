# Agents v2 (`agentcore`) — Implementation Plan

**Date:** 2026-07-01 · **Status:** Planning (scope locked per manager directive) · **Source design:** [02-agent-infrastructure.md](02-agent-infrastructure.md) (Phase 7 of [00-MASTER-PLAN.md](00-MASTER-PLAN.md))

This is the build-ready plan for the agent runtime, grounded against the real codebase. It supersedes the parts of `02-agent-infrastructure.md` that were cut for complexity (browser automation + tool/function registry) and pins down the plugin model, architecture, slices, and test discipline.

> **BUILD STATUS (2026-07-06):** **S1 ✅ shipped** (`66cc22d8`, verified live E2E), **S2 hosted tools ✅ shipped** (`93c6a518`; incl. an SSRF guard on function webhooks), **S3 code interpreter 🚧 built (stateful dev sandbox: persistent kernel, session reuse, data image) but hard-gated** behind `SANDBOX_ENABLED` pending the security review in **[13-agent-s3-sandbox-security-review.md](13-agent-s3-sandbox-security-review.md)** — its session lifecycle (DB-persisted `sandbox_sessions`, `settleSandboxSession`, `session-reaper` cron) was audited as missing on 2026-07-04 and is now closed, committed-tested, and live-verified against real Supabase. **S5 agent memory ✅ built** (write/search tool, org+agent-scoped, ZDR-gated, purge API — migration `20260703000001` pending apply). **On-behalf-of billing attribution ✅ built (2026-07-06, migration `20260706000001` pending apply + one manual key-flag UPDATE)** — closes a live misattribution the same audit found: agent-runner's single static platform key meant every agent run billed model/tool cost to whichever org owns that key, never the customer. See §9 for detail. Full as-built status + honest gaps: see the BUILD STATUS block in [12-agent-execution-stages.md](12-agent-execution-stages.md). Companion docs: **12** = task board · **13** = S3 sandbox security gate.

---

## 0. The one framing that drives every decision

**We are NOT building one general-purpose AI agent. We are building agent *infrastructure*** — a platform where *customers* build, configure, and run *their own* agents (like AWS Bedrock AgentCore / OpenAI Responses API, not like ChatGPT).

Consequence: **our job is a runtime that is correct, isolated, metered, and reliable — not a "smart" agent.** The accuracy of any given agent is the customer's responsibility (their prompt, model, tools). We provide the *levers* that make accuracy achievable (RAG/file-search, web-search with citations, evals, guardrails, tool-call validation).

| If it were "one agent" | What we're actually building |
|---|---|
| We pick the use case | The customer picks the use case |
| We tune accuracy | The customer tunes their own prompt/tools/model |
| We scale one workload | We scale thousands of *different* customer workloads |
| We own output quality | We own runtime correctness, isolation, metering, reliability |

---

## 1. Current state vs. target

**Today — `ai_agents` (the demo-grade chatbot).** See [app/api/ai-agents/[id]/route.ts](../app/api/ai-agents/[id]/route.ts) and [app/dashboard/services/ai-agents/](../app/dashboard/services/ai-agents/). Configure a persona = system prompt + one model + knowledge base + temperature → get a chat endpoint. **Single-turn RAG chatbot.** No tool loop, no code execution, no durable runs.

**Target — `agentcore` (Agents v2).** A real agent runtime: multi-step tool loops, hosted tools (web search, file search, code interpreter), durable long-running runs, per-step billing, step traces.

The new schema is named **`agentcore`** deliberately to avoid colliding with the existing `agents`/`ai_agents` product. The v1 chatbot keeps working; v2 is a sibling. Position them clearly in the dashboard: **v1 = hosted chatbot/assistant; v2 = autonomous multi-step agents.**

### What we reuse (already in the repo — not building from zero)

| Asset | Path | Role in agents |
|---|---|---|
| Claim-runner framework | [workers/runner-core](../workers/runner-core) | `agent-runner` is one more instantiation (like `eval-runner`) |
| Tool/function-calling guarantees | [workers/inference/src/lib/tool-guarantees.ts](../workers/inference/src/lib/tool-guarantees.ts) | schema-validate tool_calls + one repair retry, graceful degrade |
| Structured outputs | [workers/inference/src/lib/structured-output.ts](../workers/inference/src/lib/structured-output.ts) | forced JSON output for tool args / final answers |
| Brand-scrub | [workers/inference/src/lib/brand-scrub.ts](../workers/inference/src/lib/brand-scrub.ts) | extend to tool outputs, citations, stream/log surfaces |
| Model routing (OpenRouter proxy) | [workers/inference/src/lib/model-routing.ts](../workers/inference/src/lib/model-routing.ts) | each model turn = internal `/v1` call, already brand-hidden |
| pgvector KBs | [lib/services/database/operations/pgvector.ts](../lib/services/database/operations/pgvector.ts) | file_search tool |
| BYOK + ZDR | [lib/inference/crypto.ts](../lib/inference/crypto.ts), [lib/inference/orgs.ts](../lib/inference/orgs.ts) | customer's own LLM key; ZDR gates memory |
| Guardrails / evals | Phase 3 / Phase 4 (shipped) | accuracy + safety levers |

---

## 2. Scope decisions (locked)

**Manager directive (2026-07-01): CUT for complexity —**

- ❌ **Service E — Computer-use / browser automation.** Removes the entire browser slice (the original design's Service E, ~5 ew) and the platform's biggest security + cost surface. The sandbox shrinks to **code-interpreter only** (no headless Chromium, no vision-action loop, no session recordings).
- ❌ **Service F — Tool/function registry** (the customer-facing Postgres catalog of reusable tools). Custom tools now come via inline per-request function webhooks + (optionally) MCP.

**Net effect:** ~28 ew → **~18 ew**, and the two removed pieces were the riskiest/most complex.

**Still open (defaulted to the simpler choice in this doc):** whether to keep **Service D — MCP hosting**. This plan defaults MVP to **hosted tools + inline function webhooks only**, and slots MCP as an optional fast-follow (S4). See §15 Open Decisions.

---

## 3. How customers use it

Two API shapes (OpenAI-Responses-compatible so existing SDKs work):

**A. Stateful "Responses" call** — one request, we run the whole loop server-side:
```http
POST /v1/responses
{ "input": "Find our top 3 competitors' pricing and tabulate it",
  "tools": [{ "type": "web_search" }, { "type": "code" }],
  "previous_response_id": "resp_abc",   // stateful chaining
  "stream": true }
```

**B. Defined durable agent** — configure once, invoke many times, runs survive minutes:
```http
POST /v1/agents/{id}/runs  → 202 { "run_id": "run_..." }   // poll or stream
```

**All runs are durable (v1 decision, §6):** the gateway validates + auth/spend-checks, then enqueues a run and returns `202 + run_id`. The customer streams step events (`GET .../stream`) or polls. `agent-runner` executes every loop — there is no inline-in-Worker path in v1.

**Two audiences, both served:** developers via the API; non-developers via the dashboard (create agent → pick model → attach tools/KBs → test in playground; the shell already exists).

### Use cases
- **Research/analyst agents** — web search + code interpreter → reports, competitive analysis
- **Support agents over private docs** — file search (RAG) over their KB
- **Data agents** — code interpreter runs pandas over uploaded CSVs
- **Internal tool orchestration** — inline function webhooks (or MCP) call the customer's own APIs

### Limitations (state these to customers)
1. Accuracy depends on the customer's model + prompt + tools; agents hallucinate and loop. Levers: `max_steps`, evals, guardrails, tool-call validation.
2. Cost runaway → mitigated by pre-flight estimate + `max_steps` + **mid-run balance re-check** + **required `max_cost_cents`**.
3. Sandbox (code interpreter) is the largest new security boundary → gated on one security review.
4. Durable runs are async (202 + poll/stream), not instant.

---

## 4. Plugin model (after cutting Service F)

There are **two different "tool registries"** — we cut one, keep the other:

| | **Internal tool map** (code) | **Customer tool/function registry** (Service F) — *REMOVED* |
|---|---|---|
| What | Our code switch of hosted-tool implementations | Postgres catalog where customers store reusable tools |
| Who adds | **We do**, as demand grows ("add tools as we need") | Customers via CRUD |
| Product feature? | No — a code pattern | Yes — this is what's cut |
| Status | **Stays** | **Gone** |

**"Add tools as we need"** = the internal map, untouched by the cut.

### Customer extensibility now = 2 (optionally 3) channels

```
   customer's        1. HOSTED TOOLS (we build & operate)
   agent request        web_search · file_search · code — attach by name
        │
   tools:[...] ──▶   2. INLINE FUNCTION TOOLS (per-request)
                        customer sends {name, json_schema, webhook_url};
                        agent calls it → we POST their webhook → feed result back.
                        NOT stored (standard OpenAI-style function calling).

                    3. MCP SERVERS (Service D — OPTIONAL, S4)
                        customer points at an MCP server; we host it,
                        discover tools, agent binds by name. The "durable plugin" path.
```

What cutting Service F costs: customers can't *save/version* custom tools server-side — they re-declare the schema each request (exactly how the OpenAI function-calling API already works, so not a regression customers will notice). Reusable/durable custom tooling, if needed, is the job of **MCP**.

---

## 5. Third-party APIs — mandatory / optional / offer-both

**Mandatory (only one true new upstream):** a **web-search API**. Everything else is owned-substrate or reuse (the LLM is just the existing OpenRouter path).

| Need | Decision | Provider(s) |
|---|---|---|
| Web search | **Proxy**, brand-hidden behind a citation envelope | **Brave** (default) + **Exa** (premium, opt-in) via a `WebSearchProvider` interface — offer both |
| LLM (model turns) | **Reuse** existing `/v1` (OpenRouter) **+ BYOK** | catalog models or customer key |
| Embeddings (file_search) | **Reuse** catalog embedding models **+ BYOK** | own + optional customer key |
| Code interpreter | **Build** — never proxy customer code | Firecracker/gVisor microVM on own k8s pool |

**Offer both where cheap:** web search (Brave + Exa), LLM (catalog + BYOK), embeddings (catalog + BYOK). Each "both" is one extra adapter behind a stable interface.

**Never proxy:** anything that executes customer/model code (sandbox) or stores customer data (KBs, memory).

---

## 6. Architecture — modular, testable, low-complexity

Four clean layers, each independently testable. **The design rule that keeps it simple: the agent loop is a pure function that takes a `dispatchTool` callback.** The runner and tests each inject their own `dispatchTool`. One loop, one injection site — no inline/durable drift.

> **DECIDED (2026-07-01, verified against the codebase): v1 is DURABLE-ONLY.** The inline-in-Worker path is dropped for v1. Verification showed the Worker has **no SELF service binding** ([wrangler.toml](../workers/inference/wrangler.toml)) and `chatCompletions` is a Hono `Handler` (not a plain callable), and the RAG module ([lib/ai/rag.ts](../lib/ai/rag.ts)) is a Next/Node module the Worker can't import directly. Both frictions vanish in the Node `agent-runner`, which can import RAG and call the gateway freely. The only cost is higher latency on short runs (202 + poll instead of inline stream) — acceptable for v1. The gateway route stays *thin*: validate → auth/spend/ratelimit → always enqueue a durable run.

```
┌─ Gateway (CF Worker)  ─ workers/inference/src/routes/responses.ts
│    thin: validate → auth/spend/ratelimit (reuse existing chain) → enqueue durable run → 202
│
├─ Agent-loop core (PURE, no I/O)  ─ lib/agent/loop.ts   ← the testable heart
│    step loop: (messages, tools, dispatchTool) → next action. No network, no DB.
│
├─ Tool adapters  ─ lib/agent/tools/{web-search,file-search,code,function,mcp}.ts
│    one interface: run(args, ctx) → { output, metering }.  Each tested in isolation.
│    file_search reuses lib/ai/rag.ts (imported by the Node runner, NOT the Worker).
│
└─ Runner (k8s durable)  ─ workers/agent-runner/   ← clone eval-runner shape
     bootRunner({ scan, handler }) from runner-core; handler calls the agent-loop core.
```

> **AS-BUILT (2026-07-01):** the pure core did **not** land in `lib/agent/` as sketched above — it lives in a dedicated workspace package **`workers/agent-core`** (`@ahura/agent-core`), mirroring `runner-core`. Reason: durable-only means the k8s runner (Docker build context = `workers/`) must import it, and a leaf package with zero deps is the clean, drift-free way to share it with the runner, the CF Worker gateway, and (later) the Next control plane. So:
> - **Pure core** (loop, messages, tool *interface* + types) → `workers/agent-core/src/{loop,messages,types,tools/types}.ts`.
> - **Tool adapter *implementations*** (web-search→Brave, file-search→pgvector, code→sandbox) do I/O, so they are **runner-side** (`workers/agent-runner/src/tools/*`, S2), not in the pure package.
> - **`lib/agent/` barrels** re-exporting `@ahura/agent-core` get added when the first Next-side consumer needs them (S1.4 control plane / S1.5 UI) — not before.

### The one interface everything hangs off
```ts
// lib/agent/tools/types.ts
export interface AgentTool {
  type: string; // "web_search" | "file_search" | "code" | "function" | "mcp"
  run(args: unknown, ctx: RunCtx): Promise<{
    output: unknown;
    metering: { units: number; unitLabel: string };
  }>;
}

// lib/agent/tools/index.ts — the internal map ("add tools as we need")
export const HOSTED_TOOLS: Record<string, AgentTool> = {
  web_search:  webSearchTool,
  file_search: fileSearchTool,
  code:        codeInterpreterTool,
  // next tool → add one file + one line here; loop/gateway/runner unchanged
};
```

### New deployables (minimal)
1. **`agent-runner`** — k8s Node service, one more `bootRunner()` instantiation of [runner-core](../workers/runner-core) (mirror [workers/eval-runner](../workers/eval-runner)). BullMQ + Postgres atomic claimer over `agentcore.runs WHERE status='queued'`, heartbeat + reaper. **Single replica fine for v1** (per [boot.ts](../workers/runner-core/src/boot.ts) — concurrency is per-process; sharding later).
2. **`sandbox-pool`** — k8s privileged node pool handing out **code-interpreter** microVM sessions (browser removed), hard wall-clock/memory/disk caps. Only needed at S3.

CF Worker, Next.js control plane, and CF cron are **reused** — new routes/sweeps only.

---

## 7. Data model — `agentcore` schema

Migration `supabase/migrations/2026XXXXXXXXXX_agentcore_schema.sql`, following the repo's RLS/grant/trigger conventions (cf. `20260614000005`). **NOTE: per repo policy, write the SQL and stop — the user runs all migrations.**

Changes from the original design: **`agentcore.tools` table removed** (Service F cut); **`sandbox_sessions.kind` is `code` only** (browser cut); **no `recording_r2`**.

```sql
CREATE SCHEMA IF NOT EXISTS agentcore;

-- Agents: reusable definition
CREATE TABLE agentcore.agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  model         TEXT NOT NULL,                 -- catalog model id
  system_prompt TEXT,
  tools         JSONB NOT NULL DEFAULT '[]',   -- [{type:'web_search'|'file_search'|'code'|'function'|'mcp', ...}]
  memory_policy JSONB NOT NULL DEFAULT '{}',   -- {enabled, scope, max_items} (S5, optional)
  guardrail     TEXT NOT NULL DEFAULT 'warn',  -- reuses gateway guardrail enum
  max_steps     INT  NOT NULL DEFAULT 12 CHECK (max_steps BETWEEN 1 AND 100),
  max_cost_cents INT NOT NULL DEFAULT 100 CHECK (max_cost_cents > 0),  -- REQUIRED cost ceiling
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

-- Runs: one durable agent invocation
CREATE TYPE agentcore.run_status AS ENUM
  ('queued','running','requires_action','completed','failed','cancelled','expired');

CREATE TABLE agentcore.runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  agent_id      UUID REFERENCES agentcore.agents(id) ON DELETE SET NULL,
  api_key_id    UUID,                          -- inference.api_keys.id (billed key)
  billing_user_id UUID NOT NULL,               -- org payer, resolved at create
  previous_response_id UUID REFERENCES agentcore.runs(id),
  status        agentcore.run_status NOT NULL DEFAULT 'queued',
  input         JSONB NOT NULL,
  output        JSONB,
  step_count    INT  NOT NULL DEFAULT 0,
  cost_cents    NUMERIC(14,4) NOT NULL DEFAULT 0,   -- running total, for mid-run guard
  max_cost_cents INT NOT NULL,                       -- copied from agent/request
  claimed_by    TEXT,
  heartbeat_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 minutes',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_runs_claim ON agentcore.runs (status, created_at)
  WHERE status IN ('queued','running');

-- Run steps: the trace + per-step billing ledger
CREATE TABLE agentcore.run_steps (
  id           BIGSERIAL PRIMARY KEY,
  run_id       UUID NOT NULL REFERENCES agentcore.runs(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL,
  step_index   INT  NOT NULL,
  step_type    TEXT NOT NULL,                  -- 'model'|'web_search'|'file_search'|'code'|'function'|'mcp'
  tool_name    TEXT,
  input_tokens INT, output_tokens INT,
  units        NUMERIC(12,4),
  unit_label   TEXT,
  cost_cents   NUMERIC(14,4) NOT NULL DEFAULT 0,
  latency_ms   INT,
  status       TEXT NOT NULL DEFAULT 'success',
  detail       JSONB,                          -- args/result preview (brand-scrubbed), R2 ref for big payloads
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, step_index)
);
CREATE INDEX idx_run_steps_run ON agentcore.run_steps (run_id, step_index);

-- Sandbox sessions (code interpreter only; billed per second)
CREATE TABLE agentcore.sandbox_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID REFERENCES agentcore.runs(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'code' CHECK (kind = 'code'),  -- browser removed
  state         TEXT NOT NULL DEFAULT 'provisioning'
                CHECK (state IN ('provisioning','running','stopped')),
  per_sec_cents NUMERIC(10,6) NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ,
  stopped_at    TIMESTAMPTZ,
  idle_deadline TIMESTAMPTZ
);

-- Agent memory (pgvector) — S5, optional
CREATE TABLE agentcore.agent_memories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL,
  agent_id   UUID NOT NULL REFERENCES agentcore.agents(id) ON DELETE CASCADE,
  scope_key  TEXT NOT NULL,
  content    TEXT NOT NULL,
  embedding  vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_mem_scope ON agentcore.agent_memories (agent_id, scope_key);

-- MCP servers (Service D — OPTIONAL, only if S4 kept)
CREATE TABLE agentcore.mcp_servers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  source        TEXT NOT NULL,                 -- 'image'|'url'|'curated'
  deployment_id UUID,                          -- reuses inference.deployments
  endpoint_url  TEXT,                          -- internal serving url (never customer-visible)
  visibility    TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  tool_schemas  JSONB NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'provisioning',
  hourly_cents  INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

-- Billing spine: always-on hosted MCP server (only if S4 kept)
CREATE TABLE billing.active_agent_mcp (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id     UUID NOT NULL,                -- agentcore.mcp_servers.id
  hourly_rate    NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','paused','grace','terminated')),
  last_billed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id)
);
```

**RLS:** enable on all `agentcore.*` (+ `billing.active_agent_mcp`); `authenticated` gets `SELECT` gated by `inference.is_org_member(org_id)`; `service_role` gets `ALL`. Runner + gateway use service-role and bypass RLS, identical to today.

---

## 8. API surface

### Customer gateway (`/v1/*`)
```http
POST /v1/responses                     # stateful auto tool-loop (durable → 202 + run_id)
POST /v1/agents/{id}/runs              # durable run  → 202 { run_id }
GET  /v1/agents/runs/{id}             # status + full step trace
GET  /v1/agents/runs/{id}/stream      # SSE step events
POST /v1/agents/runs/{id}/cancel
POST /v1/tools/web_search             # standalone hosted-tool primitives
POST /v1/tools/code
```
Inherits the existing edge chain (`authMiddleware → spendCheckMiddleware → rateLimitMiddleware`) unchanged.

### Control plane (`/api/agents/*` on Next.js)
```
POST/GET/PATCH/DELETE /api/agents          # agent CRUD (RBAC: developer+ to write)
GET  /api/agents/runs/:id/trace            # step waterfall for the dashboard trace viewer
# Internal cron sweeps (guarded by X-Ahura-Internal-Token, mirror serving-pod-watchdog):
/api/agents/internal/session-reaper        # stop code sessions past idle_deadline, settle
/api/agents/internal/run-reaper            # expire runs past expires_at / stale heartbeat
```
(MCP endpoints `/api/agents/mcp*` only if S4 kept.)

---

## 9. Billing

One **unified usage-event pipeline** (do NOT invent a parallel queue — the critique explicitly kills that). Model steps priced by the existing chat path; tool steps priced by `{units, unitLabel}`.

| Unit | Price basis | Mechanism |
|---|---|---|
| Model steps | per-token | usage-event → `inference.usage` (reuses chat path) |
| Web search | per search + markup | usage-event |
| File search | per query + embed tokens | usage-event |
| Code interpreter | per CPU-second | `settleSandboxSession` on stop |
| Function webhook | per call (thin) | step event |
| Hosted MCP (always-on, if S4) | per CPU-hour | `billing.active_agent_mcp` hourly cron + 7-day grace |

**Cost-runaway defense (three gates):** pre-flight `estimateMaxCost` at run create → `max_steps` cap → **runner re-checks `run.cost_cents` vs `max_cost_cents` every K steps** and hard-stops. `max_cost_cents` is **required**. This is also the platform's first non-zero-markup service (search resale + sandbox compute) → needs finance sign-off and must sit on the Phase-0 hardened billing RPCs.

**Hard prerequisite:** Phase-0 billing completeness/hardening. Nothing agent-related charges money until the metering/markup/grace gaps are closed (billing currently flagged broken).

**Closed since (2026-07-06) — on-behalf-of billing attribution, found by the 02/11/12/13 doc audit:** agent-runner authenticates every model-turn + tool-usage-report call with one static `ahu_...` API key. Before this fix, the gateway's auth middleware resolved `orgId` from *that key's own org* — so every agent run across every customer billed its model tokens to the platform's own internal org, a live misattribution, not a future gap. Tool costs (web_search/code/function) had it worse: they never reached the real `USAGE_EVENTS` pipeline at all, only `agentcore.run_steps`.

Fix (migration `20260706000001_agent_on_behalf_of_billing.sql`, pending apply + a manual `UPDATE ... SET is_internal_service = TRUE` once the platform key's row is identified):
- `inference.api_keys.is_internal_service` flags the platform key's row. When a flagged key is used, the gateway's `authMiddleware` (`workers/inference/src/middleware/auth.ts`) requires `X-Ahura-On-Behalf-Of-Org` and resolves `orgId`/caps from `inference.lookup_org_billing(org_id)` instead of the key's own org — validated against a real org row, fails closed on an unknown org.
- `gateway.ts`'s `callModelTurn`/`embedText` now send that header (threaded from `run.org_id`/`ctx.orgId`), fixing the model-turn misattribution.
- New `POST /v1/agent-tool-usage` ingress (auth-only, no spend/rate-limit — it reports cost already incurred) lets agent-runner bridge tool cost into the same pipeline: `persistStep` posts each tool step with a recognized unit label via `tool-usage-report.ts`, which re-shapes it into a real `UsageEvent` against the `agent/*` pseudo-catalog rows, still PENDING_FINANCE placeholder rates — this is correct metering at whatever rate finance sets, no code change needed when it lands.
- 22 new committed tests (2 gateway header assertions, 6 `tool-usage-report.ts`, 7 `on-behalf-of.ts` helpers + `lookupOrgBilling`, 7 the new route handler). Full gate green across agent-core (18) / agent-runner (86) / inference (77) / root Next (0 errors), independently re-verified.
- **Live-verified end-to-end (2026-07-06).** Migration applied; the platform key was identified by hashing the literal value `agent-runner`'s local `.run-local.sh` exports (`ahu_live_...`) and matching it against `inference.api_keys.key_hash` — it turned out to be the `"phase-5"` key in the dev org itself (no dedicated internal/platform org exists in this local setup; worth minting one properly in a real deployed environment to avoid ever repurposing a real org's key). Flagged `is_internal_service = TRUE` on that row.
  - **Real bug found by this live test that no unit test (all using fakes) had caught:** `inference.usage.api_key_id` is a plain UUID column, but every existing route (`chat-completions.ts`, `embeddings.ts`, `messages.ts`, `lib/gateway.ts` — 8 call sites total) stamped `apiKeyId: auth.keyId` directly. For an on-behalf-of request `auth.keyId` is `obo:{orgId}` — not a UUID — so the consumer's `INSERT` failed outright (`invalid input syntax for type uuid`), silently dropping every on-behalf-of usage event. Caught by literally curling `/v1/chat/completions` with the header and watching the worker's own error log, not by any fake-backed test. Fixed by adding a second field to `AuthContext`, `usageApiKeyId` (always a real UUID — the real key id for normal keys, `OBO_API_KEY_ID` for on-behalf-of), keeping `keyId` itself as the `obo:{orgId}` string only for rate-limit-bucket identity and the route guard. Updated all 8 call sites + `agent-tool-usage.ts` to stamp `usageApiKeyId`. 1 new regression test proving the emitted event's `apiKeyId` is a valid UUID and never the raw `keyId`.
  - **Full live proof, real DB rows, this session:** ran a real `test-memory` agent (5 real steps: auto-recall `memory_search` → model → explicit `memory_write` → explicity `memory_search` → final model answer) against the actually-running local stack. All 3 tool-cost rows, all 3 embedding-call rows, and all 3 chat/model-turn rows landed in `inference.usage` under the real customer org with `api_key_id = OBO_API_KEY_ID` — not the platform key's own attribution. 10/10 live assertions passed.

**Closed since (2026-07-06, same pass) — the remaining 3 of 6 agent tool types.** `file_search`/`memory_write`/`memory_search` had local cost-ceiling tracking since S2.1/S5, and — contrary to what I first assumed — their `agent/*` catalog rows already existed too (`agent/file-search` + a single shared `agent/memory` row carrying both `cents_per_memory_write`/`cents_per_memory_search`, migration `20260703000002_agentcore_tool_pricing_gap_fill.sql`, committed 3 days before this pass). What was genuinely missing was the `computeUnitCost()`/`isPerUnitLabel` cases in `usage.ts` — those never existed regardless of the catalog rows, so these 3 labels silently priced at 0. **Self-caught error:** my first attempt at this wrote a NEW migration (`20260706000002`) that duplicated `agent/file-search` (different placeholder rate) and invented two new ids `agent/memory-write`/`agent/memory-search` that nothing else referenced — found via a live catalog query during a file-by-file SQL review, before it was ever applied. Deleted that migration; fixed `agent-tool-usage.ts`'s `TOOL_TYPE_TO_MODEL_ID` so both memory actions point at the existing single `agent/memory` row, matching what `lifecycle.ts`'s `fetchToolRates` (which merges pricing keys across all `agent/%` rows, not by specific row identity) already expected. Only `usage.ts`'s consumer-side cases were actually new; no new migration was needed. `memory_search` also covers the runner's automatic pre-loop recall (same unit label). 6 more committed tests (3 consumer pricing, 3 route mapping, corrected to expect `agent/memory` for both memory actions); full gate re-verified green.

---

## 10. Scaling & concurrency

| Surface | Concurrency | Ceiling |
|---|---|---|
| Gateway (enqueue only) | ~unlimited (edge Worker), returns 202 fast | KV/Postgres write rate |
| Durable runs (all agent work) | `maxConcurrentJobs` × replicas; Postgres atomic-claim prevents double-claim | single Redis |
| Code sandbox | tens of concurrent microVMs on 2 nodes | **microVM pool = true ceiling** |

Since v1 is durable-only, *every* run goes through `agent-runner` — the Worker just enqueues. That makes the runner the throughput unit.

**How to scale (in order):** add `agent-runner` replicas (claim pattern makes it safe) → grow the sandbox pool (gated on the owned B300/H200 fleet). **Architecturally scalable; the real bottleneck is ops** (single Redis, single control-plane VM, 2 nodes) — an infra-hardening track that runs in parallel, not an agent-code problem.

---

## 11. Security & accuracy

**Security (biggest new boundary = code sandbox):** gVisor/Firecracker isolation, no cloud-metadata access, egress allowlist, per-session net namespace, hard wall-clock/memory/disk caps. **One shared security review before any customer code executes — gate S3.** Brand-scrub must extend from JSON errors to **tool outputs, citations, `run_steps.detail`, and stream/log surfaces** (highest-leakage area).

*As-built (2026-07-03):* the S3 `code` tool + sandbox pool are **hard-gated behind `SANDBOX_ENABLED` (default false everywhere)** — the real executor stays off until **[13-agent-s3-sandbox-security-review.md](13-agent-s3-sandbox-security-review.md)** is signed off. **SSRF guard shipped for S2 function webhooks** (`workers/agent-runner/src/tools/ssrf.ts`): the runner rejects private/link-local/cloud-metadata targets *before* any webhook call — closing the "runner POSTs to a customer-supplied URL" vector.

**Accuracy (customer's job; we provide levers, most already shipped):** file_search (grounded RAG w/ citations), web_search citations, tool-call validation + repair ([tool-guarantees.ts](../workers/inference/src/lib/tool-guarantees.ts)), structured outputs, evals (Phase 4), guardrails (Phase 3), `max_steps`. Verification for customers = the step trace + dashboard trace viewer + evals against a golden dataset.

---

## 12. Revised slice plan (E + F removed)

> **Task-level breakdown:** each slice below is decomposed into small, independently-testable stages/tasks (UI + API + runner, contracts-first, 3 parallel tracks) in the companion **[12-agent-execution-stages.md](12-agent-execution-stages.md)** — use that as the ticket board.

Restructured for **durable-only** (§6): the old "S1 inline loop, then S2 add durability" split is gone — durability is in S1 because it's the only path. Old S1+S2 merge into the new S1.

| Slice | Scope | ew | Gate |
|---|---|---|---|
| **S1** | `agentcore` schema + `agent-runner` (clone eval-runner: claimer/lifecycle/reapers) + durable `/v1/responses` (model-only loop, `previous_response_id` chaining) + step trace + usage events + dashboard agent CRUD | 5–6 | Phase-0 billing |
| **S2** | **file_search** (via `lib/ai/rag.ts` in the runner) + **web_search** (Brave default, brand-scrubbed citations) + **inline function tools** (webhook dispatch) | 4 | S1 |
| **S3** | `sandbox-pool` + **code_interpreter** (CPU only) + `settleSandboxSession` + idle reaper | 5 | **security review** |
| **S4** | *(optional)* MCP hosting + private registry + `active_agent_mcp` billing | 4 | S1 + decision |
| **S5** | *(optional)* agent memory (pgvector) — ZDR-gated, purge API | 2 | S1 |
| ~~—~~ | ~~Browser automation (was Service E)~~ | — | **REMOVED** |
| ~~—~~ | ~~Tool/function registry (was Service F)~~ | — | **REMOVED** |

**Critical path:** S1 → S2 → S3. **v1 GA cut line:** S1 + S2 ("durable stateful responses + hosted retrieval/web tools + function webhooks"). Code interpreter is a fast-follow behind the security gate. **Total ~14–16 ew** vs the original 28.

**Cross-cluster deps:** billing hardening lands alongside S1; file_search improves once the rerank endpoint ships (slot rerank as a tool if available); S3 sandbox lands after the multi-tenancy hardening review; the sandbox pool is a natural first tenant of the owned fleet.

---

## 13. Test discipline (every slice)

- **Agent-loop core** → pure unit tests with a fake `dispatchTool`; test the full multi-step loop with zero network (Vitest, per [vitest.config.ts](../vitest.config.ts)).
- **Each tool adapter** → unit test against a mocked upstream (Brave/pgvector/sandbox).
- **Gateway route** → route test (as chat-completions already does).
- **Runner** → atomic-claim + heartbeat reuse eval-runner's tested path.
- **Billing settle** → idempotency-via-atomic-transition unit test (only a running session/run transitions → no double charge).
- **One e2e happy path** per slice + **brand-scrub grep** over every new write path + **spend-cap test** (hard-cap 402 fires *before* work starts) + **cost-ceiling test** (runaway loop cut mid-run).

---

## 14. Full Q&A (design decisions captured)

**Third-party APIs**
- *Minimum external APIs?* One: web search. LLM is the existing OpenRouter path.
- *Brave vs Exa vs Tavily/Serper — both?* Yes — Brave (default) + Exa (premium) behind a `WebSearchProvider` interface, normalized citation envelope hides the upstream.
- *Code interpreter / browser — buy or build?* Build (own microVMs). Never proxy customer code. Browser is cut entirely.
- *Where offer both build+buy?* Web search (Brave+Exa), LLM (catalog+BYOK), embeddings (catalog+BYOK).
- *Never proxy?* Code execution, KBs, memory.

**Plugins**
- *What are plugins here?* Hosted tools (we operate), inline function webhooks (customer, per-request), MCP (customer, durable — optional).
- *Who adds tools?* We add hosted tools on demand (internal code map). Customers add via inline webhooks / MCP. The removed Service F was the *stored* customer catalog.
- *"Add tools as we need" — how?* One `AgentTool` adapter file + one line in `HOSTED_TOOLS`. Loop/gateway/runner unchanged.
- *What did cutting F cost?* Customers re-declare custom tool schemas per request (standard OpenAI behavior). Durable custom tooling → MCP.

**UX / usage**
- *API-only or dashboard?* Both; dashboard shell exists.
- *Confusion with v1 chatbot?* Different schema (`agentcore`), different nav section, clear positioning.
- *Sync or async?* Auto-selected by cost/tools, not by the customer.

**Tenancy / security**
- *Biggest new boundary?* Code sandbox. One security review before S3.
- *Isolation?* RLS via `is_org_member`; runner/gateway service-role.
- *Brand leakage?* Extend brand-scrub to tool outputs/citations/logs/streams.

**Accuracy**
- *Whose job?* Customer's; we provide levers (RAG, citations, evals, guardrails, tool validation, `max_steps`).
- *Failure modes + mitigations?* Hallucination→grounding; bad args→repair loop; loops→`max_steps`+`max_cost_cents`; silent bad output→evals.

**Scale**
- *How many concurrent?* Inline: thousands (edge). Durable+sandbox: tens (microVM pool) until owned fleet.
- *Scalable?* Yes architecturally; bottleneck is ops (single Redis/VM/2 nodes).
- *Shard the runner now?* No — single replica; claim pattern makes replicas trivial later.

**Billing**
- *Metering shape?* Unified usage events (no parallel queue).
- *Stop runaway?* Pre-flight estimate + `max_steps` + mid-run re-check + required `max_cost_cents`.
- *Markup?* First non-zero-margin service; needs finance sign-off + hardened billing RPCs.

**Data/memory**
- *Memory in v1?* No — stateful runs via `previous_response_id` first; memory is optional S5.
- *Privacy?* ZDR agents skip memory writes; purge API for DPDP/GDPR.

**Sequencing** (durable-only reshaped the slices — see §12)
- *Smallest shippable?* S1 = schema + `agent-runner` + durable `/v1/responses` (model-only loop) + step trace + usage events + dashboard CRUD. Because v1 is durable-only, the runner is in S1 (it can't be deferred to a separate "add durability" slice).
- *Order?* S1 → S2 (file_search + web_search + function webhooks) → [security gate] → S3 (sandbox + code interpreter) → (S4 MCP / S5 memory optional).
- *Hard prereq?* Phase-0 billing hardening.

---

## 15. Open decisions (need product/business sign-off)

1. **Keep MCP hosting (S4)?** Default here = cut for MVP (plugins = hosted tools + inline webhooks). Keep only if customers need durable/reusable custom toolsets now.
2. **Search provider** — Brave only, or Brave + Exa from day one? (Recommend interface now, Brave first.)
3. **Sandbox timing** — build Firecracker pool on current RunPod-backed k8s now, or wait for the owned fleet?
4. ~~**Always-durable vs keep inline fast path?**~~ **RESOLVED (2026-07-01): durable-only for v1** — see §6 and §16. Revisit only if short-run latency becomes a customer complaint.
5. **v1/v2 branding** — separate product vs "advanced mode" of existing AI Agents.

### Known as-built gaps (tracked, not blocking S1/S2)
- ✅ **Function-tool builder UI — CLOSED (2026-07-03).** The dashboard now has a "Custom functions" form (name + webhook URL + description + params JSON Schema + optional signing secret) in **both** the new-agent builder and the agent Settings tab (`buildFunctionTools`/`functionToolsOf` in `_constants.ts`).
- ✅ **Webhook HMAC signing — CLOSED (2026-07-03).** When a function tool carries a `secret`, the runner HMAC-SHA256 signs each POST Stripe-style (`sha256(secret, "{ts}.{body}")`) via `X-Ahura-Signature` + `X-Ahura-Timestamp` (`tools/function.ts`). Replay-bound; secret never logged or echoed into the trace.
- **`web_search` unverified live** — unit-tested, but no Brave key is configured, so it hasn't run against the real upstream end-to-end. (Only remaining open item.)
- **Tool usage-emit deferred** — tool steps record metering on `run_steps` (trace + mid-run cost guard) but don't yet emit `UsageEvent`s; the Node runner can't reach the CF `USAGE_EVENTS` queue, so this needs a gateway usage-ingress and lands with Phase-0 billing (nothing agent-related charges until then, §9).

---

## 16. Reuse-claim verification (2026-07-01, read-only pass against the codebase)

Before committing to the estimates, the five load-bearing reuse claims were checked against the actual repo. Three hold cleanly; two had caveats that drove the durable-only decision (§6).

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `agent-runner` = one more `runner-core` instantiation | ✅ **Confirmed** | [eval-runner/src/index.ts](../workers/eval-runner/src/index.ts) is a clean `bootRunner({ scan, handler })` importing `@ahura/runner-core`. Exact template. `scan.ts` returns `EnqueueRequest` with `jobId = row.id` (dedupe); `lifecycle.ts` does the atomic `queued→running` claim. |
| 2 | Unified usage-event pipeline; no parallel queue | ✅ **Confirmed** | One `USAGE_EVENTS` queue with `numUnits`/`unitLabel`/`modality` in [types.ts](../workers/inference/src/types.ts); [consumers/usage.ts](../workers/inference/src/consumers/usage.ts) prices per-unit labels via a switch. **No `AGENT_STEP_EVENTS` exists** — agent tool steps just emit `UsageEvent` with a new `unitLabel` + a catalog price row. |
| 3 | Loop calls "our own `/v1/chat/completions` via service bindings" | ⚠️ **Gap → drove durable-only** | **No SELF service binding** in [wrangler.toml](../workers/inference/wrangler.toml) (only KV/DO/queue/R2); `chatCompletions` is a Hono `Handler`, not a plain callable. Inline-in-Worker would need a chat-core refactor or a new SELF binding. The Node runner calls the gateway over normal HTTP (like eval-runner already does) — no gap. |
| 4 | file_search reuses existing pgvector RAG | ⚠️ **Partial → runner-layer only** | RAG exists ([lib/ai/rag.ts](../lib/ai/rag.ts)) but it's a **Next/Node module** (EmbeddingsService + in-memory hybrid re-rank over a Supabase vector RPC), not importable from the CF Worker. The Node `agent-runner` imports it directly; the Worker never needed to. |
| 5 | Billing spine: `active_*` + grace + balance guard | ✅ **Confirmed** | [lib/billing/credits.ts](../lib/billing/credits.ts) has `addActiveVectorCollection`, `hasSufficientBalance`, `computeProratedCharge`; `GRACE_SERVICE_TABLES` in [constants.ts](../lib/billing/grace/constants.ts). `active_agent_mcp` follows the pattern exactly. |

**Conclusion:** the framework, metering, and billing reuse are real. The only two soft spots (3, 4) were both about the inline-in-Worker path and both disappear under durable-only — which is why v1 drops inline. Migration conventions to follow (from [20260630000001_eval_service.sql](../supabase/migrations/20260630000001_eval_service.sql)): `CREATE TABLE IF NOT EXISTS`, `public.gpu_set_updated_at()` trigger, RLS enable + `GRANT SELECT authenticated / ALL service_role`, policies wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`, membership via `inference.is_org_member(org_id)`.
