# A.I. Labs — Documentation Index

AhuraCloud A.I. Labs is a serverless AI platform with four products under
one OpenAI-compatible gateway:

1. **Inference** — OpenAI- and Anthropic-compatible API across 50+ frontier
   and open-source models. Streaming, tool calling, JSON mode.
2. **Fine-Tuning** — LoRA training on managed GPUs. Self-serve docker OR
   one-click managed hosting.
3. **Embeddings + Vector Store** — managed embedding endpoints + per-org
   pgvector collections.
4. **BYO Model Deploy** — bring any docker image or HuggingFace model id;
   we provision a dedicated GPU endpoint and route via the same gateway.

---

## For customers

| Doc | Read when |
|---|---|
| **[user-guide.md](./user-guide.md)** | First read. End-to-end conceptual guide with working code samples for every feature. ~20 min cover-to-cover. |
| **[api-reference.md](./api-reference.md)** | Formal endpoint specs. Use as a reference once you've read the user guide. |
| **[security.md](./security.md)** | Procurement / security review. TLS / AES-GCM / RLS / ZDR / audit log / subprocessor list / SOC 2 readiness gap analysis. Honest about what we are NOT (not certified yet). |

---

## For operators (us)

| Doc | What's in it |
|---|---|
| **[STATUS.md](./STATUS.md)** | **Live build state. Read first when picking up a fresh session.** What's deployed, what works, what's pending, all decisions made, file map, known gotchas. |
| [architecture.md](./architecture.md) | System design, components, data model, key tradeoffs |
| [DELIVERY-RECORD.md](./DELIVERY-RECORD.md) | Deep's contribution to the platform — what was built, faults found and closed, adjacent platform work, and open items. Written for a status review rather than a working session. |
| [supply-routing-plan.md](./supply-routing-plan.md) | Where our model capacity is bought, what it costs, and the phased plan for a second supplier (Wokey). Verified prices and endpoint probes, plus the two cost-accounting bugs found writing it. |
| [setup.md](./setup.md) | Operator runbook — apply migrations, configure Cloudflare, deploy Workers, verify |
| [phases.md](./phases.md) | Original 8-phase delivery roadmap with scope, durations, ship signals |
| [migration-ahurasense.md](./migration-ahurasense.md) | Domain switch runbook: `cs2hvh.com` (current) → `ahurasense.com` (target, pending CF perms) |
| [managed-serving.md](./managed-serving.md) | Operator notes on the Phase 11 managed serving path |
| [fine-tuning-runner.md](./fine-tuning-runner.md) | FT runner operator contract — env vars, BullMQ wiring, RunPod orchestration |
| [phase-5b-build-guide.md](./phase-5b-build-guide.md) | Phase 5.B canonical implementation guide — Dockerfiles, BullMQ runner code, webhook + eval gate, k8s YAML, pricing model |
| [template-precache.md](./template-precache.md) | RunPod template pre-cache (Phase 9.G, deferred — eliminates 5-10 min cold image pull) |
| [load-testing.md](./load-testing.md) | k6 load test scenarios + interpretation |

---

## Code map

| Path | Purpose |
|---|---|
| `app/dashboard/services/inference/` | Customer dashboard — overview, models, playground, presets, vectors, batches, fine-tuning, deployments, api-keys, byok-keys, usage, members, audit, notifications, diagnostics, settings |
| `app/api/inference/` | Control plane — every dashboard route's REST backend |
| `app/(marketing)/services/inference/` etc. | Public marketing landing pages |
| `workers/inference/` | Cloudflare Workers edge gateway (Hono, `api.cs2hvh.com/v1/*`) |
| `workers/ft-runner/` | LKE BullMQ runner — claims FT jobs, provisions GPUs, monitors training |
| `workers/deploy-runner/` | LKE BullMQ runner — claims BYO Deploy jobs, provisions endpoints |
| `lib/inference/` | Shared server-side helpers: crypto (BYOK + HF tokens), error sanitizer, notifications fan-out, semantic cache, audit, branding, serving-pod abstraction |
| `lib/email/` | Resend-backed email templates (transactional + inference event notifications) |
| `components/dashboard/inference/` | Editorial-chrome React components (FT, batches, deployments, vectors, model-catalog, playground, notifications, diagnostics, service-health) |
| `supabase/migrations/2026052*` | The `inference.*` schema + all subsequent migrations |
| `infra/runpod/training-images/axolotl/` | FT training image (axolotl 0.16 + transformers 5.5 + peft 0.19 + accelerate 1.13 + torch 2.9 + CUDA 12.8) |
| `infra/runpod/serving-images/vllm-lora/` | FT serving image (vllm/vllm-openai:v0.7.3 + R2 adapter loader) |

---

## Locked-in design decisions

- **OpenRouter is the single upstream for chat / messages / embeddings.**
  No self-hosted vLLM at the gateway layer.
- **0% markup on inference.** Pass-through upstream rates. Revenue comes
  from Fine-Tuning training compute, hosted serving instance-hours, BYO
  Deploy endpoint-hours, Vector Store, and bundled AhuraCloud compute spend.
- **Per-customer dedicated managed serving (Tier 1)** for fine-tunes — NOT
  shared multi-LoRA pool. Per-hour pricing, customer picks GPU SKU,
  auto-stop after idle window. Shared pool deferred.
- **Brand-scrub discipline.** Customer-facing surfaces never name upstream
  providers (RunPod, OpenRouter, Cloudflare, Supabase, Upstash, R2, LKE).
  The deliberate exception is `security.md §11` (subprocessor list,
  procurement-only). Single sanitizer source of truth at
  `lib/inference/error-messages.ts::customerSafeErrorMessage()`, applied
  at write-time, read-time, and notifications fan-out time.
- **Enterprise-grade from day 0** — multi-tenant orgs, per-key budgets +
  rate-limits + IP allowlists + ZDR toggle, per-org spend caps + alerts,
  RLS on every customer-data table, AES-GCM BYOK, append-only audit log,
  edge gateway, semantic cache, observability across the board.
  SOC 2 audit is on the roadmap — gap list in `security.md §15`.
- **Scale target:** 100k requests/hour (~500 RPS burst), single-region MVP,
  multi-region designed-for but not shipped at launch.
- **`api.cs2hvh.com/v1` is the current temporary gateway.** Migrates to
  `api.ahurasense.com/v1` when CF perms land on that account — runbook in
  `migration-ahurasense.md`. All customer-visible URLs are env-driven
  (`lib/inference/branding.ts`); the switch is 6 env vars + redeploy.

---

## Current status (one-liner)

**Customer-facing feature surface is complete.** Phases 0–11 all shipped
end-to-end. Truss source builder is the only deferred first-class item.
Full live state in [STATUS.md](./STATUS.md).
