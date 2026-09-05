# `createSSRClient` ownership audit

**Audited 2026-09-05 at `c151292c`.** Covers `lib/supabase/queries.ts` and
`lib/supabase/queries/database_clusters.ts`, the two heaviest callers. The
remaining ~30 call sites are listed at the bottom as not yet audited.

## Why this matters more than an ordinary missing filter

`createSSRClient()` is built on `SUPABASE_SERVICE_ROLE_KEY`
(`lib/supabase/server.ts:49`). It **bypasses RLS entirely**.

On a cookie-scoped client, a query that forgets its ownership filter is still
constrained by a policy — the filter is a second line, and its absence usually
shows up as an empty result rather than someone else's data. On a service-role
client there is no policy behind it. The filter *is* the authorization, and its
absence is invisible: the query succeeds and returns whatever was asked for.

That is why the three cluster routes audited in `7ad7c12b` matter as a sample:
**two of the three were wrong.** This is not a pattern where the omissions are
rare.

## Verdicts

`ok` = scopes by an owner, or is admin-gated, or has no owner concept.
`UNFILTERED` = selects by a caller-supplied id with no ownership predicate.

### `lib/supabase/queries.ts`

| Line | Table / operation | Filter | Verdict |
|---|---|---|---|
| 1004 | `locations` insert | n/a | ok — infrastructure catalogue, no owner |
| 1025 | `otps` insert | n/a | ok — server-generated |
| 1543 | `database_cluster` select `*` | `cluster_id` | **UNFILTERED** |
| 1557 | `database_cluster` select `*` | `owner_id` | ok |
| 1571 | `database_cluster` select `*` | `owner_id` | ok |
| 1730 | `database_cluster` select `users` | `cluster_id` | **UNFILTERED** |
| 1837 | `database_cluster` select `dbs` | `cluster_id` | **UNFILTERED** |
| 2357 | `spectrum_apps` select | admin-gated (`role==='admin'`) | ok |
| 2386 | storage `kubeconfigs` upload | n/a | ok — write path |
| 2494 | `object_spaces` select | `owner_id` | ok |
| 2560 | `object_spaces` select | `id`, admin-gated | ok |
| 2584 | `object_spaces` select | `id` | **UNFILTERED** |

### `lib/supabase/queries/database_clusters.ts`

| Line | Table / operation | Filter | Verdict |
|---|---|---|---|
| 123 | `database_cluster` select `*` | `cluster_id` | **UNFILTERED** |
| 157 | `database_cluster` select `*` | `owner_id` | ok |
| 172 | `database_cluster` select `*` | `owner_id` | ok |
| 330 | `database_cluster` select `users` | `cluster_id` | **UNFILTERED** |
| 439 | `database_cluster` select `dbs` | `cluster_id` | **UNFILTERED** |

**8 unfiltered of 17.**

## What the unfiltered ones expose

Seven of the eight read `public.database_cluster`, whose columns include
`public_connection` and `private_connection` — managed-database connection
strings with credentials in them. That is the same data the anon-readable policy
exposed before `6286d59b`; these paths reach it by a different route, and one
that `6286d59b` does not touch, because the service role ignores policies.

The eighth (`queries.ts:2584`) reads an `object_spaces` bucket row by id.

## What has NOT been established, and why nothing was changed

**Whether each is reachable with attacker-controlled input.** A missing filter is
only an IDOR if a caller passes a user-supplied id without checking ownership
first. Some of these are certainly called from paths that have already
authorised the cluster; some probably are not. Establishing which requires
tracing every caller of every one of the eight, and the promotion rule for this
work is to read the sink and the full auth path before patching.

Adding `.eq("owner_id", …)` blindly would be worse than leaving them: several of
these are also used by admin paths, where scoping to the caller would silently
break administration rather than fail loudly.

## Recommended order

1. `database_clusters.ts:123` and `queries.ts:1543` — both select `*` from
   `database_cluster`, so they return the connection strings directly.
2. `database_clusters.ts:330`/`439` and `queries.ts:1730`/`1837` — narrower
   (`users`, `dbs`) but still cross-tenant if reachable.
3. `queries.ts:2584` — object storage bucket by id.

## Not yet audited

Roughly 30 further `createSSRClient` call sites: nine
`app/api/services/platform-apps/integrations/*` routes, three `app/api/admin/*`
routes, `lib/supabase/queries/object_storage_integrations.ts` (4),
`database_integrations.ts` (3), `object_spaces.ts` (3), `locations.ts`,
`spectrum_apps.ts`, `otps.ts`, `utils.ts`.

The admin routes are lower risk if they gate on role first, but that gate has not
been checked either.
