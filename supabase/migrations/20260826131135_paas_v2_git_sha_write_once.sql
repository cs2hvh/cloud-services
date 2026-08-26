-- git_sha was strictly immutable, which was right when the column could never
-- be null. Now that "unknown" is representable, strict immutability means a
-- deploy that learns its commit during the build can never record it — the row
-- is created before the clone, so the sha is unknown at insert and known thirty
-- seconds later.
--
-- image_digest already had the correct rule and this matches it: WRITE-ONCE.
-- Null may become a value; a value may never become a different value. Filling
-- in an unknown is not rewriting provenance. Changing a recorded commit is, and
-- stays refused.
create or replace function paas.tg_deployment_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.environment_id is distinct from old.environment_id then
    raise exception 'deployment provenance is immutable' using errcode = 'check_violation';
  end if;

  -- The commit may be written once (null -> value), never changed.
  if old.git_sha is not null and new.git_sha is distinct from old.git_sha then
    raise exception 'deployment git_sha is write-once (% -> %)', old.git_sha, new.git_sha
      using errcode = 'check_violation';
  end if;

  -- The image may be written once (null -> value), never changed.
  if old.image_digest is not null and new.image_digest is distinct from old.image_digest then
    raise exception 'deployment image_digest is write-once (% -> %)', old.image_digest, new.image_digest
      using errcode = 'check_violation';
  end if;

  -- Terminal states are terminal. v1 let a late webhook overwrite a finalized
  -- build, discarding the health verification the poller had already done.
  if old.state in ('ready', 'error', 'canceled') and new.state is distinct from old.state then
    raise exception 'deployment % is already terminal (%); cannot move to %', old.ref, old.state, new.state
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
