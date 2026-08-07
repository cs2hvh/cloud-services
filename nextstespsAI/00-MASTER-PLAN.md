# AhuraCloud → Complete AI Development Cloud — Master Plan (0→1)

**Date:** June 2026 · **Status:** Proposed · **Scope:** ~85–100 eng-weeks across 9 phases

This plan expands the GPU + AI verticals into a complete AI development cloud comparable to AWS Bedrock/SageMaker, Google Vertex AI, Azure AI Foundry, Together/Fireworks, and Modal — researched against the June-2026 market state and designed onto the existing substrate (CF Worker gateway, Next.js control plane, LKE runners, billing spine; RunPod today, own B300/H200 Yotta fleet later).

**How this was produced:** an 18-agent research + design pass — 8 web researchers swept the current catalogs of AWS, Google, Azure, the frontier-lab platforms (OpenAI/Anthropic/Mistral), AI-native clouds (Together, Fireworks, Baseten, Groq, Replicate), serverless-GPU/dev-infra (Modal, E2B, CoreWeave, Lightning), the LLMOps market (LangSmith, Langfuse, Braintrust, guardrails vendors), and RAG/agent/media infrastructure; one agent merged everything into a gap analysis against the existing platform; 8 architects designed each service cluster against the real codebase patterns; one adversarial critic reviewed for completeness, overlap, and sequencing.

**Hard constraint preserved throughout:** upstream providers (RunPod / OpenRouter / Cloudflare / etc.) are never visible on any customer surface.

## Document map

| Doc | Cluster | v1 effort |
|---|---|---|
| [01-multimodal-apis.md](01-multimodal-apis.md) | Image gen, TTS/STT, OCR, rerank, moderation, video, realtime voice | ~8.5 ew |
| [02-agent-infrastructure.md](02-agent-infrastructure.md) | Responses API, agent runtime, hosted tools, MCP hosting, browser, memory | ~10 ew (28 full) |
| [03-serverless-gpu-sandboxes.md](03-serverless-gpu-sandboxes.md) | GPU functions, code-exec sandboxes, GPU notebooks | ~10.5 ew |
| [04-rag-data-platform.md](04-rag-data-platform.md) | Knowledge Bases API, parsing/OCR, hybrid search, connectors, datasets, RAG evals | ~10 ew (22 full) |
| [05-training-platform.md](05-training-platform.md) | Full FT, DPO, RFT/GRPO, tracking, registry, quantization, multi-node clusters | ~11.5 ew |
| [06-evals-observability-guardrails.md](06-evals-observability-guardrails.md) | Tracing, prompt mgmt, evals, A/B, guardrails, analytics | ~12.5 ew (19.5 full) |
| [07-inference-completeness.md](07-inference-completeness.md) | Structured outputs, smart routing, fallbacks, cache billing, tiers, dedicated endpoints, PTU, multi-LoRA | ~12 ew + fleet tail |
| [08-enterprise-marketplace.md](08-enterprise-marketplace.md) | Workspaces, private hosting, reserved capacity, marketplace, compliance surfaces | ~9 ew (21 full) |
| [09-critique-and-sequencing.md](09-critique-and-sequencing.md) | Adversarial review: orphaned gaps, shared primitives, build order, realism | — |
| [10-gap-analysis.md](10-gap-analysis.md) | Full capability matrix vs the June-2026 market + resell-vs-build calls | — |

Each cluster doc contains: services & customer value, build-vs-proxy decisions, architecture mapped onto the 4 deployables, Supabase migration SQL sketches, API surface with request/response examples, TypeScript code sketches in the repo's style, billing-spine enrollment, sliced delivery plan with estimates, and risks.

## 1. Where the platform stands (gap summary)

**HAVE:** chat completions + embeddings over an aggregated 52-model catalog (the core wedge), batch API, exact + semantic gateway cache (rare differentiator), LoRA fine-tuning, Tier-1 dedicated serving, BYO model deploy, vector store, BYOK, orgs/RBAC, audit log, spend caps, GPU IaaS.

**PARTIAL:** structured outputs (passthrough only), vision input (unproductized), prompt-cache billing (not surfaced), dedicated endpoints (FT/BYO only), serverless GPU (BYO-deploy only).

**MISSING — priority order:**

1. Audio APIs (STT + TTS) — largest pure absence; table-stakes; thin proxy lift
2. Image generation — table-stakes for any AI cloud
3. Reranking — completes the retrieval stack
4. Moderation + guardrails (PII redaction, jailbreak) — enterprise table-stakes + self-protection for the public Agents endpoint
5. Compliance bundle (SOC2/ISO/DPDP, SSO/SAML, status page, SLA, postpaid) — 9–12-month lead; start now
6. Structured-outputs enforcement at the gateway
7. **Billing completeness + markup** — FT/serving/vector compute not actually charged; 0% margin everywhere; the revenue floor (see Phase 0)
8. Webhooks + LLM observability
9. Model evals service
10. Full FT + DPO (axolotl already supports — near-free differentiator)
11. Multi-LoRA shared serving (per-token FT inference) — fleet-gated, locked Phase 12
12. Managed RAG / document-ingestion API + hybrid search
13. Agent tools (web search, MCP, code interpreter)
14. Serverless GPU functions + dedicated catalog endpoints + reserved capacity — the fleet monetization layer
15. Realtime voice — differentiator; proxy when a brand-hideable upstream exists

**Resell-vs-build:** PROXY (brand-hidden): image gen, TTS, STT (v1), web search, realtime voice. BUILD: rerank, moderation, structured outputs, observability, evals, all training, multi-LoRA, RAG, MCP/tool-calling, sandboxes, everything fleet-related. HYBRID: serverless GPU functions (own product layer; upstream execution now, own fleet later — invisible swap).

