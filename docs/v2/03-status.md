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

- **48 unit tests**, zero dependencies (`node --test lib/paas/build/*.test.ts`)
- **10 real public repositories** exercised through detection
- **11 database behavioural tests** replaying confirmed v1 criticals

---

## What is NOT done

Stated plainly, because a half-built platform that reads as finished is worse
than one that reads as unfinished.

### Blocking untrusted tenants — read this before opening signups

- **gVisor is NOT installed.** `cluster-status.ts` reports 0 RuntimeClasses.
  Tenant pods run as ordinary containers today. Given three runC container-escape
  CVEs in November 2025, **this cluster must not run untrusted code as it
  stands.** The manifests already accept `runtimeClassName`; the sandbox itself
  is not deployed. Installing it on LKE needs a privileged DaemonSet that writes
  `runsc` onto each host and restarts containerd — invasive enough that it should
  be done deliberately, not unattended.
- **No image scanning.** The publisher is the correct seam for a blocking Trivy
  gate. It is not implemented, so today it pushes whatever it is given.
- **No ResourceQuota or LimitRange** per tenant namespace, so one tenant can
  exhaust a node.
- **No abuse detection**, no egress rate limiting, no crypto-mining heuristics.

### Blocking a real customer

- **Aliases are not database-driven.** Routing works, but `publish-app.ts` is
  invoked by hand. Nothing reads the `aliases` table to create Ingress objects,
  and promote/rollback are not yet wired to it — the schema supports both as a
  single write, but no code performs it.
- **No webhook-driven deploys.** The GitHub App is built and verified and
  webhook signature verification exists, but nothing is wired to a push event.
- **No dashboard.** No API routes, no UI. Everything runs from `scripts/v2/`.
- **No environment variables.** The schema stores them encrypted; nothing reads,
  decrypts or injects them yet.
- **No preview deployments**, no build logs surfaced to users, no metrics.

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

**The missing piece is the sandbox.** Until gVisor is installed, containment
rests on the container boundary alone, which is not sufficient for hostile code.

---

## Next, in order

1. **gVisor RuntimeClass** — required before any untrusted workload. Needs a
   privileged installer DaemonSet; do it deliberately.
2. **Alias-driven routing** — read the `aliases` table, create Ingress objects,
   and make promote/rollback the single write the schema already supports.
3. **Webhook → deploy** — the GitHub App is ready; wire push events.
4. **Trivy gate in the publisher** — the seam exists, the check does not.
5. **ResourceQuota + LimitRange** per tenant namespace.
6. **Env vars** — decrypt and inject as a Secret via `envFrom`.
7. **Control plane API + dashboard.**
