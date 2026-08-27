-- Onboarding was impossible. A brand-new user could do NOTHING.
--
--   teams        — SELECT and UPDATE policies only. No INSERT.
--   team_members — ALL requires has_team_access(team_id, 'admin'), so you must
--                  already be an admin of a team to add yourself to it.
--   projects     — requires membership.
--
-- Chicken-and-egg: every path to a first team needs a team you are already in.
-- Signing up produced an account that could not create anything, and the only
-- reason nobody noticed is that every project so far was seeded by SQL.
--
-- SECURITY DEFINER is the correct instrument here and the dangerous one, so the
-- shape matters:
--
--   * IT TAKES NO USER ID. It acts on auth.uid() and nothing else. A parameter
--     would let any caller bootstrap a team for any user — that is the whole
--     class of bug this project keeps finding, and it would be handing it out
--     deliberately.
--   * It is IDEMPOTENT. Called twice it returns the existing team rather than
--     accumulating one per page load.
--   * It grants 'owner' on a team it just created, which is not an elevation:
--     the team has no other members and no resources.
--   * search_path is pinned, because a SECURITY DEFINER function resolving
--     unqualified names through a caller-controlled search_path is a known
--     privilege-escalation route. (Widened to include `extensions` in
--     20260827022437 — see that migration for why.)

create or replace function paas.bootstrap_personal_team()
returns paas.teams
language plpgsql
security definer
set search_path = paas, public, pg_temp
as $$
declare
  uid   uuid := auth.uid();
  mail  text;
  base  text;
  cand  text;
  n     int := 0;
  team  paas.teams;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Already a member of something: return the oldest team they belong to, so
  -- this is a no-op for everyone except a genuinely new account.
  select t.* into team
  from paas.teams t
  join paas.team_members m on m.team_id = t.id
  where m.user_id = uid
  order by m.created_at
  limit 1;

  if found then
    return team;
  end if;

  select email into mail from auth.users where id = uid;

  -- Slug from the local part of the address, sanitised to the same shape a
  -- hostname label needs, since a team slug ends up in generated names.
  base := regexp_replace(lower(split_part(coalesce(mail, 'user'), '@', 1)), '[^a-z0-9-]', '-', 'g');
  base := trim(both '-' from base);
  if base = '' or base is null then
    base := 'team';
  end if;
  base := left(base, 32);

  cand := base;
  while exists (select 1 from paas.teams where slug = cand) loop
    n := n + 1;
    cand := left(base, 28) || '-' || n::text;
    if n > 500 then
      raise exception 'could not allocate a team slug for %', base;
    end if;
  end loop;

  insert into paas.teams (slug, name, created_by)
  values (cand, coalesce(mail, cand), uid)
  returning * into team;

  insert into paas.team_members (team_id, user_id, role)
  values (team.id, uid, 'owner');

  return team;
end;
$$;

revoke all on function paas.bootstrap_personal_team() from public;
grant execute on function paas.bootstrap_personal_team() to authenticated;

comment on function paas.bootstrap_personal_team() is
  'Idempotently give the CALLING user (auth.uid(), never a parameter) a personal team. The single operation that cannot be expressed under RLS, because every path to a first team requires a team you are already in.';
