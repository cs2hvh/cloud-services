-- ============================================================================
-- The claim and the deduction must share one savepoint.
--
-- THE BUG. PL/pgSQL opens an implicit savepoint at the START of a block that
-- has an EXCEPTION clause, and a caught exception rewinds only to there. The
-- INSERT into paas.project_charges sat BEFORE that block, so it was never in
-- scope: when the deduction failed, the exception handler rolled back the
-- deduction and the claim row survived.
--
-- The previous version's own comment said the opposite — "The claim rolls back
-- with this block, so no ledger row survives for money that was never taken."
-- The intent was right and the placement did not achieve it. That is the trap
-- already recorded in docs/v2/00-PROJECT.md §8: A COMMENT ASSERTING A GUARANTEE
-- IS NOT THE GUARANTEE.
--
-- WHY IT MATTERED MORE THAN A STRAY ROW. The row IS the idempotency key. So a
-- customer who was short got, in one hour:
--
--   1. a project_charges row saying the hour was charged
--   2. no money deducted
--   3. no possibility of retry — the next sweep sees the conflict and returns
--      'already-charged'
--   4. arrears_since set, so the project heads for suspension
--
-- A free hour, permanently recorded as paid, on an account being suspended for
-- non-payment — and sum(project_charges.amount_usd) overstating revenue by
-- exactly what failed to collect, so the ledger could never tie out against
-- balances.
--
-- VERIFIED BEFORE AND AFTER, on this database, not reasoned about.
--   Before: an INSERT placed before the block leaves 1 row after a caught
--           exception; the identical INSERT inside the block leaves 0.
--   After:  calling the real function for a real project with an amount above
--           the payer's balance returns 'insufficient', leaves
--           claim_rows_left = 0, and does not move the balance.
-- Never fired in production — no project has ever carried arrears_since — so
-- this closes a latent defect rather than cleaning up an incident.
--
-- Found by the billing lane (cloud-services-f0) while modelling
-- billing.charge_service_hour on this function; their test caught it.
--
-- SECOND FIX, same function. `when others then return 'insufficient'` also
-- swallowed genuine faults: a deadlock, a type error or a missing grant all
-- became "this customer is broke", and the project was suspended for it.
-- billing.deduct_user_credit_atomic raises all three of its errors as bare
-- P0001 with no distinguishing SQLSTATE, so message text is the only available
-- discriminator. Anything we cannot classify is re-raised: an error you cannot
-- classify is unknown, not a clean negative. scripts/v3/meter-apps.ts already
-- wraps this call in try/catch and reports a throw as a problem, so a re-raise
-- surfaces rather than crashing the sweep.
--
-- Applied via the Supabase MCP tool as 20260831063808; this file is the record.
-- ============================================================================

create or replace function paas.charge_project_hour(
  p_project_id   uuid,
  p_period_start timestamptz,
  p_amount       numeric,
  p_tier         text,
  p_instances    integer
)
returns text
language plpgsql
security definer
set search_path to 'paas', 'billing', 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_period  timestamptz := date_trunc('hour', p_period_start);
begin
  if p_amount is null or p_amount <= 0 then
    return 'invalid-amount';
  end if;

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

  -- ONE SAVEPOINT COVERS BOTH. The claim and the deduction are the same fact:
  -- either this hour was paid for or it was not. Splitting them across the
  -- block boundary is what let a claim outlive a failed payment.
  begin
    insert into paas.project_charges (project_id, period_start, user_id, amount_usd, tier, instances)
    values (p_project_id, v_period, v_user_id, p_amount, p_tier, p_instances)
    on conflict (project_id, period_start) do nothing;

    -- FOUND is false when the conflict swallowed the insert. Returning here is
    -- a normal exit, which releases the savepoint — nothing to preserve in this
    -- branch anyway, because nothing was written.
    if not found then
      return 'already-charged';
    end if;

    perform billing.deduct_user_credit_atomic(v_user_id, p_amount);
  exception
    when others then
      -- Only a funding problem is a clean negative. Text-matched because the
      -- source raises everything as P0001; if that ever gains real SQLSTATEs,
      -- match on those instead and delete this comment.
      if sqlerrm like '%Insufficient credit balance%'
         or sqlerrm like '%User credit record not found%' then
        return 'insufficient';
      end if;
      raise;
  end;

  -- Paid. Clear any arrears: topping up resets the clock, and an app that has
  -- started paying again must not still be counting down to suspension.
  update paas.projects
     set arrears_since = null
   where id = p_project_id and arrears_since is not null;

  return 'charged';
end;
$function$;

comment on function paas.charge_project_hour(uuid, timestamptz, numeric, text, integer) is
  'Charge one project for one hour. Idempotent per (project_id, period_start). The claim row and the credit deduction share one savepoint, so a failed payment leaves no ledger row. Unclassifiable errors are re-raised, never reported as insufficient funds. The arrears mark is written by the CALLER, outside this function, so it survives the rollback.';
