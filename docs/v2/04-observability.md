# Deploy v2 — observability, metering and the operator surface

Last updated 2026-08-26 · branch `feat/deploy-v2-obs` · lane: telemetry

Companion to [03-status.md](03-status.md), which covers the build and runtime
path. This covers what watches it.

Everything here is **read-only**. Nothing in `lib/paas/telemetry/` or
`scripts/v3/` creates, modifies or destroys any resource. `scripts/v2/teardown.ts
--apply` and `scripts/v2/reconcile.ts --apply` remain the only things that
change anything, run by a person who has read a report first.

## Running it

```bash
node --test "lib/paas/telemetry/*.test.ts"                                   # 404 tests, no deps
node --env-file=.env --env-file=.env.local scripts/v3/operator-view.ts       # everything, once
node --env-file=.env --env-file=.env.local scripts/v3/fleet-drift.ts --prove
node --env-file=.env --env-file=.env.local scripts/v3/dns-drift.ts
node --env-file=.env --env-file=.env.local scripts/v3/r2-drift.ts
node --env-file=.env --env-file=.env.local scripts/v3/workload-drift.ts
node --env-file=.env --env-file=.env.local scripts/v3/usage-sample.ts --samples 20 --interval 30
node --env-file=.env --env-file=.env.local scripts/v3/traffic-watch.ts --samples 20 --interval 30
node --env-file=.env --env-file=.env.local scripts/v3/density-check.ts        # pricing arithmetic
node --env-file=.env --env-file=.env.local scripts/v3/sandbox-overhead.ts     # declared vs real
node --env-file=.env --env-file=.env.local scripts/v3/sweep-health.ts         # are the sweeps running
node --env-file=.env --env-file=.env.local scripts/v3/cost-attribution.ts     # per-app cost vs tier
node --env-file=.env --env-file=.env.local scripts/v3/pod-logs.ts <ns> <pod>
node --env-file=.env --env-file=.env.local scripts/v3/telemetry-probe.ts

# History: the only script here that writes, and only to an append-only log
node --env-file=.env --env-file=.env.local scripts/v3/drift-sweep.ts          # report
node --env-file=.env --env-file=.env.local scripts/v3/drift-sweep.ts --record # write
node --env-file=.env --env-file=.env.local scripts/v3/drift-sweep.ts --history
```

`drift-sweep --record` takes around two minutes, since it reads Linode,
Cloudflare, R2 and the cluster in one pass — fine on a schedule, too slow for
anything interactive. See **Scheduling it** below.

Both env files are required: Supabase credentials live in `.env`, the `V2_*`
ones in `.env.local`.

Exit codes are meant for schedulers, and the contract lives in
[`exit-codes.ts`](../../lib/paas/telemetry/exit-codes.ts):

| | |
|---|---|
| `0` | ran, nothing to report |
| `1` | **could not run** — nothing was measured; alert |
| `2` | the instrument is wrong — self-check failed or input refused |
| `10` | ran and **found** something — the tool working, not failing |
| `11` | **urgent** — currently only a claimable hostname |

Codes under 10 are about the *run*; codes from 10 up are about the *world*.
That split exists because `1` used to mean both "found drift" and "could not
run", which is unalertable: those need opposite responses and arrived as the
same number.

**Enforced, not conventional.** Both spellings of `process.exit(1)` are the
same three characters, so a reviewer cannot tell a correct one from a relapse
by reading it — and a relapse stays invisible until a scheduler acts on it.
`exit-contract.test.ts` refuses any bare non-zero exit under `scripts/v3`;
`exit(0)` stays allowed because it is unambiguous. Comments are stripped first,
so a docblock explaining the old convention describes the problem rather than
committing it.

Two rules the sweeps follow that are easy to get backwards:

- **A partial sweep never exits clean.** `drift-sweep.ts` skips the hostname
  scope when the gateway has no address; exiting `0` would tell a scheduler
  that a domain nobody looked at is fine. Incomplete coverage is a finding.
- **A finding is not a failure.** A drift script exiting `10` has worked. The
  CronJobs translate `10`/`11` to a zero pod exit so Kubernetes agrees, and
  `sweeps.ts` refuses to apply that translation unless it can see the contract
  in the shipped source — a mapping applied to the wrong convention turns the
  alert-worthy case into a green tick.

## Scheduling it — the premise, not the last mile

**A reconciler nobody runs is the same as no reconciler.** That is the
assumption the modules, the surface and the tests all rest on, and it was
literally true of this codebase for most of the day. The product lane grepped
for `reconcileProject`'s callers, found the only one was a proof script, and
held `routingLive = false` against being told twice that routing worked. They
were right, and the fix was a runner rather than a correction to them.

