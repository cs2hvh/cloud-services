# Merging the AI platform into `dev` — runbook

**Written:** 2026-08-25 · **Delete this file once the merge has landed.**

Why this exists: hv asked for the Wokey work on "a new branch from dev". That
cannot work yet, because the AI platform is not in `dev` — the price-sync script
and the admin pricing screen, both of which the cache read/write work has to
modify, do not exist there. This is the shortest path to making his instruction
possible.

`dev-with-ai-services` is **not** used here. Its extra commits are Linode/compute
work, and `dev` already carries the Linode migrations — merging it would drag in
work that partly exists on the target. `ai-admin-workphase-7` is the clean
AI-only set.

---

## Where we are right now

| | |
|---|---|
| Current branch | `ai-admin-workphase-7` |
| Local vs origin | in sync — 0 ahead, 0 behind |
| Uncommitted | **4 files, staged** (below) |
| Target | `origin/dev` — moving; last commit 2026-08-25 11:11 |
| Real conflict surface | **11 files** (measured, see step 2) |
| Migrations landing on dev | 43 mine, plus 9 dev-only dated in between |

The four staged files:

```
A  docs/inference/DELIVERY-RECORD.md
A  docs/inference/supply-routing-plan.md
M  docs/inference/README.md
```

---

## Step 0 — commit the four docs, on this branch

They are staged on `ai-admin-workphase-7`. Commit them **here**, so they travel
with the merge instead of trailing between checkouts.

Two things to settle first:

* `DELIVERY-RECORD.md` claims a permissions file holds a plaintext SSH password.
  That file could not be found on this branch or on `origin/dev`. Confirm it or
  reword it — an unverifiable security claim in a status document is worse than
  none.

```bash
git commit -m "docs(inference): delivery record, supply-routing plan, Wokey research"
git push
```

---

## Step 1 — create the merge branch

```bash
git fetch origin
git checkout -b merge/ai-platform origin/dev
git merge ai-admin-workphase-7
```

`dev` moved today, so re-measure rather than trusting the number below:

```bash
git diff --name-only --diff-filter=U
```

---

## Step 2 — resolve the eleven

These are the only files both branches touched since they split on 2026-06-12.
Everything else merges by itself — 455 files exist on one side only, and git
does not conflict on those.

| File | Resolution |
|---|---|
| `package-lock.json` | **Do not hand-merge.** Take either, then `npm install` and commit the regenerated file |
| `workers/inference/src/index.ts` | **The one careful file.** Both sides added route registrations and cron dispatch. Keep both sets; check no route path is registered twice |
| `components/admin/admin.tsx` | Additive nav list — keep both sides' entries |
| `components/dashboard/sidebar/index.tsx` | Additive nav list — keep both |
| `next.config.ts` | Small; keep both sides' config keys |
| `package.json` | Both added dependencies — keep both, then reconcile with the lockfile above |
| `lib/audit/types.ts` | Both added audit action types — keep both |
| `app/dashboard/activity/page.tsx` | 1–2 lines each |
| `docs/PRODUCTION.md` | Documentation |
| `.gitignore` | Keep both sides' entries |
| `.claude/settings.local.json` | Local tooling config — either side is fine |

---

## Step 3 — migrations

43 migrations arrive on `dev`. `dev` has 9 of its own dated **in between** them
(2026-07-05 → 2026-08-01), so after the merge they interleave by filename.

```bash
ls supabase/migrations | sort | sed -n '/20260622/,$p'
```

The domains do not overlap — the incoming 43 are `inference.*` and `agents.*`;
dev's 9 are games, Linode and domain operations. There is no shared table. Still
worth reading the ordering once before running anything, because this repository
has had a migration collision before (`projects` → `stacks`).

**Deep runs the migrations. Do not run them from here.**

---

## Step 4 — verify before the PR

```bash
npm install
npm run build      # also typechecks
npm run test
npm run lint
```

Then, by hand, the things a merge is most likely to have broken:

* admin dashboard loads, and both nav trees show their entries
* one AI screen renders — Model Pricing is the densest
* one compute/Linode screen renders — proves dev's side survived
* the inference worker builds: `cd workers/inference && npx wrangler deploy --dry-run`

---

## Step 5 — PR into `dev`

Title it as what it is: *"Merge the AI platform into dev"*. Say in the body that
it is 11 real conflicts and 43 migrations, and that the migrations are
inference-scoped.

**This is the step that makes hv's instruction possible.** Until it lands, a
branch cut from `dev` still has no AI platform.

---

## Step 5b — DEPLOY ORDER (read before deploying the inference Worker)

**Migrations first. Worker second. Not the other way round.**

`ahura-inference-usage` has `max_retries = 3` and no dead-letter queue, and the
consumer calls `batch.retryAll()` when an insert fails. A Worker that writes
`cache_write_tokens`, `reported_upstream_cost_cents` or `provider` to a table
without those columns fails every insert, retries three times, and the events
are **dropped**. Silent billing data loss for the whole window.

```
✅  apply 20260825000001 + ...0002   →   then deploy the Worker
❌  deploy the Worker                →   then apply migrations     ← loses usage
```

The reverse order is safe: migrated columns sit NULL until the new code writes
them.

**What is NOT coupled, deliberately.** `lookupModelRouting` runs on every
request on every route, and its null return is read as "model not found". An
earlier version selected `preferred_provider` unconditionally, which meant
deploying before migration 2 turned every model on every modality into a 404 —
a total outage from deploy ordering. It now retries without that column and
treats the preference as unset, so a missing migration degrades to
"OpenRouter only" instead. Covered by
`model-routing-resilience.test.ts`; do not "simplify" the retry away.

Two things still break visibly (an admin screen, not customer traffic) until
migration 2 is applied: `MODEL_COLUMNS` in `lib/admin/inference-client.ts` and
the orgs select in `app/api/admin/inference/orgs/route.ts`.

---

## Step 6 — start the Wokey work

Once step 5 has landed:

```bash
git checkout -b wokey-supply dev
```

If review on step 5 drags and you want to start sooner, branch from
`merge/ai-platform` instead. When that lands in `dev`, `wokey-supply` becomes a
clean descendant of `dev` on its own — no rebase, nothing redone.

First tasks on that branch are P0 in
[supply-routing-plan.md](./supply-routing-plan.md) §12: cache-write pricing —
which is the thing hv actually asked for.

---

## If it goes wrong

Nothing here touches `dev` until step 5, and nothing touches
`ai-admin-workphase-7` at all.

```bash
git merge --abort                 # during step 2
git checkout ai-admin-workphase-7 # walk away entirely
git branch -D merge/ai-platform
```
