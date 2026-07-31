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

**A4 is NOT complete.** It covers everything long-running, and only the
`agentcore` slice below was built on 2026-07-28. The worker fleet — the five
runners plus media — was added on 2026-07-30 and is described in §8.

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

---

## 8. Worker fleet — A4, part two (2026-07-30)

The rest of A4: "are the workers running, and is work moving?" for all six
claim-based job systems.

### 8.1 Design decision — on-demand, not a check-in table

An earlier draft had every runner upsert a heartbeat row each claimer tick. It
was **rejected** in favour of resolving state when the page is opened or Refresh
is pressed. Reasons, in order of weight:

1. **Kubernetes already probes `/health` every 30s** via `livenessProbe`
   (`workers/*/k8s/deployment.yaml`). A heartbeat table re-implements the
   platform's own job.
2. It costs a write every few seconds per pod, forever, plus a migration and a
   change to all five runners.
3. A probe proves the process is answering **now**, not that it wrote a row
   twelve seconds ago.

Stated honestly: **a probe has no history.** It cannot tell you a worker was down
at 03:00. If that is ever needed, the answer is a metrics scrape, not a bespoke
table.

### 8.2 Verified topology (kubectl, 2026-07-30)

The claim "runners are unreachable, so we cannot probe" was **checked and turned
out to be wrong in an important way**:

| Fact | Evidence |
|---|---|
| Every runner exposes a ClusterIP Service `ahura-<runner>-health:8080` | `workers/*/k8s/deployment.yaml` — all five confirmed, names match the registry exactly |
| The app runs in the **same cluster** | `default/cloud-services-dev-app`, 2/2 available |
| A pod there **can** reach a ClusterIP in another namespace | `kubectl exec` → cross-namespace fetch returned HTTP 404 (the ingress controller answering) |
| "Outbound-only / 0 NodeBalancer" | means no **inbound** path from the internet; it does not block in-cluster traffic |
| No runner is deployed | namespace `ahura` does not exist; nothing matching `*runner*` in any namespace |

**Consequence:** probing will work in production once the runners are deployed.
It is off by default only because nothing is deployed yet and because cluster DNS
does not resolve from a laptop — where enabling it would paint the whole fleet
red. Turn on with `RUNNER_HEALTH_PROBE=on`; `?probe=1` forces a one-off check;
`RUNNER_HEALTH_URL_<SERVICE>` retargets one runner.

### 8.3 What shipped

- `lib/admin/runner-registry.ts` — the six runners, each `claimable`/`in_flight`
  list taken from that runner's own `scan.ts` and cited in a comment. Static on
  purpose: a runner that has never run still has to appear.
- `lib/admin/fleet.ts` — pure. `snapshotOf()` reduces a job table to counts;
  `verdictFor()` combines probe + queue into one of eight statuses, worst true
  statement first; `summarize()`, `sortByUrgency()`.
- `app/api/admin/inference/workers/route.ts` — thin: reads six tables, optionally
  probes, returns verdicts. Stores nothing, polls nothing.
- 34 unit tests.

**`media` is included deliberately** even though there is no media-runner
deployable: `inference.media_jobs` is a claim-based table with a heartbeat like
the others, and it holds the fleet's worst problem. Excluding it on a technicality
would hide exactly what this page exists to show.

**Derived-only mode carries one real inference:** a job in flight whose heartbeat
is fresh proves a worker claimed it and is still touching it. `stuck` is precisely
the negation, so `in_flight > stuck` is proof of life with no probe at all. It
also refuses to report `down`, `not_deployed` or `not_ticking` without having
actually probed — asserted by test.

### 8.4 Proven against a real runner (2026-07-30)

A real `data-runner` was started locally (`workers/data-runner/run-local.sh`,
health on :8091) and the admin endpoint pointed at it via
`RUNNER_HEALTH_URL_DATA_RUNNER`, with the live Supabase and a real connector sync.

| Scenario | How it was produced | Reported |
|---|---|---|
| Healthy, idle | runner up, no work | `idle` — reachable, tick 704ms |
| Work queued | real sync triggered via `POST /api/inference/connectors/{id}/sync` | `backed_up` — "1 queued but none picked up" |
| Work in flight | runner claimed it | `working` |
| Same, **probing off** | derived from queue alone | `working` — "live heartbeats — a worker is running" |
| Back to rest | sync finished (5 docs added, then 0 — ETag skip) | `idle` / `unknown` |
| Process dead | `pkill` the runner | `down` — "no response (fetch failed), but 1 job(s) in the last window" |
| **Claimer stalled, process alive** | restarted with `CLAIM_POLL_INTERVAL_MS=900000` | `not_ticking` — while `/health` still returned **200 `ok:true, ready:true`** |

