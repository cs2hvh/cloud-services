-- The inference schema's client grants were revoked by hand and no migration
-- recorded it.
--
-- 20260523000001 granted SELECT on every inference table to authenticated and
-- 20260526000003 made that the default for future tables, with RLS on some
-- tables and not others. The live database on 2026-09-06 shows none of that:
-- every table has RLS on except the trace_spans partitions, authenticated and
-- anon hold no table, sequence or default grants, and every read through
-- PostgREST under a customer JWT is 403. Someone closed it at the console.
--
-- That is the right state and the wrong way to hold it. A database rebuilt
-- from this folder would come up with cross-tenant reads of audit_log
-- (ip_address, user_agent, actor_user_id), usage, api_keys (key hashes, IP
-- allowlists, budgets), orgs and org_members open to any signed-in customer,
-- and the drift check compares migration names, not content, so it would not
-- notice. This file makes the folder say what the database says.
--
-- Every legitimate reader of this schema uses the service role: the edge
-- gateway (lookup_api_key), the workers, app/api/inference/* and the marketing
-- status page (status_*_7d, status_usage_24h). Nothing runs under a customer
-- session, so authenticated loses schema USAGE as well as the grants, and the
-- functions default-executable by PUBLIC stop being callable by anon and
-- authenticated. Two of them, lookup_api_key and lookup_org_billing, are
-- SECURITY INVOKER and were only unexploitable because the table grants were
-- already gone.
--
-- The schema stays on pgrst.db_schemas (20260903165206): service_role reaches
-- it through PostgREST with Accept-Profile: inference.

begin;

-- 1. Row security on every table and partition, present and future partitions
--    included because the loop runs over pg_class rather than a list.
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'inference'
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
  loop
    execute format('alter table inference.%I enable row level security', r.relname);
  end loop;
end $$;

-- 2. No client grants of any kind.
revoke all on all tables    in schema inference from anon, authenticated, public;
revoke all on all sequences in schema inference from anon, authenticated, public;
revoke all on all functions in schema inference from anon, authenticated, public;
revoke usage on schema inference from anon, authenticated, public;

-- 3. And none for objects created later. The first of these removes the
--    default SELECT 20260526000003 gave authenticated where it still exists;
--    the second takes away the implicit PUBLIC execute on new functions.
alter default privileges in schema inference revoke select on tables from authenticated;
alter default privileges in schema inference revoke all on tables from anon, authenticated, public;
alter default privileges in schema inference revoke all on sequences from anon, authenticated, public;
alter default privileges in schema inference revoke execute on functions from anon, authenticated, public;

commit;
