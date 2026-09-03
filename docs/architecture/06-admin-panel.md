# Admin Panel

**Verified against production on 2026-09-03.**

The operator surface. Split out of the customer app into its own repo and
domain, sharing one database with it.

| | |
|---|---|
| Repo | `C:\cloud-admin-panel` |
| Branch | `feat/separate-admin-panel` |
| Host | `control.ahurasense.com` |
| App path | `apps/admin/` |
| Auth | `requireAdmin()` — `ADMIN_EMAILS` env allow-list, falling back to `user_profiles.roles` |
| DB access | `service_role` key, server-side only |

---

## 1. Why it is separate, and what that costs

The panel was extracted so operator tooling could ship without touching the
customer app. That worked, but the integration surface is **the database
schema, not an API**. Both apps agree on table shapes. Consequences that have
actually occurred:

- A schema change in one app can silently break the other. Column and
  constraint changes are the shared contract and nothing type-checks across the
  boundary.
- Guards written in one app's route do not bind the other. This is why the
  money rules live in `SECURITY DEFINER` functions — see §4.
- Both apps hold `service_role`. Neither can be trusted to be the only writer.

**Ordering discipline matters.** When a function signature changes, one side
must tolerate both shapes during the deploy window. The `set_gpu_markup`
blanket-guard migration is the worked example: the panel's route was changed
*first* to send the new parameter with a fallback to the old signature, so
neither deploy order broke anything.

---

## 2. The old admin still exists

The customer app's admin console (`app/dashboard/admin/`: 25 pages, 81
components, an 18-entry sidebar section, and a probe that called
`/api/admin/proxmox/hosts` on every dashboard load to decide whether to draw
it) was removed on 2026-09-03 (`dcaa5b1c`). The 77 API routes under
`app/api/admin/` remain in the **customer** repo, served from `ahurasense.com`:
the object-storage and DDoS create flows branch into them for admin users, so
they could not go in the same change.

Removing the routes is gated on the operator working in `control.ahurasense.com`
for long enough to be confident nothing is missing. The panel is de-coupled from
them (commit `a9bbba8d`, re-verified before the console was deleted: zero source
references), so removal is a decision, not a blocker.

**Until then, the old admin is a second door onto the same data**, and it has
not always carried the same guards. On 2026-09-03 its GPU pricing route was
found writing `public.gpu_pricing` with a direct `.update()`, bypassing
`set_gpu_markup` and therefore the below-cost rule, the zero-rows-matched check
and the drift report. Fixed (`81e8599d`) by routing it through the function.

Its Linode plans route, by contrast, was already well-guarded — markup ≥ 1,
floor ≥ 0, and a 404 anchor on `linode_types` to avoid seeding orphan pricing
rows. The guards were inherited: the panel's route is a port of it. Do not
assume the old admin is uniformly unguarded; check.

The same afternoon, `app/api/admin/users` was found using its own guard: it read
only `user_profiles.roles`, ignored `ADMIN_EMAILS`, and trusted a column that
any signed-in user could set on their own row, because the table's update
policy had no `WITH CHECK` ([Data Model](04-data-model.md) §6). It now calls
the shared `requireAdmin()`, and the policy pins `roles` and `suspend`.

---

## 3. Surfaces

| Section | What it does |
|---|---|
| Overview | platform summary |
| Users | accounts, balances, per-user ledger (reads `billing.account_ledger`) |
| Support | ticket queue and admin replies |
| Audit Logs | `audits.audit_logs`, read via `service_role` |
| Servers / Linode Console | VM fleet, per-type markup and floor |
| Hosts | self-hosted hypervisors |
| GPU Pods | pod fleet, unbillable list, inventory, pricing, volumes, catalog |
| Kubernetes / Databases / Object Storage / Network & DDoS | per-service fleets |
| Deploy v2 / V2 Projects | the PaaS |
| AI Labs / AI Agents | inference surfaces |
| Game | game servers |
| Pricing | the price book (`/pricing`) |
| Coupons | promocodes registry + create/deactivate; discounts create |
| Monitor | live platform board (see §5) |

---

## 4. Pricing: two books, one control

This is the panel's most load-bearing design decision and the source of the
most expensive class of bug on the platform.

The platform sells two structurally different things:

| | Resold | Own |
|---|---|---|
| Services | GPU (RunPod), VMs (Linode) | objectspace, spectrum, database, k8s, apps |
| Operator sets | a **markup** over a provider rate | an **absolute price** |
| Why | the underlying cost moves on its own | we decide the number |
| Scale | 192 GPU rows, 75 Linode types | one row per plan |
| Lives at | a markup console inside the service page | `/pricing` |

`/pricing` was built as *"the one place a price is set"*. That is true for the
services we own and **cannot** be true for resold ones, where the price is not a
number but a function of somebody else's rate. So markup consoles grew inside
each service page, and the platform ended up with two books per resold service.

**Two books is the right answer to a real difference. The failure was that both
were wired to live systems with nothing keeping them equal.** Two incidents,
pointing in opposite directions:

- **Compute:** the quote came from the Linode markup, the charge from
  `service_pricing` compute rows — keyed `s-2`/`d-4` while Linode types are
  `g6-*`. No key matched, so `charge_service_hour` returned `no-price` every
  hour. A resold VM would have been **quoted at markup and billed nothing,
  forever.**
- **GPU:** on 2026-09-02 the `gpu_pod` **charge** markup was moved from 1.00× to
  10.00× while `gpu_pricing.markup_pct` stayed at 1.000. A pod would have been
  **shown at cost and billed ten times it.** No screen could have shown it,
  because every displayed price reads the other book.

