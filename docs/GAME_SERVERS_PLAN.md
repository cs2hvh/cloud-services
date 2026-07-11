# Game Servers Service — Architecture & Implementation Plan

> Status: DESIGN (2026-07-05). Researched against Pterodactyl/Pelican upstream, cfx.re/Valve licensing
> primary sources, competitor offerings (VibeGames, SparkedHost, BisectHosting, Shockbyte, ZAP), and
> this codebase's own service-vertical patterns (GPU + Compute). Games at launch: **Minecraft, Rust,
> CS2, FiveM**. Licensing model: **customers bring their own license keys / GSLTs** (decided).

---

## 1. Executive summary — the decisions

| Decision | Choice | Why |
|---|---|---|
| Control panel | **Pterodactyl 1.14.x** (upgrade existing panel from 1.11.11 → 1.14.1, Wings → 1.13.1, **immediately**) | Project revived under Infraly LLC (Dec 2025); 8 releases in 6 months. 1.11.11 has known unpatched Critical/High CVEs (CVE-2026-26016, GHSA-xvc3-826v-xf47). Pelican is still beta35 with **no** stable release, **no** official migration guide, and an Application API that removes `/locations` + `/nests` endpoints our code calls. Eggs are compatible both ways, so a future Pelican move stays feasible if we keep panel calls isolated in `lib/pterodactyl/`. |
| Topology | **One central Panel** (existing `PTERO_DOMAIN`) + **Wings daemon on every machine**; machines grouped by region | This is exactly the "machine1 on location1, machine2 on location2, multiple machines per location" model requested — it is Pterodactyl's native Node/Location design. |
| Region source of truth | **Our DB** (`game_hosts.region/display_region`, cloned from `proxmox_hosts`), mapped to panel location/node IDs | The current code treats the panel's `locations` endpoint as the region list — fragile, admin-only concept, and Pelican-incompatible. Our own inventory table matches the house pattern and survives a panel swap. |
| Licensing | **BYO**: FiveM cfx.re key + CS2 GSLT are entered by the customer, stored encrypted, injected as egg env vars. Minecraft = EULA checkbox. Rust = nothing. | Verified against primary sources — see §4. Central provisioning of GSLTs is a Steam ToU violation with account-wide ban blast-radius; cfx keys are contractually non-transferable/non-sublicensable. |
| Billing | Hourly metered via the standard billing spine (`reserveProvision`/`settleProvision`/`closeActiveBilling` + `billing.active_game_servers` + cron) | Same as GPU/compute. The legacy game order route charges **nothing** today. |
| Existing game code | **Replace, don't extend** | The legacy route (`app/api/services/order/game/route.ts`) has no billing, a guaranteed-500 allocation branch, GB/MB unit bugs, hardcoded egg IDs, and puts every server on panel admin user 1. Details in §2. |
| DDoS | DC-level protection per region + (optionally) existing Cloudflare Spectrum **for Minecraft Java only** | **Correction to an internal assumption:** CF Spectrum supports arbitrary UDP only on Enterprise. FiveM/CS2/Rust are UDP — Spectrum does *not* fit them. Minecraft Java is TCP and works on the existing Spectrum stack. |

---

## 2. Current state (what's already in the repo)

There is a **legacy, half-built game vertical** — useful as scaffolding knowledge, not as code to keep:

- `lib/pterodactyl/index.ts` — bare axios client (`PTERO_DOMAIN`, `PTERO_API_KEY`, Application API only).
- `lib/pterodactyl/manifest.ts` — hardcoded per-game egg IDs (minecraft=1, rust=12, valheim=13, cs2=15) and images; Rust RCON password literally `"changeme"`.
- `app/api/services/order/game/route.ts` — the only game API route. Defects: **no billing at all** ("Pay and Deploy" charges nothing); if no free allocation exists the create-allocation call is commented out → guaranteed 500; records a random port that may not match the actual allocation; passes `cpu: 0` (unlimited); GB→MB conversion uses ×1000; capacity check compares GB against MB (always passes); all servers created under panel **admin user 1** so customers can't actually log into the panel; no rollback → orphan panel servers; plain-text responses.
- `components/dashboard/game/new.tsx` — 5-step wizard, UI-complete, posts to the broken route; fake paid add-ons collected then ignored; location display bug.
- `game_servers` table — bigint PK, owner RLS, `ends_at` (+30d) that **nothing enforces**, no billing linkage.
- "Open Panel" button hardcoded to `https://panel.hav0k.dev/server/{id}`.
- Cloudflare Spectrum stack (`config/spectrum-functions.ts`, `spectrum_apps`, network-ddos service) — fully built and billed, but **zero linkage** to game servers.
- Marketing landing `solutions/game-dev` promises features the backend doesn't have.
- Not in sidebar nav; no admin pages; no tests; no notifications/audit/email emissions.

