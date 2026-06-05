# AhuraSense Cloud — Platform & Services Overview

**One India-hosted cloud for AI and everything around it — from a single API call to a full production deployment.**

| | |
|---|---|
| **Entity** | AhuraSense Cloud (AhuraCloud) |
| **Document** | Platform capabilities, service catalog & real-world applications |
| **Audience** | Lending institutions, investors, enterprise & government stakeholders |
| **Date** | June 2026 |
| **Status** | Live in production |

> **Companion document:** the *Investment & Financing Memorandum* covers the business case, GPU procurement, and financials. **This document explains what we have built, what each service does, and what it is used for.**

---

## 1. What AhuraSense Cloud Is

AhuraSense Cloud is a **full-stack, AI-native cloud platform built and operated in India.** A customer signs up once and, from a single dashboard and a single bill, can:

- **Call AI models** by API (pay per token),
- **Train and deploy their own models** on our GPUs,
- **Build AI assistants** that answer from their own documents,
- **Run servers, containers, databases, and storage,**
- **Host and ship complete applications,**
- and secure all of it with networking, domains, and DDoS protection —

**without ever touching, configuring, or even seeing the underlying infrastructure.** The complexity (GPUs, clusters, networking, scaling, billing meters) is hidden; the customer sees clean services that "just work," priced transparently in usage terms.

**Three things make it different:**
1. **AI-first and complete** — most clouds give you raw compute and leave the AI stack to you; we ship the entire AI workflow *and* the surrounding cloud.
2. **India-hosted & sovereign** — data stays in India, satisfying DPDP-Act and sector data-residency requirements.
3. **Fully managed, usage-billed** — per-token, per-hour, and per-second metering; customers pay only for what they consume.

---

## 2. How the Platform Fits Together (Plain-Language Architecture)

Think of the platform in four layers:

```
  ┌─────────────────────────────────────────────────────────────┐
  │  CUSTOMER EXPERIENCE   Dashboard · APIs · single bill          │
  ├─────────────────────────────────────────────────────────────┤
  │  AI SERVICES           Inference · Fine-tuning · Managed       │
  │                        Serving · AI Agents · Vector/RAG        │
  ├─────────────────────────────────────────────────────────────┤
  │  CLOUD SERVICES        GPUs · VMs · Kubernetes · Databases ·   │
  │                        Object Storage · App Hosting · Network  │
  ├─────────────────────────────────────────────────────────────┤
  │  OWNED INFRASTRUCTURE  GPU clusters (B300/H200) · servers ·    │
  │  (India data centre)   storage · network — colocated in India │
  └─────────────────────────────────────────────────────────────┘
```

The **owned GPU and server infrastructure** (the asset this financing procures) sits at the bottom. The **cloud and AI services** are the software we have already built on top. The customer only ever interacts with the **top layer** — services and a bill.

**Platform pillars (engineered in from day one):**
- **Enterprise-grade security & multi-tenancy** — strong isolation between customers.
- **Full observability & metered billing** — every unit of usage measured and charged transparently.
- **No infrastructure exposed to the customer** — a clean, branded experience.
- **India data residency** — compliance as a built-in property, not an add-on.

---

## 3. Service Catalog

### 3.1 AI & Machine-Learning Services *(the strategic core)*

#### Serverless Inference — *"AI by the API call"*
- **What it is:** call leading open-source and frontier AI models over a simple API. No servers to manage; we run the models.
- **Capabilities:** text/chat generation, embeddings, a catalog of ready models, and **bring-your-own-key** options for teams with existing model access.
- **Used for:** chatbots, copilots, summarisation, content generation, classification, semantic search, data extraction.
- **Billing:** **per token** (pay for exactly what you generate/process). This is the low-friction entry point that brings developers onto the platform.

#### Fine-Tuning — *"Make the model yours"*
- **What it is:** train a base model on a customer's own data to specialise it for their domain, tone, or task.
- **Used for:** domain-specific assistants (legal, medical, financial), brand-voice content, improved accuracy on proprietary data, smaller/cheaper models that match big-model quality on a narrow task.
- **Billing:** per GPU-hour of training — **runs on our owned GPUs.**

#### Managed Serving (Dedicated) — *"Your model in production"*
- **What it is:** deploy a model (fine-tuned or chosen) onto **dedicated GPU capacity** reserved for that single customer, served behind a stable endpoint.
- **Capabilities:** predictable performance, isolation, auto-stop on idle so customers aren't billed for idle time (and capacity is recycled).
- **Used for:** production AI features that need guaranteed latency, throughput, and data isolation.
- **Billing:** **per hour** of dedicated serving — a primary monetisation surface for the owned GPU fleet.

