-- The self-served GLM's public id carries what makes it different:
--   zhipu/glm-5.3-flash  ->  zhipu/glm-5.3-flash-uncensored
--
-- The id is what every integration types, so the name alone was not enough.
-- upstream_model_id stays glm-5.3-flash: that is what the pods answer to.
--
-- Renaming a catalog id has to carry the rows that hang off it. The two
-- foreign keys on models(model_id) were ON DELETE CASCADE only, which makes
-- a rename impossible in one statement; they now cascade updates too, so
-- this rename and any future one is a single UPDATE on the parent.
--
-- Usage rows written before this keep the old id; they are history, priced
-- at write time, and only test traffic exists under it.

begin;

do $$
declare c record;
begin
  for c in
    select con.conname, con.conrelid::regclass as rel
      from pg_constraint con
     where con.contype = 'f'
       and con.confrelid = 'inference.models'::regclass
       and (select attname from pg_attribute where attrelid = con.confrelid and attnum = con.confkey[1]) = 'model_id'
  loop
    execute format('alter table %s drop constraint %I', c.rel, c.conname);
    execute format(
      'alter table %s add constraint %I foreign key (model_id) references inference.models(model_id) on delete cascade on update cascade',
      c.rel, c.conname
    );
  end loop;
end $$;

update inference.models
   set model_id = 'zhipu/glm-5.3-flash-uncensored'
 where model_id = 'zhipu/glm-5.3-flash';

commit;
