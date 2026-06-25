# Cross-Cluster Review: AhuraCloud AI Dev Cloud Expansion

## 1. COMPLETENESS — Orphaned gaps

Mapping all 15 gaps against the 8 designs:

| Gap | Owner cluster(s) | Status |
|---|---|---|
| 1. Audio (STT+TTS) | Multimodal | ✅ |
| 2. Image generation | Multimodal | ✅ |
| 3. Reranking | Multimodal, RAG (both claim it) | ✅ (duplicated) |
| 4. Moderation + guardrails + PII | Multimodal (mod), Evals/Guardrails (full) | ✅ |
| 5. **Compliance bundle (SOC2/ISO/DPDP, SSO/SAML, status page, SLA, postpaid)** | Enterprise (surfaces only) | ⚠️ **PARTIAL ORPHAN** |
| 6. Structured outputs enforcement | Inference Completeness | ✅ |
| 7. Billing markup + metering fixes | every cluster references it; **no cluster owns it** | ❌ **ORPHAN** |
| 8. Webhooks + LLM observability | Evals/Observability | ✅ |
| 9. Model evals | Evals/Obs, RAG (RAG-evals) | ✅ (split) |
| 10. Full FT + DPO | Training | ✅ |
| 11. Multi-LoRA shared serving | Inference Completeness (Slice 7) | ✅ |
| 12. Managed RAG / doc-ingestion | RAG | ✅ |
| 13. Agent tools (search, MCP, code-interp) | Agent Infra | ✅ |
| 14. Serverless GPU functions + catalog + reserved | Serverless GPU, Inference, Enterprise | ✅ (triplicated) |
| 15. Realtime voice | Multimodal (gated) | ✅ |

**True orphans:**

- **Gap #7 (billing completeness/markup) has NO owning cluster.** Every single design says "this is the right place to introduce nonzero markup" and "depends on the billing-completeness cluster landing the markup/service_type plumbing first" — but no design *is* that cluster. Eight clusters each independently add `service_type` allowlist values, each assume a markup mechanism exists, and each defer the actual metering-gap fixes (the cron that doesn't meter GPU pods, Stripe double-credit, public credit-mint RPC) elsewhere. **This is the most dangerous finding: the prerequisite everyone depends on is unstaffed.**

- **Gap #5 is half-orphaned.** Enterprise cluster builds the *product surfaces* (org ZDR, residency pinning, audit export, SSO hook) but explicitly disclaims the *certification program, status page, and SLA* ("Cluster #5 in the gap analysis owns the certification… this cluster owns the surfaces"). No design owns: the **status page**, the **SLA definition/monitoring**, the **SOC2/ISO/DPDP audit program**, or **postpaid invoicing** as a hardened capability (Enterprise flags postpaid but gates it on unfinished billing-vuln work). Procurement-blocking items are left dangling.

## 2. OVERLAPS / CONFLICTS — Factor these primitives out

Five primitives are reinvented 3–8 times each:

**A. Generic async job-runner (reinvented 6×).** Multimodal `media-runner`, Agent `agent-runner`, Serverless `sandbox-runner`, RAG `data-runner`, Training `training-runner`, Evals `eval-runner` — every one is described as "a near-exact clone of `ft-runner`: BullMQ + Postgres claimer + heartbeat + `/health`." That's six new k8s deployables on a 2-node cluster. **Factor out ONE generic claim-runner framework** (`lib/runner-core`: claimer, heartbeat, atomic-transition, watchdog) that each cluster instantiates with a job-type handler, not a forked deployable. Conflict: each also adds its own per-minute cron watchdog sweep — these must consolidate into the existing single `scheduled()` dispatcher, not six independent ladders.