That last row is the whole point: **k8s would have called that pod healthy and
left it running while no work moved.** The fleet view caught it.

Also verified: every status value present in all six live tables is covered by
the registry (`failed`, `cancelled`, `completed`, `idle`, `running`) — no
unmapped status.

### 8.5 Two bugs this live test caught

1. **A runner with no `/health` was reported as `down` once probing was on.**
   `media` has no deployable, and "no URL configured" was being laundered into
   "unreachable" — so *enabling* probing flipped that row from an accurate
   `degraded` to a false `down`. Now `probeTargetFor()` returns null and the row
   stays in derived-only mode. Regression-tested.
2. **The `down` detail gave no evidence.** With an empty queue it read
   "0 queued, 0 in flight, but timed out", which sounds like nothing is wrong and
   gives no hint why it isn't `not_deployed`. It now cites what proves the runner
   ever existed.

### 8.6 The screen

`/dashboard/admin/inference-workers`, reached from both the sidebar ("Worker
Fleet") and the admin card grid. Four summary cards (needs attention · stuck ·
queued · confirmed healthy), one row per runner sorted worst-first, and a
click-to-expand detail panel per row.

`components/admin/inference-workers/status.ts` holds the presentation rules as a
pure module, because one of them is a real rule rather than styling: **a state we
could not determine must never be painted as a failure.** `unknown` and
`not_deployed` are muted and excluded from "needs attention"; only states needing
a human are amber or red. A test asserts an entirely un-probed fleet yields zero
attention rows.

Each expanded row states *what this means* and *what to do* in plain language,
plus which table it was read from, so nothing on the page requires reading the
source to interpret.

**Verified in a real browser (Playwright, logged in as a real admin):** all six
runners render; nav works from both entry points and highlights as active; row
expansion shows meaning + action + source table; pressing **Probe health** issues
real HTTP probes and fills in live telemetry (`Claimer last polled 591ms` against
the local runner); no console errors; no page-level horizontal overflow at 1920 →
1024px. A real connector sync driven through the page moved the row
**Not checked → Backed up → Working → Not checked** across successive Refresh
presses.

### 8.7 Two more bugs the browser caught

3. **A missing React key.** The row + detail pair was returned as an unkeyed
   fragment. Because the table re-sorts by urgency on every refresh, React could
   reuse the wrong row and show an expanded detail under a different worker. Now
   keyed on the Fragment.
4. **Pressing "Probe health" from outside the cluster produced three false
   "Down" rows** — the exact false alarm the default guards against, reachable in
   one click with only a tooltip for protection. `probeVantageWarning()` now says
   so when a majority of runners fail to answer, and deliberately stays silent
   when only one does, because that is a real outage.

### 8.8 What the stuck jobs actually turned out to be

The page flagged 3 media jobs stuck in flight for 30-35 days. Investigating them
found something much larger, and it is **not a missing feature**.

`app/api/inference/internal/media-job-watchdog/route.ts` already reaps
past-deadline jobs (`error_code: watchdog_timeout`), and the CF Worker's
`scheduled()` handler already calls it **every minute**
(`workers/inference/src/index.ts`). The wiring is correct. Invoking the endpoint
by hand reaped all 3 instantly (`{reaped: 3}`), and the fleet page dropped to
0 stuck. So the reaper works and is wired -- it simply never runs in production.

**Root cause: production is running a build about two months old, and 6 of the 9
scheduled jobs 404.** Probed 2026-07-30 with a deliberately wrong token (so no
writes were possible) against `CONTROL_PLANE_URL` = `https://ahurasense.com`:

| Endpoint | Added | Production |
|---|---|---|
| `inference/internal/serving-pod-watchdog` | 2026-05-26 | 401 -- live |
| `inference/internal/finetune-watchdog` | 2026-05-28 | 401 -- live |
| `inference/internal/deployment-meter` | 2026-05-30 | 401 -- live |
| `inference/internal/media-job-watchdog` | 2026-06-24 | **404** |
| `inference/internal/eval-watchdog` | 2026-07-01 | **404** |
| `agents/internal/run-reaper` | 2026-07-02 | **404** |
| `agents/internal/session-reaper` | 2026-07-06 | **404** |
| `inference/internal/connector-scheduler` | 2026-07-27 | **404** |
| `inference/internal/ingest-watchdog` | 2026-07-27 | **404** |

