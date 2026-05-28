# Session Progress — May 2026 (UI / Marketing / Dashboard)

**Window:** 2026-05-26 → 2026-05-28
**Branch:** `dev` (AI platform work merged in from `ai`)
**API surface:** `api.cs2hvh.com/v1` (OpenAI-compatible)
**Author:** Harshit

> Context: this is the customer-facing polish layer on top of the AI platform
> initiative (serverless inference + fine-tuning + adjacent AI services). Hard
> rules that govern everything below:
> - **Enterprise-grade from day 0** — built for 100k+ scale; security,
>   observability, multi-tenancy are pillars, not afterthoughts.
> - **Never reveal upstream providers** — RunPod / OpenRouter / Linode /
>   Cloudflare / R2 are invisible in every customer surface (dashboard, toasts,
>   errors, emails, marketing). Server code + internal logs may keep the names.
> - **Customer-facing, not operator-facing** — per-token billing, no infra
>   visible to the customer, polish across the board.

---

## 1. Marketing site — homepage

The big push this session. The homepage now reads as a single cohesive
dark-theme product story.

### The Complete Model Training Pipeline (new flagship section)
- Ported the standalone HTML/CSS/JS prototype
  (`/public/new-ai-section/Model Training Flow.html`) into a React section:
  [components/model-training-pipeline-section.tsx](../components/model-training-pipeline-section.tsx).
- Faithful reproduction of all **7 step cards** (Phase 1: Data Collection →
  Cleaning → Tokenization; Phase 2: Architecture → Training Env → Monitoring →
  Fine-Tuning), the Ready/Diamond tail, the SVG flow lines, and the traveling
  glow orb.
- **Auto-play instead of scroll-hijacking.** The prototype advanced one step
  per wheel gesture, which fights normal page scroll. Rewrote to play the full
  sequence **once** via `IntersectionObserver` when the section enters view.
- Converted to the app **dark theme**: solid black + one soft brand-blue wash +
  faint dot grid. Standard `<Container>` width (was a custom 1760px wrapper that
  overflowed every other section).
- Design refinement pass: toned down blue / more black with white+blue accents,
  brand-blue card titles, lighter `font-weight: 400` heading to match the other
  homepage section titles, removed the eyebrow pill, tightened card sizing.
- Post-animation state no longer feels blank — orb parks at the final node with
  a resting pulse and an outcome strip fades in.
- **Bug fixed — "animation stalled after Step 1":** root causes were (1)
  `playEdge` capturing `paths` via a stale closure (paths had `len=0` until a
  second state update), (2) the observer effect re-binding on every paths
  update, (3) no readiness gate. Fix: added a `pathsRef` that mirrors the
  `paths` state so callbacks always read the latest path data without being
  recreated; observer effect now has stable `[]` deps; `waitForPathsReady()`
  polls until all SVG edges report a non-zero measured length before starting.

### Live domain search (Domain Registration section)
- [components/domain-search-section.tsx](../components/domain-search-section.tsx)
  — the hero search box is now **live**.
- Wired to `POST /api/domains/public/search` (IP rate-limited, 10/min).
- 500ms debounce + `AbortController` to cancel in-flight requests; SLD extractor
  strips the TLD before querying.
- Results: featured row + suggestions list, available-first sort. States:
  idle (TLD chips) / loading skeleton / 429 error / results / 0-results.
  "Browse all" deep-links to `/services/domain?q=`.

### Our Core Services
- [components/services-section.tsx](../components/services-section.tsx) —
  swapped all service icons to the final `/public/services-icon/` asset set.
- Re-enabled the **6th card (A.I. Labs)** that was previously commented out.
- (No DDoS icon in the new set → that slot is App Deployment.)

### "Everything you need to build and scale" section
- [components/everything-section.tsx](../components/everything-section.tsx) —
  added a new **A.I. Labs tab** (inference, fine-tuning, embeddings, model
  hosting, billing, features) between GPU Pods and Compute.

### Compute section
- [components/compute-section.tsx](../components/compute-section.tsx) —
  tightened copy across all tiers; renamed Tier 03
  **"Single-tenant servers" → "Dedicated Server"**.

### Clusters section
- [components/clusters-section.tsx](../components/clusters-section.tsx) —
  fixed the GPU memory line to the correct **B200 spec: 12 TB (192 GB / GPU)**
  (was the H200 figure, 8 TB / 141 GB).

---

## 2. Marketing site — service pages (`/services/*`)

Brand-less sibling IA: each AI capability has its own bespoke landing page in
the homepage design language (sharp corners, `bg-[#0a0a0a]`, mono accents).

### /services/inference
- Rebuilt with inference-native sections (replaced generic boilerplate).
- Models section redesign; bento feature grid + premium icon badges; tighter
  copy. Dropped the weak "Built for the apps you actually ship" block.
- **Private hosting section** redesigned twice → final form is horizontal
  **isolation lanes**: 7 stacked tenant lanes, only the "your-org" lane carries
  animated blue packets; the rest are dim dashed tracks (visually proves tenant
  isolation). Feature list is hairline-divided, no icon boxes.
  [components/services/inference-private-hosting-section.tsx](../components/services/inference-private-hosting-section.tsx)

### /services/fine-tuning
- Rebuilt as a **scroll-pinned narrative** ("Six phases. Zero infra to run.").
- Premium redesign of the pipeline; proper icons + motion.
- **Bug fixed — sticky card going blank:** `overflow-hidden` creates a scroll
  context that unpins `position: sticky`. Switched to `overflow-clip`, which
  preserves it.