**Five sweeps now run as CronJobs** in `ahura-system`, installed by
`scripts/v2/install-sweeps.ts --apply`:

| Sweep | Schedule |
|---|---|
| `sweep-usage-sample` | `*/15 * * * *` |
| `sweep-workload-drift` | `8,23,38,53 * * * *` |
| `sweep-r2-drift` | `12 * * * *` |
| `sweep-dns-drift` | `26 * * * *` |
| `sweep-fleet-drift` | `44 * * * *` |

**Do not trust this page for their current state** — run
`scripts/v3/sweep-health.ts`, which is also the last section of
`operator-view.ts`. The history below is kept because the failure was
instructive, not because it is still true.

Two properties make these safe to run unattended, and both were designed for
it rather than discovered afterwards:

- **`record_drift` does not reset `observed_at`** on something already open, so
  sweeping every 15 minutes measures duration instead of restarting the clock.
- **Usage rows are interval deltas**, so a missed run loses that interval and
  nothing else. It cannot double-count, and `unobserved_seconds` records the
  gap so the period stays honest about it.

**The first property is verified against the real table rather than asserted.**
Two sweeps 43 minutes apart: the second recorded 15 open observations and
resolved 2 that had cleared, and the surviving 17 read `open for 43m` rather
than restarting at zero. The two that closed were the `v2-express` and
`v2-docker` hostnames, opened when nothing wrote `paas.aliases` rows and closed
when the deploy path started recording:

```
unrecorded  hostname  resolved after  43m  v2-express.ahurasense.com
unrecorded  hostname  resolved after  43m  v2-docker.ahurasense.com
```

That is the whole point of the table stated as an actual answer: this drift
appeared, lasted 43 minutes, and is gone. Before it existed, the same fix would
have left no trace that anything had ever been wrong.

A run that cannot reach its dependency does **not** resolve its scope — an
empty result from a failed Cloudflare read is indistinguishable from a clean
one, and closing every open observation because a read failed would erase
exactly the durations the table exists to measure.

Alerting is a separate decision. The exit codes carry the severity; nothing
consumes them.

### Why sweep-health exists: a green fleet that proved nothing

*(Found 2026-08-26 17:xx, fixed by a redeploy within the hour. Kept because the
shape recurs, not as a current state.)*

`sweep-r2-drift` had fired every hour since 14:51 and **never succeeded**. It
was not broken: it ran, produced a complete and correct report, and exited `10`
— *ran and found something* — which Kubernetes marks as a failed Job.

The deployed ConfigMap carried pre-contract source (`process.exit(clean ? 0 :
1)`) and the deployed command had no exit-code translation, so its real findings
reached the scheduler as a crash. `sweeps.ts` behaved correctly throughout: it
**refuses** to translate `10`/`11` unless it can see the contract in the shipped
source, precisely so a mapping is never applied to the wrong convention. The
contract shipped after the CronJobs were installed, and nothing re-deployed
them.

**The other four mattered more.** They were green because they had found
nothing. All five lacked the translation, so the first real finding from any of
them would have looked exactly like a crash — a green fleet was evidence of an
empty platform, not a working pipeline, and there was no way to tell those apart
from outside.

That is why `sweep-health.ts` checks two independent things and never lets the
first imply the second:

| | |
|---|---|
| **Did it run** | `lastScheduleTime` vs `lastSuccessfulTime` |
| **Would a finding survive** | read from the **deployed** container command, not the source that built it — the cluster may be running an older manifest, and the question is what the cluster does |

A sweep that has never succeeded reports `domainUnobserved`, and the wording is
the point: **its silence is not evidence of anything.** This lane's recurring
defect turned on the lane itself, and the worst instance of it yet — the missing
observation was the one that would have revealed the others were missing.

`never-succeeded` is kept distinct from `failing`: a sweep with a past success
has observed its domain and is merely stale, one without has never observed it
at all, and collapsing them overstates the first case while burying the second.

**Fixed by re-running `scripts/v2/install-sweeps.ts --apply`**, which ships the
current source and enables the translation. `sweep-health` detected the change
on its own, dropping its untranslated count from five to zero without being
told — which is the behaviour to expect from it, and the reason to run it rather
than read this.

Two things the episode is worth remembering for:

- **`install-sweeps.ts` reports staleness on a dry run** (`running source:
  <hash> — STALE`), because a CronJob ships a *snapshot* of the source and never
  updates itself. Eleven commits landed while the cluster ran the older copy.
