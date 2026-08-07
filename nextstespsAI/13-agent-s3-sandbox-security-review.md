# Agents S3 — Code-Interpreter Sandbox Security Review (BLOCKING GATE)

**Date:** 2026-07-03 · **Companion to:** [11-agent-implementation-plan.md](11-agent-implementation-plan.md) (§11) · [12-agent-execution-stages.md](12-agent-execution-stages.md) (S3.3) · **Status:** ⛔ NOT SIGNED OFF

This is the **gate S3 must pass before any customer/model-authored code executes in a shared/production environment** (§11: *"One shared security review before any customer code executes"*).

**What this gate blocks: un-gating.** `SANDBOX_ENABLED` stays **false (default) in every shared/staging/production environment** until every MUST item below is checked and the sign-off table is complete. Flipping it on anywhere customers' code could run against real tenants is what requires sign-off.

**What is permitted before sign-off: a gated, default-off, LOCAL-DEV-ONLY executor.** The committed `DockerSandboxPool` (a shared-kernel container — `--network none`, non-root, read-only rootfs, cap-drop ALL, memory/pids/wall-clock caps) runs **only when a developer sets `SANDBOX_ENABLED=true` on their own machine** for building/testing the loop. It is explicitly **not** the production isolation model (§1) and must never be enabled in a shared env. So the MUST items below gate **production un-gating**, not the existence of the dev executor — that reconciles this doc with the "dev executor, gated" status in [12-agent-execution-stages.md](12-agent-execution-stages.md).

> **Why a hard gate:** the sandbox runs arbitrary code an LLM (or the customer) produced. It is the platform's single largest new attack + cost surface (§11, §2). A miss here is a tenant-isolation breach or a metadata-credential exfiltration, not a bug.

---

## Evidence packet (2026-07-20) — code-to-checklist mapping, not a sign-off

This section exists to make the sign-off table below fast to fill in, not to fill it in itself — none of the three reviewers can be represented by re-reading source code. Every MUST item is annotated with what the **dev executor** (`DockerSandboxPool`, the only thing that exists today) actually does, verified directly against `workers/agent-runner/src/tools/sandbox/docker-pool.ts`, `code.ts`, `persisted-pool.ts`, `settle.ts`, and `detail.ts`. Checkboxes stay unchecked — dev-executor behavior is not production sign-off, and several items are provably not met by design (kernel isolation) or not built at all (kill-switch granularity, audit trail, R2 spillover).

