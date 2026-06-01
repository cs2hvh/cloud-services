# Performance Baseline & Tracking

Baseline measurements for the web app perf pass (roadmap: the perf plan in `.claude/plans/`).
Re-run the same measurements after each phase and fill the "after" columns so every change is
provable. Created 2026-05-31.

> Environment for field numbers: production build, served via the custom server
> (`npm run build && npm run start`), behind Cloudflare. Lab numbers (Lighthouse) may be run
> locally against `npm run start`; CDN/TTFB numbers must be taken through Cloudflare.

---

## 1. Bundle size — First Load JS per route

Source: `ANALYZE=true npm run build`. The build prints a route table (`Route (app) … First Load JS`)
and writes interactive treemaps to `.next/analyze/{client,nodejs,edge}.html`.

How to read it: **First Load JS** = the JS a visitor must download+parse before the route is
interactive. The shared chunk is counted once; per-route columns show what each page adds. Open
`client.html` and look for `three`, `postprocessing`, `cobe`, `motion`, `recharts`, `@tiptap`,
`pdfjs-dist`, `@novnc/novnc`.

Baseline build: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`, Next 15.5.15, 2026-05-31.

| Route | First Load JS (baseline) | Render | Top contributors | After P1 | After P5 |
|---|---|---|---|---|---|
| `/` (landing) | **652 kB** | ƒ dynamic | **three.js + postprocessing (PixelBlast ×2)**, motion, dotted-map | **505 kB** (−147, three.js lazy) | |
| `/services/compute` | **608 kB** | ƒ dynamic | PixelBlast (ComputeSection), motion | | |
| `/services/object-storage` | 496 kB | ƒ dynamic | motion (+ 4.87 MB raw PNG at runtime) | | |
| `/services/kubernetes` | 458 kB | ƒ dynamic | motion | | |
| `/services/security` | 450 kB | ƒ dynamic | motion | | |
| `/services/domain` | 172 kB | ƒ dynamic | motion | | |
| `/dashboard/services/apps/[id]` | 438 kB | ƒ dynamic | apps UI | | |
| `/dashboard/services/database/clusters/[id]` | 380 kB | ƒ dynamic | recharts | | |
| `/dashboard/services/compute/vps/[id]` | 324 kB | ƒ dynamic | VPS console UI | | |
| `/pricing` | 262 kB | ƒ dynamic (cookies) | motion | | |

**Shared baseline chunk:** **102 kB** (all routes).
**Static vs dynamic pages: 4 static (○) / 133 dynamic (ƒ)** — i.e. essentially the *entire* site
is server-rendered per request.
**After Phase 2a+2b: 36 static / 101 dynamic** — the whole marketing surface (`/`, `/pricing`, all
`/services/*` + `/solutions/*`) is now prerendered; the remaining 101 dynamic are `/dashboard/*` +
auth pages (correctly dynamic). Done by removing the server-side `getUser()` from
`components/navbar.tsx` and switching `getFullPricingData()` to the cookieless anon client.

**Verified footprint (grep, 2026-05-31):** the *only* live three.js/postprocessing import is
`components/hero/pixel-blast.tsx` (rendered twice on `/` — hero + compute section). The following
are **dead code** (0 references, not bundled): `components/hero/tensor-scene.tsx` (three.js),
`gpu-cluster-blueprint.tsx`, `services-constellation.tsx`, `infrastructure-panel.tsx`,
`components/ui/globe.tsx` (cobe). The deps `@novnc/novnc` and `pdfjs-dist` are imported nowhere
(the VPS console loads the static `public/novnc/` files, not the npm package) — candidates for
removal, but not runtime costs.

**Targets:** three.js/postprocessing **off** the `/` initial chunk (lazy + viewport-gated);
recharts/tiptap loaded only on the routes that use them; delete the dead heavy components.

### Root-cause findings from the baseline build
1. **Whole marketing site is dynamic (4 static / 133 dynamic).** Cause: `components/navbar.tsx` is
   a **server component that does `await getUser()`** and lives in the marketing layout, so every
   marketing page is forced `ƒ` (server-rendered per request) **and** performs a server-side
   Supabase Auth round-trip at render — *in addition* to the middleware `getUser()`. Making the
   Navbar render its auth state client-side (pass no `initialUser`, fetch via the browser client)
   converts ~130 pages to static/ISR → CDN-cacheable, and removes a Supabase RTT from every
   marketing TTFB. **Highest-impact server-side fix (Phase 2).**
2. **`/pricing` reads `cookies` directly** → forced dynamic even with `revalidate` set
   (`getFullPricingData` uses a cookie-bound Supabase client). Use an anon/cookieless client for
   public catalog reads so it can be static/ISR.
3. **The `build` npm script OOMs at the default ~4 GB heap.** `dev`/`start` set
   `--max-old-space-size=8192`; `build` does not (only the Dockerfile injects `NODE_OPTIONS`). A
   local/CI `npm run build` outside Docker crashes with "JavaScript heap out of memory". Fix: add
   `NODE_OPTIONS=--max-old-space-size=8192` (via `cross-env`, already a dep) to the `build` script.

---

## 2. Lab metrics — Lighthouse (mobile, throttled)

Run for each URL (Chrome DevTools → Lighthouse → Mobile, or `npx lighthouse <url> --preset=desktop`
and again mobile). Record the median of 3 runs.

| URL | Perf score | LCP | TBT | CLS | INP (field) | Total bytes |
|---|---|---|---|---|---|---|
| `/` | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| `/services/compute` | _TBD_ | | | | | |
| `/services/object-storage` | _TBD_ | | | | | |
| `/pricing` | _TBD_ | | | | | |
| `/signin` | _TBD_ | | | | | |
| `/dashboard` (logged in) | _TBD_ | | | | | |

**Targets:** landing LCP < 2.5 s (mobile, throttled); TBT down materially after P1.

---

## 3. CDN / TTFB through Cloudflare

For each URL, measure repeated requests and inspect `cf-cache-status` + `Server-Timing`.

```bash
# TTFB + cache status (run a few times to see HIT vs MISS)
curl -so /dev/null -w "ttfb=%{time_starttransfer}s code=%{http_code}\n" https://ahurasense.com/
curl -sI https://ahurasense.com/ | grep -i 'cf-cache-status\|set-cookie\|cache-control'
```

| URL | TTFB (baseline) | cf-cache-status | Set-Cookie present? | After P2 |
|---|---|---|---|---|
| `/` | _TBD_ | likely MISS/DYNAMIC | yes (middleware) → blocks cache | |
| `/pricing` | _TBD_ | | | |
| `/api/pricing` | _TBD_ | | | |
| `/api/ai-agents/platform-models` | _TBD_ | | | |
| `/dashboard` | _TBD_ | BYPASS (auth) | yes (expected) | |

**Targets after P2:** marketing HTML + catalog APIs become cookie-free → `cf-cache-status: HIT`;
marketing TTFB drops by ~the Supabase `getUser()` RTT (~50–150 ms).

---

## 4. Server throughput & event-loop contention

Single-process vs. multi-instance (P3). Run against `npm run start` (custom server), local.

```bash
npx autocannon -c 50 -d 20 http://localhost:3000/            # static-ish marketing
npx autocannon -c 50 -d 20 http://localhost:3000/api/pricing # cached-able API
```

Capture req/s and latency p50/p99. Then **trigger a build job** (enqueue an app-build) and re-run
to quantify how much in-process BullMQ workers steal from request serving.

| Scenario | req/s | p50 | p99 | Notes |
|---|---|---|---|---|
| `/` idle, single process | _TBD_ | | | baseline |
| `/` during a build job | _TBD_ | | | event-loop contention |
| `/api/pricing` idle | _TBD_ | | | |
| After P3 (N instances + separate worker) | _TBD_ | | | should scale ~linearly |

Optional: log `perf_hooks.monitorEventLoopDelay()` (or `pidstat`/`top`) during a build to record
event-loop lag on the single process.

---

## 5. Image / asset audit (P4)

```bash
du -sh public/                 # baseline total
du -sh public/*/ | sort -h     # per-subdir
```

| Metric | Baseline | After P4 |
|---|---|---|
| `public/` total | 455 MB | _TBD_ |
| Standalone Docker image size | _TBD_ | _TBD_ |
| Largest shipped-raw image | 4.87 MB megaphone (`unoptimized`) | _TBD_ |

---

## Notes
- Field (RUM) metrics (INP, real LCP) are best taken from Cloudflare Web Analytics / a RUM beacon
  once deployed — lab Lighthouse is directional only.
- Keep the **same** device/throttling profile across before/after runs or the deltas are noise.