**Action:** keep the table name and the panel, rebuild everything else on the GPU/compute patterns.

## 3. Panel: upgrade mandate (do this before anything else)

1. Upgrade Panel **1.11.11 → 1.14.1** (same 1.x line, standard upgrade path) and Wings on the existing node(s) → **1.13.1**. 1.11.11 is vulnerable to CVE-2026-26016 (Critical, missing authz), GHSA-xvc3-826v-xf47 (unauth panel-wide login lockout), CVE-2026-54593 (JWT scope), CVE-2025-68954 (SFTP revocation).
2. Rotate `PTERO_API_KEY` (it sat in the exposed `.env` files flagged by AUDIT.md).
3. Move the panel URL into env (`PTERO_PANEL_PUBLIC_URL`) — kill the `panel.hav0k.dev` hardcode.
4. Hedge for a possible future Pelican migration: never add new coupling to `/api/application/locations` (Pelican removed it); keep every panel call behind `lib/pterodactyl/`.

## 4. Licensing & compliance (verified against primary sources)

### FiveM — sell it, carefully
- Pre-March-2025, selling FiveM hosting was contractually banned for everyone except ZAP-Hosting (PSA Term 8 + Addendum D). The current Rockstar **Creator PLA (Jan 12 2026)** dropped the profit ban; six authorized partners exist (GPORTAL, Shockbyte, Nitrado, Nodecraft, xREALM, ZAP). Non-partner hosts (SparkedHost, BisectHosting, dozens more) operate openly in a **tolerated-gray** zone; Rockstar retains a contractual kill-switch (PLA §5.2: authorized/exclusive/unauthorized provider designations, 30-day effect).
- **Compliance checklist:**
  - Customer registers their own key at the cfx.re Portal (portal.cfx.re, ex-Keymaster); our panel exposes it as the `sv_licenseKey`/egg env field. Keys are non-transferable/non-sublicensable (PLA §2.1) — never provision from a company account.
  - **Never brand as "FiveM"** (PLA §2.2(2)/§2.5): no "fivem" domain/product name. Descriptive use is fine: "Game servers for FiveM (GTA V)".
  - >48 slots requires the **customer's** Element Club sub (Argentum 64 / Aurum 128 / Platinum 2048) on their cfx account — we cannot resell it.
  - txAdmin: MIT, ships inside FXServer, bundling is officially expected (official GSP env vars exist).
  - Customer webstore monetization is Tebex-exclusive (their problem, but note it in AUP).
  - Ops: re-check `fivem.net/server-hosting` + forum announcements monthly (30-day change horizon).
- Long-term: pursue authorized-partner status (no public process; the 2025 cohort was hand-picked).

### CS2 — customer's GSLT, no exceptions
- GSLT required for internet joinability (Valve wiki; enforced since Oct 27 2023). Generated by the **customer** at steamcommunity.com/dev/managegameservers (needs non-limited account + qualifying phone; 1000 tokens/account; idle ≥5 weeks expires).
- Steam ToU: *"Do not distribute game server login tokens to third parties"* → central provisioning is refuted. Ban blast radius: one banned token bans **all** tokens on the account + the phone number; a Steam password reset regenerates every token (fleet-wide outage). Every surveyed host (DatHost, ZAP, Host Havoc, Nodecraft) requires BYO tokens.
- UX: paste-GSLT field; server provisions fine without it but shows "add your token to go public" state.

