# Agent Infrastructure Platform — Cluster Design

A new service cluster that evolves AhuraCloud beyond the demo-grade Agents chatbot into a stateful, tool-running agent platform: a Responses-style API with hosted tools, a managed agent runtime, MCP hosting + private registry, computer-use/browser automation, a tool/function registry, agent memory, and A2A — all with multi-step traces and per-step billing. The design matches the existing 4-deployable shape (CF Worker gateway / Next.js control plane / k8s runners / cron) and the billing spine.

---

## 1. Services & customer value

This cluster ships as a brand-less sibling under `/services/agents/*` and `api.ahurasense.com/v1/agents/*`. Seven distinct services:

| # | Service | What the customer buys | Competitor reference |
|---|---|---|---|
| A | **Responses API** (`/v1/responses`) | A stateful, OpenAI-`responses`-compatible endpoint: server-stored conversation state (`previous_response_id`), built-in hosted tools, and automatic multi-turn tool-call loops. Customer sends one request; we run the agent loop server-side until a final answer, billing per step. | OpenAI Responses API; Anthropic Messages w/ server tools |
| B | **Hosted tools** | Three managed tools any agent can attach with one line: **web search** (grounded retrieval w/ citations), **file search** (RAG over their existing vector collections / Agent KBs), **code interpreter** (sandboxed Python). No infra to run. | OpenAI hosted tools; Bedrock AgentCore Code Interpreter & Browser |
| C | **Agent runtime / orchestration** (`/v1/agents/{id}/runs`) | A durable, long-running agent engine: define an agent once (model, system prompt, tool set, memory policy, guardrails) and invoke it; runs survive minutes-to-hours, resume after tool waits, stream step events. | Bedrock AgentCore Runtime; Vertex Agent Engine; LangGraph Platform |
| D | **MCP hosting + private registry** | Upload/point at an MCP server; we host it as a managed serverless endpoint with auth, and publish it to a **private org registry** so every agent can discover + bind tools by name. Plus a curated public registry of vetted connectors. | AWS MCP registry; Smithery; Anthropic MCP connectors |
| E | **Computer-use / browser automation** | Per-run isolated headless browser ("a computer") an agent drives via a vision-action loop: navigate, click, type, extract. Session recording + DOM/screenshot trace. | Bedrock AgentCore Browser; Browserbase; OpenAI Operator |
| F | **Tool / function registry** | Versioned catalog of the org's custom function/tool schemas (JSON Schema), with handler binding (webhook URL or hosted MCP), so tools are reused across agents instead of re-declared per request. | Vertex Tools; LangChain Hub |
| G | **Agent memory + A2A** | Managed long-term memory (semantic + episodic, on pgvector) scoped per agent/end-user, auto-summarized; plus agent-to-agent messaging so one agent can delegate to another as a tool. | AgentCore Memory; Vertex Memory Bank; Google A2A protocol |

The headline value: a customer ships an autonomous agent without standing up an orchestration framework, a browser farm, a code sandbox, an MCP host, or a memory store — and gets one itemized per-step bill across all of them.

---

## 2. Build vs proxy

The hard constraint (no upstream names ever surface) drives every choice. The pattern from `chat-completions.ts` — proxy LLM tokens to the upstream gateway, but run *our* value-add (cache, guardrail, routing) on our substrate — generalizes here.

