# AhuraSense Cloud — Investment & Financing Memorandum

**India's AI-native sovereign cloud — owned GPU infrastructure for inference, fine-tuning, and managed AI serving.**

| | |
|---|---|
| **Entity** | AhuraSense Cloud (AhuraCloud) |
| **Document** | Investment & debt-financing brief (equity investors + lending institutions) |
| **Date** | June 2026 |
| **Stage** | Production platform live; scaling from rented GPU capacity to owned B300/H200 clusters |
| **Raise** | ~₹44.5 Cr (~US$5.3M) — blended debt (asset-backed) + equity |
| **Use** | Procure & colocate NVIDIA B300 + H200 GPU clusters; 12-month operating runway |

> **Disclaimer.** All hardware costs, FX (₹84/US$), pricing, utilisation, and projections in this memo are *indicative planning figures* prepared for discussion. Final numbers are subject to vendor quotations, financing terms, and signed customer commitments. Forward-looking statements are estimates, not guarantees.

---

## 1. Executive Summary

AhuraSense Cloud is an **India-headquartered, AI-native cloud platform**. We have already built and shipped a full-stack, production cloud — serverless AI inference, model fine-tuning and managed deployment, AI agents with RAG and vector search, on-demand and reserved GPUs, plus the surrounding compute, Kubernetes, managed databases, object storage, and app-hosting services — all behind one control plane with **per-token** (inference) and **per-hour** (GPU/compute) billing that is **live in production today**.

The platform currently runs on **rented third-party GPU capacity** at thin resale margins. This raise converts that into an **owned-asset infrastructure business**: we procure **NVIDIA B300 (~US$2.6M) and H200 (~US$1.4M) clusters** — ~80 GPUs, **~US$4.0M of hardware** — and **colocate** them in India. Owning the silicon lets us capture the **full infrastructure margin** instead of a reseller spread, price below the hyperscalers, and offer **Indian data residency** under the DPDP Act.

**Why it works financially:** at a conservative ~65% blended utilisation the clusters generate **~US$1.8M/yr** in GPU rental revenue (rising with value-added AI services) against **~US$0.7M/yr** of all-in operating cost, for a **~60%+ gross/EBITDA margin** and a **~3–3.5 year payback** — de-risked by **reserved (pre-committed) cluster contracts** that lock in baseline cash flow to comfortably service debt.

| Headline | Figure |
|---|---|
| Hardware CapEx (B300 + H200) | **US$4.0M** (₹33.6 Cr) |
| Total project CapEx (incl. networking, storage, fit-out, spares) | **US$4.5M** (₹37.8 Cr) |
| Total raise (CapEx + 12-mo runway) | **US$5.3M** (₹44.5 Cr) |
| Mature annual revenue (rental, ~65% util) | **~US$1.8M** (₹15.1 Cr) |
| Mature annual revenue (incl. AI value-add) | **~US$2.1–2.2M** (₹17.6–18.5 Cr) |
| All-in annual OpEx | **~US$0.70M** (₹5.9 Cr) |
| Mature EBITDA margin | **~60–64%** |
| Simple payback (rental only / with value-add) | **~3.5 yr / ~2.5–3 yr** |

---

## 2. The Problem

Indian AI builders — startups, enterprises, research labs, GovTech — are **structurally underserved** on AI compute:

1. **GPU scarcity & cost.** Latest-generation GPUs (H200, B200, B300) are hard to access in India and expensive on the global hyperscalers, which price in US dollars and often gate the newest silicon behind enterprise contracts and waitlists.
2. **Forex & billing friction.** Paying foreign clouds means USD invoicing, card/forex overheads, TDS/withholding complexity, and unpredictable INR cost.
3. **Data residency & compliance.** India's **DPDP Act, 2023** and sector regulators (RBI, SEBI, health, public sector) increasingly require data — including the data used to train and run models — to **stay in India**. Most frontier AI compute sits offshore.
4. **Latency & sovereignty.** Round-tripping inference to US/EU regions adds latency for Indian end-users and creates dependence on foreign infrastructure for a strategic national capability.
5. **Infrastructure complexity.** Teams that just want to *ship an AI product* are forced to assemble GPUs, Kubernetes, vector databases, model-serving, storage, and billing themselves. There is **no India-first, fully-managed AI stack** that hides the infrastructure.

