# Worklog, 2026-09-03: GPU and compute lane

One of two sessions working this repo on 2026-09-03. The other covered billing
security, the sweep spine and the deadman; its record is
`2026-09-03-lead-billing-and-security.md`. Everything here was verified against
the running system on the day, and the numbers are the ones the database
returned, not estimates.

Twenty commits in this lane, all on `origin/dev` at `c082498a`. Twenty-one
migrations were applied to production across both lanes on 2026-09-03; five of
them are this lane's.

---

## 1. Money moved without its ledger row (46dbdac1, afb93a02)

**Found.** `billing.transactions` is the record of money moving. It is what the
customer's history renders and what `billing.account_ledger` reads. In
seventeen places the code moved a balance and then wrote that row as a separate
optional step, either `.catch(e => console.warn(...))` or a `try/catch` that
logged and continued. The money had already moved by the time either ran. No
retry, no queue, no reconciliation. A failed write was lost and the balance kept
the change.

Spread across domain purchases, refunds and renewals; game provisioning and
renewals; platform-app bandwidth and activation; inference deployments,
fine-tunes and serving; the kubernetes setup refund; service teardown; coupons.

**Cost.** Not hypothetical. The 2026-08 audit found $110 of coupon credit with
no ledger row. On 2026-09-02 a failed provision took $0.0075 the same way.

**Changed.** Ledger writes moved inside the same path as the balance move.
`afb93a02` filed `billing_coupon_credit_writes_its_own_ledger_row`, which had
been applied to production as version `20260903072444` with no file in the repo.

**Why that second one matters.** Schema ahead of repo is the drift that forced
eleven orphaned migrations to be reconstructed in late August. It recurred twice
more the same day; see section 5.

---

## 2. GPU price writes bypassed their own guard (81e8599d, 52c6d12e)

**Found.** `PUT /api/admin/pricing/gpu` wrote `public.gpu_pricing` directly,
skipping every guard `billing.set_gpu_markup` exists to apply:

- the below-cost rule, kept deliberately in the database rather than in a route
  so that a third caller cannot opt out of it. This route was that third caller.
- the zero-rows-matched check. A typo'd `gpu_catalog_id` updated nothing and the
  route returned `{ ok: true }`, so an operator believed a price had moved when
  it had not.
- the drift report comparing the quote-side markup in `gpu_pricing` against the
  charge-side `gpu_pod` row in `billing.service_pricing`.

**Cost.** The third is why it mattered. On 2026-09-02 the `gpu_pod` charge
markup went from 1.00x to 10.00x while `gpu_pricing` stayed at 1.000. A pod
would have been quoted at cost and billed at ten times it. The detector built to
catch exactly that divergence never ran, because the write went through this
route instead of through the function that reports it.

**Changed.** Writes go through `set_gpu_markup`. `52c6d12e` then surfaced what
the function returns: refusal reasons reach the operator instead of a bare
"Failed to save", and a save that disagrees with the charge side warns and names
the charge-side figure.

---

## 3. The audit partition with RLS off (6794a8cb)

**Found.** `authenticated` holds SELECT on `audits.audit_logs` and on each
partition directly. Every partition had RLS enabled with zero policies, which is
deny-all and safe, except `audit_logs_2026_04`, where RLS was off. 986 rows
carrying `user_email`, `ip_address`, `user_agent` and before/after state for
admin actions on other customers.

The parent's admin-read policy did not cover it. Policies on a partitioned
parent apply to queries through the parent; a partition accessed directly
enforces its own.

**Why it was not exposed.** The `audits` schema had fallen off PostgREST's
exposed-schemas list, probably when billing and inference were added on
2026-08-26 and the list was replaced rather than appended. That is also why the
audit trail had been silently dead since, writes failing PGRST106.

**The trap, and the ordering.** The fix for the dead audit trail is to put
`audits` back on the exposed list, which removes the configuration accident
currently protecting this partition. Re-exposing first would have opened the
hole. `20260903100000_audits_close_the_unprotected_april_partition.sql` landed
first, deliberately.

---

## 4. GPU frozen quoted rate (8d7b5d25, 75b428fe, 140a48e9, c082498a)

