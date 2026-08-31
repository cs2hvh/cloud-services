-- Expose the `paas` schema through PostgREST.
--
-- Without this the control plane and dashboard cannot reach the schema at all,
-- which is why provisioning scripts created real Linode resources and recorded
-- nothing. Same shape as the v1 defect that left five billing meters outliving
-- the apps they billed for.
--
-- RLS remains the authorization boundary. These grants are what RLS filters,
-- not permission to read another tenant's rows.

grant usage on schema paas to anon, authenticated, service_role;

grant select, insert, update, delete on
  paas.teams, paas.team_members, paas.projects, paas.environments,
  paas.deployments, paas.aliases, paas.domains, paas.env_vars
to authenticated;

-- Fleet tables have RLS enabled with NO policy, so they stay service-role only
-- even with a grant.
grant select, insert, update, delete on
  paas.clusters, paas.deployment_placements, paas.build_vms
to service_role;

grant select, insert, update, delete on all tables in schema paas to service_role;
grant usage, select on all sequences in schema paas to service_role, authenticated;
grant execute on function paas.has_team_access(uuid, paas.team_role) to anon, authenticated, service_role;
grant execute on function paas.gen_ref(text) to service_role;

alter role authenticator set pgrst.db_schemas = 'public,paas,billing,inference';
notify pgrst, 'reload schema';
