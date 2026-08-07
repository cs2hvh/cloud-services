# Gap Analysis - AhuraCloud vs June-2026 AI Cloud Market

## Priority gaps (ordered)

- 1. Audio APIs (STT + TTS) — the largest pure absence; table-stakes on every competing AI cloud, blocks the voice-app segment entirely, and is a thin proxy lift behind the existing /v1 gateway.
- 2. Image generation API — table-stakes for any aggregator-positioned AI cloud; high-volume per-call revenue; slots into the same gateway/billing path as chat.
- 3. Reranking endpoint — table-stakes completion of the retrieval stack (embeddings + vector store already HAVE); tiny model, perfect fit for the existing serverless deploy substrate.
- 4. Moderation + configurable guardrails (incl. PII redaction) — enterprise table-stakes and self-protection for the public Agents chat endpoints; small classifier fits existing GPU substrate.
- 5. Compliance + enterprise readiness bundle (SOC 2/ISO 27001/DPDP, SSO/SAML, status page + SLA, postpaid invoicing) — gates all enterprise revenue and is prerequisite for the Yotta own-fleet DPR story; long lead time so must start now.
- 6. Structured outputs enforcement at the gateway — cheap table-stakes DX win: schema validation + constrained retry in the Worker on top of passthrough.
- 7. Billing completeness + markup (charge FT/serving/vector compute, fix GPU metering gaps, introduce nonzero margin) — not a market capability but the revenue floor under every other gap; substrate already exists.
- 8. Webhooks + LLM observability upgrade (traces, latency/cost analytics) — table-stakes DX that builds directly on the existing CF Queues audit/usage pipeline; drives stickiness.
- 9. Model evals service — emerging table-stakes; closes the train-evaluate-deploy loop and is the proof point that sells the fine-tuning product; composable from batch API + playground.
- 10. Full fine-tuning + DPO — axolotl already supports both; near-zero engineering for a real differentiator over LoRA-only competitors at this tier.
- 11. Multi-LoRA shared serving (per-token FT inference) — competitors price FT inference at base-model per-token rates; per-pod-hour is the main FT adoption blocker; economics work once owned GPUs land (already slotted as Phase 12).
- 12. Standalone managed RAG / document-ingestion API + hybrid search — productize what the Agents KB pipeline already does internally; strong attach revenue to vector store.
- 13. Agent tools (web search grounding, external API/MCP tool calling) — without tools the Agents product is demo-grade by 2026 standards; search is resellable, tool-calling is gateway work.
- 14. Serverless GPU functions + dedicated catalog endpoints + reserved capacity — the monetization layer for the planned B300/H200 fleet; sequence behind the fleet decision.
- 15. Realtime voice API — differentiator, not table-stakes; proxy when a stable brand-hideable upstream exists.

## Resell vs build

