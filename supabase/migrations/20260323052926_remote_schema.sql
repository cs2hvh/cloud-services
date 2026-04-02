-- Replay-safe anchor for remote migration history entry 20260323052926.
-- Keep this as a no-op to avoid non-idempotent replay failures from raw remote snapshot SQL.
select 1;
