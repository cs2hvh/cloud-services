# Deploy v2 — build status

Last updated 2026-08-26 · branch `feat/deploy-v2` · repo `C:\cloud-app-v2`

## What works, proven on real infrastructure

Three real public repositories go from a git URL to a live, publicly reachable
HTTPS URL with no manual step in between:

| Repository | Detected | Live at |
|---|---|---|
| `heroku/node-js-getting-started` | express (node) | **https://v2-express.ahurasense.com** |
| `Azure-Samples/python-docs-hello-world` | flask (python) | **https://v2-flask.ahurasense.com** |
| `docker/welcome-to-docker` | own Dockerfile (React → nginx) | **https://v2-docker.ahurasense.com** |

All three return HTTP 200 over public HTTPS with a valid certificate.

The path each takes:

```
git URL → detect framework → generate Dockerfile
        → lease a throwaway Linode → rootless BuildKit
        → OCI tarball → R2 (presigned PUT)
        → VM destroyed
        → skopeo publishes into the in-cluster registry
        → Deployment + Service + NetworkPolicy + Ingress
        → Traefik → Linode NodeBalancer → Cloudflare
        → public HTTPS URL returning 200
```

### Live infrastructure

| | |
|---|---|
| LKE cluster | `647920` `ahura-v2-dev`, Kubernetes **v1.36.3**, `in-bom-2` (Mumbai 2) |
| Nodes | 2 × `g6-standard-4` — `system` (untainted), `runtime` (tainted NoSchedule) |
| Registry | Docker Distribution backed by R2, platform namespace, never publicly exposed |
| Gateway | Traefik v3 behind Linode NodeBalancer `172.236.185.23` |
| TLS | ONE Cloudflare Origin CA certificate for `*.ahurasense.com`, valid to 2041 |
| Cost | ~$96/mo cluster + ~$10/mo NodeBalancer; build VMs ~$0.002 each, destroyed after |
| Leaked VMs | **0** — verified: only the 2 LKE nodes are visible to the token |

### Test coverage

- **~530 unit tests**, zero dependencies (`node --test --experimental-strip-types
  --env-file=.env --env-file=.env.local "lib/paas/**/*.test.ts"`) — roughly 290
  in the deploy lane and 240 in the observability lane
- **10 real public repositories** exercised through detection
- **11 database behavioural tests** replaying confirmed v1 criticals
- **Live-enum mirror tests** that SKIP rather than pass when the database is
  unreachable — skip means "could not check", pass means "checked and fine", and
  conflating them is how a suite goes green while asserting nothing

**Not covered:** the ~29 dashboard files in `app/dashboard/v2` and `app/api/v2`.
`npm install` has never been run in this repo, so they have never been
typechecked, linted, or executed. They are inspected code, not working code.

---

## What is NOT done

Stated plainly, because a half-built platform that reads as finished is worse
than one that reads as unfinished.

### Blocking untrusted tenants — read this before opening signups

- **gVisor IS installed** and proven — a tenant pod reports
  `Linux version 4.19.0-gvisor`. Pinned to release `20260817`. This section
  previously said the opposite for some time after it stopped being true.
- **No image scanning.** The publisher is the correct seam for a blocking Trivy
  gate. It is not implemented, so today it pushes whatever it is given.
- **No ResourceQuota or LimitRange** per tenant namespace, so one tenant can
  exhaust a node.
- **No abuse detection**, no egress rate limiting, no crypto-mining heuristics.

### Blocking a real customer

- **Aliases ARE database-driven.** All five live hostnames carry `paas.aliases`
  rows; the reconciler creates an Ingress per alias and promote/rollback are one
  `UPDATE` of `aliases.deployment_id`. Each alias routes to its own deployment,
  verified with two hostnames on one project serving two different builds.
- **Webhook-driven deploys work.** `POST /api/v2/webhooks/github` verifies the
  signature over raw bytes and records a queued deployment;
  `scripts/v2/build-worker.ts` builds it. Proven end to end — a signed push built
  commit `88e10137` exactly and served it publicly.
  **But the GitHub App is installed on no account,** so no real push has ever
  reached the endpoint. Proven against the live database is not proven in
  production.