- **Contract presence is asked per sweep**, not once for the fleet. It used to
  test the union of every closure, so one contract-aware script granted the
  translation to all five. Harmless in practice — the mapping only touches
  `10`/`11`, which a script without the contract never emits — but it stated a
  fleet-wide fact that was untrue of `usage-sample`.

## What exists

| Module | Does | Tests |
|---|---|---|
| `telemetry/reconcile.ts` | Linode vs `paas.clusters` / `paas.build_vms`, priced | 25 |
| `telemetry/build-log.ts` | Build-log sanitisation — stage allowlist, then patterns | 27 |
| `telemetry/runtime-logs.ts` | Pod logs: clamping, previous-container, path validation | 19 |
| `telemetry/usage.ts` | Warm-seconds, pod-seconds, build-minutes | 25 |
| `telemetry/usage-store.ts` | Interval deltas → `paas.usage_samples` | 25 |
| `telemetry/dns-drift.ts` | Cloudflare vs Ingress vs `paas.aliases` | 17 |
| `telemetry/r2-drift.ts` | R2 objects vs `paas.deployments` | 20 |
| `telemetry/r2-reap.ts` | What is safe to delete, and what only looks it | 14 |
| `telemetry/workload-drift.ts` | K8s Deployments vs `paas.deployments` | 23 |
| `telemetry/signals.ts` | Abuse and quota signals — detection only | 22 |
| `telemetry/drift-history.ts` | Findings → `paas.drift_observations` | 15 |
| `telemetry/metrics.ts` | metrics.k8s.io quantities → cores and bytes | 18 |
| `telemetry/traffic.ts` | Request shape: organic, keep-alive, or unobserved | 20 |
| `telemetry/quota.ts` | Whether a ResourceQuota can be enforced without eviction | 25 |
| `telemetry/trivy.ts` | Three verdicts — `undecided` blocks, it does not pass | 16 |
| `telemetry/density.ts` | Pods per node: kubelet cut, sandbox charge, $/pod | 9 |
| `telemetry/sandbox.ts` | Sandbox cost vs what we charge, and headroom against it | 21 |
| `telemetry/attribution.ts` | Per-app cost against tier, and whether it still fits | 16 |
| `telemetry/sweep-health.ts` | Whether the sweeps ran, and whether findings survive | 13 |
| `telemetry/cadence.ts` | Whether a schedule can produce what it claims to measure | 9 |
| `telemetry/exit-codes.ts` | What a sweep's exit code means to a scheduler | — |
| `telemetry/operator.ts` | Composition for the API and dashboard | — |
| `telemetry/fleet-source.ts` | The I/O half. Every call is a GET | — |
| `telemetry/admin-boundary.test.ts` | Test-only: enforces the admin security boundary | 8 |
| `telemetry/write-safety.test.ts` | Test-only: no write in this lane swallows its failure | 7 |
| `telemetry/exit-contract.test.ts` | Test-only: no script exits on a bare non-zero number | 4 |

Surfaces: `GET /api/v2/admin/{fleet,hostnames,workloads,storage,metrics,usage}`,
`GET /api/v2/admin/pods/{namespace}/{pod}/logs`, and `/dashboard/v2/admin`.

The dashboard calls `operatorView()` directly rather than fetching its own API —
a round trip to its own process would add a failure mode and an auth hop for
nothing. Each of its sections renders independently, because an operator
dashboard is most useful exactly when one dependency is broken — the metrics
section currently proves that, reporting that metrics-server is absent while
the other five render normally.

## What the live system currently says

Read on 2026-08-26 against LKE `647920`, after the infrastructure lane acted
on everything below that is marked fixed.

**Clean:**

- **$116.07/month standing, $0.00 unaccounted.** Every Linode resource has a
  control-plane row and every row has a resource.
- **0 claimable hostnames**, and all four live hostnames now have a
  `paas.aliases` row. Three did not: `deploy-e2e.ts` applied Kubernetes objects
  directly and wrote no rows, so promote and rollback had nothing to read.
  Fixed at the source — the deploy path now records as the only way to deploy —
  rather than by backfilling, which would have papered over a script that could
  still create untracked infrastructure.
- **0 unaccounted pods.** Four workloads were running with no
  `paas.deployments` row; the same fix cleared them.
- **0 apps down.** Two had `ready` rows and zero ready replicas — one Pending on
  `CreateContainerConfigError`, one restarting after starting gunicorn cleanly
  and being SIGTERM'd. The second was a port mismatch, not an app fault, which
  is why the previous-container log mattered: it showed the app working.
