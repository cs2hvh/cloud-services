-- ============================================================================
-- paas.rollback_project — put a previous deployment back in front of production.
--
-- WHY THIS IS A FUNCTION AND NOT THREE WRITES FROM A ROUTE.
--
-- A rollback is two writes that must not come apart: wake the target, then
-- repoint the aliases. Between them the site is either pointing at a sleeping
-- deployment (502) or awake but unrouted (nothing). Doing them from a route
-- means a failed second call leaves the first applied, and the failure mode is
-- an outage on a project whose owner was TRYING to end an outage.
--
-- It is also the only way to do it at all: paas.deployments has no UPDATE
-- policy, by design — a tenant may create deployments and read them, never
-- alter them. Clearing scaled_to_zero_at is a platform write, and this is the
-- narrow, authorized hole for it.
--
-- WHAT IT REFUSES, and every one of these is an outage if it does not:
--
--   another project's deployment   cross-tenant: serves someone else's build
--   not 'ready'                    nothing was ever published to point at
--   no image digest                READY WITH NO IMAGE — passes every other
--                                  check and serves nothing. `ready` has been
--                                  set on rows whose build published nothing.
--   not a production environment   promoting a preview is not a rollback; the
--                                  branch was never reviewed and its env vars
--                                  are the preview set
--
-- The route checks these too, in TypeScript, so the customer gets a reason
-- rather than a SQLSTATE. That is duplication on purpose: the route's copy
-- exists to explain, this one exists to be true even if the route is wrong.
-- ============================================================================

create or replace function paas.rollback_project(
  p_project_ref    text,
  p_deployment_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = paas, pg_catalog
as $$
declare
  v_project  paas.projects%rowtype;
  v_target   paas.deployments%rowtype;
  v_env_kind text;
  v_pointed  integer;
  v_previous uuid;
begin
  select * into v_project
  from paas.projects
  where ref = p_project_ref and deleted_at is null;

  if not found then
    raise exception 'project % not found', p_project_ref using errcode = 'no_data_found';
  end if;

  -- SECURITY DEFINER re-checks membership rather than trusting the caller. A
  -- definer function that skips its own authorization is a privilege
  -- escalation with extra steps.
  if not paas.has_team_access(v_project.team_id, 'member') then
    raise exception 'not authorized to roll back %', p_project_ref
      using errcode = 'insufficient_privilege';
  end if;

  -- Scoped by project in the SAME predicate, so a ref from another project
  -- reads as absent rather than as a different refusal. Two distinguishable
  -- errors would let a caller enumerate which refs are real, and the real ones
  -- belong to other tenants.
  select * into v_target
  from paas.deployments
  where ref = p_deployment_ref and project_id = v_project.id;

  if not found then
    raise exception 'no deployment % for project %', p_deployment_ref, p_project_ref
      using errcode = 'no_data_found';
  end if;

  if v_target.state <> 'ready' then
    raise exception 'deployment % is %, so it has nothing serving to roll back to',
      p_deployment_ref, v_target.state using errcode = 'check_violation';
  end if;

  -- Empty is not the same as unknown, and here neither is an image. '' arrives
  -- from a column that was written blank; 'null' arrives from a stringified
  -- null. Both mean nothing was published.
  if v_target.image_digest is null
     or btrim(v_target.image_digest) in ('', 'null', 'undefined') then
    raise exception 'deployment % is ready but has no published image', p_deployment_ref
      using errcode = 'check_violation';
  end if;

  select kind into v_env_kind from paas.environments where id = v_target.environment_id;
  if v_env_kind is distinct from 'production' then
    raise exception 'deployment % belongs to a % environment; promoting a preview is not a rollback',
      p_deployment_ref, coalesce(v_env_kind, 'unknown') using errcode = 'check_violation';
  end if;

  -- What production points at now, recorded before the change so the response
  -- can say what was rolled back FROM. Without it the caller knows the new
  -- state and has no way to undo it.
  select deployment_id into v_previous
  from paas.aliases
  where project_id = v_project.id and kind = 'production'
  limit 1;

  -- Asleep ON PURPOSE means the reconciler will not scale it up. Repointing
  -- without clearing this sends every production alias to zero replicas: the
  -- rollback reports success and the site returns 502 until somebody finds the
  -- flag.
  update paas.deployments
     set scaled_to_zero_at = null
   where id = v_target.id;

  -- An ALLOWLIST, not `kind <> 'branch'`. A fourth alias kind added later would
  -- be silently repointed by a negation — including a per-deployment permalink,
  -- whose entire purpose is to keep pointing at its own deployment.
  update paas.aliases
     set deployment_id = v_target.id
   where project_id = v_project.id
     and kind in ('production', 'custom');
  get diagnostics v_pointed = row_count;

  return jsonb_build_object(
    'project', p_project_ref,
    'deployment', v_target.ref,
    'previous_deployment_id', v_previous,
    'aliases_pointed', v_pointed,
    'woken', v_target.scaled_to_zero_at is not null
  );
end;
$$;

-- BOTH GATES. A new function has no EXECUTE grant at all, and a missing GRANT
-- reads almost exactly like an RLS refusal.
revoke all on function paas.rollback_project(text, text) from public;
grant execute on function paas.rollback_project(text, text) to authenticated;

comment on function paas.rollback_project(text, text) is
  'Repoint a project''s production and custom aliases at a previous ready deployment, waking it if asleep. SECURITY DEFINER; re-checks member access. Refuses a foreign, unready, imageless, or preview deployment.';