**Bottom line for reviewers:** of 17 MUST items, roughly 10 are already satisfied by the dev executor's hardening and would very likely carry over unchanged to a microVM swap (same interface, doc 13's own preamble). 2 are satisfied *by construction* in a way that's actually stricter than the interpreter (no egress *and* no allowlist, because there's no need for one, so packages are baked into the image at build time — see `sandbox.Dockerfile`). 5 are genuinely open and need real work, not just review: kernel isolation itself (§15.3's unresolved decision), the per-org/instant kill-switch, structured audit/alerting, R2 spillover for large output (currently hard-truncated instead), and a session-level (not just per-exec) wall-clock cap.

| # | MUST item | Dev-executor status | Evidence |
|---|---|---|---|
| 1.1 | Kernel isolation | ❌ **Not met, by design** — `DockerSession` is a plain `docker run`, shared host kernel. This is the one item the doc's own preamble says the dev executor explicitly does *not* need to meet (walled off from shared/prod envs by `SANDBOX_ENABLED=false`). Production requires the runtime swap to `runsc`/Firecracker — §15.3 (production pool location) is still an open, unresolved decision, not started. | `docker-pool.ts:21-24` header comment; `--runtime` flag exists (`this.opts.runtime ? ["--runtime", this.opts.runtime] : []`) so the interface is ready for `runsc`, but nothing sets it in any deploy config today. |
| 1.2 | Ephemeral rootfs | ✅ Met (dev executor) — `--rm` (destroyed on stop), `--read-only` rootfs, only `/tmp` writable via `--tmpfs`. No `-v` host mount anywhere in the spawn args, no Docker socket passed in. | `docker-pool.ts:107-121` |
| 1.3 | Non-root, no priv-esc | ✅ Met — `--user 65534:65534`, `--security-opt no-new-privileges`, `--cap-drop ALL`. **Partial nuance:** uses Docker's *default* seccomp profile (a broad syscall blocklist), not a custom default-deny allowlist profile — worth a reviewer call on whether that's sufficient for the dev tier. | `docker-pool.ts:114-116` |
| 1.4 | No host PID/IPC/net namespace sharing | ✅ Met — Docker's default is separate namespaces per container; nothing here sets `--pid=host`/`--ipc=host`. Network namespace is fully isolated via `--network none` (below). | `docker-pool.ts:107-121` (absence of those flags) |
| 2.1 | Cloud metadata blocked | ✅ Met, trivially — `--network none` means **zero** network reachability from inside the container, so `169.254.169.254` (or anything else) is unreachable at the network layer, not just app-level. | `docker-pool.ts:108` |
| 2.2 | Default-deny egress + allowlist | ✅ Met, stricter than specced — there is no allowlist because there is no egress *at all* (`--network none`). Consequence: packages can't be `pip install`-ed at runtime, so data-science libraries are baked into a build-time image instead (`sandbox.Dockerfile`, `numpy`/`pandas`/`scipy`/etc.). This is more restrictive than the doc asked for, not less. | `docker-pool.ts:108`; `sandbox.Dockerfile` |
| 2.3 | No lateral reach | ✅ Met, same mechanism as 2.1/2.2 — `--network none` means the sandbox can't reach Postgres/Redis/gateway/k8s API either. | `docker-pool.ts:108` |
| 3.1 | Wall-clock cap (per exec) | ✅ Met — `timeoutMs` per `exec()`, hard-kills the container on timeout (previously dead code per doc 12, fixed 2026-07-03, covered by an opt-in Docker integration test). **Per *session*: not met** — there's no absolute session-duration cap independent of per-exec timeouts; a session's total lifetime is bounded only indirectly (the run's `max_steps`/`max_cost_cents`, and the 15-min idle reaper — which resets on every call, so a long chain of fast calls has no hard ceiling). | `docker-pool.ts:149-176` (per-exec); no session-level equivalent found anywhere in `persisted-pool.ts` |
| 3.2 | Memory cap | ✅ Met — `--memory` (OOM-kill via Docker's own cgroup enforcement, not swap). | `docker-pool.ts:109` |
| 3.3 | CPU cap | ✅ Met — `--cpus`, and CPU-seconds are independently tracked per-exec (`time.process_time()` inside the kernel) for the billing basis, separate from the wall-clock enforcement. | `docker-pool.ts:110`, `73-87` (kernel), `184-185` |
| 3.4 | Disk/tmpfs cap | ✅ Met — `--tmpfs /tmp:size=256m,exec`, wiped on container removal (`--rm`). | `docker-pool.ts:112` |
| 3.5 | Idle reaper, no orphaned VMs | ⚠️ **Partially met** — `session-reaper` cron reaps DB rows past `idle_deadline` (throttled bump on reuse, doc 12/13 fix, tests green). **Documented, unclosed gap:** the reaper can only update the Postgres row; it has no reach into the Docker daemon on whatever node ran the container, so a runner that dies without calling `dispose()` (crash, OOM, `kill -9`, k8s eviction) can leak a running container until that node's own housekeeping cleans it up. Doc 13 already scopes true orphan-cleanup as a production-microVM-pool requirement, not a dev-executor one — but it's still open today, not just theoretically. | `app/api/agents/internal/session-reaper/route.ts` header comment (explicit limitation) |
| 4.1 | stdout/stderr brand-scrub | ✅ Met — both `scrubUpstream` (search-provider names) and `scrubInfraLeakage` (RunPod/k8s/our own infra names) run on stdout/stderr before they reach the model or `run_steps.detail`. | `code.ts:55-61` |
| 4.2 | No secret injection | ✅ Met — the only env vars passed into the container are `PYTHONUNBUFFERED` and a random per-session sentinel string; no platform key, service-role credential, or `.env` secret is ever set on the child process's env or forwarded in. | `docker-pool.ts:117-118` |
| 4.3 | Output size bounded | ⚠️ **Bounded, but not as specced.** The doc's exact wording: "large stdout spills to R2 with a brand-scrubbed preview (`RunCtx.maxInlineResultBytes`), not inlined unbounded." What's actually built: hard truncation at three layers (100KB at the raw stream, 10K chars into the tool's `output`, 600 chars into the trace `detail`) — bounded (no unbounded growth, no OOM risk), but **data loss**, not an R2-backed full-output-with-preview. `RunCtx.maxInlineResultBytes` is declared in the type but is dead — grepped the whole repo, zero references anywhere outside its own declaration. | `docker-pool.ts:39` (`MAX_STREAM_BYTES`), `code.ts:22` (`MAX_OUTPUT_CHARS`), `detail.ts:14` (`DEFAULT_CAP`); `grep -rn maxInlineResultBytes` → only the type declaration |
| 5.1 | Per-second settle idempotent | ✅ Met, and test-covered — atomic `provisioning|running → stopped` transition (only a still-live row matches), so a race between `dispose()` and the idle reaper can't double-settle. 3 dedicated tests including an explicit double-settle-is-a-no-op case. | `settle.ts:26-48`; `src/__tests__/sandbox-session.test.ts` (`settleSandboxSession` describe block) |
| 5.2 | Sits on Phase-0 hardened billing RPCs + finance-approved rate | ❌ **Not met, by explicit deliberate design** — `settleSandboxSession` computes but never calls `Billing.deduct`; money-moving is intentionally deferred until Phase-0 billing lands (documented in the function's own header). The CPU-second rate itself is still a placeholder: `cents_per_cpu_second: 0.06`, flagged `PENDING_FINANCE` in the migration. Both are consistent with how every other agent tool cost is currently handled, not a sandbox-specific gap — but this specific MUST item is unambiguously not satisfied yet. | `settle.ts:10-16` header; `supabase/migrations/20260701000003_agentcore_tool_pricing.sql:15,58` |
| 6.1 | Env-gated availability | ✅ Met — `codeTool` checks `env.sandboxEnabled` (default `false`) and separately requires an actual `pool` to be wired before it'll run anything ("belt-and-suspenders so a stray flag can't create an executor that isn't there"); the dispatcher doesn't even advertise the tool to the model when disabled. | `code.ts:34-43` |
| 6.2 | Per-org / global instant kill-switch | ❌ **Not met.** The only toggle that exists is `SANDBOX_ENABLED`, a process-start env var — flipping it requires a redeploy/restart of `agent-runner`, not the "instantly, without a redeploy" the doc asks for. There is no per-org override anywhere (no equivalent of the existing GPU-out-of-stock or balance-top-up admin kill-switches this codebase already has elsewhere for other features) — grepped for `killSwitch`/`kill_switch` across the agent-runner and agentcore control-plane code, zero hits. | `env.ts` (`sandboxEnabled` is the only related flag); `grep -rn "kill.switch"` → no matches in `workers/agent-runner/src`, `lib/agentcore`, `app/api/agents` |
| 6.3 | Audit + alerting (session start/stop, cap-kills, egress-denies) | ❌ **Not met as a structured audit trail.** What exists: `console.error` lines for DB-write *failures* (row-insert, idle-deadline-bump, settle) and one structured JSON log line for reaper-driven reaps (`agent.sandbox_session.reaped`). What's missing: no log/audit event at all for a *normal* session start or stop, no log line when a wall-clock cap actually kills a hung exec (the kill happens silently in `docker-pool.ts`'s timeout handler — no `console.log`/`console.error` call on that path at all), and — since there's no egress allowlist to violate (§2.2 is "deny everything," not "deny outside an allowlist") — there is structurally no "egress-denied" event to alert on in the dev executor. No integration with `inference.audit_log`/`AuditLogService`, which every other agentcore management surface (MCP servers, access keys) already uses for exactly this kind of event. | `docker-pool.ts:163-173` (silent kill, no log call on the timeout branch); `persisted-pool.ts:69,91,104` (failure-only logging); `session-reaper/route.ts:93-103` (the one structured log line that does exist) |

**What this means for the sign-off table below:** items 1.1 (kernel isolation) and 6.2/6.3 (kill-switch granularity, audit trail) need actual engineering work before a security reviewer could reasonably sign off on production un-gating — they're not "review and approve," they're "not built yet." Items 3.1 (session-level wall-clock) and 4.3 (R2 spillover) are smaller, well-scoped gaps. 5.2 (billing) is explicitly and correctly blocked on the separate Phase-0 billing-hardening track, not this review. Everything else in the MUST list already holds for the dev executor and — because the prod pool is meant to swap the *runtime* behind the same `SandboxPool` interface, not rearchitect the caller — should carry over largely unchanged once §15.3 (Firecracker/gVisor, on current infra vs. the owned fleet) is actually decided and built.

---

## 0. Open decision that blocks the *real* pool (not the scaffolding)

- [ ] **§15.3 — where does the *production* pool run?** Firecracker/gVisor pool on the current RunPod-backed k8s **now**, or wait for the owned B300/H200 fleet? *(Owner: platform/manager. Until decided, production has no pool; local dev may use the shared-kernel `DockerSandboxPool` behind the gate — see the preamble.)*

---

## 1. Isolation (MUST — no customer code runs until all checked)

- [ ] **Kernel isolation (production un-gating).** Each session runs in a gVisor (runsc) or Firecracker microVM — **not** a shared-kernel container. No tenant shares a kernel with the host or another tenant. *(The local-dev `DockerSandboxPool` is shared-kernel by design and does NOT meet this — which is exactly why it is walled off to a developer's own machine and can never be enabled in a shared env. The prod pool swaps the runtime to `runsc`/Firecracker behind the same interface via `SANDBOX_RUNTIME`.)*
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