- **Superseded deployments sit at 0/0 replicas with the object kept**, so
  rollback is a scale-up rather than a rebuild. Every deploy used to leave the
  previous Deployment at full replicas, silently doubling pod count per deploy.

- **`clusters.pod_allocated` is derived, not counted**, and self-heals. It read
  0 because five places read the column and none wrote it. It is now recomputed
  from the cluster each sweep — installing metrics-server moved it 23 → 24 with
  no intervention, which an incremented counter would have required someone to
  remember.

**Still open:**

- **846 MB reclaimable in R2 — 73% of the bucket.** It was 486 MB two hours
  earlier: every redeploy writes a fresh `image.tar` that nothing deletes, so
  this scales with deploy frequency rather than being a fixed backlog. That is a
  different argument at 10,000 apps than it looks like at five.
- **Warm fraction is 1.0, and the apps are doing nothing.** With metrics-server
  live the reading is `100.0% warm, 2–3m cpu` — each app holds a full pod slot
  at roughly 0.3% of a core. There is no scale-to-zero, so the fleet costs the
  always-on model in the plan while delivering nothing that needs it.

### The meter was flattering the cost model by 23×, and `period_seconds` caught it

The most consequential bug this lane shipped, and it is worth stating in
business terms rather than as a metering detail.

Running `--period` against real stored samples reported three apps that are
warm **100%** of the time as **4.3% warm** — and not degraded. The sampler had
run for two minutes of the hour, and `unobserved_seconds` only records gaps
*between* samples, never the stretch where nothing sampled at all.

At the time, the plan's entire v2 business case was a ~5× gap — ~$52k/month
always-on against ~$18–20k with idle-to-zero — resting on one unmeasured number,
and that number was the warm fraction. (Pricing went flat on 2026-08-26, so the
warm fraction no longer sets the price; see above for what it measures now.) The
first attempt to measure it was wrong by roughly **23×, in the direction that
says the model is already achieved**.

Had that reached the pricing conversation it would have confirmed what everyone
wants to be true, with a real measurement behind it. A number that flatters the
case and is confident about it is worse than no number.

It is also the strongest argument for a schedule: a meter that runs only when
someone remembers produces exactly this failure by construction, because
"nobody was watching" and "nothing was happening" are the same reading.

The fix uses the `period_seconds` column the infrastructure lane added over the
requested shape, for an unrelated reason — pod-seconds alone is ambiguous
between one pod for five minutes and five pods for one. Summing it gives
coverage, warm fraction divides by what was *watched*, and coverage below 95%
marks the period degraded. Rows written before the column fall back to the old
semantics.

### The migrations do not describe the database

`grep -rn "expired\|claimable" supabase/migrations/*paas*` returns nothing, and
the live `paas.drift_kind` enum has both. Six values in the database, four in
the files. Reproduced independently from two different worktrees.

Anyone reasoning about that schema from the repository — a future session, a
reviewer, either of the other lanes — gets a confident wrong answer. This was
nearly acted on in both directions at once: a peer's claim that the values
existed was almost taken on trust, then almost rejected on the file grep.
Trusting would have been right by accident; checking the file would have been
wrong on evidence.

So `scripts/v3/telemetry-probe.ts` probes the live schema instead: each enum
value with a no-op `resolve_drift_not_in`, which changes nothing when no
observation of that kind is open. Before assuming what the schema supports,
run it.

### Rules that enforce themselves

Three constraints in this lane are tests that read real source, not comments:

- `build-log.test.ts` reads `lib/paas/build/vm.ts` and fails if the build
  script emits a stage marker the sanitiser does not classify.
- `admin-boundary.test.ts` reads every file under `app/api/v2/admin` and fails
  if one becomes tenant-scoped, imports a service-role client, can return
  before authorising, or answers 403.
- `metrics.test.ts` pins that binary suffixes are matched before decimal ones,
  so `Mi` can never be read as `M`.

Each replaced a comment. The pattern came from a review point that landed
hard: a rule written against "safety that depends on the next person
remembering" is itself safety that depends on the next person remembering, if
it lives in a docblock. Both boundary suites also prove they can *fail* —
`tenantScopeIn` is tested against synthetic violations, and the suite refuses
to run against an empty directory. A check that cannot detect a violation sits
green forever, which is the failure `fleet-drift --prove` exists to rule out.

### The defect fleet reconciliation cannot see

`fleet-drift.ts` compares Linode to the control plane, so it sees clusters,
nodes and build VMs. It cannot see a workload: a Deployment with no
`paas.deployments` row lives entirely inside Kubernetes, on a node that *is*
recorded, in a cluster that *is* recorded. Fleet drift reports clean while the
pod rides along.