| Service | Decision | Rationale |
|---|---|---|
| **A. Responses API** | **Build** (orchestration on our substrate; LLM steps proxy through the existing `/v1` upstream) | The loop, state store, and step billing are pure control-plane logic. Each model turn is just an internal call to our own chat-completions path → already brand-hidden. Zero new upstream. |
| **B1. Web search** | **Proxy** through a brand-hideable search API. Candidates: **Brave Search API**, **Exa**, **Tavily**, **Serper**. Brave/Exa preferred (clean ToS for resale, citation-grade). | No reason to crawl the web ourselves. Results are normalized into our own citation envelope so the upstream never leaks. |
| **B2. File search** | **Build** — reuse `inference.vector_collections` + the Agents KB ingestion that already exists. | We already own pgvector RAG; this is wiring, not new infra. |
| **B3. Code interpreter** | **Build** on own substrate — gVisor/Firecracker microVM sandbox on a k8s node pool now; own B300/H200 fleet when it lands. | Running customer code through any third party is a brand + security non-starter. Fits the existing k8s runner model. |
| **C. Agent runtime** | **Build** — new `agent-runner` deployable (BullMQ on k8s, mirror of ft-runner/deploy-runner). | Durable multi-minute orchestration is exactly what the k8s async tier exists for (per `architecture.md`: "durable, sometimes minutes-long"). |
| **D. MCP hosting** | **Build** on the existing **deploy-runner → RunPod Serverless** path (the BYO-container substrate). Migrate to own fleet later. | An MCP server is just a container; we already deploy containers via `deploy-runpod.ts`. Reuse it. Public-registry connectors we *operate* run as managed serverless on the same path. |
| **E. Browser automation** | **Build** — headless Chromium (Playwright) in microVMs on k8s now; own fleet later. Vision-action model steps proxy through `/v1`. | Browserbase-style proxying would expose an upstream and surface their session URLs. Browser farms are cheap on our own nodes. |
| **F. Tool registry** | **Build** — pure Postgres + control-plane CRUD. | Metadata only. |
| **G. Memory + A2A** | **Build** — pgvector (memory) + Postgres queue (A2A). Embeddings + summarization proxy through `/v1`. | Same substrate as vector store; A2A is internal message passing between our own agents. |

**Net:** one true new upstream (search). Everything else is own-substrate, slotting onto RunPod now and the Yotta B300/H200 fleet later — sequenced so the sandbox/browser node pools become the *first paying tenants* of the owned fleet (a DPR proof point).

---

## 3. Architecture

### Mapping onto deployables

```
                    ┌────────────────────────────────────────────┐
   customer ───────▶│  CF Worker gateway  (api.ahurasense.com)    │
                    │  /v1/responses · /v1/agents/{id}/runs       │
                    │  auth → spend → ratelimit  (UNCHANGED chain)│
                    │  short loops run inline; long runs handed   │
                    │  off to the runtime; SSE step streaming      │
                    └───────┬─────────────────────────┬───────────┘
            internal /v1 LLM│                          │ enqueue + claim
            (own gateway)   ▼                          ▼
                ┌───────────────────┐      ┌──────────────────────────┐
                │ upstream LLM proxy│      │  agent-runner (NEW, k8s)  │
                │ (brand-hidden)    │      │  BullMQ + Postgres claimer│
                └───────────────────┘      │  step loop · tool dispatch│
                                           └───┬────────┬────────┬─────┘
   ┌──────────────────────┐    web search ◀───┘        │        └────▶ MCP host
   │ Next.js control plane│    (proxy)                  ▼              (deploy-runner
   │ /api/agents/* CRUD   │            ┌────────────────────────────┐  → serverless)
   │ internal sweep eps   │            │ sandbox-pool (NEW, k8s)    │
   │ (cron targets)       │            │ microVM: code-interp +     │
   └──────────────────────┘            │ headless browser sessions  │
                                       └────────────────────────────┘
   State: Supabase Postgres (new `agents2` schema*) · pgvector (memory) ·
          R2 (browser recordings, code artifacts) · CF cron (idle reaper,
          run-timeout reaper, per-step usage flush)
```
\*new schema named `agentcore` to avoid colliding with the existing `agents` schema/product.

### New deployables
1. **`agent-runner`** (k8s Node service, mirror of `ft-runner/src/index.ts`): BullMQ `Worker` + Postgres `Claimer` over `agentcore.runs WHERE status='queued'`, `MAX_CONCURRENT_RUNS` per process, heartbeat-stalled-run reaping. Hosts the step loop.
2. **`sandbox-pool`** (k8s, privileged node pool): a small API that hands out microVM-backed **code-interpreter** and **browser** sessions, keyed by `session_id`, with a hard wall-clock + memory cap. Spawned/torn-down by agent-runner over an internal HTTP/gRPC contract.

The CF Worker, Next.js control plane, and CF cron are **reused** — no new responsibilities of a new kind, just new routes/sweeps.

### Request flow — `POST /v1/responses` (the hot path)