The split is purely by date: everything added on or before 2026-05-30 is live,
everything from 2026-06-24 onward returns a 404 HTML page. The site itself is
healthy (`GET /` -> 200), so this is a stale deploy, not an outage. Every one of
those 6 has been failing silently every minute or every 5 minutes since it was
merged, because a cron failure is invisible to an operator.

**Damage found, measured rather than assumed:** the 3 media jobs (now reaped).
Every other queue is currently empty -- no wedged connector syncs, no expired
agentcore runs, no stuck eval runs, no leaked sandboxes. So the exposure to date
is small; the risk is that it stays invisible. `connector-scheduler` being dead
does mean `sync_schedule` on a connector is currently a promise the platform
cannot keep, though no connector uses a non-manual schedule today.

**The fix is a production deploy, not code.** That is a release decision, so it is
flagged here rather than acted on.

**An honest limitation of this page:** it reads queue state, so it would have
shown the *symptom* (3 stuck jobs) forever without ever revealing the *cause*
(a dead cron). A "scheduled jobs" panel that pings each internal endpoint and
reports last-success would surface this class of failure directly, and is the
natural next piece of A4.

### 8.9 The page contradicted itself, and two more fixes

Reviewing the rendered page after pressing **Probe health** from a laptop showed
the screen arguing with itself in three places at once:

- the banner said *"not proof of an outage"*, while
- **"Needs attention: 4"** named those exact four runners, and
- **"2 cannot be confirmed"** was reported while **5** runners had failed to answer.

`probeVantageWarning()` explained the situation in prose but nothing downstream
acted on it. Now `vantageSuspect()` is the shared predicate, and:

- `attentionStatuses()` drops unreachable rows when the run is vantage-suspect,
  so the headline count no longer asserts an outage the banner just disclaimed.
  **Queue-derived problems (stuck / backed up / not polling) always still count** —
  they come from the database, so where we probed from is irrelevant to them.
- `unconfirmedCount()` counts unreachable rows too, so "cannot be confirmed"
  reflects everything we genuinely do not know (6 of 6, not 2).
- The attention hint reads *"nothing confirmed to act on — see the note below"*
  rather than a flat "nothing to act on" under four red rows.

A real single outage is still counted and never explained away — asserted by test.

**Deliberately NOT changed:** the `Down` badges stay red even when
vantage-suspect. Muting them would make the page fully coherent, but
`vantageSuspect()` cannot tell a laptop from a genuine cluster-wide outage, and
hiding a real mass failure is the worse of the two errors. The banner and the
zeroed counts carry the caveat instead.

Two more of the same family, from reading the rendered page again:

- **The footnote claimed "Health probing is on."** It was not — it had been forced
  for that one request and nothing persistent changed. It now distinguishes
  *"probed once for this check; it is not enabled by default"* from
  *"enabled for this environment"*.
- **Both summary cards showed a green tick over a zero.** "Needs attention 0" and
  "Confirmed healthy 0 / 6" rendered emerald check icons while 5 runners had not
  answered — an all-clear over an unknown. They now show a neutral `?` whenever
  nothing was actually confirmed.

**And one the API caused.** `probing.enabled` collapsed two independent facts —
"on by `RUNNER_HEALTH_PROBE=on`" and "forced by this request's `?probe=1`" — so the
client had to guess which it was from its own state. On a server with probing
enabled it then told the operator *"it is not enabled by default"*, and offered a
"Probe again" button that could only be a no-op. The route now reports
`default_on` and `forced` separately; the component reads them instead of
remembering, and the redundant client state is gone. Both wordings verified in a
browser against a server with the flag on and with it off.

Also fixed: **the "Probe health" button hid itself after one use.** The API reports
`probing.enabled` for both "on by env" and "forced by this click", so after
probing the button vanished and there was no way to probe again without a full
Refresh first. The component now tracks whether the last load was forced and
offers "Probe again".

### 8.10 Review of the staged code (2026-07-30)

Reviewing the diff rather than re-reading intent found **six** defects that live
testing had not, because the live tables happened not to contain the rows that
would expose them.

**Four wrong status vocabularies.** The registry was checked against statuses
*present in the database*, which passed while being wrong. Checked against the
authoritative enums and CHECK constraints instead:

