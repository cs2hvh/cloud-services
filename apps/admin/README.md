# AhuraSense Admin Panel

A standalone Next.js app for the admin panel, meant to be deployed on its own
subdomain (e.g. `control.ahurasense.com`) separately from the customer-facing
app. It lives in the same repo and imports the shared code directly — there is
no duplicated business logic.

## Why separate

- **Blast radius**: admin endpoints (hypervisor management, user management,
  pricing) are no longer served from the customer-facing origin. The whole app
  denies by default via [middleware.ts](middleware.ts) — every request must
  come from an authenticated admin (`ADMIN_EMAILS` env, or the `admin` role in
  `user_profiles`), unlike the main app where each page/route checks
  individually.
- **Deploy decoupling**: admin changes ship without redeploying the customer
  site, and vice versa.
- **Extra fencing**: because it is its own origin, it can additionally sit
  behind Cloudflare Access / an IP allowlist without touching the main app.

## How it shares code

- `@/*` resolves to the **repo root** (see [tsconfig.json](tsconfig.json)), so
  shared imports like `@/lib/supabase/server` and
  `@/components/admin/users/admin-users` work unchanged.
- `@admin/*` resolves to `apps/admin/*` for this app's own files.
- `experimental.externalDir` in [next.config.ts](next.config.ts) lets the
  build reach outside `apps/admin`.
- [app/globals.css](app/globals.css) imports the main app's stylesheet, so
  shared components render identically.
- API routes under `app/api/admin/**` re-export the canonical handlers from
  the main app (`export { GET } from "@/app/api/admin/..."`), keeping a single
  implementation during the migration.

## Running

From the **repo root**:

- `npm run admin:dev` — dev server on port 3001
- `npm run admin:build` — production build (standalone output)
- `npm run admin:start` — serve the production build on port 3001

Env comes from the repo root `.env` / `.env.local` (loaded in
`next.config.ts`). Required: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
plus whatever the migrated sections' shared services need. Optional:
`ADMIN_EMAILS` (comma-separated allowlist; when set it overrides the
role-based check), `NEXT_PUBLIC_MAIN_APP_URL` (where unmigrated sections
link to; defaults to https://ahurasense.com).

## Migrating a section (playbook)

Sections are listed in [lib/sections.ts](lib/sections.ts); unmigrated ones
link to the main app's `/dashboard/admin/*` pages so the panel is usable
end-to-end from day one.

1. Create `app/(panel)/<section>/page.tsx` — usually a copy of the main app's
   `app/dashboard/admin/<section>/page.tsx` (the imported components are
   shared, so the page shell is all that moves).
2. For each `app/api/admin/<section>/**` route the section's client
   components call, add a matching route here that re-exports the handlers
   from `@/app/api/admin/<section>/...`.
3. Flip the section's `migrated: true` in `lib/sections.ts`.
4. Once the section is verified here, delete the page from the main app's
   `app/dashboard/admin/` and move the API implementation from the main app
   into this one (replacing the re-export).

## Deployment notes

- `output: "standalone"` — build produces `apps/admin/.next/standalone` for a
  Docker image, same pattern as the main app.
- Serve it on a dedicated subdomain and (recommended) put Cloudflare Access
  or an IP allowlist in front; the app's own auth still applies behind it.
- The app sends `X-Robots-Tag: noindex` and a restrictive CSP by default.

## Deploy v2 section (/deploy)

Presentation over the v2 operator API (`app/api/v2/admin/*`, contract in
`_lib/guard.ts` — read it in full before touching any v2 route). The page
calls `lib/paas/telemetry/operator.ts` views directly, one Suspense boundary
per section, so a slow or failed upstream renders as that section saying why.
Never add caching here: "is this current" is the question these views answer.

Per-section env (everything needs `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`; kubeconfig defaults to
`C:/ahura-secrets/kubeconfig-v2-dev.yaml`, namespace to `ahura-system`):

| Section | Additionally needs |
|---|---|
| sweeps, usage, workloads, metrics | `V2_KUBECONFIG`, `V2_PAAS_NAMESPACE` (defaults exist) |
| hostnames | `V2_CF_API_TOKEN`, `V2_CF_ZONE_ID`, `V2_CF_ZONE_NAME`, `V2_APP_DOMAIN` |
| fleet | `V2_LINODE_TOKEN` (`V2_LINODE_REGION`, `V2_LINODE_API_URL` optional) |
| storage | `V2_R2_ACCOUNT_ID`, `V2_R2_BUCKET`, `V2_R2_ENDPOINT`, `V2_R2_ACCESS_KEY_ID`, `V2_R2_SECRET_ACCESS_KEY` |

With only the kubeconfig, five of nine sections work and the rest show
Unavailable — a sane degraded state. Do NOT copy `V2_R2_SECRET_ACCESS_KEY`
or other full-access credentials into this app's env without explicit
sign-off. `V2_ENV_MASTER_KEY` is never needed here — no operator view
decrypts anything. The v2 test suite is `npm run test:paas` (not `npm test`).
