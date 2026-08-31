-- Metering for v2 apps. Nothing billed for one before this.
--
-- Every v2 project ran free: usage_samples was collecting, and nothing in the
-- v2 lane touched credits. On a platform taking untrusted public signups that is
-- an open tap.
--
-- THE MODEL is on-demand against a credit balance, the way Linode and
-- DigitalOcean work — an app accrues by the hour and the balance draws down.
-- Not seats, not a subscription.
--
-- IT REUSES v1's LEDGER RATHER THAN STARTING A SECOND ONE.
-- billing.deduct_user_credit_atomic already takes the row lock, refuses a
-- non-positive or NaN amount, and refuses an overdraft. A second balance in the
-- paas schema would be two numbers that must agree about the same money, and
-- they would stop agreeing.

create table if not exists paas.project_charges (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references paas.projects(id) on delete cascade,
  -- Truncated to the hour. The charge is FOR this period, not AT this instant.
  period_start timestamptz not null,
  user_id      uuid not null references auth.users(id) on delete restrict,
  amount_usd   numeric(12,6) not null check (amount_usd > 0),
  tier         text not null,
  instances    integer not null check (instances >= 1),
  created_at   timestamptz not null default now(),

  -- THE IDEMPOTENCY IS THIS CONSTRAINT, not application logic.
  --
  -- A cron that fires twice, a retry after a timeout, two workers racing, an
  -- operator running the sweep by hand while it is also scheduled — every one of
  -- those double-charges a customer, and every one is a mistake somebody makes.
  -- Putting the rule in the database means the second attempt cannot succeed
  -- even if the code forgets to check.
  unique (project_id, period_start)
);

comment on table paas.project_charges is
  'One row per project per billed hour. The unique constraint on (project_id, period_start) is what makes charging idempotent — a retry, a double cron fire, or a concurrent worker cannot bill the same hour twice.';

create index if not exists project_charges_user_period_idx
  on paas.project_charges (user_id, period_start desc);

alter table paas.project_charges enable row level security;

-- A customer may READ what they were charged. Nothing may write through RLS:
-- charges are raised by the metering sweep with the service role, and a
-- tenant-writable ledger is not a ledger.
create policy project_charges_read
  on paas.project_charges
  for select
  to authenticated
  using (paas.has_team_access(
    (select p.team_id from paas.projects p where p.id = project_charges.project_id),
    'viewer'::paas.team_role));

grant select on paas.project_charges to authenticated;

-- ── the charge itself ───────────────────────────────────────────────────────

create or replace function paas.charge_project_hour(
  p_project_id   uuid,
  p_period_start timestamptz,
  p_amount       numeric,
  p_tier         text,
  p_instances    integer
) returns text
language plpgsql
security definer
set search_path = paas, billing, public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
  v_period  timestamptz := date_trunc('hour', p_period_start);
begin
  if p_amount is null or p_amount <= 0 then
    -- Refused rather than skipped. A zero charge and a failure to compute one
    -- look identical in a ledger, and only one of them is free.
    return 'invalid-amount';
  end if;

  -- WHO PAYS. The team owner, falling back to whoever created the team. A
  -- project whose team has neither is not billable and must not silently run
  -- free — it is returned as an error for a human to look at.
  select coalesce(
           (select m.user_id from paas.team_members m
             join paas.projects p on p.team_id = m.team_id
            where p.id = p_project_id and m.role = 'owner'
            order by m.created_at limit 1),
           (select t.created_by from paas.teams t
             join paas.projects p on p.team_id = t.id
            where p.id = p_project_id)
         )
    into v_user_id;

  if v_user_id is null then
    return 'no-payer';
  end if;

  -- Claim the hour first. ON CONFLICT DO NOTHING makes a repeat a no-op rather
  -- than an error, so a double fire is boring instead of alarming.
  insert into paas.project_charges (project_id, period_start, user_id, amount_usd, tier, instances)
  values (p_project_id, v_period, v_user_id, p_amount, p_tier, p_instances)
  on conflict (project_id, period_start) do nothing;

  if not found then
    return 'already-charged';
  end if;

  -- Deduct INSIDE the same transaction as the claim. If this raises, the insert
  -- above is rolled back with it — otherwise the ledger would record money that
  -- was never taken, which is worse than not charging at all because it looks
  -- settled.
  begin
    perform billing.deduct_user_credit_atomic(v_user_id, p_amount);
  exception
    when others then
      -- Insufficient balance, or no credit record. NOT re-raised: the caller
      -- has to act on this — suspend the app, tell the customer — and an
      -- exception here would just be retried forever while the app keeps
      -- running for free.
      return 'insufficient';
  end;

  return 'charged';
end;
$$;

revoke all on function paas.charge_project_hour(uuid, timestamptz, numeric, text, integer) from public;
revoke all on function paas.charge_project_hour(uuid, timestamptz, numeric, text, integer) from authenticated;
grant execute on function paas.charge_project_hour(uuid, timestamptz, numeric, text, integer) to service_role;

comment on function paas.charge_project_hour is
  'Bill one project for one hour, idempotently. Claims the hour and deducts in a single transaction so the ledger can never record a charge that was not taken. Returns charged | already-charged | insufficient | no-payer | invalid-amount. service_role only — a tenant must never be able to call the thing that moves money.';
