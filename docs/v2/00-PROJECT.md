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
- ~~Tenant isolation unverified~~ — **MEASURED AND FIXED** 2026-08-26 (`ff559b9d`).
  `scripts/v2/isolation-proof.ts` probes from a real tenant namespace under the
  same gVisor RuntimeClass as customer workloads. It found a breach: **a tenant
  pod could open a TCP connection to the Kubernetes API server**, despite
  `10.0.0.0/8` being denied and the ClusterIP `10.128.0.1` sitting inside it.
  - **kube-proxy DNATs the ClusterIP to the real endpoint before egress policy
    is evaluated**, and on LKE that endpoint is public — so the policy saw a
    public destination and allowed it. Generalised: **an `except` list cannot
    protect an address the policy never sees.** The private-range block is real
    for direct pod-to-pod traffic (cross-tenant was refused in the same run) and
    does nothing for anything DNAT'd.
  - Severity, stated honestly: TLS did not complete from that client, and tenant
    pods carry no ServiceAccount token. Unnecessary attack surface rather than a
    live path to credentials.
  - Fixed by denying the endpoint's real address, read from the `kubernetes`
    Endpoints at reconcile time — hardcoding would be correct here and silently
    permissive on the next cluster, and the object applies cleanly either way.
  - **The controls are the design.** Public egress and DNS *must* succeed or the
    run is void: a probe pod with no network fails every negative test and
    reports perfect isolation.
- ~~No inbound rate limiting~~ — **DONE** 2026-08-26 (`148293e2`). Per-tenant,
  50 rps / 100 burst, on **every** route rather than opt-in. Traefik middleware
  via the **file provider** — there is no `--providers.kubernetescrd` here, so a
  Middleware CRD would be stored and never read.
  - **Verified by making it bite.** At the real limit, 200 parallel requests gave
    zero 429s — indistinguishable from the middleware not being attached.
    Dropping to `average=1` settled it: limited host **1×200 / 19×429**, control
    host **20×200 / 0×429**. The control is what makes the first line mean
    anything.
  - Keyed on `CF-Connecting-IP`. The socket peer is always a Cloudflare address,
    so limiting on it would put every visitor of every tenant in one bucket and
    let one busy app throttle the platform.
  - **Cloudflare plans do not solve this.** Rate limiting rules come from a
    per-zone pool and don't scale to one rule per tenant at 10,000 apps;
    per-hostname rules for custom hostnames are Enterprise. Separately: the API
    reports `ahurasense.com` on **`Free Website`, price 0, no pending change** —
    if a Pro subscription was bought, it is not on this zone.
- **Egress bandwidth is still unbounded**, and this is the actual abuse vector —
  a tenant mining, spamming or exfiltrating makes **outbound** connections that
  never pass through Cloudflare or the gateway. **No Cloudflare plan addresses
  it at any price.**
  - Kubernetes expresses this with `kubernetes.io/egress-bandwidth`, which needs
    the **bandwidth CNI plugin**. Checked: this cluster's conflist has
    `calico, host-local, portmap` — **no bandwidth plugin**, so those annotations
    would apply cleanly and shape nothing. Adding it on LKE is the open question,
    since node config is not exposed.
- **Origin is reachable directly**, bypassing both Cloudflare and the
  `CF-Connecting-IP` rate limit (such requests share one bucket). Restricting the
  origin to Cloudflare's published ranges is the complementary control.
- No crypto-mining heuristics, no abuse response.
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
- ~~Nothing has RENDERED~~ — **IT RENDERS** 2026-08-26. `next dev --turbopack`
  on :3010, Next 15.5.15. The marketing homepage serves 200 with live GPU
  pricing, `/signin` serves 200, and **all seven v2 routes compiled clean with
  zero server errors**:
  - `/dashboard/v2/admin` → **307 → `/signin?redirectTo=…`**, auth guard working.
  - All six `/api/v2/admin/*` → **404 by design** (`adminNotFound()`), so an
    unauthenticated caller cannot even learn the endpoint exists.
  - `/api/v2/webhooks/github` POST unsigned → **401**. Signature verification
    rejecting through the real HTTP stack, not only in unit tests.
  - Reached via `next dev`, which compiles per route — so the `GPU_MARKUP_PCT`
    error that blocks `next build` never compiles unless the GPU wizard is
    visited. `next build` is still blocked; the app is still runnable.
- **`ADMIN_EMAILS` is not set**, and the server says so at startup: operator
  authorization falls back to `user_profiles.roles`, *"which is weaker: it is
  data a compromised account may be able to reach, and it guards fleet cost,
  cluster ids and every tenant's name."* Must be set before production.
- **No customer-facing v2 UI exists.** One page (`/dashboard/v2/admin`), all
  operator-only. No signup, no project creation, no deploy button, no app list.
  This is the largest remaining piece.
  - **First tenant-facing API route landed** 2026-08-26 (`108bb833`):
    `GET /api/v2/projects`, RLS-scoped, the read every UI surface needs first.
    401 verified live against the running server.
  - **Everything customer-facing is unverifiable from this session.** Dashboard
    pages sit behind the auth guard and there is no way to hold a session
    without signing in, which needs a password. So UI can be *built* here but
    only its unauthenticated boundary can be *proven* — the same standard the
    admin routes were held to, and no higher. **Someone with a login should
    drive the authenticated path.**
