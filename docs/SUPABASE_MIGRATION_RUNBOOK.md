# Supabase Migration Runbook (Safe Workflow)

This runbook is for this repository.  
Goal: add new SQL migrations safely, keep local and remote history in sync, and avoid accidental production drift.

## 1. Core Rules

1. Schema changes must come from files in `supabase/migrations/`.
2. Do not make schema changes directly in Supabase dashboard/SQL editor unless it is an emergency.
3. Never edit old migration files that are already applied remotely.
4. If a migration is wrong, create a new corrective migration.
5. Prefer 14-digit timestamps in migration versions (`YYYYMMDDHHMMSS`).

## 2. Pre-Migration Checklist

Before running any push:

0. **Check the last version before naming the file:**
   ```bash
   supabase migration list --linked | tail -5
   ```
   Pick a 14-digit timestamp strictly higher than all existing versions. Two files
   sharing the same version will cause a `duplicate key` error on push and can never
   both be applied. This is the most common cause of push failures in this repo.
1. Migration file has a new version and clear name.
2. SQL is replay-safe (idempotent where possible):
   - `CREATE TABLE IF NOT EXISTS`
   - `CREATE INDEX IF NOT EXISTS`
   - `DROP POLICY IF EXISTS` before `CREATE POLICY`
   - Guard fragile operations with `DO $$ ... IF ... THEN ... END $$`
3. RLS/policies are explicitly defined for new tables that authenticated users
   will access. Tables that are exclusively written by the service role (e.g.
   internal lock or queue tables) intentionally omit RLS — document this with a
   SQL comment in the migration file.
4. Required grants are explicit (`authenticated`, `service_role`, etc.).
5. New functions have explicit `GRANT EXECUTE` (least privilege).
6. Foreign keys and important indexes are included.

## 3. Safe Commands (No Destructive Cloud Changes)

### Sync and history inspection

```bash
supabase migration list --linked
```

### Verify if any push would happen (safe)

```bash
supabase db push --linked --dry-run
```

### Verify all local-unapplied migrations explicitly (safe)

```bash
supabase db push --linked --include-all --dry-run
```

### Pull check without updating remote history

Use only when needed, and answer `n`:

```bash
supabase db pull --linked
# At prompt "Update remote migration history table? [Y/n]" choose: n
```

## 4. Normal Migration Flow

1. Create migration file in `supabase/migrations/`.
2. Validate SQL content (checklist above).
3. Run:

```bash
supabase db push --linked --dry-run
```

4. If clean, apply:

```bash
supabase db push --linked
```

5. Verify:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
```

Expected:
- `migration list` local and remote versions match
- `push --dry-run` says remote is up to date

## 5. What To Do When `db pull` Generates New `*_remote_schema.sql`

If you did **not** intentionally change schema in dashboard:

1. Choose `n` when asked to update remote migration history.
2. Remove the newly generated file locally.
3. Continue using migration-file-first workflow.

If you **did** intentionally change schema in dashboard:

1. Pull and review generated SQL carefully.
2. Decide whether to keep as migration file or rewrite as clean migration SQL.
3. Avoid repeatedly creating snapshot-style `remote_schema` files.

## 6. History Mismatch Recovery (Safe First)

If CLI says local/remote migration history mismatched:

1. Inspect current state:

```bash
supabase migration list --linked
```

2. Prefer fixing only history metadata, not schema:

```bash
supabase migration repair --linked --status reverted <version>
supabase migration repair --linked --status applied <version>
```

3. Re-check:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
```

### 6a. Remote-only migration (no local file)

Symptom: `migration list` shows a row with remote version but blank on the Local side.
This means schema was changed directly in the Supabase dashboard.

```bash
# 1. Create a local stub file for the remote version
echo '-- Applied via dashboard. Stub for history sync.' \
  > supabase/migrations/<version>_stub.sql

# 2. Mark it as applied in history
supabase migration repair --linked --status applied <version>

# 3. Verify
supabase db push --linked --dry-run
```

### 6b. Duplicate local version (two files, same timestamp)

Symptom: `migration list` shows the same version twice on the Local side.
Push fails with `duplicate key value violates unique constraint`.

```bash
# 1. Identify which file has the orphaned duplicate
supabase migration list --linked | grep '<version>'

# 2. Rename the orphaned file to a free version slot
mv supabase/migrations/<version>_duplicate_name.sql \
   supabase/migrations/<new_version>_duplicate_name.sql

# 3. If that file's schema is already on remote, mark it as applied
supabase migration repair --linked --status applied <new_version>

# 4. Verify
supabase db push --linked --dry-run
# Expected: "Remote database is up to date."
```

### 6c. When to use `--include-all`

`db push --linked` without `--include-all` only pushes migrations after the last
remote version. If a local file's version is older than the most recent remote
migration, it is silently skipped — use `--include-all` to catch it.

But `--include-all` combined with a duplicate version causes a hard error.
Always resolve duplicates (6b) before using `--include-all`.

```bash
# Safe way to check what --include-all would add
supabase db push --linked --include-all --dry-run
```

## 7. Repository-Specific Notes

1. Keep the renamed migration version aligned:
   - `20260323000003_billing_rls_hardening.sql`
2. Do not reintroduce old short-name version `20260323_*` once history is normalized.
3. Current sync target should always be validated with:
   - `supabase migration list --linked`
   - `supabase db push --linked --dry-run`
4. The following stub files exist solely to keep local/remote history in sync.
   They contain no schema changes and must not be edited:
   - `20260327000003_stub.sql` — applied via dashboard, stub added 2026-04-06
   - `20260401000002_stub.sql` — applied via dashboard, stub added 2026-04-06
5. `20260328000002_create_domain_transfer_requests.sql` was originally named
   `20260327000001_create_domain_transfer_requests.sql` (duplicate version).
   Renamed 2026-04-06 and marked applied via `migration repair`. Do not revert.
6. `platform_resource_mutation_locks` intentionally has no RLS. It is written
   exclusively by the service role. This is correct behaviour — do not add
   user-facing policies to this table.

## 8. Commands To Avoid For Routine Work

Avoid these unless you intentionally know why:

1. Repeated `supabase db pull --linked` loops with `Y`.
2. Editing old applied migrations.
3. Pushing with unresolved local/remote history mismatch.
4. Running destructive DB reset/restore on production.

## 9. Commit Policy

For each feature migration PR:

1. Commit migration SQL + related app code in same PR.
2. Include verification output in PR description:
   - `supabase migration list --linked` (matched)
   - `supabase db push --linked --dry-run` (up to date)
3. If history repair was used, document exact version and reason.

---

If this runbook is followed strictly, your team stays synchronized without blindly modifying production schema.
