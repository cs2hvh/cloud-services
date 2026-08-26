# Deploy v2 — project tracker

**The single source of truth for what is done, what is next, and who owns what.**
Read this before starting work. Update it when you finish something.

Repo `C:\cloud-app-v2` · Last updated 2026-08-26 by `cloud-app-v2-d8`

---

## 1. What this is

A ground-up rebuild of AhuraCloud's git-push-to-deploy PaaS, replacing the v1
platform-apps service. v1 had 132 confirmed defects (59 critical/high), zero
tenant isolation, and a shell RCE reachable from an ordinary user account.
`platform_apps` was empty in production, so there is **no migration burden** —
this is a clean rebuild.

Target: Vercel-class product semantics, 10,000+ apps, untrusted public signups,
on Linode + Cloudflare + R2.

Background reading — do not re-derive what these already establish:
- [`01-discovery.md`](01-discovery.md) — the v1 audit, 132 findings with file:line evidence
- [`02-architecture.md`](02-architecture.md) — the plan, substrate constraints, unit economics
- [`03-status.md`](03-status.md) — build status, live infra, what the live system taught us
- [`04-observability.md`](04-observability.md) — what watches the platform

---

## 2. Lanes and ownership

Three sessions work in parallel on separate branches. **Do not edit files
another lane owns.**

**Ownership is keyed to the BRANCH and the PATHS, not to a session name.** Session
names change — this lane has been app-deploy-rework, cloud-services-73 and
cloud-app-v2-d8; the observability lane has been app-deploy-3, cloud-app-v2-99 and
cloud-app-v2-e6 — and a table keyed to names goes stale exactly the way a stale
comment does. The branch and the paths have been stable all day.

| Lane | Branch | Owns |
|---|---|---|
| **Deploy** | `feat/deploy-v2` | `lib/paas/*` (except `telemetry/`), `scripts/v2/**`, `supabase/migrations/**`, `app/api/v2/**` (except `admin/` and `_lib/`) |
| **Observability** | `feat/deploy-v2-obs` | `lib/paas/telemetry/**`, `scripts/v3/**`, `app/api/v2/admin/**`, `app/dashboard/v2/admin/**` |
| **UI** | `feat/deploy-v2-ui` | `app/dashboard/v2/**` (except `admin/`), `app/api/v2/_lib/**`, `components/v2/**` |

`app/api/v2/_lib/` is the shared API error contract. It is authored in the UI lane
and **lives on `feat/deploy-v2`** because two lanes independently imported it —
duplicating it would produce two contracts that drift, and the whole point of
`_lib/http.ts` is that "invisible is 404, never 403" is decided in one place.

The observability lane's work is **merged into `feat/deploy-v2`** as of `e557a65b`;
it continues on its own branch. All three converge on `feat/deploy-v2` before `dev`.

---

## 3. Current state — verified, not claimed

Three real public repositories go from a git URL to a live public HTTPS URL with
no manual step:

| Repo | Detected | Live |
|---|---|---|
| `heroku/node-js-getting-started` | express | `v2-express.ahurasense.com` — **200** |
| `Azure-Samples/python-docs-hello-world` | flask | `v2-flask.ahurasense.com` — **200** |
| `docker/welcome-to-docker` | own Dockerfile | `v2-docker.ahurasense.com` — **200** |

**Live infrastructure**

| | |
|---|---|
| Cluster | LKE `647920` `ahura-v2-dev`, k8s 1.36, `in-bom-2` (Mumbai 2) |
| Nodes | 2 × `g6-standard-4` — system (untainted), runtime (tainted) |
| Gateway | Traefik v3 → Linode NodeBalancer `172.236.185.23` → Cloudflare |
| TLS | one Cloudflare Origin CA cert for `*.ahurasense.com`, valid to 2041 |
| Registry | Docker Distribution on R2, never publicly exposed |
| Cost | ~$116.07/mo standing, $0.00 unaccounted |
| Leaked VMs | **0** |

**Database** (`paas` schema, live in `xafjjpgazdxhktpfeuri`)

```
projects 3 · deployments 8 · aliases 6 · usage_samples 27
installations 1 · open drift 15 · pod_allocated 25 · scale_to_zero on 1
```