- ~~Custom domains blocked on certificates~~ — **PROVEN END TO END** 2026-08-26
  on a real third-party domain. `app.ahurasense.ai` → **200**, its own
  certificate (`CN=app.ahurasense.ai`, Google Trust Services), serving content
  identical to the app's platform hostname.
  - Cloudflare for SaaS needed a **Fallback Origin** before any custom hostname
    could be added at all — created `fallback.ahurasense.com` (proxied) and set
    it. The `1404` quota error was gone once the feature was enabled.
  - Ownership passed via the **CNAME**, not the TXT: Cloudflare treats a CNAME
    into our zone as proof and stops asking for the ownership record.
  - **I pointed the fallback origin at the Kubernetes API server**
    (`172.236.163.171`) instead of the gateway (`172.236.185.23`) — that IP was
    fresh in context from the isolation work minutes earlier. It surfaced as
    `CN=kube-apiserver` at the origin and HTTP `526`. The record was proxied, and
    the API server requires client certificates Cloudflare was not presenting, so
    such requests reached the control plane and could not authenticate. Live for
    roughly 40 minutes. Corrected. Kept here rather than quietly fixed: it
    happened minutes after proving *tenants* could not reach that endpoint.
  - Still manual. `paas.domains` challenge-verification is the self-service
    version of what was done by hand here, and is the remaining wiring.
- **Preview deployments: routed and sized.** Free, 48h from last push,
  Starter-sized, always 1 instance. A push to a non-production branch now lands
  in its own preview environment (`environments.forBranch`, named after the raw
  branch so `feature/foo` and `feature-foo` stay distinct), and the reconciler
  forces Starter + 1 instance for any deployment whose environment is a preview.
  Sizing is forced there rather than at the webhook so it holds for every path
  that reaches a pod.
  - Wiring this surfaced a defect one layer down: the idempotency key was
    `(project, sha)`, which is correct only while every push builds production.
    A branch cut from the production head pushes a commit that is *already
    deployed*, so the old key answered "already recorded" and **the preview was
    never created** — silently, since 200 is what a successful retry looks like.
    Now keyed on `(environment, sha)`. `scripts/v2/preview-proof.ts` shows the
    two keys disagreeing against the live database.
  - Wiring the *build* path found the serious one. `deployFromRepo` pointed
    **every** alias of the project at whatever built last — right while a
    project's hostnames all served one build, a production outage once previews
    exist: **pushing any feature branch would have replaced production with that
    branch.** Latent (no preview has ever been built) but made reachable by the
    webhook change an hour earlier. `aliasesToPoint` now scopes by environment;
    six tests, all verified to fail against the old behaviour.
  - The reconciler gained its **only deletion**: routes whose alias row is gone.
    Until reaping existed it only ever *added* routes, so removing an alias left
    the hostname serving. Three gates, and **unlabelled is not orphaned** —
    proven live, an unlabelled Ingress survived a pass that removed the orphan
    beside it.
  - **PROVEN END TO END** 2026-08-26 (`6fc528ab`). One real preview built from
    `docker/welcome-to-docker@dependabot/npm_and_yarn/braces-3.0.3` — a genuine
    feature branch, and a long slashed name that exercises `previewLabel`'s
    truncation and hash:
    `welcome-to-docker-dependabot-npm-c77bde.ahurasense.com` → **200**, and
    `v2-docker.ahurasense.com` (production) → **200, unmoved**. All six
    pre-existing apps still serve.
  - Two more defaults found building it: detection probed **main** for every
    build (right code, wrong recipe), and DNS was **silently skipped** when no
    gateway address was given — `if (gatewayIp)` with no else, so the deploy
    reported success and the hostname resolved to nothing. Both fixed; see §8.
  - **`preview-reap` is scheduled** — sixth CronJob, `36 * * * *`, `db + k8s`
    read-only. **REPORTS ONLY, and there is no `--apply` by design:** it deletes
    running environments if it is ever wrong, so the licence to delete stays with
    a person who has read the plan. Verified by running in-cluster, not by
    applying: exit 0, `1 examined, 0 past TTL, 1 kept, 47.8h remaining`.
    - Installed first with `db` alone, and running it said so itself — *"cluster
      unreadable — running below is UNKNOWN, not no"*. Honest and useless: the
      urgent case (an unindexed environment with a **live pod**) cannot be told
      from a harmless empty one without looking. Found by running it, not by
      reading it.
  - **The action half is built but has never executed** —
    `scripts/v2/preview-reap-apply.ts` (`01706d43`). Manual, not a CronJob, on
    the r2-reap precedent. Refuses to act unless `checkReapPlan` reports nothing.
    Order is load-bearing: **DNS first, then the alias row** — the reverse leaves
    a record pointing at the gateway that no Ingress routes, which is a claimable
    hostname. Neither pod nor Ingress is deleted here; removing the alias makes
    the reconciler do both.
    - Dry run verified both directions: reaps nothing at 0.3h, identifies the one
      expired preview when its age is advanced past the TTL.
    - **`--apply` was blocked by the permission classifier and has NOT been run.**
      *User action —* it deletes DNS records and database rows, so it needs an
      explicit go-ahead. Until then, an expired preview is reported and not
      removed.
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