`workload-drift.ts` closes that, and its currency is **pods rather than
dollars** — LKE caps pods per cluster, and the plan is explicit that this cap,
not CPU or RAM, is what forces a multi-cluster fleet.

Its `down` status exists because the live run exposed a gap in the first
version: it compared only *existence* — is there a workload for this row, is
there a row for this workload — so two apps with a row, a workload, and zero
ready pods were classified healthy. Comparing existence and not state is the
same class of defect this whole document is about. `down` now sorts above
everything else, because it is the only status a customer can see.

### The R2 finding, and one thing it nearly got wrong

The reclaimable bulk is `image.tar` for ready deployments. That is safe because
the tar is a *transfer* artifact: skopeo copies it into the registry, and from
then on the deployable image is the registry's digest-pinned copy — the schema
enforces it, `deployments_ready_has_image` requires `image_repo` and
`image_digest` on any `ready` row. Rollback repoints a Service selector at a
digest and never re-reads the tar.

Two things the live run corrected that reasoning alone did not:

**The same bucket backs the in-cluster registry** — 116 objects, 210.9 MB under
`registry/`. Those blobs *are* the deployed images, and they are exactly what
makes a tar redundant. They were initially unclassified, which was safe (unknown
is never proposed for deletion) but made 85% of the report noise. Now recognised
explicitly, with the coupling stated: if registry blobs were ever reclaimable,
the redundant classification would be wrong too.

**Several "orphaned" build logs belong to apps running right now.** A missing
`paas.deployments` row is not proof the app is gone — those deployments simply
predate the recording work. So `reclaimable` is separate from disposition: an
orphaned log is a *finding*, not garbage, and deleting it to save 7 KB would
destroy the only account of how a live app was built.

## The finding that matters commercially

**The pod-density table in `05-pricing.md` §2 is 19% high, and two tiers stop
working.** It asks for 110 tenant pods on a `g6-standard-16`; 89 fit. The deploy
lane derived those figures, said so, and asked for them to be measured — this is
that measurement, and `scripts/v3/density-check.ts` reruns it.

Two independent errors that compound:

- **The kubelet's cut was never counted.** §2 allows "4 GB per node for system
  overhead (Cilium, gVisor installer, metrics, DaemonSets)". That describes
  system *pods*, which request only 0.81 GiB. But the kubelet reserves its own
  slice before any pod schedules, and it is larger: **1.90 GiB on the live
  `g6-standard-4`, 24.5% of capacity**, and ~5.5 GiB on the 64 GB shape. So
  "60 GB usable" is really 55.77.
- **The sandbox charge is 4.5× what the table allows.** §2 budgets 30 MB per pod
  for the gVisor sentry. `gvisor.ts:65` declares `overhead.podFixed` at
  **128Mi**, and `manifests.ts:323` puts every tenant pod on that RuntimeClass.
  The scheduler *adds* podFixed to the pod's requests, so what the sentry
  consumes at runtime is beside the point — 128Mi is what the node is billed.
  `01-discovery.md:974` predicted exactly this, warning the sentry figure had no
  primary source and had to be measured "before it enters any pricing model".

At §2's 15% platform loading, against the published prices:

| Tier | Was | Now | Margin |
|---|---|---|---|
| Starter 512Mi | $4.01 | **$4.96** vs $5 | 20% → **0.8%** |
| Basic 1Gi | $7.89 | **$9.01** vs $9 | 12% → **−0.1%** |
| Standard 2Gi | $15.77 | $16.98 vs $19 | 17% → 10.6% |
| Plus 4Gi | $31.54 | $33.97 vs $39 | 19% → 12.9% |

Basic sells below cost. The error is worst at the small tiers because a fixed
per-pod charge is proportionally largest on the smallest pod.

It also **inverts the shape choice**. `02-architecture.md:161` prefers the 32 GB
shape "by ~15%/pod" because RAM binds before the 110-pod cap on it. At 128Mi of
overhead RAM binds on *every* shape, so that reasoning selects nothing, and the
proportionally larger kubelet reservation makes the smaller node worse:
`g6-standard-16` $4.31/pod, `g6-standard-8` $4.57, `g6-dedicated-16` $6.86.

The 64 GB figures are **derived, not measured** — this cluster runs
`g6-standard-4`. Capacity and allocatable are read from real nodes; the big
shape's allocatable comes from the tiered kubelet formula, anchored to the real
node it reproduces to within 50 MiB. The report labels this on every run. Buy
one and re-run to replace the derivation.

### About half of it is recoverable, and only that half is ours