**Capabilities that work**

- Framework detection across 10 real repos; repo Dockerfile wins when present
- Build in a throwaway Linode, rootless BuildKit, VM destroyed after
- gVisor sandboxing — tenant pods report `Linux version 4.19.0-gvisor`
- Promote and rollback as **one** `UPDATE` of `aliases.deployment_id`
- Per-alias routing — two hostnames on one project serving two builds
- Env vars: AES-256-GCM, per-project HKDF, injected via `envFrom`
- Webhook-driven deploys (signature verified over raw bytes)
- Scale-to-zero with an activator — measured idleness, not elapsed time
- Tenant ResourceQuota + LimitRange enforced on 3 namespaces
- Image scan gate — pass / fail / **could-not-determine blocks**
- Drift detection across Linode, DNS, workloads, R2, with history
- Usage metering: warm-seconds, pod-seconds, build-minutes
- Traffic shape per hostname: organic vs keep-alive-shaped vs none, sampled on
  the same tick as pod usage so warmth and traffic describe one window

**Tests:** ~530 (deploy) + 326 (observability) + 46 (UI). Plus 11 database
behavioural tests replaying confirmed v1 criticals.

---

## 4. What is NOT done

### Blocks opening signups to untrusted tenants
- **No egress rate limiting**, no crypto-mining heuristics, no abuse response.
- **Free-plan Cloudflare**: per-tenant WAF is Enterprise-only; 1 rate-limit rule.
- ~~No reserved-hostname list~~ — **DONE** (`e70a5506`). A tenant could have
  claimed `api` or `www`: the deploy path only checked `paas.aliases`, and live
  production DNS has no aliases row. Reserved set seeded from the live zone —
  23 single-label records, none previously protected.

### Blocks a real customer
- ~~GitHub App installed on zero accounts~~ — **INSTALLED** (`156779383`, `cs2hvh`,
  1 repo, 1-hour `contents:read` tokens) and recorded. Reconciled by
  `scripts/v2/installations-sync.ts`, which treats the GitHub API as truth
  because both recording paths are lossy by nature: a webhook retries a few
  times and stops, and a browser callback fires once. Neither has a reconciler
  in it.
- **Nothing has RENDERED.** The repo typechecks and lints, but no route has
  served a request and no component has mounted. The reduced env is now in the
  UI worktree; the render attempt is the UI lane's next step.
- **Custom domains: verified, not yet certified.** Challenge-response ownership
  and proxy-aware routing are built and tested — including the case that breaks
  the naive check, where a Cloudflare-proxied domain resolves to Cloudflare
  rather than to us. **Certificates are blocked**: Cloudflare for SaaS returns
  `code 1404: No quota has been allocated for this zone`. *User action —*
  SSL/TLS → Custom Hostnames.
- **Preview deployments: policy decided, half built.** Free, 48h from last push,
  Starter-sized, always 1 instance. Hostname minting is done (`previewLabel`);
  `shouldDeploy` still refuses non-production branches, and nothing reaps at 48h.
- **Build logs are not surfaced to users.**

### Economics
- **Warm fraction measured 1.0** across three independent measurements: every app
  holds a pod all day at 2–3 millicores with zero requests. That is the ~$52k/mo
  model at 10k apps, not the ~$18–20k the plan assumes. Scale-to-zero is built and
  proven but **opt-in, default off** (1 project enabled).
- **Pricing is decided and measured.** Static per-instance, DigitalOcean shape:
  six tiers, $7–$69, margins 25–36%. See [`05-pricing.md`](05-pricing.md). Two
  corrections got it there — the kubelet reserves 24.5% of a node *before any pod
  schedules*, and the gVisor sandbox charge was 128Mi declared against 42 MiB
  measured, now cut to 64Mi, taking density from 89 to 99 pods/node.
  **Prices did not move with the second correction**; the margin sits as buffer,
  because repricing twice against one number spends confidence in the list.
