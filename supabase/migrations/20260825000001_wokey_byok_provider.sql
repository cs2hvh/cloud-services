-- Wokey migration, part 1 of 2: the BYOK provider enum value.
--
-- Split from the data migration on purpose. Postgres allows
-- `ALTER TYPE ... ADD VALUE` inside a transaction, but the new value cannot
-- be *referenced* by the same transaction that added it. Supabase wraps each
-- migration file in a transaction, so adding the label and then using it in
-- one file fails with "unsafe use of new value of enum type". Two files, two
-- transactions, no surprise at deploy time.

ALTER TYPE inference.byok_provider ADD VALUE IF NOT EXISTS 'wokey';

COMMENT ON TYPE inference.byok_provider IS
  'Upstream providers a customer can supply their own key for. ''wokey'' is '
  'the platform upstream as of 2026-08-25; ''openrouter'' is retained only so '
  'historical byok_keys rows remain readable — no new rows should use it.';
