# A.I. Labs — Delivery Record

My contribution to the AI platform: what I built and what remains open.

The platform is a team effort; this covers only the parts I built, so it is not
a record of the whole product. The inventory below was cross-checked against the
repository history for commits authored with `deep.aghera@ahurasense.com`. It
also names the adjacent platform work I delivered during the same review period.

---

## At a glance

| | |
|---|---|
| **6** product areas built | **10** operator screens |
| **3** job runners + **2** shared runtimes | **13** faults found and fixed |
| **10** of those cost money or leaked information | **2** deployment steps still open |

---

## What I built

### Agents v2 — the durable agent runtime
The largest piece. Built from nothing to a working product over July.

| Delivered |
|---|
| `agentcore` durable runtime — Slice 1 MVP |
| Slice 2 — hosted tools and the agent builder UI |
| Stateful code interpreter (gated), tool I/O in traces |
| Agent memory with auto-recall, agent chaining, live streaming |
| On-behalf-of billing attribution, and the S3 sandbox session lifecycle |
| MCP client support — inline and registry servers, metering, management UI and scheduled health checks |
| Per-agent access keys, private and public, with dashboard run controls |
| Knowledge-base ingestion — PDF, DOCX and URL upload, one-call attach |
| MCP OAuth flow, runtime `tool_schemas` cache |
| Guard on the MCP OAuth token-refresh race that false-flagged healthy servers |
| Access-key rotation with a grace period |
| Agent delegation, the full management API and runtime reliability hardening |
| `file_search` reranking wired in; sandbox idle-deadline bumps throttled |

### Vector search and RAG
| Delivered |
|---|
| Hybrid search, cross-encoder rerank, grounded `/answer` endpoint |
| Surface the real rerank score instead of a stale vector similarity |
| RAG connectors and the data runner |
| Harden connector routes — close a crawler socket leak, end a re-OCR loop |
| Cite the source document per chunk; cap connector sync at the org quota |
| Ingest format parity between upload and connector sync; expose the RRF weights; fix three silent truncations |

### Media generation
| Delivered |
|---|
| Async video jobs, image error UX, loading skeletons, unit tests |
| TTS, STT, rerank and OCR; playground download and transcript copy |
| Video and music generation routes |

### Observability and governance
| Delivered |
|---|
| Request tracing, guardrails, prompt management |
| Complete prompt CRUD, version operations and version labels in the API and dashboard |
| Observe dashboard, trace APIs, full-route tracing |
| Eval service — datasets, runs, runner and dashboard |
| Eval-runner lifecycle hardening for reliable claim recovery and billing settlement |

### Model routing
| Delivered |
|---|
| Smart routing via `ahura/auto` and `ahura/auto-cheap` |
| Report the model vendor in `/v1/models`, advertise router ids |
| Reject unknown and disabled models instead of proxying them upstream |
| Catalog health-check automation that probes upstream models and deactivates rejected entries |

### Operator console
The AI Platform section of the admin dashboard. Before this, everything the AI
roadmap produced was operated by hand-written SQL and one-off scripts — the
existing admin managed the IaaS business and one AI-labelled section pointed at a
retired product.

**Ten screens**, all mine (the eleventh, `ai-agents`, is the older legacy page and
is not): AI Overview, AI Jobs, Worker Fleet, Agents, Vector Storage, Model Pricing,
AI Customers, AI Usage, Observability, AI Audit. Behind them, **14 admin API
routes**.

| Delivered |
|---|
| Operator console — agents, audit, customers, pricing, usage |
| AI overview, worker fleet, vector storage, observability |
| Act on the platform, not just observe it — retry, cancel, pause |
| Correct lifecycle reporting so paused runners appear on hold instead of looking active |
| AI Jobs page; read past PostgREST's 1,000-row cap; index the platform-wide reads |
| Pagination across the whole section; fix a Vector Storage crash on load |

Two capabilities in there are worth naming separately, because neither is a screen:

- **Capability kill switches.** Before this the platform had exactly one —
  `gpu_deploy_enabled` — and nothing covering inference, agents, media, connector
  syncs or fine-tuning. When an upstream provider degraded, the only lever was
  deactivating catalog models one at a time. There is now a switch per capability.