### Three ways a guard goes vacuous, and they look identical from outside

The third-state rule above covers the **input** side: a check that observes
nothing must say so rather than pass. It does **not** cover the output side.

A seventh instance proved the gap. A detector's `offenders.push()` lost its
argument to the same mangling that ate the regexes — so the scan ran correctly,
examined every call site, and then **discarded every finding**. `examined > 0`
passed, because the input side was genuinely fine. A counter placed before the
push cannot see an empty push.

A later instance proved a third mode, and it is the worst of them because the
guard is *working correctly* at every point you would think to look.

`sandbox-overhead.ts` had two halves. The **ceiling** said the declared sandbox
charge was larger than any pod's whole footprint — costs density, recoverable
whenever. **Headroom** said whether pods were near what was set aside for them —
ends in the kernel OOM-killing whichever pod allocates next, possibly a
different tenant's. The script returned clean as soon as the ceiling half
passed, skipping headroom entirely.

That was harmless for as long as the declaration was generous. Then `podFixed`
was cut 128Mi → 64Mi **on the strength of that monitor** — and 64Mi is inside
the pods' own footprints, so the ceiling check now passes by construction. The
early exit fired every time. The one check standing between the smaller
reservation and an OOM went silent at exactly the moment it started mattering.

| Failure | What it looks like | What catches it |
|---|---|---|
| Observes nothing | green | report `examined`, refuse at 0 |
| Observes, then discards | green | assert a **known-bad input** still produces a finding, every run |
| Observes, until the change retires it | green | ask whether the guard's precondition survives the thing it guards |

The third defeats both earlier defences. `examined` is honestly non-zero. A
known-bad input still produces a finding — on the half that still runs. The
early exit happens *after* a genuine, successful, correct examination, and it is
conditional on state that **the guarded change itself creates**.

**The property to look for: does this guard's precondition survive the change it
exists to watch?** The ceiling half was only ever meaningful while the
declaration was generous, so cutting the declaration retired the check. A guard
whose relevance is inversely coupled to the risk it guards is not a guard.

Two rules fall out, and the second is the operational one:

- **A check with more than one half must not let either half's silence stand for
  the whole.** They fail in different directions; state that, and make clean
  mean *both* are clean.
- **After making the change a monitor licensed, run the monitor again and
  confirm it still says something.** A safety check that goes quiet once the
  risky change is made is worse than no check, because its silence reads as
  reassurance — and unlike the other two failures, nobody is looking any more.

### A default that fits the only case that exists is a landmine for the next one

Sibling of the guard modes above — same family (a thing that is correct until
the world grows a second case) with a different trigger. The guard modes are
about **checks going quiet**; this is about **defaults going wrong**.

Three instances, all found on the same day, all in code that was correct when
written:

| Defaulted | Correct while | Broke when |
|---|---|---|
| idempotency key `(project, sha)` | every push built production | a branch cut from the production head pushed an already-deployed commit — **the preview was never created**, and 200 to GitHub looks like a successful retry |
| `toPoint = [...existing]` — point every alias | a project's hostnames all served one build | a preview build repointed **production** at itself: pushing any feature branch replaces the live site |
| `inspectRepo` probes main | there was one branch worth building | a preview got the right **code** and main's **recipe** — framework, port, Dockerfile |

The tell is the same each time: a value that is not passed in, derived from the
only case that existed. **`deployFromRepo` deriving the environment from the
deployment row rather than accepting an option is the fix shape** — an option
would have needed a default, and the default would have been `production`,
which is precisely the bug.

Two rules:

1. When adding a second case to something that has only ever had one, **list
   every place the old case is assumed rather than asked for.** Grep for the
   constant, not for the feature.
2. **A latent defect goes live as a side effect of an unrelated correct change.**
   The webhook change that started recording preview deployments was right, small
   and well tested, and it armed a production outage three files away. Nothing
   about the arming change looks dangerous, which is what makes this class hard.

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

- **`script | grep ...; echo $?` reports GREP's status, not the script's.** Same
  mechanism as `tsc | head`, and worth its own line because it bit again in the
  obvious disguise: filtering noise out of a script's output. Three "exit=0"
  readings on `preview-proof.ts` were reported here and meant nothing — the
  script's own exits were never observed. **Run the command unpiped and read
  `$?` before quoting any exit code.**

- **`process.exit()` can abort with pending stdout.** On Windows, a script that
  prints a long report and then calls `process.exit(N)` can die under a libuv
  assertion — the report prints correctly and the shell sees **127**. Found on
  two v3 scripts, intermittently, after one had already been reported as
  passing. Use `process.exitCode` and return; wrap the body in `main()` if a
  top-level return would be needed (it is a syntax error in a module).

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