**B. Usage-event metering pipeline (3 competing schemes).** Multimodal extends `computeCost()` with `unitLabel` branches; Agent invents a **separate `AGENT_STEP_EVENTS` queue** parallel to `USAGE_EVENTS`; Serverless invents `compute_usage_events` + its own `USAGE_QUEUE` name. **Conflict:** three queue names, three cost-compute paths. Factor out **one `UsageEvent` with a `unitLabel`/`numUnits` field** (Multimodal's approach is right) and **one consumer** — kill the parallel `AGENT_STEP_EVENTS`/`compute_usage_events` queues. Otherwise spend-caps and budget alerts fragment across pipelines.

**C. Sandbox / code-exec / browser substrate (built 3×).** Agent cluster builds `sandbox-pool` (Firecracker code-interp + browser). Serverless GPU builds `sandbox-runner` (Firecracker microVMs). They even cross-reference each other ("first-party Code Interpreter tool calling `/v1/sandboxes`"). **This is the same Firecracker microVM pool built twice.** Build it ONCE in the Serverless cluster; Agent's code-interpreter/browser tools become *clients* of it. Both flag the identical security-review-before-ship risk — do that review once.

**D. Dedicated-endpoint + reserved-capacity tables (defined 3×, conflicting schemas).** `inference.dedicated_endpoints` is created by **both** Inference Completeness and Enterprise — *with different columns* (Inference: `routing_key`, `committed_tpm`, `mode`; Enterprise: `routing_slug`, `billing_service_id`, `reservation_id`). Reserved capacity / PTU appears in both plus Training's `training_clusters`. Migration collision guaranteed. **Factor out one `inference.dedicated_endpoints` + one reservation model** owned by Inference Completeness; Enterprise layers contracts/marketplace on top.

**E. Reranking endpoint (built 2×).** Multimodal Slice 1 and RAG Slice 1 both "deploy bge-reranker on the serverless substrate + add `/v1/rerank`." Pick one owner — **RAG**, since rerank completes its retrieval stack and RAG also needs hybrid-search; Multimodal consumes it.

Minor: media-asset/blob store on R2 with `cdn.ahurasense.com` signed URLs is specced independently by Multimodal, Agent (recordings), Serverless (artifacts), Training (checkpoints) — standardize one signed-URL + lifecycle-TTL helper.

## 3. SEQUENCING — Dependency-ordered build for a small team

**BUILD FIRST — the common-infrastructure slice (un-staffed today):**

0. **Billing-completeness + shared primitives (gap #7).** This is the literal blocker under all 8 clusters and the orphan from §1. Ship: (a) fix the metering gaps + billing vulns the memory flags (public credit-mint RPC, GPU-pod metering, grace gaps) — *security-critical, prepaid integrity*; (b) the markup mechanism (`upstream_cost_cents` vs `cost_cents` separation already exists — add the margin layer); (c) the **shared `runner-core`** framework (primitive A); (d) the **unified usage-event pipeline** with `unitLabel` (primitive B); (e) one `service_type`/grace-allowlist extension instead of eight. Nothing else should start until this lands.

Then, ordered by **early revenue × reuse × low-infra**:

1. **Reranking + structured outputs + hybrid search** (RAG Slice 1–2 + Inference Slice 1). Pure gateway/substrate, no new deployable, table-stakes, immediate revenue. Highest ROI.
2. **Image gen + TTS/STT proxy** (Multimodal Slice 1–3). Thin gateway proxies on the now-hardened billing path; unblocks whole market segments; per-call revenue.
3. **Observability + guardrails + prompt mgmt** (Evals S1–S3). Stickiness layer, near-zero GPU, makes everything else sellable and self-protects the public Agents endpoint.
4. **RAG ingestion runner** (RAG Slice 3) — *first instantiation of `runner-core`*, proving the shared framework before it's forked 5 more times.
5. **Full FT + DPO + registry** (Training S0–S3) — reuses runner-core; closes train→serve loop; differentiator.
6. **Evals service** (Evals S4 / RAG S7) — needs the runner + sells FT.
7. **Sandbox substrate** (Serverless Slice 2) — *built once*, then Agent tools (Agent S3–S5) and Serverless functions consume it. Highest security surface — gate on the one shared security review.
8. **Enterprise surfaces + dedicated endpoints** (Inference S4 / Enterprise S0–S2) — needs the unified endpoint schema; gate procurement items.
9. **Fleet-gated tail:** multi-LoRA (Inference S7), reserved/PTU (Enterprise S4), multi-node training (Training S8), realtime voice (Multimodal S6). All correctly deferred to the Yotta DPR.

## 4. REALISM — Constraint violations to flag

- **Single-VM control plane vs. 6 new k8s runners + 3 new always-on services (realtime-relay, sandbox-pool, cluster-scheduler).** Collectively these designs add ~9 new deployables to a 2-node cluster running a single Redis. Several authors flag this individually (Serverless risk #5, Enterprise risk on "third runner," Agent inline-vs-durable). **Consolidate to runner-core + at most 1–2 genuinely-new always-on services** (the WS relay and the Firecracker pool). Reject per-cluster forked runners.

- **Hard data-residency (India) contradicts the architecture.** Inference Completeness honestly flags it: "single Linode VM + global CF KV violate 'data never leaves India'." Selling hard residency requires regional Postgres + regional KV + log routing — a major lift. **Realistic v1 = "soft residency" only**; don't let Enterprise/Inference sell hard residency before the control plane is regionalized.

- **Reservations/SLAs on a RunPod bridge = selling capacity you don't control.** Enterprise and Inference both propose 1–12-month committed contracts and signable SLAs backed by RunPod. You can't sign an uptime SLA on an upstream you can't name and whose capacity you don't own. **Restrict committed contracts/SLAs to owned-fleet only**; cap bridge reservations at ≤3 months (Enterprise's own open question).

- **Postpaid invoicing vs. prepaid-credits + active billing vulns.** Enterprise's postpaid (negative-balance allowance) directly widens the exact exploit surface from the 2026-06 billing audit (per memory, NOT yet fixed). Correctly gated, but reinforces §3: **billing hardening must be Slice 0**, full stop.

- **Brand-hiding on new binary/streaming surfaces** is under-built everywhere: image EXIF/watermarks, TTS response headers, sandbox stdout containing upstream IPs, training logs with "RunPod"/CUDA strings, browser page content. `customerSafeErrorMessage()` only covers JSON errors. **One shared write-time sanitizer for binary/log/stream surfaces** must be part of Slice 0, not audited per-cluster.

**Bottom line:** The single highest-leverage action is to **staff and ship the orphaned billing-completeness + shared-infrastructure slice (§3.0) before any vertical** — it's the unowned prerequisite all 8 designs assume, and it absorbs the runner, metering, endpoint-schema, and brand-scrub duplication that would otherwise be built 3–8 times.