- Image generation: RESELL — proxy a brand-hidden media-inference aggregator behind api.ahurasense.com/v1/images using the existing key/billing/cache plumbing; migrate top models (Flux-class) to own B300 fleet later for margin. Route all upstream errors through customerSafeErrorMessage().
- Speech-to-text: RESELL now, BUILD within a quarter — start proxied via an aggregator; Whisper-class models run cheaply on the existing deploy-runner -> serverless-GPU path, so in-housing is low-lift and margin-positive.
- Text-to-speech: RESELL — best voices are proprietary (no self-host option); proxy brand-hidden; optionally add a budget tier later with an OSS voice model on own GPUs.
- Reranking: BUILD — host open rerankers (bge-reranker-v2-class) on the existing serverless substrate; latency-sensitive, tiny GPU footprint, better margin, zero brand-leak risk.
- Moderation/guardrails: BUILD — Llama-Guard-class classifier self-hosted + policy middleware in the CF Worker; safety policy cannot be outsourced, and a proxied safety SaaS is a brand-leak hazard in exactly the surfaces (error messages) hardest to scrub.
- Structured outputs: BUILD — Worker-level JSON-schema validation and constrained retry over passthrough provider support; no upstream dependency to hide.
- Compliance/SSO/SLA/status page/invoicing: BUILD — organizational and process work; inherently not resellable. Start SOC 2 evidence collection immediately given 9-12 month lead.
- Billing completeness + markup: BUILD — pure internal work on the existing billing spine (bill_service_cycle_atomic, metering cron); prerequisite: fix the confirmed credit-mint/Stripe vulns before re-enabling top-ups.
- Webhooks + observability: BUILD — extend the CF Queues audit/usage pipeline into trace storage + analytics UI; if accelerating with OSS (Langfuse-class), self-host only — a third-party SaaS would leak both brand and customer prompts.
- Model evals: BUILD — thin harness over the batch API with judge models drawn from the own catalog; differentiating logic, no resell target exists that hides cleanly.
- Full FT + DPO: BUILD — same axolotl + ft-runner + R2 substrate; config-level expansion plus larger GPU SKU mapping.
- Multi-LoRA shared serving: BUILD — vLLM/LoRAX multi-adapter pool; only economical on owned or committed GPUs, so sequence with the Yotta fleet (consistent with deferred Phase 12).
- Managed RAG API + hybrid search: BUILD — extract the Agents KB ingestion pipeline into a standalone API over the existing pgvector store; add tsvector+RRF hybrid on Postgres. Use OSS parsers in-process; avoid SaaS document parsers (brand + data-flow leak).
- Agent web search/grounding: RESELL — proxy a search API (Brave/Exa-class) brand-hidden as a platform 'web_search' tool; sanitize citations and error strings at the gateway.
- Agent tool calling / MCP: BUILD — orchestration loop in the Agents runtime; it is product logic on top of inference already owned, nothing upstream to resell.
- Serverless GPU functions: HYBRID — product layer (API, image build, cold-start UX, billing) built in-house; execution substrate via the existing upstream serverless relationship today, own k8s + fleet later. Substrate swap stays invisible because the brand never appeared.
- Realtime voice: RESELL — WebSocket proxy at the CF Worker to an upstream realtime API once one is stable enough to hide; building speech-to-speech serving in-house is off-strategy.
- Reserved capacity / multi-node clusters / private networking / data residency: BUILD — these exist only as expressions of the owned B300/H200 Yotta fleet; reselling defeats the entire DPR thesis. India DPDP residency is the flagship differentiator to design for from day one.

## Full capability matrix

### Inference APIs & Model Access