The largest piece of the day, and the one where this lane got its own analysis
wrong and had to retract it.

### What was found

`gpu_pod` was the only billable service with no frozen upstream rate. The sweep
billed it as `live markup x runpod_cost_per_hr`, so a markup change silently
re-rated every running pod. The markup has in fact moved: pods 1 to 7 carry
~1.25 and pods 8 to 15 carry 1.00.

`hourly_cost_usd` could not serve as the frozen column. It is GPU plus local
disk. Pod 15: `0.99 + (140GB x $0.10/mo / 730) = 1.0092`. Billing against it
would charge the disk twice, because `gpu_pod_storage` already meters it. It
also could not be narrowed to GPU-only: five customer-facing readers render it
as the pod's all-in rate, including a SUM across pods on the GPU dashboard, and
narrowing it would have understated all five with no error raised.

### What changed

- `20260903190000_gpu_pods_freeze_the_quoted_rate.sql`, applied. Adds
  `public.gpu_pods.gpu_hourly_usd numeric(12,4)`: the GPU resale rate for the
  whole pod, `gpu_count` multiplied in, storage excluded, frozen at create.
  Backfilled all 15 existing rows.
- `8d7b5d25` writes it at both create sites in
  `lib/services/runpod/operations/pod-lifecycle-operations.ts`.
- `140a48e9` (peer lane) points the sweep registry at it with `fixedUnits: 1`.
- `20260903200000_gpu_hourly_usd_corrects_its_own_rationale.sql`, applied,
  comment-only. See below.

### What 8d7b5d25 got wrong

Its commit message and migration header gave three reasons the old path could
not reproduce the quote. Two were false and the third was a data claim that a
single query would have refuted:

1. *"`resolve_hourly_rate` ignores the GPU count, so an 8-GPU pod bills one
   eighth of its quote."* False. `p_quantity` and `p_units` are separate
   parameters. `charge_service_hour` applies the count one level up:
   `v_gross := round(v_hourly * coalesce(p_units, 1), 6)`. This lane read
   `resolve_hourly_rate` and never read its caller.
2. *"The per-GPU floor is applied per-pod."* False. `greatest(rate, floor)` runs
   before the units multiply, so the SQL produced
   `max(observed x markup, floor) x gpu_count`, identical to the quote's
   `computeResalePerHour`.
3. *"Every pod ever created has `gpu_count = 1`."* False. Pod 4 has eight GPUs
   and pod 5 has two. Five rows were read under a LIMIT and generalised to
   fifteen.

The old path was therefore correct on both count and floor. The hazard ran
opposite to the one described: the frozen rate already includes `gpu_count`
while `openGpuPodMeters` sets the meter's `units` to `gpu_count`, so billing it
through the unmodified registry would have charged pod 4 eight times its rate,
$119.07/hr against $14.88. The peer session caught that and added
`fixedUnits: 1`, which is the only reason the column is safe to bill from. This
lane's analysis, applied as written, would have produced an overcharge in the
meter it had spent the day fixing.

### The correction, and why it took two artifacts

`75b428fe` rewrote the migration file header. That was not sufficient on its
own: `20260903190000`'s applied statement is frozen in
`supabase_migrations.schema_migrations.statements`, where a file edit cannot
reach it, and that text is what someone inspecting the applied history reads.
`20260903200000` therefore carries the correction into the column comment, which
is what `\d+` and the schema inspectors show. It also states `fixedUnits: 1` as
a hard precondition of billing from the column.

`c082498a` (peer lane) removed the same false claim from the sweep registry
comment, where it had been copied from this lane's message before the error was
found.

### The reason the column is still right

One reason, not three. The live path multiplied by whatever markup
`gpu_pricing` held at charge time, so a markup change re-rated running pods.
Freezing matches compute's `servers.hourly_cost` and `set_price`'s rule that a
price change is never retroactive.

### Month divisor

