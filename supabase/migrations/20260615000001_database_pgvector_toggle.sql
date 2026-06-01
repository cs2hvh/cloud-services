-- "pgvector toggle" for the managed Database product (PostgreSQL only).
--
-- When a customer opts in at create time, the platform connects to their
-- managed Postgres once it's online and runs `CREATE EXTENSION IF NOT EXISTS
-- vector;` — giving them a raw pgvector database they control via SQL (the
-- DO-style experience), complementing the managed Vector API.
--
--   pgvector_enabled    — customer opted in (set at create; PG engine only)
--   pgvector_applied_at — when the extension was actually enabled on the
--                         cluster (NULL = pending; the status-check path keeps
--                         retrying until it's set). Makes the enable idempotent.

ALTER TABLE public.database_cluster
  ADD COLUMN IF NOT EXISTS pgvector_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pgvector_applied_at TIMESTAMPTZ;

COMMENT ON COLUMN public.database_cluster.pgvector_enabled IS
  'Customer opted into the pgvector extension (PostgreSQL clusters only).';
COMMENT ON COLUMN public.database_cluster.pgvector_applied_at IS
  'When CREATE EXTENSION vector succeeded on the cluster. NULL = pending/retrying.';