### Minecraft / Rust
- Minecraft: no license; customer accepts EULA (`eula=true` checkbox at deploy). AUP note: Mojang usage guidelines restrict pay-to-win server monetization (customer responsibility).
- Rust: nothing — anonymous SteamCMD, EAC bundled. AUP note: Facepunch server guidelines ban selling gameplay advantage; 2025 crackdown on unowned-skin plugins.

## 5. Target architecture

```
┌────────────────────────── ahurasense platform (this repo) ──────────────────────────┐
│  dashboard UI ── api/services/game/* ── lib/services/game/* ── lib/pterodactyl/*    │
│  admin UI     ── api/admin/game/*     (hosts, plans, kill-switch, servers)          │
│  billing spine (reserve/settle/close + billing.active_game_servers + cron)          │
└───────────────┬──────────────────────────────────────────────────────────────────────┘
                │ Application API (ptla_, server-side only)
        ┌───────▼────────┐
        │ Pterodactyl    │   1 central panel (existing PTERO_DOMAIN, upgraded 1.14.x)
        │ Panel          │   locations ≈ our regions; nodes ≈ our machines
        └───┬────────┬───┘
   Wings ▲  │        │  ▲ Wings (HTTPS :8443, SFTP :2022, per-node TLS cert)
┌───────────▼──┐  ┌──▼───────────┐
│ machine IN-1 │  │ machine DE-1 │   … N machines per region (Mumbai, London, Frankfurt…)
│ region=india │  │ region=germany   Docker containers per game server, allocations
└──────────────┘  └──────────────┘   = IP:port pool per machine
```

- Platform is the **only** writer through the Application API. Customers optionally get a real panel login (per-customer Pterodactyl user) for console/files/SFTP in Phase 1; embedded console in our dashboard in Phase 2 (Client API websocket: fetch JWT, browser connects `wss://<node-fqdn>:8443/...` directly — this is why every node needs a valid TLS cert).
- Known upstream gaps we design around: panel's auto-deploy ignores CPU (issue #3828) → **we do our own node selection** (house pattern anyway); Client API keys can't be created via Application API → embedded console uses one admin `ptlc_` key server-side, never exposed.

## 6. Data model (new migrations)

### `game_catalog` — the 4 games (admin-extensible)
```sql
id text PK ('minecraft'|'rust'|'cs2'|'fivem'), display_name, description,
egg_id int NOT NULL, nest_id int NOT NULL, docker_image text,
startup_overrides jsonb DEFAULT '{}',
env_schema jsonb NOT NULL,        -- [{key, label, required, secret, customer_editable, default}]
port_plan jsonb NOT NULL,         -- e.g. rust: [{name:'game',proto:'udp'},{name:'rcon'},{name:'query'},{name:'rustplus'}]
credential_field text NULL,       -- 'FIVEM_LICENSE' | 'STEAM_ACC' | NULL
min_memory_mb int, min_disk_gb int,
is_active bool DEFAULT true, sort_order int,
created_at, updated_at
```
RLS: authenticated SELECT, admin write. Seeded with the 4 games (ON CONFLICT DO NOTHING).

### `game_server_plans` — clone of `instance_plans` (compute pattern, NOT gpu markup pattern)
```sql
slug text PK, game_type text FK game_catalog(id), name, tagline,
cpu_pct int NOT NULL,             -- pterodactyl cpu units: 100 = 1 thread
memory_mb int NOT NULL, disk_gb int NOT NULL,
databases int DEFAULT 0, backups int DEFAULT 2, extra_allocations int DEFAULT 0,
hourly_usd numeric(10,5), monthly_usd numeric(10,2),
allowed_regions text[] NULL, allowed_host_ids text[] NULL,
is_active bool, sort_order int, created_at, updated_at, updated_by
```
Runtime reader `lib/pricing/game-plan-catalog.ts` (60s cache + code-seed fallback), admin API `app/api/admin/pricing/game`, admin tab `components/admin/pricing/game-tab.tsx` — all copied from the plans pattern.