- **R2 tarballs no longer accumulate.** Every build wrote a full OCI archive
  and nothing deleted it: 592 MB across 8 deployments, 65% of the bucket. The
  deploy path now deletes the tar once it has read the registry's own storage
  and confirmed BOTH the manifest blob and the repository revision link — the
  blob alone is shared across repositories, so a correct digest under the wrong
  repo reports 1 of 2 present. Applies to NEW deploys; the existing 592 MB stays
  for the reaper and a human, deliberately.
- **~360 MB of that is permanently unreclaimable** — builds that published
  nothing, so there is no durable copy to justify deleting them.
- **Warmth and traffic are measured over the same window**, so an always-warm app
  is separable into "a customer using the pod they hold" and "the platform paying
  the always-on price for nobody". Live, from one run:

  ```
  dpl-e2404975a02e   99.9% warm   ALWAYS WARM; ORGANIC
  dpl-e2215252040c   99.9% warm   ALWAYS WARM; NO-TRAFFIC; warmth NOT justified
  ```

  Identical warm fraction, identical cost, opposite answers — warm fraction alone
  cannot tell them apart, and neither can CPU.

  **What this measurement is FOR changed after it was built.** It was the input to
  the warm-time pricing decision; pricing is now flat, so that decision is closed.
  It is now an ABUSE AND MARGIN signal instead: under a flat rate the second row is
  a customer paying us the same as the first while costing us the same as the
  first, for nobody. Still worth having — it just answers a different question.

---

## 5. Next steps, in order

1. ~~**Durable scheduling**~~ — **DONE** 2026-08-26, commit `b0bf8b60`. Five
   CronJobs live in `ahura-system`, verified by running rather than by applying:
   `usage-sample` recorded 3 apps at 99.8% warm, `fleet-drift` exited clean at
   $116.07/month standing with $0.00 unaccounted. See §6.
2. ~~**`npm install`**~~ — **DONE** 2026-08-26, approved by the user. 687 packages.
   The repo compiled for the first time: **21 type errors across 26,000 lines**,
   now down to **3**, each owned by a lane actively fixing it. What it found:
   - `ProjectRow` declared neither `scale_to_zero` nor `idle_seconds` while
     `idle-sweep.ts` read both — on the path that decides whether an app sleeps.
   - All 8 admin routes imported `_lib/http`, which existed only on the UI
     branch. The admin API would have failed at build.
   - A log route shadowed its own `params`, crashing on the first request to any
     build log (UI lane, fixed).
   - Two files had unterminated string literals that
     `node --experimental-strip-types --check` **exits 0 on**. Every "parses
     clean" claim made with that command was weaker than stated.
3. ~~**Reserved hostnames**~~ — **DONE** (`e70a5506`).
4. ~~**R2 tarball accumulation**~~ — **DONE** (`60d4a61b`), fixed at the source
   rather than on a timer.
5. **Get something to RENDER.** `next build` needs real env in the UI worktree —
   **a user decision**, since it means putting a secrets file there.
6. **Install the GitHub App** on `cs2hvh` and prove one real customer push.
4. **Reserved-hostname list** before any signup path opens.
5. **Preview deployments** — needs the user's policy decision first.
6. **Egress limiting and abuse response** — needs Cloudflare plan decision.

---

## 6. Scheduling design — and why it is not one CronJob

`app-deploy-3` raised this and it changed the design. `scripts/v3/drift-sweep.ts`
imports `db` (Supabase **service role**), `edge/cloudflare`, `build/r2`,
`k8s/client`, and via `fleet-source` also `linode/client`. A pod running it would
hold **every platform credential at once** — strictly more than v1's build stage
held, and that concentration was v1's RCE.

The leaf scripts are already split, so per-script scheduling costs almost nothing:

| Script | Credentials needed | Where |
|---|---|---|
| `usage-sample` | db + k8s | in-cluster, ServiceAccount + narrow DB cred |
| `workload-drift` | db + k8s | in-cluster, same profile |
| `r2-drift` | db + r2 | in-cluster, own Secret — needs no cluster access |
| `dns-drift` | db + cloudflare + k8s | in-cluster, own Secret |
| `fleet-drift` | db + linode | in-cluster, own Secret — the only job needing **no cluster access** |

`fleet-drift`'s `db` is not visible in its direct imports; it arrives through
`telemetry/fleet-source.ts`. Shipping it without one made it refuse to run, which
was the correct outcome and is why the row now reads `db + linode`.