`storagePerHour` divided by 730 while `billing.resolve_hourly_rate` divided by
720, so pods were quoted 1.4% less storage than they would be charged.
`HOURS_IN_MONTH` moved to `lib/pricing/hours.ts`, a leaf module importing
nothing, so the server price book and the client deploy wizard can share one
value. Importing it from `price-book.ts` would have pulled
`@/lib/supabase/server` and its service-role client into the browser bundle,
because `components/dashboard/gpu/deploy-wizard.tsx` is a client component.

---

## 5. Reconcile left the storage meter open, and two migrations were unfiled (3da3cd1a)

**Found, part one.** When `reconcileActivePods` finds a pod gone upstream, a
spot interruption or a manual destroy, it closed the `gpu_pod` meter and left
`gpu_pod_storage` open. `destroyPod` closes both. So every pod ever lost to a
spot interruption left a meter behind with no resource under it, and the sweep
reported `PROBLEM-no-resource` for it every hour, forever. Permanent noise from
a meter that can never be billed again, which is how a real problem stops being
visible among the false ones.

Fixed by mirroring `destroyPod`. The asymmetry is deliberate and worth keeping
in view: `destroyPod` keeps storage billing through a STOP, because the disk
survives and RunPod keeps charging for it. Here the pod is gone and the disk
went with it, so closing is right.

**Found, part two.** Two migrations were applied to production through
`apply_migration` and never filed:

- `20260903130429  billing_meter_coverage_documents_its_units`
- `20260903153831  billing_revenue_daily_marks_unsettled_accrual`

Recovered from `supabase_migrations.schema_migrations`. Also renamed
`20260903170000_billing_coverage_verdict_requires_proof.sql` to
`20260903124641_billing_meter_coverage_verdict_requires_proof.sql` so the file
matches the version it was applied under.

This is the same drift documented as a hazard hours earlier the same day, in
this lane, by this session. It recurred anyway, twice.

---

## 6. Documentation (aad4ad10, c5cf2bf1)

`aad4ad10` extended `docs/architecture` from three documents to eight, adding
the platform overview, data model, coupons, admin panel split and current state.

`c5cf2bf1` fixed a defect in `meter_coverage`'s own comment. The function
returned a per-meter hour count and said nothing about aggregation, so the first
consumer summed the column and rendered "4h stall" for a two-hour outage across
two meters. An operator reading that goes looking for a four-hour window, fails
to find one, and stops trusting the board. The comment now names the unit and
records the one limit of the wall-clock query, that `min..max` merges disjoint
outages.

---

## 7. Smaller corrections

| Commit | Finding |
|---|---|
| `7b4df63e` | Every crypto glyph resolved to `storage.zxgateway.cc`, which does not respond at all. Icons now ship in the bundle. Usage rows also showed no balance. |
| `181725e5` | A username could be rewritten after it was set, silently re-pointing every reference anyone else held. Now immutable in the route, not only in the UI. |
| `20e9445b` | 28 user-facing strings used the em-dash aside construction. Rewritten by hand. The 100 places rendering an em-dash as an empty-value placeholder were deliberately left, being a table convention rather than prose. |
| `c35fc579`, `0a4c9cbb` | Support threads did not read as conversations, and replies used a bare textarea while the ticket had a rich editor, so pasted stack traces came back as one unreadable run. |
| `9f1a633c` | Object storage and DDoS deploy pages showed $0. Both read endpoints backed by `public.products`, dropped 2026-08-31. The book holds $5.00/mo and $300.00/mo. Neither call errored; an empty result became a zero price, so a customer was shown free and would then have been billed the real rate by the sweep. |
| `dcaa5b1c` | The customer app still shipped a full admin console, 25 pages and 81 components, to every customer's bundle, plus an admin-probe that called `/api/admin/proxmox/hosts` on every dashboard load. |
| `eca17c0c` | `revenue_daily` added, reporting accrual separately from revenue. On its first run it found `deploy` as the largest line by charge count, 80 to 137 rows a day against 12 for compute, and nothing collects it. |
| `b3a121fc` | Unstaged three files belonging to a parallel session that a catch-all `git add` had swept up. |

---

## 8. Admin repo: second migrations directory deleted (525a3582, local, NOT pushed)