### `game_hosts` — machines (clone of `proxmox_hosts` skeleton)
```sql
id text PK, name UNIQUE, region text NOT NULL, display_region text NOT NULL,
ptero_location_id int NOT NULL, ptero_node_id int UNIQUE NOT NULL,
node_fqdn text NOT NULL,
total_cpu_cores int, total_memory_mb int, total_disk_gb int,
memory_overallocate_pct int DEFAULT 0, cpu_oversubscription_ratio int DEFAULT 3,
is_active bool DEFAULT true, maintenance bool DEFAULT false,
notes text, created_at, updated_at
```
Admin-only RLS. Customer region list via `app/api/services/game/host-regions` returning only `{region, display_region, available}` (never node internals).

### `game_servers` — retrofit migration on the existing table
Add: `billing_service_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE` (billing spine is UUID-keyed — the GPU bigint retrofit in `20260615000006` is the cautionary tale), `plan_slug text`, `host_id text FK game_hosts`, `hourly_cost numeric(10,5)`, `billing_start/billing_end timestamptz`, `details jsonb DEFAULT '{}'` (provisioning stage/progress + port map), `env_blob text` (AES-encrypted customer env incl. license key/GSLT — same `Encryption` helper as GPU pods), `ptero_server_id int`, `ptero_uuid uuid`, `suspended_at timestamptz`; widen `status` to `provisioning|installing|running|stopped|suspended|failed|terminated`. Keep owner RLS; add admin SELECT policy; add REPLICA IDENTITY FULL + realtime publication migration. Drop reliance on `ends_at` (hourly metering replaces it). New `game_server_events` table cloned from `gpu_pod_events`.

### Billing migrations (exact checklist from the spine)
1. `billing.active_game_servers` — verbatim shape of `active_compute`/`active_gpu_pods` (+ indexes, trigger, RLS).
2. Allowlist migration (4 statements): `bill_service_cycle_atomic` array += `'active_game_servers'`; `service_lifecycle` CHECK; `notification_outbox` CHECK; `transactions.service_type` CHECK += `'game_server'`.
3. TS: `ServiceType` unions in `config/billing-flow.ts` + `lib/supabase/queries/billing.ts`; `GRACE_SERVICE_TABLES` + `deletion-executor` in `lib/billing/grace/`; `lib/billing/service-label.ts` += `game_server: "Game server"`.
4. `BillingCredits.addActiveGameServer / closeActiveGameServer / rerateActiveGameServer` in `lib/billing/credits.ts`.
5. **Register the table in the credit-system-cron repo** (separate deploy — easy to forget; GPU ran unbilled for weeks because of this).

## 7. Machine & region onboarding (the "highly configurable" part)

Admin flow (`/dashboard/admin/game` — hosts tab), mirroring Proxmox hosts but panel-aware:

1. **Prep machine** (scriptable; ship `scripts/game-node-bootstrap.sh`): install Docker, Wings binary, systemd unit, ACME TLS cert for the node FQDN (required for panel HTTPS + browser websockets), firewall (game port ranges + 8443 + 2022).
2. **Admin "Add machine" form** → server-side sequence via Application API:
   `POST /locations` (if region new) → `POST /nodes` (fqdn, memory+overallocate, disk+overallocate) → `GET /nodes/{id}/configuration` → operator pastes/wget's config or runs `wings configure --panel-url … --token … --node {id}` → `POST /nodes/{id}/allocations` with the machine's IP + port ranges per game mix (e.g. `25565-25700`, `28015-28215`, `27015-27100`, `30120-30320`, `40120-40320`).
3. Row inserted into `game_hosts` with capacity numbers; heartbeat check (node system info endpoint) drives `available` on the region list.
4. **Maintenance mode**: `maintenance=true` excludes the host from selection (panel's own maintenance flag doesn't stop servers — ours only gates *new* placements; use panel server-transfer for drains).

**Node selection at deploy** (our code, not panel auto-deploy): filter `game_hosts` by `region, is_active, !maintenance` → aggregate current usage from `game_servers` grouped by `host_id` → fit check (RAM strict vs `total_memory_mb × (1+overallocate)`, disk strict, CPU via oversubscription ratio — RAM is the hard wall, CPU degrades gracefully) → honor `plan.allowed_host_ids` → sort by headroom → Redis NX lock on the chosen allocation → create.

## 8. Provisioning flow (compute-style async route)