## 2. Phase 0 — the unowned prerequisite (build FIRST, ~5–6 ew)

The critic's top finding: all 8 designs independently assume this slice exists; none owns it.

1. **Billing completeness + markup.** Charge FT/serving/vector compute; verify billing-vuln remediations applied in prod; one markup layer (catalog `pricing` vs `upstream_cost_cents` margin separation, admin-togglable via the `platform_settings` pattern); ONE migration extending the `service_type` + grace allowlists for all planned SKUs — not eight separate ones.
2. **`lib/runner-core`.** Extract the ft-runner shape (Postgres claimer → BullMQ → heartbeat → atomic state transition → health server → watchdog hook) into a framework. Otherwise the designs fork it six times (media/agent/sandbox/data/training/eval) on a 2-node cluster. Target: 2–3 runner processes hosting job-type handlers.
3. **Unified usage-event pipeline.** ONE `UsageEvent` extended with `numUnits`/`unitLabel`/`modality`; ONE consumer with `computeUnitCost()` (per-image/char/second/page/rerank-unit). Kill the parallel queues two designs invented. Spend caps + 80/100% budget alerts then work for every new SKU automatically.
4. **One `inference.dedicated_endpoints` + reservation schema** (owned by the Inference cluster; Enterprise layers contracts on top — two designs defined conflicting schemas).
5. **Brand-scrub for binary/log/stream surfaces.** A write-time sanitizer beyond `customerSafeErrorMessage()`: image EXIF/watermark strip, response headers, training-log scrubbing, sandbox stdout policy, citation envelopes.
6. **Shared media/blob helper.** R2 signed URLs via `cdn.ahurasense.com`, lifecycle TTLs, ZDR-aware (ZDR keys ⇒ inline base64, never persisted).

**Phase 0 exit criteria:** all existing SKUs metering correctly (incl. FT/serving/vector compute); markup toggle live; runner-core running the ft + deploy workloads unchanged; the unified consumer pricing a synthetic per-unit event end-to-end.

## 3. Consolidated roadmap

| Phase | Ships | ~ew | Gate |
|---|---|---|---|
| **0** | Billing completeness + markup, runner-core, unified usage events, endpoint schema, brand-scrub sanitizer, cdn helper | 5–6 | **nothing starts before this** |
| 1 | Rerank, moderation, structured outputs, tool guarantees, hybrid search + grounded answers | ~6 | pure gateway/substrate — fastest revenue |
| 2 | Image gen, TTS, STT, OCR (brand-hidden proxies) | ~5.5 | upstream selection |
| 3 | Tracing, guardrails productization, prompt management, evals | ~12.5 | the stickiness layer |
| 4 | data-runner (first runner-core instantiation), Knowledge Bases, connectors | ~7 | |
| 5 | Full FT, DPO, experiment tracking, model registry, quantization, CPT, distillation | ~11.5 | closes train→eval→serve loop |
| 6 | Sandbox substrate (ONE Firecracker pool, security review) → GPU functions, notebooks → Agents code interpreter | ~12.5 | security audit gate |
| 7 | Agents v2: Responses API, durable runtime, search tools → browser → MCP hosting/registry | ~14 | consumes Phase-6 pool |
| 8 | Workspaces, dedicated endpoints, compliance surfaces, smart routing/fallbacks/cache-billing/tiers, marketplace | ~14 | status page + SOC2 track |
| 9 | **Fleet-gated:** multi-LoRA Tier 2, reserved GPU/PTU, multi-node training, GRPO at scale, realtime voice, speculative turbo | ~20+ | Yotta B300/H200 DPR |

**Parallel ops/compliance track from day one:** SOC2 evidence collection, public status page, platform alerting/observability, SSO. 9–12-month lead; gates Phase 8–9 contracts.

**New always-on deployables, consolidated per the critique:** 2–3 runner-core processes (media/data/training/eval/agent job handlers), the sandbox pool (Firecracker), the realtime relay (gated), the cluster scheduler (fleet-gated). NOT six forked runners.

## 4. Top risks

1. **Sandbox isolation** is the platform's largest new security boundary (a microVM escape = platform-wide breach) — one shared security review before any customer/model code executes; built once, consumed by both the Serverless and Agents clusters.
2. **Brand-scrub on binary/log/stream surfaces** is the highest-leakage area across every cluster — a Phase-0 primitive, audited per slice, not retrofitted.
3. **Cost runaway** (agent loops, video generation, eval runs, GPU functions) — per-run/job cost ceilings, mid-run balance re-checks, and a Durable-Object concurrent-GPU-second guard, standardized in Phase 0.
4. **Single-VM control plane + single Redis** vs ~4 new always-on services — the HA/observability work (see the enterprise-readiness assessment) must run alongside this roadmap.
5. **Selling guarantees on rented capacity** — SLAs and 6–12-month reservations only on the owned fleet; bridge reservations capped at ≤3 months; "soft residency" only until the control plane is regionalized.
6. **pgvector ceiling** — keep `inference.hybrid_search` as the stable RPC contract; swap the engine behind it at ~50M rows / p95 > 300ms.
7. **Postpaid + reservations sit on audited billing RPCs** — hard-gated on the billing-vuln remediation; reservations must use hardened atomic paths only.

## 5. Verification discipline (every slice)

Migration applied to a staging branch DB · unit tests on billing settle paths (idempotency-via-atomic-transition) · gateway route tests · one e2e happy path · brand-scrub checklist (grep all new write paths for upstream names) · spend-cap interaction test (hard-cap 402 fires *before* work starts).
