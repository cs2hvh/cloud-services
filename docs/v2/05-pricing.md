# Sizing and pricing model

**Decided 2026-08-26.** Static (flat-rate) pricing, DigitalOcean App Platform shape:
the customer picks an **instance size** and an **instance count**. No usage metering.

---

## 1. What this replaces

The architecture plan assumed warm-time metering, and the open question was how to
price time an app spends awake. **That question is now closed and does not need
answering**: under flat pricing the customer pays the same whether the app sleeps or
not.

Two consequences, and the second is the one that sets the prices:

- **Scale-to-zero becomes pure margin.** It is no longer a customer-facing meter, so
  the "keep-alive pinger defeats it" problem stops being a revenue threat and becomes
  a thinner margin on one customer.
- **Therefore every price must cover its tier's ALWAYS-AWAKE cost.** A customer can
  keep an app warm with a free uptime pinger. If the price only works when the app
  sleeps, that customer is unprofitable and it takes no skill to become one.

---

## 2. Our real cost floor

From the Linode API on 2026-08-26, not from the plan's estimates.

| Shape | vCPU | RAM | $/mo | Transfer |
|---|---|---|---|---|
| `g6-standard-8` | 8 | 32 GB | **$192** | 16 TB |
| `g6-standard-16` | 16 | 64 GB | **$384** | 20 TB |
| `g6-dedicated-16` | 16 | 32 GB | **$288** | 7 TB |
| `g6-dedicated-32` | 32 | 64 GB | **$576** | 8 TB |

**Shared beats dedicated on both axes that matter here.** 32 GB of shared is $192
against $288 dedicated — 33% cheaper — and carries **16 TB of transfer against 7 TB**.
Since a PaaS absorbs tenant egress, the transfer bundle is not a footnote; it is the
second-largest cost after RAM.

The architecture plan costed everything against `g6-dedicated-16` at $288 and derived
$4.43/pod. That shape is the wrong default: it buys guaranteed CPU that shared-tier
customers were never promised. **The live cluster already runs `g6-standard-4`**, so
the plan's figure described a machine we do not use.

**Pod density**, all three inputs now measured against the live cluster rather than
estimated: the kubelet's own reservation (**24.5% of a node**, before any pod
schedules), system pods (**0.81 GiB**, not the 4 GB first assumed), and the gVisor
sandbox charge (**64Mi**, measured under load — see §4).

| Pod RAM | On `g6-standard-16` (55.8 GiB usable) | $/pod/mo |
|---|---|---|
| 512 MB | 99 | **$3.88** |
| 1 GB | 52 | **$7.38** |
| 2 GB | 27 | **$14.22** |
| 4 GB | 13 | **$29.54** |

Memory binds on every row — the kubelet's 110-pod cap never does. Verify with
`scripts/v3/density-check.ts`, which reads the overhead from the live RuntimeClass
rather than from this document, so it can disagree with these numbers instead of
agreeing with them by construction.

Add ~15% for platform overhead — system nodes, NodeBalancer, registry, R2,
observability — amortised across the fleet. That loading is generous at 10,000 apps
and roughly right at 1,000.

---

## 3. The tiers

Prices in USD. INR at ₹88/$ (2026-08-26); round to a clean number rather than
converting exactly, and revisit if the rate moves more than ~5%.

### Shared CPU — the default

CPU is burstable and oversubscribed, which is what every competitor means by "shared"
and what the overwhelming majority of apps actually need.

| Tier | RAM | vCPU | Bundled transfer | Our cost | **Price** | ₹ | Margin |
|---|---|---|---|---|---|---|---|
| **Starter** | 512 MB | 1 shared | 200 GB | $4.46 | **$7** | ₹649 | 36% |
| **Basic** | 1 GB | 1 shared | 300 GB | $8.49 | **$12** | ₹1,099 | 29% |
| **Standard** | 2 GB | 2 shared | 500 GB | $16.36 | **$23** | ₹2,099 | 29% |
| **Plus** | 4 GB | 2 shared | 750 GB | $33.97 | **$45** | ₹3,999 | 25% |

**These prices are the second version.** The first was built on densities I
derived rather than measured, and it was wrong in the expensive direction —
**Basic sold below cost at −0.1%, Starter cleared 0.8%.** Two compounding
errors, both caught by measuring against the live cluster:

