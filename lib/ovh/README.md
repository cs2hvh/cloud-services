# OVH integration

Automates OVH dedicated-server operations from the admin panel.
Today this covers **vMAC sync** — auto-creating OVH virtual MAC
addresses for failover IPs on each Proxmox host.

## Environment variables

Add the following to your `.env` (or wherever the Next.js server
reads its environment):

```
# OVH datacenter region — one of: ovh-eu, ovh-ca, ovh-us
# Most India + EU customers use ovh-eu.
OVH_API_ENDPOINT=ovh-eu

# Application credentials — generated at:
#   https://api.ovh.com/createToken/
# Application Key / Application Secret are stable; you generate
# them once per app.
OVH_APP_KEY=<your application key>
OVH_APP_SECRET=<your application secret>

# Consumer Key — generated per OVH account by validating in browser.
OVH_CONSUMER_KEY=<your consumer key>
```

## How to generate credentials

1. Go to https://api.ovh.com/createToken/
2. Log in with the OVH account that owns the dedicated servers.
3. Set the **Validity** to "Unlimited" (or your preferred horizon).
4. Add **rights** — paste these into the form:
   ```
   GET    /dedicated/server
   GET    /dedicated/server/*
   GET    /dedicated/server/*/ips
   GET    /dedicated/server/*/virtualMac
   GET    /dedicated/server/*/virtualMac/*
   GET    /dedicated/server/*/virtualMac/*/virtualAddress
   POST   /dedicated/server/*/virtualMac
   POST   /dedicated/server/*/virtualMac/*/virtualAddress
   DELETE /dedicated/server/*/virtualMac/*
   DELETE /dedicated/server/*/virtualMac/*/virtualAddress/*
   GET    /dedicated/server/*/task
   GET    /dedicated/server/*/task/*
   ```
5. Submit. OVH returns:
   - **Application Key** → `OVH_APP_KEY`
   - **Application Secret** → `OVH_APP_SECRET`
   - **Consumer Key** → `OVH_CONSUMER_KEY`

If you're only managing one OVH account, these three values cover
every dedicated server on that account — no per-host config.

## How it's used in the app

When an admin opens a Proxmox host in
`/dashboard/admin/hosts`, the expanded card shows an **OVH
integration** sub-panel (only when `provider = 'ovh'`):

- Reports how many failover IPs exist on the OVH server, how many
  already have a vMAC, how many vMAC slots remain (cap is 32 per
  server, OVH-enforced), and how many failover IPs are still unbound.
- **"Sync up to N vMACs"** button creates vMACs sequentially via:
  - `POST /dedicated/server/{serviceName}/virtualMac`
  - then polls `GET /dedicated/server/{serviceName}/task/{taskId}`
  - then resolves the new MAC by diffing `listVirtualMacs()`
  - then inserts a row into `public_ip_pools` + `public_ip_pool_ips`
- Default batch size is 10 vMACs per click (each takes 30-90s).
  Click again for more.

The OVH service name is derived from the host's `host_url`
(e.g. `https://ns5028607.ip-148-113-49.net:8006` →
`ns5028607.ip-148-113-49.net`). No new DB column needed.

## Files

| Path | What it does |
|---|---|
| `lib/ovh/client.ts` | Signed HTTP client, clock-skew sync, env reader |
| `lib/ovh/dedicated-server.ts` | Typed wrappers for the dedicated-server endpoints + `buildVmacReport` |
| `app/api/admin/proxmox/hosts/[id]/sync-vmacs/route.ts` | GET (preview state) + POST (run sync) |
| `components/admin/proxmox/ovh-vmac-sync-panel.tsx` | Admin UI panel rendered inside hosts-manager |

## Adding a new OVH dedicated server

1. Add the host in **Admin → Hosts** with `provider = ovh`,
   `server_series` set to its OVH tier (HG Scale / Advance / etc.),
   and `host_url` pointing to its Proxmox web UI.
2. Order failover IPs on that server in the OVH UI (or via API).
3. Open the host card, scroll to **OVH integration** sub-panel,
   click **"Sync up to N vMACs"**. The pool fills automatically.
4. Once the pool has rows, users can create VMs that consume them
   via the standard /dashboard/services/compute/vps/new flow.

## Limits

- **32 vMACs per OVH dedicated server** (OVH enforces).
- ~30-90s per vMAC creation (OVH task processing).
- OVH API rate limit is ~600 req/min per account — we stay well
  below by running sequentially.
