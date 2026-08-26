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
node --test "lib/paas/telemetry/*.test.ts"                                   # 123 tests, no deps
node --env-file=.env --env-file=.env.local scripts/v3/operator-view.ts       # everything, once
node --env-file=.env --env-file=.env.local scripts/v3/fleet-drift.ts --prove
node --env-file=.env --env-file=.env.local scripts/v3/dns-drift.ts
node --env-file=.env --env-file=.env.local scripts/v3/usage-sample.ts --samples 20 --interval 30
node --env-file=.env --env-file=.env.local scripts/v3/telemetry-probe.ts
```

Both env files are required: Supabase credentials live in `.env`, the `V2_*`
ones in `.env.local`.

Exit codes are meant for schedulers. `fleet-drift` exits 1 on drift.
`dns-drift` exits 1 on drift and **2 on a claimable hostname**, which is a
different severity and deserves a different page.

## What exists

| Module | Does | Tests |
|---|---|---|
| `telemetry/reconcile.ts` | Linode vs `paas.clusters` / `paas.build_vms`, priced | 25 |
| `telemetry/build-log.ts` | Build-log sanitisation — stage allowlist, then patterns | 22 |
| `telemetry/runtime-logs.ts` | Pod logs: clamping, previous-container, path validation | 19 |
| `telemetry/usage.ts` | Warm-seconds, pod-seconds, build-minutes | 23 |
| `telemetry/dns-drift.ts` | Cloudflare vs Ingress vs `paas.aliases` | 17 |
| `telemetry/signals.ts` | Abuse and quota signals — detection only | 17 |
| `telemetry/operator.ts` | Composition for the API and dashboard | — |
| `telemetry/fleet-source.ts` | The I/O half. Every call is a GET | — |

Surfaces: `GET /api/v2/admin/{fleet,hostnames,usage}` and
`/dashboard/v2/admin`.

## What the live system currently says

Read on 2026-08-26 against LKE `647920`:

- **$116.07/month standing, $0.00 unaccounted.** Every Linode resource has a
  control-plane row and every row has a resource.
- **0 claimable hostnames.** Nothing resolves to the gateway unrouted.
- **3 of 4 live hostnames have no `paas.aliases` row.** `publish-app.ts` creates
  the DNS record and the Ingress and writes no row, so promote and rollback —
  which the schema supports as a single write — have nothing to read.
- **5 apps, all warm 100% of the time, 1 pod each.** There is no scale-to-zero.
- **Two deployments running concurrently** in `prj-node-js-getting-started`.
  Correct if one is held warm for rollback; a per-app cost multiplier if not.

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

- **metrics-server is not installed** — `metrics.k8s.io` is absent from `/apis`.
  Per-app CPU and memory (T4) cannot be built until it is. On LKE it usually
  needs `--kubelet-insecure-tls` or the right `--kubelet-preferred-address-types`.
- **`listObjects` in `lib/paas/build/r2.ts`** — R2 holds
  `builds/{ref}/{build.log,image.tar,meta.json}` for every deployment ever made
  and nothing prunes any of it. `image.tar` is the whole OCI archive. Requested
  rather than written here, because implementing it means duplicating the SigV4
  signing that already exists.
- **A migration for drift history** — drift detected once and corrected is
  invisible afterwards, so "when did this appear and how long did it persist"
  cannot be answered. Suggested shape:
  `paas.drift_observations(id, observed_at, kind, status, cloud_id, ref, hourly, detail, resolved_at)`,
  service-role like the other fleet tables.

**Not started:**

- **Persisting usage samples.** The sampler runs and the arithmetic is tested,
  but nothing writes samples anywhere, so warm fraction exists only for the
  duration of one process. This is the single highest-value remaining item: it
  is what turns the measurement into something billing can read.
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