| Capability | Status | Importance | Who has it | Notes |
|---|---|---|---|---|
| OpenAI-compatible chat completions with streaming | HAVE | table-stakes | OpenAI, Together, Fireworks, Groq, Bedrock, Vertex — universal | api.ahurasense.com/v1 on CF Workers; proxies 52-model catalog |
| Text embeddings API | HAVE | table-stakes | OpenAI, Cohere, Together, Vertex, Voyage | OpenAI-compatible embeddings via gateway |
| Aggregated multi-model catalog (frontier + OSS behind one API/key) | HAVE | strong-differentiator | Bedrock, Vertex Model Garden, Together; aggregators | 52 models via brand-hidden upstream proxy; this is the core wedge vs single-lab platforms |
| Tool/function calling (passthrough) | HAVE | table-stakes | All majors | Rides on chat-completions payload; passthrough to upstream models |
| Structured outputs / JSON-schema guarantee | PARTIAL | table-stakes | OpenAI, Fireworks, Together, Azure | Model-level passthrough only; no gateway-side schema validation, constrained decoding, or retry guarantee |
| Vision / multimodal input on chat models | PARTIAL | table-stakes | OpenAI, Anthropic, Gemini, Bedrock, Fireworks | Works implicitly for multimodal catalog models but undocumented/unproductized; no image-input billing distinction surfaced |
| Image generation API | MISSING | table-stakes | Vertex (Imagen), Bedrock, Together (Flux), Fireworks, Replicate, Fal, Azure | No /v1/images at all; every competing AI cloud ships this |
| Speech-to-text (transcription + translation) | MISSING | table-stakes | OpenAI (Whisper/gpt-4o-transcribe), Groq, Fireworks, Azure, Vertex, Deepgram | No audio surface anywhere on the platform |
| Text-to-speech | MISSING | table-stakes | OpenAI, Azure, Vertex, ElevenLabs, Cartesia | Absent; pairs with STT for the voice-app segment |
| Realtime voice (speech-to-speech, WebSocket) | MISSING | strong-differentiator | OpenAI Realtime, Gemini Live, Azure | Emerging but not yet universal table-stakes |
| Video generation | MISSING | nice-to-have | Vertex (Veo), Bedrock (Nova Reel), Replicate, Fal | High GPU cost, niche demand; fine to defer |
| Reranking API | MISSING | table-stakes | Cohere, Together, Jina, Voyage, Bedrock | The missing third leg of the retrieval stack (embeddings + vector store exist) |
| Moderation / safety classification endpoint | MISSING | table-stakes | OpenAI (free moderation), Azure Content Safety, Mistral, Llama Guard on Together | No content-safety API; also leaves own Agents product unprotected |
| Batch (async, discounted) inference | HAVE | table-stakes | OpenAI, Anthropic, Together, Vertex, Bedrock | Batch API shipped |
| Gateway response caching (exact + semantic) | HAVE | strong-differentiator | Portkey/Helicone-class gateways; rare among clouds | L1 exact + semantic cache; few first-party clouds offer semantic caching natively |
| Provider-side prompt caching (discounted cached input tokens) | PARTIAL | table-stakes | OpenAI, Anthropic, Gemini, Bedrock | Passes through upstream; cached-token pricing not explicitly surfaced or marketed |
| Dedicated endpoints / provisioned throughput for catalog models | PARTIAL | strong-differentiator | Together Dedicated, Fireworks, Baseten, Bedrock Provisioned | Exists for fine-tunes (Tier 1) and BYO deploys; no one-click dedicated capacity for arbitrary catalog OSS models |

### Model Customization & Training

| Capability | Status | Importance | Who has it | Notes |
|---|---|---|---|---|
| Managed LoRA/PEFT fine-tuning jobs | HAVE | table-stakes | OpenAI, Together, Fireworks, Vertex, Bedrock | axolotl on GPU pods, ft-runner orchestration, R2 adapter storage, per-minute billing; validated e2e — but compute is not actually charged yet (internal billing gap) |
| Full-parameter fine-tuning | MISSING | strong-differentiator | Together, Databricks/Mosaic, Nebius | axolotl already supports it; mostly a config + GPU-sizing lift |
| Preference tuning (DPO / RLHF / RFT) | MISSING | strong-differentiator | OpenAI (DPO/RFT), Together | axolotl supports DPO natively; near-free expansion of existing pipeline |
| Continued pre-training | MISSING | nice-to-have | Bedrock, Databricks | Defer until multi-node clusters exist |
| Hosted serving of fine-tuned models | HAVE | table-stakes | All FT providers | Tier 1 dedicated vLLM pod per FT, customer-picked GPU SKU, idle auto-stop; per-hour |
| Shared multi-LoRA pool (per-token pricing for FT inference) | MISSING | strong-differentiator | OpenAI, Together, Fireworks (LoRA serving at base-model token price) | Locked as deferred Phase 12; competitors bill FT inference per-token, which is the adoption-friendly model — per-pod-hour pricing is a barrier for small customers |
| Live training progress / metrics streaming | HAVE | table-stakes | All FT providers | Dashboard streaming exists; loss-curve depth and W&B-style artifacts are thinner than dedicated trainers |
| Model evaluation / evals service | MISSING | table-stakes | OpenAI Evals, Vertex Eval, Bedrock Evaluations, Braintrust, W&B | Emerging table-stakes by 2026; needed to prove FT quality and close the train-evaluate-deploy loop |
| Model distillation pipeline | MISSING | nice-to-have | OpenAI, Fireworks | Composable later from batch API + FT |
| Dataset management (versioning, validation, format checks) | PARTIAL | table-stakes | OpenAI files API, Vertex, Databricks | FT accepts training data but there is no versioned dataset product or validation UX |