**The gap:** affordable, locally-hosted, compliant, fully-managed AI infrastructure — priced in INR, billed by the token or the hour, with the newest GPUs — built for the people actually building on AI in India.

---

## 3. Why Now

- **The AI demand curve is vertical.** Generative AI moved from experiment to production across Indian enterprises and the startup ecosystem in 2024–2026. Inference (not training) is now the dominant, recurring workload — and inference runs *continuously*, which is exactly what an owned GPU fleet monetises.
- **National tailwind.** The **IndiaAI Mission (~₹10,372 Cr)** is explicitly funding AI compute, a national GPU pool, sovereign models, and the application ecosystem. Government and PSU demand for **India-hosted** AI compute is emerging as a procurement requirement, not a preference.
- **Regulatory tailwind.** DPDP Act + sectoral data-localisation make **"hosted in India"** a hard buying criterion for BFSI, healthcare, and public sector — a moat foreign hyperscalers cannot easily match for sovereign workloads.
- **Hardware window.** Blackwell-class **B200/B300** and **H200** deliver a step-change in inference throughput per rupee. Securing this generation now — ahead of broad Indian availability — is a **first-mover supply advantage**.
- **We are already live.** The platform, billing, and multi-service control plane are **built and in production**. This is not a "build the product" raise; it is a **"buy the asset that the product already monetises"** raise — dramatically lower execution risk.

---

## 4. Market Opportunity

| Layer | Opportunity |
|---|---|
| **India AI market** | Among the fastest-growing globally; multi-billion-dollar trajectory this decade, with AI infrastructure & cloud the foundational spend layer. |
| **India cloud market** | Tens of billions of USD and double-digit CAGR; sovereign/AI-specific cloud is the highest-growth sub-segment. |
| **India GPU/AI-compute** | Acute supply-demand imbalance; national mission actively subsidising capacity — a rare market where demand visibly exceeds domestic supply. |
| **Global AI infra (TAM)** | Hundreds of billions of USD; "neocloud" GPU specialists (CoreWeave, Lambda, Crusoe) have shown the model works and commands premium valuations. |

**Our wedge:** we are not chasing the global hyperscaler war. We are the **India-first, full-stack AI cloud** — combining a neocloud GPU fleet *with* a fully-managed AI application stack (inference, fine-tuning, agents, vector DB) and conventional cloud primitives, priced in INR with data kept in India. We capture demand the global players price out or cannot localise, and demand the domestic raw-GPU players cannot fully serve because they lack the managed software layer.

---

## 5. Product Offering — Built for AI (Live Today)

The differentiator is that the **software is already shipped**. The GPUs simply move it onto owned, higher-margin infrastructure.

**Core AI services**
- **Serverless inference** — call open and frontier models by API, billed **per token**. The top-of-funnel that pulls developers in.
- **Fine-tuning** — train custom models on customer data, run on our GPUs.
- **Managed serving (dedicated)** — **per-customer dedicated GPU pods** for production model serving, billed per hour, with auto-stop on idle. This is a primary monetisation surface for the owned fleet.
- **AI agents + RAG + vector search** — build retrieval-augmented agents with an integrated vector database and knowledge bases.

**GPU infrastructure**
- **On-demand GPUs** — per-hour, per-second-granular billing (**live in production**).
- **Reserved clusters** — monthly/annual committed capacity at a discount; the contracted-revenue backbone.

**Surrounding cloud (one platform, one bill)**
- Virtual machines / VPS, managed Kubernetes, managed databases, object storage, app hosting, domains, DDoS protection.

**Platform pillars:** enterprise-grade multi-tenancy and security from day zero, full observability, **no infrastructure exposed to the customer**, transparent metered billing, and a clean dashboard — all already engineered into the live system.

---

## 6. Infrastructure Plan — The Assets We Are Procuring

