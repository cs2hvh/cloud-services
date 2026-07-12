> **LEGACY** — this describes the dormant Proxmox/OVH backend. The compute service now resells Linode; see [LINODE_COMPUTE.md](./LINODE_COMPUTE.md).

# Compute / Virtual Servers (VPS) — Service Guide

> Internal engineering documentation. This service is customer‑facing, but the
> doc is not — it may name upstream providers (Proxmox, OVH). **Never** surface
> those names in dashboard UI, toasts, errors, or emails (see
> [Brand‑scrub](#13-security--multi-tenancy)).

---

## 1. What this service is

The **Compute** service lets a customer launch and manage Linux/Windows
**virtual machines (VPS)**. Under the hood we provision KVM guests on our own
**Proxmox VE** hypervisors and attach **public IPs supplied via OVH**
(failover IPs, vMACs, vRack, or routed BYOIP blocks). The customer only ever
sees regions, OS images, plans, and their server — never the hypervisor, the
provider, or any host identifier.

Capabilities exposed to the customer:

- Create a VM (pick region → OS → plan → hostname → password).
- Power control (start / stop / reboot).
- Web VNC console.
- Live metrics (CPU, memory, network, disk I/O).
- **Resize** to a different plan (power‑off required; disk can only grow).
- Rename, delete.
- Per‑hour metered billing with a 7‑day non‑payment grace period.

---

## 2. High‑level architecture

```
                         ┌────────────────────────────────────────────┐
   Customer (dashboard)  │  Next.js App (App Router, custom server.ts) │
        │                │                                            │
        │  HTTPS         │   app/dashboard/services/compute/…  (UI)   │
        ▼                │   app/api/services/compute/…       (API)   │
  ┌───────────┐          └───────────────┬───────────────┬───────────┘
  │  Browser  │                          │               │
  └───────────┘                          │ Supabase JS   │ server‑side
        ▲  realtime (servers table)      ▼ (RLS)         ▼ service role
        │                         ┌──────────────┐  ┌──────────────────┐
        └─────────────────────────│  Supabase    │  │  Redis (locks +  │
                                  │  Postgres    │  │  idempotency +   │
                                  │  (RLS)       │  │  rate limits)    │
                                  └──────┬───────┘  └──────────────────┘
                                         │
            ┌────────────────────────────┼─────────────────────────────┐
            │                            │                              │
            ▼ Proxmox REST (ticket auth) ▼ SSH (snippets, host routes)  ▼ OVH API
   ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
   │  Proxmox host A   │   …     │  Proxmox host N   │         │  OVH (failover    │
   │  (KVM guests)     │         │                  │         │  IP / vMAC / vRack)│
   └──────────────────┘         └──────────────────┘         └──────────────────┘

   Background: credit-system-cron/cron-worker.js  (every ~5 min)
              → meters billing.active_compute, enforces grace → auto‑delete
```

**Control plane** = Next.js API routes + Supabase. **Data plane** = Proxmox
hosts running the actual VMs. **Source of truth** for state is the Postgres
`servers` table; Proxmox is reconciled to it.

---

## 3. Tech stack

| Layer | Technology |
|---|---|
| App | Next.js 15 (App Router) on a custom `server.ts` Node server |
| DB | Supabase Postgres (schemas: `public`, `billing`), RLS everywhere |
| Realtime | Supabase realtime on `public.servers` |
| Cache / coordination | Redis (IP locks, idempotency keys, per‑user rate limits) |
| Hypervisor | Proxmox VE REST API (`/api2/json/...`) + SSH for snippets/routes |
| Networking | OVH (failover IP, vMAC, vRack, routed BYOIP) |
| Console | Proxmox VNC proxy → signed token → `/ws/vnc` → noVNC in browser |
| Billing | In‑house credit ledger + 5‑minute metered cron + grace lifecycle |

---

## 4. Data model

All tables live in `public` unless noted. Core schema:
`supabase/migrations/20251115073910_add_proxmox_tables.sql`, extended by
`20260521000000_add_instance_tier_and_plan.sql`,
`20260601_add_host_capacity_and_region.sql`,
`20260615000002_compute_billing.sql`.

### `public.servers` — the VM record (source of truth)
| Column | Notes |
|---|---|
| `id` | bigserial PK (internal) |
| `vmid` | Proxmox VM id (set after clone) |
| `node` | Proxmox node name |
| `name` | hostname (customer‑editable) |
| `ip` | `inet`, unique — assigned public IP |
| `os` | OS display name, e.g. `Ubuntu 24.04 LTS` |
| `location` | FK → `proxmox_hosts.id` (which host) |
| `cpu_cores`, `memory_mb`, `disk_gb` | allocation (CHECK: ≥1 / ≥512 / ≥10) |
| `tier` | `shared` \| `dedicated` |
| `plan_slug` | FK‑ish → `instance_plans.slug` (denormalized) |
| `status` | `provisioning` \| `running` \| `stopped` \| `suspended` \| `failed` \| `error` |
| `owner_id` | FK → `auth.users` |
| `owner_email` | denormalized for emails |
| `hourly_cost` | current $/hr (advertised plan price for plan VMs) |
| `billing_start`, `billing_end` | lifecycle stamps |
| **`billing_service_id`** | **UUID, unique** — the billing key (see note) |
| `details` | JSONB — provisioning progress + network plan |
| `created_at`, `updated_at` | |

> **Why `billing_service_id`:** the metered cron RPC (`bill_service_cycle_atomic`)
> is keyed on a **UUID**, but `servers.id` is bigint. So we added a stable UUID
> billing key; `billing.active_compute.service_id` references it. (Added in
> `20260615000002`.) RLS: owner can select/update/delete own; admins see all.
> Realtime is enabled (`20260323000001`).

### `public.proxmox_hosts` — hypervisors (admin‑only, secrets live here)
Key columns: `id` (text PK), `name`, `host_url`, `allow_insecure_tls`,
`username`/`password` (primary auth — ticket), `token_id`/`token_secret`
(API‑token auth, fallback), `node`, `storage`, `bridge` (default `vmbr0`),
`gateway_ip`, `dns_primary`/`dns_secondary`, `template_vmid`,
`region`/`display_region`, `total_cpu_cores`/`total_memory_mb`/`total_disk_gb`
(capacity), `shared_oversubscription_ratio` (default 4), `provider` (e.g. `ovh`),
`server_series`, **`network_mode`** (see §6), `vm_private_cidr` /
`vm_private_gateway` / `vm_private_ip_start` (routed modes),
`public_prefix_length` (`/32` failover, `/24` vRack), `snippet_storage`,
`is_active`.

> **RLS: admin‑only.** Customers never read this table directly. Tokens,
> passwords, gateways, and URLs never leave the server.

### `public.proxmox_host_regions` — safe public view
`security_invoker = false` view exposing only `id, name, region, display_region`
from `proxmox_hosts`. Granted to `authenticated`/`anon`
(`20260612000000_add_proxmox_host_regions_view.sql`).
**Note:** the VPS list page resolves region server‑side via
`/api/services/compute/host-regions` instead of reading this view directly
(more reliable than depending on the view being applied + PostgREST seeing it).

### `public.proxmox_templates` — OS images per host
`id`, `host_id` (FK), `vmid` (template VM to clone), `name`, `os_type`,
`os_display_name` (canonical UI name), `is_active`. Unique `(host_id, vmid)`.

### `public.public_ip_pools` + `public.public_ip_pool_ips` — IP inventory
- `public_ip_pools`: `id`, `host_id`, `mac` (nullable for routed BYOIP awaiting
  on‑demand vMAC), `label`, `is_active`.
- `public_ip_pool_ips`: `id`, `pool_id` (FK), `ip` (the assignable address).

At create time we pick a free IP (one not in any active `servers.ip`) from a
host's pools and lock it in Redis while reserving.

### `public.instance_plans` — the plan catalog (source of truth for pricing)
`slug` PK (`s-1`…`s-7`, `d-2`…`d-32`, `a-1`…), `name`, `tier`, `vcpu`,
`memory_mb`, `disk_gb`, `hourly_usd`, `monthly_usd`, `tagline`, `is_active`,
`sort_order`, plus optional whitelists `allowed_regions` / `allowed_host_ids`.
Seeded from `lib/pricing/instance-plans.ts`; **the DB is authoritative at
runtime** (read via `lib/pricing/plan-catalog.ts`, ~60s cache). Admins edit it
in `/admin/pricing/plans`.

### `billing.active_compute` — the metering row
`id` (uuid PK), `user_id` (FK), **`service_id`** (uuid, unique = a server's
`billing_service_id`), `hourly_rate` (numeric), `status`
(`active`/`paused`/`grace`/`terminated`), `last_billed_at`, timestamps. One row
per actively‑billed VM. RLS: owner selects own; service role (cron) manages all.

---

## 5. Provisioning flow (create)

`POST /api/services/compute/vms/create` — see
`app/api/services/compute/vms/create/route.ts`.

The request returns **immediately** with `status: provisioning`; the heavy work
runs in a Next.js `after()` block and the dashboard tracks progress live via
realtime on `servers.details.provisioning`.

**Synchronous (before responding):**
1. **Auth** — session required.
2. **Rate limit + quota** — per‑user Redis rate limit; hard cap
   `MAX_VMS_PER_USER = 25`.
3. **Idempotency** — `Idempotency-Key` header; replays the prior result, blocks
   in‑flight duplicates.
4. **Validate** — region required; resolve specs from `planSlug` (preferred) or
   free‑form `cpuCores/memoryMB/diskGB`; OS minimums (Windows ≥2 GB / ≥40 GB,
   Desktop ≥25 GB); password ≥12 chars (RDP needs complexity).
5. **Host selection** — list active hosts in region, compute remaining capacity
   per host **tier‑aware** (dedicated reserves cores 1:1; shared uses the
   oversubscription pool), score, and pick the best that has the OS template +
   a free IP + capacity.
6. **IP allocation** — pick a free IP and lock it with Redis `SET … NX EX 300`
   (prevents two creates grabbing the same IP).
7. **On‑demand vMAC** — for `ovh_failover_vmac` hosts where the IP has no bound
   MAC, mint one via OVH (`lib/proxmox/on-demand-vmac.ts`).
8. **Balance check** — require ≥1 hour of credit at the computed rate
   (`BillingCredits.hasSufficientBalance`).
9. **Storage pick** — `lib/proxmox/storage-picker.ts` chooses the host storage
   with the most free space that fits the disk.
10. **Reserve** — insert the `servers` row (`status=provisioning`), returning
    `id` + `billing_service_id`. Release the IP Redis lock (now tracked in DB).
11. **Respond** `202`‑style with server summary + connection preview.

**Background (`after()`):** clone template → configure CPU/RAM/NIC/cloud‑init
(user + password) → drop inherited CD‑ROM → grow disk → regenerate cloud‑init
ISO → add host route (routed modes) → start → verify running → set
`status=running` → **register the billing meter** via `postProvisionBilling`
(`initialCost=0`, hourly metered). On any failure: mark `status=failed` with a
message; the live VM is never torn down on a billing hiccup.

---

## 6. Network modes

Set per host (`proxmox_hosts.network_mode`). Built by
`lib/proxmox-network.ts` (`buildVmNetworkPlan`).

| Mode | What it does | MAC | Host route | Public prefix |
|---|---|---|---|---|
| `legacy_public_gateway` | Single public IP on the VM NIC via `ipconfig0`, host's `gateway_ip`. Default / generic non‑OVH. | required | yes | `/32` |
| `ovh_failover_vmac` | Public IP + an OVH **vMAC**; minted on demand if absent. | required (auto) | yes | `/32` |
| `ovh_hg_scale_routed` | **Routed BYOIP**: private RFC1918 subnet (`vm_private_cidr`) + routed public IP. Netplan/vendor snippet written via SSH; per‑VM private IP derived from the reservation id. Linux only. | not required | yes | varies |
| `ovh_advance_gen3_routed` | Same routed‑private model as above, newer OVH gen. | not required | yes | varies |
| `ovh_vrack_block` | Private block in OVH **vRack**; `/24` public prefix, routing handled upstream. | required | **no** | `/24` |

Supporting libs: `lib/proxmox/on-demand-vmac.ts` (OVH vMAC mint/diff/persist),
`lib/proxmox/storage-picker.ts` (best‑fit storage). Cloud‑init snippets are
written to the host's `snippet_storage` via SSH and referenced through
`cicustom`; host routes (`/32` + proxy‑arp + ip_forward) are added/removed over
SSH on create/delete.

---

## 7. Proxmox integration (`lib/proxmox-utils.ts`)

Auth prefers **username/password ticket** (`proxmoxAuth` → PVE ticket + CSRF)
because API tokens often lack VM.Clone and other mutating perms; API token is a
fallback. `getDispatcher(allowInsecureTls)` builds an undici agent that tolerates
self‑signed certs.

Key helpers: `fetchJson` / `postForm` (REST), `waitTask` (poll a Proxmox task to
completion), `listVMs`, `getNextVMID`, `cloneTemplate`, `configureVM`,
`startVM` / `stopVM` (graceful shutdown) / `rebootVM`, `deleteVM`,
`getVMStatus`, `getVMConfig`, `findVMBootDisk` (locate the OS disk, skip
cdrom/cloudinit, parse size), **`resizeDisk`** (PUT `/resize`, **grow‑only**),
`getVMRRDData` (metrics), `createVNCProxy` (console). SSH helpers:
`writeCloudInitSnippet`, `addHostRoute`, `removeHostRoute`.

---

## 8. Pricing & billing

### Pricing basis
- **Plan‑based VMs (normal path): bill the plan's advertised price**
  (`instance_plans.hourly_usd`). This is what the customer sees and agrees to.
- **Free‑form custom‑spec VMs** (legacy path, no `planSlug`): the spec formula
  in `lib/pricing.ts` (`base 0.005 + 0.02/vCPU + 0.01/GB RAM + 0.0005/GB disk`,
  × region multiplier).

> **History:** create previously billed the spec formula even for plan VMs
> (~4× the advertised price for small plans). Fixed in commit `5cebdf7b`;
> migration `20260615000003` re‑rated existing meters, corrected stored
> `hourly_cost`, and **backfilled** meters for servers that predated the
> metering rollout (they had no `active_compute` row and were unbilled).

### Lifecycle of a charge
`config/billing-flow.ts` orchestrates; `lib/billing/credits.ts` holds the
primitives.

1. **Create** → `postProvisionBilling({ initialCost: 0, hourlyRate, serviceType:
   "compute", addActive: BillingCredits.addActiveCompute })` inserts the
   `active_compute` meter.
2. **Metering** → `credit-system-cron/cron-worker.js` runs ~every 5 min,
   iterates `active_compute`, charges `hourly_rate × hoursElapsed` (continuous,
   capped at `MAX_HOURS_PER_BILLING = 24`), advances `last_billed_at` to now via
   the atomic `bill_service_cycle_atomic` RPC, and writes a ledger entry.
3. **Insufficient credit** → the row enters **grace** (default 7 days,
   `lib/billing/grace/`); the customer can top up to recover.
4. **Grace expiry** → `executeGraceDeletion` resolves the server by
   `billing_service_id` and calls `destroyServer` → the VM is auto‑deleted
   (consistent with Database/Kubernetes).
5. **Delete** → `closeActiveBilling` → `closeActiveCompute` prorates the final
   partial hour, deletes the meter row.
6. **Resize** → `rerateActiveCompute` sets the new `hourly_rate` and advances
   `last_billed_at` (new rate applies from the resize moment; the sub‑interval
   sliver is immaterial).

---

## 9. Lifecycle operations

| Action | Entry point | Notes |
|---|---|---|
| Create | `POST vms/create` | §5; async `after()` provisioning |
| Start/Stop/Reboot | `POST vms/power` | graceful shutdown; DB status updated optimistically |
| Console | `POST vms/[id]/console` | signed short‑lived VNC token → `/ws/vnc` |
| Metrics | `GET vms/[id]/metrics` | Proxmox `status/current` + RRD, sanitized |
| Rename | `PATCH vms/[id]` | 1–63 chars, alnum + hyphen |
| **Resize** | `GET`/`POST vms/[id]/resize` | see below |
| Delete | `DELETE vms/[id]` | `destroyServer()` |
| Auto‑delete | grace cron | after 7‑day non‑payment |

### Delete teardown — `lib/services/compute/server-lifecycle.ts`
`destroyServer(serverId)` is shared by the user delete route **and** the grace
executor: best‑effort Proxmox stop + `deleteVM` + route/vMAC release, then
`closeActiveBilling` (prorate + remove meter), then mark destroyed + delete the
row.

### Resize — `app/api/services/compute/vms/[id]/resize/route.ts`
Linode‑style plan change, **in place** (the VM cannot migrate hosts).
- **Power‑off required.** `POST` rejects `running`/`suspended`; the UI shows a
  "Power off to resize" prompt with a Power‑off button, and the plan list
  appears once the server is `stopped`.
- **Capacity‑checked on the current host** via
  `lib/services/compute/resize.ts` (`getHostAvailabilityExcludingServer` +
  `planFitsResize`) — the target plan's full vCPU/RAM/disk must fit in
  (host total − every *other* VM).
- **Disk can only grow** (Proxmox limitation) → target `disk_gb ≥ current`.
  Linux guests auto‑expand the filesystem on next boot (cloud‑init growpart);
  Windows needs a manual volume extend.
- **Flow (`after()`):** grow disk if larger → `configureVM` cores/memory →
  persist new specs (server **stays stopped**) → `rerateActiveCompute`. UI is
  rolled back to `stopped` with a failure message if anything throws.
- `GET` returns the current plan + every active plan annotated with `fits` /
  `reason`, grouped by tier in the UI.

---

## 10. API reference

All under `app/api/services/compute/`. Every route requires an authenticated
session and (except `options`/`host-regions`) verifies `owner_id`.

| Route | Methods | Purpose | Rate limit |
|---|---|---|---|
| `vms/create` | POST | provision a VM | per‑user + quota 25 |
| `vms/[id]` | GET / PATCH / DELETE | fetch / rename / destroy | rename 10/min, delete 10/hr |
| `vms/power` | POST | start / stop / reboot | 20/min |
| `vms/[id]/console` | POST | VNC session (signed token) | 10/min |
| `vms/[id]/metrics` | GET | live + RRD metrics | 30/min |
| `vms/[id]/resize` | GET / POST | eligible plans / perform resize | resize 5/hr |
| `options` | GET | regions, OS, plans, per‑region availability | 60/min |
| `host-regions` | GET | host id → region map (for list flags) | — |

Admin (operators) under `app/api/admin/proxmox/`: host CRUD + connection test +
vMAC import/sync; `/admin/pricing/plans` for the plan catalog.

---

## 11. Frontend

### List — `app/dashboard/services/compute/vps/page.tsx`
Hero + stat strip + status filter chips + search + table (server name with OS
icon, region with country flag, status, IP, plan, 3‑dot action menu). Subscribes
to `servers` realtime for live status/provisioning. Region flags resolve via the
`host-regions` API + `flagcdn`.

### Detail — `app/dashboard/services/compute/vps/[id]/page.tsx`
Header (OS icon avatar, status, region, IP, uptime) + a live stats row, then
pill tabs (`_components/`):
- **Overview** — quick access (SSH/RDP), instance profile (a **Resize** button
  jumps to Settings), machine metadata, billing summary.
- **Monitoring** — CPU/mem/network/disk charts (`hooks/use-vm-metrics`).
- **Console** — noVNC viewer.
- **Networking** — IP/gateway/DNS/mode.
- **Settings** — server details, hostname rename, **Resize** section, danger‑zone
  destroy (type‑to‑confirm).

### Create — `components/dashboard/compute/vps/`
`vps/new/page.tsx` → `form-loader.tsx` (loads `/options`) → **`simple.tsx`** (the
live single‑page editorial form: Image → Region → Plan → hostname → password,
numbered sections with status pills, sticky summary, gradient Deploy CTA).
`deployment-progress.tsx` shows live provisioning. OS icons resolve through the
shared `os-icons.tsx` (`OsImg`: brand PNG from `public/os/` where available,
monochrome glyph fallback).

### Design tokens (shared across compute UI)
- Accent brand blue `#0095FF` (bright `#33adff`, dim `rgba(0,149,255,0.08)`).
- Surfaces `#08090b` / `#111216`, hairline borders `rgba(255,255,255,0.06)`.
- Headings use Nunito (`--font-nunito`); labels/mono use Geist Mono.
- Status: running green `#4ade80`, provisioning = accent, stopped grey,
  suspended amber, failed red. Dark theme, aurora‑glow + dotted‑grid canvas.

---

## 12. Admin / operations

Operators manage infrastructure under `/admin` (routes in
`app/api/admin/proxmox/`):

1. **Add a Proxmox host** — name, `host_url`, credentials, node, storage,
   bridge, gateway/DNS, `region`/`display_region`, `provider`, `network_mode`,
   routed CIDR fields, capacity, `is_active`. Connection is tested; capacity +
   templates can be probed.
2. **Templates** — cloud‑init‑enabled VM templates per host (Ubuntu/Debian/
   CentOS/Windows…); stored as `proxmox_templates` and surfaced by
   `os_display_name`.
3. **IP pools** — add `public_ip_pools` (+ `public_ip_pool_ips`). For OVH BYOIP,
   import/sync vMACs from OVH.
4. **Plans** — edit `instance_plans` at `/admin/pricing/plans` (specs, price,
   active state, region/host whitelists).

Template prep reference: `docs/WINDOWS_SERVER_2025_TEMPLATE_SETUP.md`.

---

## 13. Security & multi‑tenancy

- **Auth + ownership:** every VM route checks the session and `owner_id ===
  user.id` (404/403 otherwise). RLS on `servers` enforces the same at the DB.
- **Admin tables:** `proxmox_hosts` (credentials, gateways, URLs) is admin‑only
  RLS; customer surfaces never read it.
- **Rate limits:** per‑user Redis limits on every mutating route (see §10).
- **IP allocation:** Redis `NX` lock + unique `servers.ip` + idempotency =
  no double‑assignment race.
- **VNC console:** Proxmox VNC ticket wrapped in a **signed, short‑lived,
  user‑bound token**; proxied through `/ws/vnc` — the Proxmox host is never
  exposed to the browser.
- **Brand‑scrub:** customer‑facing strings must never mention Proxmox/OVH/etc.
  Server code, internal logs, and schema may. Error text shown to customers is
  sanitized.
- **Cross‑tenant isolation (verified):** a customer cannot see another's
  password or tamper with another's VM. The VNC/SSH password (`cipassword`) is
  **never stored in our DB** and **never returned by any API** — it flows only
  request → Proxmox.

### Accepted‑for‑v1 / known limitations
- **`cipassword` plaintext at the Proxmox layer.** The user‑chosen password is
  written into cloud‑init metadata + the cloud‑init ISO on host storage —
  readable by anyone with infra/Proxmox access (insider only, **not**
  cross‑tenant). Accepted for v1. Fast‑follow: SSH‑key‑primary auth + a password
  rotation endpoint.
- **Proxmox helper duplication.** Control‑plane routes use `lib/proxmox-utils`,
  but `vms/create` and `admin/proxmox/vms/create` still carry inline
  `proxmoxAuth`. De‑dupe post‑v1 (risky to refactor the provisioning critical
  path right before launch).
- **Resize is single‑host** (no live migration) and **disk grow‑only**.
- **Snapshot‑from‑server is disabled** for v1 (503 stub; URL‑import custom images
  are live — see §14).

---

## 14. Custom OS images

Customers can bring their own OS image. **URL import is live; snapshot‑from‑
server is built but currently disabled** (503 stub — re‑enable from git
`67cdef63`).

**Model.** A custom image is just an *owner‑scoped `proxmox_templates` row*, so
the normal clone + host‑selection + cloud‑init networking path works unchanged.
Tables: `public.custom_images` (catalog — name, `source_type` url|snapshot,
`source_ref`, `os_family`, `default_user`, `size_gb`, `cloud_init`, `status`,
`billing_service_id`), `proxmox_templates.owner_id` + `custom_image_id`
(NULL owner = public/built‑in), `billing.active_custom_image` (storage meter).
Owner‑scoping: the `options` + `create` queries filter built‑in templates to
`owner_id IS NULL`; a customer only ever sees their own custom images.

**URL import (active).** `POST /api/services/compute/images` with an `https` URL
to a cloud qcow2/raw — validated (public‑only / SSRF‑screened, quota 25,
dup‑name, 100 GB cap), recorded `available` immediately. **The image is never
staged in our storage** — the Proxmox host downloads it directly from the
customer URL at first deploy.

**Lazy per‑host build.** Replication is lazy: `ensureCustomTemplateOnHost`
(`lib/services/compute/custom-images.ts`) builds the template the first time a
customer deploys the image to a host's region — `buildCustomImageTemplate`
(`lib/proxmox-utils.ts`) SSH‑downloads → `qm create` → `qm importdisk` →
attaches a cloud‑init drive + guest agent + serial → `qm template` → registers
the row (behind a Redis lock; later deploys are instant). Available across all
regions/hosts. Networking auto‑applies via the existing per‑mode cloud‑init path,
so images must be **cloud‑init + guest‑agent enabled** (declared on import;
non‑conforming images deploy but won't auto‑network).

**Deploy UX.** A customer's available images appear in the deploy OS picker
(via the `options` route) alongside built‑in OSes, plus a **"Custom image…"**
CTA that links to the management page. Management page:
`/dashboard/services/compute/images` (list / import‑by‑URL / delete), reachable
from the **Images** link in the VPS list hero.

**Billing.** Stored images bill **$0.05/GB‑month** (`CUSTOM_IMAGE_USD_PER_GB_MONTH`),
metered hourly via the same cron + grace as everything else
(`active_custom_image`). The meter starts when the image first *materializes on a
host* (size measured) and is billed **once per image** regardless of how many
hosts it replicates to — so an imported‑but‑never‑deployed URL image (zero host
storage) is free. Delete removes the per‑host template VMs + meter; servers
already cloned from it are unaffected.

**Snapshot (disabled).** `POST vms/[id]/snapshot-image`, a "Create image"
Settings section, and R2 staging (`lib/services/compute/image-storage.ts`,
`exportVmDiskToUrl` using `pvesm path` + `qemu-img convert` + a presigned PUT)
are implemented but turned off (503). Re‑enable: restore the route from
`67cdef63`, re‑add `VpsSnapshotSection` to the Settings tab, and ensure the R2
bucket (`R2_CUSTOM_IMAGES_BUCKET` / `ahura-custom-images`) exists. The export
produces a **sparse qcow2 ≈ used space** (not the provisioned size). Open
hardening before re‑enable: host free‑space pre‑check, optional `-c` compression,
size cap.

---

## 15. Key files

| Path | Purpose |
|---|---|
| `app/api/services/compute/vms/create/route.ts` | provisioning orchestrator |
| `app/api/services/compute/vms/[id]/route.ts` | get / rename / delete |
| `app/api/services/compute/vms/power/route.ts` | start / stop / reboot |
| `app/api/services/compute/vms/[id]/console/route.ts` | VNC session |
| `app/api/services/compute/vms/[id]/metrics/route.ts` | metrics |
| `app/api/services/compute/vms/[id]/resize/route.ts` | resize |
| `app/api/services/compute/options/route.ts` | regions/OS/plans/availability |
| `app/api/services/compute/host-regions/route.ts` | host→region map |
| `lib/proxmox-utils.ts` | Proxmox REST/SSH client |
| `lib/proxmox-network.ts` | network‑mode plan builder |
| `lib/proxmox/on-demand-vmac.ts` | OVH vMAC mint |
| `lib/proxmox/storage-picker.ts` | best‑fit storage |
| `lib/services/compute/server-lifecycle.ts` | `destroyServer` teardown |
| `lib/services/compute/resize.ts` | host‑capacity + plan‑fit for resize |
| `lib/services/compute/custom-images.ts` | custom‑image catalog + lazy build + delete |
| `lib/services/compute/image-storage.ts` | R2 staging for snapshots (disabled) |
| `app/api/services/compute/images/**` | custom image list / import / delete |
| `app/dashboard/services/compute/images/page.tsx` | custom images UI |
| `lib/pricing.ts` | spec‑formula pricing (free‑form path) |
| `lib/pricing/plan-catalog.ts` / `instance-plans.ts` | plan catalog (DB + seed) |
| `config/billing-flow.ts` | post‑provision / close / ensure‑balance |
| `lib/billing/credits.ts` | balance + `active_compute` helpers |
| `credit-system-cron/cron-worker.js` | 5‑min metered billing cron |
| `lib/billing/grace/*` | non‑payment grace → auto‑delete |
| `app/dashboard/services/compute/vps/page.tsx` | list UI |
| `app/dashboard/services/compute/vps/[id]/**` | detail UI (tabs) |
| `components/dashboard/compute/vps/**` | create form + shared UI |

## 16. Relevant migrations
- `20251115073910_add_proxmox_tables.sql` — core schema.
- `20260323000001_enable_servers_realtime.sql` — realtime on `servers`.
- `20260521000000_add_instance_tier_and_plan.sql` — `instance_plans` + tier/plan.
- `20260601_add_host_capacity_and_region.sql` — host capacity + region columns.
- `20260612000000_add_proxmox_host_regions_view.sql` — safe region view.
- `20260615000002_compute_billing.sql` — `billing_service_id` + `active_compute`.
- `20260615000003_fix_compute_meter_rates.sql` — re‑rate + backfill existing meters.
- `20260615000004_custom_images.sql` — custom‑image catalog + template owner/link
  columns + `active_custom_image` storage meter.

---

_Last updated: 2026‑05‑29._
