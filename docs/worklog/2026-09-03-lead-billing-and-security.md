# Worklog, 2026-09-03: billing spine and security (lead session)

**Who:** the lead session for the afternoon of 2026-09-03, coordinating with the
compute/billing lane (its own worklog: `2026-09-03-gpu-and-compute-lane.md`).
**Verified against production:** figures in §5 were read at 2026-09-05 05:33 UTC,
36 hours after the deploy.
**Branch:** `dev`, commits `7c117efe` through `c082498a`, pushed by Harshit.

This is a record of what was asked, what was found, what changed, how it was
checked, what was deliberately left alone, and what was got wrong on the way.
The architecture docs describe the system as it now is; this describes the
day.

---

## 1. What was asked

The compute lane handed over a platform summary and a ranked list of open
problems, and asked for a fresh read: where else an empty result reads as a
valid one, whether its ranking was right, whether doc 03 could be trusted, and
what to do about two apps sharing one database. Harshit then asked for all of
it to be fixed, with this session leading and the compute lane taking the GPU
book and the admin repo.

## 2. What was found

The handover's two top items were both wrong in the same direction, and two
security findings outranked everything on it.

| Handover said | What production said |
|---|---|
| Nobody knows what runs the hourly sweep; it stopped for 11 hours | The systemd timer had fired every hour for 81 consecutive hours. Charge rows land between :10:00 and :11:01 past every hour. The 11 hours were one meter skipped while five billed: the `compute/*` markup row was applied by hand at 15:00 UTC on 09-02 and the sweep code that sends `hourly_cost` as the upstream cost was not pushed until 03:16 UTC on 09-03. The sweep wrote PROBLEM to the journal every hour; nobody reads the journal. |
| The PaaS bills nobody: $7.87 accrued, nothing deducted | `paas.charge_project_hour` deducted the wallet in the same savepoint as its insert, hourly at :04, since 08-28. It wrote no ledger row. One customer's balance reconciled to the cent only with the PaaS line included. |
| Six RLS-off tables, not re-verified | Eight, with anon and authenticated holding every privilege including TRUNCATE, reachable with the anon key from `.env`. Two had joined since August through "automatically expose new tables". |
| (not listed) | Any signed-in user could set their own `roles` to admin: the update policy on `user_profiles` had no WITH CHECK. |
| (not listed) | Both teardown paths charged the resource's entire lifetime again on destroy, because `last_billed_at` was only ever advanced by the cron worker deleted on 08-24. No teardown had run since the 08-31 relaunch. |

Twenty further places where an empty or failed read passed as a valid one are
listed in the commit `34c8088d` message and in doc 03 §5.

## 3. What changed

Non-merge commits on `dev`, in order. Migration versions are as applied.

| Commit | What |
|---|---|
| `7c117efe` | Security. Migrations `20260903165135` (roles/suspend pinned by WITH CHECK), `20260903165741` (RLS on eight tables, anon/authenticated revoked, catalog tables read-only for signed-in users, 12 SECURITY DEFINER functions revoked from PUBLIC and granted to service_role), `20260903165206` (PostgREST schema list pinned in a file). Admin users routes use the shared guard. |
| `097f39c8` | PaaS ledger. `20260903165150` routes the deduction through `billing.move_credit`; `20260903165154` backfills 823 historical hours as completed usage rows tagged `metadata.backfilled`, `balance_after` NULL on purpose. `revenue_daily` reports PaaS as settled. |
| `b0dfa17f` | Teardown. `closeActiveBilling` and `close_active_service` no longer deduct the v1 lifetime charge; both close the v2 meter (five teardown paths never had), delete the v1 row, log the v1 estimate. `get_balance` throws on a failed read instead of reporting $0. |
| `4d7db0f5` | Observability and scheduling. `20260903165251` adds `billing.sweep_runs` and `billing.unbilled_resources()`; `20260903165202` makes `resolve_hourly_rate` refuse a zero upstream cost. The sweep records every run, treats `zero-cost` as a problem, paginates, and reads no status column for vector collections. The dead-man asks four questions. `deploy.yml` installs and asserts three timers, masks `ahura-cron`, and gates deploy on a clean typecheck. `migration-drift.yml` compares applied migrations with the folder by name. |
| `34c8088d` | Twenty empty-read fixes: game renewals, game plan catalog, PaaS afford check, v3 app meter, deployment meter, usage consumer, spend cap, audit reads, balance reads, a paginating `selectAll`, and the admin AI-agents stats route that had been querying three tables that do not exist. |
| `b4a2a8e4` | Six old-admin Proxmox routes switched from the anon key to the service role. Kept as its own commit; see §6. |
| `b3a121fc` | Three files belonging to another session, swept up by a catch-all add, removed from the index again. See §7. |
| `7db30090` | Architecture docs 00 to 07 rewritten to the afternoon's state. |
| `140a48e9` | The sweep bills GPU pods from the frozen `gpu_hourly_usd` through the `gpu_pod/*` passthrough, with `fixedUnits: 1`. |
| `c082498a` | The registry comment for that entry corrected; see §7. |

Merged from the compute lane: `3da3cd1a`, `8d7b5d25`, `75b428fe`.

Working files worth knowing about: `scripts/ops/call-internal-route.ts` (what
the renewal timers run), `scripts/ci/migration-drift.ts`,
`lib/supabase/select-all.ts`, `deploy/systemd/ahura-{game,domain}-renewals.*`.

## 4. Verification before the push

