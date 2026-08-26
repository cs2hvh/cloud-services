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

| Lane | Session | Branch | Owns |
|---|---|---|---|
| **Deploy** | `cloud-app-v2-d8` | `feat/deploy-v2` | `lib/paas/*` (except `telemetry/`), `scripts/v2/**`, `supabase/migrations/**`, `app/api/v2/**` (except `admin/`) |
| **Observability** | `cloud-app-v2-99` (titled `app-deploy-3`) | `feat/deploy-v2-obs` | `lib/paas/telemetry/**`, `scripts/v3/**`, `app/api/v2/admin/**`, `app/dashboard/v2/admin/**` |
| **UI** | `cloud-services-2f` (titled `Master`) | `feat/deploy-v2-ui` | `app/dashboard/v2/**` (except `admin/`) |

Branch topology as of now: `obs` contains all of `deploy` +6 commits. `ui` is
+27/−1 against `deploy`. All three converge into `feat/deploy-v2` before merge to `dev`.

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
projects 3 · deployments 8 · aliases 6 · usage_samples 24
installations 0 · open drift 15 · pod_allocated 25 · scale_to_zero on 1
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
- Traffic shape per hostname: organic vs keep-alive-shaped vs none

**Tests:** ~530 (deploy) + 326 (observability) + 46 (UI). Plus 11 database
behavioural tests replaying confirmed v1 criticals.

---

## 4. What is NOT done

### Blocks opening signups to untrusted tenants
- **No egress rate limiting**, no crypto-mining heuristics, no abuse response.
- **Free-plan Cloudflare**: per-tenant WAF is Enterprise-only; 1 rate-limit rule.
- **No reserved-hostname list.** Apps live at `<app>.ahurasense.com` alongside 30
  live production records, so a tenant could claim a name that collides.

### Blocks a real customer
- **GitHub App installed on zero accounts** (`installations = 0`). Every deploy so
  far used our own signed payloads. **User action.**
- **`npm install` has never run in this repo.** The v2 dashboard and API routes
  have never been typechecked or executed. Inspected code, not working code.
- **No preview deployments** for non-production branches. Per-alias routing
  supports them; the policy — hostname scheme, lifetime, who pays — does not exist.
- **Build logs are not surfaced to users.**

### Economics
- **Warm fraction measured 1.0** across three independent measurements: every app
  holds a pod all day at 2–3 millicores with zero requests. That is the ~$52k/mo
  model at 10k apps, not the ~$18–20k the plan assumes. Scale-to-zero is built and
  proven but **opt-in, default off** (1 project enabled).
- **~360 MB of orphaned R2 tarballs are permanently unreclaimable** — builds that
  published nothing, so there is no durable copy to justify deleting them.
  "65% reclaimable" overstates what the reaper can recover.

---

## 5. Next steps, in order

1. ~~**Durable scheduling**~~ — **DONE** 2026-08-26, commit `b0bf8b60`. Five
   CronJobs live in `ahura-system`, verified by running rather than by applying:
   `usage-sample` recorded 3 apps at 99.8% warm, `fleet-drift` exited clean at
   $116.07/month standing with $0.00 unaccounted. See §6.
2. **`npm install` + get the dashboard actually executing.** The largest body of
   never-run code on the project — 16 routes and 6 components across the UI and
   admin lanes, none of which has ever rendered. **The user declined `npm install`
   previously**, so this is a decision to revisit, not an oversight to fix.
3. **Install the GitHub App** on `cs2hvh` and prove one real customer push.
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
| `fleet-drift` | linode only | in-cluster, own Secret — needs no cluster or db |

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
5. **Preview deployment policy** — hostname scheme, lifetime, who pays.
6. **ACM ($10/mo)** — deferred. Apps currently sit at `<app>.ahurasense.com` under
   the free wildcard instead of `<app>.apps.ahurasense.com`.

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