### GPU & Compute Infrastructure

| Capability | Status | Importance | Who has it | Notes |
|---|---|---|---|---|
| On-demand GPU pods/instances (hourly) | HAVE | table-stakes | CoreWeave, Lambda, Nebius, RunPod, Crusoe | Upstream-backed pods, company-owned images, UUID-keyed hourly billing, volumes; note internal audit flags metering-cron gaps for GPU pods |
| Curated GPU environment images/templates | HAVE | table-stakes | All GPU clouds | gpu_templates table + ghcr-built company images |
| Persistent volumes / storage for pods | HAVE | table-stakes | All GPU clouds | Volumes shipped; snapshot story for GPU workloads unclear |
| Serverless GPU model endpoints (scale-to-zero) | PARTIAL | table-stakes | Replicate, Baseten, Modal, RunPod Serverless, Beam | Exists only via BYO model deploy (docker/HF -> upstream serverless); not exposed as a generic scale-to-zero endpoint product |
| Generic serverless GPU functions/jobs (run arbitrary code) | MISSING | strong-differentiator | Modal, Beam, Replicate (Cog), Baseten | Modal-style compute primitive; large developer pull, monetizes future own fleet |
| Multi-node training clusters (InfiniBand/NVLink, Slurm or k8s) | MISSING | strong-differentiator | CoreWeave, Lambda, Nebius, Crusoe, hyperscalers | Becomes feasible + strategic only with the planned ~80-GPU B300/H200 Yotta fleet |
| Reserved / committed capacity contracts | MISSING | strong-differentiator | CoreWeave, Lambda, all hyperscalers | The revenue anchor for an owned fleet; meaningless while purely reselling spot upstream capacity |
| Spot / interruptible GPU pricing | MISSING | nice-to-have | RunPod, Vast.ai, GCP | Margin-thin while reselling; revisit on own fleet for utilization fill |
| Managed Kubernetes with GPUs (sold to customers) | MISSING | nice-to-have | CoreWeave CKS, Nebius, hyperscalers | Operate k8s internally but do not sell it |
| Managed notebooks / dev environments | PARTIAL | nice-to-have | SageMaker Studio, Vertex Workbench, Lambda, Lightning | Jupyter reachable inside GPU templates; no managed notebook product |
| Bare-metal GPU | MISSING | nice-to-have | CoreWeave, Lambda, Crusoe | Only relevant post-own-fleet for large tenants |

### Data, Storage & Retrieval

| Capability | Status | Importance | Who has it | Notes |
|---|---|---|---|---|
| Vector store API (collections, upsert/query, metadata filters, storage billing) | HAVE | table-stakes | Pinecone, Weaviate, Bedrock KB, Vertex, Mongo Atlas | pgvector-backed; compute not yet charged per internal billing-gap audit |
| Standalone managed RAG / knowledge-base API (ingest -> chunk -> embed -> query) | PARTIAL | table-stakes | Bedrock Knowledge Bases, Vertex RAG Engine, Azure AI Search, OpenAI vector stores | Full pipeline exists internally inside AI Agents (doc upload KBs) but is not exposed as its own API product; RAG schema scaffolding already in repo |
| Document parsing / extraction (PDF, OCR, layout-aware chunking) | PARTIAL | table-stakes | Azure Document Intelligence, Bedrock, Unstructured, LlamaParse, Mistral OCR | Doc upload works for agents; no standalone parse/extract API |
| Hybrid search (vector + BM25/keyword fusion) | MISSING | strong-differentiator | Pinecone, Weaviate, Azure AI Search, Vespa | Cheap on existing Postgres substrate (tsvector + pgvector + RRF) |
| Managed databases with vector toggle (Postgres/MySQL/Mongo + pgvector) | HAVE | nice-to-have | Hyperscalers, DigitalOcean, Neon, Supabase | Resold managed DBs with opt-in pgvector toggle shipped; known provider-leak issue on Mongo connection strings |
| S3-compatible object storage product | MISSING | nice-to-have | Hyperscalers, CoreWeave (AI Object Storage), Backblaze | R2 used internally for adapters; not sold to customers |
| Data connectors / sync (S3, GDrive, Notion, web crawl) | MISSING | strong-differentiator | OpenAI connectors, Vertex, Bedrock, Glean-class | Feeds RAG + Agents stickiness |