1. **Edge auth/spend/ratelimit** — identical middleware chain to `index.ts` (`authMiddleware → spendCheckMiddleware → rateLimitMiddleware`), so per-key budgets, IP allowlists, model scope, and hard caps apply unchanged.
2. **Resolve agent config** — if `agent_id` present, load tool set + memory policy + guardrail from `agentcore.agents` (KV-cached like API keys); else use inline `tools`.
3. **Pre-flight balance guard** — `BillingCredits.hasSufficientBalance` for an estimated max-step cost (reuses the "slice 1" pattern already shipped for FT/serving).
4. **Branch on cost:**
   - **Short/cheap loop** (≤ N steps, no browser, no long code): run the loop **inline in the Worker**, calling our *own* `/v1/chat/completions` for each model turn and dispatching hosted tools via service bindings. Stream `response.output_text.delta` + `response.tool_call` SSE events. Same `streamPassthrough` discipline as chat.
   - **Long/expensive** (browser-use, code-interp, `background:true`, or step budget exceeded): write a `agentcore.runs` row `status='queued'`, enqueue via a `agent-queue.ts` helper (clone of `deploy-queue.ts`), return `202` with a `run_id` immediately. Client polls `GET /v1/agents/runs/{id}` or opens the SSE stream.
5. **agent-runner** claims the run, executes the step loop: each step = one model turn + zero-or-more tool calls. Tool calls fan out to: the LLM proxy (model), the search upstream (web search), pgvector (file search/memory), the sandbox-pool (code/browser), or a hosted MCP endpoint.
6. **Per-step persistence** — every step appends to `agentcore.run_steps` and emits a **usage event** to the existing `USAGE_EVENTS` CF Queue (model tokens) plus a new `AGENT_STEP_EVENTS` queue (tool units). Run heartbeat updated.
7. **Completion** — final output written; run `status='completed'`; memory write-back (summarize → embed → upsert) enqueued.
8. **Cron reapers** — the existing per-minute `scheduled()` handler in `workers/inference/src/index.ts` gains three new control-plane sweep calls (see §6): idle browser/sandbox session reaper, run-timeout reaper, and orphaned-run reaper (stale heartbeat) — exactly mirroring `runFinetuneWatchdog`.

### Where state lives
- **Durable run state, steps, memory, registry, MCP servers** → Postgres (`agentcore` schema).
- **Agent-config + MCP-binding hot cache** → CF KV (5-min TTL, like API keys).
- **In-flight sandbox/browser sessions** → ephemeral in the k8s node + a `agentcore.sandbox_sessions` row for billing/reaping.
- **Browser recordings, code artifacts, large tool outputs** → R2.
- **Long-term memory vectors** → pgvector (`agentcore.agent_memories`).

---

## 4. Data model

Migration `supabase/migrations/20260620000001_agentcore_schema.sql`, following the repo's RLS/grant/trigger conventions exactly (cf. `20260614000005`).