**INSTALLED 2026-08-26** (`b0bf8b60`) — five CronJobs in `ahura-system`, each with
its own ServiceAccount and only the one Secret it needs. No pod holds more than
one vendor credential. `drift-sweep.ts` stays a manual tool and is never
scheduled.

Source ships as a **ConfigMap into `node:24-alpine`** — no image build, since
these are zero-dependency TypeScript under `--experimental-strip-types`. The
import closure is walked (20 files, 195 KB) and the installer refuses at 90% of
the 1 MiB cap. Install with `scripts/v2/install-sweeps.ts --apply`; it dry-runs
by default and **verifies its own writes by reading them back**.

`backoffLimit` is 0: the drift scripts exit non-zero when they FIND something,
not only when they fail, so a "failed" sweep is usually one that worked. The
overloading is a known gap — exit 1 means both "found drift" and "could not
run", so a scheduler cannot alert on real errors alone. Splitting them is the
observability lane's change.

---

## 7. Open decisions — user only

Engineering is blocked on these, not the reverse.

1. **Warm-time pricing policy.** The cost model depends on the warm fraction, and
   a customer pinging their own app forces it to 1.0. Price warm-time, cap
   free-tier warm hours, or detect self-pinging? *Blocks metering + pricing.*
2. **Turn scale-to-zero on fleet-wide?** Built and proven, currently 1 project.
   *This is the single largest lever on unit economics.*
3. **Cloudflare plan tier.** Per-tenant WAF and >1 rate-limit rule are Enterprise.
   *Blocks abuse response.*
4. **Free tier — is there one?** *Blocks quota and abuse design.*
5. **Preview deployments — lifetime and who pays.** The HOSTNAME SCHEME is no
   longer open (see below); these two are, and they should be decided together:
   a preview that never expires and is free is the abuse vector.
6. **ACM ($10/mo)** — deferred. Apps currently sit at `<app>.ahurasense.com` under
   the free wildcard instead of `<app>.apps.ahurasense.com`.

---

## 7b. Preview hostnames — settled, build to this

Fixed by constraint rather than preference, so it is not open to taste:

- **One DNS label, flattened.** The zone certificate covers exactly
  `["ahurasense.com", "*.ahurasense.com"]`, and a wildcard covers ONE label
  deep. `preview.myapp.ahurasense.com` gets a **TLS error**, not a 404. It must
  be `myapp-a1b2c3d4e5f6.ahurasense.com`.
- **Charset `[a-z0-9-]`.** Deployment refs are `dpl_…` with an UNDERSCORE, which
  is illegal in a hostname label — a preview label must transform a ref, never
  embed it.
- **Length fits with room:** slug is capped at 40 by `projects_slug_shape`, the
  ref hex is 12, so `slug-hex` = 53 against the 63-char limit.
- **Must pass `checkLabel()`** from `lib/paas/hostnames.ts`.
- **The schema already models both flavours.** `paas.alias_kind` is
  `production | branch | deployment | custom` — `deployment` is the permanent
  per-build URL, `branch` the moving per-branch one. Per-alias routing is live
  and proven, so previews need rows, not new routing.

---

## 8. Traps — verified, do not re-derive

- **The repo does not tell you what is deployed.** Check the live system.
- **`ap-west` (Mumbai) has no VPC support.** Use `in-bom-2`. `in-maa` (Chennai) is
  the most capable India region.
- **`R2_BUCKET` (`ahurasense-media`) is production assets.** v2 uses
  `V2_R2_BUCKET` (`cloud-app-deploy`), resolved only in `lib/paas/config.ts:59`.
- **The Cloudflare account holding the zone is not the R2 account.** Two accounts.
- **HA control plane is irreversible** and recreates every node. The first
  production cluster must be created with it on.
- **Universal SSL covers one label deep.** `*.ahurasense.com` does not cover
  `x.apps.ahurasense.com`.
- **Never start a second dev server.** Two Next servers sharing `.next` corrupt
  each other.

### The recurring bug: empty is not the same as unknown

Three independent instances in one day, in three different costumes:

- A regex that did not match R2's `<Contents>` shape reported an **empty bucket**
  that held 907 MB.