### Agents & AI Applications

| Capability | Status | Importance | Who has it | Notes |
|---|---|---|---|---|
| Managed agent/chatbot builder with KB grounding | HAVE | strong-differentiator | OpenAI (GPTs/AgentKit), Vertex Agent Builder, Azure AI Foundry agents | Customer-built agents, doc-upload KBs, per-agent API keys |
| Public chat endpoint per agent | HAVE | table-stakes | All agent platforms | /api/v1/agents/{endpointId}/chat |
| Embeddable chat widget / channel integrations (Slack, WhatsApp) | PARTIAL | table-stakes | Intercom-class, Vertex, Voiceflow, Chatbase | Public endpoint exists; first-party embeddable widget and channel connectors not evidenced |
| Agent tool calling / external API integrations (incl. MCP client) | MISSING | table-stakes | OpenAI, Anthropic, Vertex, Azure, all agent frameworks | By mid-2026 agents without tools are demo-grade; biggest gap inside the Agents product |
| Web search / grounding tool | MISSING | table-stakes | OpenAI, Gemini grounding, Anthropic, Perplexity API | Needed for both raw API (search tool) and Agents |
| Code interpreter / sandboxed execution | MISSING | strong-differentiator | OpenAI, Anthropic, E2B, Modal sandboxes, Bedrock AgentCore | Heavy infra; defer or build on own k8s later |
| Multi-step workflow / agent orchestration (graphs, triggers, human-in-loop) | MISSING | strong-differentiator | OpenAI AgentKit, Bedrock Flows, Azure, LangGraph Platform | Differentiates agent platforms in 2026 |
| Computer / browser use | MISSING | nice-to-have | OpenAI Operator, Anthropic computer use, Browserbase | Frontier-lab territory; not expected of an AI cloud |
| MCP server hosting / registry | MISSING | nice-to-have | Cloudflare, Anthropic, Smithery-class | Emerging; natural fit for the CF Workers substrate later |

### Developer Experience & Platform Tooling

| Capability | Status | Importance | Who has it | Notes |
|---|---|---|---|---|
| OpenAI-compatible drop-in API (existing SDKs just work) | HAVE | table-stakes | Together, Fireworks, Groq, vLLM ecosystem — universal | Chat + embeddings compatible today; compat surface narrows as OpenAI pushes Responses API |
| Playground (chat, params, model compare) | HAVE | table-stakes | All majors | Shipped |
| Prompt presets / saved configurations | HAVE | nice-to-have | Most platforms | Presets shipped |
| Prompt management: versioning, deployment, A/B | MISSING | strong-differentiator | Langfuse, Portkey, Azure prompt flows, Vertex | Presets are not versioned prompt registry |
| LLM observability: per-request logs, traces, latency/cost analytics UI | PARTIAL | table-stakes | OpenAI logs, Vertex, Braintrust, Langfuse, Helicone, Portkey | Audit + usage events flow through CF Queues, CSV export exists; no trace/span UI, no latency percentiles, no per-model cost analytics dashboards |
| Usage dashboard + export | HAVE | table-stakes | Universal | Usage CSV export shipped |
| Webhooks for job/lifecycle events (FT done, deploy ready, budget hit) | MISSING | table-stakes | OpenAI, Replicate, Modal, Together | Dashboard streaming exists but no customer-facing webhooks |
| First-party docs portal + quickstarts at competitive depth | PARTIAL | table-stakes | All majors invest heavily here | OpenAI-compat reduces SDK burden; docs depth/coverage not evidenced as competitive |
| Public status page + uptime SLA | MISSING | table-stakes | Every credible cloud | Enterprise buyers check this before the pricing page |

