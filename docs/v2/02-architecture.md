# Application Deploy v2 — Architecture and Plan

Status: **proposal, awaiting decisions** · Branch `feat/apps-v2` · 2026-08-26

Grounded in a 32-agent process: 6 subsystem audits of v1 against real code, 6 research
tracks each independently fact-checked by a skeptic, 2 substrate capability studies, and
3 competing architectures each scored by 3 adversarial judges.

Constraints, as set by the business:

| | |
|---|---|
| Scale target | 10,000+ apps in year one |
| Trust model | Untrusted public signups — assume hostile tenants |
| Substrate | Linode (compute), Cloudflare (edge), R2 (storage) |
| Approach | Clean rebuild, reuse selectively |
| Team | Small — operability is a first-class constraint |
| Migration burden | **None.** `platform_apps` is empty; zero apps ever shipped. |

---

## 1. The headline

**The technology is solvable. The unit economics are the real risk.**

Three architectures were designed independently and judged. All three scored ~5/10, and
the judges converged on the same three problems, not on technical disagreements:

1. Every design built 10–13 bespoke services. Standing operational load exceeded the team.
2. Every schedule was 2–3× optimistic.
3. Every cost model was wrong or absent, and **the corrected numbers do not clear the
   revenue assumption**.

That convergence is the finding. What follows takes the strongest parts of each, applies
the judges' fixes, and states the economics honestly rather than optimistically.

---

## 2. What the substrate forces

Two capability studies settled questions that were previously open. These are not
preferences — they remove options.

### Linode has no hardware virtualization. Anywhere.

Nested virtualization is disabled platform-wide (it conflicts with Live Migration —
a consistent staff position for eight years, with no beta as of Aug 2024). And Akamai
sells no bare metal: there is no `metal` class in the API type enum, and the product was
announced in 2018, shelved, and removed from the site by 2022.

**Therefore Kata Containers, Firecracker, Cloud Hypervisor and every in-cluster microVM
design are impossible on Linode compute.** Any proposal depending on them is dead on this
substrate. The sandbox must be **gVisor (runsc)**, which is a userspace kernel and needs
no `/dev/kvm`.

### LKE's pod ceiling makes a multi-cluster fleet mandatory

| | Standard LKE | LKE Enterprise |
|---|---|---|
| Max nodes | 250 | 500 |
| **Max pods per cluster** | **1,000** | **5,000** |
| Control plane | Free (HA +$60/mo) | $300/mo/cluster |
| Version lifecycle | Force-upgraded at EOL | Not force-upgraded |
| Availability | Self-serve | **Requires Akamai approval, limited regions** |

At one pod per app, 10,000 apps cannot fit in one cluster on either tier. A
cluster-placement and sharding layer is required in the control plane **from day one** —
it cannot be retrofitted.

Two further traps: the HA control plane is **irreversible and destroys all nodes when
enabled**, so every cluster must be created with it on. And LKE-E is gated on a sales
conversation, which puts procurement on the critical path.

### Cloudflare solves TLS at scale — and reverses a prior conclusion