### The resolution: markup-primary for resold services

Confirmed by how the owner actually reasons about it — when the two books
disagreed, the instinct was that *the markup console is the price* and the book
rows were the broken thing.

Compute is done. Resold VMs now bill `servers.hourly_cost`, the rate frozen at
create — so quote and charge are the same number **by construction** rather than
by agreement. Mechanically: a `compute` / `*` passthrough row
(`rate_model='markup'`, amount `1.0`) and `current_price` falling back to `'*'`
when no exact key matches.

> That `*` row is **plumbing, not a price.** At `2.0` every compute VM bills
> double. The panel's price book filters `is_active = true` so it never renders,
> and `POST /api/admin/pricing/set-price` explicitly refuses `compute`/`*`. The
> seven services whose `*` rows are real prices stay writable.

**GPU is not done.** `public.gpu_pricing` is still the quote book and
`service_pricing.gpu_pod` still the charge book. `set_gpu_markup` reports a
drift block on every write, and the panel renders it, but the two are not
unified. This is the last two-book service.

### Frozen at create

An edited price applies to VMs created **from then on**; running VMs keep the
rate they were sold at. This is stated in the console copy and was verified
live on 2026-09-03 — the markup on `g6-standard-1` was doubled while a VM ran,
its `hourly_cost` stayed `$0.0180`, and the sweep continued charging `$0.0180`
while a new VM would have quoted `$0.0360`.

A "customer price" shown in the collapsed view is therefore a **forward-looking**
price, not necessarily what every running VM bills.

---

## 5. Monitor board

A live platform-status board (`/monitor`): node graph, ~12s poll, read-only
against `billing`/`public`/`paas`, one aggregation endpoint.

Built 2026-09-03. Its design rules are worth recording because each came from a
signal that had already lied on this platform:

- **Coverage, not recency, is the centrepiece.** "When did the sweep last run"
  read minutes-fresh while eleven hours of a running VM had never been billed.
  Recency cannot see a hole behind it. The board reads
  `billing.meter_coverage()`.
- **No count without a denominator.** "0 problems" and "0 meters examined" must
  never render identically.
- **A failed read is grey, never green and never zero.** Two schemas had been
  unreachable for days and their absence read as emptiness.
- **No wallet totals.** Several balances are seeded test values in the hundreds
  of millions; a "total customer balance" tile would be meaningless.
- **Sellable-but-unpriced is its own state.** A plan that can be bought but has
  no charge-book row renders red with the consequence spelled out, not a grey
  "not in book".
- **Units are named.** `meter_coverage` returns a *per-meter* hour count;
  summing it gives meter-hours. Rendered as "4h stall" for a two-hour outage
  across two meters, an operator hunts for a window that never existed and stops
  trusting the board.

### Verdicts

`meter_coverage()` returns one row per open meter with a verdict:

| verdict | Meaning | Board |
|---|---|---|
| `ok` | nothing missing | green |
| `arrears` | **proven** short — a failed usage row exists | amber, "customer owes" |
| `stall` | nothing at all billed in those hours | red, "page billing" |
| `unexplained` | biller ran, skipped this meter, no arrears row | purple, "human call" |

**Only `arrears` may accuse a customer, and only with a receipt.** The first
version of this logic inferred "refusal" whenever another meter had billed in
the same hours, and its first live run labelled a meter `refusal` whose owner
held a balance of $656,041,754 — those hours went unbilled because the deployed
sweep could not price compute. On a board, `refusal` means *chase this customer
for payment*. The inference would have sent an operator after somebody who owed
nothing, carrying the authority of a computed verdict.

That is recorded here rather than quietly amended, because the inference felt
well-evidenced right up to the moment it was checked against a case it had not
been derived from.

Since 2026-09-03 the dead-man (`scripts/billing/deadman.ts`) consumes the same
`meter_coverage()`, treating `stall` and `unexplained` as failures and
`arrears` as informational, and adds `billing.unbilled_resources()`, which lists
live rows with no open meter at all (8 vector collections and 3 expired game
servers on 09-03). The board reads neither `unbilled_resources()` nor
`billing.sweep_runs` yet; a resource that never got a meter is still invisible
to it.

---

## 6. Coupons

Create and deactivate shipped 2026-09-03. See
[Coupons & Discounts](05-coupons-and-discounts.md) for the full behaviour.

Panel-side specifics: expiry is mandatory (end-of-day UTC), amount capped at
$1,000, duplicates refused case-insensitively, and `one-time` forces
`max_redemptions = 1` at write — fixing at the source a label that had never
meant what it said. Status precedence is *exhausted* > *suspended* > none, so an
auto-capped code reads "exhausted" and a hand-killed one "suspended", and the
reactivate control is hidden where flipping it would change nothing.

---

## 7. Cross-lane working notes

The two apps are developed in parallel sessions. What has worked:

- **Verify before asserting.** Both lanes have stated another repo's behaviour
  from memory and been wrong. Read the file.
- **Own the correction explicitly.** The GPU-route sizing was wrong in both
  directions before either lane opened the file.
- **Permission boundaries do not transfer.** When one session's permission gate
  refuses an action, the other session does not run it on its behalf. It goes to
  the owner. This came up twice — a coupon seed and a constraint migration — and
  holding the line was right both times even though both changes were fine.
- **Sequence signature changes** so either deploy order is safe.