`POST /api/services/game/servers/create`:
1. Auth → kill-switch (`platform_settings: game_deploy_enabled`) → `limitByUser` (5/5min) → idempotency key → per-user cap (10 active).
2. Zod-validate body: `{name, gameType, planSlug, region, env: {...customer fields incl. license key/GSLT}, eulaAccepted}`; validate env against `game_catalog.env_schema`; encrypt secrets into `env_blob`.
3. Node selection (§7) + allocation pick (primary + `port_plan` extras) under Redis lock.
4. `reserveProvision({userId, initialCost: 0, hourlyRate: plan.hourly_usd})` → 402 on insufficient balance.
5. Insert `game_servers` row (`status: provisioning`, `details.provisioning`, `hourly_cost`) → return 202 `{ok, serverId}` immediately; UI subscribes to realtime.
6. `after()`: ensure per-customer Pterodactyl user exists (`ptero_user_id` mapping; create via App API with random password) → `POST /api/application/servers` (egg/nest from catalog, limits from plan — **memory_mb passed as MB, cpu as cpu_pct; no more ×1000 bugs**, allocation ids, env merged: catalog defaults + customer values) → poll install status → stage updates (`allocating 15% → creating 40% → installing 70% → starting 90% → complete`) → update row (`ptero_server_id`, `ptero_uuid`, identifier, real ip:port map into `details.ports`) → `settleProvision(... addActive: BillingCredits.addActiveGameServer)` → email "Server ready" + connection info.
7. Failure at any stage: delete the panel server if created (no orphans), `status: failed`, `releaseProvision`, failure email, `game_server_events` row.

**Day-2 routes:** `GET/PATCH/DELETE /servers/[id]` (rename; delete = panel delete → `closeActiveBilling` prorated → `terminated`), `POST /servers/[id]/power` (start/stop/restart/kill via Client API), `POST /servers/[id]/reinstall`, `PATCH /servers/[id]/env` (update license key/GSLT → restart), `POST /servers/[id]/resize` (PATCH build limits + `rerateActiveGameServer`), `GET /servers/[id]/panel-access` (returns panel URL + triggers password-reset email for their panel user). Grace/auto-delete rides the existing billing grace lifecycle.

## 9. Per-game configuration matrix

| | Minecraft (Java) | Rust | CS2 | FiveM |
|---|---|---|---|---|
| Install | Egg downloads Paper/Purpur/Forge/Fabric jar (no SteamCMD) | SteamCMD app **258550** (anon) | SteamCMD app **730** (anon dl; merged client+server) | FXServer artifacts + **txAdmin** (bundled) |
| Egg | pelican-eggs/minecraft family (paper default; version selector) | **Rust Autowipe** egg (ptero-eggs) — wipe scheduling built in; Oxide/Carbon toggle | ptero-eggs CS2 or **K4ryuu/CS2-Egg** (auto-update on Valve release, VPK-sync to cut per-server disk) | **Luxxy-GF or milkdrinkers auto-updating egg**, `TXADMIN_ENABLED=1` |
| RAM tiers | 2/4/6/8/12/16 GB | 6/8/12/16/24/32 GB (min 6) | 2/3/4 GB (slot-oriented) | 4/8/12/16/24/32 GB |
| CPU | Single-thread bound → high-clock hosts | Heavily single-thread; 5GHz-class | Subtick sim, modest | **#1 single-thread hog**; clock speed is the product |
| Disk | 10–25 GB | 20–50 GB NVMe (mandatory) | **50–80 GB** (≈35-60GB install — the real cost driver) | 30–100 GB (server-data/MLOs) + MySQL |
| Ports (allocations) | 25565/tcp (+rcon 25575 private) | 28015/udp, 28016/tcp rcon, 28017/udp query, 28082/tcp Rust+ → **4** | 27015/udp+tcp, 27020/udp SourceTV → **2** | 30120 tcp+udp, 40120/tcp txAdmin (**never public** — proxy/allowlist) → **2** |
| Credentials | EULA checkbox | — | **Customer GSLT** (`STEAM_ACC`) | **Customer cfx key** (`FIVEM_LICENSE`) |
| Ops hooks | Version/jar switcher; modpack installers (P2) | **Forced wipe first Thursday monthly 19:00 UTC**; BP wipes irregular; autowipe egg + Oxide auto-reinstall | Auto-update mandatory (stale servers reject clients); Metamod+CounterStrikeSharp (SourceMod is dead for CS2) | Artifact channel pinning (recommended vs latest); txAdmin login key surfaced from install log |
| Extras | Optional Spectrum DDoS add-on (TCP ✓) | Consider staging-branch egg later | VPK-sync/overlay mounts to fight disk duplication | Offer managed MySQL (existing database service!) as upsell |

