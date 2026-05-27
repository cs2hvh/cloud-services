# Delivery Roadmap

Eight phases over ~15 weeks. Public beta cuts at the end of Phase 3 (~7 weeks). Each phase ships with the enterprise pillars baked in — observability, audit log, rate limits, budgets — not retrofitted later.

## Phase 0 — Foundation (2 wks)

**Status:** drafted; operator deploy in progress.

- Cloudflare Workers project + KV namespaces + Durable Objects + Queues
- Supabase `inference_*` schema (12 tables, 10 enums, 4 helper RPCs, RLS everywhere)
- Upstash Redis account + k8s BullMQ worker pool skeleton (provisioned later in Phase 1 when first async job lands)
- OpenTelemetry collector → Grafana Cloud (free tier to start)
- Better Stack status page registered
- R2 buckets + KMS keys
- 4 sibling `/services/*` landing-page stubs in editorial DNA
- Marketing navbar updated

**Ship signal:** `curl https://api.cs2hvh.com/v1/health` returns 200; `/v1/key` returns the test key snapshot.

## Phase 1 — Inference v1 + Org model (3 wks)

The big one. Wires up real OpenRouter proxying with the enterprise pillars.

**Inference surface:**
- `POST /v1/chat/completions` — OpenAI-compat, streaming SSE, cancel propagation, BYOK + platform billing dual mode
- `POST /v1/messages` — Anthropic-compat shim (adapts to/from OpenAI Chat Completions)
- `POST /v1/embeddings` — OpenAI-compat
- `GET /v1/models` — flat catalog with capability flags (seeded with 6 frontier models)
- `GET /v1/key` — already shipped in Phase 0

**Org + dashboard (in Next.js app):**
- Org create / member invite / role management screens
- API key create / rotate / revoke with budget + scope + ZDR config
- BYOK key vault with provider verification
- Usage charts (last 7/30/90 days, per-model, per-key)
- Audit log viewer

**Pillars activated:**
- Token-bucket rate limit live (Durable Object), default 60 RPM
- Real-time spend hard-cap enforced before serving
- L1 response cache for non-streaming completions
- OTel traces per request with span attributes for model + billing + cost
- Audit log writes for every mutating org/key action
- Load tested to 500 RPS sustained, p99 latency overhead < 50ms vs direct-to-OpenRouter

**Ship signal:** developer can `pip install openai`, point base URL at `https://api.cs2hvh.com/v1`, chat with Claude 4.7 via platform billing AND with their BYOK key, and see the request in the dashboard within 2 seconds.

## Phase 2 — Catalog curation + routing UI (1 wk)

OpenRouter has 400+ models. We surface a curated subset with our own editorial.

- Featured-model subset (~30) with human-written descriptions, capability badges, off-peak markers
- Routing presets UI (saved fallback chains, provider preferences) — `inference.model_presets` table
- Presets compile into the OpenRouter `provider.*` headers we forward
- Response caching for high-frequency identical requests (semantic optional later)
- Off-peak pricing window enforced for platform-billed (discount our markup; OpenRouter rate stays)

**Ship signal:** model browser feels curated, presets work end-to-end, off-peak window visibly discounts platform-billed spend.

## Phase 3 — Playground (1 wk)

Developer onboarding UX. The thing devs hit first when evaluating us.

- Interactive picker, parameter sliders (temperature, top_p, max_tokens, ...)
- Multi-model side-by-side compare
- Save prompt as a preset
- Copy-as-cURL / Python / TypeScript snippet
- Uses prod `/v1` path — playground requests count against the user's quota and appear in their audit log

**Ship signal:** public playground live at `/services/inference/playground`, anonymous trials cap to 5 requests then prompt sign-in.

**🎯 Public beta cut here.** First user-facing announcement. Total elapsed: ~7 wks.

## Phase 4 — Embeddings + Vector store (2 wks)

The other half of RAG.

- `/v1/embeddings` real implementation (OpenRouter has BGE-M3, Voyage, OpenAI text-embedding-3; we expose all)
- Managed vector collections API (`POST/GET/DELETE /v1/vector/collections`, upsert, query)
- Per-tenant logical isolation in `inference.vector_rows`
- Batch upsert via BullMQ for large imports
- Dedicated Postgres read replica for query path

**Ship signal:** RAG demo against a user collection works end-to-end: upload PDFs → embed → query → relevant chunks back.

## Phase 5 — Fine-Tuning on RunPod (3 wks)

LoRA training as a product. High stickiness — once a customer has weights with us, migration cost is real.

- `POST /v1/fine-tuning/jobs` API
- BullMQ worker orchestrates RunPod GPU pods (axolotl or unsloth)
- Dataset upload to R2; training metadata in `inference.finetunes`
- Output adapter pushed back to R2, registered as `ahura/<base>:user-ft-{id}` in `inference.models` with `serving_type = 'runpod_ft'`
- Edge gateway routes those model IDs to a RunPod Serverless Worker hosting the LoRA + base
- Training metered same as inference; per-GPU-hour cost passed through with no markup

**Ship signal:** customer uploads a JSONL dataset, training finishes within hours, the new model ID is callable via `/v1/chat/completions` the next minute and serves real traffic.

## Phase 6 — BYO Model Deploy on RunPod (2.5 wks)

The "Replicate / Baseten for our customers" piece.

- `POST /v1/deployments` API
- Accepts Truss config, Dockerfile, or HF repo + serving config
- Container build queue (BullMQ → k8s build pod → push to GHCR/R2)
- Deployed to RunPod Serverless Workers; endpoint ID stored in `inference.deployments`
- Autoscale config (min/max workers, idle timeout) with per-org guardrails
- Deployed models expose as model IDs in `/v1/models` with `serving_type = 'runpod_byo'`

**Ship signal:** customer pushes a custom container, gets a stable model ID within 5 minutes, serves inference at sub-1s cold start.

## Phase 7 — Polish + SOC 2 prep (1.5 wks)

- Prompt-injection guardrail (regex + optional LLM-based scoring)
- Smarter response cache (semantic similarity matching, configurable threshold)
- Batch inference endpoint (50% discount on platform-billed, mirroring DO's pattern)
- SOC 2 readiness documentation (control matrix, access reviews documented, audit log export, runbooks for top 5 incident classes)

**Ship signal:** SOC 2 audit firm engagement-ready; status page green for 30 consecutive days; runbooks have been walked through.

## Timeline summary

| Cumulative weeks | Milestone |
|---|---|
| 2 | Phase 0 done — gateway live, returns stubs |
| 5 | Phase 1 done — real inference via OpenRouter |
| 6 | Phase 2 done — catalog + routing UI |
| 7 | Phase 3 done — **public beta launch** |
| 9 | Phase 4 done — embeddings + vector live |
| 12 | Phase 5 done — fine-tuning live |
| 14.5 | Phase 6 done — BYO deploy live, **full platform** |
| 16 | Phase 7 done — SOC-2-ready, status page green 30d |

## What gets pushed to later

- **Multi-region.** Single region (US) at launch. EU pinning when a customer commits.
- **SSO (SAML/OIDC) + SCIM.** When the first enterprise customer needs it.
- **Image/audio/video gen as a separate product line.** Defer unless OpenRouter's catalog gets weaker here.
- **Anyone's compliance certification.** Architecture is ready (audit log, ZDR, encryption); pursuing cert is a 3-month track separate from product work.