The two errors are not equally fixable. The kubelet's ~5.5 GiB is physics and
stays. The 128Mi sandbox charge is a **declaration we chose**, and
`scripts/v3/sandbox-overhead.ts` measures it against reality — all three running
sandboxed pods cost **less in total** (sentry, gofer *and* application together:
66.3, 88.9, 93.5 MiB) than the sandbox charge alone.

So the declaration is above its own ceiling. What that is worth, for 512Mi pods
on a `g6-standard-16`:

| `podFixed` | Pods | $/pod | Tier cost |
|---|---|---|---|
| **128Mi** *(today)* | 89 | $4.31 | $4.96 |
| 96Mi | 93 | $4.13 | $4.75 |
| 64Mi | 99 | $3.88 | $4.46 |
| 32Mi | 104 | $3.69 | $4.25 |

At 64Mi, Starter returns from 0.8% margin to ~10.8%.

**This measurement proposes no replacement value, deliberately.** The sentry is
not separable from here: cAdvisor sees cgroups, and a gVisor pod is one opaque
cgroup holding sentry, gofer and app together — that opacity is the product
working. The result is a *ceiling*, not a figure.

**The figure came from the load test that followed.** `scripts/v2/sandbox-loadtest.ts`
(deploy lane) A/Bs the same workload against `runc`, changing nothing but
`runtimeClassName`, and measures the sandbox at **42–45 MiB** — about a third of
the declaration, and consistent with the idle ceiling above. Its first version
had the workload report its own RSS from *inside* the sandbox, which is the
sentry's virtualised view rather than host cgroup accounting; it produced
negative overhead, and only the absurd sign caught it.

**Still not applied, and the reason is not caution for its own sake.**
Under-declaring overhead produces no warning of any kind: the scheduler accepts
more pods than the node can hold and the kernel OOM-kills whichever allocates
next, possibly a different tenant's than the one that caused it. Silent,
delayed, and landing on the wrong person. One workload shape on an idle node
cannot establish what holds for the worst moment of the worst tenant.

### Headroom — what makes the cut reversible

So `sandbox-overhead.ts` also tracks the only quantity observable on real tenant
workloads: **the whole pod against its whole reservation** (requests +
`podFixed`), continuously. At the current 128Mi:

```
dpl-1a483c1793c7   93.5 MiB of 640.0 MiB   14.6%
dpl-e2404975a02e   88.9 MiB of 640.0 MiB   13.9%
dpl-e2215252040c   66.3 MiB of 640.0 MiB   10.4%
```

This is **not evidence for a reduction** — these are the workloads we happen to
have, not the worst a tenant can produce. It is what makes one reversible: if
pods start running hot afterwards, this says so before a node does.

The sentry's share is still not separable, and here it does not matter. If the
total fits, the split between app and sandbox is an accounting question; if it
does not, the pod is at risk regardless of which half grew.

An unread pod reports null utilisation, never zero, and the peak ignores it
rather than averaging it in — a pod at 0% would be the strongest possible
argument for cutting a reservation, on no evidence at all.

The parsing carries this lane's recurring defect in its most expensive location:
**a gVisor pod exposes no named container series at all.** Summing named
containers — how you would total any normal pod — returns **zero** for every
sandboxed pod, which reads as a free sandbox and argues for cutting the
reservation to nothing. Absence of container series on a sandboxed pod means
unreadable, never empty. It is a test, not a comment.

### Per-app attribution — what flat pricing made necessary

Under warm-time pricing, consumption and revenue moved together: an app that
ran hot paid more, so nobody had to watch. **Flat pricing severs that link on
purpose** — the customer pays the same whether the app sleeps or pins its
ceiling all month — which turns per-app consumption into something that must be
measured rather than read off an invoice.

`cost-attribution.ts` compares each project's tier against what it actually
runs. Live: 3 apps, all Starter, **$21.00/mo revenue against $13.38 cost, 36%
margin** — which matches the repriced Starter margin exactly, a cross-check
worth having since the two are computed without sharing a constant.

Three things go wrong and they are **not one finding**, because each carries a
direction:

| | | |
|---|---|---|
| `tier-drift` | deployed pods do not match the tier billed | either way |
| `instance-drift` | running pods ≠ `instance_count` | either way |
| `outgrown-tier` | sustained occupancy of the CPU ceiling | against the platform |

"Pods do not match the tier" is a leak in one direction and a refund in the
other. A report that says only *drift* makes someone read every row to find out
which, so `against: "platform" | "customer"` is part of the finding.