```sql
CREATE SCHEMA IF NOT EXISTS agentcore;

-- ── Agents: reusable definition ─────────────────────────────────────────────
CREATE TABLE agentcore.agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  model           TEXT NOT NULL,                 -- catalog model id
  system_prompt   TEXT,
  tools           JSONB NOT NULL DEFAULT '[]',   -- [{type:'web_search'|'file_search'|'code'|'mcp'|'function', ...}]
  memory_policy   JSONB NOT NULL DEFAULT '{}',   -- {enabled, scope:'agent'|'end_user', max_items}
  guardrail       TEXT NOT NULL DEFAULT 'warn',  -- reuses gateway guardrail policy enum
  max_steps       INT  NOT NULL DEFAULT 12 CHECK (max_steps BETWEEN 1 AND 100),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

-- ── Runs: one agent invocation (durable) ────────────────────────────────────
CREATE TYPE agentcore.run_status AS ENUM
  ('queued','running','requires_action','completed','failed','cancelled','expired');

CREATE TABLE agentcore.runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  agent_id         UUID REFERENCES agentcore.agents(id) ON DELETE SET NULL,
  api_key_id       UUID,                          -- inference.api_keys.id (billed key)
  billing_user_id  UUID NOT NULL,                 -- org payer; resolved at create (cf. serving-pod)
  previous_response_id UUID REFERENCES agentcore.runs(id), -- stateful chaining
  status           agentcore.run_status NOT NULL DEFAULT 'queued',
  input            JSONB NOT NULL,
  output           JSONB,
  step_count       INT  NOT NULL DEFAULT 0,
  claimed_by       TEXT,                          -- runner pod id (claim pattern)
  heartbeat_at     TIMESTAMPTZ,                   -- stale-run reaping
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 minutes',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_runs_claim ON agentcore.runs (status, created_at)
  WHERE status IN ('queued','running');

-- ── Run steps: the trace + per-step billing ledger ──────────────────────────
CREATE TABLE agentcore.run_steps (
  id            BIGSERIAL PRIMARY KEY,
  run_id        UUID NOT NULL REFERENCES agentcore.runs(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL,
  step_index    INT  NOT NULL,
  step_type     TEXT NOT NULL,                    -- 'model'|'web_search'|'file_search'|'code'|'browser'|'mcp'|'memory'|'a2a'
  tool_name     TEXT,
  input_tokens  INT, output_tokens INT,           -- for model steps
  units         NUMERIC(12,4),                     -- searches / cpu-sec / browser-sec / mcp-calls
  unit_label    TEXT,
  cost_cents    NUMERIC(14,4) NOT NULL DEFAULT 0, -- set by metering consumer
  latency_ms    INT,
  status        TEXT NOT NULL DEFAULT 'success',
  detail        JSONB,                            -- args/result preview, R2 ref for big payloads
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, step_index)
);
CREATE INDEX idx_run_steps_run ON agentcore.run_steps (run_id, step_index);

-- ── MCP servers (hosted) + private registry ─────────────────────────────────
CREATE TABLE agentcore.mcp_servers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,                    -- registry key, org-unique
  source        TEXT NOT NULL,                    -- 'image'|'url'|'curated'
  deployment_id UUID,                             -- reuses inference.deployments
  endpoint_url  TEXT,                             -- internal serving url (never customer-visible)
  visibility    TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  tool_schemas  JSONB NOT NULL DEFAULT '[]',      -- discovered tools/list cache
  status        TEXT NOT NULL DEFAULT 'provisioning',
  hourly_cents  INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

-- ── Tool/function registry (metadata only) ──────────────────────────────────
CREATE TABLE agentcore.tools (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES inference.orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  version     INT  NOT NULL DEFAULT 1,
  schema      JSONB NOT NULL,                     -- JSON Schema for params
  binding     JSONB NOT NULL,                     -- {type:'webhook'|'mcp', url|mcp_server_id}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name, version)
);

-- ── Sandbox / browser sessions (ephemeral, billed per second) ───────────────
CREATE TABLE agentcore.sandbox_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID REFERENCES agentcore.runs(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('code','browser')),
  state         TEXT NOT NULL DEFAULT 'provisioning'
                CHECK (state IN ('provisioning','running','stopped')),
  per_sec_cents NUMERIC(10,6) NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ,
  stopped_at    TIMESTAMPTZ,
  idle_deadline TIMESTAMPTZ,                      -- watchdog reaps past this
  recording_r2  TEXT
);

-- ── Agent memory (pgvector) ─────────────────────────────────────────────────
CREATE TABLE agentcore.agent_memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  agent_id    UUID NOT NULL REFERENCES agentcore.agents(id) ON DELETE CASCADE,
  scope_key   TEXT NOT NULL,                      -- agent id or end_user id
  content     TEXT NOT NULL,
  embedding   vector(1536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_mem_scope ON agentcore.agent_memories (agent_id, scope_key);

-- ── Billing spine enrollment: long-lived hosted MCP servers ─────────────────
-- (per-RUN tools meter via usage events; only the always-on MCP host is an
--  hourly active_* resource, like active_inference_vector.)
CREATE TABLE billing.active_agent_mcp (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL,                  -- agentcore.mcp_servers.id
  hourly_rate     NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paused','grace','terminated')),
  last_billed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id)
);
```