### 6.1 Hardware

| Asset | Approx. GPUs | Configuration | CapEx (US$) | CapEx (₹, @84) |
|---|---|---|---|---|
| **NVIDIA B300** cluster | ~40 | ~5 × 8-GPU HGX nodes, NVLink/NVSwitch | **$2.60M** | ₹21.84 Cr |
| **NVIDIA H200** cluster | ~40 | ~5 × 8-GPU HGX nodes | **$1.40M** | ₹11.76 Cr |
| Networking (InfiniBand spine), NVMe storage, fit-out, initial spares | — | non-blocking IB fabric, fast shared storage | **$0.50M** | ₹4.20 Cr |
| **Total project CapEx** | **~80** | | **$4.50M** | **₹37.80 Cr** |

*(B200 remains part of our broader lineup and is expandable in later tranches; this raise procures the B300 + H200 clusters specified above.)*

### 6.2 Colocation & operating footprint (India)

We **colocate** in a Tier-III+ Indian data centre rather than build — faster, lower upfront cost, and instant compliance/uptime SLAs. Indicative annual operating costs:

| OpEx line | ₹ / year | US$ / year | Basis |
|---|---|---|---|
| **Electricity & cooling** | ₹1.00 Cr | $119k | ~80–110 kW IT load × PUE ~1.4, ₹8–10/kWh |
| **Rack rental / space** | ₹0.15 Cr | $18k | high-density GPU racks |
| **Network — transit, IP, cross-connect** | ₹0.50 Cr | $60k | redundant high-bandwidth uplinks |
| Maintenance, spares, warranty (~4–5% of CapEx) | ₹1.60 Cr | $190k | GPU/node servicing, RMA buffer |
| Software, control plane, monitoring, bandwidth | ₹0.42 Cr | $50k | platform run-cost (already built) |
| Team (lean infra + platform ops) | ₹1.70 Cr | $202k | see §13 |
| Insurance, compliance, contingency | ₹0.50 Cr | $60k | asset insurance, audits |
| **Total OpEx** | **₹5.87 Cr** | **~$699k** | |

**Colocation core (power + racks + network) ≈ ₹1.65 Cr/yr (~US$196k)** — the figures specified, validated against an 80-GPU power envelope.

---

## 7. Target Customers

| Segment | Need | What they buy |
|---|---|---|
| **AI-native startups** | Affordable GPUs + managed inference/fine-tuning without a DevOps team | On-demand GPUs, serverless inference, fine-tuning, agents |
| **Enterprises (BFSI, health, retail, manufacturing)** | India-hosted, compliant AI; private model serving | Reserved clusters, managed dedicated serving, VPC-style isolation |
| **Government / PSU / research / academia** | Sovereign, in-country AI compute | Reserved clusters, capacity contracts |
| **Digital agencies / SaaS / ISVs** | Embed AI features; predictable INR billing | Inference APIs, vector DB, app hosting |
| **GPU power-users (media, simulation, bio)** | Raw H200/B300 horsepower | On-demand + reserved GPU |

**Land-and-expand:** developers land via low-friction, pay-per-token inference → graduate to fine-tuning → commit to **reserved dedicated GPU capacity** for production. The free/cheap inference funnel feeds the high-margin owned-GPU business.

---

## 8. Business & Revenue Model

Four stacked, complementary streams:

1. **Reserved GPU clusters (committed)** — monthly/annual contracts at a discount to on-demand. *Predictable, contracted cash flow that underwrites debt service.*
2. **On-demand GPUs (per-hour / per-second)** — premium, elastic, higher unit price. **Live today.** *Captures spot demand and burst workloads at the best margin.*
3. **Managed AI services** — fine-tuning jobs, managed dedicated model serving, vector DB, agents. *Software margin layered on the same owned silicon.*
4. **Serverless inference (per-token)** — top-of-funnel acquisition + usage revenue that grows the base feeding 1–3.

**Margin thesis:** today we resell rented GPU at a thin spread. Owning B300/H200 collapses our cost of goods to **power + colo + amortised hardware**, converting a reseller margin into a **60%+ infrastructure margin** — and every managed-service rupee rides on top of that owned cost base.

