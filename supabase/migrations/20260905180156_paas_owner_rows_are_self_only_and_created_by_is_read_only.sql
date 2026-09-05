-- Closes the residual payer-hijack paths that 20260905174955 left open.
--
-- That migration stopped created_at backdating and I reported the payer hijack
-- as fixed. It was not. Blocking the backdating closed one route to the payer
-- seat and left two others, both reachable by the same team admin:
--
--   (a) authenticated kept INSERT(user_id, role) and table-level DELETE. An
--       admin inserts the victim as 'owner', then deletes their own row. The
--       victim is now the only owner, and both paas.charge_project_hour and
--       paas.payer_balance select `role = 'owner' order by created_at limit 1`,
--       so the victim's credit balance funds the team. No backdating required,
--       because there is no longer a competing owner row to sort against.
--
--   (b) paas.teams.created_by had UPDATE for authenticated, and both functions
--       fall back to teams.created_by when no owner row exists at all. So
--       demoting or deleting every owner and then setting created_by = victim
--       reaches the same place by a different door.
--
-- The lesson worth keeping: the first fix removed the mechanism I had happened
-- to notice (a forged timestamp) rather than the capability behind it (naming
-- somebody else as the party who pays). Verifying that the specific exploit no
-- longer worked was not the same as verifying the outcome was unreachable.
--
-- WHY A TRIGGER AND NOT A POLICY OR A GRANT
--
-- The rule is a relationship between new.user_id and auth.uid(). A column grant
-- cannot express it: the problem is not WHICH columns are written but which
-- VALUE lands in one of them. An RLS WITH CHECK could, but would have to be
-- duplicated across the insert and update paths of an existing ALL policy that
-- the PaaS depends on, and a trigger states it once.
--
-- auth.uid() is null in the sweep and other service contexts, which must remain
-- able to write owner rows, so those pass through untouched. That is a
-- deliberate hole in the same sense as the rest of this codebase's service-role
-- paths: the service role is trusted, and a client is not.
--
-- Ownership transfer, if it is ever wanted, belongs in a SECURITY DEFINER RPC
-- where the RECIPIENT accepts. Nobody should be able to hand another person a
-- bill by editing a row.
--
-- REHEARSED in a rolled-back transaction against real auth.users ids, because
-- an earlier attempt with synthetic uuids failed on the foreign key to
-- auth.users and looked like the trigger being too strict:
--
--   foreign owner insert   raised
--   self owner insert      succeeded
--   service-context insert of a foreign owner   succeeded
--
-- Live state when this was written: 9 teams, 8 member rows, 0 teams with more
-- than one owner, no pre-existing triggers on paas.team_members.

begin;

create or replace function paas.owner_rows_are_self_only()
returns trigger
language plpgsql
as $fn$
begin
  -- Service and sweep contexts carry no JWT and must stay able to write.
  if auth.uid() is null then
    return new;
  end if;

  if new.role = 'owner' and new.user_id <> auth.uid() then
    raise exception
      'a client may only make itself owner; transferring ownership must go through an RPC the recipient accepts';
  end if;

  return new;
end;
$fn$;

drop trigger if exists owner_rows_are_self_only on paas.team_members;
create trigger owner_rows_are_self_only
  before insert or update on paas.team_members
  for each row execute function paas.owner_rows_are_self_only();

-- created_by is the payer fallback. Clients may read it; nothing client-side
-- may write it. Same table-then-column pattern as 20260905174955: a
-- column-level REVOKE does nothing while a table-level grant is present.
revoke update on paas.teams from authenticated;
grant  update (ref, slug, name, updated_at) on paas.teams to authenticated;

commit;
