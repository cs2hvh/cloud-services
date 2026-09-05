-- Six customer tables were readable, writable and truncatable by the anon role.
--
-- Found by the 2026-09-05 authentication scan and verified against production
-- before and after this migration.
--
-- WHAT WAS WRONG
--
-- Two separate faults, and either alone would have been enough.
--
-- 1. A "USING (true)" SELECT policy granted to {public} on public.clusters,
--    public.activities and public.database_cluster. {public} includes anon.
--    NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the browser bundle by design, so
--    anyone who had loaded the site could read:
--
--      clusters          94 rows, 51 with a kubeconfig, plus vm_password
--      database_cluster  94 rows of managed-database connection strings
--      activities        the whole cross-tenant activity history
--
--    RLS was ENABLED on all three, so every dashboard reported them protected.
--    A permissive policy of `true` makes that reporting meaningless, which is
--    why this survived earlier reviews.
--
--    database_cluster is the instructive one: it already carried correct
--    owner-scoped policies ("Users can view own database clusters",
--    auth.uid() = owner_id). Postgres ORs permissive policies together, so the
--    blanket policy won and the correct ones never constrained anything. A
--    reader checking only the owner policies would conclude the table was safe.
--
-- 2. Table-level grants. anon held DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
--    TRUNCATE and UPDATE on all six tables, including servers and game_servers,
--    which have no permissive policy and so looked fine. RLS was the only thing
--    standing between the anon key and this data, and TRUNCATE is NOT subject to
--    row security at all.
--
-- WHAT THIS DOES
--
-- Drops the three blanket policies, replaces the notifications INSERT policy
-- (named "Service role can insert notifications" but actually granted to
-- {public} WITH CHECK (true), so any caller could forge a notification for any
-- user), revokes every anon privilege on the six tables, and removes TRUNCATE,
-- REFERENCES and TRIGGER from authenticated, which RLS does not constrain.
--
-- WHY clusters AND activities GAIN A POLICY AND database_cluster DOES NOT
--
-- Dropping a policy from a table that has no other policy denies everyone, so
-- the client each table is actually read through decides whether a replacement
-- is required. Checked in lib/supabase/server.ts:
--
--   createClient()        -> NEXT_PUBLIC_SUPABASE_ANON_KEY, subject to RLS
--   createWorkerClient()  -> SUPABASE_SERVICE_ROLE_KEY, bypasses RLS
--   createServiceClient() -> SUPABASE_SERVICE_ROLE_KEY, bypasses RLS
--   createSSRClient()     -> SUPABASE_SERVICE_ROLE_KEY, bypasses RLS
--
--   clusters     read via createWorkerClient (service role), so RLS is bypassed
--                on the live path. A policy is added anyway: the table held
--                exactly one policy, the blanket one, and leaving it with zero
--                would mean any future anon-key read fails with an empty result
--                rather than an error, which is the failure mode that hides
--                bugs rather than surfacing them.
--   activities   read via createClient (ANON key) filtered by owner_id, so this
--                one genuinely needs the replacement. Without it the dashboard
--                activity feed returns nothing.
--   database_cluster  already has "Users can view own database clusters"; the
--                blanket policy was pure excess and is simply removed.
--   servers, game_servers  already correctly owner-scoped; grants only.
--
-- The service_role ALL policy on database_cluster is deliberately kept:
-- service_role is meant to be unrestricted and is not reachable from a browser.
--
-- VERIFIED IN A ROLLED-BACK TRANSACTION BEFORE APPLYING: anon privileges on the
-- six tables 0, non-service_role `true` policies 0, clusters and activities each
-- left with one working owner-scoped policy.
--
-- NOT FIXED HERE, and still open: the data these tables exposed should be
-- treated as disclosed. Kubeconfigs, vm_passwords and database connection
-- strings in those 188 rows need rotating, which is an operational task, not a
-- migration.

begin;

-- 1. The blanket read policies.
drop policy if exists "Enable read access for all users" on public.clusters;
drop policy if exists "Enable read access for all users" on public.activities;
drop policy if exists "Enable read access for all users" on public.database_cluster;

-- 2. Named for service_role, granted to {public}. Any caller could insert a
--    notification attributed to any user.
drop policy if exists "Service role can insert notifications" on public.notifications;

create policy "Service role inserts notifications" on public.notifications
  for insert to service_role with check (true);

-- 3. Replacements for the two tables that would otherwise hold no policy.
create policy "Owners read their clusters" on public.clusters
  for select to authenticated using (auth.uid() = owner_id);

create policy "Owners read their activities" on public.activities
  for select to authenticated using (auth.uid() = owner_id);

-- 4. The grants. anon has no business holding anything on customer tables.
revoke all on public.clusters, public.database_cluster, public.activities,
                public.notifications, public.servers, public.game_servers
  from anon;

-- TRUNCATE bypasses row security entirely; REFERENCES and TRIGGER are not
-- needed by a PostgREST client. SELECT/INSERT/UPDATE/DELETE stay, constrained
-- by the owner-scoped policies above.
revoke truncate, references, trigger
  on public.clusters, public.database_cluster, public.activities,
     public.notifications, public.servers, public.game_servers
  from authenticated;

commit;