| Runner | was | schema actually allows |
|---|---|---|
| ft-runner in-flight | `provisioning`, `training`, `uploading` | **none exist** — the real one is `preparing` |
| deploy-runner in-flight | `deploying`, `deleting` | `deleting` does not exist |
| deploy-runner done | `ready`, `deleted` | `ready` does not exist — success is `active` |
| media failed | `cancelled` | CHECK requires `canceled`, one L |

Consequence: a finetune in `preparing` and a deployment in `active` counted as
**neither** open work nor throughput — the row read "Idle" while real work
existed. A cancelled media job counted as nothing at all. There are now tests
that compare the registry to the enum lists, and assert media uses the one-L
spelling while every other table uses two.

**A claimable status that is not always waiting.** `deploy-runner`'s scan claims
`paused` only when `runpod_endpoint_id IS NOT NULL`; the registry claimed every
paused row, so a deployment a customer had simply paused would have shown as a
permanent false "Backed up". `RunnerSpec` gained an optional `claimable_when`
gate plus `extra_columns` so the query fetches what the gate reads.

**Unbounded reads — a latent correctness bug, not just a slow query.** The route
selected whole tables with no `limit`. PostgREST caps rows (1000 by default) and
returns **no error** when it truncates, so `agentcore.runs` — already 328 rows and
growing with every agent run — would eventually start under-reporting, or miss
queued work entirely, with nothing on screen to indicate it. The query is now
narrowed server-side to *open work at any age* OR *rows settled inside the 24h
window*, with a 5,000-row backstop. `last_job_activity` moved to its own
one-indexed-row query, because `verdictFor` uses it to distinguish "down" from
"never deployed" and the narrowed window would have broken that.

Verified live: for all six runners the narrowed query returns counts **identical**
to a full-table scan, and `last_job_activity` still reaches back months
(ft-runner 2026-05-30, agent-runner 2026-07-25, media 2026-06-29).

### 8.11 Still open

- **No actions.** Retry / cancel / force-reap are not built; the section is
  read-only, and the page says so where the stuck jobs are reported. The reap
  case turned out to be served by the existing watchdog, so the remaining gap is
  retry (for the 17 failed fine-tunes) and cancel.
- **3 `media_jobs` stuck in flight for ~31 days.** Surfaced as `degraded` on
  every load. Needs a decision: reap them, or find why nothing consumes them.
- **Fine-tuning is at a 63% failure rate** (17 failed / 3 cancelled / 7
  completed), including 3 killed by `Unknown GPU SKU "NVIDIA RTX A5000"`.
- **No retry / cancel / force-reap actions.** A4 as specified in §4 promises
  them; this slice is read-only so far.
- **No route-level tests** — only the pure modules are covered.

---

## 9. Vector Storage & Observability — the last two AI services with no surface (2026-07-30)

§3's table listed `Vector collections | see, limit (quota), kill | none` and A6 left
`trace_spans` unread. Both now have a screen. Measured coverage of §1.1's product
surface afterwards: models, orgs/keys, usage, audit, agents, workers, **RAG** and
**observability** are covered; guardrails/prompts/presets, batches/files and BYOK
keys are not — all of which hold 0–3 rows today, so they are thin by data rather
than by neglect.

### 9.1 Vector Storage — `/dashboard/admin/inference-rag`

`lib/admin/rag-ops.ts` + `app/api/admin/inference/rag/route.ts`, 22 tests.

**The quota figure is read the way it is ENFORCED.** `checkVectorQuota()` sums
`vector_collections.row_count`, so this does too. Counting `vector_rows` instead
would have shown a different number from the one refusing a customer's upload, and
support would have quoted the wrong one.

Because that cached counter *is* the enforcement input, drift from reality is an
operator concern in its own right: read low and a customer gets free headroom, read
high and they are refused storage they paid for. **"Verify counts"** pages through
`vector_rows` to check it. Live: **166 actual vs 166 cached, zero drift** across 11
collections — the counter is being maintained, which is worth knowing rather than
assuming.

**No quota control is offered, deliberately.** §2 item 5 says the customer error
invites them to contact support and support has no lever. That is still true: the
ceiling is hardcoded in `lib/inference/vector-quota.ts`,
`workers/data-runner/src/lifecycle.ts` and
`workers/inference/src/routes/vector-collections.ts`, with no per-org override to
set. The page says so instead of shipping a button that cannot work. A real lever
needs a migration.

**Live finding:** one org mixes `text-embedding-3-small` (1536 dims) and
`text-embedding-3-large` (3072). A query embedded with one cannot search a
collection built with the other; the `teste` collection is the 3072 outlier.

