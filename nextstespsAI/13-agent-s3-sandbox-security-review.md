# Agents S3 — Code-Interpreter Sandbox Security Review (BLOCKING GATE)

**Date:** 2026-07-03 · **Companion to:** [11-agent-implementation-plan.md](11-agent-implementation-plan.md) (§11) · [12-agent-execution-stages.md](12-agent-execution-stages.md) (S3.3) · **Status:** ⛔ NOT SIGNED OFF

This is the **gate S3 must pass before any customer/model-authored code executes** (§11: *"One shared security review before any customer code executes"*). The `code` tool, the real sandbox pool, and the standalone `/v1/tools/code` primitive stay **disabled in every environment** until every MUST item below is checked and the sign-off table is complete. Building the *ungated* scaffolding (pool interface, mock pool, session lifecycle, settle/reaper) is allowed before sign-off; **wiring a real executor is not.**

> **Why a hard gate:** the sandbox runs arbitrary code an LLM (or the customer) produced. It is the platform's single largest new attack + cost surface (§11, §2). A miss here is a tenant-isolation breach or a metadata-credential exfiltration, not a bug.

---

## 0. Open decision that blocks the *real* pool (not the scaffolding)

- [ ] **§15.3 — where does the pool run?** Firecracker/gVisor pool on the current RunPod-backed k8s **now**, or wait for the owned B300/H200 fleet? *(Owner: platform/manager. Until decided, only the mock pool exists.)*

---

## 1. Isolation (MUST — no customer code runs until all checked)

- [ ] **Kernel isolation.** Each session runs in a gVisor (runsc) or Firecracker microVM — **not** a shared-kernel container. No tenant shares a kernel with the host or another tenant.
- [ ] **Ephemeral rootfs.** Fresh, read-mostly rootfs per session; destroyed on stop. No writable host mount, no shared volume, no Docker socket.
- [ ] **Non-root, no privilege escalation.** Runs as an unprivileged uid; `allowPrivilegeEscalation=false`, all Linux capabilities dropped, seccomp default-deny profile applied.
- [ ] **No host PID/IPC/network namespace sharing.** Per-session net namespace; cannot see host or sibling processes/sockets.

## 2. Network egress (MUST)

- [ ] **Cloud metadata blocked.** `169.254.169.254` (+ `fd00:ec2::254`, GCP `metadata.google.internal`) unreachable from inside the sandbox at the network layer — verified, not just app-level.
- [ ] **Default-deny egress + allowlist.** Outbound is denied by default; only an explicit allowlist (e.g. pip/PyPI mirror) is reachable. RFC-1918 / loopback / link-local blocked (same ranges as [ssrf.ts](../workers/agent-runner/src/tools/ssrf.ts) `isPrivateAddress`).
- [ ] **No lateral reach.** Sandbox cannot reach Postgres, Redis, the gateway, k8s API, or other internal services.

## 3. Hard resource caps (MUST — cost + DoS)

- [ ] **Wall-clock cap** per exec and per session (hard kill).
- [ ] **Memory cap** (OOM-kill, not swap-thrash).
- [ ] **CPU cap** (metered per second → billing basis).
- [ ] **Disk/tmpfs cap** (bounded scratch, wiped on stop).
- [ ] **Idle reaper** stops sessions past `idle_deadline`; **no orphaned VMs** survive a runner crash (reaper is authoritative, mirrors serving-pod-watchdog).

## 4. Data leakage / brand-scrub (MUST — §11 highest-leakage area)

- [ ] **stdout/stderr brand-scrub.** Tool output + `run_steps.detail` pass the same scrub as other surfaces; no upstream provider names, no host paths, no internal hostnames leak.
- [ ] **No secret injection.** Platform keys, service-role creds, and env secrets are **never** present in the sandbox env.
- [ ] **Output size bounded.** Large stdout spills to R2 with a brand-scrubbed preview (`RunCtx.maxInlineResultBytes`), not inlined unbounded.

## 5. Billing integrity (MUST — first non-zero-markup compute, §9)

- [ ] **Per-second settle is idempotent.** `settleSandboxSession` transitions `running → stopped` atomically; a double-stop charges **once** (mirror `computeProratedCharge` in [credits.ts](../lib/billing/credits.ts)). Unit-tested.
- [ ] **Sits on Phase-0 hardened billing RPCs** + finance sign-off on the CPU-second rate (placeholder `cents_per_cpu_second` in [20260701000003_agentcore_tool_pricing.sql](../supabase/migrations/20260701000003_agentcore_tool_pricing.sql) is `PENDING_FINANCE`).

## 6. Kill-switch & rollout (MUST)

- [ ] **Env-gated availability.** `code` tool is unavailable unless an explicit `SANDBOX_ENABLED=true` (set only post-sign-off). Default false everywhere; the tool returns "not available" otherwise.
- [ ] **Per-org / global kill-switch** to disable sandboxing instantly without a redeploy.
- [ ] **Audit + alerting** on session start/stop, cap-kills, and egress-denies.

---

## Code seams that must satisfy each item (for the reviewer)

| Area | Seam (to be built, behind mock until sign-off) |
|---|---|
| Session lifecycle + caps | `sandbox-pool` service (`start/exec/stop`); `agentcore.sandbox_sessions` rows (table already exists, S1 migration) |
| Tool entry | `workers/agent-runner/src/tools/code.ts` — the `code` `AgentTool`, **guarded by `SANDBOX_ENABLED`** |
| Egress rules | pool-side network policy; reuse the `isPrivateAddress` range list from `ssrf.ts` |
| Settle | `settleSandboxSession` (mirror `credits.ts` atomic-transition + prorate) |
| Reaper | `/api/agents/internal/session-reaper` cron (mirror `run-reaper`) |
| Scrub | existing brand-scrub applied to sandbox stdout before it hits `run_steps.detail` |

---

## Sign-off (all MUST items checked + names below → gate opens)

| Role | Name | Date | Signature / PR |
|---|---|---|---|
| Security reviewer | | | |
| Platform / infra (owns §15.3 decision) | | | |
| Billing / finance (CPU-second rate) | | | |

**Until this table is complete, `SANDBOX_ENABLED` stays false and no real executor is wired.**
