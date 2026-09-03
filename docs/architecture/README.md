# Architecture Reference

Engineering documentation for the AhuraSense platform. Each document describes
one service end to end: components, data model, request flow, scheduled work,
security posture, billing integration, and known gaps.

These are written to be read by someone who has to fix the thing at 3am. They
record **why** a design is the way it is — including the incidents that shaped
it — because the reasoning is what stops the same defect being reintroduced.

| # | Document | Covers |
|---|---|---|
| 00 | [Platform Overview](00-platform-overview.md) | **start here** — services, provisioning-to-charge flow, providers, deployment, scheduled work |
| 01 | [GPU Pods](01-gpu-pods.md) | RunPod-backed GPU compute, inventory sync, network volumes, terminal proxy |
| 02 | [Inference & AI Labs](02-inference-ai.md) | OpenAI-compatible gateway on Cloudflare, model catalogue, fine-tuning, vectors, playground |
| 03 | [Pricing & Billing](03-pricing-and-billing.md) | the price book, meters, the hourly charge spine, every path that moves wallet money, teardown, the sweep, the watchdog |
| 04 | [Data Model](04-data-model.md) | schemas, RLS posture, guarded functions, the audit log, dropped tables |
| 05 | [Coupons & Discounts](05-coupons-and-discounts.md) | promocodes vs rate discounts, redemption order, arrears |
| 06 | [Admin Panel](06-admin-panel.md) | the operator surface, the two-book pricing problem, the monitor board |
| 07 | [Current State](07-current-state.md) | what works today, open decisions, known gaps |

## Conventions

- **Verified against the running system**, not against intent. Each document
  states the date it was checked and the numbers it saw.
- **Known gaps are listed, not omitted.** A doc that only describes the happy
  path is worse than none, because it is trusted.
- Where a design choice was made to prevent a specific past failure, the failure
  is named. "Don't do X" is forgettable; "X cost $4,629.91 on 2026-08-30" is not.

## If you read only one thing

[Current State](07-current-state.md) section 6. Almost every defect this platform
has paid for was a signal that read healthy while being wrong — a dropped table
returning no rows became "free", a dead audit log became "no activity", a sweep
with an eleven-hour hole reported "last ran: minutes ago". The afternoon of
2026-09-03 added more of the same shape: a sweep that wrote PROBLEM to a journal
nobody read while its unit declared exit 1 a success, a NULL monthly price that
became a free game renewal, a 404 from the cluster that became "idle", and a
PaaS that had been debiting every hour without a ledger row and so was read as
uncollected accrual. Every fix was the same shape: make the empty case say
something instead of resolving to a plausible zero.