The v1 model (one Let's Encrypt cert per app on a shared apex) caps growth at ~50 new
apps/week. Cloudflare for SaaS removes the problem entirely:

- **Platform subdomains cost zero custom hostnames.** One proxied wildcard DNS record plus
  one Advanced Certificate Manager wildcard cert ($10/mo/zone) covers every
  `<app>.apps.ahurasense.com`. This is the single biggest cost avoidance available.
- **Customer BYO domains** are custom hostnames: 100 included, then $0.10/hostname/month,
  with a **50,000 self-serve ceiling**. 10,000 fits comfortably; 100,000 would force an
  Enterprise contract.
- **DCV Delegation** — one permanent `_acme-challenge` CNAME from the customer — makes
  renewals fully automatic and is the correct pattern at this scale.

And the sovereignty story survives: **India is a supported Regional Services region, and
Cloudflare for SaaS is listed "Fully compatible" with it.** Earlier research concluded the
opposite; the fact-checker overturned it. The one real gap is Customer Metadata Boundary,
which supports only the EU and US — so log and analytics *metadata* leaves India even when
traffic does not.

Cloudflare gates worth knowing now: **WAF for SaaS (per-tenant WAF) is Enterprise-only**,
as are wildcard custom hostnames and more than 5 rate-limiting rules. At 10k untrusted
tenants, per-tenant WAF is not a luxury.

---

## 3. The architecture

> Postgres holds every app; Kubernetes holds only the warm ones. Cloudflare terminates all
> public TLS; builds run one-per-throwaway-VM and hold no cluster credentials.

### 3.1 Path of a deploy

```
git push ─> webhook (per-app HMAC) ─> Postgres: desired state row
                                            │
                    build claimed by controller, one throwaway Linode VM leased
                                            │
        VM: rootless BuildKit inside gVisor. Holds ONLY:
          · tenant source · 15-min JWT scoped to one build_id
          · GitHub App token, read-only, one repo
          · presigned R2 PUT for one key · cache prefix scoped to (team, project)
        Holds NO kubeconfig, NO registry push credential, NO route to any cluster.
                                            │
                    OCI tarball ─> R2 ─> VM destroyed
                                            │
        trusted in-cluster publisher: scan (Trivy, blocking) ─> sign ─> push to Harbor
                                            │
        Go reconciler: Postgres desired state ─> Deployment+Service, digest-pinned
                                            │
        Cloudflare for SaaS ─> NodeBalancer ─> Envoy Gateway (Gateway API v1.6.1) ─> pod
```

### 3.2 Component decisions

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| Runtime | **Plain Deployments** + KEDA + Argo Rollouts | **Not Knative.** Its ~3,300 Service/cluster ceiling ([knative/serving#13201](https://github.com/knative/serving/issues/13201)) collides with a 10k target, and it injects a queue-proxy per pod plus an activator in the request path. Two of three research tracks argued against it independently. |
| Orchestration | **LKE fleet**, K8s 1.36, 2–3 clusters | 1.36 is where user namespaces went GA, and LKE offers it today. Pod cap forces the fleet. |
| Isolation | **gVisor + `hostUsers: false`** | Kata is impossible here. Three runC escapes (Nov 2025) mean plain containers are not a boundary. |
| Build | **One throwaway Linode VM per build** | Buys the microVM property by *renting* the VM instead of nesting it. The boundary is Linode's own hypervisor — the same one separating Linode's customers. |
| Edge | **Cloudflare for SaaS** + Envoy Gateway | Removes the Let's Encrypt ceiling entirely; ingress-nginx is retired (archived read-only 2026-03-24, no further security patches). |
| Registry | **Harbor on R2** | v1 pushed every tenant into one shared Docker Hub namespace with one shared credential. |
| Control plane | **Postgres desired state + Go reconciler per cluster** | Level-triggered convergence, not imperative `kubectl`. The reconciler is the only writer to Kubernetes. |
| Secrets | **OpenBao** envelope encryption | Vault is BUSL under IBM. |

### 3.3 Vercel-class semantics

These are product requirements, not nice-to-haves, and each maps to a concrete mechanism:

- **Immutable deployments** — every build produces a digest-pinned image and a permanent
  URL. Nothing is ever rebuilt to promote.
- **Preview per branch/PR** — a deployment row plus a single-DNS-label hostname under the
  wildcard. Costs zero custom hostnames and zero certificates.
- **Promote to production** — a Service-selector patch. One object write, no rebuild.
- **Instant rollback** — repoint the selector at an earlier digest. v1's rollback depended
  on a Docker Hub tag nothing ever pruned or guaranteed; digest-pinning fixes that.

---

## 4. Unit economics — read this before the technology

This is where the design lives or dies, and where all three proposals were weakest.

**Always-on, one pod per app** (what v1's model implies):

> ⚠️ **SUPERSEDED. The numbers in this section were estimated, and measurement
> corrected them by ~19% in the expensive direction.
> [`05-pricing.md`](05-pricing.md) §2 is authoritative; this is kept for the
> reasoning, not the figures.**
>
> What was wrong, specifically: **"~65 tenant pods/node" on the 32 GB dedicated
> shape is really 42.** The kubelet's own reservation — 24.5% of a node,
> measured — was never counted, and the gVisor sandbox charge was assumed at
> 30 MB when the RuntimeClass declares 128Mi.
>
> The shape preference below is also void. "The 32 GB shape beats the 64 GB by
> ~15%/pod because RAM binds before the 110-pod cap" stops being true once the
> sandbox charge is counted: RAM binds on *every* shape, so that reasoning
> selects nothing, and the proportionally larger kubelet reservation makes the
> smaller node worse. `g6-standard-16` is cheapest per pod.
>
> The lesson, from `cloud-app-v2-e6`: **the sentences that go stale are the ones
> asserting a STATE rather than a RULE.** "65 pods/node" is a state and rotted in
> a day. "The transitive closure is the credential surface" is a rule and has
> not.

- Linode Dedicated 32GB/16vCPU (Mumbai): **$288/mo**, ~65 tenant pods/node after
  system overhead. (The 32GB shape beats the 64GB by ~15%/pod: on it RAM binds before
  kubelet's 110-pod cap.)
- 10,000 pods ÷ 65 = **154 nodes × $288 = $44,352/mo**
- All-in with system, edge, build, storage, observability: **~$52,000/mo = $5.20/app**

**Charge $5/app and you lose money on every customer.**

**With idle-to-zero**, assuming 5% continuously busy, 15% warm ~30% of the day, 80%
warm ~2%: expected concurrently warm ≈ 1,110, peak ≈ 2,220, less static-only apps
≈ **1,700 peak warm pods → 30 nodes → $8,640/mo.** All-in roughly **$18–20k/mo**, which
the judges corrected to **$2.30–$3.62/app/month** depending on the warm fraction.

### The two things that break this

1. **Keep-alive pings defeat scale-to-zero.** The entire model rests on one unmeasured
   number — the warm fraction — and a free, widely-promoted tool (UptimeRobot and friends)
   defeats it. Render uses a 15-minute idle timeout and "use UptimeRobot to keep your app
   awake" is common advice. If tenants ping their own apps, the warm fraction goes to 1.0
   and cost goes back to $52k/mo. **This needs a policy answer, not a technical one** —
   detect self-pinging, price warm-time explicitly, or cap free-tier warm hours.
2. **Cold start couples the data path to the control plane.** Waking an app requires a
   Kubernetes write. That makes 70%+ of the fleet's availability depend on the API server
   and the gateway control plane. Needs a degraded mode.

**The judges' verdict on the waker is worth quoting plainly: an unauthenticated request
that causes a pod to be scheduled is a DoS amplifier.** Waking must be authenticated,
rate-limited per hostname, and bounded by a per-tenant concurrent-wake budget.

---

## 5. What to reuse from v1

The audit found genuinely good work worth carrying over. Not everything is a rewrite:

- **`lib/services/linode/client.ts`** — retry/backoff, error categorization, capacity
  detection, pagination. Reuse as-is.
- **`billing.bill_service_cycle_atomic`** — `FOR UPDATE` + CAS on `last_billed_at` +
  balance check *before* cursor advance. A correct, concurrency-safe metering primitive.
- **Bandwidth claim/release RPCs** — atomic claim-before-charge with release on failure.
  Textbook. Reuse the pattern for all metering.
- **`lib/container-image/image-ref.ts`** — digest-pinned image refs, tolerant parsing.
  Exactly the primitive v2's immutable-deployment model needs.
- **Per-app git webhook secrets with timing-safe HMAC and multi-app secret matching.**
- **Section-allowlist build log sanitiser** — drops whole stages rather than redacting
  line by line. Allowlisting is the right shape.
- **The `platform_app_domains` partial unique index** — `UNIQUE (domain) WHERE status <>
  'removed'`. Correct shape for domain claim uniqueness.
- **Ephemeral `GIT_AUTH_URL` as a build parameter** rather than baking OAuth tokens into
  job config.
- **Public-prefix build args vs runtime Secret split** — only `NEXT_PUBLIC_*`/`VITE_*`
  become image layers; server env stays out of the image.
- **The hexagonal ports/adapters split** in `lib/domain-service/` — clean seams.

---

## 6. What must not survive

- Jenkins, and 10k lines of near-duplicate pipeline XML generated by string interpolation.
- The shared `default` namespace with zero tenant isolation.
- The shared Docker Hub namespace and its single shared credential.
- `name` as the primary key of all infrastructure addressing (K8s objects, Jenkins jobs,
  TLS secrets, hostnames) with no uniqueness constraint and no charset validation on
  update. This one bug is the root of three separate critical findings.
- Per-app Let's Encrypt certificates on a shared apex.
- DNS A records pointing at a hardcoded `KUBE_IP`. As long as customer DNS contains your
  IP, you can never move, scale, or fail over.
- The false capability claims on the dashboard (auto-scaling, global CDN, 99.99% uptime,
  multi-AZ, per-second billing). v2 must ship claims that match the implementation.

---

## 7. Delivery plan

The judges found every proposed schedule 2–3× optimistic, concentrated in the bespoke
components. These estimates already include that correction. Assume ~4 engineers.

| Phase | Weeks | Delivers | Exit criteria |
|---|---|---|---|
| **0 — Decisions & procurement** | 2–3 | LKE-E approval conversation, Cloudflare plan tier decision, pricing/warm-time policy | Substrate contracts signed; no design work blocked on a vendor |
| **1 — Foundation** | 8–10 | One LKE 1.36 cluster HA-on, Cilium, Envoy Gateway + Gateway API v1.6.1, gVisor DaemonSet, Harbor on R2, OpenBao | A hand-rolled pod runs under gVisor, reachable via Cloudflare, TLS valid |
| **2 — Build tier** | 8–10 | Throwaway-VM build controller, rootless BuildKit, R2 cache, publisher + Trivy gate + signing | A push to a real repo produces a signed, scanned, digest-pinned image with no credential in the build VM |
| **3 — Control plane** | 10–12 | Postgres schema, Go reconciler, deployment/revision/alias model, promote & rollback | Immutable deployments, preview URLs, promote-as-alias-swap, instant rollback all work end to end |
| **4 — Product surface** | 8–10 | Dashboard rebuild, env vars, domains, logs, metrics | A customer can self-serve from repo to live app without staff |
| **5 — Commercial** | 8–10 | Metering, billing integration, quotas, abuse detection, spend controls | Accurate per-app billing; a hostile tenant is detected and contained |
| **6 — Enterprise** | 10–12 | SSO/SAML, SCIM, RBAC, audit logs, log drains | An enterprise customer can be onboarded under contract |

**Honest total: 12–16 months to the full enterprise bar.** A credible, chargeable product —
phases 0–4 — lands around **8–10 months**. Anyone promising this in a quarter is
promising a different, smaller product.

### Sequencing note

Phases 1 and 2 can overlap substantially; the build tier does not depend on the runtime
being finished. Phase 5 must not be deferred past first paying customer — v1's billing
defects (apps running unbilled forever, meters outliving their apps) came from exactly
that deferral.

---

## 8. Decisions needed

These are business calls that change the engineering, and the plan is blocked on them
in the order listed:

1. **Warm-time pricing policy.** The whole cost model depends on the warm fraction, and
   customers can trivially force it to 1.0. Price warm-time explicitly, cap free-tier warm
   hours, or detect and act on self-pinging? *(Blocks the pricing model and the metering
   design.)*
2. **LKE Enterprise or standard LKE?** LKE-E is 5× the pod density, has an SLA, and is not
   force-upgraded — but costs $300/cluster/month and requires Akamai's approval. Standard
   LKE means ~10× more clusters to operate. *(Blocks fleet sizing; has procurement lead
   time, so decide first.)*
3. **Cloudflare plan tier.** Per-tenant WAF, wildcard custom hostnames and >5 rate-limit
   rules are Enterprise-only. At 10k untrusted tenants, per-tenant WAF is a real
   requirement, not a nicety. *(Blocks the abuse-response design.)*
4. **Free tier — is there one?** With untrusted public signups this is the single largest
   determinant of both abuse load and cost. *(Blocks quota and abuse design.)*
5. **India-only or global?** Regional Services works with Cloudflare for SaaS and keeps
   traffic in-country, but Customer Metadata Boundary does not cover India, so log metadata
   still leaves. *(Blocks how strongly the sovereignty claim can be marketed.)*
