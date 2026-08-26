# AhuraSense Admin Panel

A standalone Next.js app for the admin panel, meant to be deployed on its own
subdomain (e.g. `admin.ahuracloud.com`) separately from the customer-facing
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
link to; defaults to https://ahuracloud.com).

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
