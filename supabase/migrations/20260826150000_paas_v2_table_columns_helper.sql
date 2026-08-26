-- Read a table's columns and their nullability, so the row interfaces in
-- lib/paas/db.ts can be checked against the schema rather than trusted.
--
-- This exists because of a real failure, and a quiet one. paas.projects gained
-- scale_to_zero and idle_seconds in the scale-to-zero migration; ProjectRow was
-- never updated. idle-sweep.ts read both fields anyway and worked, because
-- PostgREST returns the columns regardless of what TypeScript believes -- so
-- there was no error to notice, and the compiler had nothing to check the reads
-- against. It surfaced only when the repo was typechecked for the first time.
--
-- The nullability half matters as much as the names: a field typed non-nullable
-- against a NULLABLE column is how null reaches code that cannot represent it,
-- and that failure appears at the first row where the column happens to be null
-- rather than at the point the type was written.
create or replace function paas.table_columns(p_schema text, p_table text)
returns table (column_name text, is_nullable text, data_type text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- State the accepted shape rather than relying on the query below to be
  -- harmless with odd input. These are identifiers, not values, so they cannot
  -- be parameterised downstream.
  if p_schema !~ '^[a-z_][a-z0-9_]*$' or p_table !~ '^[a-z_][a-z0-9_]*$' then
    raise exception 'not an identifier: %.%', p_schema, p_table;
  end if;

  return query
  select c.column_name::text, c.is_nullable::text, c.data_type::text
  from information_schema.columns c
  where c.table_schema = p_schema
    and c.table_name = p_table
  order by c.ordinal_position;
end;
$$;

revoke all on function paas.table_columns(text, text) from public;
grant execute on function paas.table_columns(text, text) to service_role;
