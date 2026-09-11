-- An alias must never shadow a live model id.
--
-- The gateway maps alias -> model_id before it looks anything up, so a row
-- whose alias equals a real models.model_id would silently route that model's
-- traffic somewhere else, bill it under another id, and look like nothing was
-- wrong. The invariant is cheap to state and impossible to enforce by comment,
-- so it lives here: neither table may create a collision with the other.

begin;

create or replace function inference.model_aliases_reject_live_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from inference.models m where m.model_id = new.alias) then
    raise exception
      'alias "%" is a live model id; aliases exist only for retired ids', new.alias
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function inference.models_reject_aliased_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from inference.model_aliases a where a.alias = new.model_id) then
    raise exception
      'model id "%" is already an alias for another model; drop the alias first', new.model_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists model_aliases_reject_live_id on inference.model_aliases;
create trigger model_aliases_reject_live_id
  before insert or update of alias on inference.model_aliases
  for each row execute function inference.model_aliases_reject_live_id();

drop trigger if exists models_reject_aliased_id on inference.models;
create trigger models_reject_aliased_id
  before insert or update of model_id on inference.models
  for each row execute function inference.models_reject_aliased_id();

commit;