- **Dashboard and API routes exist** (`app/dashboard/v2`, `app/api/v2`) — see the
  testing caveat above: none of it has ever been executed.
- **Environment variables work** — AES-256-GCM, decrypted and injected via
  `envFrom`, with no code path that returns a placeholder when it cannot decrypt.
- **metrics-server is installed** and serving per-pod CPU and memory.
- **Still missing:** preview deployments for non-production branches (per-alias
  routing supports them; policy for hostname, lifetime and payer does not
  exist), and build logs surfaced to users.

### The most expensive thing not done

- **Scale to zero is not implemented, and warm fraction is measured at 1.0.**
  Every app is warm 100% of the time, so the fleet is paying the always-on cost
  model — roughly $52k/month at 10k apps against a $5 price, rather than the
  $18–20k the plan assumes. The three live apps sit at 2–3 millicores each: they
  are not merely idle-ish, they are doing essentially nothing while holding full
  pods. This is the difference between two cost models, not an optimisation.

### Deferred by decision

- **Advanced Certificate Manager** ($10/mo) — not purchased, so app hostnames
  live at `<app>.ahurasense.com` under the existing free wildcard. Moving to
  `<app>.apps.ahurasense.com` later is a config change plus an alias migration.
- **Cloudflare for SaaS** is not activated on the zone (API code 1404). Platform
  subdomains are unaffected; it is required before customer BYO domains work.
- **HA control plane** is off on this dev cluster. Enabling it is irreversible
  and recreates every node, so the first production cluster must be created with
  it on.
- **No wildcard DNS record.** The zone carries 30 live production records; a
  wildcard would catch every unlisted subdomain. Each app gets an explicit
  record, and `publish-app.ts` refuses to overwrite one pointing elsewhere.

---

## Things the live system taught us

Each was found by running against real infrastructure, not by reasoning about
it, and each is fixed rather than worked around.

1. **`crane` cannot read what BuildKit writes.** `--output type=oci` produces an
   OCI-layout archive; `crane push` reads only docker-archive and fails with
   "manifest.json not found in tar". The publisher uses `skopeo`, which reads
   `oci-archive:` natively.

2. **The kubelet cannot resolve Service DNS.** containerd resolves image
   hostnames with the *node's* resolver, which cannot see `*.svc.cluster.local`,
   and defaults to HTTPS. Push and pull addresses are therefore deliberately
   different: the publisher pushes to the Service name, while a DaemonSet binds
   `127.0.0.1:5000` on every node and forwards to it — containerd treats
   localhost as insecure by default, and LKE does not allow editing node config.

3. **Kubernetes rejects named users under `runAsNonRoot`**: *"image has
   non-numeric user (node), cannot verify user is non-root"*. Every generated
   Dockerfile now emits a numeric UID and the pod spec asserts the same value.
   The test asserts the *shape* — numeric, non-zero — so it cannot regress.

4. **The last `EXPOSE` is the one that matters.** `welcome-to-docker` builds with
   node and serves with nginx; taking the first `EXPOSE` would have picked the
   build stage's port and produced a pod whose readiness probe could never pass.

5. **A healthy gateway can 404 everything.** Traefik's ClusterRole lacked
   `nodes`. A forbidden informer never syncs, which silently stops it processing
   any Ingress. Nothing in its behaviour said so — only its logs did.

6. **Cloudflare's error codes are precise diagnostics.** 526 proved the zone is
   Full (Strict) and rejected the self-signed origin. 525 proved Linode's cloud
   controller was treating port 443 as HTTPS and expecting a certificate on the
   NodeBalancer. Both were fixed at the right layer instead of by weakening the
   zone-wide SSL mode, which would have affected production.

7. **An Ingress with no TLS block produces a router with no TLS.** `:443`
   connected and then 404'd while `:80` served correctly. Each Ingress now
   carries `tls: [{}]` — an *empty* entry meaning "use the default certificate
   store". Naming a secret would require copying the platform's wildcard private
   key into every tenant namespace, one container escape away from a tenant.