---

## 9. Pricing Fundamentals

Indicative INR-friendly pricing, benchmarked below global hyperscaler list prices while protecting margin:

| GPU | On-demand (US$/hr) | Reserved – annual commit (US$/hr) |
|---|---|---|
| **B300** | $5.99 | $4.25 |
| **B200** | $4.99 | $3.49 |
| **H200** | $3.49 | $2.55 |

- **Per-second granularity** on on-demand — customers pay only for what they use (already implemented).
- **Reserved discount ~25–35%** in exchange for a 1–3 year commitment — the trade we *want*, because it converts capacity into contracted revenue.
- **Inference** billed per-token as a usage funnel; **fine-tuning** per GPU-hour of training; **managed serving** per-hour of dedicated pod uptime with idle auto-stop so customers aren't billed for idle and we recycle capacity.

**Reserved cluster example (revenue lock-in):** one 8-GPU B300 node on annual commit at $4.25/hr → **$4.25 × 8 × 730 hr ≈ US$24,800/month (~₹20.8 L/mo, ~US$298k/yr)** of *contracted* revenue per node, independent of utilisation swings.

---

## 10. Unit Economics & TCO

**Blended realised price** (assuming ~60% of revenue from reserved commitments + ~40% on-demand):

- B300 blended ≈ **$4.95/GPU-hr**  · H200 blended ≈ **$2.93/GPU-hr**

**Revenue per GPU per year (at 65% utilisation):**

| GPU | $/GPU-hr (blended) | × 8,760 hr × 65% | Revenue / GPU-yr |
|---|---|---|---|
| B300 | $4.95 | | **~$28,200** |
| H200 | $2.93 | | **~$16,700** |

**Fleet revenue at 65% utilisation:** 40×$28.2k + 40×$16.7k = **~US$1.80M/yr** (rental only).

**Total Cost of Ownership (3-year view):**

| TCO component | 3-yr total (US$) |
|---|---|
| Hardware + setup CapEx (one-time) | $4.50M |
| Operating cost (3 × ~$0.70M) | ~$2.10M |
| **3-yr TCO** | **~$6.60M** |
| **3-yr revenue (ramped, rental only — see §11)** | **~$4.75M** |
| **3-yr revenue (incl. value-add upside)** | **~$5.7M** |

Hardware is depreciated over a **4–5 year useful life**; reserved contracts and residual/secondary-market value de-risk the tail. Beyond Year 3 the asset is largely paid down and throws off high-margin cash.

---

## 11. Financial Projections

**Revenue ramp (GPU rental, conservative; value-add shown separately as upside):**

| Year | Avg utilisation | GPU rental revenue | + AI value-add (~+20%) | Total |
|---|---|---|---|---|
| **Y1** | 40% | $1.10M | $0.15M | **$1.25M** |
| **Y2** | 60% | $1.66M | $0.30M | **$1.96M** |
| **Y3** | 72% | $1.99M | $0.40M | **$2.39M** |

*(Fleet at 100% utilisation ≈ US$2.76M/yr rental; ramp reflects realistic sales build-out.)*

**P&L summary (rental revenue basis — value-add is upside):**

| | Y1 | Y2 | Y3 |
|---|---|---|---|
| Revenue (rental) | $1.10M | $1.66M | $1.99M |
| Operating cost | $0.66M | $0.70M | $0.72M |
| **EBITDA** | **$0.44M** | **$0.96M** | **$1.27M** |
| EBITDA margin | 40% | 58% | 64% |

**Payback & returns**
- Cumulative EBITDA (rental only): Y1–Y4 ≈ $0.44M + $0.96M + $1.27M + ~$1.45M = **~$4.1M → payback ~3.5 yrs** against $4.5M CapEx.
- **With AI value-add layer, payback compresses to ~2.5–3 years.**
- Post-payback, the fleet operates at 60%+ EBITDA margin on a depreciating but still-productive asset, plus reserved-contract renewals.

---

## 12. Funding Requirement & Structure