**Memory is not the abuse vector**, which matters because it is the axis the
whole price is built on: request equals limit on every tier, so an app cannot
consume more than it reserved — it OOMs instead. The exploitable axis is **CPU
on the shared tiers**, where the request is 50m and the ceiling is 1000m. An app
living at that ceiling consumes twenty times what it reserves, pays the shared
price, and takes those cycles from its neighbours.

And that is *not a fault*. Burst is what shared is sold as, so the threshold is
deliberately high (80% sustained) and the finding is framed as a tier that no
longer fits — a sales conversation before an abuse one.

An unknown tier is skipped rather than defaulted: attributing a Pro customer
against Starter economics would report a healthy margin on an app we might be
losing money on. Unread usage is a finding, never a quiet app, and it is counted
separately so "3 apps with findings" cannot come to mean "3 apps we failed to
read".

### Warm fraction, and what flat pricing did to it

Measured, and today it is **1.0** — expected, since scale-to-zero is
unimplemented. When the plan priced on warm time this was the central number and
a free uptime pinger was a revenue threat.

**Pricing is now flat** (`05-pricing.md`, decided 2026-08-26), so that question
is closed: a customer pays the same whether the app sleeps or not. The
measurement did not become useless, it changed job. Under a flat rate a pinged
app and a busy app pay the same and cost the same, so traffic shape is no longer
a pricing input — it is a **margin and abuse signal**, and the only thing that
distinguishes a keep-alive from a customer. CPU cannot: a pinged app is warm,
running, and almost perfectly idle. `traffic.ts` classifies the shape;
`traffic-watch.ts` runs it.

Scale-to-zero remains the difference between the two cost models, and under flat
pricing every hour it saves is margin rather than a smaller invoice.

`usage.ts` measures warm-seconds from pod phase and container start time, so it
needs no metrics-server and works today.

## Design decisions worth knowing

**Cost that cannot be known is reported as unknown, never as zero.** A Linode
type missing from `/linode/types` makes the affected resource's price `null` and
the whole report not-clean. `teardown.ts` and `scripts/v2/reconcile.ts` both do
`?? 0`, which understates the bill while reading as reassuring.

**Standing spend and transient spend are separated.** Build VMs live for
minutes. Projecting one across 730 hours turns $0.002 of real spend into
$26/month of fiction — a first live run reported $142.35/month for
infrastructure that costs $116.07 for exactly this reason. Only standing spend
is ever multiplied out.

**Node and NodeBalancer cost is attributed to the parent cluster**, because
neither is recorded individually — `paas.clusters` carries the cluster and its
children are implied. So the incident reads as one unrecorded cluster carrying
$116.07/month rather than four unrelated resources. The `^lke(\d+)-` label
convention that makes this work is under test; it fails silent otherwise, and a
silent failure reports "no drift" while money runs.

**Metering under-bills wherever it cannot know.** The first sample of a period
attributes zero however long a pod has been up. A sampler outage is capped at 15
minutes and the remainder recorded as `unobservedSeconds`. A restart moves
`startedAt` forward so dead time is not billed. A build VM with no `destroyed_at`
bills zero rather than becoming an unbounded invoice — and raises a critical
signal instead. Warm fraction divides by *observed* time, not the nominal
period; dividing by the period after an outage flatters the cost model.

**There is deliberately no bandwidth figure.** The only honest source is the
gateway, which sees requests to the app. A pod's network counters cannot tell a
user download from an `npm install`, and v1 billed customers for their own
database and package-registry traffic that way. Traefik's own metrics are the
correct seam.

**Collection is never triggered by a page render.** v1's bandwidth meter ran
only when a customer opened their own dashboard, so an app nobody visited was
never metered and never billed. That defect is a property of *where collection
is invoked from*, so correct arithmetic is not a safeguard. `usageView()`
returns no warm fraction for exactly this reason.

**Build logs: allowlist first, patterns second.** Whole stages the customer has
no business reading are dropped — `clone`, because git quotes the tokenised
remote URL in its own stderr, and `upload`, because a presigned R2 URL's
signature *is* a credential granting the object write the build-VM design exists
to withhold. Patterns are the second layer, because a pattern list is a denylist
and a denylist bets you thought of everything. The first pass at this thought of
GitHub tokens and not of the presigned URLs one stage later.

Default is deny: output before any marker is dropped, and an unrecognised marker
stops output rather than inheriting the previous stage's policy. One test reads
`lib/paas/build/vm.ts` and fails if the build script emits a stage marker that
`build-log.ts` does not classify.

**`claimable` is a security finding, not housekeeping.** A record resolving to
the gateway with no Ingress behind it 404s today — and the next Ingress to name
it, in any tenant namespace, receives its traffic. That is subdomain takeover
with the DNS step already done. It has its own exit code.