#### AI Agents + Knowledge Bases (RAG) — *"AI that knows your business"*
- **What it is:** build AI assistants that **retrieve answers from the customer's own documents** (retrieval-augmented generation), with managed knowledge bases and an integrated vector database.
- **Used for:** internal helpdesks, customer-support bots, document Q&A, research assistants, policy/compliance lookup, onboarding assistants.
- **Billing:** usage-based (inference + vector storage/queries).

#### Vector Database / RAG Store — *"Memory for AI"*
- **What it is:** store and search the numerical representations ("embeddings") that let AI find semantically relevant information.
- **Used for:** semantic search, recommendation, deduplication, and the retrieval layer behind every RAG/agent application.
- **Billing:** by storage and query usage.

### 3.2 Compute & GPU

#### GPU Instances — *"Raw AI horsepower, on tap"*
- **What it is:** direct access to high-end GPUs (**H200, B200, B300** and more), on-demand or reserved.
- **Capabilities:** **per-second on-demand billing** (already live), **reserved clusters** at a discount for committed capacity, company-built GPU OS images preloaded for AI work.
- **Used for:** model training, large-scale inference, fine-tuning, scientific/HPC workloads, rendering, simulation.
- **Billing:** **per second/hour** (on-demand) or **monthly/annual** (reserved).

#### Virtual Machines / VPS — *"Servers in seconds"*
- **What it is:** virtual servers in multiple regions with a choice of operating systems, sizes, and dedicated cores on request.
- **Capabilities:** fast provisioning, power controls, console access, **custom and bring-your-own OS images**, snapshots, multi-region (e.g. Singapore, Mumbai, Frankfurt).
- **Used for:** web/app backends, databases, dev/test, general-purpose hosting, jump hosts.
- **Billing:** **per second/hour**, metered, with usage-based lifecycle management.

#### Bare-Metal *(for the most demanding workloads)*
- Dedicated physical servers where full isolation and maximum performance are required.

### 3.3 Containers & Orchestration

#### Managed Kubernetes — *"Run containers without running the cluster"*
- **What it is:** managed Kubernetes clusters; we handle the control plane, scaling, and operations.
- **Used for:** microservices, scalable web platforms, CI/CD targets, ML pipelines, any container-native workload.
- **Billing:** by cluster/node resources.

### 3.4 Data Services

#### Managed Databases — *"Databases that run themselves"*
- **What it is:** managed relational and document databases (PostgreSQL, MySQL, MongoDB) with provisioning, networking, and maintenance handled for the customer.
- **Capabilities:** trusted-IP access controls, sizing/scaling, optional **pgvector** to turn a Postgres database into an AI-ready vector store.
- **Used for:** application data, analytics, transactional systems, and AI retrieval (via pgvector).
- **Billing:** by instance size.

#### Object Storage — *"S3-compatible storage for everything"*
- **What it is:** scalable, S3-compatible bucket storage for files of any size.
- **Used for:** backups, media, datasets, model artifacts, static assets, data lakes feeding AI training.
- **Billing:** by storage and bandwidth used.

### 3.5 Application Platform

#### App Hosting — *"Git push to live app"*
- **What it is:** deploy applications straight from a Git repository; we build, run, scale, and serve them.
- **Capabilities:** automatic builds & deploys, runtime and build logs, **custom domains**, bandwidth management, rollbacks, deployment history, health monitoring.
- **Used for:** web apps, APIs, internal tools, AI-powered product front-ends — the fastest path from code to a running product.
- **Billing:** by runtime resources and bandwidth.

### 3.6 Networking & Security

#### Domains
- **What it is:** register and manage domain names directly in the platform.
- **Used for:** giving apps and services a professional web address, all in one place.

#### DDoS Protection / Network Security
- **What it is:** protect applications and endpoints from denial-of-service attacks and malicious traffic.
- **Used for:** keeping customer-facing services online and secure under attack.

---

## 4. Real-World Applications & Use Cases

### 4.1 By industry

| Industry | What they build on AhuraSense |
|---|---|
| **AI startups** | Ship products on serverless inference; fine-tune custom models; graduate to reserved GPUs for production — all without a DevOps team. |
| **Banking & financial services (BFSI)** | India-hosted document assistants, fraud/risk models, customer-support copilots, KYC/document extraction — with data kept in-country for RBI/DPDP compliance. |
| **Healthcare & life sciences** | Clinical document Q&A, medical-coding assistants, research summarisation, imaging/simulation on GPUs — with patient data residency. |
| **E-commerce & retail** | Product search & recommendations (vector DB), AI shopping assistants, catalogue generation, demand models, plus the web/app hosting and databases behind the storefront. |
| **Media, gaming & creative** | Content generation, GPU rendering and simulation, real-time AI features, scalable app hosting. |
| **Government, PSU & research** | Sovereign AI compute for citizen services, language models, and research — hosted in India, contracted as reserved capacity. |
| **Education & academia** | Tutoring assistants, research compute, student/lab access to GPUs and AI APIs. |
| **SaaS & ISVs** | Embed AI features into existing products via API; host the whole SaaS (app + database + storage + domain) on one platform. |