## 10. Plans & pricing (competitor-anchored starting points)

Market norms: Minecraft **$1–4/GB/mo**; Rust **~$2.75–4/GB** (min 6–8GB); CS2 flat **$7–16/mo**; FiveM tiered **$3.50–$30/mo** (SparkedHost) up to **€3.99/GB** (VibeGames). Suggested launch grid (monthly, hourly = monthly/730 into the meter):

- **Minecraft**: 2GB $4 · 4GB $8 · 8GB $15 · 12GB $22 · 16GB $28 (Paper, 2 backups, NVMe)
- **Rust**: 6GB $18 · 8GB $24 · 12GB $34 · 16GB $44 · 24GB $64 (autowipe scheduler, Oxide/Carbon)
- **CS2**: Standard $9 (2GB/60GB) · Competitive $14 (4GB/80GB) — flat, disk is the cost
- **FiveM**: 4GB $12 · 8GB $22 · 12GB $32 · 16GB $44 · 32GB $85 (txAdmin, artifact updater; slots gated by *their* cfx tier, not us)

All bundled: NVMe, DDoS (per-DC), 2 backup slots, SFTP. Paid add-ons later: extra backups, dedicated IP, MySQL (wire to existing database service), subdomain.

## 11. Customer experience

- **Dashboard** (house UI pattern): `game/page.tsx` list (realtime status) → `game/deploy` wizard (Game → Plan → Region → Config/credentials → Review; regions from `host-regions` with availability) → `game/[id]` detail: Overview (connection `ip:port`, copy button, status, events), Console (P2 embedded websocket; P1 = "Open panel" + credentials), Settings (rename, credentials, reinstall, delete), Backups (P2), Activity.
- **Panel access P1**: per-customer Pterodactyl user; "Panel access" card exposes URL + reset-password flow. This gives console/files/SFTP/subusers on day one for free.
- **Backups**: configure Panel `APP_BACKUP_DRIVER=s3` against the existing DO Spaces creds — off-node backups with presigned URLs, productized as plan `backups` slots.
- **Sidebar**: `NavGroup` "Game Servers" (Overview / Deploy / per-game shortcuts later); add to command palette (it's missing today).
- **Marketing**: per-game landing pages replacing the overpromising game-dev page claims; honest feature list.

## 12. DDoS reality check (per region)

- Game traffic is UDP-heavy for 3 of 4 games → **Cloudflare Spectrum is NOT the answer** (UDP = Enterprise-only + per-GB pricing hostile to game traffic). Keep Spectrum as an optional add-on for **Minecraft Java (TCP)** only — the plumbing already exists (`spectrum-functions.ts` supports `udp/…` and `tcp/…` port ranges, but the account plan doesn't).
- Primary mitigation = **choose DCs with included scrubbing**: OVH (VAC, Mumbai/London/Frankfurt available), or colo behind Path.net / Cosmic Guard (the FiveM/Rust host standard; VibeGames' "17Tbit" is Path marketing). Record the protection provider per `game_hosts` row (`notes`).
- Never expose txAdmin (40120) or RCON ports publicly by default.

## 13. API surface (new)

```
app/api/services/game/
  options/            GET   catalog + plans + region availability (like compute/options)
  host-regions/       GET   {region, display_region, available}
  servers/create      POST  §8
  servers/            GET   list (owner)
  servers/[id]        GET/PATCH/DELETE
  servers/[id]/power  POST  start|stop|restart|kill
  servers/[id]/reinstall POST
  servers/[id]/env    PATCH credentials/env update (+restart)
  servers/[id]/resize POST  plan change (P2)
  servers/[id]/panel-access GET
app/api/admin/game/
  hosts/              GET/POST/PUT  (+ onboarding orchestration)
  hosts/[id]/test     POST  node heartbeat/config check
  availability/       GET/POST kill-switch (platform_settings)
  servers/            GET   all servers (admin list/assign page)
app/api/admin/pricing/game/  GET/POST/PUT/DELETE plans
v1 public API + OpenAPI regen: P3.
```
Service logic in `lib/services/game/operations/*` (GPU layering), panel client rebuilt as typed `lib/pterodactyl/client.ts` (retry, error normalization, App + Client API) — keep the axios instance shape so old code compiles until deleted.

## 14. Phased rollout

**Phase 0 — foundation (do first, small):** panel 1.14.1 + Wings 1.13.1 upgrade; rotate `PTERO_API_KEY`; env-ify panel URL; typed panel client.
**Phase 1 — MVP, Minecraft + Rust (no license friction, biggest market):** all §6 migrations + billing wiring + cron registration; game_hosts admin + one machine per launch region (start: India/Mumbai, Germany/Frankfurt, UK/London); plans admin + seeds; create/list/detail/delete/power routes; deploy wizard + list + detail (panel-access model); kill-switch; emails/notifications/audit/events; delete the legacy route + wizard; integration tests (mock panel API).
**Phase 2 — CS2 + FiveM + polish:** credential env UX (GSLT/cfx key, encrypted, validation states); CS2 disk strategy (VPK-sync egg); FiveM txAdmin egg + login-key surfacing; embedded console (websocket); backups (S3 driver + UI); resize; Rust wipe-scheduler UI on the autowipe egg; admin servers page.
**Phase 3 — growth:** subdomains (`play.<name>.yourdomain` via Cloudflare DNS + SRV for Minecraft); Spectrum add-on for Minecraft; MySQL upsell wiring for FiveM; v1 public API + OpenAPI; monitoring (node heartbeats, per-server resource graphs from Wings stats); more regions/games (Valheim egg already referenced, Palworld, ARK).

## 15. Risks & open questions

1. **FiveM regime risk**: Rockstar can designate exclusive providers with 30 days' notice (PLA §5.2). Mitigation: monthly monitoring, revenue mix not FiveM-dominated, pursue partner status.
2. **Panel stewardship**: Pterodactyl's revival is ~6 months old under Infraly (who sell WISP — conflict of interest). Hedge: isolation layer + egg portability to Pelican.
3. **CS2 disk economics**: ~60GB × N servers per node; without VPK-sync/overlay tricks, disk (not RAM) caps CS2 density. Price disk in.
4. **Existing `game_servers` rows**: check prod for live legacy rows before the retrofit migration; if any exist they have no billing linkage — decide grandfathering.
5. **Wings node TLS**: every machine needs a real cert (ACME automation in bootstrap script) or embedded console/websocket won't work from browsers.
6. **India region**: Mumbai is the standard (SparkedHost precedent); verify DDoS-protected transit availability there before promising it.
7. Unverified details flagged by research: exact Bisect Rust tier grid, CS2 "own the game" wording vs F2P practice (test with a fresh account), Rust BP-wipe cadence (community-observed).

## 16. Key sources
Pterodactyl releases/advisories + Infraly transfer (github.com/pterodactyl, discussion #5445) · Pelican releases/FAQ/API routes (pelican.dev, github.com/pelican-dev) · cfx.re: PSA v3 2019, Creator PLA Sept 2023 & **Jan 2026** (static.cfx.re), GSP announcement Mar 2025 (forum.cfx.re), fivem.net/server-hosting · Valve: managegameservers ToU, CS2 Dedicated_Servers wiki, server_guidelines, GSLT-ban FAQ · Facepunch wiki (Rust) · eggs: pelican-eggs org, eggs.pterodactyl.io, 1zc/CS2-Pterodactyl, K4ryuu/CS2-Egg, Luxxy-GF/pterodactyl-fivem · competitors: vibegames.com, sparkedhost.com, bisecthosting.com, shockbyte, zap-hosting docs · DDoS: developers.cloudflare.com/spectrum, tcpshield.com, cosmicguard.com, path.net reseller pages.
