-- Any signed-in user could make themselves an admin.
--
-- The update policy on public.user_profiles was
--
--     for update using (auth.uid() = id)
--
-- with no WITH CHECK, and `authenticated` holds UPDATE on every column,
-- including `roles` and `suspend`. One PATCH through PostgREST therefore set
-- roles = ['admin'] on the caller's own row. Everything downstream trusted that
-- column: app/api/admin/users (which reads only roles, then lets the caller set
-- roles on other users), lib/supabase/auth.ts when ADMIN_EMAILS is empty, and
-- every RLS policy written as 'admin' = ANY(user_profiles.roles) — the audit
-- log SELECT policy, the game admin policies, the proxmox and IP-pool policies.
--
-- Found 2026-09-03 by reading pg_policies and role_column_grants; not exercised.
--
-- The fix keeps a user able to edit their own profile and refuses any update
-- that changes `roles` or `suspend`. The subselects read the row as it was
-- before this statement (a command cannot see its own modifications), so
-- "unchanged" compares new against old. service_role bypasses RLS and keeps
-- writing these columns from the admin routes.

drop policy if exists "Users can update their own profile" on public.user_profiles;

create policy "Users can update their own profile"
  on public.user_profiles
  for update
  to public
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and roles   is not distinct from (select p.roles   from public.user_profiles p where p.id = auth.uid())
    and suspend is not distinct from (select p.suspend from public.user_profiles p where p.id = auth.uid())
  );

comment on policy "Users can update their own profile" on public.user_profiles is
  'Own row only, and roles/suspend must be unchanged. Admin writes go through service_role. 2026-09-03: without the WITH CHECK any user could self-promote.';
