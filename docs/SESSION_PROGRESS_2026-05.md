# Session Progress — May 2026 (UI / Marketing / Dashboard)

**Window:** 2026-05-26 → 2026-05-29
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

## 7. In progress / next (as of 2026-05-29)

- **The Complete Model Training Pipeline** — homepage UI refinement (was the
  focus at 2026-05-28; superseded by the v1 service productionization below).
- **Marketing pricing page + GPU/VPS visual polish** — *uncommitted in the tree*
  as of 2026-05-29; see §9.

---

## 8. Compute / VPS · GPU · Custom Images — v1 productionization (2026-05-29)

A service-by-service "make it production-ready for v1 launch" pass, focused on
**Compute (VPS)**, **GPU deploy**, **custom OS images**, and the **dashboard top
bar**. Full Compute reference doc written: **[docs/COMPUTE_SERVICE.md](COMPUTE_SERVICE.md)**.

> ⚠️ **Migrations another session/operator must apply** (in order):
> `20260615000002_compute_billing.sql` → `20260615000003_fix_compute_meter_rates.sql`
> → `20260615000004_custom_images.sql`. After applying, redeploy the app **and**
> the `credit-system-cron` worker (cron table-name lists changed).

### Compute / VPS billing (was the P0 — VPS ran completely unbilled)
- VPS were balance-gated at create but **never charged** (no meter row, not in
  the cron, delete only stamped `billing_end`). Wired into the same metered-cron
  + 7-day-grace→auto-delete lifecycle as Database/Kubernetes. Commit `c2302618`.
- Mechanism: the cron RPC is **UUID-keyed** but `servers.id` is bigint → added
  `servers.billing_service_id UUID` + `billing.active_compute` meter
  (`20260615000002`). `lib/services/compute/server-lifecycle.ts` `destroyServer()`
  is shared by user-delete + grace-expiry.
- **Plan billing bug fixed (was ~4× overbill):** create billed
  `calculateHourlyCost(specs)` (spec formula) even when a plan was chosen — e.g.
  `s-2` advertised $10/mo was metered ~$43/mo. Now plan-based servers bill the
  **advertised** `instance_plans.hourly_usd`; the formula only remains for the
  legacy free-form custom-specs path. Migration `20260615000003` re-rates +
  **backfills** meters for servers that predated metering (they had no meter at
  all). Commit `5cebdf7b`.

### Compute security + cleanup (commit `7b9303af`)
- `/api/services/compute/options` was fully unauthenticated (ran ~5 capacity
  queries + leaked per-region sold-out intel) → now auth + rate-limited.
- Deleted the dead `components/dashboard/compute/vps/new.tsx` form (live form is
  `simple.tsx` via `form-loader.tsx`).
- **cipassword (VNC/SSH password) isolation verified (accepted for v1):** never
  stored in our DB, never returned by any API (flows only request→Proxmox);
  every VM endpoint enforces `owner_id`. Residual plaintext is Proxmox-layer only
  (cloud-init ISO/metadata) — insider, not cross-tenant. Fast-follow: SSH-key
  auth + rotation.

### Compute UI
- **Real OS icons** everywhere via shared `OsImg` in
  `components/dashboard/compute/vps/os-icons.tsx` (brand PNG from `public/os/`,
  monochrome glyph fallback): create-form dropdown, list avatars, detail header.
  PNGs: Ubuntu/Debian/CentOS/Windows/AlmaLinux/Rocky.
- VPS list: **plan table split** into separate vCPU / RAM columns; **region/flag
  column fixed** — it read the `proxmox_host_regions` view client-side (returned
  nothing); now resolves server-side via **`GET /api/services/compute/host-regions`**.
- **Post-create UX:** removed the in-form "deploying" transition screen; create
  now redirects to the all-servers list, which shows live per-row provisioning
  progress (realtime). Deleted `deployment-progress.tsx`.

### VPS resize — Linode-style plan change (commits `5cebdf7b`, `32da3024`, `990f73b0`)
- Detail page → Settings → "Resize". In-place (no host migration) →
  capacity-checked on the current host (`lib/services/compute/resize.ts`); **disk
  grow-only** (Proxmox limit). **Power-off required** (changed from initial
  auto-power-cycle decision): rejects running/suspended, UI shows a "Power off to
  resize" prompt. Background: grow disk (`resizeDisk` PUT) → `configureVM`
  cores/memory → persist → `rerateActiveCompute`. Plans grouped by Shared/Dedicated
  tier toggle.