### 9.2 Observability — `/dashboard/admin/inference-traces`

`lib/admin/traces-ops.ts` + `app/api/admin/inference/traces/route.ts`, 30 tests.
Latency percentiles, failure reasons and guardrail outcomes per modality, model and
customer — none of which the usage explorer can show (that has cost and margin).

**Percentiles are nearest-rank, never interpolated**, so every figure is a latency
some request actually experienced. And the route **pages** rather than limits:
PostgREST caps a response at 1,000 rows without erroring, so a `.limit(50000)` would
have returned 1,000 and every percentile computed from it would have been wrong while
looking plausible.

**Three instrumentation gaps the page states rather than hides**, each measured per
request so they self-correct if the platform starts recording them:

| Gap | Live measurement |
|---|---|
| `ttft_ms` is barely written | **0.065%** of spans — no TTFT percentile is shown, because one sample is not a statistic |
| Spans are flat | every span is a root span, so these are per-request records, **not call trees** — no stage breakdown exists to drill into |
| A/B columns unused | `arm` and `experiment_id` are never written; 0 experiments |

**Guardrails act with zero configured policies.** `guardrail_policies` has 0 rows,
yet 17 of 1,527 spans were **blocked (10), flagged (5) or redacted (2)** — so
defaults are enforcing something nobody can see or edit. Worth a decision.

**A caution on the error rate.** The 7-day window reads **31.2%** against 13% over
90 days, but all 185 recent failures land on a single day — 2026-07-28 — spread
across ~30 different models (`grok-4`, `gemini-3-pro`, four `qwen` variants, `llama`,
`mistral`) as 152 `error_validation` + 33 `error_upstream`. That is the signature of
the catalog health-check sweep added in `13c0957f`, not customer traffic. The page
does not currently distinguish synthetic from real traffic, which is the obvious next
improvement — until it does, read a spike against the deploy log before treating it
as an outage.

### 9.3 Verified live against a real admin account (2026-07-30)

Logged in as `deep.aghera@ahurasense.com` and loaded **all nine** admin pages:
pricing (51 rows), orgs (13), usage (25), audit (277), agents (26), workers (6),
vector storage (2), observability (3), plus the untouched legacy AI Agents page.
**9/9 rendered real data with zero console errors on any page**, and every headline
figure matched the API exactly (vector card "166" == `vectors_used` 166 == measured
actual 166).

Then real traffic was pushed through the org via the gateway — 2 chat calls, 1
embedding, and one deliberate bad-model call — and the pages were re-read:

| Call | Usage row | Trace span | Visible in admin |
|---|---|---|---|
| `anthropic/claude-haiku-4.5` | yes, 1¢ | yes | yes |
| `openai/gpt-oss-20b` | yes, 1¢ | yes | yes |
| `openai/text-embedding-3-small` | yes, 1¢ | yes | yes |
| `openai/does-not-exist-xyz` (503) | **none** | **none** | **no** |

Observability moved 177 → 180 spans in the 24h window, and the new spans appeared
under the right modalities (chat 170, embed 10).

**The finding: early rejections are invisible to every admin surface.** A request
refused before it reaches upstream — unknown or disabled model (`f633bc4b`), and by
the same path presumably quota and validation rejections — writes NO `usage` row and
NO `trace_span`. So the error rate on the observability page, and the failure counts
on the usage page, both exclude client-error rejections entirely. A customer
hammering the API with a bad model name is invisible to operators. Worth deciding
whether those should be recorded; nothing on either page can show them today.

Also confirmed working as designed: the platform key is `is_internal_service`, so
the gateway refuses it without an `X-Ahura-On-Behalf-Of-Org` header — the
`agent_on_behalf_of_billing` mechanism doing its job.

### 9.4 Gaps found by reviewing the staged files as an operator would use them (2026-07-30)

Reading the 21 files by "what would someone actually do with this" found three gaps
that unit tests and the live data pass had both missed, because none of them are
about correctness of the numbers.

**1. Both new tables were mouse-only.** The expandable rows carried `onClick` and
nothing else — no `tabIndex`, no `onKeyDown`, no `role`. Since the detail panel is
the ONLY route to per-runner meaning/actions and per-org collections, a keyboard or
screen-reader user could not reach any of it. Both now expose `role="button"`,
`tabIndex={0}`, `aria-expanded`, a visible focus ring, and Enter/Space (with
`preventDefault` so Space does not scroll the page). Verified by driving the
keyboard: Worker Fleet 6→7 rows on Enter and back to 6 on Space; Vector Storage
2→17 and back.