### Security, Governance & Enterprise Readiness

| Capability | Status | Importance | Who has it | Notes |
|---|---|---|---|---|
| Orgs/teams with multi-tier RBAC | HAVE | table-stakes | All enterprise platforms | 4-tier owner/admin/developer/viewer |
| Fine-grained API key scoping (allowed models, IP CIDR, budget+hard cap, RPM, expiry) | HAVE | strong-differentiator | Portkey, OpenRouter-class gateways; OpenAI admin keys are weaker | Richer than most first-party clouds; gateway-class capability |
| Org/key spend caps and budget controls | HAVE | table-stakes | OpenAI, Azure, most | Monthly caps at org and key level via Durable Objects |
| Audit logs (partitioned, 30+ action types) | HAVE | table-stakes | All enterprise platforms | Shipped |
| Zero-data-retention controls | HAVE | strong-differentiator | OpenAI ZDR (enterprise only), Anthropic, Bedrock default | Per-key ZDR toggle; must verify ZDR is actually enforced end-to-end through the upstream proxy, not just locally |
| BYOK (customer-supplied provider keys, encrypted at rest) | HAVE | strong-differentiator | Portkey, LiteLLM-class gateways; rare among clouds | OpenRouter/OpenAI/Anthropic/Google/Mistral/custom, AES-256-GCM |
| Configurable guardrails (input/output policies, PII redaction, topic blocking) | MISSING | table-stakes | Bedrock Guardrails, Azure Content Safety, Vertex, Fiddler/Guardrails-class | No guardrail layer at gateway or agents; enterprise blocker |
| Compliance certifications (SOC 2 Type II, ISO 27001, GDPR/DPDP, HIPAA option) | MISSING | table-stakes | Every major; even Together/Fireworks/Modal have SOC 2 + HIPAA | Gates virtually all enterprise procurement; DPDP posture is the entry ticket for the India/Yotta DC story |
| SSO/SAML + SCIM provisioning | MISSING | table-stakes | All enterprise platforms | Enterprise-tier auth absent |
| Private networking (PrivateLink/VPC peering, private inference endpoints) | MISSING | strong-differentiator | Bedrock, Azure, Vertex, CoreWeave | Becomes credible with own DC; today the CF-Workers path can offer mTLS/allowlisting at best |
| Data residency / region pinning | MISSING | strong-differentiator | Hyperscalers, Mistral (EU), Nebius (EU) | India-resident inference on owned B300/H200 fleet is the single strongest future differentiator (DPDP residency) |
| Prepaid credits with card + crypto top-ups | HAVE | table-stakes | Together, Fireworks, OpenRouter-class, RunPod | Shipped, but top-ups currently disabled by kill switch pending billing-vulnerability remediation; confirmed exploitable vulns (credit-mint RPC, Stripe double-credit) must be fixed before scale |
| Enterprise invoicing / postpaid + committed-use discounts | MISSING | strong-differentiator | All hyperscalers, CoreWeave, Together enterprise | Needed to land >$10k/mo accounts; also no pricing markup anywhere yet (0% on inference, at-cost domains) — monetization, not just capability, gap |
| Unified metering spine across all services (hourly atomic billing, grace, auto-delete) | PARTIAL | table-stakes | Internal capability; all clouds meter everything | Strong spine (bill_service_cycle_atomic, 7-day grace, outbox) but FT/serving/vector compute is not actually charged and GPU-pod metering has audited gaps |

