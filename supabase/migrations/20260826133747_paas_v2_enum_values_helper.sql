-- Read an enum's values, so a TypeScript union mirroring a Postgres enum can be
-- checked against the database rather than trusted.
--
-- This exists because of a real failure: the webhook route was written with
-- trigger "push" while paas.deployment_trigger's value is "git_push". The field
-- was typed `string`, so nothing caught it — and the first symptom would have
-- been a customer's first push returning 400 from PostgREST, in production,
-- with every test still green.
create or replace function paas.enum_values(p_type text)
returns table (v text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Reject anything that is not a plain type reference before it reaches
  -- to_regtype. Not strictly required — to_regtype returns null rather than
  -- erroring — but a function taking a type NAME should state what shape it
  -- accepts rather than relying on a downstream cast to be forgiving.
  if p_type !~ '^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$' then
    raise exception 'not a type name: %', p_type;
  end if;

  return query
  select e.enumlabel::text
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  where t.oid = to_regtype(p_type)
  order by e.enumsortorder;
end;
$$;

revoke all on function paas.enum_values(text) from public;
grant execute on function paas.enum_values(text) to service_role;