### /services/model-hosting
- Bespoke landing with 4 sections, then a **premium redesign of all four**
  (hero, formats, lifecycle, GPU fleet selector).
  [app/(marketing)/services/model-hosting/page.tsx](../app/(marketing)/services/model-hosting/page.tsx)

### /services/embeddings
- Bespoke landing with 4 sections.

### /services/ai-use-cases (NEW page)
- Consolidated into a **single interactive showcase** after several full
  redesigns (feedback: too colorful → too boxy → too much text).
- 4 tabs — Chatbots/Agents, RAG, Code Gen, Document Intel — each with its own
  AnimatePresence-cross-faded visualization. Joined with 1px seams.
  [components/services/use-cases-page-sections.tsx](../components/services/use-cases-page-sections.tsx)
- Old per-use-case section files deleted (replaced by the consolidated
  component).

### All service heroes
- Fixed heroes that left a gap at the bottom → `min-h-screen` (true 1 vh).
- Normalized the PixelBlast background animation to the site-wide speed (0.3) —
  the service heroes were running noticeably faster than the homepage.

---

## 3. Navbar

- **Reordered** the primary nav: **A.I. Labs (leftmost) → Products →
  Solutions (rightmost)** — desktop + mobile accordion.
- Lifted the AI services out of Products into their **own A.I. Labs dropdown**,
  then expanded it into a 3-section layout (Products + Use cases + Resources).
- Wired the use-case links to `/services/ai-use-cases`.
- **User dropdown redesign**
  [components/navbar-client.tsx](../components/navbar-client.tsx):
  40px avatar with brand-blue glow, 260px panel, grouped into **Workspace**
  (Dashboard, Activity & usage, Billing) and **Personal** (Profile, Settings,
  Support) + an API-documentation external link. Active route highlighted with
  a glowing dot via `usePathname()`; selecting any item closes the menu.

---

## 4. Dashboard / app shell

### Sidebar
- Renamed the top-level **"Inference" → "AI/ML labs"**; swapped its icon
  Sparkles → Atom.
- Regrouped the Inference children into **Build / Workloads / Manage**.

### Settings & usage
- Settings spend-cap inputs now show **live current-month spend** context.
- Usage: **per-API-key breakdown** + CSV export, plus a **per-API-key cache
  hit-rate** column. Caption brand-scrubbed.

### Diagnostics
- Split the **operator-only infra view** from the **customer service-health**
  view (customers never see infra internals).

### Onboarding
- First-run guide on the `/inference` landing page.

---

## 5. Inference platform (backend / phases, this window)

These landed earlier in the window (2026-05-26) and underpin the surfaces above.

- **Phase 6:** HuggingFace source for BYO Deploy (Truss source builds still
  deferred / early-access).
- **Phase 7.C:** semantic cache (per-key opt-in), per-org threshold tuning,
  `cache_kind` recorded on usage rows, hourly GC sweep, messages-route parity.
- **Phase 1.5:** per-API-key rate limits.
- **Phase 11.E:** org-level spend caps + spend-threshold alerts.
- **Phase 11.F:** FT notifications (in-app + email + outbound webhook on FT
  events); SDK snippets on the FT detail page; playground deep-link.
- **Phase 7.E:** SOC 2 readiness doc (`docs/inference/security.md`).
- Refactors: extracted leaf cells + pure utils for fine-tuning and batches
  tables (same pattern across both).

### Brand-scrub hardening (cross-cutting)
- Three-layer discipline enforced: **write-time** sanitize via
  `lib/inference/error-messages.ts` (`customerSafeErrorMessage()` is the single
  source of truth) + **read-time** sanitize in the dashboard + **audit** of new
  write paths.
- Scrubbed customer-visible URLs/image into an env-driven branding module.
- Widened the scrub to deployments, batches, vectors, files; removed remaining
  `pod` / `vLLM` references from FT BYO-serve copy.
- Notifications: accurate test endpoint that bypasses the subscription filter.

### Docs
- Customer-facing user guide + API reference + refreshed README under
  `docs/inference/`.

---

## 6. Key technical notes / gotchas (for future sessions)

- **Animation library:** use `motion/react`, **not** `framer-motion` (the
  latter throws runtime errors in this project).
- **`overflow-clip` vs `overflow-hidden`:** `clip` preserves `position: sticky`;
  `hidden` creates a scroll context that unpins it.
- **Stale-closure pattern for scroll/SVG animations:** mirror React state in a
  `ref` (e.g. `pathsRef`) so animation callbacks read the latest value without
  being recreated and without re-binding observers.
- **`waitForPathsReady()` gate:** poll measured SVG path lengths before starting
  a draw sequence — SSR/first-paint reports `len=0`.
- **FOUC on styled-jsx sections:** styled-jsx applies after the SSR HTML paints,
  briefly showing raw text. Gate the section's opacity behind a `mounted` state
  (false on SSR → true in `useEffect`). *(Approach noted; not currently applied
  to the model-training section — the file is in a clean working state.)*
- **Width consistency:** always use the standard `<Container>` (≈max-w-[75%] on
  desktop). Custom max-width wrappers desync from the rest of the page.

---

## 7. In progress / next

- **The Complete Model Training Pipeline** — continuing homepage UI refinement
  on this section (current focus).

---

*Generated from the `dev` branch commit log for 2026-05-26 → 2026-05-28.*
