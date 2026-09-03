# Migrations live in cloud-services, not here

**Do not add migration files to this repository.**

The admin panel and the customer app share one Supabase database
(`xafjjpgazdxhktpfeuri`). A shared database with two migration directories has
no way to order the two sets against each other, and nothing detects when they
disagree — so one repo silently believes a schema the database does not have.

The single owner is:

```
C:\cloud-services\supabase\migrations
```

Everything — tables, functions, policies, grants — goes there, including changes
that exist only for this panel.

## Why this directory was removed

On 2026-09-03 it held **189** files against cloud-services' **216**:

```
missing from this repo   27   (20260831063455 … 20260903180000)
unique to this repo       0
```

Zero unique files. It was a stale copy contributing nothing, three days behind,
and missing every migration from the billing v2 relaunch onward — the price
book, `set_price`, `set_gpu_markup`, the charge spine, `move_credit`, the audit
partition lockdown. Anyone reading it to understand the schema would have been
reading the schema as it stood before the work that matters.

Because it was a pure subset, deleting it lost nothing. That will not be true
next time: the moment one migration is written here, the two directories diverge
in both directions and the merge becomes real work.

## How to change the schema from this repo

1. Write the migration in `cloud-services/supabase/migrations`.
2. Apply it there.
3. Commit the file in the **same pass** as applying it. Applied-but-uncommitted
   is the failure this ownership rule exists to prevent — it has happened twice,
   most recently on 2026-09-03, and eleven migrations once had to be
   reconstructed from `supabase_migrations.schema_migrations.statements`.

`scripts/ci/migration-drift.ts` in cloud-services compares the applied set to
the committed files and fails on disagreement.

## Checking what is actually applied

```sql
select version, name
  from supabase_migrations.schema_migrations
 order by version desc
 limit 20;
```

That table, not either repo, is the truth.