- A Trivy gate reading an empty `Results` array reported **no vulnerabilities**
  rather than *scan did not run*.
- An idle sweep reading an empty router map would have reported **no traffic**
  rather than *could not measure*.

And its mirror on the write side — the same defect with the polarity flipped.
The three above read nothing and concluded the world was empty; this one wrote
nothing and concluded the world had changed. Both promote a null to a fact:

- `allowMissing: true` on a **write** turns every failure into a silent success.
  A quota script reported three namespaces enforced while creating zero
  ResourceQuotas.

And the sharpest instance, because the tool that detects the bug had the bug:

- The **check written to catch `allowMissing` on writes** had its regex
  backslashes eaten by a patching step — twice — leaving a pattern matching
  nothing. The check passed both times having examined **zero call sites**. Only
  a paired detector-proof caught it. The predicate now uses `indexOf` /
  `startsWith` and no regex at all.

A sixth, found while scheduling the sweeps: `fleet-drift` was shipped without a
database credential because `db` is not among its *direct* imports — it arrives
through `fleet-source.ts`. It refused to run rather than reporting every
resource as unrecorded. **The transitive closure is the credential surface, not
the import line.**

This one is the positive case, and it is the strongest argument in this section:
the refusal caught a bug in **another session's** work, in code that had already
been reviewed. The credential surface was derived carefully, from the imports,
and was still wrong. The guard did not catch carelessness — it caught a correct
method applied to the wrong artifact. Care does not substitute for a guard.

### Two ways a guard goes vacuous, and they look identical from outside

The third-state rule above covers the **input** side: a check that observes
nothing must say so rather than pass. It does **not** cover the output side.

A seventh instance proved the gap. A detector's `offenders.push()` lost its
argument to the same mangling that ate the regexes — so the scan ran correctly,
examined every call site, and then **discarded every finding**. `examined > 0`
passed, because the input side was genuinely fine. A counter placed before the
push cannot see an empty push.

| Failure | What it looks like | What catches it |
|---|---|---|
| Observes nothing | green | report `examined`, refuse at 0 |
| Observes, then discards | green | assert a **known-bad input** still produces a finding, every run |

The second is not optional decoration. It is the only thing separating "found
nothing" from "cannot report anything".

### The tools themselves lie, and that is a different problem

Two tools reported success while failing, in the same hour:

- `tsc | head` returns **HEAD's** exit code. A pipeline reports its *last*
  command, so `tsc | tee`, `tsc | grep`, `tsc | head` all report green
  regardless of `tsc`.
- `node --experimental-strip-types --check` **exits 0** on a file with nine
  syntax errors, including unterminated string literals.

- `node --test <directory>` resolves the directory as a module and reports
  **tests 1, fail 1**. It fails loudly here — but had the path resolved to
  something importable it would have reported **tests 1, pass 1**: a green suite
  that ran nothing. Use quoted globs, never a bare directory.

These are worth separating from the guard failures above. A broken guard is our
code and we can fix it. A tool that reports success while doing nothing is the
floor those guards stand on, and no amount of care in our own code detects it —
only running a known-bad input through the whole chain does.

The practical rule: **before trusting any tool's clean result, make it report a
dirty one once.** Every instance in this section was found that way, and none
was found by reading.

**The rule:** a parse that yields nothing, a read that returns nothing, and a
write whose failure is swallowed all look exactly like success. Distinguish
*could not observe* from *observed nothing*, on reads **and** writes, and make
the unobservable case refuse rather than pass. `skip` means "could not check";
`pass` means "checked and fine". Conflating them is how a suite goes green while
asserting nothing.

---

## 9. Coordination protocol

- **One lane per branch.** Do not edit files another lane owns (§2).
- **Update this file** when you finish something — do not leave it to be
  re-derived from git log.
- **Verify peer claims before acting on them.** Two stale claims were corrected
  today: `pod_allocated` was reported 0 (it is 25), and an R2 leak was doubted
  (it was real). Sessions are confidently wrong often enough that a live check is
  cheaper than a wrong turn.
- **State what is proven vs assumed.** "Proven against the live database" is not
  "proven in production".