8. **A crashed script leaks real money.** During credential verification a
   `curl` succeeded while the parsing step crashed, leaving a Linode running.
   The reaper keys on the Linode tag rather than database state precisely so an
   orphan is destroyed even when the control plane has no record of it.

---

## Security posture as built

What a build VM holds: one tenant's source, one 1-hour single-repo
`contents:read` installation token, three presigned R2 URLs each valid for one
object key.

What it does **not** hold — every one of which was present in v1:

- a kubeconfig (v1 exported `KUBECONFIG` at pipeline scope into the same stage
  that executed customer repository contents — cluster-wide RCE from an ordinary
  user account)
- registry push credentials (v1 wrote Docker Hub creds into
  `~/.docker/config.json`, giving any build write access to every other app's
  image repository)
- any route to the cluster
- any other tenant's cache

Tenant pods run with `automountServiceAccountToken: false`, all capabilities
dropped, `allowPrivilegeEscalation: false`, a numeric non-root UID, and a
default-deny NetworkPolicy whose egress rule explicitly excludes RFC1918 ranges
and `169.254.0.0/16` — closing the cloud metadata endpoint v1's SSRF could reach.

The platform's TLS private key lives only in the platform namespace. Origin IPs
are never exposed: DNS is proxied through Cloudflare, unlike v1's explicitly
unproxied records pointing at a hardcoded node IP.

**gVisor is now installed and proven** — a tenant pod reports
`Linux version 4.19.0-gvisor`. Containment no longer rests on the container
boundary alone.

---

## Shipped since that list was written

1. **gVisor RuntimeClass** — installed, pinned to release `20260817`, verified
   from inside a running tenant pod.
2. **Alias-driven routing** — promote and rollback are one `UPDATE` of
   `aliases.deployment_id`, and each alias now routes to ITS OWN deployment via
   a Service per targeted deployment. Verified live with two hostnames on one
   project serving two different builds simultaneously.
3. **Webhook → deploy** — `POST /api/v2/webhooks/github` verifies the signature
   over raw bytes, resolves the project, and records a queued deployment;
   `scripts/v2/build-worker.ts` builds it. Proven end to end: a signed push
   built the exact recorded commit and served it publicly.
4. **Env vars** — encrypted with AES-256-GCM and injected via `envFrom`,
   decrypt-or-throw with no placeholder path.
5. **metrics-server** — pinned, with the LKE kubelet TLS flag, and verified by
   readings rather than by pod readiness.
6. **Placement accounting** — `pod_allocated` and `pod_capacity` derived from
   the cluster each sweep rather than counted.

## Next, in order

1. **Scale to zero.** The one item that decides whether the business works.
   Warm fraction is measured at 1.0 and the three live apps sit at 2–3
   millicores each — the fleet is paying the always-on cost model (~$52k/mo at
   10k apps against a $5 price) for apps doing nothing. Everything else on this
   list is a feature; this is the difference between two cost models.
2. **Trivy gate in the publisher** — the seam exists, the check does not.
3. **ResourceQuota + LimitRange** per tenant namespace. Nothing currently bounds
   what one tenant can request.
4. **Preview deployments for non-production branches.** Per-alias routing now
   supports them; what is missing is policy — hostname, lifetime, and who pays.
5. **Build concurrency with a budget cap.** The worker is deliberately
   sequential: a queue that fans out is a queue that can spend without bound.
6. **R2 image.tar reaping.** 782 MB and growing with every deploy, because each
   build writes a tar nothing deletes.

## Known gaps, stated plainly

- **`npm install` has not been run**, so the ~29 dashboard files in Master's
  lane have never been typechecked, linted, or executed. They are inspected
  code, not working code, and should be described that way.
- **The GitHub App is installed on no accounts**, so no real push has ever
  reached the webhook. The path is proven with genuine signatures against the
  live database, which is not the same as proven in production.
- **Six historical deployments carry a `0000000` git sha** and always will —
  the immutability trigger correctly refuses to rewrite recorded provenance.
  Any UI showing a sha must treat both null and all-zero as absent, permanently.