- Roles policy: in a rolled-back transaction as `authenticated` with a real user id, `set roles = '{}'` was refused with "new row violates row-level security policy"; `set bio = bio` updated one row.
- Lockdown: a code audit of every reader of the eight tables found all service-role except six old-admin Proxmox routes (switched) and two `database_types` reads under a user session (kept working by the read-only policy). The compute lane ran the same audit on the admin panel: all service-role.
- PaaS: `ved@samatva.com` = +100.000000 +5.000000 −5.000000 −6.833681 −0.498628 = 92.667691, the live balance. 823 backfilled rows equal the 823 project-charge rows.
- Sweep and dead-man executed from the workstation against production: dry run priced 6 of 6 meters; the dead-man reported exactly the two true findings (no apply run yet under the new code, 11 unmetered resources).
- Typecheck: 0 errors project-wide. Targeted unit tests: 87 of 92 passing; the 5 failures are stale mocks with no `.rpc` that predate today.
- Workflow files parsed as YAML; three jobs in `deploy.yml`.

## 5. Verification after the deploy (2026-09-05 05:33 UTC)

| Check | Observed |
|---|---|
| `billing.sweep_runs` | 36 `apply` rows, one per hour since the deploy, host `localhost`, every row `charged 5 of 5`, `problems 0` |
| `billing.meter_coverage('48 hours')` | 5 meters, all `ok` |
| Game renewal timer | 3 `recurring/completed/game_server` transactions; all three servers renewed to 2026-10-03 18:00, none suspended |
| PaaS ledger | 180 `usage/platform_apps` rows written by the new function since the deploy; `ved@samatva.com` 92.667691 → 87.533756 |
| `billing.unbilled_resources()` | 8 `inference_vector` rows and nothing else; the game servers dropped off once renewed |
| Charges | 204 rows across 36 hours since the deploy |

The dead-man will stay red on the 8 vector collections until they are metered
or removed; that is the tool working.

## 6. Deliberately not done

- **Proxmox credential rotation.** Harshit said "skip proxmox for now". The credentials were reachable with the anon key from at least 08-23 to 09-03 and are not rotated. The route switch in `b4a2a8e4` had already landed before that instruction reached the agent doing it; it is isolated so one revert removes it, and without it those routes would be broken by the lockdown.
- **Grace-delete, grace-events and bandwidth-sync stay unscheduled.** They are v1 machinery reading `billing.active_*` and `service_lifecycle`, nothing writes `service_lifecycle` rows anymore, and the deletion executor treated a failed read as "already deleted". Scheduling them would have been worse than leaving them.
- **Unit tests do not gate the deploy.** 72 of 196 files were red; a gate that blocks every push is decoration. The typecheck gates; the suite runs alongside so the count is visible.
- **Direct writes from service_role were not revoked on `service_meters`, `service_charges`, `user_credits`, `transactions`.** The app still writes those tables directly in many places; revoking would need every caller converted first. Listed in doc 03 §9 as the next step for the two-apps-one-database problem.
- **The Cloudflare worker was not deployed.** Two fixes in `workers/inference/src` are code only until `wrangler deploy` runs; this machine is not authenticated.
- **The push was not made by this session.** Its permission gate refused `git push` twice; Harshit pushed.

## 7. Mistakes on the way

- A catch-all `git add -A` swept up three untracked files from another session sharing the checkout (a new bare-metal storefront page and a preview config). Caught before the push by reading the commit stat, removed from the index in `b3a121fc`, files left on disk for their owner. The lesson: in a shared checkout, add by path.
- The registry comment in `140a48e9` repeated the compute lane's claim that the old GPU path dropped the unit count. It did not; `charge_service_hour` multiplies by `p_units` after the floor. The compute lane re-verified against the SQL and retracted; `c082498a` corrects the comment and states the real invariant, that `fixedUnits: 1` is mandatory because the frozen rate already includes the count and an 8-GPU pod would otherwise bill $119.07 against a $14.88 quote.
- The first draft of the analysis said the sweep charge count was 324 rows over 81 hours; the docs agent's live read at 17:06 UTC found 318 over 80. Numbers were restated as read.
- Two heredoc commands failed to parse because of apostrophes inside them; nothing partial ran, but the commit and memory writes had to be redone from files.

## 8. Still open, and whose call

| Item | Whose |
|---|---|
| 720 or 730 hours per month. 69 of 72 live prices convert through the constant, now in one place (`lib/pricing/hours.ts` and `billing.hours_in_month()`); 720 collects 1.4% more per year than a monthly price implies | Harshit, pricing |
| The 8 vector collections priced at $8/mo that have never been metered | Harshit, product |
| `wrangler deploy` for `workers/inference` | Harshit |
| Whether `billing-deadman.yml` has its secrets (exit 2 on every run means billing was unwatched since 08-31) | Harshit, one look at the Actions tab |
| "Automatically expose new tables" in the Data API settings, still ON | Harshit, dashboard toggle |
| Proxmox credential rotation | Harshit |
| Gateway token usage is billed to nobody | product decision |
| Arrears are recorded but never settled or enforced under v2 | product decision |
| `sharma11aniket@gmail.com` refund: no refund row, balance $3.02 against $3,561 of top-ups | Harshit |
| Two more wallet paths with no ledger row (setup fee in `config/billing-flow.ts`, AI-agent usage via `Billing.deduct`) | next session |
| Two admin AI-agents routes still querying nonexistent tables | task chip open |
| Revoke direct writes on the money tables; generated types as a cross-app contract | next session |

## 9. Working with the other lane

Ground rules that held: one owner for migrations and pushes (this session applied every migration; the compute lane sent SQL, with one additive exception it applied itself and disclosed); the other lane worked in a worktree branch and never committed to the shared checkout; permission refusals went to Harshit, never to the other session. Messages crossed several times because each side read a snapshot a few minutes old; every crossing was resolved by reading `git log` rather than the message.