### Custom OS images (full feature; see COMPUTE_SERVICE.md §14)
6 slices. Migration `20260615000004` (custom_images catalog +
`proxmox_templates.owner_id`/`custom_image_id` + `billing.active_custom_image`).
- A custom image = an **owner-scoped `proxmox_templates` row**, so the existing
  clone + networking path works unchanged. `options`/`create` scope built-in OS
  to `owner_id IS NULL`.
- **URL import (LIVE):** `POST /api/services/compute/images` (https/SSRF-screened,
  quota, size probe). **Not staged in our storage** — the Proxmox host pulls the
  URL directly. Lazy per-host build on first deploy in a region
  (`lib/services/compute/custom-images.ts` `ensureCustomTemplateOnHost` →
  `buildCustomImageTemplate` in proxmox-utils: SSH download → `qm importdisk` →
  cloud-init drive → `qm template`). Images require **cloud-init + guest-agent**.
- Billing **$0.05/GB-mo** (`active_custom_image`), metered once per image when it
  first builds (never-deployed URL image = free).
- UI: `/dashboard/services/compute/images` (list/import/delete) + "Images" link
  in VPS hero + "Custom image…" CTA in the deploy OS picker.
- **Snapshot-from-server is DISABLED** (commit `66edbf52`): route returns 503,
  "Create image" Settings section removed. Full impl preserved in git
  (`67cdef63`) — R2 staging via `exportVmDiskToUrl` (`pvesm path` + `qemu-img
  convert` + presigned PUT to `R2_CUSTOM_IMAGES_BUCKET`/`ahura-custom-images`).
  Re-enable needs that bucket created. (qcow2 export is sparse ≈ used space.)

### Dashboard top bar (commit `da83061c`)
- Removed breadcrumbs. Left is now a **command palette** search
  (`components/dashboard/command-palette.tsx`, ⌘K/Ctrl+K) — keyboard-nav across
  every service/page + quick actions. Right cluster keeps notifications + billing
  + profile. `components/dashboard/header.tsx` rewritten.

