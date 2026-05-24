# Inference Platform — Module Docs

The AhuraCloud Inference platform is a four-product AI services suite added in the `ai` branch:

1. **Serverless Inference** — OpenAI-compatible API proxying every frontier and open-source model via OpenRouter
2. **Fine-Tuning** — LoRA training on our RunPod GPU fleet, auto-deployed to the inference catalog
3. **Embeddings + Vector Store** — managed embedding endpoints + pgvector collections
4. **Model Hosting** — BYO container deploys on RunPod serverless workers

## Where to look

| Doc | What's in it |
|---|---|
| **[STATUS.md](./STATUS.md)** | **Live build state + session handoff. Read first.** Captures what's deployed, what works, what's pending, all decisions made, file map, known gotchas, instructions for continuing in a new session. |
| [architecture.md](./architecture.md) | System design, components, data model, key tradeoffs |
| [setup.md](./setup.md) | Operator runbook — apply migration, configure Cloudflare, deploy Workers, verify |
| [phases.md](./phases.md) | 8-phase delivery roadmap with scope, durations, ship signals (planning view) |
| [migration-ahurasense.md](./migration-ahurasense.md) | How to switch the gateway domain from `cs2hvh.com` (current) to `ahurasense.com` once permissions land |
| [load-testing.md](./load-testing.md) | How to run the k6 load test and interpret results — Phase 1 ship signal |
| [fine-tuning-runner.md](./fine-tuning-runner.md) | Phase 5.B operator contract: what the BullMQ FT runner reads/writes and how to wire RunPod orchestration |
| **[phase-5b-build-guide.md](./phase-5b-build-guide.md)** | **Phase 5.B canonical implementation guide** — validated against Together AI, Fireworks, OpenAI, Baseten, Modal, RunPod 2026 architectures. Includes Dockerfiles, BullMQ runner code, webhook + eval gate, k8s deployment YAML, pricing model. |

## Code locations

| Path | Purpose |
|---|---|
| `workers/inference/` | Cloudflare Workers edge gateway (Hono, OpenAI-compat /v1) |
| `supabase/migrations/20260523000001_create_inference_schema.sql` | `inference.*` schema: orgs, members, keys, models, usage, audit, finetunes, deployments, vector collections |
| `app/(marketing)/services/inference/page.tsx` | Public landing page |
| `app/(marketing)/services/fine-tuning/page.tsx` | Public landing page |
| `app/(marketing)/services/embeddings/page.tsx` | Public landing page |
| `app/(marketing)/services/model-hosting/page.tsx` | Public landing page |
| `components/navbar-client.tsx` | Top nav — 4 new AI services added to PRODUCTS list |

## Key design decisions (captured 2026-05-23)

- **OpenRouter is the single upstream for all inference.** No self-hosted vLLM workers. RunPod is used only for Fine-Tuning and BYO model deploys.
- **0% markup on inference.** Pass-through OpenRouter rates. Revenue comes from Fine-Tuning, BYO Deploy, Vector Store, and bundled AhuraCloud compute spend.
- **Separate `inference_*` schema** — does NOT reuse the existing `ai_agents.*` schema. The two products coexist; AI Agents may eventually call the new gateway internally.
- **No "AI" sub-brand.** Each capability is a sibling `/services/*` page like `/services/compute` or `/services/database`.
- **Enterprise-grade from day 0** — multi-tenant orgs, per-key budgets + IP allowlists + ZDR toggle, audit log, response caching, edge gateway, OTel observability. Compliance certifications (SOC 2 / GDPR / HIPAA) deferred but architecture is ready.
- **Scale target:** 100k requests/hour (~500 RPS burst). Single-region MVP; multi-region designed-for but not shipped at launch.

## Current status

**Phase 1 SHIPPED 2026-05-24** on the `ai` branch — public beta ready.

- ✅ Phase 0 — foundation deployed end-to-end on `api.cs2hvh.com` (Supabase schema, Cloudflare Workers + KV + DO + Queues, secrets, DNS, marketing pages, sidebar nav)
- ✅ Phase 1.A–G — real inference (`/v1/chat/completions`, `/v1/messages`, `/v1/embeddings` stub, `/v1/models`, `/v1/key`, `/v1/health`), 52-model catalog, BYOK with AES-GCM, usage + audit queue consumers, full dashboard (overview / api-keys / byok-keys / usage / audit / members / settings)
- ✅ Phase 1.H — k6 load test passed: 84,811 reqs in 3.5min, 0.25% HTTP failure rate, p95 latencies well under thresholds (health 15ms, key 279ms, models 293ms)
- ⏳ Phase 2 — Catalog curation UI + response caching + off-peak pricing (next)

**For full live state — what's deployed where, what works end-to-end, all decisions, known gaps, file map, and instructions for continuing in a new session — see [STATUS.md](./STATUS.md).**

See [phases.md](./phases.md) for the full 8-phase roadmap.