**Runtime log identifiers are allowlisted, not sanitised.** `namespace` and
`pod` go into `/api/v1/namespaces/{ns}/pods/{name}/log`, so an unvalidated value
is path traversal into the rest of the Kubernetes API using the platform's own
credentials. Both are matched against RFC 1123 — a denylist of `..` and `/`
would still admit `%2e%2e%2f`, a null byte, or a newline.

**The service role never enters `app/`.** `app/api/v2/_lib/auth.ts` forbids it,
because v1 used a service-role client for 100% of tenant queries and reduced its
own RLS to decoration. The admin routes need `paas.clusters` and
`paas.build_vms`, which have RLS with no policy and are reachable no other way —
so the reads live in `telemetry/operator.ts` and a route's only job is proving
the caller is an operator first. Nothing in the admin subtree is tenant-scoped,
so no RLS is being bypassed. The gate fails closed on every path and returns
404, never 403.

## What is NOT done

**Blocked on the infrastructure lane:**

*(metrics-server and the two extra `drift_kind` values were listed here and
have both landed. T4 was built while `metrics.k8s.io` was absent and was
correct on its first contact with real data — `2943895n` → `3m`,
`65240Ki` → `63.7 MiB` — which is the argument for testing quantity parsing
rather than trusting it. Reading `Mi` as `M` understates memory by 4.6% and
throws nothing. `metricsView()` still throws when the API is absent rather than
returning zeros: an idle app and a missing metrics API produce the same number,
and a dashboard showing `0m` everywhere looks like a working one.)*

- **Two more `paas.drift_kind` values.** `expired` and `claimable` have no
  honest home in the four that exist, so their *history* is not recorded — see
  the mapping note in `drift-history.ts`. Both are still reported by their own
  tools and exit codes; only duration is missing.

*(`paas.usage_samples` was listed here as a missing table. It was applied
while this was being written — a missing table needs a migration, an empty
one needs a runner, and those are different asks. See the scheduling section.)*

**Not started:**

- **Streaming an in-flight build log.** Architecturally blocked rather than
  unbuilt: `vm.ts` uploads the log ONCE, from its exit trap, so there is no
  incremental object to follow. Real streaming needs the build VM to upload
  chunks periodically — a change in the build lane. Fetch, sanitise and
  paginate are done, which covers the stated acceptance criterion.
- **A `rpc()` helper in `lib/paas/db.ts`.** `drift-sweep.ts` inlines one
  because it is currently the only caller. Second caller should promote it.
- **Alerting.** The exit codes carry the severity and the sweeps now emit them
  correctly; nothing consumes them. `drift-sweep.ts` is not among the scheduled
  CronJobs — the five sweeps run their sources individually. Scheduling the
  aggregate as well is a configuration decision, not code.
- **`podFixed` is still declared at 128Mi** against a measured 42–45 MiB. See
  the sandbox section: the measurement exists, the headroom monitor exists, the
  change has not been made.

*(Two items were listed here and are done. **Scheduling**: five sweeps run as
CronJobs — see the scheduling section, and `sweep-health.ts` for whether they
are working. **Pod-level reconciliation against `paas.deployments`**: that is
`workload-drift.ts`, which reports unaccounted pods and reconciles
`pod_allocated`. The fleet reconciler still only compares Linode to the control
plane, which is why the two are separate tools.)*

**What can and cannot be checked here.** `node_modules` is installed, so
`npx tsc --noEmit` typechecks the repo — it currently reports one pre-existing
error unrelated to this lane (`components/dashboard/gpu/deploy-wizard.tsx:30`
imports `GPU_MARKUP_PCT`, which `lib/services/runpod/helpers` does not export;
arrived with the Wokey/GPU migration in `2a0c22f9`).

`.tsx` still cannot be *executed* or syntax-checked by `node --test`, since
Node strips types but does not transform JSX. So everything under `app/` is
typechecked but never run.

That is why every decision lives in `lib/paas/telemetry/`, where `node --test`
actually runs it, and why `scripts/v3/operator-view.ts` exists — it exercises
the exact function the routes and the page call, against live infrastructure.

## Conventions

- Relative imports with `.ts` extensions inside `lib/paas`. That is what keeps
  zero-dependency testing working.
- No TypeScript parameter properties — Node's type stripper rejects
  `constructor(public x: T)` with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Same for
  `enum`; use a `const` array with `as const` and a derived union.
- `node --test lib/paas/telemetry/` silently runs one bogus test and fails. Use
  the quoted glob.