- **The kubelet reserves before any pod schedules.** 1.90 GiB of a 7.76 GiB node
  — 24.5% — measured on both live nodes. The old table's "4 GB for system
  overhead" described system *pods* (really 0.81 GiB) and omitted the
  reservation entirely.
- **The sandbox charge was 128Mi, not the 30 MB assumed** — and it is what the
  *scheduler bills*, regardless of what the sentry actually uses.
  `01-discovery.md:974` warned in as many words that this figure had no primary
  source and had to be measured before entering a pricing model. It entered
  unmeasured anyway. It has since been measured and cut to **64Mi** (§4).

Density went from a claimed 110 pods/node to **89** at 128Mi, and **99** now that
the sandbox charge is measured. The error was largest at the smallest tier because
a fixed per-pod charge is proportionally biggest on the smallest pod.

**Prices did not move with the second correction.** Costs fell, margins rose, and
the prices above are unchanged — repricing twice against the same underlying
number is how confidence in a price list gets spent. The extra margin sits as
buffer until `podFixed` has held for a while under real load.

### Dedicated CPU — for workloads that need guaranteed cycles

On `g6-dedicated-16`, where **CPU binds before RAM**: 15 usable vCPU after system
overhead, so a 1-vCPU tier fits 15 per node regardless of how little memory it asks for.

| Tier | RAM | vCPU | Bundled transfer | Our cost | **Price** | ₹ | Margin |
|---|---|---|---|---|---|---|---|
| **Pro** | 2 GB | 1 dedicated | 500 GB | $24.53 | **$35** | ₹3,199 | 30% |
| **Pro Plus** | 4 GB | 2 dedicated | 1 TB | $50.95 | **$69** | ₹6,199 | 26% |

Recomputed on the same measured overheads, and the host shape changed with them:
**`g6-dedicated-32` beats `g6-dedicated-16`** at $25.48 vs $27.60 per Pro pod.
Note also that memory binds before CPU on both — 26 pods by RAM against 15 by
vCPU — so a "dedicated vCPU" tier is in practice sold out of memory, and adding
vCPU to these tiers is nearly free while adding RAM is not.

### How instance count is priced

**Linear. The Nth instance costs the same as the first.** No volume discount at this
stage — the underlying cost genuinely is linear, and a discount that is not earned by a
cost saving is a margin giveaway dressed as generosity.

Bundled transfer is **per app, not per instance**: scaling to 3 instances for
availability should not triple the bandwidth bill of an app serving the same traffic.

Minimum 1, maximum 10 instances per app initially. The cap exists because placement
reads `pod_allocated` against the LKE pod ceiling, and one customer should not be able
to consume a cluster's headroom from a dropdown.

---

## 4. Against the competition

| | Us | DigitalOcean App Platform | Render |
|---|---|---|---|
| 512 MB shared | **$7** | **$5** (50 GB transfer) | $7 (Starter, 0.5 CPU) |
| 1 GB shared | **$12** | $10–12 (100–150 GB) | — |
| 2 GB | **$23** shared | $25 (200 GB) | $25 (Standard, 1 CPU) |
| 4 GB | **$45** shared | $50 (2 vCPU, 250 GB) | $85 (Pro, 2 CPU) |
| Bandwidth overage | **$0.01/GB** | $0.02/GiB | metered per workspace plan |
| Workspace fee | **none** | none | **$25/mo** on Pro |

**We no longer match DigitalOcean at entry, and that is worth stating plainly
rather than burying.** At 512 MB they are $5 and we are $7. We match Render there,
and we still undercut both from 2 GB upward — with 2–4× the bundled transfer at
every tier, and no workspace fee where Render charges $25 before any compute.

The entry gap is where gVisor costs the most. The sandbox charge is fixed per pod,
so it is proportionally largest on the smallest one — and DigitalOcean's shared
tier is not sandboxed the way ours is. We are charging $2 more for an isolation
boundary their $5 tier does not have. Whether that is a feature to sell or a gap to
close is a positioning decision.

Margins are now **25–36%**, against 12–24% claimed before the densities were
measured — and the earlier figures were not merely optimistic, two of them were
negative or near zero in reality.

### The sandbox charge, now measured

