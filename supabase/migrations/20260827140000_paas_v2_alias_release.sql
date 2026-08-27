-- ============================================================================
-- A deleted project's hostname must become available again.
--
-- THE BUG. `project-teardown.ts` deliberately KEEPS alias rows — they record
-- which hostname served, and deleting history to tidy up infrastructure would
-- destroy the only account of what a tenant was charged for. Correct.
--
-- But nothing ever released the NAME. `aliases_hostname_idx` is unique on
-- lower(hostname) with no predicate, and `aliases.byHostname()` has no notion
-- of a deleted project — so a torn-down project went on claiming its hostname
-- forever. Delete a project and neither you nor anyone else can ever use that
-- name again. There is no error that explains it: the next deploy says the
-- hostname "is already claimed by another project", and the project it names
-- does not appear anywhere in the UI, because it is deleted.
--
-- Found when the operator recreated their own app under the right team and the
-- build succeeded, published an image, and then could not route.
--
-- THE FIX IS A RELEASE MARKER, NOT A DELETE. `released_at` keeps the row and
-- its history while taking the name out of the unique index, exactly as
-- `installations_live_unique_idx` does for connections. Two facts that were
-- conflated — "this alias existed" and "this alias holds the name" — become two
-- columns.
-- ============================================================================

alter table paas.aliases
  add column if not exists released_at timestamptz;

comment on column paas.aliases.released_at is
  'Set when the owning project was torn down. The row is kept for history; the hostname stops being claimed. Null means this alias holds its name.';

-- Partial, so a released name can be claimed again while live names stay
-- unique. Dropped and recreated rather than added alongside: two unique indexes
-- on the same column would keep the old one enforcing the old rule, which is
-- the failure this migration exists to end.
drop index if exists paas.aliases_hostname_idx;
create unique index aliases_hostname_idx
  on paas.aliases (lower(hostname))
  where released_at is null;

-- Same reasoning for one-production-per-project: a released alias is not the
-- project's production alias any more, and leaving it in the index would stop a
-- restored project ever having one.
drop index if exists paas.aliases_one_production_idx;
create unique index aliases_one_production_idx
  on paas.aliases (project_id)
  where kind = 'production'::paas.alias_kind and released_at is null;

-- Releasing is idempotent and never un-releases: a second teardown run must not
-- reopen a name somebody else has since taken.
create or replace function paas.release_project_aliases(p_project_id uuid)
returns integer
language sql
security definer
set search_path = paas, pg_catalog
as $$
  with released as (
    update paas.aliases
       set released_at = now()
     where project_id = p_project_id
       and released_at is null
    returning 1
  )
  select count(*)::integer from released;
$$;

revoke all on function paas.release_project_aliases(uuid) from public;

comment on function paas.release_project_aliases(uuid) is
  'Release every hostname a torn-down project holds, keeping the rows. Idempotent; never un-releases.';
