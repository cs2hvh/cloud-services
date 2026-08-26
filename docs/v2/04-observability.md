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
node --test "lib/paas/telemetry/*.test.ts"                                   # 226 tests, no deps
node --env-file=.env --env-file=.env.local scripts/v3/operator-view.ts       # everything, once
node --env-file=.env --env-file=.env.local scripts/v3/fleet-drift.ts --prove
node --env-file=.env --env-file=.env.local scripts/v3/dns-drift.ts
node --env-file=.env --env-file=.env.local scripts/v3/r2-drift.ts
node --env-file=.env --env-file=.env.local scripts/v3/workload-drift.ts
node --env-file=.env --env-file=.env.local scripts/v3/usage-sample.ts --samples 20 --interval 30
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

## Scheduling it — the premise, not the last mile

**Nothing runs any of this automatically, and until something does, none of it
means anything.**

This is not a fourth item after the modules, the surface and the tests. It is
the assumption all three rest on. Unscheduled, the operator surface shows a
fleet nobody is reconciling, the drift table records drift nobody is repairing,
and the R2 leak measured growing 697 MB → 1083 MB in a single hour keeps
growing. Every one of those reads correctly and changes nothing.

The claim this lane makes — that a reconciler nobody runs is the same as no
reconciler — was literally true of this codebase two hours ago. The product
lane grepped for `reconcileProject`'s callers, found the only one was a proof
script, and held `routingLive = false` against being told twice that routing
worked. They were right, and the fix was a runner rather than a correction to
them.

The same is true here today. These scripts are correct, tested against live
infrastructure, and inert.

Two things are worth scheduling, and they are different jobs:

```bash
# Drift, every 15 minutes. Records open findings and closes what cleared, so
# "how long has this been broken" stays answerable. ~2 minutes per run.
*/15 * * * *  cd /srv/app && node --env-file=.env --env-file=.env.local \
              scripts/v3/drift-sweep.ts --record

# Usage, every 5 minutes. The interval IS the resolution of the warm fraction:
# 5 minutes bounds the attribution error at 5 minutes per app per gap.
*/5 * * * *   cd /srv/app && node --env-file=.env --env-file=.env.local \
              scripts/v3/usage-sample.ts --samples 1 --record
```

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

## What exists

| Module | Does | Tests |
|---|---|---|
| `telemetry/reconcile.ts` | Linode vs `paas.clusters` / `paas.build_vms`, priced | 25 |
| `telemetry/build-log.ts` | Build-log sanitisation — stage allowlist, then patterns | 22 |
| `telemetry/runtime-logs.ts` | Pod logs: clamping, previous-container, path validation | 19 |
| `telemetry/usage.ts` | Warm-seconds, pod-seconds, build-minutes | 23 |
| `telemetry/dns-drift.ts` | Cloudflare vs Ingress vs `paas.aliases` | 17 |
| `telemetry/r2-drift.ts` | R2 objects vs `paas.deployments` | 20 |
| `telemetry/workload-drift.ts` | K8s Deployments vs `paas.deployments` | 17 |
| `telemetry/signals.ts` | Abuse and quota signals — detection only | 17 |
| `telemetry/drift-history.ts` | Findings → `paas.drift_observations` | 13 |
| `telemetry/usage-store.ts` | Interval deltas → `paas.usage_samples` | 19 |
| `telemetry/metrics.ts` | metrics.k8s.io quantities → cores and bytes | 18 |
| `telemetry/operator.ts` | Composition for the API and dashboard | — |
| `telemetry/fleet-source.ts` | The I/O half. Every call is a GET | — |
| `telemetry/admin-boundary.test.ts` | Test-only: enforces the admin security boundary | 7 |

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

The plan's entire v2 business case is a ~5× gap — ~$52k/month always-on against
~$18–20k with idle-to-zero — resting on one unmeasured number, and that number
is the warm fraction. The first attempt to measure it was wrong by roughly
**23×, in the direction that says the model is already achieved**.

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

The approved plan prices the platform on the **warm fraction** and says plainly
that it is unmeasured. It is now measured, and today it is **1.0**.

That is expected — scale-to-zero is unimplemented — but it means the fleet
currently costs the *always-on* model in the plan: ~$52k/month and $5.20 per app
at scale, against a $5 price. The idle-to-zero model that makes the business
work assumes roughly 5% of apps continuously busy, 15% warm ~30% of the day, and
80% warm ~2%.

Two things follow, and neither is an engineering decision:

1. Scale-to-zero is not an optimisation to schedule later. It is the difference
   between the two cost models.
2. Once it exists, a warm fraction of 1.0 means either a genuinely busy app or a
   keep-alive pinger. The plan lists **warm-time pricing policy** as an open
   business decision — price it, cap free warm hours, or detect and act. The
   measurement is ready for whichever is chosen.

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
- **Anything that runs on a schedule.** Every sweep is scheduler-ready — exit 0
  clean, 1 could-not-run, 10 findings, 11 for a claimable hostname — and nothing schedules
  them. `drift-sweep.ts --record` is the one intended for cron, at roughly two
  minutes per run. This is a standing configuration decision rather than code.
- **A `rpc()` helper in `lib/paas/db.ts`.** `drift-sweep.ts` inlines one
  because it is currently the only caller. Second caller should promote it.
- **Log streaming.** Fetch and paginate are done; following an in-flight build
  is not.
- **Pod-level reconciliation against `paas.deployments`.** The fleet reconciler
  compares Linode to the control plane. A pod with no deployment row is
  invisible to it — the node is recorded and the cluster is recorded, so the pod
  rides along. The concurrent-deployment case above is exactly this defect one
  layer down.
- **Alerting.** Exit codes are scheduler-ready; nothing schedules them.

**Cannot be verified here:** `node_modules` is deliberately not installed — the
user declined `npm install`. Everything under `app/` is therefore reviewed by
inspection only: no typecheck, no lint, nothing executed. `.tsx` cannot even be
syntax-checked, since Node strips types but does not transform JSX.

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