**Total raise: ~₹44.5 Cr (~US$5.3M).**

| Use of funds | ₹ | US$ |
|---|---|---|
| GPU hardware (B300 + H200) | ₹33.6 Cr | $4.0M |
| Networking, storage, fit-out, spares | ₹4.2 Cr | $0.5M |
| 12-month operating runway + working capital | ₹6.7 Cr | $0.8M |
| **Total** | **₹44.5 Cr** | **$5.3M** |

**Proposed structure (designed to be bankable):**

| Tranche | Amount | Source | Security / rationale |
|---|---|---|---|
| **Asset-backed term loan** | ~₹20 Cr (~60% of hardware) | Lending institution | GPUs/servers as collateral; conservative ~60% LTV |
| **Equity** | ~₹24.5 Cr | Investors | Funds setup, runway, working capital, growth |

**Debt-service coverage (illustrative):** a ₹20 Cr term loan (≈12% p.a., 5-yr, with a ~9-month principal moratorium during ramp) implies annual debt service of **~₹5.4–6 Cr (~US$0.64–0.70M)**.

| | Y2 | Y3 |
|---|---|---|
| EBITDA | $0.96M | $1.27M |
| Debt service | ~$0.64M | ~$0.64M |
| **DSCR** | **~1.5×** | **~2.0×** |

Year-1 ramp is covered by the equity runway and by reserved pre-commitments; **DSCR clears comfortably above 1.5× from Year 2**. Reserved cluster contracts provide a contracted-revenue floor that the lender can underwrite directly. Leverage can be tuned (LTV / tenor / moratorium) to the lender's comfort.

---

## 13. Competition & Moat

| Competitor class | Examples | Our edge |
|---|---|---|
| **Global hyperscalers** | AWS, Azure, GCP | INR pricing, India data residency, newest GPUs without enterprise gating, simpler & cheaper, India-first support |
| **Global GPU neoclouds** | CoreWeave, Lambda, Crusoe | Local presence + sovereignty + a *managed AI stack* (not just raw GPU) + integrated conventional cloud |
| **Indian GPU/AI clouds** | E2E, Yotta, Tata, Jio, NeevCloud, Shakti | Full-stack **software** layer already built (inference, fine-tuning, agents, vector DB, per-token billing), white-glove brandless experience, developer-led funnel |

**Moats:** (1) a **shipped, production software platform** competitors would need years to replicate; (2) **owned GPU economics** enabling aggressive yet profitable pricing; (3) **India data-residency + sovereignty** compliance; (4) **reserved-contract revenue** that compounds and locks in customers; (5) **land-and-expand** funnel from cheap inference to high-margin dedicated capacity.

---

## 14. Go-to-Market & Marketing Strategy

- **Developer-led (PLG).** Free/low-cost per-token inference + generous trials → self-serve sign-up → organic expansion into GPUs and managed services. The platform's clean dashboard and instant provisioning are the product-led growth engine.
- **Enterprise & sovereign direct sales.** Named-account motion for BFSI, healthcare, public sector and PSUs where **data residency + reserved capacity** are decisive; respond to government/IndiaAI compute tenders.
- **Startup & ecosystem programs.** Credits and partnerships with accelerators, VCs, and university labs to seed the next generation of AI builders on AhuraSense.
- **Channel & SI partners.** Resell through system integrators and digital agencies serving Indian enterprises.
- **Content & community.** Technical content, model benchmarks, and India-AI thought leadership to own the "India's AI cloud" narrative.

**Revenue de-risking:** anchor utilisation with **reserved cluster pre-commitments** (enterprise/PSU) before/alongside hardware delivery, so the fleet ships with a contracted baseline.

---

## 15. Traction & Pipeline

- **Production platform, live.** Full multi-service cloud is built and operating: serverless inference, fine-tuning, managed dedicated serving, AI agents/RAG/vector DB, on-demand GPUs, plus VMs, Kubernetes, managed databases, object storage, app hosting, domains, DDoS.
- **Billing live.** Per-token (inference) and **per-hour/per-second (GPU & compute) metered billing is implemented and in production** — the monetisation rails for the owned fleet already exist.
- **Operating today on rented GPU capacity** — proving demand and product, with margins capped by resale economics. This raise removes that cap.
- **Pipeline focus:** converting current usage and inbound interest into **reserved cluster commitments** (startups + enterprise + sovereign) to anchor Year-1 utilisation.