- **Sweep liveness.** The overview answers *"is any capability failing"* from rows
  customers created. It cannot answer *"is the machinery that recovers those rows
  still alive"* — a sweep that stops running produces no rows at all, it just stops
  fixing things. A separate endpoint reports whether each scheduled sweep actually ran.

### API surface
| Delivered |
|---|
| AI agent OpenAPI spec and flow |
| Billing system and OpenAPI updates |
| OpenAPI for AI services; centralised the AI service layer |
| API keys accepted on the control plane, scoped like the gateway — customers can provision without a browser |

### Delivery planning and audits
| Delivered |
|---|
| Phase 0–10 AI master plan, implementation plans, sequencing critique and gap analysis |
| Billing-completeness audit verified against the running code, with gaps carried into fixes or the open-item list below |

---

## Infrastructure I built, and what still needs deploying

Five worker packages and core runtimes are mine, along with the Cloudflare resources
the gateway needed for tracing, prompts and guardrails. Two are shared libraries;
three are deployable job runners.

### Workers created

| Worker | What it does | Ships via |
|---|---|---|
| `runner-core` | Shared claim, heartbeat, health, logging and settlement library extracted from the fine-tune and deploy runners | library, no deploy |
| `eval-runner` | Claims eval jobs, runs them against the gateway, reports cost | CI image + LKE script |
| `agent-core` | The agent loop itself — model turns, tool dispatch, step trace | library, no deploy |
| `agent-runner` | Executes durable agent runs on Kubernetes | **manifests only — see below** |
| `data-runner` | Crawls and syncs RAG connectors into vector collections; includes local runner, CI image and LKE bring-up wiring | CI image + LKE script |

### Cloudflare work

| Resource | For | State |
|---|---|---|
| Queue `ahura-inference-trace` | Request tracing — producer and consumer both wired | Configured |
| KV `PROMPTS` | Prompt registry lookups at the edge | **Placeholder id** |
| KV `GUARDRAILS` | Guardrail policy lookups at the edge | **Placeholder id** |

### Two things are not deployed

**The prompt and guardrail KV namespaces do not exist yet.** `workers/inference/wrangler.toml`
still carries `REPLACE_WITH_PROMPTS_KV_ID` and `REPLACE_WITH_GUARDRAILS_KV_ID`. The
code that reads them shipped on 06-26; the namespaces need creating in Cloudflare and
the four ids filling in before the gateway can be deployed with prompt management or
guardrails live.

**`agent-runner` has Kubernetes manifests but no image pipeline.** `deployment.yaml`
and `secret.yaml.template` exist, but unlike `eval-runner` and `data-runner` there is
no `.github/workflows/agent-runner-image.yml`, and the LKE bring-up script does not
mention it — the other two are referenced 19 and 10 times respectively, `agent-runner`
zero. Its image has to be built and pushed by hand today.

Neither is a code defect. Both are deploy steps that need a Cloudflare login and a
CI workflow, and both should be closed before the agent platform is relied on in
production.

---

## Faults I found and closed

These were discovered while building and reviewing the AI platform and its shared
services; the operator console made several of them visible for the first time.

| Fault | Consequence if unfixed |
|---|---|
| **Every agent run billed to the platform key's org, never the customer** | All agent model and tool cost misattributed |
| Eval-runner cost billed to the platform key | We paid for customers' eval runs |
| User-cancelled fine-tunes not charged for GPU time | Unbilled GPU spend |
| Our own infra and vendor names leaked in agent output | Disclosed our suppliers |
| **`/query` was exempt from the org spend cap** — adding paid rerank to it would have let an over-cap org bypass the hard cap entirely | Unbounded spend past the ceiling |
| Upstream provider names in error *text*, not just keys | Same leak, different field |
| Recovered media jobs completed unbilled | Lost revenue on retries |
| On-behalf-of marker written into UUID columns | Corrupt attribution data |
| AI Jobs landed empty, hid 70% of rows, misreported failures | Operators trusted a wrong screen |
| **Customers could read our upstreams, cost basis and key hashes** | Margin and credentials exposed |
| **Billing for vector collections that no longer existed** | 11 orphaned meters, ~$88/month |
| **Legacy agent stack billed at our cost and published it** | Zero margin, cost basis public |
| **Every provider catalog was stale — the sync endpoints existed but nothing invoked them** | `gpu_catalog` 41 days old, `linode_types` 6, `gpu_inventory` 2.5, all presented as current |

