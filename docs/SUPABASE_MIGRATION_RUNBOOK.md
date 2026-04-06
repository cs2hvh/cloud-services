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

1. Migration file has a new version and clear name.
2. SQL is replay-safe (idempotent where possible):
   - `CREATE TABLE IF NOT EXISTS`
   - `CREATE INDEX IF NOT EXISTS`
   - `DROP POLICY IF EXISTS` before `CREATE POLICY`
   - Guard fragile operations with `DO $$ ... IF ... THEN ... END $$`
3. RLS/policies are explicitly defined for new tables.
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

## 7. Repository-Specific Notes

1. Keep the renamed migration version aligned:
   - `20260323000003_billing_rls_hardening.sql`
2. Do not reintroduce old short-name version `20260323_*` once history is normalized.
3. Current sync target should always be validated with:
   - `supabase migration list --linked`
   - `supabase db push --linked --dry-run`

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