### 4.2 By workload (what the services actually do)

- **Build a customer-support assistant** → AI Agents + Knowledge Bases (RAG) + Vector DB + Inference.
- **Add "ask-our-docs" search to a product** → Embeddings (Inference) + Vector DB.
- **Specialise a model for your domain** → Fine-Tuning (GPU) → Managed Serving.
- **Run a production AI feature with guaranteed performance** → Managed Dedicated Serving on reserved GPUs.
- **Train a large model / run HPC** → On-demand or reserved GPU clusters.
- **Launch a web product end-to-end** → App Hosting + Managed Database + Object Storage + Domain + DDoS.
- **Migrate enterprise workloads to India** → VMs / Kubernetes + Databases + Storage, data-resident.

### 4.3 End-to-end solution blueprints

**A. AI customer-support bot for a bank**
Knowledge Bases ingest the bank's policy documents → Vector DB stores embeddings → an AI Agent answers customer/employee questions via Inference → deployed as a web widget on App Hosting → all **hosted in India** for compliance.

**B. A startup's custom AI product**
Prototype on per-token Inference → Fine-Tune a model on their data → serve it on Managed Dedicated GPU → front-end and API on App Hosting, data in a Managed Database and Object Storage → scale by committing to a Reserved GPU cluster as usage grows.

**C. An enterprise's private AI platform**
Reserved B300/H200 cluster for isolation → internal models served via Managed Serving → connected to enterprise data in Managed Databases + Vector DB → orchestrated with Kubernetes → secured with network protection — a sovereign, in-house AI capability without building a data centre.

---

## 5. Security, Compliance & Data Residency

- **Data stays in India** — addressing DPDP-Act and sector data-localisation (BFSI, healthcare, public sector).
- **Enterprise-grade multi-tenancy & isolation** — customers' data and workloads are separated and protected.
- **Dedicated options** — reserved clusters and dedicated serving for customers needing hard isolation.
- **Transparent, metered billing** — every unit of usage measured and auditable.
- **Operational security & observability** — monitoring and controls across the platform.

This combination — **sovereign hosting + a complete managed AI stack** — is precisely what global hyperscalers cannot easily offer Indian customers and what domestic raw-GPU providers lack the software to deliver.

---

## 6. How Customers Pay (Billing Model)

| Service | Billing |
|---|---|
| Serverless Inference | **Per token** |
| GPU (on-demand) | **Per second / hour** *(live)* |
| GPU (reserved clusters) | **Monthly / annual commitment** (discounted) |
| Fine-tuning | Per GPU-hour |
| Managed Serving | Per hour of dedicated uptime (idle auto-stop) |
| VMs / Compute | Per second / hour |
| Kubernetes | Per cluster/node resources |
| Databases | Per instance size |
| Object Storage | Per storage + bandwidth |
| App Hosting | Per runtime + bandwidth |
| Vector DB | Per storage + queries |
| Domains | Per registration |

Pay-as-you-go usage funds the platform's flexibility; **reserved commitments** provide the contracted, predictable revenue that underwrites the GPU investment (see the Financing Memorandum).

---

## 7. Why This Matters

AhuraSense Cloud turns a strategic national need — **affordable, compliant, India-hosted AI compute** — into a single, polished product that a developer can start using in minutes and an enterprise or government can adopt with confidence.

Because the **entire software platform is already built and live**, this financing does not fund a science project. It funds the **one missing ingredient — owned GPU clusters** — that converts a working platform running on rented capacity into a **high-margin, sovereign, India-first AI cloud** serving the full range of customers and applications described above.

---

## Appendix — Service Summary at a Glance

| Category | Service | One-line purpose |
|---|---|---|
| **AI** | Serverless Inference | Call AI models by API, per token |
| **AI** | Fine-Tuning | Train custom models on your data |
| **AI** | Managed Serving | Run your model on dedicated GPUs |
| **AI** | AI Agents + Knowledge Bases | Assistants that answer from your documents |
| **AI** | Vector Database | Memory/retrieval layer for AI |
| **Compute** | GPU Instances | H200/B200/B300 on-demand or reserved |
| **Compute** | Virtual Machines / VPS | Servers in seconds, multi-region |
| **Compute** | Bare-Metal | Dedicated physical servers |
| **Containers** | Managed Kubernetes | Run containers without running the cluster |
| **Data** | Managed Databases | Self-running SQL/NoSQL (+ vector option) |
| **Data** | Object Storage | S3-compatible storage for everything |
| **Apps** | App Hosting | Git push to a live application |
| **Network** | Domains | Register & manage web addresses |
| **Network** | DDoS Protection | Keep services online and secure |

---

*Prepared for lending institutions, investors, and enterprise/government stakeholders. AhuraSense Cloud is operational; capabilities described are live. Confidential.*