**RLS pattern** (verbatim shape from `20260614000005`): enable RLS on all `agentcore.*` and `billing.active_agent_mcp`; `authenticated` gets `SELECT` gated by `inference.is_org_member(org_id)` (the existing RLS helper); `service_role` gets `ALL`. The runner + gateway use the service-role client and bypass RLS, identical to today.

**Billing keys:**
- `billing.active_agent_mcp` → a **new** `active_*` table; must be added to `GRACE_SERVICE_TABLES` in `lib/billing/grace/constants.ts` and the grace-lifecycle + transactions allowlists (migrations mirroring `20260615000011`/`20260615000012`), giving it proration + 7-day grace → auto-delete for free.
- Per-run/per-step tool costs → **usage-event metering** (no `active_*` row), flushed by the consumer into a transaction, exactly like `inference_serving` charges.

---

## 5. API surface

### Customer gateway (`/v1/agents/*`, `/v1/responses`)

**Create a stateful response (auto tool loop):**
```http
POST /v1/responses
Authorization: Bearer ak_live_...
{
  "agent_id": "ag_7f3...",                 // optional; or inline model+tools
  "input": "Find the latest pricing for our top 3 competitors and tabulate it.",
  "tools": [{ "type": "web_search" }, { "type": "code" }],
  "previous_response_id": "resp_abc",       // stateful chaining
  "stream": true,
  "background": false
}
```
Streaming SSE (OpenAI-Responses-shaped events): `response.created` → `response.step.added`(web_search) → `response.output_text.delta` → `response.completed`. Final envelope:
```json
{
  "id": "resp_9d2", "object": "response", "status": "completed",
  "output": [{ "type": "message", "content": [{ "type": "output_text", "text": "| Competitor | Price |..." }] }],
  "usage": { "input_tokens": 4120, "output_tokens": 880,
             "tools": { "web_search": 3, "code_seconds": 4.2 } },
  "steps": 5,
  "x_ahura_cost_cents": 6.4
}
```

**Run a defined agent (durable):**
```http
POST /v1/agents/ag_7f3.../runs        → 202 { "run_id": "run_...", "status": "queued" }
GET  /v1/agents/runs/run_...          → run status + full step trace
GET  /v1/agents/runs/run_.../stream   → SSE step events for a backgrounded run
POST /v1/agents/runs/run_.../cancel
```

**Hosted-tool primitives** (also callable standalone, billed identically):
```http
POST /v1/tools/web_search   { "query": "...", "max_results": 5 }
POST /v1/tools/code         { "code": "import pandas...", "files": [] }
```

**MCP registry (discovery from inside the gateway):**
```http
GET  /v1/agents/mcp                    → list bound MCP servers + their tools
POST /v1/agents/mcp/{slug}/call        { "tool": "search_docs", "args": {...} }
```

### Control plane (`/api/agents/*` on Next.js)
- `POST/GET/PATCH/DELETE /api/agents` — agent CRUD (RBAC: developer+ to write).
- `POST /api/agents/mcp` — register/host an MCP server (enqueues a deploy job).
- `POST/GET /api/agents/tools` — tool/function registry CRUD.
- `GET /api/agents/runs/:id/trace` — full step waterfall for the dashboard trace viewer.
- **Internal cron sweep endpoints** (mirror `/api/inference/internal/serving-pod-watchdog`, guarded by `X-Ahura-Internal-Token`):
  - `/api/agents/internal/session-reaper` — stop sandbox/browser sessions past `idle_deadline`, settle per-second bill.
  - `/api/agents/internal/run-reaper` — expire runs past `expires_at` / stale heartbeat.

---

## 6. Code sketches

**(a) Gateway Hono route — `workers/inference/src/routes/responses.ts`** (registered in `index.ts` as `v1.post("/responses", responses)`, inheriting the auth/spend/ratelimit chain):