In `C:\cloud-admin-panel`, not this repo. Both apps share one Supabase database
and the admin repo carried a second `supabase/migrations` directory for it. Two
directories against one database cannot be ordered against each other and
nothing detects when they disagree.

The copy was 189 files against this repo's 216: 27 missing, **zero unique**. A
pure stale subset, three days behind, missing every migration from the billing
v2 relaunch onward including the price book, `set_price`, `set_gpu_markup`, the
charge spine, `move_credit` and the audit partition lockdown. Anyone reading it
to understand the schema was reading it as it stood before the work that
matters.

Because it was a subset, deleting loses nothing. That stops being true the
moment one migration is written there.

**Status: committed locally, not pushed.** It is on a branch in that clone and
needs whoever owns the admin repo to review and push it.

---

## 9. Verified against production

All on 2026-09-03, against `xafjjpgazdxhktpfeuri`.

| Check | Result |
|---|---|
| `gpu_pods` rows | 15, all 15 backfilled with `gpu_hourly_usd` |
| Multi-GPU pods | 2 (pod 4 has 8, pod 5 has 2), max `gpu_count` 8 |
| Backfill reconciliation | 8 rows at markup 1.0, 7 at ~1.25, each matching what the customer was quoted |
| `gpu_pod` charges ever written | **0**, so no money was affected by any of the GPU work |
| Migrations applied 2026-09-03 | 21 across both lanes |
| Charges written today | 25 across compute, `gpu_volume`, objectspace |
| Sweep cadence | systemd timer at `:10`, last billed hour 16:00 UTC at 18:06 check |
| `charge_service_hour` units | confirmed `v_gross := round(v_hourly * coalesce(p_units, 1), 6)` |
| `origin/dev` | `c082498a`, 0 unpushed, all three of this lane's commits ancestors |

---

## 10. Deliberately not done

- **720 vs 730 hours per month.** Not chosen. `lib/paas/tiers.ts` argues 730 and
  is arithmetically correct that 720 collects 8,640 billed hours against an
  8,760-hour year, 1.4% over. But 69 of the 72 live rows in
  `billing.service_pricing` carry a `*_month` unit and convert through this
  constant, so moving it changes every monthly-priced service. That is a pricing
  decision, not a refactor. The seam is closed, both sides now import
  `lib/pricing/hours.ts`, so whichever value wins they move together.
- **`closeGpuPodMeters` left in place with no caller.** `closeActiveBilling`
  already closes `gpu_pod` alongside the v1 active row, so calling it in
  `reconcileActivePods` would close that meter twice. Left for the next reader
  rather than deleted on a guess.
- **`hourly_cost_usd` not narrowed to GPU-only**, for the five-reader reason in
  section 4.
- **The 100 em-dash empty-value placeholders** in tables, section 7.
- **No function bodies applied from this lane after the ground rule was set.**
  `20260903200000` is comment-only.

---

## 11. Still open

| Item | Whose call |
|---|---|
| **720 vs 730 divisor.** Moves 69 of 72 live prices by ~1.4%. Requires changing `lib/pricing/hours.ts` and `billing.hours_in_month()` in the same pass. | Harshit |
| **GPU pod end-to-end test, ~$0.50.** Never run. Every claim in section 4 comes from reading code and querying tables. Given this lane published a wrong analysis today that a live test would have caught, this is worth more than it was. | Harshit |
| **`meter_coverage` reports a false stall for ten minutes each hour.** An hour becomes owed when it closes at `:00`, but the sweep does not bill it until `:10`. Checked at 18:06 on 2026-09-03, six meters read `stall` on a healthy platform. The deadman runs at `:35` and is outside the window, so nothing pages, but anyone reading the board between `:00` and `:10` sees a fake outage. One-line fix to `to_h`; it is a function body, so it was not applied from this lane. | Peer lane or Harshit |
| **`deploy` charges collected by nothing** (`eca17c0c`). 80 to 137 rows a day. | Harshit |
| **Admin repo migrations deletion unpushed** (section 8). | Admin repo owner |
| **`audits` still off PostgREST's exposed list**, so the audit trail is still dead. The partition is now safe, which was the precondition for re-exposing. | Peer lane |