### The pricing fault, in full

Three copies of model prices had drifted apart:

1. `agents.platform_models` held our **supplier cost** — charged to customers
   *and* served by an endpoint requiring **no login**.
2. A hardcoded table in `lib/ai/models.ts` priced `gpt-4o-mini` at our cost and
   `deepseek-r1` **below** what we pay for it.
3. `inference.models.pricing` — the correct list the rest of the platform uses.

There is now one price list, read at request time rather than copied. A model we
cannot price is withheld rather than sold at cost, and a run that cannot be priced
is refused **before** the model is called rather than served free.

---

## Also delivered in this period

Alongside the AI work, I delivered the following shared-platform changes. These
are called out separately so the AI record does not hide work that landed in the
same review window. Their branch status is recorded below.

### Compute reliability and security

- Closed console renewal loops, unified rate limiting and guarded restore operations.
- Added idempotent VM creation so a failed deploy does not lock a customer out for
  24 hours, with clearer provider errors and end-to-end lifecycle coverage.
- Added reconcile safety so a bad provider response cannot classify the whole fleet
  as orphaned, and added cleanup retries for genuinely abandoned resources.
- Closed billing gaps when compute servers or Kubernetes clusters are destroyed or
  abandoned partway through provisioning.
- Removed the resold compute catalog from browser-readable access and scrubbed
  provider details from customer-facing compute errors.

### Pricing and catalog consistency

- Consolidated compute, GPU and bare-metal prices so marketing pages, service pages,
  deploy flows and billing read from shared catalogs rather than conflicting copies.
- Corrected GPU editorial data, featured pricing, bare-metal double pricing and
  object-storage's unsafe `Free` fallback when price lookup fails.
- Scheduled provider catalog syncs through the existing worker cron and added shared
  authentication for internal sync and reconcile routes.
- Updated the database-version catalog to match the provider and added regression
  coverage around compute, GPU, storage and database catalog behavior.

### Dashboard, support and quality

- Consolidated profile and account routes into one tabbed settings experience,
  preserving OAuth return paths and updating dashboard navigation and deep links.
- Simplified support ticket creation, removed the dead resource picker and fixed GPU
  inquiry formatting in customer and admin views.
- Corrected terms, privacy and sign-in links that pointed to missing routes.
- Separated Playwright specs from Vitest discovery, removing 15 phantom unit-test
  failures while retaining dedicated end-to-end coverage.

---

## Where it lives

The AI work through legacy-agent pricing is merged into `dev-with-ai-services`.
The August compute, pricing, catalog, billing, storage, database and support fixes
are merged into `origin/dev`. The latest link, test-configuration and settings work
is still on `origin/fix/qa-reported-bugs` and `origin/settings-consolidation`; those
commits are not yet ancestors of the local `origin/dev` ref.

The reviewed trees typecheck clean, build, and introduce no new test failures.

---

## Open items

None block the merge. All are data or operational rather than defects in shipped
code.

| Item | Detail | Type |
|---|---|---|
| Two models unpriceable | `anthropic/claude-sonnet-4.5` and `google/gemini-3-flash-preview` have no price record, so they are withheld rather than sold at cost | Data |
| A dead model slug | `openai/gpt-oss-120b:free` no longer exists upstream; one agent still points at it and is failing | Data |
| Credential in the repository | A permissions file merged in from the compute work contains a plaintext SSH password. It needs **rotating** — deleting the file does not remove it from the repository's history | Security |
| Ingestion embeds not billed | `/upsert` and the dashboard file/URL upload run embedding calls the customer is never charged for — the same pattern fixed on the search side. Flagged deliberately as the next slice, not an oversight | Billing |
| Prompt + guardrail KV not created | Two namespaces still hold `REPLACE_WITH_*` ids; the gateway cannot serve prompt management or guardrails until they exist | Deploy |
| `agent-runner` has no image pipeline | Manifests exist, but no CI workflow and no mention in the LKE bring-up — built by hand today | Deploy |
| Scheduled sweeps in production | Worth re-confirming they run against the current build before relying on them | Verify |

---