### GPU deploy page (commits `1e48c6ec`, `559af585`)
- **Storage now affects price.** Billed pod rate previously was GPU-only even
  though RunPod charges for disk. Added `GPU_STORAGE_USD_PER_GB_MONTH` ($0.10) +
  `storagePerHour()` in `lib/services/runpod/helpers.ts`; the billed rate
  (pod-lifecycle-operations) **and** the deploy estimate both add local disk
  (container + pod volume; network volumes excluded — metered separately) so
  quote == billed. Default GPU markup is `1.250` (matches the UI's ×1.25).
- **Validation errors surfaced inline** on the left next to each field (GPU,
  name, image, disk, access); Launch is always clickable and on click reveals
  errors + smooth-scrolls to the first one (was silently disabled).
- **Known GPU gap (not fixed):** GPU cards show the raw RunPod (pre-markup)
  price while the summary/billed rate is the marked-up resale — cards under-quote.
  Clean fix = inventory endpoint returns resale prices (per-GPU `markup_pct`).

### Key gotchas / notes for future sessions
- **Billing cron is UUID-keyed** (`bill_service_cycle_atomic`): any new metered
  service needs a UUID `service_id`; add the table to `credit-system-cron`
  `VALID_TABLE_NAMES` + `TABLE_TO_SERVICE_TYPE` **and** `lib/billing/grace/constants.ts`
  + a `deletion-executor.ts` case. (Pattern: active_compute, active_custom_image.)
- **Supabase query builder is a thenable without `.catch`** — use `try/await`,
  not `.then().catch()` (TS2339).
- **Proxmox storage-backend agnostic disk path:** use `pvesm path <volid>` over
  SSH; don't assume LVM vs dir layout.
- **Proxmox helper duplication persists:** `vms/create` + `admin/proxmox/vms/create`
  carry inline `proxmoxAuth`; control-plane routes use `lib/proxmox-utils`. De-dupe
  post-v1 (risky on the provisioning critical path pre-launch).
- **Lazy custom-image build runs inside provisioning `after()`** (long; first
  deploy per region slow) — move to a dedicated worker post-v1.
- JSX apostrophes need escaping (`react/no-unescaped-entities`) — rephrase or use
  `&apos;`.

### Open / next
- GPU: inventory endpoint should return **resale** prices (cards vs summary).
- Compute fast-follows: SSH-key-primary VPS auth + password rotation; Proxmox
  helper de-dup; move custom-image lazy build to a worker.
- Re-enable snapshot-from-server (create the R2 bucket first; add free-space
  pre-check + optional compression).
- Continue the service-by-service v1 sweep (next recommended: **Inference** —
  see the inference billing gaps: cron doesn't meter GPU pods for FT/serving).

---

## 9. Marketing pricing page + GPU/VPS polish (2026-05-29) — *uncommitted*

A marketing/dashboard visual-polish pass. **Not yet committed** — lives in the
working tree. Two threads: (a) the public **pricing page** made data-accurate and
de-promo'd, (b) small **GPU/VPS** hero + table refinements.

### Pricing page data accuracy ([lib/supabase/queries/pricing.ts](../lib/supabase/queries/pricing.ts))
- **Comparison columns rendered empty** because products store cores/RAM/disk in
  the structured `resources` field, not the free-form `specs` array.
  `buildSpecsFromResources()` synthesizes `"<n> vCPU" / "<n> GB RAM" / "<n> GB
  NVMe"` from `resources`, falling back to `specs` only when resources are absent.
- `cleanTierName()` strips type/spec noise baked into product names
  (e.g. `"Basic 1vCPU 2GB"` → `"Basic"`) since type + specs have their own columns.

### Pricing page content ([app/(marketing)/pricing/page.tsx](../app/(marketing)/pricing/page.tsx) fallback data)
- **Removed all promo blocks** (crypto deal, startup credits, "static pricing"
  launch offer) — placeholders that don't reflect real offers.
- **GPU Instances retiered to the real fleet:** promo block replaced with actual
  SKUs — **H200 SXM** (141 GB), **B200** (192 GB, featured), **B200 ×4** (NVLink),
  etc. Per-GPU, per-second billing copy; CTAs deep-link to
  `/dashboard/services/gpu/deploy?gpu=…` instead of `/signup`.
- Tightened tier/category descriptions across Compute + GPU.
- Large reflow of [pricing-content.tsx](../components/pricing/pricing-content.tsx)
  (~977 lines) and [pricing-client.tsx](../components/pricing/pricing-client.tsx)
  to match.

### GPU / VPS hero + table polish
- **Hero accent treatment unified** to a single brand-blue keyword (drop the
  trailing period, color the keyword `#0095FF` instead of `text-white/55`):
  [gpu-dashboard.tsx](../components/dashboard/gpu/gpu-dashboard.tsx) ("GPUs"),
  [enterprise-form.tsx](../components/dashboard/gpu/enterprise-form.tsx)
  ("sales team"), [compute/vps/simple.tsx](../components/dashboard/compute/vps/simple.tsx)
  ("server").
- **VPS plan picker table** ([simple.tsx](../components/dashboard/compute/vps/simple.tsx)):
  wider container (1360 → 1760px), roomier row padding, larger spec/price type
  (12 → 13px, price 16 → 18px), cleaner `GB` / `GB NVMe` unit styling.
- **"Everything you need" GPU tab** ([everything-section.tsx](../components/everything-section.tsx)):
  swapped the static PNG for the new `/ailabs/B200-GPU-Stack.png`; GPU image
  scaled up (`scale-[1.35] -translate-y-6`) to fill the frame.

### Side fix (unrelated, found while inspecting the tree)
- **Migration typo fixed:** `20260526000003_phase7_batch_grants.sql` had
  `ALTER DEFAULT PRIVILEGES INa SCHEMA` (stray `a`) — a hard syntax error that
  would have aborted the migration. Corrected to `IN SCHEMA`.

> ℹ️ Also in the tree: **14 old `supabase/migrations/*.sql` files deleted**
> (pre-2026-05 dates: `20231201`…`20260122`). **Confirmed intentional** — they're
> redundant after the baseline squash captured in `20251115073901_remote_schema.sql`
> (commits *"rename legacy files with timestamps, add remote schema baseline"* +
> *"move legacy files after baseline, make idempotent for db pull compatibility"*).
> Safe to commit the deletion — keep it in **its own commit**, separate from the
> pricing work.

### Open / next
- Pricing rework + GPU/VPS polish are **unverified and uncommitted** — review the
  full diff, run the pages, then commit. The 14 migration deletions are a confirmed
  baseline-squash cleanup; commit them **separately** from the pricing work.
- GPU pricing-card vs summary markup mismatch (carried from §8) still open.

---

*Generated from the `dev` branch commit log + working tree for
2026-05-26 → 2026-05-29.*
