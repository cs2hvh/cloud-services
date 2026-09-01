# Architecture Reference

Engineering documentation for the AhuraSense platform. Each document describes
one service end to end: components, data model, request flow, scheduled work,
security posture, billing integration, and known gaps.

These are written to be read by someone who has to fix the thing at 3am. They
record **why** a design is the way it is — including the incidents that shaped
it — because the reasoning is what stops the same defect being reintroduced.

| # | Document | Covers |
|---|---|---|
| 01 | [GPU Pods](01-gpu-pods.md) | RunPod-backed GPU compute, inventory sync, network volumes, terminal proxy |
| 02 | [Inference & AI Labs](02-inference-ai.md) | OpenAI-compatible gateway on Cloudflare, model catalogue, fine-tuning, vectors, playground |
| 03 | [Pricing & Billing](03-pricing-and-billing.md) | the price book, meters, hourly charge spine, discounts, sweep, watchdog |

## Conventions

- **Verified against the running system**, not against intent. Each document
  states the date it was checked and the numbers it saw.
- **Known gaps are listed, not omitted.** A doc that only describes the happy
  path is worse than none, because it is trusted.
- Where a design choice was made to prevent a specific past failure, the failure
  is named. "Don't do X" is forgettable; "X cost $4,629.91 on 2026-08-30" is not.