**2. The observability `?org=` filter was dead code.** The route implemented it;
nothing could send it. So the single most common support question — "why is THIS
customer slow?" — could not be answered, even though a by-customer table was
sitting right there. There is now a customer selector, the by-customer rows are
clickable to filter, the footer says when the view is scoped and offers a way back,
and `?org=` is honoured on load so other pages can deep-link into it. An org named
in the URL with no traffic in the window stays selected rather than silently
resetting to "All".

**3. Every admin page was an island.** Zero links between them, so an operator
investigating one customer retyped uuids by hand. Vector Storage rows now link to
that customer's **keys & limits** and **traffic**, and `inference-orgs` seeds its
search box from `?q=` — its filter already matched on id, so a deep link narrows 13
rows to 1. Verified end to end.

Also checked while here: both pages using `useSearchParams` already sit inside a
`Suspense` boundary, and a clean `next build` compiles with all three new API routes
and pages present. A first build attempt failed on `/contact` and `/cookies` —
neither of which exists in the repo — which was a stale `.next` from mixing a
dev-mode directory with a production build, not a real break.

---

## 10. "What is used, and is anything broken?" — the AI Overview (2026-07-31)

Asked of the finished admin: do we have proper filters and operations, how do we
know what is used most, and whether every feature works? Audited rather than
assumed, the answers were:

- **Filters: mostly present.** Pricing, orgs, usage, audit and observability all
  filter. Two gaps — Vector Storage had **none at all**, and Worker Fleet has none
  (6 fixed rows, acceptable).
- **Operations: almost none.** Pricing can edit and bulk-reprice; Orgs can change
  limits and revoke keys. There is still no kill/retry/reap, no quota lever, no
  feature switches.
- **"What is used most": nothing answered it.** No adoption view existed anywhere.
- **"Is everything working": nothing cross-cutting.** Worker Fleet covers runners
  and Observability covers requests, but an operator had to open eight pages and
  assemble the picture by hand.

### 10.1 The overview — `/dashboard/admin/inference-overview`

`lib/admin/feature-health.ts` + `app/api/admin/inference/overview/route.ts`, 21
tests. One row per AI capability, sortable **most-used-first** (what customers
actually use) or **problems-first** (what needs attention) — the same table
answering both questions.

A declarative registry for the same reason `runner-registry.ts` is one: 13
capabilities live in 13 tables with different status vocabularies, and hand-written
per-table queries drift. Every row/failure figure is an **exact database count**
(`head: true, count: "exact"`), never a fetched array measured client-side.

**Live picture (30-day window):**

| Used | Idle | Never used |
|---|---|---|
| Inference 1,679 · Agents 328 · Evals 28 · Vectors 10 · Connectors 2 | Fine-tuning (60d), Media (31d), Files (64d), Batches (64d), Prompts (33d), BYOK (67d) | **BYO deployments**, **Guardrail policies** |

`unused` and `idle` are deliberately **not** failures — a feature nobody has
adopted is a product fact, and painting it red teaches an operator to ignore the
page. Asserted by test.

Two structural facts the page now surfaces: **5 of 13 capabilities have no admin
page at all**, and **5 cannot have failures counted** because their tables have no
status column.

### 10.2 A bug this found in its own first draft

The registry initially listed `error` and `failed` as inference failure statuses.
Neither exists in `inference.usage_status` — Postgres rejected the whole `IN()`
with a **400**, the failure count silently became `null`, and the platform's busiest
capability was reported **healthy**. With the real enum values
(`error_upstream | error_rate_limit | error_budget | error_auth | error_validation
| error_internal`) it reads **degraded: 187 of 1,679 failing, 11.1%** against a 5%
tolerance.

Two changes so this cannot recur quietly:
- a test compares every capability's failure statuses against the enums from the
  migrations, exactly as `fleet.test.ts` now does for the runner registry;
- a failed failure-count is reported as `failure_error` and judged **unknown**,
  never folded into "this table has no status" — not knowing whether something is
  failing is different from knowing it is fine.

### 10.3 Vector Storage search

The one real filter gap. It now matches customer name and id, **collection and
embedding-model names, and connector names, kinds and statuses** — so searching a
connector finds the customer that owns it, rather than returning nothing. Verified:
`ahurasense-site` (a connector) and `3-large` (an embedding model) each narrow to
the right org, and a non-match shows an empty state explaining what is searchable.