*(Specific revenue/logo metrics to be shared under NDA in the data room.)*

---

## 16. Team

A lean team combining **full-stack platform engineering** (the live product is evidence of execution) with **infrastructure/data-centre operations** and **enterprise/India go-to-market**. Core roles:

- **Founder / CEO** — product & platform (built the live system), fundraising, strategy.
- **Infrastructure & DevOps lead** — GPU fleet, colocation, networking, reliability.
- **AI/ML engineering** — inference, fine-tuning, serving, vector/RAG.
- **Sales & partnerships** — enterprise, sovereign, channel.
- **Finance & operations** — billing, compliance (DPDP), vendor & lender relations.

*(Detailed bios and org plan in the data room; part of this raise funds key infra-ops and GTM hires.)*

---

## 17. Risks & Mitigation

| Risk | Mitigation |
|---|---|
| **Utilisation shortfall** | Reserved pre-commitments provide a contracted floor; on-demand + inference funnel fills the rest; pricing levers. |
| **Technology obsolescence** | 4–5 yr depreciation matched to financing; reserved contracts recover cost early; staged tranches keep us on the upgrade curve; residual/secondary value. |
| **Power / data-centre reliability** | Tier-III+ colocation with SLAs; redundant power & network; insurance. |
| **FX volatility** | Hardware is a one-time USD CapEx; revenue substantially INR; debt in INR. |
| **Competition / price pressure** | Owned-GPU cost base enables price leadership; software stack + sovereignty differentiate beyond price. |
| **Demand / macro** | India AI demand exceeds domestic supply; national mission tailwind; diversified customer segments. |
| **Debt service in ramp year** | Equity runway + moratorium + reserved contracts; conservative ~60% LTV keeps DSCR >1.5× from Y2. |

---

## 18. The Ask

We are raising **~₹44.5 Cr (~US$5.3M)** — a blend of **asset-backed debt (~₹20 Cr against the GPUs)** and **equity (~₹24.5 Cr)** — to procure and colocate **NVIDIA B300 + H200 clusters** and run them on a **platform that is already built, live, and billing.**

This is a rare combination for an infrastructure raise: **the product risk is retired** (the software ships today), the **asset is collateralisable** (lender-friendly), the **margins are structural** (owned silicon, 60%+ EBITDA), and the **tailwinds are national** (IndiaAI, DPDP data residency, vertical AI demand). Capital buys the one thing standing between AhuraSense and a high-margin, sovereign, India-first AI cloud: **the GPUs.**

---

## Appendix — Key Assumptions

| Assumption | Value |
|---|---|
| FX | ₹84 / US$1 |
| Fleet | ~80 GPUs (~40 B300 + ~40 H200), ~10 × 8-GPU HGX nodes |
| Hours/GPU/year | 8,760 |
| Reserved : on-demand revenue mix | ~60 : 40 |
| Mature utilisation | ~65–72% |
| Hardware useful life / depreciation | 4–5 years |
| Power envelope | ~80–110 kW IT load, PUE ~1.4, ₹8–10/kWh |
| Loan (illustrative) | ~₹20 Cr, ~12% p.a., 5-yr, ~9-mo principal moratorium, ~60% LTV |

**Glossary:** *CapEx* capital expenditure · *OpEx* operating expenditure · *EBITDA* earnings before interest, tax, depreciation, amortisation · *TCO* total cost of ownership · *DSCR* debt-service coverage ratio · *LTV* loan-to-value · *PLG* product-led growth · *PUE* power usage effectiveness · *DPDP* Digital Personal Data Protection Act, 2023 · *RAG* retrieval-augmented generation.

---

*Prepared for prospective investors and lending institutions. Figures indicative and subject to final quotations, financing terms, and signed commitments. Confidential.*