```ts
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import { runInlineLoop } from "../lib/agent-loop.ts";
import { enqueueRun, estimateMaxCost } from "../lib/agent-runs.ts";

const schema = z.object({
  agent_id: z.string().optional(),
  input: z.union([z.string(), z.array(z.unknown())]),
  tools: z.array(z.object({ type: z.string() }).passthrough()).optional(),
  previous_response_id: z.string().optional(),
  stream: z.boolean().optional(),
  background: z.boolean().optional(),
}).passthrough();

export const responses: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json({ error: { message: "Invalid body", code: "invalid_request", request_id: requestId } }, 400);
  const req = parsed.data;

  const cfg = await resolveAgentConfig(c.env, auth.orgId, req); // KV-cached, like api_keys

  // Pre-flight balance guard (same pattern as FT/serving "slice 1")
  if (!(await estimateMaxCost(c.env, cfg, auth)).affordable)
    return c.json({ error: { message: "Insufficient balance for this agent run",
      code: "insufficient_balance", request_id: requestId } }, 402);

  // Long/expensive work is durable → hand off to agent-runner, return 202.
  if (req.background || cfg.needsSandbox || cfg.maxSteps > c.env.INLINE_STEP_BUDGET) {
    const runId = await enqueueRun(c.env, { auth, cfg, input: req.input,
      previousResponseId: req.previous_response_id });
    return c.json({ id: runId, object: "response", status: "queued" }, 202);
  }

  // Short loop runs inline; each model turn calls our OWN /v1, tools via bindings.
  return runInlineLoop(c, { auth, cfg, input: req.input, stream: req.stream === true, requestId });
};
```

**(b) agent-runner step handler — `workers/agent-runner/src/lifecycle.ts`** (consumed by the BullMQ `Worker` in a near-clone of `ft-runner/src/index.ts`):

```ts
import type { JobContext } from "./types.js";
import type { Job } from "bullmq";

export interface RunPayload { runId: string }

export async function runJob(ctx: JobContext, job: Job<RunPayload>): Promise<void> {
  const { supabase, logger } = ctx;
  const { runId } = job.data;

  // Atomic claim — only a queued run matches, so a concurrent runner can't double-claim
  const { data: run } = await supabase.schema("agentcore").from("runs")
    .update({ status: "running", claimed_by: ctx.podId, heartbeat_at: new Date().toISOString() })
    .eq("id", runId).eq("status", "queued")
    .select("id, org_id, agent_id, input, billing_user_id").maybeSingle();
  if (!run) return; // already claimed/cancelled

  const agent = await loadAgent(ctx, run.agent_id);
  let messages = toMessages(run.input);

  for (let step = 0; step < agent.max_steps; step++) {
    await ctx.heartbeats.touch(runId);
    const turn = await ctx.gateway.chatCompletion(agent.model, messages); // internal /v1 call
    await recordStep(ctx, run, step, "model", turn.usage);                // → run_steps + USAGE_EVENTS

    const calls = turn.tool_calls ?? [];
    if (calls.length === 0) return finishRun(ctx, run, turn.content);     // status=completed + memory writeback

    for (const call of calls) {
      const result = await dispatchTool(ctx, run, agent, call);          // search/file/code/browser/mcp
      await recordStep(ctx, run, step, call.toolType, result.metering);  // per-step billing units
      messages.push(toToolMessage(call, result.output));
    }
  }
  await failRun(ctx, run, "max_steps_exceeded");
}
```

**(c) Per-step billing settle — `lib/inference/agent-step-billing.ts`** (idempotency-via-atomic-transition, identical to `settleServingPod`; charges the org payer, never throws):

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { Billing } from "@/lib/supabase/queries/billing";

const TOOL_RATES_CENTS = { web_search: 1.0, code_seconds: 0.06, browser_seconds: 0.08, mcp_call: 0.02 } as const;