`podFixed` was **128Mi and declared, not measured**. It is what the scheduler bills
per pod regardless of what the sentry consumes, so it set the density every price
here derives from — a pricing input wearing the clothes of a capacity setting.

`scripts/v2/sandbox-loadtest.ts` measured it: the same workload run twice, once
under gVisor and once under runc, **both read externally through cAdvisor** so the
two numbers share a frame of reference.

```
gvisor  peak 269.3 MiB   runc  peak 227.0 MiB   ->  42.3 MiB
gvisor  med  253.1 MiB   runc  med  207.8 MiB   ->  45.3 MiB
```

Cut to **64Mi** — that peak plus 50%. Density at 512 MB went 89 → 99 pods.

The headroom is not decoration. **Under-declaring produces no warning of any
kind:** the scheduler accepts more pods than the node can hold, and the kernel
OOM-kills whichever allocates next — possibly a different tenant than the one that
caused it. Silent, delayed, and it lands on the wrong person.

What makes the cut reversible is that something now watches for it.
`scripts/v3/sandbox-overhead.ts` tracks whole-pod usage against whole reservation
on real tenant workloads, continuously. If pods start running hot, that reports it
before a node does. **Raise `podFixed` back if it climbs** — do not wait for an
OOM to make the argument.

---

## 5. Free tier

**Static sites only. No free container.**

DigitalOcean's free tier is 3 static sites with 1 GiB transfer, and Render's free
container tier is the one competitors' abuse reports centre on. A free always-on
container on a platform with untrusted public signups is a crypto-mining subsidy: our
cheapest container costs us $4.01/month to run whether or not it does anything useful.

A static site costs us near zero — it is an object in R2 behind the existing gateway,
with no pod, no gVisor sentry, and no share of a node. It gives new users a real first
deploy without funding a mining fleet.

**Limits:** 3 static sites per account, 10 GB transfer each, no custom domain on free
(a custom domain consumes a Cloudflare custom-hostname slot, which has a real cost and
a 50,000-per-account ceiling).

---

## 6. What is included, and what is not

**Included at every tier:** automatic TLS, unlimited custom domains on paid tiers,
build minutes, preview deployments *(subject to the lifetime policy, still open)*,
build and runtime logs, and the bundled transfer above.

**Charged separately:** transfer beyond the bundle at $0.01/GB.

**Deliberately not offered yet:** autoscaling. DigitalOcean restricts it to dedicated
instances; we have no autoscaling at all, and advertising it before it exists is the
v1 mistake — that dashboard claimed auto-scaling, a global CDN and 99.99% uptime, none
of which were real.

---

## 7. Previews — decided

**Free, short-lived, and smaller than production.**

| | |
|---|---|
| Price | **Free.** Not billed, not counted against the app's tier. |
| Lifetime | **48 hours** from last push, then reaped |
| Size | **Starter resources** (512 MB / 1 shared vCPU), whatever the app's tier is |
| Instances | Always **1**, regardless of the app's instance count |

The three levers are chosen together because free-and-unbounded is the abuse
vector, and each one alone is not enough:

- **Free** is what makes the feature worth having. A preview nobody opens because
  it costs money is a feature nobody uses.
- **48 hours** bounds the accumulation. A busy repo produces previews continuously;
  without an expiry they are a fleet that only grows. Reaped on a timer, not on
  branch deletion — a branch nobody deletes would otherwise pin a container forever.
- **Starter-sized, single instance** bounds the cost of each one. A preview exists
  to be looked at, not to serve load, so it does not inherit a Plus tier's 4 GB.
  This is what stops "free preview" meaning "free 4 GB container": the most
  expensive thing a preview can cost us is **$4.01/month prorated over 48 hours —
  about $0.27** — and it stops mattering entirely once idle-to-zero is on, because
  a preview nobody opens holds no pod at all.

**Not yet decided:** a per-app concurrency cap. 48 hours bounds the *age* of a
preview but not how many exist at once, and a script pushing branches in a loop is
the obvious abuse. Worth adding a cap when abuse response is built, rather than
guessing a number now.

---

## 8. Open

- **INR as the billing currency**, rather than a display conversion of USD. Matters
  for the India-first positioning and for payment rails.
- **Preview concurrency cap** — see above.
