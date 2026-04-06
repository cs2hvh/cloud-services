ALTER TABLE platform_app_deployments
  ADD COLUMN IF NOT EXISTS rollback_target_build_number INTEGER;

ALTER TABLE platform_app_deployments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE platform_app_deployments
  ADD COLUMN IF NOT EXISTS operation_details JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_app_deployments_app_idempotency_key
  ON platform_app_deployments(app_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

UPDATE platform_app_deployments
SET rollback_target_build_number = build_number
WHERE trigger = 'rollback'
  AND rollback_target_build_number IS NULL
  AND build_number IS NOT NULL;

UPDATE platform_app_deployments
SET build_number = NULL
WHERE trigger = 'rollback'
  AND build_number IS NOT NULL;

UPDATE platform_app_deployments
SET operation_details = jsonb_build_object(
  'schema_version',
  1,
  'type',
  CASE
    WHEN trigger = 'resize' THEN 'resize'
    WHEN trigger = 'rollback' THEN 'rollback'
    ELSE 'deploy'
  END,
  'trigger_origin',
  CASE
    WHEN trigger = 'webhook' THEN 'webhook'
    ELSE 'manual'
  END,
  'steps',
  '[]'::jsonb
)
WHERE operation_details = '{}'::jsonb
   OR operation_details IS NULL;

COMMENT ON COLUMN platform_app_deployments.rollback_target_build_number IS
  'Build number of the release targeted by a rollback operation. Rollback rows keep build_number null.';

COMMENT ON COLUMN platform_app_deployments.idempotency_key IS
  'Client or system supplied key used to deduplicate repeated app mutation requests per app.';

COMMENT ON COLUMN platform_app_deployments.operation_details IS
  'Structured operation metadata for deploy, redeploy, resize, rollback, and env update flows.';

CREATE TABLE IF NOT EXISTS public.platform_resource_mutation_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_kind text NOT NULL CHECK (resource_kind IN ('platform_app')),
  resource_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('app_mutation', 'domain_mutation', 'read_only')),
  holder text NOT NULL,
  operation_id uuid NULL REFERENCES public.platform_app_deployments(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (resource_kind, resource_id, category)
);

CREATE INDEX IF NOT EXISTS idx_platform_resource_mutation_locks_operation
  ON public.platform_resource_mutation_locks(operation_id)
  WHERE operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_resource_mutation_locks_expires
  ON public.platform_resource_mutation_locks(expires_at);

CREATE OR REPLACE FUNCTION public.set_platform_resource_mutation_locks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_resource_mutation_locks_updated_at
  ON public.platform_resource_mutation_locks;

CREATE TRIGGER trg_platform_resource_mutation_locks_updated_at
BEFORE UPDATE ON public.platform_resource_mutation_locks
FOR EACH ROW
EXECUTE FUNCTION public.set_platform_resource_mutation_locks_updated_at();