export async function settleSandboxSession(
  supabase: SupabaseClient<any, any, any>, sessionId: string
): Promise<{ settled: boolean; chargedUsd: number }> {
  const stoppedAt = new Date().toISOString();
  // Win the transition: only a still-running session matches → no double charge.
  const { data: row } = await supabase.schema("agentcore").from("sandbox_sessions")
    .update({ state: "stopped", stopped_at: stoppedAt })
    .eq("id", sessionId).in("state", ["provisioning", "running"])
    .select("org_id, kind, per_sec_cents, started_at").maybeSingle();
  if (!row?.started_at) return { settled: false, chargedUsd: 0 };

  const secs = Math.max(0, (Date.parse(stoppedAt) - Date.parse(row.started_at)) / 1000);
  const cents = Math.ceil(Number(row.per_sec_cents) * secs);
  if (cents <= 0) return { settled: true, chargedUsd: 0 };

  const payer = await resolvePayer(supabase, row.org_id);     // billing_user_id || owner (cf. serving-pod)
  const usd = cents / 100;
  try {
    const newBalance = await Billing.deduct(payer, usd);
    await Billing.save_transaction({ userId: payer, amount: usd, status: "completed",
      type: "usage", balanceAfter: newBalance, serviceId: sessionId,
      serviceType: "agent_sandbox", description: `Agent ${row.kind} session`,
      metadata: { seconds: Number(secs.toFixed(2)) } });
  } catch (e) { console.error(`[agent settle] charge failed for ${sessionId}:`, e); }
  return { settled: true, chargedUsd: usd };
}
```

---

## 7. Billing

Two metering shapes, both already proven in the codebase:

| Service / unit | Price unit | Mechanism | Spine table |
|---|---|---|---|
| **Model steps** (Responses/runtime) | per-token (input/output) | usage-event → `inference.usage`, priced by catalog (reuses chat path) | usage-event |
| **Web search** | per search (~$0.01) + small markup | `AGENT_STEP_EVENTS` queue → transaction | usage-event |
| **File search** | per query + embedding tokens | usage-event (embed) + per-query unit | usage-event |
| **Code interpreter** | per **CPU-second** of microVM | `settleSandboxSession` on stop | usage-event |
| **Browser session** | per **browser-second** | `settleSandboxSession` on stop | usage-event |
| **MCP call** | per call (thin) | step event | usage-event |
| **Hosted MCP server (always-on)** | **per GPU/CPU-hour** | `billing.active_agent_mcp` hourly cron + 7-day grace | `active_agent_mcp` |
| **Agent memory** | per stored MB-month + query | piggybacks `active_inference_vector` storage model | `active_*` |

**Enrollment in the spine:**
- The single always-on resource (hosted MCP server) enrolls via `BillingCredits.addActiveAgentMcp(...)` (new helper, copy of `addActiveVectorCollection`), and on teardown `closeActiveAgentMcp` runs `computeProratedCharge`. It joins `GRACE_SERVICE_TABLES` so the hourly cron meters it and the 7-day grace → auto-delete lifecycle applies unchanged.
- All **ephemeral, per-run** tool consumption is **usage-event metered** — no `active_*` row to leak. A new `AGENT_STEP_EVENTS` consumer (mirror of `consumers/usage.ts`) prices steps with `TOOL_RATES_CENTS` and writes one transaction per run (or batched per step) keyed by `serviceType: 'agent_run' | 'agent_sandbox'` (add to the `service_type` allowlist, mirroring `20260615000012`).

**Spend-cap interaction:** because every model step routes through our own `/v1`, the existing `spendCheckMiddleware` already enforces the per-key hard cap on those. Tool steps are pre-flighted at run-create (`estimateMaxCost`) against `BillingCredits.hasSufficientBalance`, and the runner re-checks balance every K steps so a runaway loop is cut off mid-run rather than overdrawing — closing the FT/serving "charge-but-no-guard" gap from day 0. This is the first cluster with **non-zero markup** baked in (search resale + sandbox compute carry margin), seeding the platform-wide markup initiative.

---

## 8. Delivery plan

Phased, each slice shippable. Estimates in eng-weeks (ew).

| Slice | Scope | ew | Depends on | Cut for v1 |
|---|---|---|---|---|
| **S1 — Schema + Responses (stateful, no tools)** | `agentcore` migration, `/v1/responses` inline loop calling own `/v1`, state chaining via `previous_response_id`, step trace + usage events, dashboard agent CRUD | 4 | — | — |
| **S2 — agent-runner deployable** | New k8s service (clone ft-runner): BullMQ + claimer, durable `runs`, `background:true`, run reaper sweep added to existing cron | 3 | S1 | sharding (single replica fine) |
| **S3 — File search + web search** | File search over existing `vector_collections`; web search proxy (Brave/Exa) w/ citation envelope + brand scrub | 3 | S1 | re-ranking (reuse future rerank endpoint) |
| **S4 — sandbox-pool + code interpreter** | microVM node pool, session API, `settleSandboxSession` billing, idle reaper | 5 | S2 | GPU-backed code exec (CPU only v1) |
| **S5 — Browser automation** | Headless Chromium in sandbox-pool, vision-action loop (model via `/v1`), recordings → R2, trace viewer | 5 | S4 | concurrent sessions per run; live takeover UI |
| **S6 — MCP hosting + registry** | Host MCP via deploy-runner, private registry, `active_agent_mcp` spine enrollment + grace allowlist, `/v1/agents/mcp` | 4 | S2 + deploy-runner | public curated registry (private first) |
| **S7 — Tool registry + memory + A2A** | Function/tool registry CRUD, pgvector memory write/read, summarization, A2A delegate-as-tool | 4 | S1, S3 | cross-org A2A; memory eviction tuning |

**Total ~28 ew.** Critical path S1→S2→S4→S5.

**Cross-cluster dependencies:**
- **Billing cluster (gap #7):** the markup/usage-event-metering work and grace-allowlist extensions should land alongside S1; S6 needs `active_agent_mcp` wired into the spine.
- **Retrieval cluster (gap #3):** S3 file search is materially better once the **reranking endpoint** ships — slot rerank as a tool in S3 if available, else ship without.
- **Compliance cluster (gap #5):** browser/code sandboxes raise the data-isolation bar; S4/S5 must land after the multi-tenancy hardening review.
- **Own-fleet DPR:** S4/S5 node pools are the natural **first paying tenants** of the Yotta B300/H200 fleet — sequence the fleet cutover to absorb them.

**v1 cut line:** ship S1+S2+S3 as "Agents v2 GA" (stateful responses + hosted retrieval tools + durable runtime). Code-interp, browser, and MCP hosting are fast-follows.

---

## 9. Risks & open questions

1. **Sandbox security is the dominant risk.** Code interpreter + browser run *customer-influenced* (and in browser-use, model-influenced) actions on our infra. Mandatory: gVisor/Firecracker isolation, no metadata-endpoint access, egress allowlist, per-session network namespace, hard wall-clock + memory + disk caps. This must pass the platform security audit before S4 ships — it's a larger surface than anything currently in the repo. *Open: gVisor on the current RunPod-backed k8s nodes vs. waiting for the owned fleet where we control the hypervisor?*
2. **Brand-scrub on tool outputs.** Web-search results, MCP error payloads, and browser page content can echo upstream provider names or our internal serving URLs. The `customerSafeErrorMessage()` discipline must extend to a new sanitizer over *tool outputs and citations*, not just errors. Audit every new write path (run_steps `detail`, citations, MCP errors). *Highest-leakage surface in the cluster.*
3. **Cost runaway / loop safety.** An agent that loops or spawns expensive browser/code steps can burn balance fast. Mitigated by per-run `max_steps`, pre-flight estimate, and mid-run balance re-checks — but the *estimate* for variable-cost tools is inherently fuzzy. *Open: hard per-run spend ceiling (a `run.max_cost_cents` the runner enforces) as a required field?*
4. **Inline-vs-durable split adds two code paths** for the same loop (Worker inline + k8s runner). Risk of drift. Mitigation: factor the loop into a shared `agent-loop` module compiled for both runtimes — but the Worker's 30s-CPU and no-native-module constraints may force divergence. *Open: just always go durable and drop the inline path to halve maintenance, accepting higher latency on short runs?*
5. **A2A scope.** Full Google A2A protocol compliance is large; v1 should be internal-only (one of our agents calling another as a tool). *Open: is cross-org / external-A2A a real near-term customer ask or premature?*
6. **MCP registry trust & supply chain.** A public curated registry means we vouch for third-party connectors. Vetting, sandboxing, and revocation of malicious MCP servers is an ongoing operational burden — start private-only.
7. **Markup precedent.** This is the first cluster to introduce non-zero margin while the rest of the platform sells at cost. Need product/finance sign-off on the search-resale and sandbox-compute markup so pricing is coherent across services.
8. **Memory privacy.** End-user-scoped memory stores potentially sensitive conversation content per `scope_key`; must honor the existing per-key **ZDR** toggle (ZDR agents skip memory writes entirely) and provide a memory-purge API for DPDP/GDPR erasure requests.