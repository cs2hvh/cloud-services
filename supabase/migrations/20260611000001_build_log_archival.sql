-- Build log archival metadata for platform apps.
-- Actual log content lives in Supabase Storage (private bucket 'build-logs').
-- This table stores only metadata, retention state, and the storage path.
--
-- Storage path format: {app_id}/{build_number}.log
-- Access: server-side only via service-role key. No direct client access.
--
-- IMPORTANT: ON DELETE CASCADE removes metadata rows when an app is deleted,
-- but the corresponding storage objects are NOT automatically deleted.
-- App deletion must clean up storage objects at the application layer first.

CREATE TABLE IF NOT EXISTS public.platform_app_build_logs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id             uuid        NOT NULL REFERENCES public.platform_apps(id) ON DELETE CASCADE,
  deployment_id      uuid        NULL REFERENCES public.platform_app_deployments(id) ON DELETE SET NULL,
  build_number       integer     NOT NULL,
  storage_path       text        NULL,
  size_bytes         bigint      NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  status             text        NOT NULL DEFAULT 'available'
                       CHECK (status IN ('available', 'deleted', 'delete_failed')),
  retention_until    timestamptz NULL,
  pinned             boolean     NOT NULL DEFAULT false,
  deleted_at         timestamptz NULL,
  last_cleanup_error text        NULL,
  created_at         timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at         timestamptz NOT NULL DEFAULT timezone('utc', now()),

  -- Natural key: one log record per build per app
  UNIQUE (app_id, build_number),

  -- An available log must always have a storage path
  CONSTRAINT chk_available_has_path
    CHECK (status != 'available' OR storage_path IS NOT NULL),

  -- A deleted log must have a deleted_at timestamp
  CONSTRAINT chk_deleted_has_timestamp
    CHECK (status != 'deleted' OR deleted_at IS NOT NULL)
);

-- Cleanup scan: range scan on retention_until for non-pinned, non-deleted rows.
-- Matches cleanupExpiredBuildLogs():
--   WHERE pinned = false AND deleted_at IS NULL
--     AND retention_until IS NOT NULL AND retention_until <= now
--     AND status IN ('available', 'delete_failed')
--   ORDER BY retention_until ASC
CREATE INDEX IF NOT EXISTS idx_platform_app_build_logs_cleanup
  ON public.platform_app_build_logs(retention_until ASC)
  WHERE deleted_at IS NULL AND pinned = false;

-- ── Row-Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.platform_app_build_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view build log metadata for their apps"
  ON public.platform_app_build_logs;

-- Users may read metadata for their own apps only (log content goes via the API).
-- Service role bypasses RLS entirely for server-side archival and cleanup.
CREATE POLICY "Users can view build log metadata for their apps"
  ON public.platform_app_build_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_apps
      WHERE platform_apps.id = platform_app_build_logs.app_id
        AND platform_apps.user_id = auth.uid()
    )
  );

-- ── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_platform_app_build_logs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_app_build_logs_updated_at ON public.platform_app_build_logs;
CREATE TRIGGER trg_platform_app_build_logs_updated_at
  BEFORE UPDATE ON public.platform_app_build_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_platform_app_build_logs_updated_at();

COMMENT ON TABLE public.platform_app_build_logs IS
  'Metadata and retention state for archived platform app build logs. Content lives in Supabase Storage bucket ''build-logs'' at path {app_id}/{build_number}.log.';

-- ── Supabase Storage bucket ──────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('build-logs', 'build-logs', FALSE, 10485760, ARRAY['text/plain'])
ON CONFLICT (id) DO NOTHING;

-- Block all direct client reads — log content is served through the Next.js API.
DROP POLICY IF EXISTS "No direct client access to build-logs" ON storage.objects;
CREATE POLICY "No direct client access to build-logs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'build-logs' AND FALSE);

-- Service role has full access for server-side upload, download, and delete.
-- (select auth.role()) is evaluated once per statement, not once per row.
DROP POLICY IF EXISTS "Service role full access build logs" ON storage.objects;
CREATE POLICY "Service role full access build logs"
  ON storage.objects FOR ALL
  USING (bucket_id = 'build-logs' AND (select auth.role()) = 'service_role')
  WITH CHECK (bucket_id = 'build-logs' AND (select auth.role()) = 'service_role');
